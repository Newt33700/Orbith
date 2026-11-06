package fr.famille.appelperenoel.models

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.ArchiveInputStream
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

data class InstallProgress(
    val kind: ModelKind,
    val label: String,
    val doneBytes: Long,
    val totalBytes: Long,
    val finished: Boolean = false,
    val error: String? = null,
) {
    val fraction: Float? get() = if (totalBytes > 0) (doneBytes.toFloat() / totalBytes).coerceIn(0f, 1f) else null
    val running: Boolean get() = !finished && error == null
}

/**
 * Installe les modèles soit en les téléchargeant (Vosk, Piper : liens publics),
 * soit en important un fichier déjà téléchargé avec le navigateur (Gemma, ou n'importe quel modèle).
 * Les archives (.zip, .tar.bz2, .tar.gz) sont décompressées à la volée.
 */
class ModelInstaller(
    private val context: Context,
    private val repo: ModelRepository,
    private val scope: CoroutineScope,
) {
    private val _progress = MutableStateFlow<InstallProgress?>(null)
    val progress: StateFlow<InstallProgress?> = _progress.asStateFlow()

    private var job: Job? = null
    val busy: Boolean get() = job?.isActive == true

    fun download(kind: ModelKind, url: String) = start(kind, "Téléchargement") { report ->
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
        }
        try {
            conn.connect()
            if (conn.responseCode !in 200..299) throw IOException("Le serveur a répondu ${conn.responseCode}")
            conn.inputStream.use { install(kind, it, url.substringAfterLast('/'), conn.contentLengthLong, report) }
        } finally {
            conn.disconnect()
        }
    }

    fun importUri(kind: ModelKind, uri: Uri) = start(kind, "Import") { report ->
        var name = uri.lastPathSegment ?: "fichier"
        var size = -1L
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
            ?.use { c ->
                if (c.moveToFirst()) {
                    if (!c.isNull(0)) name = c.getString(0)
                    if (!c.isNull(1)) size = c.getLong(1)
                }
            }
        val input = context.contentResolver.openInputStream(uri) ?: throw IOException("Impossible d'ouvrir le fichier")
        input.use { install(kind, it, name, size, report) }
    }

    fun dismiss() {
        if (!busy) _progress.value = null
    }

    private fun start(kind: ModelKind, label: String, block: suspend ((Long, Long) -> Unit) -> Unit) {
        if (busy) return
        job = scope.launch {
            _progress.value = InstallProgress(kind, label, 0, -1)
            var lastReport = 0L
            val report: (Long, Long) -> Unit = { done, total ->
                val now = System.currentTimeMillis()
                if (now - lastReport > 150) {
                    lastReport = now
                    _progress.value = InstallProgress(kind, label, done, total)
                }
            }
            try {
                withContext(Dispatchers.IO) { block(report) }
                _progress.value = InstallProgress(kind, "Terminé", 1, 1, finished = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _progress.value = InstallProgress(kind, label, 0, -1, error = e.message ?: e.javaClass.simpleName)
            } finally {
                File(repo.root, STAGING).deleteRecursively()
                File(repo.root, TMP_FILE).delete()
                repo.refresh()
            }
        }
    }

    private fun install(kind: ModelKind, input: InputStream, rawName: String, total: Long, report: (Long, Long) -> Unit) {
        val name = rawName.substringAfterLast('/')
        val lower = name.lowercase()
        val counting = CountingInputStream(input) { report(it, total) }
        when {
            ModelRepository.LLM_EXTENSIONS.any { lower.endsWith(it) } -> {
                if (kind != ModelKind.LLM) {
                    throw IOException("« $name » ressemble au cerveau du Père Noël : importe-le sur la ligne « Cerveau ».")
                }
                val tmp = File(repo.root, TMP_FILE)
                tmp.outputStream().use { counting.copyTo(it, BUFFER) }
                val dest = repo.dir(kind)
                dest.deleteRecursively() // un seul modèle de langage à la fois (ils sont gros)
                dest.mkdirs()
                val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                if (!tmp.renameTo(File(dest, safeName))) throw IOException("Impossible de ranger le fichier")
            }
            ARCHIVE_EXTENSIONS.any { lower.endsWith(it) } -> {
                if (kind == ModelKind.LLM) throw IOException("Le cerveau doit être un fichier .task, pas une archive.")
                val staging = File(repo.root, STAGING).apply { deleteRecursively(); mkdirs() }
                extract(counting, lower, staging)
                val dest = repo.dir(kind)
                if (kind == ModelKind.VOSK) dest.deleteRecursively() // Piper : on garde les autres voix
                dest.mkdirs()
                staging.listFiles()?.forEach { child ->
                    val target = File(dest, child.name)
                    target.deleteRecursively()
                    if (!child.renameTo(target)) throw IOException("Impossible de ranger ${child.name}")
                }
                val ok = when (kind) {
                    ModelKind.VOSK -> repo.voskModelDir() != null
                    ModelKind.PIPER -> repo.piperVoices().isNotEmpty()
                    ModelKind.LLM -> true
                }
                if (!ok) throw IOException("L'archive ne contient pas le modèle attendu (${kind.title}).")
            }
            else -> throw IOException("Format non reconnu : « $name » (attendu : .zip, .tar.bz2, .tar.gz ou .task).")
        }
    }

    private fun extract(input: InputStream, lowerName: String, dest: File) {
        val buffered = BufferedInputStream(input, BUFFER)
        val archive: ArchiveInputStream<*> = when {
            lowerName.endsWith(".zip") -> ZipArchiveInputStream(buffered)
            lowerName.endsWith(".tar.bz2") || lowerName.endsWith(".tbz2") ->
                TarArchiveInputStream(BZip2CompressorInputStream(buffered))
            lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz") ->
                TarArchiveInputStream(GzipCompressorInputStream(buffered))
            else -> TarArchiveInputStream(buffered)
        }
        val destPath = dest.canonicalPath + File.separator
        archive.use { a ->
            var entry = a.nextEntry
            while (entry != null) {
                val out = File(dest, entry.name).canonicalFile
                if (!out.path.startsWith(destPath)) throw IOException("Archive invalide (${entry.name})")
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { a.copyTo(it, BUFFER) }
                }
                entry = a.nextEntry
            }
        }
    }

    private class CountingInputStream(input: InputStream, private val onCount: (Long) -> Unit) : FilterInputStream(input) {
        private var count = 0L
        override fun read(): Int = super.read().also { if (it >= 0) bump(1) }
        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) bump(it.toLong()) }
        override fun skip(n: Long): Long = super.skip(n).also { bump(it) }
        private fun bump(n: Long) {
            count += n
            onCount(count)
        }
    }

    private companion object {
        const val BUFFER = 64 * 1024
        const val STAGING = ".staging"
        const val TMP_FILE = ".import.tmp"
        val ARCHIVE_EXTENSIONS = listOf(".zip", ".tar.bz2", ".tbz2", ".tar.gz", ".tgz", ".tar")
    }
}
