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
import fr.famille.appelperenoel.llm.GeminiLlm
import fr.famille.appelperenoel.llm.GemmaLlm
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.scenario.CallIo
import fr.famille.appelperenoel.scenario.Conversation
import fr.famille.appelperenoel.scenario.Phrases
import fr.famille.appelperenoel.scenario.SantaBrain
import fr.famille.appelperenoel.scenario.TurnMetrics
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.settings.papyVoice
import fr.famille.appelperenoel.settings.respellNames
import fr.famille.appelperenoel.stt.SttResult
import fr.famille.appelperenoel.stt.VoskStt
import fr.famille.appelperenoel.tts.AndroidTts
import fr.famille.appelperenoel.tts.ElevenLabsTts
import fr.famille.appelperenoel.tts.PiperTts
import fr.famille.appelperenoel.tts.SpeechSynth
import fr.famille.appelperenoel.tts.SantaVoice
import fr.famille.appelperenoel.tts.SpeechTiming
import kotlinx.coroutines.CancellationException
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
import kotlinx.coroutines.withContext
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
    val childName: String? = null,
    /** Transcription en cours (mode debug). */
    val partial: String = "",
    val lastTurn: TurnMetrics? = null,
    val log: List<String> = emptyList(),
)

/**
 * Pilote un appel du début à la fin : sonnerie (avec chargement des moteurs en parallèle),
 * décroché, conversation, durée maximale, raccrochage et libération de la mémoire.
 */
class CallController(
    private val context: Context,
    private val settings: AppSettings,
    models: ModelRepository,
) : CallIo {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(CallUiState(speakerOn = settings.speakerByDefault))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    private val audio = CallAudioSession(context) { scope.launch { end(playBusyTone = false) } }
    private val fx = PcmPlayer()
    private val speechPlayer = PcmPlayer()
    private val ambience = AmbiencePlayer(context)

    private val stt = VoskStt(models)
    private val piper = PiperTts(
        models,
        voiceName = { settings.voiceName },
        speaker = { settings.voiceSpeaker },
        expressiveness = { settings.expressiveness },
    )
    private val llm = GemmaLlm(context, models) { settings.llmGpu }
    private val androidTts = AndroidTts(context) { settings.androidVoice }
    private val eleven = ElevenLabsTts(
        context,
        apiKey = { settings.elevenKey },
        voiceId = { settings.elevenVoiceId },
        model = { settings.elevenModel },
        fallback = { androidTts.takeIf { it.ready } ?: piper.takeIf { it.ready } },
        onError = { log(it) },
    )

    /** Moteur de voix effectivement chargé (Android ou Piper). */
    @Volatile
    private var activeSynth: SpeechSynth? = null
    private val voice = SantaVoice(context, { activeSynth }, settings.papyVoice(), speechPlayer) {
        respellNames(it, settings.children)
    }
    private val gemini = GeminiLlm(apiKey = { settings.geminiKey }, model = { settings.geminiModel })
    private val brain = SantaBrain(
        llm,
        gemini,
        useOnline = { settings.onlineBrain },
        manualTemplate = { settings.llmManualTemplate },
        log = { log(it) },
    )

    private val children = settings.children.filter { it.name.isNotBlank() }
    private val greeting = when (children.size) {
        0 -> Phrases.GREETING_NOBODY
        1 -> Phrases.greetingOne(children[0].name)
        else -> Phrases.greetingMany(children.map { it.name })
    }

    /** La voix + le pré-calcul des phrases qui doivent partir instantanément. */
    private val voiceEngine = object : Engine {
        override val label = "Voix"
        override suspend fun load() {
            // Moteur choisi par les parents ; s'il échoue (pas de voix française, etc.), on essaie l'autre.
            val order: List<Pair<Engine, SpeechSynth>> = when (settings.voiceEngine) {
                "piper" -> listOf(piper to piper, androidTts to androidTts)
                "eleven" -> listOf(eleven to eleven, androidTts to androidTts, piper to piper)
                else -> listOf(androidTts to androidTts, piper to piper)
            }
            var lastError: Exception? = null
            for ((engine, synth) in order) {
                try {
                    engine.load()
                    activeSynth = synth
                    log("Voix utilisée : ${engine.label}")
                    break
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    log("${engine.label} indisponible : ${e.message}")
                    lastError = e
                }
            }
            if (activeSynth == null) throw lastError ?: IllegalStateException("aucune voix")
            if (activeSynth === eleven) {
                // Voix de secours si ElevenLabs échoue en cours d'appel (quota épuisé, réseau).
                runCatching { androidTts.load() }.onFailure { log("Voix de secours indisponible : ${it.message}") }
            }
            voice.warmUp(listOf(greeting) + Phrases.fillers)
        }
        override fun release() {
            eleven.release()
            androidTts.release()
            piper.release()
        }
    }
    /** Avec le cerveau en ligne, Gemma ne sert que de secours : il se charge après le décroché, sans faire attendre. */
    private val onlineFirst = settings.onlineBrain && settings.geminiKey.isNotBlank()
    private val engines: List<Engine> = if (onlineFirst) listOf(stt, voiceEngine) else listOf(stt, voiceEngine, llm)

    @Volatile
    private var segmentStart = 0L
    private var mainJob: Job? = null
    private var clockJob: Job? = null
    private var started = false
    private var ended = false
    @Volatile
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
        speechPlayer.setVolume(voiceVolume())
        ambience.setVolume(ambienceVolume(listening = _state.value.listening))
    }

    /** L'enfant raccroche. */
    fun hangUp() = end(playBusyTone = false)

    /** Mode debug : phrase tapée au clavier à la place du micro. */
    fun submitTyped(text: String) {
        if (text.isNotBlank()) stt.submitTyped(text.trim())
    }

    /** À appeler quand l'écran disparaît : garantit que tout est libéré. */
    fun dispose() {
        end(playBusyTone = false)
        releaseResources()
        scope.cancel()
    }

    private suspend fun runCall() = coroutineScope {
        // 1. Sonnerie + chargement des moteurs en parallèle (le démarrage devient invisible).
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
        // Pas encore prêts : on laisse sonner un peu plus (25 s maximum, puis on décroche quand même).
        val results = withTimeoutOrNull(25_000) { loading.await() } ?: emptyList<LoadResult>().also { loading.cancel() }
        ring.cancelAndJoin()
        fx.stop()
        _state.update { it.copy(loadResults = results, ringMillis = SystemClock.elapsedRealtime() - t0) }
        results.forEach { r -> log("Chargement ${r.label} : ${r.millis} ms" + (r.error?.let { e -> " — $e" } ?: "")) }

        if (onlineFirst) {
            launch(Dispatchers.IO) {
                runCatching { llm.load() }.onFailure { log("Gemma (secours) non chargé : ${it.message}") }
                if (released) runCatching { llm.release() } // appel fini pendant le chargement
            }
        }

        // 2. Décroché.
        fx.play(ToneSynth.pickupClick(), ToneSynth.RATE, FX_VOLUME * loudness())
        onConnected()

        // 3. Conversation.
        try {
            Conversation(
                children = children,
                brain = brain,
                io = this@CallController,
                llmTimeoutMs = { settings.llmTimeoutMs.toLong() },
                askSiblings = settings.askSiblings,
                followUps = { settings.followUps },
            ).run()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log("Erreur pendant la conversation : ${e.message}")
            runCatching { say(Phrases.goodbye(null), goodbye = true) }
        }

        // 4. Le Père Noël raccroche tout seul.
        delay(600)
        end(playBusyTone = true)
    }

    private suspend fun onConnected() {
        val connectedAt = SystemClock.elapsedRealtime()
        segmentStart = connectedAt
        _state.update { it.copy(phase = CallPhase.CONNECTED) }
        // Durée max PAR ENFANT : le compteur repart quand le téléphone passe au frère ou à la sœur.
        val maxSeconds = settings.maxCallMinutes * 60
        clockJob = scope.launch {
            while (isActive) {
                val now = SystemClock.elapsedRealtime()
                val elapsed = ((now - connectedAt) / 1000).toInt()
                val segment = ((now - segmentStart) / 1000).toInt()
                _state.update { it.copy(elapsedSeconds = elapsed, endingSoon = segment >= maxSeconds - 30) }
                // Filet de sécurité : si la conclusion déborde trop, on raccroche.
                if (segment >= maxSeconds + 45) {
                    end(playBusyTone = true)
                    break
                }
                delay(250)
            }
        }
        if (settings.ambienceEnabled && settings.ambienceVolume > 0f) {
            runCatching { ambience.start(ambienceVolume(listening = false)) }
        }
    }

    // ------------------------------------------------------------------ CallIo

    override suspend fun say(text: String, goodbye: Boolean): SpeechTiming {
        _state.update { it.copy(subtitle = text, santaSpeaking = true, listening = false) }
        log("Père Noël : $text")
        try {
            return voice.speak(text, voiceVolume(), goodbye)
        } finally {
            _state.update { it.copy(santaSpeaking = false) }
        }
    }

    override suspend fun sayFiller() {
        val filler = Phrases.pick(Phrases.fillers)
        _state.update { it.copy(subtitle = filler, santaSpeaking = true) }
        try {
            voice.speak(filler, voiceVolume())
        } finally {
            _state.update { it.copy(santaSpeaking = false) }
        }
    }

    override fun prefetch(text: String) {
        voice.prefetch(scope, text)
    }

    override fun startChildSegment() {
        segmentStart = SystemClock.elapsedRealtime()
        _state.update { it.copy(endingSoon = false) }
    }

    override suspend fun listen(maxWaitMs: Long): SttResult {
        // Le micro ne s'ouvre qu'ici, jamais pendant que le Père Noël parle.
        _state.update { it.copy(listening = true, partial = "") }
        ambience.setVolume(ambienceVolume(listening = true))
        return try {
            val r = try {
                stt.listen(
                    silenceMs = settings.silenceMs,
                    maxWaitMs = maxWaitMs,
                    onPartial = { p -> _state.update { it.copy(partial = p) } },
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log("Micro : ${e.message}")
                withContext(Dispatchers.Default) { delay(minOf(4000L, maxWaitMs)) }
                SttResult("")
            }
            log("Enfant${if (r.typed) " (clavier)" else ""} : « ${r.text} »")
            r
        } finally {
            _state.update { it.copy(listening = false) }
            ambience.setVolume(ambienceVolume(listening = false))
        }
    }

    override fun endingSoon(): Boolean = _state.value.endingSoon

    override fun onChildIdentified(child: Child?) {
        _state.update { it.copy(childName = child?.name) }
    }

    override fun onTurn(metrics: TurnMetrics) {
        _state.update { it.copy(lastTurn = metrics) }
        log(
            "⏱ STT ${metrics.sttMs} ms · cerveau ${if (metrics.llmMs >= 0) "${metrics.llmMs} ms" else "secours"} · " +
                "voix ${metrics.ttsMs} ms · réponse ${metrics.responseMs} ms" + if (metrics.filler) " (avec « hmm »)" else "",
        )
    }

    override fun log(line: String) {
        _state.update { it.copy(log = (it.log + line).takeLast(80)) }
    }

    // ------------------------------------------------------------------ Volumes

    /** Haut-parleur coupé = son plus doux, comme si on tenait le téléphone à l'oreille. */
    private fun loudness() = if (_state.value.speakerOn) 1f else QUIET
    private fun voiceVolume() = settings.santaVolume * loudness()
    private fun ambienceVolume(listening: Boolean) =
        settings.ambienceVolume * loudness() * if (listening) 0.5f else 1f

    // ------------------------------------------------------------------ Fin d'appel

    private fun end(playBusyTone: Boolean) {
        if (ended) return
        ended = true
        clockJob?.cancel()
        mainJob?.cancel()
        fx.stop()
        speechPlayer.stop()
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

    private fun releaseResources() {
        if (released) return
        released = true
        fx.stop()
        speechPlayer.stop()
        ambience.stop()
        audio.stop()
        // Les moteurs (plusieurs centaines de Mo) sont libérés hors du fil principal,
        // une fois la génération en cours éventuellement terminée.
        CoroutineScope(Dispatchers.IO).launch {
            (engines + llm).distinct().forEach { runCatching { it.release() } }
        }
    }
}
