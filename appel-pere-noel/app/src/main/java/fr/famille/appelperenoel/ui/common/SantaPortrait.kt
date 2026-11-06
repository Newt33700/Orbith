package fr.famille.appelperenoel.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import fr.famille.appelperenoel.ui.theme.Gold
import fr.famille.appelperenoel.ui.theme.NightLight
import fr.famille.appelperenoel.ui.theme.Night
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Portrait rond du Père Noël : la photo choisie par les parents, sinon un dessin. */
@Composable
fun SantaPortrait(modifier: Modifier = Modifier, photoStamp: Long) {
    val context = LocalContext.current
    val photo by produceState<ImageBitmap?>(initialValue = null, photoStamp) {
        value = if (photoStamp == 0L) {
            null
        } else {
            withContext(Dispatchers.IO) { PhotoStore.load(context, 800)?.asImageBitmap() }
        }
    }
    Box(
        modifier
            .clip(CircleShape)
            .background(Night)
            .border(4.dp, Gold, CircleShape),
    ) {
        val p = photo
        if (p != null) {
            Image(p, contentDescription = "Père Noël", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            Canvas(Modifier.fillMaxSize()) { drawSanta() }
        }
    }
}

private fun DrawScope.drawSanta() {
    val w = size.width
    val h = size.height
    fun p(x: Float, y: Float) = Offset(x * w, y * h)
    fun s(x: Float, y: Float) = Size(x * w, y * h)

    val red = Color(0xFFD32F2F)
    val darkRed = Color(0xFFA31515)
    val white = Color(0xFFFDFDFD)
    val shade = Color(0xFFE3E7EE)
    val skin = Color(0xFFF7C9A6)

    drawRect(Brush.verticalGradient(listOf(NightLight, Night)))

    // Manteau rouge en bas
    drawOval(red, topLeft = p(0.12f, 0.80f), size = s(0.76f, 0.45f))
    drawRect(white, topLeft = p(0.47f, 0.84f), size = s(0.06f, 0.2f))

    // Bonnet
    val hat = Path().apply {
        moveTo(0.26f * w, 0.40f * h)
        cubicTo(0.30f * w, 0.18f * h, 0.55f * w, 0.05f * h, 0.81f * w, 0.17f * h)
        cubicTo(0.70f * w, 0.22f * h, 0.70f * w, 0.30f * h, 0.74f * w, 0.40f * h)
        close()
    }
    drawPath(hat, red)
    val hatShade = Path().apply {
        moveTo(0.62f * w, 0.40f * h)
        cubicTo(0.64f * w, 0.28f * h, 0.70f * w, 0.20f * h, 0.81f * w, 0.17f * h)
        cubicTo(0.70f * w, 0.22f * h, 0.70f * w, 0.30f * h, 0.74f * w, 0.40f * h)
        close()
    }
    drawPath(hatShade, darkRed)

    // Visage
    drawCircle(skin, 0.21f * w, p(0.5f, 0.52f))

    // Barbe
    listOf(
        0.30f to 0.62f, 0.34f to 0.73f, 0.41f to 0.81f, 0.5f to 0.85f,
        0.59f to 0.81f, 0.66f to 0.73f, 0.70f to 0.62f,
    ).forEach { (x, y) -> drawCircle(shade, 0.12f * w, p(x, y + 0.01f)) }
    listOf(
        0.30f to 0.62f, 0.34f to 0.73f, 0.41f to 0.81f, 0.5f to 0.84f,
        0.59f to 0.81f, 0.66f to 0.73f, 0.70f to 0.62f, 0.5f to 0.72f,
    ).forEach { (x, y) -> drawCircle(white, 0.115f * w, p(x, y)) }

    // Bouche
    drawArc(
        color = Color(0xFF8E2A2A),
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = true,
        topLeft = p(0.455f, 0.615f),
        size = s(0.09f, 0.07f),
    )

    // Moustache
    drawOval(white, topLeft = p(0.35f, 0.57f), size = s(0.16f, 0.075f))
    drawOval(white, topLeft = p(0.49f, 0.57f), size = s(0.16f, 0.075f))

    // Nez, joues, yeux, sourcils
    drawCircle(Color(0xFFE99A8C), 0.036f * w, p(0.5f, 0.555f))
    drawCircle(Color(0x55FF5A5A), 0.042f * w, p(0.365f, 0.535f))
    drawCircle(Color(0x55FF5A5A), 0.042f * w, p(0.635f, 0.535f))
    drawCircle(Color(0xFF2B1B17), 0.019f * w, p(0.43f, 0.49f))
    drawCircle(Color(0xFF2B1B17), 0.019f * w, p(0.57f, 0.49f))
    drawCircle(Color.White, 0.006f * w, p(0.436f, 0.484f))
    drawCircle(Color.White, 0.006f * w, p(0.576f, 0.484f))
    drawOval(white, topLeft = p(0.385f, 0.445f), size = s(0.09f, 0.03f))
    drawOval(white, topLeft = p(0.525f, 0.445f), size = s(0.09f, 0.03f))

    // Bord du bonnet et pompon
    drawRoundRect(white, topLeft = p(0.22f, 0.36f), size = s(0.56f, 0.09f), cornerRadius = CornerRadius(0.045f * w))
    drawCircle(white, 0.062f * w, p(0.81f, 0.18f))
}
