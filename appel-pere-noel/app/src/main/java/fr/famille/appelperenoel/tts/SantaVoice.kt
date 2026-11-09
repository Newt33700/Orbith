package fr.famille.appelperenoel.tts

import android.content.Context
import android.os.SystemClock
import fr.famille.appelperenoel.audio.HomeRecording
import fr.famille.appelperenoel.audio.HomeRecordings
import fr.famille.appelperenoel.audio.PapyVoice
import fr.famille.appelperenoel.audio.PapyVoiceSettings
import fr.famille.appelperenoel.audio.PcmPlayer
import fr.famille.appelperenoel.audio.PlayableSpeech
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import java.util.concurrent.ConcurrentHashMap

/** Ce qu'a coûté une phrase dite. */
data class SpeechTiming(
    /** Temps de synthèse (0 si déjà en cache ou enregistrement maison). */
    val synthMs: Long,
    /** Instant (elapsedRealtime) où le son a commencé. */
    val startedAt: Long,
)

/**
 * La voix du Père Noël pendant un appel : synthèse (Android ou Piper) + effets « papy »,
 * enregistrements faits maison quand ils existent, petit cache pour les phrases fixes.
 */
class SantaVoice(
    private val context: Context,
    /** Moteur actif (choisi au chargement ; null si aucun). */
    private val synth: () -> SpeechSynth?,
    private val papy: PapyVoiceSettings,
    private val player: PcmPlayer,
    /** Corrige l'orthographe des prénoms pour la voix (voir [fr.famille.appelperenoel.settings.respellNames]). */
    private val respell: (String) -> String = { it },
) {
    private val cache = ConcurrentHashMap<String, PlayableSpeech>()

    val ready: Boolean get() = synth()?.ready == true

    /** Pré-calcule des phrases (pendant la sonnerie) pour qu'elles partent instantanément. */
    suspend fun warmUp(texts: List<String>) {
        if (!ready) return
        for (t in texts) runCatching { prepare(respell(t)) }
    }

    /** Synthèses lancées à l'avance ([prefetch]) et pas encore utilisées. */
    private val inflight = ConcurrentHashMap<String, Deferred<PlayableSpeech>>()

    private suspend fun synthNow(text: String): PlayableSpeech {
        val engine = synth() ?: throw IllegalStateException("aucune voix")
        val speech = render(engine, text, papy)
        if (cache.size < 96) cache[text] = speech
        return speech
    }

    private suspend fun prepare(text: String): Pair<PlayableSpeech, Long> {
        cache[text]?.let { return it to 0L }
        val t0 = SystemClock.elapsedRealtime()
        val early = inflight.remove(text)
        val speech = early?.let { runCatching { it.await() }.getOrNull() } ?: synthNow(text)
        return speech to SystemClock.elapsedRealtime() - t0
    }

    /** Lance la synthèse d'une phrase en arrière-plan, pour qu'elle parte sans attendre le moment venu. */
    fun prefetch(scope: CoroutineScope, original: String) {
        if (!ready) return
        val text = respell(original)
        val withHo = HomeRecordings.file(context, HomeRecording.HOHOHO) != null
        val segments = if (withHo) splitHoHoHo(text).filter { !it.first }.map { it.second } else listOf(text)
        for (seg in segments) {
            if (seg.isBlank() || cache.containsKey(seg) || inflight.containsKey(seg)) continue
            inflight[seg] = scope.async(Dispatchers.IO) { synthNow(seg) }
        }
    }

    /**
     * Dit une phrase. Les « Ho ho ho ! » sont remplacés par l'enregistrement maison s'il existe ;
     * [goodbye] = vrai pour la phrase d'au revoir (remplacée en entier par l'enregistrement « Au revoir »).
     */
    suspend fun speak(original: String, volume: Float, goodbye: Boolean = false): SpeechTiming {
        val text = respell(original)
        if (goodbye) {
            HomeRecordings.file(context, HomeRecording.GOODBYE)?.let {
                val start = SystemClock.elapsedRealtime()
                HomeRecordings.play(it, volume)
                return SpeechTiming(0, start)
            }
        }
        val hohoho = HomeRecordings.file(context, HomeRecording.HOHOHO)
        val segments: List<Pair<Boolean, String>> = if (hohoho != null) splitHoHoHo(text) else listOf(false to text)

        var synthMs = 0L
        var startedAt = 0L
        for ((isHo, segment) in segments) {
            if (isHo && hohoho != null) {
                if (startedAt == 0L) startedAt = SystemClock.elapsedRealtime()
                HomeRecordings.play(hohoho, volume)
                continue
            }
            if (segment.isBlank()) continue
            if (!ready) {
                // Pas de voix installée (mode démo) : on laisse juste le temps de « parler ».
                if (startedAt == 0L) startedAt = SystemClock.elapsedRealtime()
                delay(700L + segment.length * 65L)
                continue
            }
            val (speech, ms) = prepare(segment)
            synthMs += ms
            if (startedAt == 0L) startedAt = SystemClock.elapsedRealtime()
            player.play(speech.samples, speech.sampleRate, volume)
        }
        if (startedAt == 0L) startedAt = SystemClock.elapsedRealtime()
        return SpeechTiming(synthMs, startedAt)
    }

    companion object {
        /** Synthèse + effets, selon les capacités du moteur. */
        suspend fun render(engine: SpeechSynth, text: String, papy: PapyVoiceSettings, volume: Float = 1f): PlayableSpeech =
            if (engine.handlesPitch) {
                val raw = engine.synthesize(text, PapyVoice.nativeSpeed(papy), PapyVoice.nativePitch(papy))
                PapyVoice.process(raw, papy, volume, resample = false)
            } else {
                val raw = engine.synthesize(text, PapyVoice.synthesisSpeed(papy), 1f)
                PapyVoice.process(raw, papy, volume, resample = true)
            }

        private val HO = Regex("(?i)ho[ ,-]*ho[ ,-]*ho\\s*!*")

        /** Découpe « Allô ? Ho ho ho ! Lilian… » en [texte, HO, texte]. */
        fun splitHoHoHo(text: String): List<Pair<Boolean, String>> {
            val out = ArrayList<Pair<Boolean, String>>()
            var last = 0
            for (m in HO.findAll(text)) {
                if (m.range.first > last) out += false to text.substring(last, m.range.first).trim()
                out += true to m.value
                last = m.range.last + 1
            }
            if (last < text.length) out += false to text.substring(last).trim()
            return out
        }
    }
}
