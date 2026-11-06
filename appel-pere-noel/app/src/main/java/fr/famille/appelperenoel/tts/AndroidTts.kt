package fr.famille.appelperenoel.tts

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import fr.famille.appelperenoel.engine.Engine
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/** Une voix française proposée par le moteur de synthèse d'Android. */
data class AndroidVoiceInfo(val name: String, val needsInternet: Boolean, val quality: Int)

/**
 * Synthèse vocale intégrée à Android (sur la plupart des téléphones : « Services vocaux Google »).
 * Gratuite, bien plus naturelle que Piper ; les voix « réseau » ont besoin d'internet.
 *
 * Le texte est synthétisé dans un fichier WAV, relu puis passé dans les effets « papy »
 * avant d'être joué : on garde ainsi le contrôle du volume, de l'écho et du micro coupé.
 */
class AndroidTts(
    private val context: Context,
    private val voiceName: () -> String?,
) : Engine, SpeechSynth {

    override val label = "Voix (Android)"
    override val handlesPitch = true

    @Volatile
    private var tts: TextToSpeech? = null
    private val mutex = Mutex()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<Boolean>>()
    private var counter = 0

    override val ready: Boolean get() = tts != null

    /** Nom du moteur utilisé (ex. com.google.android.tts). */
    var engineName: String = ""
        private set

    override suspend fun load() {
        if (tts != null) return
        val engine = withContext(Dispatchers.Main) {
            withTimeout(10_000) {
                suspendCancellableCoroutine<TextToSpeech> { cont ->
                    var created: TextToSpeech? = null
                    created = TextToSpeech(context.applicationContext) { status ->
                        val t = created
                        if (status == TextToSpeech.SUCCESS && t != null) {
                            if (cont.isActive) cont.resume(t)
                        } else {
                            t?.shutdown()
                            if (cont.isActive) cont.cancel(IllegalStateException("synthèse vocale d'Android indisponible"))
                        }
                    }
                    cont.invokeOnCancellation { created?.shutdown() }
                }
            }
        }
        val lang = engine.setLanguage(Locale.FRANCE)
        if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
            engine.shutdown()
            throw IllegalStateException("pas de voix française dans la synthèse d'Android")
        }
        val wanted = voiceName()
        val voice = frenchVoices(engine).firstOrNull { it.name == wanted }
        if (voice != null) engine.setVoice(voice)
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) {
                utteranceId?.let { pending.remove(it)?.complete(true) }
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                utteranceId?.let { pending.remove(it)?.complete(false) }
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
                utteranceId?.let { pending.remove(it)?.complete(false) }
            }
        })
        engineName = engine.defaultEngine ?: ""
        tts = engine
    }

    /** Voix françaises disponibles (après load()). */
    fun voices(): List<AndroidVoiceInfo> {
        val engine = tts ?: return emptyList()
        return frenchVoices(engine).map { AndroidVoiceInfo(it.name, it.isNetworkConnectionRequired, it.quality) }
    }

    private fun frenchVoices(engine: TextToSpeech): List<Voice> = runCatching {
        engine.voices.orEmpty()
            .filter { it.locale.language == "fr" && !it.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) }
            .sortedWith(compareBy<Voice>({ it.locale.country != "FR" }, { it.name }))
    }.getOrDefault(emptyList())

    override suspend fun synthesize(text: String, speed: Float, pitch: Float): RawSpeech = withContext(Dispatchers.IO) {
        mutex.withLock {
            val engine = tts ?: throw IllegalStateException("voix Android non chargée")
            val id = "u${counter++}"
            val file = File(context.cacheDir, "tts_$id.wav")
            val done = CompletableDeferred<Boolean>()
            pending[id] = done
            try {
                engine.setSpeechRate(speed.coerceIn(0.5f, 2f))
                engine.setPitch(pitch.coerceIn(0.5f, 2f))
                val result = engine.synthesizeToFile(text, Bundle(), file, id)
                if (result != TextToSpeech.SUCCESS) throw IllegalStateException("synthèse refusée")
                val ok = withTimeout(15_000) { done.await() }
                if (!ok) throw IllegalStateException("erreur de synthèse (internet ?)")
                readWav(file)
            } finally {
                pending.remove(id)
                file.delete()
            }
        }
    }

    override fun release() {
        tts?.let { runCatching { it.stop(); it.shutdown() } }
        tts = null
    }

    companion object {
        /** Lit un WAV PCM 16 bits (mono ou stéréo) en flottants mono. */
        fun readWav(file: File): RawSpeech {
            RandomAccessFile(file, "r").use { raf ->
                val bytes = ByteArray(raf.length().toInt())
                raf.readFully(bytes)
                val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
                var pos = 12
                var rate = 22050
                var channels = 1
                var bits = 16
                var dataStart = -1
                var dataLen = 0
                while (pos + 8 <= bytes.size) {
                    val id = String(bytes, pos, 4, Charsets.US_ASCII)
                    val len = buf.getInt(pos + 4)
                    val body = pos + 8
                    when (id) {
                        "fmt " -> {
                            channels = buf.getShort(body + 2).toInt()
                            rate = buf.getInt(body + 4)
                            bits = buf.getShort(body + 14).toInt()
                        }
                        "data" -> {
                            dataStart = body
                            // Certains moteurs écrivent une longueur fausse : on prend ce qui reste.
                            dataLen = if (len <= 0 || body + len > bytes.size) bytes.size - body else len
                        }
                    }
                    if (dataStart >= 0) break
                    pos = body + len + (len and 1)
                }
                if (dataStart < 0 || bits != 16) throw IllegalStateException("format audio inattendu")
                val frames = dataLen / (2 * channels)
                val out = FloatArray(frames)
                for (i in 0 until frames) {
                    var sum = 0f
                    for (c in 0 until channels) sum += buf.getShort(dataStart + (i * channels + c) * 2) / 32768f
                    out[i] = sum / channels
                }
                return RawSpeech(out, rate)
            }
        }
    }
}
