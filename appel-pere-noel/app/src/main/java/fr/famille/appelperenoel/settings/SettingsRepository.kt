package fr.famille.appelperenoel.settings

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

/** Réglages stockés en JSON dans les SharedPreferences (pas besoin de plus pour un usage familial). */
class SettingsRepository(context: Context) {

    private val prefs = context.getSharedPreferences("reglages", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppSettings> = _state.asStateFlow()

    val current: AppSettings get() = _state.value

    fun update(transform: (AppSettings) -> AppSettings) {
        val next = transform(_state.value)
        _state.value = next
        prefs.edit().putString(KEY, toJson(next).toString()).apply()
    }

    private fun load(): AppSettings {
        val raw = prefs.getString(KEY, null) ?: return AppSettings()
        return runCatching { fromJson(JSONObject(raw)) }.getOrElse { AppSettings() }
    }

    private fun toJson(s: AppSettings) = JSONObject().apply {
        put("children", JSONArray().apply {
            s.children.forEach { c ->
                put(JSONObject().apply {
                    put("id", c.id)
                    put("name", c.name)
                    put("age", c.age)
                    put("gender", c.gender.name)
                    put("interests", c.interests)
                    put("wish", c.wish)
                })
            }
        })
        put("maxCallMinutes", s.maxCallMinutes)
        put("askSiblings", s.askSiblings)
        put("santaVolume", s.santaVolume.toDouble())
        put("ambienceEnabled", s.ambienceEnabled)
        put("ambienceVolume", s.ambienceVolume.toDouble())
        put("speakerByDefault", s.speakerByDefault)
        put("ringSeconds", s.ringSeconds.toDouble())
        put("silenceMs2", s.silenceMs)
        put("followUps", s.followUps)
        put("onlineBrain", s.onlineBrain)
        put("geminiKey", s.geminiKey)
        put("geminiModel", s.geminiModel)
        put("debugUnlocked", s.debugUnlocked)
        put("debugMode", s.debugMode)
        put("setupDone", s.setupDone)
        put("photoStamp", s.photoStamp)
        s.voiceName?.let { put("voiceName", it) }
        put("pitchSemitones", s.pitchSemitones.toDouble())
        put("slowness", s.slowness.toDouble())
        put("reverb2", s.reverb.toDouble())
        put("voiceSpeaker", s.voiceSpeaker)
        put("voiceEngine", s.voiceEngine)
        s.androidVoice?.let { put("androidVoice", it) }
        put("expressiveness", s.expressiveness.toDouble())
        put("llmTimeoutMs", s.llmTimeoutMs)
        put("llmGpu", s.llmGpu)
        put("llmManualTemplate", s.llmManualTemplate)
    }

    private fun fromJson(o: JSONObject): AppSettings {
        val d = AppSettings()
        val children = o.optJSONArray("children")?.let { arr ->
            (0 until arr.length()).map { i ->
                val c = arr.getJSONObject(i)
                Child(
                    id = c.optString("id").ifBlank { java.util.UUID.randomUUID().toString() },
                    name = c.optString("name"),
                    age = c.optInt("age", 6),
                    gender = runCatching { Gender.valueOf(c.optString("gender")) }.getOrDefault(Gender.UNSPECIFIED),
                    interests = c.optString("interests"),
                    wish = c.optString("wish"),
                )
            }
        } ?: d.children
        return AppSettings(
            children = children,
            maxCallMinutes = o.optInt("maxCallMinutes", d.maxCallMinutes),
            askSiblings = o.optBoolean("askSiblings", d.askSiblings),
            santaVolume = o.optDouble("santaVolume", d.santaVolume.toDouble()).toFloat(),
            ambienceEnabled = o.optBoolean("ambienceEnabled", d.ambienceEnabled),
            ambienceVolume = o.optDouble("ambienceVolume", d.ambienceVolume.toDouble()).toFloat(),
            speakerByDefault = o.optBoolean("speakerByDefault", d.speakerByDefault),
            ringSeconds = o.optDouble("ringSeconds", d.ringSeconds.toDouble()).toFloat(),
            // « silenceMs2 » : l'ancien réglage (1,5 s, trop lent) est ignoré.
            silenceMs = o.optInt("silenceMs2", d.silenceMs),
            followUps = o.optBoolean("followUps", d.followUps),
            onlineBrain = o.optBoolean("onlineBrain", d.onlineBrain),
            geminiKey = o.optString("geminiKey", d.geminiKey),
            geminiModel = o.optString("geminiModel", d.geminiModel).ifBlank { d.geminiModel },
            debugUnlocked = o.optBoolean("debugUnlocked", d.debugUnlocked),
            debugMode = o.optBoolean("debugMode", d.debugMode),
            setupDone = o.optBoolean("setupDone", d.setupDone),
            photoStamp = o.optLong("photoStamp", d.photoStamp),
            voiceName = o.optString("voiceName").ifBlank { null },
            pitchSemitones = o.optDouble("pitchSemitones", d.pitchSemitones.toDouble()).toFloat(),
            slowness = o.optDouble("slowness", d.slowness.toDouble()).toFloat(),
            reverb = o.optDouble("reverb2", d.reverb.toDouble()).toFloat(),
            voiceSpeaker = o.optInt("voiceSpeaker", d.voiceSpeaker),
            voiceEngine = o.optString("voiceEngine", d.voiceEngine).ifBlank { d.voiceEngine },
            androidVoice = o.optString("androidVoice").ifBlank { null },
            expressiveness = o.optDouble("expressiveness", d.expressiveness.toDouble()).toFloat(),
            llmTimeoutMs = o.optInt("llmTimeoutMs", d.llmTimeoutMs),
            llmGpu = o.optBoolean("llmGpu", d.llmGpu),
            llmManualTemplate = o.optBoolean("llmManualTemplate", d.llmManualTemplate),
        )
    }

    private companion object {
        const val KEY = "json"
    }
}
