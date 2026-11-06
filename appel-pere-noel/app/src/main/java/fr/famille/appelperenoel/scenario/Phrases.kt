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

    fun goodbye(child: Child?): String {
        val kind = when (child?.gender) {
            Gender.BOY -> "gentil"
            Gender.GIRL -> "gentille"
            else -> "sage"
        }
        val name = child?.name?.let { ", $it" } ?: ""
        return "Continue d'être aussi $kind$name, je te surveille avec mes lutins ! " +
            "Allez, je dois retourner à l'atelier. Joyeux Noël ! Ho ho ho !"
    }

    const val WRAP_UP = "Oh là là, mes rennes s'impatientent, je vais bientôt devoir y aller !"

    val fillers = listOf("Hmm, voyons voir…", "Oh oh, attends un peu…", "Hmm hmm…", "Ho ho, laisse-moi réfléchir…")

    val notUnderstood = listOf(
        "Oh, ma vieille oreille n'a pas bien entendu. Tu peux répéter ?",
        "Il y a du vent au pôle Nord ! Tu peux le redire plus fort ?",
    )
}
