package fr.famille.appelperenoel.engine

import android.os.SystemClock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

data class LoadResult(val label: String, val millis: Long, val error: String?)

/** Charge tous les moteurs en parallèle et mesure le temps de chacun. */
object EnginePreloader {
    suspend fun loadAll(engines: List<Engine>): List<LoadResult> = coroutineScope {
        engines.map { engine ->
            async(Dispatchers.Default) {
                val t0 = SystemClock.elapsedRealtime()
                val error = try {
                    engine.load()
                    null
                } catch (e: CancellationException) {
                    throw e
                } catch (t: Throwable) {
                    t.message ?: t.javaClass.simpleName
                }
                LoadResult(engine.label, SystemClock.elapsedRealtime() - t0, error)
            }
        }.awaitAll()
    }
}
