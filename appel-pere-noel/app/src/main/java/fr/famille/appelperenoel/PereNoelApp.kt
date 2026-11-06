package fr.famille.appelperenoel

import android.app.Application
import android.content.Context
import fr.famille.appelperenoel.models.ModelInstaller
import fr.famille.appelperenoel.models.ModelRepository
import fr.famille.appelperenoel.settings.SettingsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Point d'entrée : contient les quelques objets partagés par toute l'appli. */
class PereNoelApp : Application() {

    /** Portée qui survit aux écrans (ex. : un téléchargement de modèle continue si on change d'écran). */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    lateinit var settings: SettingsRepository
        private set
    lateinit var models: ModelRepository
        private set
    lateinit var installer: ModelInstaller
        private set

    override fun onCreate() {
        super.onCreate()
        settings = SettingsRepository(this)
        models = ModelRepository(this)
        installer = ModelInstaller(this, models, appScope)
    }
}

val Context.app: PereNoelApp
    get() = applicationContext as PereNoelApp
