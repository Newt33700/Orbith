package fr.famille.appelperenoel.ui.call

import android.content.Context
import android.os.SystemClock
import fr.famille.appelperenoel.audio.AmbiencePlayer
import fr.famille.appelperenoel.audio.CallAudioSession
import fr.famille.appelperenoel.audio.PcmPlayer
import fr.famille.appelperenoel.audio.ToneSynth
import fr.famille.appelperenoel.engine.Engine
import fr.famille.appelperenoel.engine.EnginePreloader
import fr.famille.appelperenoel.engine.LoadResult
import fr.famille.appelperenoel.engine.PlaceholderEngine
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.scenario.CallStep
import fr.famille.appelperenoel.scenario.Phrases
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.settings.Child
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.random.Random

private const val FX_VOLUME = 0.8f
private const val QUIET = 0.3f

enum class CallPhase { RINGING, CONNECTED, ENDED }

data class CallUiState(
    val phase: CallPhase = CallPhase.RINGING,
    val elapsedSeconds: Int = 0,
    val speakerOn: Boolean = true,
    val subtitle: String? = null,
    val santaSpeaking: Boolean = false,
    val listening: Boolean = false,
    val endingSoon: Boolean = false,
    val loadResults: List<LoadResult> = emptyList(),
    val ringMillis: Long = 0,
    val demoMode: Boolean = true,
    val childName: String? = null,
)

/**
 * Pilote un appel du début à la fin : sonnerie (avec chargement des moteurs en parallèle),
 * décroché, conversation, durée maximale, raccrochage et libération des ressources.
 *
 * Jalon (a) : la conversation est simulée (sous-titres, pauses d'écoute) ;
 * la voix, l'écoute et le cerveau arrivent aux jalons suivants.
 */
class CallController(
    context: Context,
    private val settings: AppSettings,
    models: ModelRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(CallUiState(speakerOn = settings.speakerByDefault))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    private val audio = CallAudioSession(context) { scope.launch { end(playBusyTone = false) } }
    private val fx = PcmPlayer()
    private val ambience = AmbiencePlayer(context)

    private val engines: List<Engine> = listOf(
        PlaceholderEngine("Oreilles (Vosk)") { models.voskModelDir() != null },
        PlaceholderEngine("Voix (Piper)") { models.piperVoices().isNotEmpty() },
        PlaceholderEngine("Cerveau (Gemma)") { models.llmModelFile() != null },
    )

    private var mainJob: Job? = null
    private var clockJob: Job? = null
    private var started = false
    private var ended = false
    private var released = false

    fun start() {
        if (started) return
        started = true
        audio.start()
        mainJob = scope.launch { runCall() }
    }

    fun toggleSpeaker() {
        val on = !_state.value.speakerOn
        _state.update { it.copy(speakerOn = on) }
        fx.setVolume(FX_VOLUME * loudness())
        ambience.setVolume(settings.ambienceVolume * loudness())
    }

    /** L'enfant raccroche. */
    fun hangUp() = end(playBusyTone = false)

    /** À appeler quand l'écran disparaît : garantit que tout est libéré. */
    fun dispose() {
        end(playBusyTone = false)
        releaseResources()
        scope.cancel()
    }

    private suspend fun runCall() = coroutineScope {
        // 1. Sonnerie + chargement des moteurs en parallèle.
        val ring = launch {
            val tone = ToneSynth.ringbackBurst()
            while (isActive) {
                fx.play(tone, ToneSynth.RATE, FX_VOLUME * loudness())
                delay(3500)
            }
        }
        val t0 = SystemClock.elapsedRealtime()
        val loading = async { EnginePreloader.loadAll(engines) }
        val ringMs = (settings.ringSeconds * 1000).toLong() + Random.nextLong(-500, 501)
        delay(ringMs.coerceIn(3000, 6500))
        // Si les moteurs ne sont pas prêts, on laisse sonner un peu plus (20 s maximum).
        val results = withTimeoutOrNull(20_000) { loading.await() } ?: emptyList<LoadResult>().also { loading.cancel() }
        ring.cancelAndJoin()
        fx.stop()
        _state.update {
            it.copy(
                loadResults = results,
                ringMillis = SystemClock.elapsedRealtime() - t0,
                demoMode = results.isEmpty() || results.any { r -> r.error != null },
            )
        }

        // 2. Décroché.
        fx.play(ToneSynth.pickupClick(), ToneSynth.RATE, FX_VOLUME * loudness())
        onConnected()

        // 3. Conversation.
        runDemoScript()

        // 4. Le Père Noël raccroche tout seul.
        delay(600)
        end(playBusyTone = true)
    }

    private suspend fun onConnected() {
        val connectedAt = SystemClock.elapsedRealtime()
        _state.update { it.copy(phase = CallPhase.CONNECTED) }
        val maxSeconds = settings.maxCallMinutes * 60
        clockJob = scope.launch {
            while (isActive) {
                val elapsed = ((SystemClock.elapsedRealtime() - connectedAt) / 1000).toInt()
                _state.update { it.copy(elapsedSeconds = elapsed, endingSoon = elapsed >= maxSeconds - 25) }
                // Filet de sécurité : si la conclusion déborde trop, on raccroche.
                if (elapsed >= maxSeconds + 20) {
                    end(playBusyTone = true)
                    break
                }
                delay(250)
            }
        }
        if (settings.ambienceEnabled && settings.ambienceVolume > 0f) {
            runCatching { ambience.start(settings.ambienceVolume * loudness()) }
        }
    }

    /** Déroulé simulé du jalon (a). */
    private suspend fun runDemoScript() {
        val kids = settings.children.filter { it.name.isNotBlank() }
        val child: Child? = kids.firstOrNull()
        when {
            kids.isEmpty() -> {
                say(Phrases.GREETING_NOBODY)
                listen()
            }
            kids.size == 1 -> {
                say(Phrases.greetingOne(kids[0].name))
                listen()
            }
            else -> {
                say(Phrases.greetingMany(kids.map { it.name }))
                listen()
                // En démo, on ne peut pas encore entendre : on suppose que c'est le premier enfant.
                say(Phrases.identified(kids[0].name))
            }
        }
        _state.update { it.copy(childName = child?.name) }

        for (step in listOf(CallStep.BEEN_GOOD, CallStep.GOOD_DEEDS, CallStep.WISH)) {
            if (_state.value.endingSoon) break
            say(Phrases.question(step, child))
            listen()
            say(Phrases.fallbackReaction(step, child))
        }
        if (_state.value.endingSoon) say(Phrases.WRAP_UP)
        say(Phrases.goodbye(child))
    }

    /** Jalon (a) : affiche la phrase le temps qu'il faudrait pour la dire lentement. */
    private suspend fun say(text: String) {
        _state.update { it.copy(subtitle = text, santaSpeaking = true, listening = false) }
        delay(700L + text.length * 65L)
        _state.update { it.copy(santaSpeaking = false) }
        delay(250)
    }

    /** Jalon (a) : simple pause pendant laquelle l'enfant peut répondre (personne n'écoute encore). */
    private suspend fun listen() {
        _state.update { it.copy(listening = true) }
        delay(4000)
        _state.update { it.copy(listening = false) }
    }

    private fun end(playBusyTone: Boolean) {
        if (ended) return
        ended = true
        clockJob?.cancel()
        mainJob?.cancel()
        fx.stop()
        ambience.stop()
        _state.update { it.copy(phase = CallPhase.ENDED, santaSpeaking = false, listening = false) }
        if (playBusyTone) {
            scope.launch {
                runCatching { fx.play(ToneSynth.busyTone(), ToneSynth.RATE, 0.7f * loudness()) }
                releaseResources()
            }
        } else {
            releaseResources()
        }
    }

    /**
     * Haut-parleur coupé = son plus doux, comme si on tenait le téléphone à l'oreille.
     * (Le vrai écouteur n'est accessible qu'en mode « appel téléphonique », muet sur HyperOS.)
     */
    private fun loudness() = if (_state.value.speakerOn) 1f else QUIET

    private fun releaseResources() {
        if (released) return
        released = true
        fx.stop()
        ambience.stop()
        engines.forEach { runCatching { it.release() } }
        audio.stop()
    }
}
