package com.example.engine.provider

import com.example.model.Candle
import com.example.model.FreshnessState
import com.example.model.PairCatalog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class TwelveDataAdapter(private val apiKey: String? = null) : MarketDataProvider {
    override val name: String = "TWELVE_DATA"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    override fun mapSymbol(canonicalPair: String): String {
        return PairCatalog.normalize(canonicalPair) // Twelve Data expects "EUR/USD", "GBP/JPY"
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
                sanitizedFailureReason = "API_KEY_UNCONFIGURED: Twelve Data credentials not provided"
            )
        }

        val mappedSymbol = mapSymbol(validatedPair)
        val url = "https://api.twelvedata.com/time_series?symbol=${mappedSymbol}&interval=${request.timeframe.lowercase()}&outputsize=${request.limit}&apikey=${apiKey}"

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
                        sanitizedFailureReason = "HTTP_${httpResponse.code}: Twelve Data returned ${httpResponse.message}"
                    )
                }

                val bodyStr = httpResponse.body?.string() ?: ""
                val json = JSONObject(bodyStr)

                if (json.has("status") && json.getString("status") == "error") {
                    val errMsg = json.optString("message", "API Error")
                    return@withContext ProviderResponse(
                        canonicalPair = validatedPair,
                        providerName = name,
                        requestTimestampUtc = now,
                        observationTimestampUtc = now,
                        freshnessState = FreshnessState.OFFLINE,
                        currentPrice = null,
                        candles = emptyList(),
                        sanitizedFailureReason = "PROVIDER_ERROR: $errMsg"
                    )
                }

                val values = json.optJSONArray("values")
                if (values == null || values.length() == 0) {
                    return@withContext ProviderResponse(
                        canonicalPair = validatedPair,
                        providerName = name,
                        requestTimestampUtc = now,
                        observationTimestampUtc = now,
                        freshnessState = FreshnessState.DEGRADED,
                        currentPrice = null,
                        candles = emptyList(),
                        sanitizedFailureReason = "EMPTY_DATA: No candles returned for $validatedPair"
                    )
                }

                val parsedCandles = mutableListOf<Candle>()
                for (i in 0 until values.length()) {
                    val obj = values.getJSONObject(i)
                    parsedCandles.add(
                        Candle(
                            timestampUtc = now - (i * 300_000L),
                            open = obj.getDouble("open"),
                            high = obj.getDouble("high"),
                            low = obj.getDouble("low"),
                            close = obj.getDouble("close"),
                            volume = obj.optDouble("volume", 100.0)
                        )
                    )
                }
                parsedCandles.reverse() // Chronological order

                val latestPrice = parsedCandles.lastOrNull()?.close
                ProviderResponse(
                    canonicalPair = validatedPair,
                    providerName = name,
                    requestTimestampUtc = now,
                    observationTimestampUtc = now,
                    freshnessState = FreshnessState.LIVE,
                    currentPrice = latestPrice,
                    bid = latestPrice?.let { it - 0.0001 },
                    ask = latestPrice?.let { it + 0.0001 },
                    candles = parsedCandles,
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
                    sanitizedFailureReason = "NETWORK_ERROR: ${e.javaClass.simpleName} - Connection to api.twelvedata.com failed"
                )
            }
        }
    }
}
