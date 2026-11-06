package fr.famille.appelperenoel.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build

/**
 * Prépare le téléphone comme pour un vrai appel : mode « communication »,
 * focus audio (la musique se coupe), haut-parleur ou écouteur.
 * Tout est remis comme avant dans stop().
 */
class CallAudioSession(context: Context, private val onInterrupted: () -> Unit) {

    private val am = context.getSystemService(AudioManager::class.java)
    private var focusRequest: AudioFocusRequest? = null
    private var previousMode = AudioManager.MODE_NORMAL
    private var active = false

    fun start(speaker: Boolean) {
        if (active) return
        active = true
        previousMode = am.mode
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setOnAudioFocusChangeListener { change ->
                // Un vrai appel ou une autre appli prend la main : le Père Noël raccroche.
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    onInterrupted()
                }
            }
            .build()
        focusRequest = request
        am.requestAudioFocus(request)
        runCatching { am.mode = AudioManager.MODE_IN_COMMUNICATION }
        setSpeaker(speaker)
    }

    fun setSpeaker(on: Boolean) {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (on) {
                    am.availableCommunicationDevices
                        .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                        ?.let { am.setCommunicationDevice(it) }
                } else {
                    am.clearCommunicationDevice()
                }
            } else {
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = on
            }
        }
    }

    fun stop() {
        if (!active) return
        active = false
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice()
            } else {
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = false
            }
        }
        runCatching { am.mode = previousMode }
        focusRequest?.let { am.abandonAudioFocusRequest(it) }
        focusRequest = null
    }
}
