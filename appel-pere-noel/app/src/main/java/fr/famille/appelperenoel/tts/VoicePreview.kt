package fr.famille.appelperenoel.tts

import fr.famille.appelperenoel.audio.PapyVoice
import fr.famille.appelperenoel.audio.PcmPlayer
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.settings.papyVoice

/** Permet aux parents d'écouter et comparer les voix depuis l'espace parents. */
class VoicePreview(private val models: ModelRepository) {

    private var piper: PiperTts? = null
    private var loadedKey: String? = null

    /** Nombre de locuteurs de la dernière voix écoutée. */
    var speakers: Int = 1
        private set
    private val player = PcmPlayer()

    /** Réglages de la dernière écoute (lus par le moteur à chaque phrase). */
    @Volatile
    private var current: AppSettings? = null

    suspend fun play(settings: AppSettings, text: String) {
        current = settings
        val voices = models.piperVoices()
        val name = voices.firstOrNull { it.name == settings.voiceName }?.name
            ?: voices.firstOrNull()?.name
            ?: throw IllegalStateException("Aucune voix installée")
        val key = "$name/${settings.expressiveness}"
        if (piper == null || loadedKey != key) {
            piper?.release()
            piper = PiperTts(
                models,
                voiceName = { name },
                speaker = { current?.voiceSpeaker ?: 0 },
                expressiveness = { current?.expressiveness ?: 0.5f },
            ).also { it.load() }
            loadedKey = key
        }
        speakers = piper!!.speakers
        val papy = settings.papyVoice()
        val raw = piper!!.synthesize(text, PapyVoice.synthesisSpeed(papy))
        val speech = PapyVoice.process(raw, papy)
        player.play(speech.samples, speech.sampleRate, settings.santaVolume)
    }

    fun release() {
        player.stop()
        piper?.release()
        piper = null
        loadedKey = null
    }
}
