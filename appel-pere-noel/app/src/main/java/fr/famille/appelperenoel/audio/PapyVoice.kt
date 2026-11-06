package fr.famille.appelperenoel.audio

import fr.famille.appelperenoel.tts.RawSpeech
import kotlin.math.abs
import kotlin.math.pow

/** Réglages de la « voix de papy ». */
data class PapyVoiceSettings(
    /** Abaissement de la hauteur, en demi-tons. */
    val pitchSemitones: Float = 1.5f,
    /** Lenteur finale : 1.15 = 15 % plus lent que la voix d'origine. */
    val slowness: Float = 1.15f,
    /** Quantité d'écho / réverbération (0 = aucune). */
    val reverb: Float = 0.15f,
)

/** Audio prêt à jouer. */
class PlayableSpeech(val samples: ShortArray, val sampleRate: Int) {
    val durationMs: Long get() = samples.size * 1000L / sampleRate
}

/**
 * Transforme la voix de synthèse en voix de vieux Père Noël :
 *
 * - hauteur abaissée en jouant le son un peu moins vite (taux de lecture réduit) ;
 *   ce ralentissement est compensé dans la vitesse demandée à Piper pour obtenir
 *   exactement la lenteur voulue ;
 * - petite réverbération (quelques échos courts), comme dans une grande pièce en bois.
 */
object PapyVoice {

    /** Facteur de lecture (< 1 = plus grave). */
    fun playbackFactor(s: PapyVoiceSettings): Float = 2.0.pow(-s.pitchSemitones / 12.0).toFloat()

    /** Vitesse à demander à Piper pour que, après abaissement, la lenteur soit [PapyVoiceSettings.slowness]. */
    fun synthesisSpeed(s: PapyVoiceSettings): Float = (1f / (s.slowness * playbackFactor(s))).coerceIn(0.5f, 2f)

    fun process(raw: RawSpeech, s: PapyVoiceSettings, volume: Float = 1f): PlayableSpeech {
        var x = raw.samples
        if (s.reverb > 0f) x = reverb(x, raw.sampleRate, s.reverb)
        // Petit silence à la fin pour que la réverbération s'éteigne doucement.
        val peak = x.maxOfOrNull { abs(it) }?.coerceAtLeast(1e-4f) ?: 1f
        val gain = (0.95f / peak).coerceAtMost(4f) * volume.coerceIn(0f, 1f)
        val out = ShortArray(x.size) { (x[it] * gain * Short.MAX_VALUE).toInt().coerceIn(-32768, 32767).toShort() }
        val rate = (raw.sampleRate * playbackFactor(s)).toInt().coerceIn(4000, 48000)
        return PlayableSpeech(out, rate)
    }

    /** Réverbération légère : trois filtres en peigne + un passe-tout (schéma de Schroeder simplifié). */
    private fun reverb(input: FloatArray, rate: Int, amount: Float): FloatArray {
        val tail = (rate * 0.25f).toInt()
        val n = input.size + tail
        val dry = FloatArray(n).also { input.copyInto(it) }
        val wet = FloatArray(n)
        for ((ms, fb) in listOf(29.7f to 0.42f, 37.1f to 0.38f, 41.1f to 0.35f)) {
            val d = (rate * ms / 1000f).toInt().coerceAtLeast(1)
            val buf = FloatArray(n)
            for (i in 0 until n) {
                val delayed = if (i >= d) buf[i - d] else 0f
                buf[i] = dry[i] + delayed * fb
                wet[i] += delayed
            }
        }
        // Passe-tout pour adoucir.
        val d = (rate * 0.005f).toInt().coerceAtLeast(1)
        val g = 0.6f
        val ap = FloatArray(n)
        for (i in 0 until n) {
            val xd = if (i >= d) wet[i - d] else 0f
            val yd = if (i >= d) ap[i - d] else 0f
            ap[i] = -g * wet[i] + xd + g * yd
        }
        val mix = amount.coerceIn(0f, 0.6f) / 3f
        return FloatArray(n) { dry[it] + ap[it] * mix }
    }
}
