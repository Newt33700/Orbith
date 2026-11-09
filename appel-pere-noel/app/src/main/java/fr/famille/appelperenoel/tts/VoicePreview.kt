package fr.famille.appelperenoel.tts

import android.content.Context
import android.media.MediaPlayer
import fr.famille.appelperenoel.audio.CallAudioSession
import fr.famille.appelperenoel.audio.PcmPlayer
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.settings.papyVoice
import fr.famille.appelperenoel.settings.respellNames

/** Permet aux parents d'écouter et comparer les voix depuis l'espace parents. */
class VoicePreview(private val context: Context, private val models: ModelRepository) {

    private var piper: PiperTts? = null
    private var piperKey: String? = null
    private var android: AndroidTts? = null
    private var androidVoice: String? = null
    private val player = PcmPlayer()

    /** Nombre de locuteurs de la dernière voix Piper écoutée. */
    var speakers: Int = 1
        private set

    /** Réglages de la dernière écoute (lus par le moteur à chaque phrase). */
    @Volatile
    private var current: AppSettings? = null

    /** Moteur de synthèse Android utilisé (ex. com.google.android.tts). */
    val androidEngine: String get() = android?.engineName ?: ""

    /** Voix françaises proposées par Android (charge le moteur si besoin). */
    suspend fun androidVoices(settings: AppSettings): List<AndroidVoiceInfo> = loadAndroid(settings).voices()

    private suspend fun loadAndroid(settings: AppSettings): AndroidTts {
        val existing = android
        if (existing != null && androidVoice == settings.androidVoice) return existing
        existing?.release()
        val engine = AndroidTts(context) { settings.androidVoice }
        engine.load()
        android = engine
        androidVoice = settings.androidVoice
        return engine
    }

    private suspend fun loadPiper(settings: AppSettings): PiperTts {
        val voices = models.piperVoices()
        val name = voices.firstOrNull { it.name == settings.voiceName }?.name
            ?: voices.firstOrNull()?.name
            ?: throw IllegalStateException("Aucune voix Piper installée")
        val key = "$name/${settings.expressiveness}"
        piper?.takeIf { piperKey == key }?.let { return it }
        piper?.release()
        val engine = PiperTts(
            models,
            voiceName = { name },
            speaker = { current?.voiceSpeaker ?: 0 },
            expressiveness = { current?.expressiveness ?: 0.5f },
        )
        engine.load()
        piper = engine
        piperKey = key
        speakers = engine.speakers
        return engine
    }

    suspend fun play(settings: AppSettings, text: String) {
        current = settings
        val engine: SpeechSynth = when (settings.voiceEngine) {
            "piper" -> loadPiper(settings)
            "eleven" -> ElevenLabsTts(
                context,
                apiKey = { settings.elevenKey },
                voiceId = { settings.elevenVoiceId },
                model = { settings.elevenModel },
            ).also { it.load() }
            else -> loadAndroid(settings)
        }
        val speech = SantaVoice.render(engine, respellNames(text, settings.children), settings.papyVoice())
        player.play(speech.samples, speech.sampleRate, settings.santaVolume)
    }

    /** Écoute l'extrait d'une voix de la bibliothèque ElevenLabs (mp3 en ligne, ne consomme pas de quota). */
    fun playUrl(url: String) {
        stopUrl()
        urlPlayer = MediaPlayer().apply {
            setAudioAttributes(CallAudioSession.ATTRIBUTES)
            setDataSource(url)
            setOnPreparedListener { it.start() }
            setOnErrorListener { _, _, _ -> true }
            prepareAsync()
        }
    }

    private var urlPlayer: MediaPlayer? = null

    private fun stopUrl() {
        urlPlayer?.let { runCatching { it.stop() }; it.release() }
        urlPlayer = null
    }

    fun release() {
        stopUrl()
        player.stop()
        piper?.release()
        piper = null
        piperKey = null
        android?.release()
        android = null
    }
}
