package fr.famille.appelperenoel.ui.home

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.ui.common.NightBackground
import fr.famille.appelperenoel.ui.common.SantaPortrait
import fr.famille.appelperenoel.ui.theme.CallGreen
import fr.famille.appelperenoel.ui.theme.Gold
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

@Composable
fun HomeScreen(
    settings: AppSettings,
    modelsReady: Boolean,
    onCall: () -> Unit,
    onParents: () -> Unit,
) {
    val context = LocalContext.current
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        onCall() // Même sans micro, l'appel démarre (mode démo).
    }
    var showGate by remember { mutableStateOf(false) }

    NightBackground {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(0.6f))
            Text(
                "Appelle le\nPère Noël",
                color = Color.White,
                fontSize = 40.sp,
                lineHeight = 44.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))
            SantaPortrait(Modifier.size(230.dp), settings.photoStamp)
            Spacer(Modifier.weight(1f))
            BigCallButton {
                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                    PackageManager.PERMISSION_GRANTED
                if (granted) onCall() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
            }
            Spacer(Modifier.weight(1f))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Text(
                    if (modelsReady) "" else "mode démo",
                    color = Color.White.copy(alpha = 0.35f),
                    style = MaterialTheme.typography.labelSmall,
                )
                ParentsLongPress(onUnlocked = { showGate = true })
            }
        }
    }

    if (showGate) {
        ParentsGateDialog(
            onDismiss = { showGate = false },
            onSuccess = {
                showGate = false
                onParents()
            },
        )
    }
}

@Composable
private fun BigCallButton(onClick: () -> Unit) {
    val pulse = rememberInfiniteTransition(label = "pulse")
    val scale by pulse.animateFloat(
        initialValue = 1f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "scale",
    )
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(150.dp)
                    .scale(scale)
                    .clip(CircleShape)
                    .background(CallGreen.copy(alpha = 0.25f)),
            )
            Box(
                Modifier
                    .size(124.dp)
                    .clip(CircleShape)
                    .background(CallGreen)
                    .pointerInput(Unit) { detectTapGestures(onTap = { onClick() }) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Call, contentDescription = "Appeler", tint = Color.White, modifier = Modifier.size(62.dp))
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Appeler", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
    }
}

/** Bouton discret : il faut garder le doigt appuyé 3 secondes. */
@Composable
private fun ParentsLongPress(onUnlocked: () -> Unit) {
    var progress by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    Column(horizontalAlignment = Alignment.End) {
        if (progress > 0f) {
            Text("Garde le doigt appuyé…", color = Gold.copy(alpha = 0.8f), style = MaterialTheme.typography.labelSmall)
        }
        Box(
            Modifier
                .padding(top = 4.dp)
                .pointerInput(Unit) {
                    detectTapGestures(onPress = {
                        val job = scope.launch {
                            val start = System.currentTimeMillis()
                            while (true) {
                                val p = (System.currentTimeMillis() - start) / 3000f
                                progress = p.coerceAtMost(1f)
                                if (p >= 1f) {
                                    progress = 0f
                                    onUnlocked()
                                    break
                                }
                                delay(16)
                            }
                        }
                        tryAwaitRelease()
                        job.cancel()
                        progress = 0f
                    })
                }
                .padding(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (progress > 0f) {
                CircularProgressIndicator(progress = { progress }, modifier = Modifier.size(44.dp), color = Gold)
            }
            Text("Parents", color = Color.White.copy(alpha = 0.35f), style = MaterialTheme.typography.labelMedium)
        }
    }
}

/** Petit calcul que les parents résolvent facilement, mais pas un enfant de 6 ans. */
@Composable
fun ParentsGateDialog(onDismiss: () -> Unit, onSuccess: () -> Unit) {
    val a = remember { Random.nextInt(12, 20) }
    val b = remember { Random.nextInt(3, 10) }
    var answer by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Espace parents") },
        text = {
            Column {
                Text("Combien font $a × $b ?")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = answer,
                    onValueChange = {
                        answer = it.filter(Char::isDigit).take(4)
                        error = false
                    },
                    singleLine = true,
                    isError = error,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    supportingText = { if (error) Text("Ce n'est pas ça.") },
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { if (answer.toIntOrNull() == a * b) onSuccess() else error = true }) { Text("Valider") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
    )
}
