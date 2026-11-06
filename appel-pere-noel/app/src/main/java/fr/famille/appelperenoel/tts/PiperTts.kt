package fr.famille.appelperenoel.tts

import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import fr.famille.appelperenoel.engine.Engine
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.models.PiperVoice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

/** Audio produit par la synthèse, avant les effets « voix de papy ». */
class RawSpeech(val samples: FloatArray, val sampleRate: Int)

/** Synthèse vocale hors-ligne : voix Piper exécutée par sherpa-onnx. */
class PiperTts(
    private val models: ModelRepository,
    private val voiceName: () -> String?,
    /** Numéro du locuteur pour les voix qui en ont plusieurs. */
    private val speaker: () -> Int = { 0 },
    /** 0..1 : variations d'intonation et de rythme (noise_scale / noise_w de Piper). */
    private val expressiveness: () -> Float = { 0.5f },
) : Engine, SpeechSynth {

    override val label = "Voix (Piper)"
    override val handlesPitch = false

    @Volatile
    private var tts: OfflineTts? = null
    private val mutex = Mutex()

    var voice: PiperVoice? = null
        private set

    /** Nombre de locuteurs de la voix chargée (1 pour la plupart). */
    var speakers: Int = 1
        private set

    override val ready: Boolean get() = tts != null

    override suspend fun load() = withContext(Dispatchers.Default) {
        mutex.withLock {
            if (tts != null) return@withLock
            val voices = models.piperVoices()
            val chosen = voices.firstOrNull { it.name == voiceName() } ?: voices.firstOrNull()
                ?: throw IllegalStateException("aucune voix Piper installée")
            val espeak = File(chosen.dir, "espeak-ng-data")
            val config = OfflineTtsConfig(
                model = OfflineTtsModelConfig(
                    vits = OfflineTtsVitsModelConfig(
                        model = chosen.onnx.absolutePath,
                        lexicon = "",
                        tokens = File(chosen.dir, "tokens.txt").absolutePath,
                        dataDir = if (espeak.isDirectory) espeak.absolutePath else "",
                        dictDir = "",
                        noiseScale = 0.45f + 0.5f * expressiveness().coerceIn(0f, 1f),
                        noiseScaleW = 0.6f + 0.6f * expressiveness().coerceIn(0f, 1f),
                        lengthScale = 1.0f,
                    ),
                    numThreads = 2,
                    debug = false,
                    provider = "cpu",
                ),
                ruleFsts = "",
                ruleFars = "",
                maxNumSentences = 1,
                silenceScale = 0.2f,
            )
            val engine = OfflineTts(null, config)
            tts = engine
            voice = chosen
            speakers = runCatching { engine.numSpeakers() }.getOrDefault(1).coerceAtLeast(1)
        }
    }

    /** @param speed 1 = vitesse normale, < 1 = plus lent (équivaut à length_scale = 1 / speed). */
    override suspend fun synthesize(text: String, speed: Float, pitch: Float): RawSpeech = synthesize(text, speed)

    suspend fun synthesize(text: String, speed: Float): RawSpeech = withContext(Dispatchers.Default) {
        mutex.withLock {
            val engine = tts ?: throw IllegalStateException("voix non chargée")
            val sid = speaker().coerceIn(0, speakers - 1)
            val audio = engine.generate(text, sid, speed)
            RawSpeech(audio.samples, audio.sampleRate)
        }
    }

    override fun release() = runBlocking {
        mutex.withLock {
            tts?.release()
            tts = null
        }
    }
}
