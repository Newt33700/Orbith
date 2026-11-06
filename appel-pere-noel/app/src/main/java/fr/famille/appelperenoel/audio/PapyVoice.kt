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
    val reverb: Float = 0f,
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

    /** Vitesse et hauteur à demander à un moteur qui sait changer la hauteur lui-même. */
    fun nativeSpeed(s: PapyVoiceSettings): Float = (1f / s.slowness).coerceIn(0.5f, 2f)
    fun nativePitch(s: PapyVoiceSettings): Float = playbackFactor(s)

    /** @param resample faux si le moteur a déjà abaissé la voix lui-même */
    fun process(raw: RawSpeech, s: PapyVoiceSettings, volume: Float = 1f, resample: Boolean = true): PlayableSpeech {
        var x = raw.samples
        if (s.reverb > 0f) x = reverb(x, raw.sampleRate, s.reverb)
        // Petit silence à la fin pour que la réverbération s'éteigne doucement.
        val peak = x.maxOfOrNull { abs(it) }?.coerceAtLeast(1e-4f) ?: 1f
        val gain = (0.95f / peak).coerceAtMost(4f) * volume.coerceIn(0f, 1f)
        val out = ShortArray(x.size) { (x[it] * gain * Short.MAX_VALUE).toInt().coerceIn(-32768, 32767).toShort() }
        val rate = if (resample) (raw.sampleRate * playbackFactor(s)).toInt().coerceIn(4000, 48000) else raw.sampleRate
        return PlayableSpeech(out, rate)
    }

    /**
     * Écho léger de pièce : quelques réflexions courtes, adoucies (filtrées) et sans boucle de
     * rétroaction. (Les filtres en peigne utilisés avant donnaient un timbre métallique, « robotique ».)
     */
    private fun reverb(input: FloatArray, rate: Int, amount: Float): FloatArray {
        val taps = listOf(19f to 0.45f, 31f to 0.35f, 47f to 0.28f, 71f to 0.2f, 103f to 0.14f, 149f to 0.09f)
        val tail = (rate * 0.16f).toInt()
        val n = input.size + tail
        // Version adoucie du signal (passe-bas) pour les réflexions : un mur absorbe les aigus.
        val soft = FloatArray(input.size)
        var lp = 0f
        for (i in input.indices) {
            lp += 0.35f * (input[i] - lp)
            soft[i] = lp
        }
        val out = FloatArray(n)
        input.copyInto(out)
        val mix = amount.coerceIn(0f, 0.6f) * 1.2f
        for ((ms, gain) in taps) {
            val d = (rate * ms / 1000f).toInt()
            val g = gain * mix
            for (i in soft.indices) out[i + d] += soft[i] * g
        }
        return out
    }
}
