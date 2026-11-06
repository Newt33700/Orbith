package fr.famille.appelperenoel

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import fr.famille.appelperenoel.ui.call.CallScreen
import fr.famille.appelperenoel.ui.home.HomeScreen
import fr.famille.appelperenoel.ui.parents.ParentsScreen
import fr.famille.appelperenoel.ui.setup.SetupScreen
import fr.famille.appelperenoel.ui.theme.PereNoelTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PereNoelTheme { AppRoot() }
        }
    }
}

private enum class Screen { SETUP, HOME, PARENTS, CALL }

@Composable
private fun AppRoot() {
    val app = LocalContext.current.app
    val settings by app.settings.state.collectAsState()
    val modelsVersion by app.models.version.collectAsState()
    val modelsReady = remember(modelsVersion) { app.models.allInstalled() }

    var screen by rememberSaveable {
        mutableStateOf(if (!app.settings.current.setupDone && !app.models.allInstalled()) Screen.SETUP else Screen.HOME)
    }
    var setupFromParents by rememberSaveable { mutableStateOf(false) }

    when (screen) {
        Screen.SETUP -> {
            val leave = {
                app.settings.update { it.copy(setupDone = true) }
                screen = if (setupFromParents) Screen.PARENTS else Screen.HOME
                setupFromParents = false
            }
            BackHandler(enabled = setupFromParents) { leave() }
            SetupScreen(onContinue = leave)
        }
        Screen.HOME -> HomeScreen(
            settings = settings,
            modelsReady = modelsReady,
            onCall = { screen = Screen.CALL },
            onParents = { screen = Screen.PARENTS },
        )
        Screen.PARENTS -> {
            BackHandler { screen = Screen.HOME }
            ParentsScreen(
                onBack = { screen = Screen.HOME },
                onOpenModels = {
                    setupFromParents = true
                    screen = Screen.SETUP
                },
            )
        }
        Screen.CALL -> CallScreen(settings = settings, onFinished = { screen = Screen.HOME })
    }
}
