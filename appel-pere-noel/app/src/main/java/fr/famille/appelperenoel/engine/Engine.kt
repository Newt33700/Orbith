package fr.famille.appelperenoel.engine

/** Un moteur lourd (STT, TTS, LLM) qu'on charge pendant la sonnerie et qu'on libère en raccrochant. */
interface Engine {
    val label: String
    suspend fun load()
    fun release()
}

/**
 * Jalon (a) : remplaçant des vrais moteurs, branchés aux jalons (b), (c) et (d).
 * Il vérifie seulement que le modèle est présent.
 */
class PlaceholderEngine(override val label: String, private val modelPresent: () -> Boolean) : Engine {
    override suspend fun load() {
        if (!modelPresent()) throw IllegalStateException("modèle absent (mode démo)")
    }

    override fun release() = Unit
}
