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
    val maxCallMinutes: Int = 4,
    /** Volume de la voix du Père Noël (0..1, appliqué en plus du volume du téléphone). */
    val santaVolume: Float = 1f,
    val ambienceEnabled: Boolean = true,
    val ambienceVolume: Float = 0.12f,
    val speakerByDefault: Boolean = true,
    /** Durée de la sonnerie avant que le Père Noël décroche. */
    val ringSeconds: Float = 4.5f,
    /** Silence (ms) qui marque la fin d'une phrase de l'enfant. */
    val silenceMs: Int = 1500,
    val showSubtitles: Boolean = true,
    /** Le mode debug est caché : 7 appuis sur le numéro de version dans l'écran Parents. */
    val debugUnlocked: Boolean = false,
    val debugMode: Boolean = false,
    /** Vrai une fois l'écran d'installation des modèles passé au premier lancement. */
    val setupDone: Boolean = false,
    /** 0 = dessin par défaut, sinon date de la photo choisie (sert aussi à rafraîchir l'affichage). */
    val photoStamp: Long = 0L,
)
