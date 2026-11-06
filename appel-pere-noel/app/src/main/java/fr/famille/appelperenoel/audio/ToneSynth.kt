package fr.famille.appelperenoel.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/** Sons générés par le code : aucune ressource à télécharger. */
object ToneSynth {
    const val RATE = 22050

    /** Sinusoïde avec des fondus pour éviter les « clics ». */
    fun sine(freq: Double, seconds: Double, amp: Double = 0.3, fadeMs: Double = 15.0): ShortArray {
        val n = (seconds * RATE).toInt()
        val fade = (fadeMs / 1000 * RATE).toInt().coerceAtLeast(1)
        return ShortArray(n) { i ->
            val env = min(1.0, min(i.toDouble() / fade, (n - 1 - i).toDouble() / fade))
            (sin(2 * PI * freq * i / RATE) * amp * env * Short.MAX_VALUE).toInt().toShort()
        }
    }

    fun silence(seconds: Double) = ShortArray((seconds * RATE).toInt())

    /** Tonalité de retour d'appel française : 440 Hz pendant 1,5 s (puis 3,5 s de silence, géré par l'appelant). */
    fun ringbackBurst() = sine(440.0, 1.5, 0.28)

    /** Petit « clac » du combiné qu'on décroche. */
    fun pickupClick(): ShortArray {
        val rnd = Random(3)
        val n = (0.12 * RATE).toInt()
        var lp = 0.0
        return ShortArray(n) { i ->
            val t = i.toDouble() / RATE
            lp += 0.35 * ((rnd.nextDouble() * 2 - 1) - lp)
            (lp * exp(-t * 60) * 0.6 * Short.MAX_VALUE).toInt().toShort()
        }
    }

    /** Tonalité « occupé » française : 440 Hz, 0,5 s / 0,5 s, trois fois. */
    fun busyTone(): ShortArray {
        val beep = sine(440.0, 0.5, 0.25)
        val gap = silence(0.5)
        return ShortArray(0) + beep + gap + beep + gap + beep
    }

    /**
     * Boucle d'ambiance : souffle grave de la cheminée, crépitements aléatoires
     * et, de temps en temps, quelques grelots. Rejouée en boucle à très bas volume.
     */
    fun ambienceLoop(seconds: Int = 16, seed: Long = 7): ShortArray {
        val n = seconds * RATE
        val out = FloatArray(n)
        val rnd = Random(seed)

        // Souffle du feu (bruit « brun »).
        var brown = 0f
        for (i in 0 until n) {
            brown = (brown + (rnd.nextFloat() * 2 - 1) * 0.02f) * 0.995f
            out[i] += brown * 0.35f
        }

        // Crépitements : petites salves de bruit qui décroissent vite.
        var t = 0
        while (t < n) {
            t += (rnd.nextDouble() * RATE / 3).toInt() + 150
            val len = (RATE * (0.002 + rnd.nextDouble() * 0.012)).toInt()
            val amp = 0.15f + rnd.nextFloat() * 0.6f
            var lp = 0f
            for (k in 0 until len) {
                val idx = t + k
                if (idx >= n) break
                val env = exp(-5.0 * k / len).toFloat()
                lp += 0.5f * ((rnd.nextFloat() * 2 - 1) - lp)
                out[idx] += lp * amp * env
            }
        }

        // Grelots : grappes de 4 à 7 tintements toutes les 4 à 7 s.
        var b = (RATE * 1.5).toInt()
        while (b < n - RATE) {
            var s = b
            repeat(4 + rnd.nextInt(4)) {
                val f0 = 1900.0 + rnd.nextDouble() * 700
                val dur = (RATE * 0.35).toInt()
                val a = 0.05 + rnd.nextDouble() * 0.05
                for (k in 0 until dur) {
                    val idx = s + k
                    if (idx >= n) break
                    val tt = k.toDouble() / RATE
                    val v = sin(2 * PI * f0 * tt) * exp(-tt * 12) +
                        0.5 * sin(2 * PI * f0 * 2.0 * tt) * exp(-tt * 16) +
                        0.3 * sin(2 * PI * f0 * 2.76 * tt) * exp(-tt * 20)
                    out[idx] += (v * a).toFloat()
                }
                s += (RATE * (0.06 + rnd.nextDouble() * 0.08)).toInt()
            }
            b += (RATE * (4.0 + rnd.nextDouble() * 3)).toInt()
        }

        val peak = out.maxOf { abs(it) }.coerceAtLeast(1e-3f)
        val gain = 0.9f / peak
        return ShortArray(n) { (out[it] * gain * Short.MAX_VALUE).toInt().toShort() }
    }
}
