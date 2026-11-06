package fr.famille.appelperenoel.scenario

import fr.famille.appelperenoel.llm.GemmaLlm
import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.settings.Gender

/** Un échange de la conversation, gardé pour donner un peu de contexte au cerveau. */
data class Exchange(val santa: String, val child: String)

/**
 * Le « cerveau » du Père Noël : fabrique le prompt, appelle Gemma,
 * puis nettoie et vérifie chaque phrase avant qu'elle soit dite.
 *
 * Le cerveau ne fait que RÉAGIR aux réponses de l'enfant : les questions
 * sont posées par l'appli (voir [Conversation]).
 */
class SantaBrain(
    private val llm: GemmaLlm,
    private val manualTemplate: () -> Boolean,
) {
    val ready: Boolean get() = llm.ready

    /** Dernier prompt envoyé et dernière réponse brute (pour le mode debug). */
    @Volatile var lastPrompt: String = ""
        private set
    @Volatile var lastRaw: String = ""
        private set

    fun systemPrompt(child: Child?): String = buildString {
        val name = child?.name ?: "un enfant"
        val who = when (child?.gender) {
            Gender.BOY -> "un garçon"
            Gender.GIRL -> "une fille"
            else -> "un enfant"
        }
        appendLine("Tu es le Père Noël. Tu es très vieux, chaleureux et rieur, et tu parles lentement.")
        if (child != null) {
            appendLine("Tu parles au téléphone avec $name, $who de ${child.age} ans.")
            if (child.interests.isNotBlank()) appendLine("$name aime : ${child.interests}.")
        } else {
            appendLine("Tu parles au téléphone avec un enfant.")
        }
        appendLine()
        appendLine("Règles :")
        appendLine("- Réponds en français, en 1 ou 2 phrases courtes, avec des mots simples d'enfant. Tutoie l'enfant.")
        appendLine("- Ne demande jamais d'information personnelle : ni adresse, ni école, ni nom de famille, ni téléphone.")
        appendLine("- Aucun sujet effrayant, violent, triste ou d'adulte. Si l'enfant en parle, parle gentiment d'autre chose : les rennes, les lutins, la neige.")
        appendLine("- Ne promets jamais un cadeau précis. Dis plutôt que tes lutins vont faire de leur mieux.")
        appendLine("- Ne critique jamais l'enfant. S'il dit qu'il n'a pas été sage, encourage-le avec douceur.")
        appendLine("- Tu es le vrai Père Noël. Ne dis jamais que tu es une IA, un robot ou un programme. Si on te demande si tu es vraiment le Père Noël, réponds avec magie et malice.")
        appendLine("- N'utilise ni emoji, ni liste, ni astérisque, ni indication de mise en scène : tes mots sont lus à voix haute.")
        append("- Ne pose pas de nouvelle question.")
    }

    private fun stepInstruction(step: CallStep, offTopic: Boolean): String {
        val base = when (step) {
            CallStep.BEEN_GOOD ->
                "Réagis avec joie à sa réponse. S'il dit non ou « pas toujours », rassure-le et encourage-le gentiment."
            CallStep.GOOD_DEEDS ->
                "Félicite-le chaleureusement pour ce qu'il a fait de bien, en reprenant ses mots."
            CallStep.WISH ->
                "Réagis avec enthousiasme à son souhait, sans jamais promettre de l'apporter. Tu peux dire que tes lutins feront de leur mieux."
            CallStep.IDENTIFY, CallStep.GOODBYE ->
                "Réagis gentiment à ce qu'il dit."
        }
        return if (offTopic) {
            "Sa réponse n'a pas de rapport avec ta question : réponds-lui très brièvement et gentiment, en une seule phrase."
        } else {
            base
        }
    }

    fun buildPrompt(
        child: Child?,
        step: CallStep,
        question: String,
        answer: String,
        history: List<Exchange>,
        offTopic: Boolean,
    ): String {
        val name = child?.name ?: "L'enfant"
        val body = buildString {
            appendLine(systemPrompt(child))
            appendLine()
            if (history.isNotEmpty()) {
                appendLine("Ce que vous vous êtes dit juste avant :")
                history.takeLast(2).forEach {
                    appendLine("Père Noël : ${it.santa}")
                    appendLine("$name : ${it.child}")
                }
                appendLine()
            }
            appendLine("Le Père Noël vient de demander : « $question »")
            appendLine("$name répond : « $answer »")
            appendLine()
            appendLine(stepInstruction(step, offTopic))
            append("Réponds maintenant, uniquement avec les mots du Père Noël.")
        }
        return if (manualTemplate()) {
            "<start_of_turn>user\n$body<end_of_turn>\n<start_of_turn>model\n"
        } else {
            body
        }
    }

    /**
     * Fait réagir le Père Noël. La génération se fait en flux : chaque phrase valide est
     * transmise à [onSentence] dès qu'elle est complète, pour que le Père Noël commence à parler
     * pendant que la suite se calcule. Au maximum [maxSentences] phrases ; une phrase douteuse
     * arrête tout (la suite serait incohérente).
     */
    suspend fun react(
        prompt: String,
        maxSentences: Int = 2,
        onSentence: (String) -> Unit,
    ) {
        lastPrompt = prompt
        lastRaw = ""
        var emitted = 0
        var consumed = 0
        var blocked = false
        val regex = Regex("[^.!?…]*[.!?…]+[»\"]?")

        fun handle(text: String, final: Boolean) {
            if (blocked || emitted >= maxSentences) return
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
                if (emitted >= maxSentences) return
                if (!isSafe(s)) {
                    blocked = true
                    return
                }
                emitted++
                onSentence(s)
            }
        }

        val full = llm.generate(
            prompt,
            onText = { text ->
                lastRaw = text
                handle(text, final = false)
            },
            stopWhen = { text ->
                val clean = cleanup(text)
                sentenceCount(clean) >= maxSentences || clean.length > 260 || looksLikeNewSpeaker(text)
            },
        )
        lastRaw = full
        handle(full, final = true)
    }

    companion object {
        private fun sentenceCount(s: String) = Regex("[.!?…]+").findAll(s).count()

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
