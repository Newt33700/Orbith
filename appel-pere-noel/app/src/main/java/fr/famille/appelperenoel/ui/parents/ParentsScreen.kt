package fr.famille.appelperenoel.ui.parents

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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

@OptIn(ExperimentalMaterial3Api::class)
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
                LabeledSlider("Durée maximale : ${s.maxCallMinutes} min", s.maxCallMinutes.toFloat(), 2f..10f, steps = 7) { v ->
                    update { it.copy(maxCallMinutes = v.roundToInt()) }
                }
                LabeledSlider("Durée de la sonnerie : %.1f s".format(s.ringSeconds), s.ringSeconds, 3f..6f, steps = 5) { v ->
                    update { it.copy(ringSeconds = (v * 2).roundToInt() / 2f) }
                }
                SwitchRow("Haut-parleur activé au décroché", s.speakerByDefault) { v -> update { it.copy(speakerByDefault = v) } }
                SwitchRow("Afficher les sous-titres pendant l'appel", s.showSubtitles) { v -> update { it.copy(showSubtitles = v) } }
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
                    SwitchRow("Mode debug (latences, transcription, saisie au clavier)", s.debugMode) { v ->
                        update { it.copy(debugMode = v) }
                    }
                    LabeledSlider("Silence de fin de phrase : ${s.silenceMs} ms", s.silenceMs.toFloat(), 800f..3000f, steps = 21) { v ->
                        update { it.copy(silenceMs = (v / 100).roundToInt() * 100) }
                    }
                    Text(
                        "Le réglage du silence servira à partir du jalon (b) (reconnaissance vocale).",
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
