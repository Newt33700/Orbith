package fr.famille.appelperenoel.llm

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Cerveau en ligne : API Gemini de Google (clé gratuite à créer sur aistudio.google.com).
 * Beaucoup plus vif et plus varié que le petit modèle local ; réponses en flux (SSE).
 * Aucune dépendance : simple HttpURLConnection.
 */
class GeminiLlm(
    private val apiKey: () -> String,
    private val model: () -> String,
) {
    val configured: Boolean get() = apiKey().isNotBlank()

    /**
     * @param onText appelé avec le texte complet obtenu jusque-là
     * @param stopWhen vrai pour couper le flux (assez de phrases)
     */
    suspend fun generate(
        system: String,
        prompt: String,
        temperature: Float = 0.9f,
        onText: (String) -> Unit = {},
        stopWhen: (String) -> Boolean = { false },
    ): String = withContext(Dispatchers.IO) {
        val key = apiKey().trim()
        require(key.isNotBlank()) { "clé Gemini absente" }
        val name = model().trim().ifBlank { DEFAULT_MODEL }
        val url = URL(
            "https://generativelanguage.googleapis.com/v1beta/models/" +
                URLEncoder.encode(name, "UTF-8") + ":streamGenerateContent?alt=sse",
        )
        val body = JSONObject().apply {
            put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system))))
            put(
                "contents",
                JSONArray().put(
                    JSONObject().put("role", "user").put("parts", JSONArray().put(JSONObject().put("text", prompt))),
                ),
            )
            put(
                "generationConfig",
                JSONObject()
                    .put("temperature", temperature.toDouble())
                    .put("topP", 0.95)
                    .put("maxOutputTokens", 160),
            )
        }
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 4000
            readTimeout = 8000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("x-goog-api-key", key)
        }
        val text = StringBuilder()
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = runCatching { conn.errorStream?.bufferedReader()?.readText() }.getOrNull().orEmpty()
                val msg = runCatching { JSONObject(err).getJSONObject("error").getString("message") }.getOrNull()
                throw IllegalStateException("Gemini HTTP $code${msg?.let { " : $it" } ?: ""}")
            }
            BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { reader ->
                while (true) {
                    ensureActive()
                    val line = reader.readLine() ?: break
                    if (!line.startsWith("data:")) continue
                    val json = runCatching { JSONObject(line.removePrefix("data:").trim()) }.getOrNull() ?: continue
                    val candidates = json.optJSONArray("candidates") ?: continue
                    val parts = candidates.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts") ?: continue
                    for (i in 0 until parts.length()) {
                        val p = parts.optJSONObject(i) ?: continue
                        if (p.optBoolean("thought")) continue
                        text.append(p.optString("text"))
                    }
                    val current = text.toString()
                    onText(current)
                    if (stopWhen(current)) break
                }
            }
        } finally {
            conn.disconnect()
        }
        text.toString()
    }

    companion object {
        /** Alias tenu à jour par Google vers le modèle « Flash-Lite » le plus récent (rapide, gratuit). */
        const val DEFAULT_MODEL = "gemini-flash-lite-latest"
    }
}
