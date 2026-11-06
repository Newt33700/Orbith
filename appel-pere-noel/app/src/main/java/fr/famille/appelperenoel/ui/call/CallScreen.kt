package fr.famille.appelperenoel.ui.call

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.famille.appelperenoel.app
import fr.famille.appelperenoel.settings.AppSettings
import fr.famille.appelperenoel.ui.common.NightBackground
import fr.famille.appelperenoel.ui.common.SantaPortrait
import fr.famille.appelperenoel.ui.theme.CallGreen
import fr.famille.appelperenoel.ui.theme.Gold
import fr.famille.appelperenoel.ui.theme.SantaRed
import kotlinx.coroutines.delay

@Composable
fun CallScreen(settings: AppSettings, onFinished: () -> Unit) {
    val context = LocalContext.current
    val controller = remember { CallController(context.applicationContext, settings, context.app.models) }
    DisposableEffect(controller) {
        controller.start()
        onDispose { controller.dispose() }
    }
    KeepScreenOn()
    BackHandler { controller.hangUp() }

    val st by controller.state.collectAsState()
    LaunchedEffect(st.phase) {
        if (st.phase == CallPhase.ENDED) {
            delay(1800)
            onFinished()
        }
    }

    NightBackground(snow = st.phase != CallPhase.ENDED) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (settings.debugMode) DebugPanel(st)
            Spacer(Modifier.height(24.dp))
            SpeakingPortrait(st.santaSpeaking, settings.photoStamp)
            Spacer(Modifier.height(20.dp))
            Text("Père Noël", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            Text("Pôle Nord", color = Color.White.copy(alpha = 0.6f), fontSize = 16.sp)
            Spacer(Modifier.height(10.dp))
            Text(
                text = when (st.phase) {
                    CallPhase.RINGING -> "Appel en cours…"
                    CallPhase.CONNECTED -> formatClock(st.elapsedSeconds)
                    CallPhase.ENDED -> "Appel terminé"
                },
                color = if (st.phase == CallPhase.ENDED) SantaRed else Color.White.copy(alpha = 0.85f),
                fontSize = 22.sp,
                fontFamily = if (st.phase == CallPhase.CONNECTED) FontFamily.Monospace else FontFamily.Default,
            )

            Spacer(Modifier.weight(1f))

            if (st.phase == CallPhase.CONNECTED) {
                ListeningHint(st.listening)
                Spacer(Modifier.height(12.dp))
                val subtitle = st.subtitle
                if (settings.showSubtitles && subtitle != null) {
                    Text(
                        subtitle,
                        color = Color.White,
                        fontSize = 20.sp,
                        lineHeight = 26.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 90.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(Color.Black.copy(alpha = 0.25f))
                            .padding(16.dp),
                    )
                }
            }

            Spacer(Modifier.weight(1f))

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.Top,
            ) {
                RoundAction(
                    icon = Icons.AutoMirrored.Filled.VolumeUp,
                    label = "Haut-parleur",
                    background = if (st.speakerOn) Color.White else Color.White.copy(alpha = 0.18f),
                    tint = if (st.speakerOn) Color.Black else Color.White,
                    size = 76,
                    enabled = st.phase != CallPhase.ENDED,
                    onClick = controller::toggleSpeaker,
                )
                RoundAction(
                    icon = Icons.Filled.CallEnd,
                    label = "Raccrocher",
                    background = SantaRed,
                    tint = Color.White,
                    size = 88,
                    enabled = st.phase != CallPhase.ENDED,
                    onClick = controller::hangUp,
                )
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SpeakingPortrait(speaking: Boolean, photoStamp: Long) {
    val transition = rememberInfiniteTransition(label = "speak")
    val pulse by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(tween(260), RepeatMode.Reverse),
        label = "pulse",
    )
    Box(contentAlignment = Alignment.Center) {
        if (speaking) {
            Box(
                Modifier
                    .size(200.dp)
                    .scale(pulse * 1.04f)
                    .clip(CircleShape)
                    .background(Gold.copy(alpha = 0.25f)),
            )
        }
        SantaPortrait(Modifier.size(180.dp).scale(if (speaking) pulse else 1f), photoStamp)
    }
}

@Composable
private fun ListeningHint(listening: Boolean) {
    AnimatedVisibility(visible = listening, enter = fadeIn(), exit = fadeOut()) {
        val transition = rememberInfiniteTransition(label = "mic")
        val alpha by transition.animateFloat(
            initialValue = 0.5f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(600), RepeatMode.Reverse),
            label = "alpha",
        )
        Row(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(CallGreen.copy(alpha = alpha))
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Mic, contentDescription = null, tint = Color.White)
            Spacer(Modifier.size(8.dp))
            Text("À toi de parler !", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun RoundAction(
    icon: ImageVector,
    label: String,
    background: Color,
    tint: Color,
    size: Int,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(if (enabled) background else background.copy(alpha = 0.3f))
                .clickable(enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size((size * 0.45f).dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(label, color = Color.White.copy(alpha = 0.85f), fontSize = 14.sp)
    }
}

@Composable
private fun DebugPanel(st: CallUiState) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(10.dp),
    ) {
        Text("DEBUG · ${st.phase} · ${if (st.demoMode) "démo" else "réel"}", color = Gold, style = MaterialTheme.typography.labelMedium)
        if (st.ringMillis > 0) {
            Text("Sonnerie : ${st.ringMillis} ms", color = Color.White, style = MaterialTheme.typography.labelSmall)
        }
        st.loadResults.forEach { r ->
            Text(
                "Chargement ${r.label} : ${r.millis} ms" + (r.error?.let { " — $it" } ?: ""),
                color = if (r.error == null) Color.White else Color(0xFFFFAB91),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

/** Empêche l'écran de s'éteindre pendant l'appel. */
@Composable
private fun KeepScreenOn() {
    val view = LocalView.current
    DisposableEffect(view) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }
}

private fun formatClock(seconds: Int) = "%02d:%02d".format(seconds / 60, seconds % 60)
