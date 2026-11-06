package fr.famille.appelperenoel.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.min

/** Joue un tampon PCM 16 bits mono et rend la main quand le son est fini (ou annulé). */
class PcmPlayer(private val attributes: AudioAttributes = CallAudioSession.ATTRIBUTES) {

    @Volatile
    private var track: AudioTrack? = null

    suspend fun play(samples: ShortArray, sampleRate: Int, volume: Float = 1f) = withContext(Dispatchers.IO) {
        if (samples.isEmpty()) return@withContext
        val minBuf = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val t = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(max(minBuf, sampleRate / 5 * 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track = t
        try {
            t.setVolume(volume.coerceIn(0f, 1f))
            t.play()
            val chunk = sampleRate / 20
            var offset = 0
            while (offset < samples.size) {
                ensureActive()
                val written = t.write(samples, offset, min(chunk, samples.size - offset))
                if (written <= 0) break
                offset += written
            }
            // Attendre que la fin du son soit vraiment sortie du haut-parleur.
            val deadline = SystemClock.elapsedRealtime() + samples.size * 1000L / sampleRate + 1000
            while (isActive && t.playbackHeadPosition < samples.size && SystemClock.elapsedRealtime() < deadline) {
                delay(15)
            }
        } finally {
            runCatching { t.stop() }
            t.release()
            if (track === t) track = null
        }
    }

    /** Change le volume du son en cours (ex. bouton haut-parleur). */
    fun setVolume(volume: Float) {
        track?.let { runCatching { it.setVolume(volume.coerceIn(0f, 1f)) } }
    }

    /** Coupe net le son en cours (la coroutine de play() doit aussi être annulée). */
    fun stop() {
        track?.let { runCatching { it.pause(); it.flush() } }
    }
}
