package fr.famille.appelperenoel.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager

/**
 * Prépare le son de l'appel.
 *
 * On passe par le canal « média » (comme une vidéo) et non par le canal « appel téléphonique » :
 * sur HyperOS/MIUI, ce dernier peut rester muet pour une appli qui n'est pas un vrai téléphone,
 * et il dépend du mode silencieux. Les touches de volume règlent donc le volume média.
 *
 * - Focus audio : la musique ou les vidéos en cours se mettent en pause.
 * - Si le volume média est presque à zéro, on le remonte pendant l'appel (puis on le remet).
 */
class CallAudioSession(context: Context, private val onInterrupted: () -> Unit) {

    private val am = context.getSystemService(AudioManager::class.java)
    private var focusRequest: AudioFocusRequest? = null
    private var previousVolume = -1
    private var active = false

    fun start() {
        if (active) return
        active = true
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(ATTRIBUTES)
            .setOnAudioFocusChangeListener { change ->
                // Un vrai appel ou une autre appli prend la main : le Père Noël raccroche.
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    onInterrupted()
                }
            }
            .build()
        focusRequest = request
        am.requestAudioFocus(request)

        runCatching {
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val minimum = (max * 0.5f).toInt().coerceAtLeast(1)
            if (current < minimum) {
                previousVolume = current
                am.setStreamVolume(AudioManager.STREAM_MUSIC, minimum, 0)
            }
        }
    }

    fun stop() {
        if (!active) return
        active = false
        if (previousVolume >= 0) {
            runCatching { am.setStreamVolume(AudioManager.STREAM_MUSIC, previousVolume, 0) }
            previousVolume = -1
        }
        focusRequest?.let { am.abandonAudioFocusRequest(it) }
        focusRequest = null
    }

    companion object {
        val ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
    }
}
