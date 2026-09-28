package com.example.engine.provider

import com.example.model.Candle
import com.example.model.FreshnessState
import com.example.model.PairCatalog

class ReplayAdapter : MarketDataProvider {
    override val name: String = "REPLAY"

    override fun mapSymbol(canonicalPair: String): String {
        return PairCatalog.normalize(canonicalPair)
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

        val baseCandles = getDeterministicFixtures(validatedPair)
        val currentPrice = baseCandles.lastOrNull()?.close

        return ProviderResponse(
            canonicalPair = validatedPair,
            providerName = name,
            requestTimestampUtc = now,
            observationTimestampUtc = now - 30_000L,
            freshnessState = FreshnessState.REPLAY,
            currentPrice = currentPrice,
            bid = currentPrice?.let { it - 0.0001 },
            ask = currentPrice?.let { it + 0.0001 },
            candles = baseCandles,
            sanitizedFailureReason = null
        )
    }

    companion object {
        fun getBasePrice(pair: String): Double {
            return when (pair) {
                // Major 20
                "EUR/USD" -> 1.08500
                "GBP/USD" -> 1.29500
                "USD/JPY" -> 154.500
                "AUD/USD" -> 0.65500
                "USD/CHF" -> 0.88500
                "USD/CAD" -> 1.38500
                "NZD/USD" -> 0.59500
                "EUR/JPY" -> 167.500
                "GBP/JPY" -> 200.200
                "EUR/GBP" -> 0.83800
                "EUR/CHF" -> 0.96000
                "EUR/CAD" -> 1.50300
                "EUR/AUD" -> 1.65600
                "EUR/NZD" -> 1.82400
                "GBP/CHF" -> 1.14600
                "GBP/CAD" -> 1.79400
                "GBP/AUD" -> 1.97700
                "AUD/JPY" -> 101.200
                "CAD/JPY" -> 111.500
                "CHF/JPY" -> 174.600

                // Minor / Cross 20
                "GBP/NZD" -> 2.17600
                "AUD/CAD" -> 0.90700
                "AUD/CHF" -> 0.58000
                "AUD/NZD" -> 1.10100
                "CAD/CHF" -> 0.63900
                "NZD/JPY" -> 91.900
                "NZD/CAD" -> 0.82400
                "NZD/CHF" -> 0.52700
                "EUR/HKD" -> 8.46000
                "GBP/HKD" -> 10.10000
                "EUR/SGD" -> 1.44200
                "GBP/SGD" -> 1.72100
                "AUD/SGD" -> 0.87100
                "EUR/SEK" -> 11.38000
                "EUR/NOK" -> 11.59000
                "GBP/SEK" -> 13.58000
                "EUR/TRY" -> 37.15000
                "GBP/TRY" -> 44.35000
                "EUR/ZAR" -> 19.32000
                "GBP/ZAR" -> 23.08000

                else -> throw IllegalArgumentException("Deterministic ValidationError: No fixture for '$pair'")
            }
        }

        fun getDeterministicFixtures(pair: String): List<Candle> {
            val basePrice = getBasePrice(pair)
            val isJpy = pair.endsWith("JPY")
            val isExotic = pair.endsWith("TRY") || pair.endsWith("ZAR") || pair.endsWith("SEK") || pair.endsWith("NOK")
            val scale = when {
                isJpy -> 0.10
                isExotic -> 0.05
                else -> 0.0002
            }
            val baseTime = 1774000000000L

            return listOf(
                Candle(baseTime + 0L, basePrice, basePrice + (2 * scale), basePrice - (1 * scale), basePrice + (1 * scale), 120.0),
                Candle(baseTime + 300000L, basePrice + (1 * scale), basePrice + (4 * scale), basePrice + (0.5 * scale), basePrice + (3.5 * scale), 150.0),
                Candle(baseTime + 600000L, basePrice + (3.5 * scale), basePrice + (8 * scale), basePrice + (3.0 * scale), basePrice + (7.5 * scale), 320.0),
                // Gap / FVG formed between candle 2 and candle 4
                Candle(baseTime + 900000L, basePrice + (7.5 * scale), basePrice + (14 * scale), basePrice + (7.0 * scale), basePrice + (13.5 * scale), 450.0),
                Candle(baseTime + 1200000L, basePrice + (13.5 * scale), basePrice + (16 * scale), basePrice + (12.0 * scale), basePrice + (15.0 * scale), 280.0),
                Candle(baseTime + 1500000L, basePrice + (15.0 * scale), basePrice + (15.2 * scale), basePrice + (10.0 * scale), basePrice + (11.0 * scale), 190.0),
                Candle(baseTime + 1800000L, basePrice + (11.0 * scale), basePrice + (11.5 * scale), basePrice + (8.5 * scale), basePrice + (9.0 * scale), 210.0),
                Candle(baseTime + 2100000L, basePrice + (9.0 * scale), basePrice + (12.0 * scale), basePrice + (8.8 * scale), basePrice + (11.5 * scale), 250.0)
            )
        }

        /**
         * Next candle simulation for Win/Loss outcome testing.
         * Generates a following candle to evaluate direction outcome.
         */
        fun getNextCandle(pair: String, shouldWin: Boolean, isBullishSignal: Boolean): Candle {
            val basePrice = getBasePrice(pair)
            val isJpy = pair.endsWith("JPY")
            val isExotic = pair.endsWith("TRY") || pair.endsWith("ZAR") || pair.endsWith("SEK") || pair.endsWith("NOK")
            val scale = when {
                isJpy -> 0.10
                isExotic -> 0.05
                else -> 0.0002
            }
            val openPrice = basePrice + (11.5 * scale)

            return if (shouldWin) {
                if (isBullishSignal) {
                    // Bullish Win: Close higher than open
                    Candle(1774002400000L, openPrice, openPrice + (5 * scale), openPrice - (1 * scale), openPrice + (4 * scale), 300.0)
                } else {
                    // Bearish Win: Close lower than open
                    Candle(1774002400000L, openPrice, openPrice + (1 * scale), openPrice - (5 * scale), openPrice - (4 * scale), 300.0)
                }
            } else {
                if (isBullishSignal) {
                    // Bullish Loss: Close lower than open
                    Candle(1774002400000L, openPrice, openPrice + (1 * scale), openPrice - (6 * scale), openPrice - (5 * scale), 280.0)
                } else {
                    // Bearish Loss: Close higher than open
                    Candle(1774002400000L, openPrice, openPrice + (6 * scale), openPrice - (1 * scale), openPrice + (5 * scale), 280.0)
                }
            }
        }
    }
}
