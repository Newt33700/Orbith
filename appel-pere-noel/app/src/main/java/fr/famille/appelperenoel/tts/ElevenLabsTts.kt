package fr.famille.appelperenoel.tts

import android.content.Context
import fr.famille.appelperenoel.engine.Engine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

/** Une voix ElevenLabs (de son compte, ou de la bibliothèque publique). */
data class ElevenVoice(
    val voiceId: String,
    val name: String,
    val description: String = "",
    val previewUrl: String? = null,
    /** Pour les voix de la bibliothèque : identifiant du créateur (nécessaire pour l'ajouter au compte). */
    val publicOwnerId: String? = null,
)

/** Quota de caractères du mois. */
data class ElevenQuota(val used: Int, val limit: Int)

/**
 * Voix ElevenLabs (en ligne, très naturelle). Compte gratuit sans carte bancaire, quota mensuel limité :
 * chaque phrase synthétisée est donc gardée sur le téléphone, et les phrases fixes ne coûtent qu'une fois.
 * Si ElevenLabs échoue (quota épuisé, pas de réseau), la phrase est dite par [fallback].
 */
class ElevenLabsTts(
    private val context: Context,
    private val apiKey: () -> String,
    private val voiceId: () -> String,
    private val model: () -> String,
    private val fallback: () -> SpeechSynth? = { null },
    private val onError: (String) -> Unit = {},
) : Engine, SpeechSynth {

    override val label = "Voix ElevenLabs"

    @Volatile
    private var loaded = false
    override val ready: Boolean get() = loaded

    /** ElevenLabs ne change pas la hauteur : la voix choisie est déjà une voix de papy. */
    override val handlesPitch = true

    override suspend fun load() {
        require(apiKey().isNotBlank()) { "clé ElevenLabs absente" }
        require(voiceId().isNotBlank()) { "aucune voix ElevenLabs choisie" }
        loaded = true
    }

    override fun release() {
        loaded = false
    }

    override suspend fun synthesize(text: String, speed: Float, pitch: Float): RawSpeech {
        return try {
            synthesizeEleven(text, speed)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val fb = fallback()
            onError("ElevenLabs : ${e.message}" + if (fb != null) " → voix de secours" else "")
            if (fb == null || !fb.ready) throw e
            fb.synthesize(text, speed, pitch)
        }
    }

    private suspend fun synthesizeEleven(text: String, speed: Float): RawSpeech = withContext(Dispatchers.IO) {
        val voice = voiceId()
        val modelId = model().ifBlank { MODEL_FAST }
        val elevenSpeed = speed.coerceIn(0.7f, 1.2f)
        val file = cacheFile(context, "$voice|$modelId|${"%.2f".format(elevenSpeed)}|$text")
        if (file.exists()) {
            file.setLastModified(System.currentTimeMillis())
            return@withContext pcmToRaw(file.readBytes())
        }
        val body = JSONObject().apply {
            put("text", text)
            put("model_id", modelId)
            if (modelId != MODEL_QUALITY) put("language_code", "fr")
            put(
                "voice_settings",
                JSONObject()
                    .put("stability", 0.45)
                    .put("similarity_boost", 0.8)
                    .put("style", 0.0)
                    .put("use_speaker_boost", true)
                    .put("speed", elevenSpeed.toDouble()),
            )
        }
        val bytes = request(
            "POST",
            "/v1/text-to-speech/${enc(voice)}?output_format=pcm_$RATE",
            apiKey(),
            body.toString(),
        )
        if (bytes.size < 200) throw IllegalStateException("réponse audio vide")
        runCatching {
            file.parentFile?.mkdirs()
            file.writeBytes(bytes)
            trimCache(context)
        }
        pcmToRaw(bytes)
    }

    companion object {
        const val MODEL_FAST = "eleven_flash_v2_5"
        const val MODEL_QUALITY = "eleven_multilingual_v2"
        private const val RATE = 22050
        private const val BASE = "https://api.elevenlabs.io"
        private const val CACHE_MAX_BYTES = 80L * 1024 * 1024

        private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

        private fun pcmToRaw(bytes: ByteArray): RawSpeech {
            val n = bytes.size / 2
            val out = FloatArray(n)
            for (i in 0 until n) {
                val v = (bytes[2 * i].toInt() and 0xFF) or (bytes[2 * i + 1].toInt() shl 8)
                out[i] = v.toShort() / 32768f
            }
            return RawSpeech(out, RATE)
        }

        private fun cacheDir(context: Context) = File(context.filesDir, "voix_elevenlabs")

        private fun cacheFile(context: Context, key: String): File {
            val hash = MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
            return File(cacheDir(context), "$hash.pcm")
        }

        private fun trimCache(context: Context) {
            val files = cacheDir(context).listFiles()?.sortedBy { it.lastModified() } ?: return
            var total = files.sumOf { it.length() }
            for (f in files) {
                if (total <= CACHE_MAX_BYTES) break
                total -= f.length()
                f.delete()
            }
        }

        /** Requête HTTP ; lève une exception lisible en cas d'erreur. */
        private fun request(method: String, path: String, key: String, json: String? = null): ByteArray {
            val conn = (URL(BASE + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 5000
                readTimeout = 15000
                setRequestProperty("xi-api-key", key.trim())
                setRequestProperty("Accept", "*/*")
                if (json != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
            }
            try {
                if (json != null) conn.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                if (code !in 200..299) {
                    val err = runCatching { conn.errorStream?.bufferedReader()?.readText() }.getOrNull().orEmpty()
                    val detail = runCatching {
                        val d = JSONObject(err).get("detail")
                        if (d is JSONObject) d.optString("message", d.toString()) else d.toString()
                    }.getOrNull() ?: err.take(200)
                    throw IllegalStateException("HTTP $code ${detail.take(200)}")
                }
                val out = ByteArrayOutputStream()
                conn.inputStream.use { it.copyTo(out) }
                return out.toByteArray()
            } finally {
                conn.disconnect()
            }
        }

        private fun getJson(path: String, key: String) = JSONObject(String(request("GET", path, key), Charsets.UTF_8))

        /** Voix déjà présentes dans le compte. */
        suspend fun myVoices(key: String): List<ElevenVoice> = withContext(Dispatchers.IO) {
            val arr = getJson("/v1/voices", key).optJSONArray("voices") ?: return@withContext emptyList()
            (0 until arr.length()).map { i ->
                val v = arr.getJSONObject(i)
                val labels = v.optJSONObject("labels")
                val desc = listOfNotNull(
                    labels?.optString("gender")?.takeIf { it.isNotBlank() },
                    labels?.optString("age")?.takeIf { it.isNotBlank() },
                    labels?.optString("accent")?.takeIf { it.isNotBlank() },
                ).joinToString(", ")
                ElevenVoice(v.getString("voice_id"), v.optString("name"), desc, v.optString("preview_url").ifBlank { null })
            }
        }

        /** Voix d'hommes âgés en français dans la bibliothèque publique (utilisables avec un compte gratuit). */
        suspend fun searchLibrary(key: String, search: String = ""): List<ElevenVoice> = withContext(Dispatchers.IO) {
            fun query(extra: String): List<ElevenVoice> {
                val path = "/v1/shared-voices?page_size=40&language=fr&gender=male$extra" +
                    if (search.isNotBlank()) "&search=${enc(search)}" else ""
                val arr = getJson(path, key).optJSONArray("voices") ?: return emptyList()
                return (0 until arr.length()).map { arr.getJSONObject(it) }
                    .filter { it.optBoolean("free_users_allowed", true) }
                    .map { v ->
                        ElevenVoice(
                            voiceId = v.getString("voice_id"),
                            name = v.optString("name"),
                            description = listOf(v.optString("age"), v.optString("accent"), v.optString("description"))
                                .filter { it.isNotBlank() && it != "null" }.joinToString(" · ").take(140),
                            previewUrl = v.optString("preview_url").ifBlank { null },
                            publicOwnerId = v.optString("public_owner_id").ifBlank { null },
                        )
                    }
            }
            val old = query("&age=old")
            if (old.size >= 5) old else (old + query("")).distinctBy { it.voiceId }
        }

        /** Ajoute une voix de la bibliothèque au compte ; renvoie son identifiant à utiliser. */
        suspend fun addLibraryVoice(key: String, voice: ElevenVoice): String = withContext(Dispatchers.IO) {
            val owner = voice.publicOwnerId ?: return@withContext voice.voiceId
            val body = JSONObject().put("new_name", "Père Noël – ${voice.name}".take(40)).toString()
            val res = JSONObject(String(request("POST", "/v1/voices/add/${enc(owner)}/${enc(voice.voiceId)}", key, body)))
            res.optString("voice_id").ifBlank { voice.voiceId }
        }

        suspend fun quota(key: String): ElevenQuota = withContext(Dispatchers.IO) {
            val o = getJson("/v1/user/subscription", key)
            ElevenQuota(o.optInt("character_count"), o.optInt("character_limit"))
        }
    }
}
