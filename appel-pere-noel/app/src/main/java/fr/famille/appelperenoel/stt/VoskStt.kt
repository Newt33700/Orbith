package fr.famille.appelperenoel.stt

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import fr.famille.appelperenoel.engine.Engine
import fr.famille.appelperenoel.models.ModelRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max
import kotlin.math.sqrt

data class SttResult(
    /** Ce que l'enfant a dit ("" si rien compris). */
    val text: String,
    /** Vrai si la phrase vient du clavier (mode debug). */
    val typed: Boolean = false,
    /** Temps entre la fin de parole détectée et le texte final (ms). */
    val finalizeMs: Long = 0,
    /** Durée totale d'écoute (ms). */
    val listenMs: Long = 0,
)

/**
 * Reconnaissance vocale hors-ligne (Vosk, petit modèle français).
 *
 * Le micro n'est ouvert QUE pendant listen() : le Père Noël ne s'entend donc jamais lui-même.
 * La fin de phrase est détectée après [silenceMs] sans nouveau mot ni son fort.
 */
class VoskStt(private val models: ModelRepository) : Engine {

    override val label = "Oreilles (Vosk)"

    @Volatile
    private var model: Model? = null

    /** Texte tapé au clavier en mode debug ; remplace le micro pour ce tour. */
    private val typed = AtomicReference<String?>(null)

    /** Empêche de libérer le modèle pendant qu'une écoute l'utilise. */
    private val mutex = Mutex()

    val ready: Boolean get() = model != null

    override suspend fun load() = withContext(Dispatchers.IO) {
        if (model != null) return@withContext
        val dir = models.voskModelDir() ?: throw IllegalStateException("modèle Vosk absent")
        model = Model(dir.absolutePath)
    }

    override fun release() = runBlocking {
        mutex.withLock {
            model?.close()
            model = null
        }
    }

    fun submitTyped(text: String) {
        typed.set(text)
    }

    /**
     * Écoute une réponse.
     * @param silenceMs silence qui termine la phrase
     * @param maxWaitMs si l'enfant ne dit rien du tout pendant ce temps, on rend ""
     * @param onPartial appelé avec la transcription en cours (pour le mode debug)
     */
    @SuppressLint("MissingPermission")
    suspend fun listen(
        silenceMs: Int,
        maxWaitMs: Long = 8_000,
        maxTotalMs: Long = 20_000,
        onPartial: (String) -> Unit = {},
    ): SttResult = withContext(Dispatchers.IO) { mutex.withLock { listenLocked(silenceMs, maxWaitMs, maxTotalMs, onPartial) } }

    @SuppressLint("MissingPermission")
    private suspend fun listenLocked(
        silenceMs: Int,
        maxWaitMs: Long,
        maxTotalMs: Long,
        onPartial: (String) -> Unit,
    ): SttResult = coroutineScope {
        typed.set(null)
        val start = SystemClock.elapsedRealtime()
        val m = model
        if (m == null) {
            // Pas de modèle : on attend juste une éventuelle saisie clavier (mode démo / debug).
            while (isActive && SystemClock.elapsedRealtime() - start < maxWaitMs) {
                typed.getAndSet(null)?.let { return@coroutineScope SttResult(it, typed = true) }
                kotlinx.coroutines.delay(100)
            }
            return@coroutineScope SttResult("", listenMs = SystemClock.elapsedRealtime() - start)
        }

        val rate = 16_000
        val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            rate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            max(minBuf, rate),
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            throw IllegalStateException("micro indisponible (permission refusée ?)")
        }
        val recognizer = Recognizer(m, rate.toFloat())
        val parts = mutableListOf<String>()
        var lastPartial = ""
        var lastSpeech = 0L
        var heard = false
        val buffer = ShortArray(rate / 10) // 100 ms
        try {
            record.startRecording()
            while (isActive) {
                typed.getAndSet(null)?.let { return@coroutineScope SttResult(it, typed = true) }
                val n = record.read(buffer, 0, buffer.size)
                val now = SystemClock.elapsedRealtime()
                if (n > 0) {
                    if (recognizer.acceptWaveForm(buffer, n)) {
                        val t = text(recognizer.result)
                        if (t.isNotBlank()) {
                            parts += t
                            heard = true
                            lastSpeech = now
                            onPartial(parts.joinToString(" "))
                        }
                        lastPartial = ""
                    } else {
                        val p = partial(recognizer.partialResult)
                        if (p != lastPartial) {
                            lastPartial = p
                            if (p.isNotBlank()) {
                                heard = true
                                lastSpeech = now
                                onPartial((parts + p).joinToString(" "))
                            }
                        }
                    }
                    // Un son fort prolonge la phrase (mot long, hésitation « euuuh »).
                    if (heard && rms(buffer, n) > LOUD_RMS) lastSpeech = now
                }
                if (heard && now - lastSpeech >= silenceMs) break
                if (!heard && now - start >= maxWaitMs) break
                if (now - start >= maxTotalMs) break
            }
            val endDetected = SystemClock.elapsedRealtime()
            runCatching { record.stop() }
            val last = text(recognizer.finalResult)
            if (last.isNotBlank()) parts += last
            val done = SystemClock.elapsedRealtime()
            SttResult(
                text = parts.joinToString(" ").trim(),
                finalizeMs = done - endDetected,
                listenMs = done - start,
            )
        } finally {
            runCatching { record.stop() }
            record.release()
            recognizer.close()
        }
    }

    private fun text(json: String) = runCatching { JSONObject(json).optString("text") }.getOrDefault("").trim()
    private fun partial(json: String) = runCatching { JSONObject(json).optString("partial") }.getOrDefault("").trim()

    private fun rms(buf: ShortArray, n: Int): Double {
        var sum = 0.0
        for (i in 0 until n) sum += buf[i].toDouble() * buf[i]
        return sqrt(sum / n)
    }

    private companion object {
        const val LOUD_RMS = 2500.0
    }
}
