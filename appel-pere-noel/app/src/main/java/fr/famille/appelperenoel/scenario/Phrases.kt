package fr.famille.appelperenoel.scenario

import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.settings.Gender

/** Étapes du déroulé semi-guidé. */
enum class CallStep { IDENTIFY, BEEN_GOOD, GOOD_DEEDS, CHAT, WISH, GOODBYE }

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

    private val recent = ArrayDeque<String>()

    /** Tire une variante au hasard, en évitant celles déjà dites récemment (pas de redites). */
    @Synchronized
    fun pick(options: List<String>): String {
        val fresh = options.filter { it !in recent }.ifEmpty { options }
        val choice = fresh.random()
        recent.addLast(choice)
        while (recent.size > 60) recent.removeFirst()
        return choice
    }

    fun question(step: CallStep, child: Child?): String = when (step) {
        CallStep.BEEN_GOOD -> pick(
            listOf(
                "Dis-moi, est-ce que tu as été sage cette année ?",
                "Alors, raconte-moi : tu as été sage cette année ?",
                "Mes lutins me demandent : est-ce que tu as été bien sage cette année ?",
            ),
        )
        CallStep.GOOD_DEEDS -> pick(
            listOf(
                "Et qu'est-ce que tu as fait de bien ? Tu as aidé à la maison, ou bien travaillé à l'école ?",
                "Raconte-moi une chose gentille que tu as faite cette année.",
                "Et de quoi tu es le plus fier, cette année ?",
            ),
        )
        CallStep.CHAT -> pick(
            buildList {
                add("Dis-moi, est-ce que vous avez déjà décoré le sapin, à la maison ?")
                add("Est-ce que tu vas me laisser un petit gâteau la nuit de Noël ? J'adore ça !")
                add("Tu sais, mon renne préféré s'appelle Rodolphe. Et toi, c'est quoi ton animal préféré ?")
                add("Est-ce qu'il a neigé chez toi ? Ici, au pôle Nord, il y a de la neige jusqu'aux genoux !")
                add("Qu'est-ce que tu préfères, à Noël ?")
                add("Est-ce que tu connais une chanson de Noël ? Tu veux bien m'en chanter un petit bout ?")
                add("Qu'est-ce que tu as appris de nouveau, cette année ?")
                add("C'est quoi, ton jeu préféré en ce moment ?")
                add("Tu sais ce que mangent mes rennes ? Des carottes ! Et toi, c'est quoi ton plat préféré ?")
                add("Si tu pouvais venir au pôle Nord, qu'est-ce que tu aimerais voir en premier ?")
                add("Tu préfères faire des bonshommes de neige, ou des batailles de boules de neige ?")
                add("La Mère Noël prépare des biscuits en ce moment. Et toi, tu aimes cuisiner ?")
                add("Qu'est-ce que tu as fait de plus rigolo, cette année ?")
                add("Mes lutins ont construit un traîneau tout neuf ! Tu aimerais faire un tour dedans ?")
                add("Est-ce que tu as déjà écrit ta lettre au Père Noël ?")
                add("Avec qui tu vas fêter Noël, cette année ?")
                add("Est-ce que tu as un doudou, ou un animal à la maison ?")
                add("Quand il fait froid, qu'est-ce que tu aimes faire à la maison ?")
                child?.interests?.takeIf { it.isNotBlank() }?.let {
                    add("Mes lutins m'ont dit que tu aimes $it. Raconte-moi !")
                }
            },
        )
        CallStep.WISH -> pick(
            listOf(
                "Et maintenant, dis-moi tout : qu'est-ce que tu aimerais pour Noël ?",
                "Et alors, qu'est-ce qui te ferait vraiment plaisir pour Noël ?",
                "Mes lutins préparent les traîneaux. Qu'est-ce que tu aimerais trouver sous le sapin ?",
            ),
        )
        else -> ""
    }

    /** Réactions de secours, neutres et toujours positives. */
    fun fallbackReaction(step: CallStep, child: Child?): String = when (step) {
        CallStep.BEEN_GOOD -> pick(
            listOf(
                "Ho ho ho ! Mes lutins m'ont dit plein de belles choses sur toi !",
                "Oh, ça me fait plaisir ! Je savais bien que tu avais un grand cœur.",
                "Ho ho ! La Mère Noël sera contente de l'apprendre.",
            ),
        )
        CallStep.GOOD_DEEDS -> pick(
            listOf(
                "Bravo ! Ça me fait chaud au cœur, tu sais.",
                "Oh, comme c'est gentil ! Je vais le noter dans mon grand livre.",
                "Formidable ! Mes lutins vont applaudir quand je vais leur raconter.",
            ),
        )
        CallStep.CHAT -> pick(
            listOf(
                "Ho ho ho, ça me plaît beaucoup ! Mes rennes vont adorer quand je leur raconterai.",
                "Oh, comme c'est chouette ! Au pôle Nord aussi, on adore ça.",
                "Ho ho, tu me fais bien rire ! Tu es vraiment quelqu'un d'épatant.",
            ),
        )
        CallStep.WISH -> pick(
            listOf(
                "Oh oh, quelle belle idée ! Je vais en parler à mes lutins, ils feront de leur mieux.",
                "Ho ho ho ! Je l'écris tout de suite dans mon grand carnet.",
                "Oh, c'est noté ! Mes lutins vont se mettre au travail.",
            ),
        )
        else -> "Ho ho ho !"
    }

    /** Après la réponse à une relance, si le cerveau n'a rien trouvé. */
    fun closeFallback() = pick(
        listOf(
            "Ho ho ho, c'est merveilleux !",
            "Oh, comme c'est bien ! Tu me fais plaisir, tu sais.",
            "Ho ho, quelle histoire !",
            "C'est formidable, ça !",
        ),
    )

    /** Pas de réponse à une relance : on enchaîne sans insister. */
    fun followUpNoAnswer() = pick(
        listOf(
            "Ho ho, ce n'est pas grave !",
            "Ce n'est rien, tu me raconteras une autre fois.",
            "Ho ho ho, tu es un peu timide, c'est normal !",
        ),
    )

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
        CallStep.CHAT -> "Tu aimes Noël ?"
        CallStep.WISH -> "Quel cadeau tu aimerais ?"
        else -> "Tu peux répéter ?"
    }

    /** Après trois essais sans réponse, on passe à la suite sans insister. */
    fun noAnswer(step: CallStep, child: Child?): String = when (step) {
        CallStep.BEEN_GOOD -> "Ce n'est pas grave ! Mes lutins m'ont dit que tu étais quelqu'un de formidable."
        CallStep.GOOD_DEEDS -> "Je suis sûr que tu as fait plein de belles choses cette année."
        CallStep.CHAT -> "Ce n'est pas grave ! Ici, mes lutins préparent déjà les traîneaux."
        CallStep.WISH -> child?.wish?.takeIf { it.isNotBlank() }
            ?.let { "Mes lutins m'ont murmuré que tu rêves de $it. Chut, c'est notre secret !" }
            ?: "Ce n'est pas grave, tu pourras l'écrire dans ta lettre. Mes lutins la liront très attentivement !"
        else -> "Ho ho ho !"
    }

    /** Ramène doucement à la question après une réponse hors sujet. */
    fun bringBack(step: CallStep): String = when (step) {
        CallStep.BEEN_GOOD -> "Mais dis-moi, est-ce que tu as été sage cette année ?"
        CallStep.GOOD_DEEDS -> "Et alors, qu'est-ce que tu as fait de bien cette année ?"
        CallStep.CHAT -> "Et toi, qu'est-ce que tu préfères, à Noël ?"
        CallStep.WISH -> "Et pour Noël, qu'est-ce qui te ferait plaisir ?"
        else -> ""
    }

    fun offTopicFallback() = pick(
        listOf(
            "Ho ho ho, c'est très intéressant, ça !",
            "Oh oh, tu en sais des choses !",
            "Ho ho ho, comme c'est amusant !",
        ),
    )

    const val WRAP_UP = "Oh là là, mes rennes s'impatientent, je vais bientôt devoir y aller !"

    val fillers = listOf("Hmm…", "Hmm, voyons…", "Oh oh…", "Voyons voir…", "Hmm hmm…")

    val notUnderstood = listOf(
        "Oh, ma vieille oreille n'a pas bien entendu. Tu peux répéter ?",
        "Il y a du vent au pôle Nord ! Tu peux le redire plus fort ?",
    )
}
