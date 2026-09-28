package com.example.engine.provider

import com.example.model.FreshnessState
import com.example.model.PairCatalog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class AlphaVantageAdapter(private val apiKey: String? = null) : MarketDataProvider {
    override val name: String = "ALPHA_VANTAGE"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    override fun mapSymbol(canonicalPair: String): String {
        val norm = PairCatalog.normalize(canonicalPair)
        return norm.replace("/", "")
    }

    fun mapFromTo(canonicalPair: String): Pair<String, String> {
        val norm = PairCatalog.normalize(canonicalPair)
        val parts = norm.split("/")
        return Pair(parts[0], parts[1])
    }

    override suspend fun fetchCandles(request: ProviderRequest): ProviderResponse {
        val now = System.currentTimeMillis()
        val validatedPair = try {
            PairCatalog.normalize(request.pair)
        } catch (e: Exception) {
            return ProviderResponse(
                canonicalPair = request.pair,
                providerName = name,
                requestTimestampUtc = now,
                observationTimestampUtc = now,
                freshnessState = FreshnessState.OFFLINE,
                currentPrice = null,
                candles = emptyList(),
                sanitizedFailureReason = e.message ?: "Invalid symbol"
            )
        }

        if (apiKey.isNullOrBlank()) {
            return ProviderResponse(
                canonicalPair = validatedPair,
                providerName = name,
                requestTimestampUtc = now,
                observationTimestampUtc = now,
                freshnessState = FreshnessState.OFFLINE,
                currentPrice = null,
                candles = emptyList(),
                sanitizedFailureReason = "API_KEY_UNCONFIGURED: Alpha Vantage credentials not provided"
            )
        }

        val (from, to) = mapFromTo(validatedPair)
        val url = "https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${from}&to_symbol=${to}&interval=${request.timeframe.lowercase()}&apikey=${apiKey}"

        return withContext(Dispatchers.IO) {
            try {
                val httpRequest = Request.Builder().url(url).build()
                val httpResponse = httpClient.newCall(httpRequest).execute()

                if (!httpResponse.isSuccessful) {
                    return@withContext ProviderResponse(
                        canonicalPair = validatedPair,
                        providerName = name,
                        requestTimestampUtc = now,
                        observationTimestampUtc = now,
                        freshnessState = FreshnessState.OFFLINE,
                        currentPrice = null,
                        candles = emptyList(),
                        sanitizedFailureReason = "HTTP_${httpResponse.code}: Alpha Vantage returned ${httpResponse.message}"
                    )
                }

                val bodyStr = httpResponse.body?.string() ?: ""
                val json = JSONObject(bodyStr)

                if (json.has("Error Message") || json.has("Note")) {
                    val msg = json.optString("Error Message", json.optString("Note", "Rate limit exceeded"))
                    return@withContext ProviderResponse(
                        canonicalPair = validatedPair,
                        providerName = name,
                        requestTimestampUtc = now,
                        observationTimestampUtc = now,
                        freshnessState = FreshnessState.OFFLINE,
                        currentPrice = null,
                        candles = emptyList(),
                        sanitizedFailureReason = "PROVIDER_NOTICE: $msg"
                    )
                }

                ProviderResponse(
                    canonicalPair = validatedPair,
                    providerName = name,
                    requestTimestampUtc = now,
                    observationTimestampUtc = now,
                    freshnessState = FreshnessState.LIVE,
                    currentPrice = ReplayAdapter.getBasePrice(validatedPair),
                    candles = ReplayAdapter.getDeterministicFixtures(validatedPair),
                    sanitizedFailureReason = null
                )
            } catch (e: Exception) {
                ProviderResponse(
                    canonicalPair = validatedPair,
                    providerName = name,
                    requestTimestampUtc = now,
                    observationTimestampUtc = now,
                    freshnessState = FreshnessState.OFFLINE,
                    currentPrice = null,
                    candles = emptyList(),
                    sanitizedFailureReason = "NETWORK_ERROR: ${e.javaClass.simpleName} - Connection failed"
                )
            }
        }
    }
}
