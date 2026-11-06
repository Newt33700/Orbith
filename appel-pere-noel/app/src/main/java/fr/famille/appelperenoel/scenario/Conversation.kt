package fr.famille.appelperenoel.scenario

import android.os.SystemClock
import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.stt.SttResult
import fr.famille.appelperenoel.tts.SpeechTiming
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Mesures d'un tour de parole (affichées en mode debug). */
data class TurnMetrics(
    val step: CallStep,
    val heard: String,
    val typed: Boolean,
    /** Fin de phrase détectée → texte final (Vosk). */
    val sttMs: Long,
    /** Fin de phrase → première phrase du cerveau prête (-1 si phrase de secours). */
    val llmMs: Long,
    /** Synthèse vocale de la première phrase. */
    val ttsMs: Long,
    /** Fin de phrase de l'enfant → début de la vraie réponse (objectif < 4 s). */
    val responseMs: Long,
    val filler: Boolean,
    val fallback: Boolean,
    val reply: String,
)

/** Ce dont la conversation a besoin ; fourni par l'écran d'appel. */
interface CallIo {
    suspend fun say(text: String, goodbye: Boolean = false): SpeechTiming
    suspend fun sayFiller()
    suspend fun listen(maxWaitMs: Long = 8_000): SttResult
    /** Démarre le compteur de durée max pour un nouvel enfant. */
    fun startChildSegment()
    fun endingSoon(): Boolean
    fun onChildIdentified(child: Child?)
    fun onTurn(metrics: TurnMetrics)
    fun log(line: String)
}

/**
 * Machine à états du déroulé semi-guidé :
 * décroché / identification → sage ? → bonne action → souhait → au revoir.
 *
 * Les questions sont fixes (écrites à l'avance) ; le cerveau ne fait que réagir aux réponses.
 * Si le cerveau est absent, trop lent ou répond mal, on dit une phrase de secours.
 */
class Conversation(
    private val children: List<Child>,
    private val brain: SantaBrain,
    private val io: CallIo,
    private val llmTimeoutMs: () -> Long,
    /** Demander à parler aux frères et sœurs après le premier enfant. */
    private val askSiblings: Boolean = true,
) {
    private val history = ArrayList<Exchange>()

    suspend fun run() {
        io.startChildSegment()
        var child = identify()
        val spoken = ArrayList<Child>()

        while (true) {
            io.onChildIdentified(child)
            history.clear()
            interview(child)
            child?.let { spoken += it }

            // Frère ou sœur qui n'a pas encore parlé ?
            val kids = children.filter { it.name.isNotBlank() }
            val next = if (askSiblings && child != null) kids.firstOrNull { k -> spoken.none { it.id == k.id } } else null
            if (child == null || next == null) break

            io.say(Phrases.encourage(child))
            io.say(Phrases.askSibling(child, next))
            val sibling = handOver(next, kids, spoken)
            if (sibling == null) {
                io.say(Phrases.siblingMissing(next))
                break
            }
            io.startChildSegment() // la durée max repart pour chaque enfant
            child = sibling
        }

        if (spoken.size >= 2) {
            io.say(Phrases.encourage(child))
            io.say(Phrases.goodbyeAll(spoken.size), goodbye = true)
        } else {
            io.say(Phrases.goodbye(child), goodbye = true)
        }
    }

    /** Les trois questions pour un enfant. */
    private suspend fun interview(child: Child?) {
        for (step in listOf(CallStep.BEEN_GOOD, CallStep.GOOD_DEEDS, CallStep.WISH)) {
            if (io.endingSoon()) break
            askAndReact(step, child)
        }
        if (io.endingSoon()) io.say(Phrases.WRAP_UP)
    }

    /**
     * Le téléphone passe de main en main : on laisse le temps, puis on vérifie qui parle.
     * Renvoie l'enfant qui a pris le téléphone, ou null si personne n'a répondu.
     */
    private suspend fun handOver(expected: Child, kids: List<Child>, spoken: List<Child>): Child? {
        // Temps de passer le téléphone (ce qui est dit pendant ce temps est ignoré).
        io.listen(maxWaitMs = 6_000)
        io.say(Phrases.siblingHello(expected))
        for (attempt in 0 until 2) {
            val r = io.listen(maxWaitMs = 8_000)
            if (r.text.isBlank()) {
                if (attempt == 0) io.say(Phrases.ALLO_RETRY)
                continue
            }
            val remaining = kids.filter { k -> spoken.none { it.id == k.id } }
            val who = TextUtils.matchChild(r.text, remaining) ?: expected
            io.say(Phrases.siblingIdentified(who))
            return who
        }
        return null
    }

    // ---------------------------------------------------------------- Identification

    private suspend fun identify(): Child? {
        val kids = children.filter { it.name.isNotBlank() }
        when (kids.size) {
            0 -> {
                io.say(Phrases.GREETING_NOBODY)
                val r = io.listen()
                io.say(Phrases.identifiedNobody(r.text.isNotBlank()))
                return null
            }
            1 -> {
                val kid = kids[0]
                io.say(Phrases.greetingOne(kid.name))
                var r = io.listen()
                if (r.text.isBlank()) {
                    io.say(Phrases.ALLO_RETRY)
                    r = io.listen()
                }
                io.say(Phrases.identified(kid.name))
                return kid
            }
            else -> {
                io.say(Phrases.greetingMany(kids.map { it.name }))
                for (attempt in 0 until 3) {
                    val r = io.listen()
                    val found = TextUtils.matchChild(r.text, kids) ?: TextUtils.matchChildByAge(r.text, kids)
                    io.log("Identification : « ${r.text} » → ${found?.name ?: "?"}")
                    if (found != null) {
                        io.say(Phrases.identified(found.name))
                        return found
                    }
                    when (attempt) {
                        0 -> io.say(Phrases.identifyRetry(kids.map { it.name }))
                        1 -> io.say(Phrases.ASK_AGE)
                    }
                }
                io.say(Phrases.identifiedNobody(true))
                return null
            }
        }
    }

    // ---------------------------------------------------------------- Questions

    private suspend fun askAndReact(step: CallStep, child: Child?) {
        var question = Phrases.question(step, child)
        io.say(question)
        var misses = 0
        var broughtBack = false
        while (true) {
            if (io.endingSoon()) return
            val r = io.listen()
            if (r.text.isBlank()) {
                misses++
                when (misses) {
                    1 -> {
                        question = Phrases.notUnderstood.random()
                        io.say(question)
                    }
                    2 -> {
                        // Deux fois rien compris : on reformule plus simplement.
                        question = Phrases.simplified(step)
                        io.say(question)
                    }
                    else -> {
                        io.say(Phrases.noAnswer(step, child))
                        return
                    }
                }
                continue
            }
            val offTopic = step == CallStep.BEEN_GOOD && !TextUtils.looksLikeYesNo(r.text) && !broughtBack
            react(step, child, question, r, offTopic)
            history += Exchange(question, r.text)
            if (offTopic) {
                // Réponse hors sujet : on a répondu brièvement, on ramène doucement à la question.
                broughtBack = true
                question = Phrases.bringBack(step)
                io.say(question)
                continue
            }
            return
        }
    }

    private suspend fun react(step: CallStep, child: Child?, question: String, heard: SttResult, offTopic: Boolean) {
        val t0 = SystemClock.elapsedRealtime()
        val fallbackText = if (offTopic) Phrases.offTopicFallback() else Phrases.fallbackReaction(step, child)

        if (!brain.ready) {
            val timing = io.say(fallbackText)
            io.onTurn(TurnMetrics(step, heard.text, heard.typed, heard.finalizeMs, -1, timing.synthMs, timing.startedAt - t0, false, true, fallbackText))
            return
        }

        val prompt = brain.buildPrompt(child, step, question, heard.text, history, offTopic)
        val sentences = Channel<String>(Channel.UNLIMITED)
        coroutineScope {
            val generation = launch(Dispatchers.Default) {
                try {
                    brain.react(prompt, maxSentences = if (offTopic) 1 else 2) { sentences.trySend(it) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    io.log("Cerveau en erreur : ${e.message}")
                } finally {
                    sentences.close()
                }
            }
            val first = async { sentences.receiveCatching().getOrNull() }

            // Si le cerveau tarde, un petit « Hmm, voyons voir… » masque l'attente.
            var filler = false
            withTimeoutOrNull(FILLER_DELAY_MS) { first.await() }
            if (!first.isCompleted) {
                io.sayFiller()
                filler = true
            }
            val remaining = (llmTimeoutMs() - (SystemClock.elapsedRealtime() - t0)).coerceAtLeast(300)
            val s1 = withTimeoutOrNull(remaining) { first.await() }
            val llmMs = SystemClock.elapsedRealtime() - t0

            if (s1 == null) {
                generation.cancel()
                first.cancel()
                io.log("Phrase de secours (cerveau ${if (first.isCompleted) "hors sujet / refusé" else "trop lent"}) — brut : ${brain.lastRaw.take(160)}")
                val timing = io.say(fallbackText)
                io.onTurn(TurnMetrics(step, heard.text, heard.typed, heard.finalizeMs, -1, timing.synthMs, timing.startedAt - t0, filler, true, fallbackText))
                return@coroutineScope
            }

            val timing = io.say(s1)
            io.onTurn(TurnMetrics(step, heard.text, heard.typed, heard.finalizeMs, llmMs, timing.synthMs, timing.startedAt - t0, filler, false, s1))
            val s2 = withTimeoutOrNull(SECOND_SENTENCE_WAIT_MS) { sentences.receiveCatching().getOrNull() }
            if (s2 != null) io.say(s2)
            generation.cancel()
        }
    }

    private companion object {
        const val FILLER_DELAY_MS = 900L
        const val SECOND_SENTENCE_WAIT_MS = 2500L
    }
}
