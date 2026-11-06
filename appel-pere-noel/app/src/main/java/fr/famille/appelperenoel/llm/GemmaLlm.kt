package fr.famille.appelperenoel.llm

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.ProgressListener
import fr.famille.appelperenoel.engine.Engine
import fr.famille.appelperenoel.models.ModelRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.random.Random

/**
 * Cerveau local : MediaPipe LLM Inference + Gemma 3 1B (int4).
 *
 * Choisi plutôt que llama.cpp parce que c'est une simple dépendance Gradle
 * (pas de code natif à compiler) et que Google fournit le modèle déjà prêt pour Android (.task).
 */
class GemmaLlm(
    private val context: Context,
    private val models: ModelRepository,
    private val useGpu: () -> Boolean,
) : Engine {

    override val label = "Cerveau (Gemma)"

    @Volatile
    private var llm: LlmInference? = null
    private val mutex = Mutex()

    val ready: Boolean get() = llm != null

    override suspend fun load() = withContext(Dispatchers.IO) {
        mutex.withLock {
            if (llm != null) return@withLock
            val file = models.llmModelFile() ?: throw IllegalStateException("modèle Gemma absent")
            val options = LlmInference.LlmInferenceOptions.builder()
                .setModelPath(file.absolutePath)
                .setMaxTokens(1024)
                .setMaxTopK(40)
                .setPreferredBackend(if (useGpu()) LlmInference.Backend.GPU else LlmInference.Backend.CPU)
                .build()
            llm = LlmInference.createFromOptions(context, options)
        }
        // Petit échauffement : la toute première génération est toujours plus lente.
        runCatching { generate("Dis bonjour.", temperature = 0.5f) { it.isNotEmpty() } }
        Unit
    }

    /**
     * Génère une réponse.
     * @param onText appelé à chaque nouveau morceau avec le texte complet obtenu jusque-là
     * @param stopWhen renvoie vrai pour arrêter la génération (ex. : deux phrases obtenues)
     */
    suspend fun generate(
        prompt: String,
        temperature: Float = 0.7f,
        onText: (String) -> Unit = {},
        stopWhen: (String) -> Boolean = { false },
    ): String = withContext(Dispatchers.IO) {
        mutex.withLock {
            val engine = llm ?: throw IllegalStateException("cerveau non chargé")
            val session = LlmInferenceSession.createFromOptions(
                engine,
                LlmInferenceSession.LlmInferenceSessionOptions.builder()
                    .setTopK(40)
                    .setTopP(0.95f)
                    .setTemperature(temperature)
                    .setRandomSeed(Random.nextInt())
                    .build(),
            )
            try {
                session.addQueryChunk(prompt)
                val text = StringBuilder()
                var future: com.google.common.util.concurrent.ListenableFuture<String>? = null
                try {
                    suspendCancellableCoroutine { cont ->
                        var finished = false
                        val listener = ProgressListener<String> { partial, done ->
                            synchronized(text) {
                                if (finished) return@ProgressListener
                                if (partial != null) text.append(partial)
                                val current = text.toString()
                                onText(current)
                                if (done || stopWhen(current)) {
                                    finished = true
                                    if (!done) runCatching { session.cancelGenerateResponseAsync() }
                                    if (cont.isActive) cont.resume(Unit)
                                }
                            }
                        }
                        future = session.generateResponseAsync(listener)
                        cont.invokeOnCancellation { runCatching { session.cancelGenerateResponseAsync() } }
                    }
                } finally {
                    // Attendre la vraie fin du calcul avant de fermer la session (sinon plantage natif possible).
                    runCatching { future?.get(5, TimeUnit.SECONDS) }
                }
                synchronized(text) { text.toString() }
            } catch (e: CancellationException) {
                throw e
            } finally {
                runCatching { session.close() }
            }
        }
    }

    /** Attend la fin d'une génération éventuelle avant de libérer (sinon plantage natif). */
    override fun release() = runBlocking {
        mutex.withLock {
            runCatching { llm?.close() }
            llm = null
        }
    }
}
