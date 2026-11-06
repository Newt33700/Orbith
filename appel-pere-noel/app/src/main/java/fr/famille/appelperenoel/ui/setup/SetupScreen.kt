package fr.famille.appelperenoel.ui.setup

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import fr.famille.appelperenoel.app
import fr.famille.appelperenoel.models.InstallProgress
import fr.famille.appelperenoel.models.ModelKind
import fr.famille.appelperenoel.models.ModelStatus
import fr.famille.appelperenoel.ui.common.NightBackground
import fr.famille.appelperenoel.ui.theme.CallGreen

/** Écran de premier lancement : vérifie la présence des modèles et aide à les installer. */
@Composable
fun SetupScreen(onContinue: () -> Unit) {
    val context = LocalContext.current
    val app = context.app
    val version by app.models.version.collectAsState()
    val progress by app.installer.progress.collectAsState()
    val statuses = remember(version) { app.models.statuses() }
    val allReady = statuses.all { it.installed }
    var pendingKind by rememberSaveable { mutableStateOf<ModelKind?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val kind = pendingKind
        if (uri != null && kind != null) app.installer.importUri(kind, uri)
    }

    NightBackground(snow = false) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Préparer le Père Noël", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "Pour parler aux enfants sans internet, l'appli a besoin de trois modèles, rangés dans son dossier " +
                    "privé (pas dans l'APK). Une fois installés, plus besoin de connexion. " +
                    "Conseil : fais-le en Wi-Fi (environ 700 Mo en tout).",
                style = MaterialTheme.typography.bodyMedium,
            )

            progress?.let { ProgressCard(it, onDismiss = app.installer::dismiss) }

            statuses.forEach { status ->
                ModelCard(
                    status = status,
                    busy = progress?.running == true,
                    onDownload = { url -> app.installer.download(status.kind, url) },
                    onImport = {
                        pendingKind = status.kind
                        picker.launch(arrayOf("*/*"))
                    },
                    onOpenPage = { url ->
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    },
                )
            }

            Spacer(Modifier.height(4.dp))
            Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) {
                Text(if (allReady) "C'est parti !" else "Continuer en mode démo")
            }
            if (!allReady) {
                Text(
                    "En mode démo, l'appel fonctionne (sonnerie, décroché, déroulé) mais sans voix ni écoute. " +
                        "Tu pourras revenir ici depuis l'espace parents.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ModelCard(
    status: ModelStatus,
    busy: Boolean,
    onDownload: (String) -> Unit,
    onImport: () -> Unit,
    onOpenPage: (String) -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (status.installed) Icons.Filled.CheckCircle else Icons.Filled.ErrorOutline,
                    contentDescription = null,
                    tint = if (status.installed) CallGreen else Color(0xFFFFAB40),
                )
                Spacer(Modifier.width(8.dp))
                Text(status.kind.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Text(status.detail, style = MaterialTheme.typography.bodyMedium)
            Text(status.kind.description, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.75f))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                status.kind.downloads.forEach { d ->
                    Button(enabled = !busy, onClick = { onDownload(d.url) }) { Text(d.label) }
                }
                status.kind.manualUrl?.let { url ->
                    Button(onClick = { onOpenPage(url) }) { Text("Ouvrir la page") }
                }
                OutlinedButton(enabled = !busy, onClick = onImport) { Text("Importer un fichier") }
            }
        }
    }
}

@Composable
private fun ProgressCard(p: InstallProgress, onDismiss: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(p.kind.title, fontWeight = FontWeight.Bold)
            when {
                p.error != null -> {
                    Text("Échec : ${p.error}", color = Color(0xFFFFAB91))
                    TextButton(onClick = onDismiss) { Text("OK") }
                }
                p.finished -> {
                    Text("Installé !", color = CallGreen)
                    TextButton(onClick = onDismiss) { Text("OK") }
                }
                else -> {
                    val fraction = p.fraction
                    val mb = p.doneBytes / 1_000_000
                    val totalMb = if (p.totalBytes > 0) " / ${p.totalBytes / 1_000_000} Mo" else " Mo"
                    Text("${p.label} et installation… $mb$totalMb")
                    if (fraction != null) {
                        LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
                    } else {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    Text("Garde l'appli ouverte pendant l'installation.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
