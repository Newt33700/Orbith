package fr.famille.appelperenoel.ui.parents

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.DisposableEffect
import fr.famille.appelperenoel.audio.HomeRecording
import fr.famille.appelperenoel.audio.HomeRecordings
import fr.famille.appelperenoel.tts.AndroidTts
import fr.famille.appelperenoel.tts.ElevenLabsTts
import fr.famille.appelperenoel.tts.ElevenVoice
import fr.famille.appelperenoel.tts.AndroidVoiceInfo
import fr.famille.appelperenoel.tts.VoicePreview
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import fr.famille.appelperenoel.llm.GeminiLlm
import androidx.compose.ui.unit.dp
import fr.famille.appelperenoel.BuildConfig
import fr.famille.appelperenoel.app
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.settings.Child
import fr.famille.appelperenoel.settings.Gender
import fr.famille.appelperenoel.ui.common.PhotoStore
import fr.famille.appelperenoel.ui.common.SantaPortrait
import fr.famille.appelperenoel.ui.theme.CallGreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ParentsScreen(onBack: () -> Unit, onOpenModels: () -> Unit) {
    val context = LocalContext.current
    val app = context.app
    val s by app.settings.state.collectAsState()
    val modelsVersion by app.models.version.collectAsState()
    val statuses = remember(modelsVersion) { app.models.statuses() }
    val scope = rememberCoroutineScope()
    fun update(t: (AppSettings) -> AppSettings) = app.settings.update(t)

    var editing by remember { mutableStateOf<Child?>(null) }
    var creating by remember { mutableStateOf(false) }
    var versionTaps by remember { mutableIntStateOf(0) }

    var previewing by remember { mutableStateOf(false) }
    var previewSpeakers by remember { mutableIntStateOf(1) }
    val preview = remember { VoicePreview(context.applicationContext, app.models) }
    var androidVoices by remember { mutableStateOf<List<AndroidVoiceInfo>?>(null) }
    var androidError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(s.voiceEngine) {
        if (s.voiceEngine == "android" && androidVoices == null) {
            try {
                androidVoices = preview.androidVoices(app.settings.current)
            } catch (e: Exception) {
                androidError = e.message
                androidVoices = emptyList()
            }
        }
    }
    DisposableEffect(preview) { onDispose { preview.release() } }
    var recordingsVersion by remember { mutableIntStateOf(0) }
    var pendingRecording by remember { mutableStateOf<HomeRecording?>(null) }
    val recordingPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val r = pendingRecording
        if (uri != null && r != null) {
            scope.launch {
                val ok = withContext(Dispatchers.IO) { HomeRecordings.import(context, r, uri) }
                recordingsVersion++
                Toast.makeText(context, if (ok) "Enregistrement importé" else "Import impossible", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val ok = withContext(Dispatchers.IO) { PhotoStore.save(context, uri) }
                if (ok) update { it.copy(photoStamp = System.currentTimeMillis()) }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Espace parents") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Section("Enfants") {
                if (s.children.isEmpty()) Text("Aucun enfant. Ajoute au moins un prénom.")
                s.children.forEach { child ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${child.name}, ${child.age} ans", fontWeight = FontWeight.Bold)
                            val extra = listOfNotNull(
                                child.interests.takeIf { it.isNotBlank() }?.let { "Aime : $it" },
                                child.wish.takeIf { it.isNotBlank() }?.let { "Souhaite : $it" },
                            )
                            if (extra.isNotEmpty()) Text(extra.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = { editing = child }) { Icon(Icons.Filled.Edit, contentDescription = "Modifier") }
                        IconButton(onClick = { update { st -> st.copy(children = st.children.filterNot { it.id == child.id }) } }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Supprimer")
                        }
                    }
                }
                OutlinedButton(onClick = { creating = true }) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Ajouter un enfant")
                }
            }

            Section("Appel") {
                LabeledSlider("Durée maximale par enfant : ${s.maxCallMinutes} min", s.maxCallMinutes.toFloat(), 2f..10f, steps = 7) { v ->
                    update { it.copy(maxCallMinutes = v.roundToInt()) }
                }
                LabeledSlider("Durée de la sonnerie : %.1f s".format(s.ringSeconds), s.ringSeconds, 3f..6f, steps = 5) { v ->
                    update { it.copy(ringSeconds = (v * 2).roundToInt() / 2f) }
                }
                SwitchRow("Demander à parler aux frères et sœurs", s.askSiblings) { v -> update { it.copy(askSiblings = v) } }
                SwitchRow("Haut-parleur activé au décroché", s.speakerByDefault) { v -> update { it.copy(speakerByDefault = v) } }
                LabeledSlider(
                    "Attente quand l'enfant se tait : %.1f s".format(s.silenceMs / 1000f),
                    s.silenceMs.toFloat(),
                    600f..2500f,
                    steps = 18,
                ) { v -> update { it.copy(silenceMs = (v / 100).roundToInt() * 100) } }
                Text(
                    "Plus court = le Père Noël répond plus vite, mais risque de couper un enfant qui hésite.",
                    style = MaterialTheme.typography.bodySmall,
                )
                SwitchRow("Le Père Noël rebondit sur les réponses (petites questions de relance)", s.followUps) { v ->
                    update { it.copy(followUps = v) }
                }
            }

            Section("Cerveau du Père Noël") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(
                        selected = !s.onlineBrain,
                        onClick = { update { it.copy(onlineBrain = false) } },
                        label = { Text("Local (Gemma)") },
                    )
                    FilterChip(
                        selected = s.onlineBrain,
                        onClick = { update { it.copy(onlineBrain = true) } },
                        label = { Text("En ligne (Gemini, gratuit)") },
                    )
                }
                if (!s.onlineBrain) {
                    Text(
                        "Le petit cerveau local fonctionne sans internet, mais il est lent et se répète souvent. " +
                            "Le cerveau en ligne répond en général en moins d'une seconde, avec des réponses bien plus variées.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    Text(
                        "Clé gratuite : sur aistudio.google.com/apikey, connecte-toi avec ton compte Google, " +
                            "touche « Create API key », copie-la et colle-la ici. Pas de carte bancaire : " +
                            "sans facturation activée, rien ne peut être payant.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    var keyDraft by remember { mutableStateOf(s.geminiKey) }
                    OutlinedTextField(
                        keyDraft,
                        { v ->
                            keyDraft = v.trim()
                            update { it.copy(geminiKey = keyDraft) }
                        },
                        label = { Text("Clé API Gemini") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    var testing by remember { mutableStateOf(false) }
                    var testResult by remember { mutableStateOf<String?>(null) }
                    Button(
                        enabled = !testing && s.geminiKey.isNotBlank(),
                        onClick = {
                            testing = true
                            testResult = null
                            scope.launch {
                                val t0 = System.currentTimeMillis()
                                val gemini = GeminiLlm(apiKey = { s.geminiKey }, model = { s.geminiModel })
                                testResult = try {
                                    val r = gemini.generate(
                                        "Tu es le Père Noël. Réponds en français, en une phrase courte.",
                                        "Un enfant te dit : « Bonjour Père Noël ! »",
                                    )
                                    "✓ ${System.currentTimeMillis() - t0} ms : ${r.trim()}"
                                } catch (e: Exception) {
                                    "✗ ${e.message}"
                                }
                                testing = false
                            }
                        },
                    ) { Text(if (testing) "Test en cours…" else "Tester le cerveau en ligne") }
                    testResult?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    Text(
                        "Les phrases des enfants (texte seulement, jamais leur voix) sont envoyées à Google pendant l'appel. " +
                            "Avec la clé gratuite, Google peut s'en servir pour améliorer ses services. " +
                            "Sans internet, le Père Noël repasse tout seul sur le cerveau local.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (s.debugUnlocked) {
                        var modelDraft by remember { mutableStateOf(s.geminiModel) }
                        OutlinedTextField(
                            modelDraft,
                            { v ->
                                modelDraft = v.trim()
                                update { it.copy(geminiModel = modelDraft.ifBlank { GeminiLlm.DEFAULT_MODEL }) }
                            },
                            label = { Text("Modèle Gemini (debug)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            Section("Son") {
                LabeledSlider("Volume de la voix : ${(s.santaVolume * 100).roundToInt()} %", s.santaVolume, 0.2f..1f) { v ->
                    update { it.copy(santaVolume = v) }
                }
                SwitchRow("Ambiance (cheminée et grelots)", s.ambienceEnabled) { v -> update { it.copy(ambienceEnabled = v) } }
                if (s.ambienceEnabled) {
                    LabeledSlider("Volume de l'ambiance : ${(s.ambienceVolume * 200).roundToInt()} %", s.ambienceVolume, 0.02f..0.5f) { v ->
                        update { it.copy(ambienceVolume = v) }
                    }
                }
            }

            Section("Voix du Père Noël") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(
                        selected = s.voiceEngine == "eleven",
                        onClick = { update { it.copy(voiceEngine = "eleven") } },
                        label = { Text("ElevenLabs (très naturelle)") },
                    )
                    FilterChip(
                        selected = s.voiceEngine == "android",
                        onClick = { update { it.copy(voiceEngine = "android") } },
                        label = { Text("Voix Google") },
                    )
                    FilterChip(
                        selected = s.voiceEngine == "piper",
                        onClick = { update { it.copy(voiceEngine = "piper") } },
                        label = { Text("Piper (hors-ligne)") },
                    )
                }
                val voices = remember(modelsVersion) { app.models.piperVoices() }
                if (s.voiceEngine == "eleven") {
                    ElevenLabsSettings(s, preview, ::update)
                } else if (s.voiceEngine == "android") {
                    val list = androidVoices
                    when {
                        list == null -> Text("Recherche des voix…", style = MaterialTheme.typography.bodySmall)
                        list.isEmpty() -> Text(
                            "Aucune voix française trouvée" + (androidError?.let { " ($it)" } ?: "") + ". " +
                                "Installe « Services de reconnaissance et synthèse vocale de Google » depuis le Play Store, " +
                                "puis choisis-le dans Paramètres → Accessibilité → Synthèse vocale.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        else -> {
                            Text(
                                "Moteur : ${preview.androidEngine.ifBlank { "?" }} · ${list.size} voix. " +
                                    "♂ = voix d'homme (d'après les noms Google), ☁ = nécessite internet. " +
                                    "Écoute-les une par une :",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (preview.androidEngine != AndroidTts.GOOGLE_TTS) {
                                Text(
                                    "Ce moteur n'est pas celui de Google : il n'a souvent que des voix de femme. " +
                                        "Installe « Services de reconnaissance et synthèse vocale de Google » " +
                                        "depuis le Play Store, puis reviens ici.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(0xFFFFAB40),
                                )
                            } else if (list.none { AndroidTts.probablyMale(it.name) }) {
                                Text(
                                    "Aucune voix d'homme n'est installée : ouvre Paramètres → Accessibilité → " +
                                        "Synthèse vocale → ⚙ du moteur Google → Installer les données vocales → " +
                                        "Français (France), et télécharge les voix proposées.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(0xFFFFAB40),
                                )
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                list.sortedByDescending { AndroidTts.probablyMale(it.name) }.forEach { v ->
                                    FilterChip(
                                        selected = v.name == s.androidVoice,
                                        onClick = { update { it.copy(androidVoice = v.name) } },
                                        label = {
                                            Text(
                                                (if (AndroidTts.probablyMale(v.name)) "♂ " else "") +
                                                    (if (v.needsInternet) "☁ " else "") + v.name,
                                            )
                                        },
                                    )
                                }
                            }
                        }
                    }
                } else if (voices.isEmpty()) {
                    Text("Aucune voix installée : voir « Modèles » plus bas.", style = MaterialTheme.typography.bodySmall)
                } else {
                    val selected = voices.firstOrNull { it.name == s.voiceName }?.name ?: voices.first().name
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        voices.forEach { v ->
                            FilterChip(
                                selected = v.name == selected,
                                onClick = {
                                    update { it.copy(voiceName = v.name, voiceSpeaker = 0) }
                                    previewSpeakers = 1
                                },
                                label = { Text(v.name) },
                            )
                        }
                    }
                }
                if (s.voiceEngine == "piper" && previewSpeakers > 1) {
                    Text("Locuteur (UPMC : 1 = Jessica, 2 = Pierre) :", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (0 until previewSpeakers.coerceAtMost(12)).forEach { i ->
                            FilterChip(
                                selected = s.voiceSpeaker == i,
                                onClick = { update { it.copy(voiceSpeaker = i) } },
                                label = { Text("${i + 1}") },
                            )
                        }
                    }
                }
                if (s.voiceEngine == "piper") LabeledSlider("Expressivité : ${(s.expressiveness * 100).roundToInt()} %", s.expressiveness, 0f..1f, steps = 9) { v ->
                    update { it.copy(expressiveness = (v * 10).roundToInt() / 10f) }
                }
                if (s.voiceEngine != "eleven") {
                    LabeledSlider("Voix plus grave : %.1f demi-tons".format(s.pitchSemitones), s.pitchSemitones, 0f..6f, steps = 11) { v ->
                        update { it.copy(pitchSemitones = (v * 2).roundToInt() / 2f) }
                    }
                }
                LabeledSlider("Lenteur : +${((s.slowness - 1f) * 100).roundToInt()} %", s.slowness, 1f..1.4f, steps = 7) { v ->
                    update { it.copy(slowness = (v * 20).roundToInt() / 20f) }
                }
                LabeledSlider("Écho : ${(s.reverb * 250).roundToInt()} %", s.reverb, 0f..0.4f, steps = 7) { v ->
                    update { it.copy(reverb = (v * 20).roundToInt() / 20f) }
                }
                Button(enabled = !previewing && when (s.voiceEngine) {
                    "piper" -> voices.isNotEmpty()
                    "eleven" -> s.elevenKey.isNotBlank() && s.elevenVoiceId.isNotBlank()
                    else -> true
                }, onClick = {
                    scope.launch {
                        previewing = true
                        try {
                            val name = s.children.firstOrNull()?.name ?: "mon petit"
                            preview.play(
                                app.settings.current,
                                "Ho ho ho ! Bonjour $name, ici le Père Noël. Est-ce que tu as été bien sage cette année ?",
                            )
                            previewSpeakers = preview.speakers
                        } catch (e: Exception) {
                            Toast.makeText(context, "Voix : ${e.message}", Toast.LENGTH_LONG).show()
                        } finally {
                            previewing = false
                        }
                    }
                }) { Text(if (previewing) "Écoute en cours…" else "Écouter") }
            }

            Section("Enregistrements faits maison") {
                Text(
                    "Enregistre-toi avec l'appli Dictaphone (ogg, m4a ou mp3), puis importe le fichier : " +
                        "il sera joué à la place de la voix de synthèse.",
                    style = MaterialTheme.typography.bodySmall,
                )
                HomeRecording.entries.forEach { r ->
                    val present = remember(recordingsVersion) { HomeRecordings.file(context, r) != null }
                    Column {
                        Text("${r.title} : ${if (present) "présent" else "aucun"}", fontWeight = FontWeight.Bold)
                        Text(r.hint, style = MaterialTheme.typography.bodySmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            OutlinedButton(onClick = {
                                pendingRecording = r
                                recordingPicker.launch(arrayOf("audio/*"))
                            }) { Text("Importer") }
                            if (present) {
                                OutlinedButton(onClick = {
                                    scope.launch { HomeRecordings.file(context, r)?.let { HomeRecordings.play(it, s.santaVolume) } }
                                }) { Text("Écouter") }
                                TextButton(onClick = {
                                    HomeRecordings.delete(context, r)
                                    recordingsVersion++
                                }) { Text("Supprimer") }
                            }
                        }
                    }
                }
            }

            Section("Photo du Père Noël") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SantaPortrait(Modifier.size(80.dp), s.photoStamp)
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Button(onClick = {
                            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }) { Text("Choisir une photo") }
                        if (s.photoStamp != 0L) {
                            TextButton(onClick = {
                                PhotoStore.delete(context)
                                update { it.copy(photoStamp = 0L) }
                            }) { Text("Revenir au dessin") }
                        }
                    }
                }
            }

            Section("Modèles (voix, oreilles, cerveau)") {
                statuses.forEach { st ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            if (st.installed) Icons.Filled.CheckCircle else Icons.Filled.ErrorOutline,
                            contentDescription = null,
                            tint = if (st.installed) CallGreen else Color(0xFFFFAB40),
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(st.kind.title, style = MaterialTheme.typography.bodyMedium)
                            Text(st.detail, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Button(onClick = onOpenModels) { Text("Installer / vérifier les modèles") }
            }

            if (s.debugUnlocked) {
                Section("Mode debug") {
                    SwitchRow("Mode debug (sous-titres, latences, transcription, saisie au clavier)", s.debugMode) { v ->
                        update { it.copy(debugMode = v) }
                    }
                    LabeledSlider(
                        "Délai max du cerveau : %.1f s (sinon phrase de secours)".format(s.llmTimeoutMs / 1000f),
                        s.llmTimeoutMs.toFloat(),
                        2000f..9000f,
                        steps = 13,
                    ) { v -> update { it.copy(llmTimeoutMs = (v / 500).roundToInt() * 500) } }
                    SwitchRow("Cerveau sur la carte graphique (GPU)", s.llmGpu) { v -> update { it.copy(llmGpu = v) } }
                    SwitchRow("Format de dialogue Gemma manuel (si réponses incohérentes)", s.llmManualTemplate) { v ->
                        update { it.copy(llmManualTemplate = v) }
                    }
                    Text(
                        "En mode debug, l'écran d'appel affiche les sous-titres, la transcription, les latences " +
                            "et un champ pour taper les réponses au clavier.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Text(
                "Version ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.4f),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        versionTaps++
                        if (versionTaps >= 7 && !s.debugUnlocked) {
                            update { it.copy(debugUnlocked = true) }
                            Toast.makeText(context, "Mode debug débloqué", Toast.LENGTH_SHORT).show()
                        }
                    }
                    .padding(8.dp),
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    val dialogChild = editing
    if (dialogChild != null || creating) {
        ChildDialog(
            initial = dialogChild,
            onDismiss = {
                editing = null
                creating = false
            },
            onSave = { child ->
                update { st ->
                    if (st.children.any { it.id == child.id }) {
                        st.copy(children = st.children.map { if (it.id == child.id) child else it })
                    } else {
                        st.copy(children = st.children + child)
                    }
                }
                editing = null
                creating = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ElevenLabsSettings(s: AppSettings, preview: VoicePreview, update: ((AppSettings) -> AppSettings) -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    Text(
        "Compte gratuit, sans carte bancaire : crée-le sur elevenlabs.io, puis Profil → API Keys → " +
            "« Create API key » (laisse toutes les autorisations), copie la clé et colle-la ici. " +
            "Le quota gratuit est limité (environ 10 000 caractères par mois, le double en mode rapide) : " +
            "chaque phrase est gardée dans le téléphone et ne coûte qu'une fois.",
        style = MaterialTheme.typography.bodySmall,
    )
    var keyDraft by remember { mutableStateOf(s.elevenKey) }
    OutlinedTextField(
        keyDraft,
        { v ->
            keyDraft = v.trim()
            update { it.copy(elevenKey = keyDraft) }
        },
        label = { Text("Clé API ElevenLabs") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
    )
    if (s.elevenKey.isBlank()) return

    var quota by remember { mutableStateOf<String?>(null) }
    var mine by remember { mutableStateOf<List<ElevenVoice>>(emptyList()) }
    var library by remember { mutableStateOf<List<ElevenVoice>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(s.elevenKey) {
        error = null
        try {
            val q = ElevenLabsTts.quota(s.elevenKey)
            quota = "Quota du mois : ${q.used} / ${q.limit} caractères utilisés"
        } catch (e: Exception) {
            quota = null
            error = "Clé refusée ou pas d'internet (${e.message})"
        }
        runCatching { mine = ElevenLabsTts.myVoices(s.elevenKey) }
    }
    quota?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFFFFAB40)) }

    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(
            selected = s.elevenModel != ElevenLabsTts.MODEL_QUALITY,
            onClick = { update { it.copy(elevenModel = ElevenLabsTts.MODEL_FAST) } },
            label = { Text("Rapide (2× plus de quota)") },
        )
        FilterChip(
            selected = s.elevenModel == ElevenLabsTts.MODEL_QUALITY,
            onClick = { update { it.copy(elevenModel = ElevenLabsTts.MODEL_QUALITY) } },
            label = { Text("Meilleure qualité") },
        )
    }

    Text(
        if (s.elevenVoiceId.isBlank()) "Aucune voix choisie." else "Voix choisie : ${s.elevenVoiceName.ifBlank { s.elevenVoiceId }}",
        fontWeight = FontWeight.Bold,
    )
    if (mine.isNotEmpty()) {
        Text("Voix de ton compte :", style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            mine.forEach { v ->
                FilterChip(
                    selected = v.voiceId == s.elevenVoiceId,
                    onClick = { update { it.copy(elevenVoiceId = v.voiceId, elevenVoiceName = v.name) } },
                    label = { Text(v.name) },
                )
            }
        }
    }
    Button(enabled = !busy, onClick = {
        busy = true
        scope.launch {
            try {
                library = ElevenLabsTts.searchLibrary(s.elevenKey)
                error = null
            } catch (e: Exception) {
                error = "Recherche impossible : ${e.message}"
            } finally {
                busy = false
            }
        }
    }) { Text(if (busy) "Recherche…" else "Chercher des voix de papy français") }
    library?.let { list ->
        if (list.isEmpty()) Text("Aucune voix trouvée.", style = MaterialTheme.typography.bodySmall)
        Text(
            "« Extrait » ne consomme pas de quota. « Choisir » ajoute la voix à ton compte " +
                "(3 voix maximum avec le compte gratuit).",
            style = MaterialTheme.typography.bodySmall,
        )
        list.forEach { v ->
            Column {
                Text(v.name, fontWeight = FontWeight.Bold)
                if (v.description.isNotBlank()) Text(v.description, style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    v.previewUrl?.let { url ->
                        OutlinedButton(onClick = { runCatching { preview.playUrl(url) } }) { Text("Extrait") }
                    }
                    OutlinedButton(enabled = !busy, onClick = {
                        busy = true
                        scope.launch {
                            try {
                                val id = ElevenLabsTts.addLibraryVoice(s.elevenKey, v)
                                update { it.copy(elevenVoiceId = id, elevenVoiceName = v.name) }
                                runCatching { mine = ElevenLabsTts.myVoices(s.elevenKey) }
                                Toast.makeText(context, "Voix « ${v.name} » choisie", Toast.LENGTH_SHORT).show()
                            } catch (e: Exception) {
                                Toast.makeText(context, "Impossible : ${e.message}", Toast.LENGTH_LONG).show()
                            } finally {
                                busy = false
                            }
                        }
                    }) { Text("Choisir") }
                }
            }
        }
    }
    Text(
        "La hauteur de voix ne se règle pas ici : choisis directement une voix de papy. " +
            "Si le quota est épuisé pendant un appel, le Père Noël continue avec la voix Google.",
        style = MaterialTheme.typography.bodySmall,
    )
}

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun LabeledSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    steps: Int = 0,
    onChange: (Float) -> Unit,
) {
    Column {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Slider(value = value.coerceIn(range), onValueChange = onChange, valueRange = range, steps = steps)
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun ChildDialog(initial: Child?, onDismiss: () -> Unit, onSave: (Child) -> Unit) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var age by remember { mutableStateOf(initial?.age?.toString() ?: "") }
    var gender by remember { mutableStateOf(initial?.gender ?: Gender.UNSPECIFIED) }
    var interests by remember { mutableStateOf(initial?.interests ?: "") }
    var wish by remember { mutableStateOf(initial?.wish ?: "") }
    val ageValue = age.toIntOrNull()
    val valid = name.isNotBlank() && ageValue != null && ageValue in 2..14

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Nouvel enfant" else "Modifier") },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(name, { name = it.take(30) }, label = { Text("Prénom") }, singleLine = true)
                OutlinedTextField(
                    age,
                    { age = it.filter(Char::isDigit).take(2) },
                    label = { Text("Âge") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                Text("Pour accorder « gentil / gentille » :", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(gender == Gender.BOY, { gender = Gender.BOY }, label = { Text("Garçon") })
                    FilterChip(gender == Gender.GIRL, { gender = Gender.GIRL }, label = { Text("Fille") })
                    FilterChip(gender == Gender.UNSPECIFIED, { gender = Gender.UNSPECIFIED }, label = { Text("Neutre") })
                }
                OutlinedTextField(interests, { interests = it.take(120) }, label = { Text("Centres d'intérêt (facultatif)") })
                OutlinedTextField(wish, { wish = it.take(120) }, label = { Text("Cadeau souhaité (facultatif)") })
            }
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = {
                val base = initial ?: Child(name = "", age = 0)
                onSave(
                    base.copy(
                        name = name.trim(),
                        age = ageValue ?: 6,
                        gender = gender,
                        interests = interests.trim(),
                        wish = wish.trim(),
                    ),
                )
            }) { Text("Enregistrer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
    )
}
