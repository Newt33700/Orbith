package fr.famille.appelperenoel.settings

import java.util.UUID

enum class Gender { UNSPECIFIED, BOY, GIRL }

data class Child(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val age: Int,
    val gender: Gender = Gender.UNSPECIFIED,
    /** Centres d'intérêt, facultatif (ex. « dinosaures, foot »). */
    val interests: String = "",
    /** Cadeau souhaité, facultatif. Le Père Noël n'en promet jamais un précis. */
    val wish: String = "",
)

data class AppSettings(
    val children: List<Child> = listOf(
        Child(name = "Lilian", age = 9),
        Child(name = "Alicia", age = 6),
    ),
    /** Durée max de la conversation avec CHAQUE enfant. */
    val maxCallMinutes: Int = 4,
    /** Après le premier enfant, le Père Noël demande à parler aux frères et sœurs. */
    val askSiblings: Boolean = true,
    /** Volume de la voix du Père Noël (0..1, appliqué en plus du volume du téléphone). */
    val santaVolume: Float = 1f,
    val ambienceEnabled: Boolean = true,
    val ambienceVolume: Float = 0.12f,
    val speakerByDefault: Boolean = true,
    /** Durée de la sonnerie avant que le Père Noël décroche. */
    val ringSeconds: Float = 4.5f,
    /** Silence (ms) qui marque la fin d'une phrase de l'enfant. */
    val silenceMs: Int = 1500,
    /** Le mode debug est caché : 7 appuis sur le numéro de version dans l'écran Parents. */
    val debugUnlocked: Boolean = false,
    val debugMode: Boolean = false,
    /** Vrai une fois l'écran d'installation des modèles passé au premier lancement. */
    val setupDone: Boolean = false,
    /** Voix Piper choisie (nom court, ex. « tom-medium ») ; null = la première installée. */
    val voiceName: String? = null,
    /** Abaissement de la voix en demi-tons. */
    val pitchSemitones: Float = 1.5f,
    /** Lenteur : 1.15 = 15 % plus lent. */
    val slowness: Float = 1.15f,
    /** Écho / réverbération (0 = aucun). */
    val reverb: Float = 0.15f,
    /** Délai max (ms) pour que le cerveau trouve sa première phrase, sinon phrase de secours. */
    val llmTimeoutMs: Int = 5000,
    /** Cerveau sur la carte graphique (sinon processeur). */
    val llmGpu: Boolean = false,
    /** Ajoute soi-même le format de dialogue Gemma (à n'activer que si les réponses sont incohérentes). */
    val llmManualTemplate: Boolean = false,
    /** 0 = dessin par défaut, sinon date de la photo choisie (sert aussi à rafraîchir l'affichage). */
    val photoStamp: Long = 0L,
)

fun AppSettings.papyVoice() = fr.famille.appelperenoel.audio.PapyVoiceSettings(
    pitchSemitones = pitchSemitones,
    slowness = slowness,
    reverb = reverb,
)
