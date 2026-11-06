package fr.famille.appelperenoel.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Night = Color(0xFF0B1A33)
val NightLight = Color(0xFF1E3A5F)
val SantaRed = Color(0xFFC62828)
val CallGreen = Color(0xFF2E9D4A)
val Gold = Color(0xFFFFD54F)
val Snow = Color(0xFFF5F7FA)

private val colors = darkColorScheme(
    primary = SantaRed,
    onPrimary = Color.White,
    secondary = CallGreen,
    onSecondary = Color.White,
    tertiary = Gold,
    background = Night,
    onBackground = Snow,
    surface = Color(0xFF13284A),
    onSurface = Snow,
    surfaceVariant = Color(0xFF1C355C),
    onSurfaceVariant = Color(0xFFCFD8E6),
)

@Composable
fun PereNoelTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
