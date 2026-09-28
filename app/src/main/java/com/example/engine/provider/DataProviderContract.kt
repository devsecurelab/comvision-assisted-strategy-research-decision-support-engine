package com.example.engine.provider

import com.example.model.Candle
import com.example.model.FreshnessState
import com.example.model.PairCatalog

data class ProviderRequest(
    val pair: String,
    val timeframe: String = "M5",
    val limit: Int = 50
)

data class ProviderResponse(
    val canonicalPair: String,
    val providerName: String,
    val requestTimestampUtc: Long,
    val observationTimestampUtc: Long,
    val freshnessState: FreshnessState,
    val currentPrice: Double?,
    val bid: Double? = null,
    val ask: Double? = null,
    val candles: List<Candle>,
    val sanitizedFailureReason: String? = null
)

interface MarketDataProvider {
    val name: String
    fun mapSymbol(canonicalPair: String): String
    suspend fun fetchCandles(request: ProviderRequest): ProviderResponse
}
