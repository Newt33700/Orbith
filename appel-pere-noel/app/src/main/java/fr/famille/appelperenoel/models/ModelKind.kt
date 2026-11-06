package fr.famille.appelperenoel.models

data class ModelDownload(val label: String, val url: String)

/** Les trois modèles nécessaires. Ils sont stockés dans le dossier privé de l'appli, jamais dans l'APK. */
enum class ModelKind(
    val dirName: String,
    val title: String,
    val description: String,
    val downloads: List<ModelDownload>,
    val manualUrl: String?,
) {
    VOSK(
        dirName = "vosk",
        title = "Oreilles : reconnaissance vocale (Vosk)",
        description = "Petit modèle français vosk-model-small-fr-0.22 (environ 41 Mo).",
        downloads = listOf(
            ModelDownload("Télécharger", "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip"),
        ),
        manualUrl = null,
    ),
    PIPER(
        dirName = "piper",
        title = "Voix du Père Noël (Piper)",
        description = "Voix françaises masculines (environ 65 Mo chacune). " +
            "Installe-en plusieurs pour les comparer : on gardera la plus chaleureuse.",
        downloads = listOf(
            ModelDownload("Voix « Tom »", "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-tom-medium.tar.bz2"),
            ModelDownload("Voix « Gilles »", "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-gilles-low.tar.bz2"),
            ModelDownload("Voix « UPMC »", "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-upmc-medium.tar.bz2"),
        ),
        manualUrl = null,
    ),
    LLM(
        dirName = "llm",
        title = "Cerveau du Père Noël (Gemma 3 1B)",
        description = "Fichier gemma3-1b-it-int4.task (environ 550 Mo). Google demande d'accepter la " +
            "licence Gemma : ouvre la page, connecte-toi à Hugging Face, accepte la licence, " +
            "télécharge le fichier .task, puis reviens ici et appuie sur « Importer un fichier ».",
        downloads = emptyList(),
        manualUrl = "https://huggingface.co/litert-community/Gemma3-1B-IT",
    ),
}

data class ModelStatus(val kind: ModelKind, val installed: Boolean, val detail: String)
