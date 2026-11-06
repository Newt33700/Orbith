package fr.famille.appelperenoel.tts

/** Un moteur de synthèse vocale (Piper hors-ligne, ou voix Google d'Android). */
interface SpeechSynth {
    val ready: Boolean

    /** Vrai si le moteur sait abaisser la voix lui-même (meilleure qualité que notre astuce de lecture ralentie). */
    val handlesPitch: Boolean

    /**
     * @param speed 1 = vitesse normale, < 1 = plus lent
     * @param pitch 1 = hauteur normale, < 1 = plus grave (ignoré si [handlesPitch] est faux)
     */
    suspend fun synthesize(text: String, speed: Float, pitch: Float): RawSpeech
}
