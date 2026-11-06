package fr.famille.appelperenoel.scenario

import fr.famille.appelperenoel.settings.Child
import java.text.Normalizer

/** Petits outils pour comprendre les réponses (souvent approximatives) de la reconnaissance vocale. */
object TextUtils {

    fun normalize(s: String): String = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace(Regex("[^a-z0-9 ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    fun levenshtein(a: String, b: String): Int {
        val dp = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            var prev = dp[0]
            dp[0] = i
            for (j in 1..b.length) {
                val tmp = dp[j]
                dp[j] = minOf(dp[j] + 1, dp[j - 1] + 1, prev + if (a[i - 1] == b[j - 1]) 0 else 1)
                prev = tmp
            }
        }
        return dp[b.length]
    }

    /**
     * Trouve quel enfant a parlé. Le petit modèle de Vosk écrit souvent les prénoms de travers
     * (« alicia » → « à lisa »), on compare donc sans espaces et avec une tolérance.
     */
    fun matchChild(text: String, children: List<Child>): Child? {
        val heard = normalize(text)
        if (heard.isBlank()) return null
        val compact = heard.replace(" ", "")
        val scored = children.mapNotNull { child ->
            val name = normalize(child.name).replace(" ", "")
            if (name.isEmpty()) return@mapNotNull null
            if (compact.contains(name)) return@mapNotNull child to 0
            val tolerance = maxOf(1, name.length / 3)
            var best = Int.MAX_VALUE
            for (len in (name.length - 1)..(name.length + 1)) {
                if (len <= 0 || len > compact.length) continue
                for (start in 0..compact.length - len) {
                    best = minOf(best, levenshtein(compact.substring(start, start + len), name))
                }
            }
            if (best <= tolerance) child to best else null
        }
        val best = scored.minByOrNull { it.second } ?: return null
        // Ambigu : deux prénoms aussi proches l'un que l'autre.
        if (scored.count { it.second == best.second } > 1) return null
        return best.first
    }

    private val numbers = mapOf(
        "deux" to 2, "trois" to 3, "quatre" to 4, "cinq" to 5, "six" to 6, "sept" to 7, "huit" to 8,
        "neuf" to 9, "dix" to 10, "onze" to 11, "douze" to 12, "treize" to 13, "quatorze" to 14,
    )

    /** Âge entendu dans la phrase (« j'ai six ans », « 9 »). */
    fun findAge(text: String): Int? {
        val words = normalize(text).split(" ")
        for (w in words) {
            numbers[w]?.let { return it }
            w.toIntOrNull()?.takeIf { it in 2..14 }?.let { return it }
        }
        return null
    }

    fun matchChildByAge(text: String, children: List<Child>): Child? {
        val age = findAge(text) ?: return null
        return children.filter { it.age == age }.singleOrNull()
    }

    /** La réponse à « as-tu été sage ? » ressemble-t-elle à une vraie réponse ? */
    fun looksLikeYesNo(text: String): Boolean {
        val n = " ${normalize(text)} "
        return listOf(" oui ", " non ", " ouais ", " sage ", " pas ", " un peu ", " beaucoup ", " toujours ", " bien ", " vrai ", " promis ", " jamais ", " si ")
            .any { n.contains(it) } || n.trim().split(" ").size <= 2
    }
}
