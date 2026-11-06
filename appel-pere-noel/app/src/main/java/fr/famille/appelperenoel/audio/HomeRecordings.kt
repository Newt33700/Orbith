package fr.famille.appelperenoel.audio

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

/** Enregistrements « faits maison » qui remplacent certaines phrases de la synthèse vocale. */
enum class HomeRecording(val fileName: String, val title: String, val hint: String) {
    HOHOHO("hohoho", "« Ho ho ho ! »", "Joué à la place de chaque « Ho ho ho ! » de la voix de synthèse."),
    GOODBYE("au_revoir", "Au revoir", "Joué à la place de la phrase d'au revoir (fin de l'appel)."),
}

object HomeRecordings {

    private fun dir(context: Context) = File(context.filesDir, "voix_maison").apply { mkdirs() }

    fun file(context: Context, r: HomeRecording): File? =
        File(dir(context), r.fileName).takeIf { it.isFile && it.length() > 0 }

    fun import(context: Context, r: HomeRecording, uri: Uri): Boolean = runCatching {
        context.contentResolver.openInputStream(uri)!!.use { input ->
            File(dir(context), r.fileName).outputStream().use { input.copyTo(it) }
        }
        true
    }.getOrDefault(false)

    fun delete(context: Context, r: HomeRecording) {
        File(dir(context), r.fileName).delete()
    }

    /** Joue le fichier (n'importe quel format lisible par Android : ogg, m4a, mp3…) jusqu'au bout. */
    suspend fun play(file: File, volume: Float) = suspendCancellableCoroutine { cont ->
        val player = MediaPlayer()
        try {
            player.setAudioAttributes(CallAudioSession.ATTRIBUTES)
            player.setDataSource(file.absolutePath)
            player.setVolume(volume, volume)
            player.setOnCompletionListener {
                it.release()
                if (cont.isActive) cont.resume(Unit)
            }
            player.setOnErrorListener { mp, _, _ ->
                mp.release()
                if (cont.isActive) cont.resume(Unit)
                true
            }
            player.prepare()
            player.start()
        } catch (e: Exception) {
            player.release()
            if (cont.isActive) cont.resume(Unit)
        }
        cont.invokeOnCancellation { runCatching { player.stop(); player.release() } }
    }
}
