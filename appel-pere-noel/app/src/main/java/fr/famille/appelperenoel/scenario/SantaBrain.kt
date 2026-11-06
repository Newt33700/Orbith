package fr.famille.appelperenoel.scenario

import fr.famille.appelperenoel.llm.GeminiLlm
import fr.famille.appelperenoel.llm.GemmaLlm
import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.settings.Gender

/** Une réplique de l'appel (Père Noël ou enfant), gardée pour donner le fil au cerveau. */
data class Line(val santa: Boolean, val text: String)

/** Ce qu'on attend du cerveau pour ce tour. */
enum class ReplyMode {
    /** Réagir, sans question. */
    REACT,
    /** Réagir puis poser UNE petite question de relance. */
    REACT_AND_ASK,
    /** Réagir à la réponse à la relance, puis conclure (sans question). */
    CLOSE,
    /** Réponse hors sujet : une phrase brève. */
    OFF_TOPIC,
}

/**
 * Le « cerveau » du Père Noël : fabrique le prompt, appelle Gemini (en ligne, si activé)
 * ou Gemma (local), puis nettoie et vérifie chaque phrase avant qu'elle soit dite.
 *
 * Les grandes questions sont posées par l'appli (voir [Conversation]) ; le cerveau réagit,
 * et peut poser une petite question de relance.
 */
class SantaBrain(
    private val llm: GemmaLlm,
    private val online: GeminiLlm,
    private val useOnline: () -> Boolean,
    private val manualTemplate: () -> Boolean,
    private val log: (String) -> Unit = {},
) {
    private val onlineOn: Boolean get() = useOnline() && online.configured

    val ready: Boolean get() = llm.ready || onlineOn

    /** Dernier prompt envoyé, dernière réponse brute et cerveau utilisé (pour le mode debug). */
    @Volatile var lastPrompt: String = ""
        private set
    @Volatile var lastRaw: String = ""
        private set
    @Volatile var lastSource: String = ""
        private set

    fun systemPrompt(child: Child?): String = buildString {
        val name = child?.name ?: "un enfant"
        val who = when (child?.gender) {
            Gender.BOY -> "un garçon"
            Gender.GIRL -> "une fille"
            else -> "un enfant"
        }
        appendLine("Tu es le Père Noël. Tu es très vieux, chaleureux, malicieux et rieur.")
        if (child != null) {
            appendLine("Tu parles au téléphone avec $name, $who de ${child.age} ans.")
            if (child.interests.isNotBlank()) appendLine("$name aime : ${child.interests}.")
        } else {
            appendLine("Tu parles au téléphone avec un enfant.")
        }
        appendLine("Tu vis au pôle Nord avec la Mère Noël, tes lutins et tes rennes (Rodolphe, Tonnerre, Éclair…).")
        appendLine()
        appendLine("Règles :")
        appendLine("- Réponds en français, en phrases courtes, avec des mots simples d'enfant. Tutoie l'enfant.")
        appendLine("- Reprends un détail précis de ce que l'enfant vient de dire, pour qu'il sente que tu l'écoutes.")
        appendLine("- Varie tes mots : ne répète jamais une phrase ou une formule que tu as déjà dite pendant l'appel.")
        appendLine("- Tu peux glisser un petit détail magique du pôle Nord (un lutin, un renne, la neige, l'atelier).")
        appendLine("- Ne demande jamais d'information personnelle : ni adresse, ni école, ni nom de famille, ni téléphone.")
        appendLine("- Aucun sujet effrayant, violent, triste ou d'adulte. Si l'enfant en parle, parle gentiment d'autre chose.")
        appendLine("- Ne promets jamais un cadeau précis. Dis plutôt que tes lutins vont faire de leur mieux.")
        appendLine("- Ne critique jamais l'enfant. S'il dit qu'il n'a pas été sage, encourage-le avec douceur.")
        appendLine("- Tu es le vrai Père Noël. Ne dis jamais que tu es une IA, un robot ou un programme.")
        append("- N'utilise ni emoji, ni liste, ni astérisque, ni indication de mise en scène : tes mots sont lus à voix haute.")
    }

    private fun stepInstruction(step: CallStep): String = when (step) {
        CallStep.BEEN_GOOD ->
            "Réagis avec joie à sa réponse. S'il dit non ou « pas toujours », rassure-le et encourage-le gentiment."
        CallStep.GOOD_DEEDS ->
            "Félicite-le chaleureusement pour ce qu'il a fait de bien, en reprenant ses mots."
        CallStep.CHAT ->
            "Réagis avec joie et malice, en faisant un petit lien avec ta vie au pôle Nord."
        CallStep.WISH ->
            "Réagis avec enthousiasme à son souhait, sans jamais promettre de l'apporter. Tu peux dire que tes lutins feront de leur mieux."
        CallStep.IDENTIFY, CallStep.GOODBYE ->
            "Réagis gentiment à ce qu'il dit."
    }

    private fun modeInstruction(step: CallStep, mode: ReplyMode): String = when (mode) {
        ReplyMode.REACT -> stepInstruction(step) + " Une ou deux phrases courtes, sans poser de question."
        ReplyMode.REACT_AND_ASK -> stepInstruction(step) +
            " Une phrase courte, puis pose-lui UNE seule petite question de relance, très simple, " +
            "sur un détail de ce qu'il vient de dire. Termine par cette question."
        ReplyMode.CLOSE ->
            "Réagis chaleureusement à sa réponse, en une ou deux phrases courtes. Ne pose pas de question."
        ReplyMode.OFF_TOPIC ->
            "Sa réponse n'a pas de rapport avec ta question : réponds-lui très brièvement et gentiment, en une seule phrase, sans question."
    }

    /** Partie « conversation » du prompt (le rôle est dans [systemPrompt]). */
    fun buildPrompt(child: Child?, step: CallStep, transcript: List<Line>, mode: ReplyMode, maxLines: Int): String {
        val name = child?.name ?: "L'enfant"
        return buildString {
            appendLine("Voici l'appel jusqu'ici :")
            transcript.takeLast(maxLines).forEach { appendLine(if (it.santa) "Père Noël : ${it.text}" else "$name : ${it.text}") }
            appendLine()
            appendLine(modeInstruction(step, mode))
            append("Réponds maintenant, uniquement avec les mots du Père Noël.")
        }
    }

    /**
     * Fait réagir le Père Noël. La génération se fait en flux : chaque phrase valide est
     * transmise à [onSentence] dès qu'elle est complète, pour que le Père Noël commence à parler
     * pendant que la suite se calcule. Une phrase douteuse arrête tout (la suite serait incohérente).
     */
    suspend fun react(
        child: Child?,
        step: CallStep,
        transcript: List<Line>,
        mode: ReplyMode,
        onSentence: (String) -> Unit,
    ) {
        val maxSentences = when (mode) {
            ReplyMode.OFF_TOPIC -> 1
            ReplyMode.REACT_AND_ASK -> 3
            else -> 2
        }
        val allowQuestion = mode == ReplyMode.REACT_AND_ASK
        val system = systemPrompt(child)
        lastRaw = ""
        var emitted = 0


        if (onlineOn) {
            val prompt = buildPrompt(child, step, transcript, mode, maxLines = 16)
            lastPrompt = system + "\n\n" + prompt
            lastSource = "Gemini"
            val c = SentenceCollector(maxSentences, allowQuestion) { emitted++; onSentence(it) }
            try {
                val full = online.generate(
                    system,
                    prompt,
                    onText = { lastRaw = it; c.feed(it, final = false) },
                    stopWhen = { c.done },
                )
                lastRaw = full
                c.feed(full, final = true)
                return
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                log("Cerveau en ligne indisponible : ${e.message}")
                if (emitted > 0 || !llm.ready) return
            }
        }
        if (!llm.ready) return

        val body = system + "\n\n" + buildPrompt(child, step, transcript, mode, maxLines = 6)
        val prompt = if (manualTemplate()) "<start_of_turn>user\n$body<end_of_turn>\n<start_of_turn>model\n" else body
        lastPrompt = prompt
        lastSource = "Gemma"
        val c = SentenceCollector(maxSentences, allowQuestion) { emitted++; onSentence(it) }
        val full = llm.generate(
            prompt,
            temperature = 0.8f,
            onText = { lastRaw = it; c.feed(it, final = false) },
            stopWhen = { text -> c.done || cleanup(text).length > 300 || looksLikeNewSpeaker(text) },
        )
        lastRaw = full
        c.feed(full, final = true)
    }

    /** Découpe le texte reçu en flux en phrases complètes, vérifiées une par une. */
    private class SentenceCollector(
        private val maxSentences: Int,
        private val allowQuestion: Boolean,
        private val emit: (String) -> Unit,
    ) {
        private var consumed = 0
        private var emitted = 0
        @Volatile var done = false
            private set
        private val regex = Regex("[^.!?…]*[.!?…]+[»\"]?")

        @Synchronized
        fun feed(text: String, final: Boolean) {
            if (done) return
            val clean = cleanup(text)
            if (consumed > clean.length) consumed = clean.length
            val rest = clean.substring(consumed)
            var offset = 0
            val found = ArrayList<String>()
            for (m in regex.findAll(rest)) {
                found += m.value.trim()
                offset = m.range.last + 1
            }
            if (final) {
                val tail = rest.substring(offset).trim()
                if (tail.length > 3 && emitted + found.size == 0) {
                    found += "$tail."
                    offset = rest.length
                }
            }
            consumed += offset
            for (s in found) {
                if (s.isBlank()) continue
                if (!isSafe(s)) {
                    done = true
                    return
                }
                val question = s.trimEnd().endsWith("?")
                if (question && !allowQuestion) {
                    // Une question en trop laisserait l'enfant sans réponse : on s'arrête là.
                    done = true
                    return
                }
                emitted++
                emit(s)
                if (question || emitted >= maxSentences) {
                    done = true
                    return
                }
            }
        }
    }

    companion object {
        /** Le modèle se met à écrire la réplique de l'enfant : il faut s'arrêter. */
        private fun looksLikeNewSpeaker(raw: String): Boolean =
            Regex("\\n\\s*[A-ZÉÈa-zéè' ]{2,20}\\s*:").containsMatchIn(raw) || raw.contains("<end_of_turn>") ||
                raw.contains("<start_of_turn>")

        /** Retire tout ce qui ne doit pas être lu à voix haute. */
        fun cleanup(raw: String): String {
            var s = raw
            s = s.substringBefore("<end_of_turn>").replace("<start_of_turn>model", "").replace("<start_of_turn>", "")
            // Couper si le modèle continue le dialogue (« Lilian : … »).
            Regex("\\n\\s*[A-ZÉÈa-zéè' ]{2,20}\\s*:").find(s)?.let { s = s.substring(0, it.range.first) }
            s = s.replace(Regex("\\*[^*]*\\*"), " ") // *rit*
                .replace(Regex("\\([^)]*\\)"), " ") // (rire)
                .replace(Regex("\\[[^]]*]"), " ")
                .replace(Regex("^\\s*(Père Noël|Pere Noel|Santa)\\s*:\\s*", RegexOption.IGNORE_CASE), "")
                .replace(Regex("[\"«»“”]"), "")
                .replace(Regex("[\\p{So}\\p{Cs}#_~`|<>]"), " ") // emojis et symboles
                .replace(Regex("\\s+"), " ")
                .trim()
            return s
        }

        private val forbidden = listOf(
            // Hors personnage
            "intelligence artificielle", "\\bia\\b", "robot", "programme", "modèle de langage",
            "assistant virtuel", "chatbot", "je ne suis pas (le )?(vrai )?père noël", "n'existe pas",
            "gemma", "google",
            // Infos personnelles
            "adresse", "nom de famille", "numéro de téléphone", "ton téléphone", "où (tu habites|habites-tu)",
            "quelle école", "ton école", "mot de passe",
            // Sujets sombres ou adultes
            "\\bmort", "mourir", "tuer", "\\bsang\\b", "\\barme", "fusil", "couteau", "guerre", "bombe", "drogue",
            "alcool", "bière", "\\bvin\\b", "cigarette", "sexe", "\\bnue?s?\\b", "violence", "frapper", "monstre",
            "cauchemar", "diable", "enfer", "suicide", "malade", "cancer", "divorce",
            // Promesses de cadeau
            "je (te )?promets", "promis", "tu (l')?auras", "tu vas (l')?avoir", "je (vais )?t'apporter(ai)?",
            "je t'apporterai", "sera sous (le|ton) sapin", "c'est sûr que tu", "tu recevras",
            // Critiques
            "méchant", "vilain", "pas de cadeau", "charbon", "puni",
        ).map { Regex(it, RegexOption.IGNORE_CASE) }

        fun isSafe(sentence: String): Boolean {
            val s = sentence.trim()
            if (s.length < 3 || s.length > 220) return false
            // Le petit modèle répond parfois en anglais : on refuse.
            if (Regex("\\b(the|you|and|your|christmas|santa|hello)\\b", RegexOption.IGNORE_CASE).containsMatchIn(s)) return false
            return forbidden.none { it.containsMatchIn(s) }
        }
    }
}
