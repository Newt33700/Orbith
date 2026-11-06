package fr.famille.appelperenoel.scenario

import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.settings.Gender

/** Étapes du déroulé semi-guidé. */
enum class CallStep { IDENTIFY, BEEN_GOOD, GOOD_DEEDS, WISH, GOODBYE }

/**
 * Phrases écrites à l'avance. Elles servent pour les questions fixes,
 * et de phrases de secours quand le cerveau (LLM) est trop lent ou répond mal.
 */
object Phrases {

    fun greetingOne(name: String) = "Allô ? Ho ho ho ! $name, c'est bien toi qui m'appelles ?"

    fun greetingMany(names: List<String>): String {
        val list = if (names.size <= 1) names.joinToString() else names.dropLast(1).joinToString(", ") + " ou " + names.last()
        return "Allô ? Ho ho ho ! Qui m'appelle ? C'est $list ?"
    }

    const val GREETING_NOBODY = "Allô ? Ho ho ho ! Bonsoir, ici le Père Noël ! Comment tu t'appelles ?"

    fun identified(name: String) = "Ah, c'est toi, $name ! Quelle joie de t'entendre !"

    fun identifyRetry(names: List<String>) =
        "Oh, ma vieille oreille n'a pas bien entendu. Tu es ${names.dropLast(1).joinToString(", ")} ou ${names.last()} ?"

    fun question(step: CallStep, child: Child?): String = when (step) {
        CallStep.BEEN_GOOD -> "Dis-moi, est-ce que tu as été sage cette année ?"
        CallStep.GOOD_DEEDS -> "Et qu'est-ce que tu as fait de bien ? Tu as aidé à la maison, ou bien travaillé à l'école ?"
        CallStep.WISH -> "Et maintenant, dis-moi tout : qu'est-ce que tu aimerais pour Noël ?"
        else -> ""
    }

    /** Réactions de secours, neutres et toujours positives. */
    fun fallbackReaction(step: CallStep, child: Child?): String = when (step) {
        CallStep.BEEN_GOOD -> "Ho ho ho ! Mes lutins m'ont dit plein de belles choses sur toi !"
        CallStep.GOOD_DEEDS -> "Bravo ! Ça me fait chaud au cœur, tu sais."
        CallStep.WISH -> "Oh oh, quelle belle idée ! Je vais en parler à mes lutins, ils feront de leur mieux."
        else -> "Ho ho ho !"
    }

    fun goodbye(child: Child?): String =
        encourage(child) + " Allez, je dois retourner à l'atelier. Joyeux Noël ! Ho ho ho !"

    /** Encouragement de fin d'échange avec un enfant. */
    fun encourage(child: Child?): String {
        val kind = when (child?.gender) {
            Gender.BOY -> "gentil"
            Gender.GIRL -> "gentille"
            else -> "sage"
        }
        val name = child?.name?.let { ", $it" } ?: ""
        return "Continue d'être aussi $kind$name, je te surveille avec mes lutins !"
    }

    /** Au revoir final quand plusieurs enfants ont parlé. */
    fun goodbyeAll(count: Int): String {
        val all = if (count == 2) "à tous les deux" else "à tous"
        return "Allez, je dois retourner à l'atelier. Joyeux Noël $all ! Ho ho ho !"
    }

    /** Demande à parler au frère ou à la sœur. */
    fun askSibling(current: Child, next: Child) =
        "Dis-moi ${current.name}, est-ce que ${next.name} est à côté de toi ? " +
            "Passe-lui le téléphone, j'aimerais beaucoup lui parler !"

    fun siblingHello(next: Child) = "Allô ? C'est toi, ${next.name} ?"

    fun siblingIdentified(next: Child) = "Ho ho ho ! Bonjour ${next.name}, quelle joie de t'entendre !"

    fun siblingMissing(next: Child) =
        "Ce n'est pas grave ! Fais un gros bisou à ${next.name} de ma part."

    fun identifiedNobody(heard: Boolean) =
        if (heard) "Ho ho ho ! Quelle joie de t'entendre !" else "Ho ho ho ! Je t'entends un tout petit peu, ça me fait très plaisir !"

    const val ALLO_RETRY = "Allô ? Tu m'entends ? C'est le Père Noël !"

    const val ASK_AGE = "Dis-moi, tu as quel âge ?"

    /** Reformulation simple, après deux réponses incomprises. */
    fun simplified(step: CallStep): String = when (step) {
        CallStep.BEEN_GOOD -> "Tu as été sage ? Tu peux me dire oui ou non."
        CallStep.GOOD_DEEDS -> "Raconte-moi une chose gentille que tu as faite."
        CallStep.WISH -> "Quel cadeau tu aimerais ?"
        else -> "Tu peux répéter ?"
    }

    /** Après trois essais sans réponse, on passe à la suite sans insister. */
    fun noAnswer(step: CallStep, child: Child?): String = when (step) {
        CallStep.BEEN_GOOD -> "Ce n'est pas grave ! Mes lutins m'ont dit que tu étais quelqu'un de formidable."
        CallStep.GOOD_DEEDS -> "Je suis sûr que tu as fait plein de belles choses cette année."
        CallStep.WISH -> child?.wish?.takeIf { it.isNotBlank() }
            ?.let { "Mes lutins m'ont murmuré que tu rêves de $it. Chut, c'est notre secret !" }
            ?: "Ce n'est pas grave, tu pourras l'écrire dans ta lettre. Mes lutins la liront très attentivement !"
        else -> "Ho ho ho !"
    }

    /** Ramène doucement à la question après une réponse hors sujet. */
    fun bringBack(step: CallStep): String = when (step) {
        CallStep.BEEN_GOOD -> "Mais dis-moi, est-ce que tu as été sage cette année ?"
        CallStep.GOOD_DEEDS -> "Et alors, qu'est-ce que tu as fait de bien cette année ?"
        CallStep.WISH -> "Et pour Noël, qu'est-ce qui te ferait plaisir ?"
        else -> ""
    }

    fun offTopicFallback() = listOf(
        "Ho ho ho, c'est très intéressant, ça !",
        "Oh oh, tu en sais des choses !",
        "Ho ho ho, comme c'est amusant !",
    ).random()

    const val WRAP_UP = "Oh là là, mes rennes s'impatientent, je vais bientôt devoir y aller !"

    val fillers = listOf("Hmm, voyons voir…", "Oh oh, attends un peu…", "Hmm hmm…", "Ho ho, laisse-moi réfléchir…")

    val notUnderstood = listOf(
        "Oh, ma vieille oreille n'a pas bien entendu. Tu peux répéter ?",
        "Il y a du vent au pôle Nord ! Tu peux le redire plus fort ?",
    )
}
