package fr.famille.appelperenoel.engine

/** Un moteur lourd (STT, TTS, LLM) qu'on charge pendant la sonnerie et qu'on libère en raccrochant. */
interface Engine {
    val label: String
    suspend fun load()
    fun release()
}
