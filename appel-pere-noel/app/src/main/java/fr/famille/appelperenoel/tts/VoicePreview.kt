package fr.famille.appelperenoel.tts

import fr.famille.appelperenoel.audio.PapyVoice
import fr.famille.appelperenoel.audio.PcmPlayer
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.settings.papyVoice

/** Permet aux parents d'écouter et comparer les voix depuis l'espace parents. */
class VoicePreview(private val models: ModelRepository) {

    private var piper: PiperTts? = null
    private var loadedVoice: String? = null
    private val player = PcmPlayer()

    suspend fun play(settings: AppSettings, text: String) {
        val voices = models.piperVoices()
        val name = voices.firstOrNull { it.name == settings.voiceName }?.name
            ?: voices.firstOrNull()?.name
            ?: throw IllegalStateException("Aucune voix installée")
        if (piper == null || loadedVoice != name) {
            piper?.release()
            piper = PiperTts(models) { name }.also { it.load() }
            loadedVoice = name
        }
        val papy = settings.papyVoice()
        val raw = piper!!.synthesize(text, PapyVoice.synthesisSpeed(papy))
        val speech = PapyVoice.process(raw, papy)
        player.play(speech.samples, speech.sampleRate, settings.santaVolume)
    }

    fun release() {
        player.stop()
        piper?.release()
        piper = null
        loadedVoice = null
    }
}
