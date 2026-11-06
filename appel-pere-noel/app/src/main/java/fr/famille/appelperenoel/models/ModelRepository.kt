package fr.famille.appelperenoel.models

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

data class PiperVoice(val name: String, val dir: File, val onnx: File)

/** Sait où sont rangés les modèles et s'ils sont présents. */
class ModelRepository(context: Context) {

    val root: File = File(context.filesDir, "models").apply { mkdirs() }

    private val _version = MutableStateFlow(0)
    /** Change à chaque installation : l'interface s'en sert pour se rafraîchir. */
    val version: StateFlow<Int> = _version.asStateFlow()

    fun refresh() {
        _version.value++
    }

    fun dir(kind: ModelKind) = File(root, kind.dirName)

    /** Dossier du modèle Vosk (celui qui contient am/ et conf/), cherché sur deux niveaux. */
    fun voskModelDir(): File? = candidates(dir(ModelKind.VOSK)).firstOrNull {
        File(it, "am").isDirectory && File(it, "conf").isDirectory
    }

    /** Voix Piper au format sherpa-onnx : un .onnx + tokens.txt (+ espeak-ng-data). */
    fun piperVoices(): List<PiperVoice> = candidates(dir(ModelKind.PIPER)).mapNotNull { d ->
        val onnx = d.listFiles()?.firstOrNull { it.isFile && it.name.endsWith(".onnx") }
        if (onnx != null && File(d, "tokens.txt").isFile) {
            PiperVoice(d.name.removePrefix("vits-piper-").removePrefix("fr_FR-"), d, onnx)
        } else {
            null
        }
    }.sortedBy { it.name }

    fun llmModelFile(): File? = dir(ModelKind.LLM).listFiles()
        ?.filter { it.isFile && LLM_EXTENSIONS.any { ext -> it.name.lowercase().endsWith(ext) } }
        ?.maxByOrNull { it.length() }

    fun status(kind: ModelKind): ModelStatus = when (kind) {
        ModelKind.VOSK -> voskModelDir().let {
            ModelStatus(kind, it != null, if (it != null) "Installé (${it.name})" else "Absent")
        }
        ModelKind.PIPER -> piperVoices().let { voices ->
            ModelStatus(
                kind,
                voices.isNotEmpty(),
                if (voices.isEmpty()) "Absent" else "${voices.size} voix : ${voices.joinToString { it.name }}",
            )
        }
        ModelKind.LLM -> llmModelFile().let {
            ModelStatus(kind, it != null, if (it != null) "Installé (${it.name}, ${it.length() / 1_000_000} Mo)" else "Absent")
        }
    }

    fun statuses(): List<ModelStatus> = ModelKind.entries.map { status(it) }

    fun allInstalled(): Boolean = statuses().all { it.installed }

    private fun candidates(base: File): List<File> {
        if (!base.isDirectory) return emptyList()
        val level1 = base.listFiles()?.filter { it.isDirectory }.orEmpty()
        val level2 = level1.flatMap { d -> d.listFiles()?.filter { it.isDirectory }.orEmpty() }
        return listOf(base) + level1 + level2
    }

    companion object {
        val LLM_EXTENSIONS = listOf(".task", ".litertlm", ".bin", ".gguf")
    }
}
