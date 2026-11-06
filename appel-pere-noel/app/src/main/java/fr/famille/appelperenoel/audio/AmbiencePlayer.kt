package fr.famille.appelperenoel.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Ambiance en boucle très basse. Utilise assets/sons/ambiance.ogg s'il existe,
 * sinon une boucle générée (cheminée + grelots).
 */
class AmbiencePlayer(private val context: Context) {

    private var track: AudioTrack? = null
    private var media: MediaPlayer? = null

    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    suspend fun start(volume: Float) {
        stop()
        if (startFromAsset(volume)) return
        val pcm = withContext(Dispatchers.Default) { cached ?: ToneSynth.ambienceLoop().also { cached = it } }
        val t = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(ToneSynth.RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(pcm.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        t.write(pcm, 0, pcm.size)
        t.setLoopPoints(0, pcm.size, -1)
        t.setVolume(volume.coerceIn(0f, 1f))
        t.play()
        track = t
    }

    private fun startFromAsset(volume: Float): Boolean {
        val exists = runCatching { context.assets.list("sons")?.contains(ASSET) == true }.getOrDefault(false)
        if (!exists) return false
        return runCatching {
            val player = MediaPlayer()
            context.assets.openFd("sons/$ASSET").use { fd ->
                player.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
            }
            player.setAudioAttributes(attributes)
            player.isLooping = true
            player.setVolume(volume, volume)
            player.prepare()
            player.start()
            media = player
            true
        }.getOrDefault(false)
    }

    fun setVolume(volume: Float) {
        val v = volume.coerceIn(0f, 1f)
        track?.let { runCatching { it.setVolume(v) } }
        media?.let { runCatching { it.setVolume(v, v) } }
    }

    fun stop() {
        track?.let { runCatching { it.stop() }; it.release() }
        track = null
        media?.let { runCatching { it.stop() }; it.release() }
        media = null
    }

    private companion object {
        const val ASSET = "ambiance.ogg"

        @Volatile
        var cached: ShortArray? = null
    }
}
