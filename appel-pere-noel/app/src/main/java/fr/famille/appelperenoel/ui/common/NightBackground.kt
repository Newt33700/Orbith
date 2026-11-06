package fr.famille.appelperenoel.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import fr.famille.appelperenoel.ui.theme.Night
import fr.famille.appelperenoel.ui.theme.NightLight
import kotlin.math.sin
import kotlin.random.Random

/** Fond de nuit d'hiver avec de la neige qui tombe. */
@Composable
fun NightBackground(snow: Boolean = true, content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Night, NightLight, Night))),
    ) {
        if (snow) SnowLayer(Modifier.fillMaxSize())
        content()
    }
}

private class Flake(val x: Float, val y: Float, val speed: Float, val radius: Float, val phase: Float)

@Composable
fun SnowLayer(modifier: Modifier = Modifier, count: Int = 70) {
    val flakes = remember {
        List(count) {
            Flake(
                x = Random.nextFloat(),
                y = Random.nextFloat(),
                speed = 0.025f + Random.nextFloat() * 0.05f,
                radius = 1.2f + Random.nextFloat() * 2.8f,
                phase = Random.nextFloat() * 6.28f,
            )
        }
    }
    var time by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (true) {
            withFrameNanos { time = (it - start) / 1_000_000_000f }
        }
    }
    Canvas(modifier) {
        flakes.forEach { f ->
            val y = ((f.y + f.speed * time) % 1f) * size.height
            val x = f.x * size.width + sin(time * 0.8f + f.phase) * 10.dp.toPx()
            drawCircle(Color.White.copy(alpha = 0.55f + f.radius / 12f), f.radius.dp.toPx(), Offset(x, y))
        }
    }
}
