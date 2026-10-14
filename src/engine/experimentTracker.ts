// Controlled Experiment Tracker (EXP-2026-V2-001)
// Strategy v2.0-FROZEN Master Specification: First 100 Valid Setups Controlled Experiment
// Integrated with Durable Persistence Storage (survives server restart & redeployment)

import { MasterTelemetry, UserRecordedAction, NextCandleObservation } from './types';
import { ACTIVE_STRATEGY_VERSION, ACTIVE_EXPERIMENT_ID, CONFIG_HASH, STRATEGY_MANIFEST } from './manifest';
import { durableStorage, SignalOutcome, SignalOutcomeRecord } from '../server/storage';

export interface ExperimentStats {
  experimentId: string;
  strategyVersion: string;
  configHash: string;
  isLocked: boolean;
  scannerActive: boolean;
  alertsMuted: boolean;
  totalCandidateFramesEvaluated: number;
  validSetupsCount: number; // Max 100 target
  targetValidSetups: number;
  rejectedSetupsCount: number;
  inconclusiveCount: number;
  userConfirmedActionsCount: number;
  recordedFavorable: number;
  recordedUnfavorable: number;
  recordedNeutral: number;
  recordedNotTaken: number;
  recordedTaken: number;
  // Legacy compatibility counts
  recordedWins: number;
  recordedLosses: number;
  recordedSkipped: number;
  winRatePercentage: number;
}

export class ExperimentManager {
  private experimentId = ACTIVE_EXPERIMENT_ID;
  private strategyVersion = ACTIVE_STRATEGY_VERSION;
  private configHash = CONFIG_HASH;
  private isLocked = true; // Scope frozen for 100 setups
  private scannerActive = true;
  private alertsMuted = false;

  private candidatesHistory: MasterTelemetry[] = [];
  private currentActiveAlert: MasterTelemetry | null = null;
  private lastHash = '0'.repeat(64); // Genesis hash for SHA-256 chain
  private setupCounter = 1;

  constructor() {
    this.initializeFromStorage();
  }

  /**
   * Cryptographic SHA-256 Hash Computation
   */
  public computeHash(str: string): string {
    function rightRotate(val: number, amt: number) {
      return (val >>> amt) | (val << (32 - amt));
    }
    let i = 0, j = 0;
    let result = '';
    const words: number[] = [];
    const asciiBitLength = str.length * 8;
    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    for (i = 0; i < str.length; i++) {
      j = str.charCodeAt(i);
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

    for (i = 0; i < words.length; i += 16) {
      const w = words.slice(i, i + 16);
      const oldHash = hash.slice(0);
      for (j = 0; j < 64; j++) {
        if (j >= 16) {
          const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
        const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
        const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
        const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
        const temp1 = (hash[7] + s1 + ch + k[j] + w[j]) | 0;
        const temp2 = (s0 + maj) | 0;

        hash[7] = hash[6];
        hash[6] = hash[5];
        hash[5] = hash[4];
        hash[4] = (hash[3] + temp1) | 0;
        hash[3] = hash[2];
        hash[2] = hash[1];
        hash[1] = hash[0];
        hash[0] = (temp1 + temp2) | 0;
      }
      for (j = 0; j < 8; j++) {
        hash[j] = (hash[j] + oldHash[j]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j >= 0; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  private initializeFromStorage() {
    // 1. Load experiment state
    const state = durableStorage.loadExperimentState();
    if (state) {
      this.experimentId = ACTIVE_EXPERIMENT_ID; // Force v2.0 experiment ID
      this.strategyVersion = ACTIVE_STRATEGY_VERSION;
      this.configHash = CONFIG_HASH;
      this.isLocked = state.isLocked !== undefined ? state.isLocked : true;
      this.scannerActive = state.scannerActive !== undefined ? state.scannerActive : true;
      this.alertsMuted = state.alertsMuted !== undefined ? state.alertsMuted : false;
      this.lastHash = state.lastHash || '0'.repeat(64);
    }

    // 2. Load candidates from durable storage
    const stored = durableStorage.loadCandidates();
    if (stored && stored.length > 0) {
      // Deduplicate by setup_id to ensure key uniqueness
      const seenIds = new Set<string>();
      const deduped: MasterTelemetry[] = [];
      for (const item of stored) {
        const sid = item.metadata?.setup_id;
        if (!sid || !seenIds.has(sid)) {
          if (sid) seenIds.add(sid);
          deduped.push(item);
        }
      }
      this.candidatesHistory = deduped;
      // Re-establish setup counter and lastHash
      const v2Records = deduped.filter((c) => c.metadata.setup_id?.startsWith('V2-'));
      this.setupCounter = v2Records.length + 1;

      const validLast = deduped.find((c) => c.metadata.sha256_hash);
      if (validLast?.metadata.sha256_hash) {
        this.lastHash = validLast.metadata.sha256_hash;
      }
      const latestValid = deduped.find((c) => c.system_execution.system_decision === 'PASS');
      this.currentActiveAlert = latestValid || deduped[0] || null;
    }
  }

  public resetForTesting() {
    this.candidatesHistory = [];
    this.currentActiveAlert = null;
    this.lastHash = '0'.repeat(64);
    this.isLocked = true;
    this.scannerActive = true;
    this.alertsMuted = false;
    this.setupCounter = 1;
  }

  private persist() {
    durableStorage.saveCandidates(this.candidatesHistory);
    durableStorage.saveExperimentState({
      experimentId: this.experimentId,
      strategyVersion: this.strategyVersion,
      isLocked: this.isLocked,
      scannerActive: this.scannerActive,
      alertsMuted: this.alertsMuted,
      lastHash: this.lastHash,
      targetValidSetups: STRATEGY_MANIFEST.scope_freeze.target_valid_setups,
      updatedAt: new Date().toISOString(),
    });
  }

  public getExperimentId(): string {
    return this.experimentId;
  }

  public getStrategyVersion(): string {
    return this.strategyVersion;
  }

  public getConfigHash(): string {
    return this.configHash;
  }

  public isExperimentLocked(): boolean {
    return this.isLocked;
  }

  public setExperimentLocked(locked: boolean) {
    this.isLocked = locked;
    this.persist();
  }

  public isScannerActive(): boolean {
    return this.scannerActive;
  }

  public setScannerActive(active: boolean) {
    this.scannerActive = active;
    this.persist();
  }

  public isAlertsMuted(): boolean {
    return this.alertsMuted;
  }

  public setAlertsMuted(muted: boolean) {
    this.alertsMuted = muted;
    this.persist();
  }

  public enforceScopeFreeze(paramChange?: string): { allowed: boolean; reason: string } {
    if (this.isLocked) {
      return {
        allowed: false,
        reason: `Scope Freeze Active: Controlled Experiment ${this.experimentId} is locked for first ${STRATEGY_MANIFEST.scope_freeze.target_valid_setups} setups. Strategy v2.0 parameters are immutable. Attempted change: ${paramChange || 'unknown'}`,
      };
    }
    return { allowed: true, reason: 'Unlocked' };
  }

  public checkFrozenMutation(mutations: Record<string, any>): { allowed: boolean; reason?: string; field?: string } {
    if (!this.isLocked) {
      return { allowed: true };
    }

    const FROZEN_FIELDS = [
      'maxWickRatio',
      'fibEquilibriumLevel',
      'strategyVersion',
      'timeframe',
      'selectedTimeframe',
      'thresholds',
      'wickPushbackThreshold',
      'fvgZoneCalculation',
      'marketStructureRules',
      'chochRules',
      'bosRules',
      'ifvgRules',
      'bprRules',
      'breakerRules',
      'oteRules',
      'sessionRules',
      'killZoneRules',
    ];

    for (const field of FROZEN_FIELDS) {
      if (mutations[field] !== undefined) {
        return {
          allowed: false,
          reason: `EXPERIMENT_SCOPE_FROZEN: Parameter '${field}' is locked and immutable under Strategy v2.0 controlled experiment ${this.experimentId}.`,
          field,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Generates sequential v2.0 Setup ID: V2-000001, V2-000002...
   */
  public generateNextSetupId(): string {
    const pad = String(this.setupCounter++).padStart(6, '0');
    return `V2-${pad}`;
  }

  /**
   * Records candidate frame with SHA-256 hash chaining and durable persistence.
   */
  public recordCandidate(telemetry: MasterTelemetry): MasterTelemetry {
    // Ensure v2.0 metadata defaults
    telemetry.metadata.strategy_version = ACTIVE_STRATEGY_VERSION;
    telemetry.metadata.experiment_id = ACTIVE_EXPERIMENT_ID;
    telemetry.metadata.config_hash = CONFIG_HASH;

    if (!telemetry.metadata.setup_id || !telemetry.metadata.setup_id.startsWith('V2-')) {
      telemetry.metadata.setup_id = this.generateNextSetupId();
    }

    // Check target threshold for valid setups
    if (telemetry.system_execution.system_decision === 'PASS') {
      const currentValid = this.candidatesHistory.filter(
        (c) => c.system_execution.system_decision === 'PASS'
      ).length;

      if (currentValid >= STRATEGY_MANIFEST.scope_freeze.target_valid_setups) {
        telemetry.system_execution.rejection_reason = `Target sample size reached (${STRATEGY_MANIFEST.scope_freeze.target_valid_setups} valid setups). Experiment completed.`;
        telemetry.system_execution.system_decision = 'REJECT';
        telemetry.system_execution.final_action = 'NO_ACTION';
      }
    }

    // Hash Chain Cryptographic Linkage
    telemetry.metadata.prev_hash = this.lastHash;

    const canonicalPayload = JSON.stringify({
      prev_hash: telemetry.metadata.prev_hash,
      setup_id: telemetry.metadata.setup_id,
      strategy_version: telemetry.metadata.strategy_version,
      config_hash: telemetry.metadata.config_hash,
      timestamp: telemetry.metadata.timestamp_utc,
      data_quality: telemetry.metadata.data_quality,
      timeframe: telemetry.market_context.selected_timeframe,
      decision: telemetry.system_execution.system_decision,
      final_action: telemetry.system_execution.final_action,
      validation: telemetry.validation_metrics,
    });

    const currentHash = this.computeHash(canonicalPayload);
    telemetry.metadata.sha256_hash = currentHash;
    this.lastHash = currentHash;

    // Prepend to history (most recent first, replace if setup_id already exists)
    const existingIndex = this.candidatesHistory.findIndex(
      (c) => c.metadata.setup_id === telemetry.metadata.setup_id
    );
    if (existingIndex >= 0) {
      this.candidatesHistory[existingIndex] = telemetry;
    } else {
      this.candidatesHistory.unshift(telemetry);
    }

    // Update active alert if valid
    if (telemetry.system_execution.system_decision === 'PASS') {
      this.currentActiveAlert = telemetry;
    }

    // Persist to durable storage
    this.persist();

    return telemetry;
  }

  public verifyHashChain(): { valid: boolean; totalRecords: number; error?: string } {
    if (this.candidatesHistory.length === 0) {
      return { valid: true, totalRecords: 0 };
    }

    const chronological = [...this.candidatesHistory].reverse();
    let expectedPrevHash = '0'.repeat(64);

    for (let i = 0; i < chronological.length; i++) {
      const record = chronological[i];
      if (record.metadata.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          totalRecords: chronological.length,
          error: `Broken chain link at index ${i} (${record.metadata.setup_id}): prev_hash mismatch.`,
        };
      }

      const canonicalPayload = JSON.stringify({
        prev_hash: record.metadata.prev_hash,
        setup_id: record.metadata.setup_id,
        strategy_version: record.metadata.strategy_version,
        config_hash: record.metadata.config_hash,
        timestamp: record.metadata.timestamp_utc,
        data_quality: record.metadata.data_quality,
        timeframe: record.market_context.selected_timeframe,
        decision: record.system_execution.system_decision,
        final_action: record.system_execution.final_action,
        validation: record.validation_metrics,
      });

      const recomputedHash = this.computeHash(canonicalPayload);
      if (recomputedHash !== record.metadata.sha256_hash) {
        return {
          valid: false,
          totalRecords: chronological.length,
          error: `Tampered payload detected at record ${record.metadata.setup_id}: hash mismatch.`,
        };
      }

      expectedPrevHash = record.metadata.sha256_hash!;
    }

    return { valid: true, totalRecords: chronological.length };
  }

  public getActiveAlert(): MasterTelemetry | null {
    return this.currentActiveAlert;
  }

  public recordUserAction(setupId: string, action: UserRecordedAction): boolean {
    const candidate = this.candidatesHistory.find((c) => c.metadata.setup_id === setupId);
    if (candidate) {
      candidate.system_execution.user_recorded_action = action;
      if (this.currentActiveAlert?.metadata.setup_id === setupId) {
        this.currentActiveAlert.system_execution.user_recorded_action = action;
      }
      this.persist();
      return true;
    }
    return false;
  }

  public recordSignalOutcome(
    setupId: string,
    outcome: SignalOutcome,
    nextCandle: { open: number; high: number; low: number; close: number },
    notes?: string
  ): SignalOutcomeRecord | null {
    const candidate = this.candidatesHistory.find((c) => c.metadata.setup_id === setupId);
    if (!candidate) return null;

    // Map outcome to research-honest observation
    let researchObservation: NextCandleObservation = 'NEXT_CANDLE_NEUTRAL';
    if (outcome === 'NEXT_CANDLE_FAVORABLE' || outcome === 'WIN') {
      researchObservation = 'NEXT_CANDLE_FAVORABLE';
    } else if (outcome === 'NEXT_CANDLE_UNFAVORABLE' || outcome === 'LOSS') {
      researchObservation = 'NEXT_CANDLE_UNFAVORABLE';
    } else if (outcome === 'NEXT_CANDLE_INCONCLUSIVE' || outcome === 'INVALIDATED' || outcome === 'UNRESOLVED') {
      researchObservation = 'NEXT_CANDLE_INCONCLUSIVE';
    } else {
      researchObservation = 'NEXT_CANDLE_NEUTRAL';
    }

    // Standardize v2.0 stored outcome format
    const standardizedOutcome: SignalOutcome =
      outcome === 'WIN'
        ? 'NEXT_CANDLE_FAVORABLE'
        : outcome === 'LOSS'
        ? 'NEXT_CANDLE_UNFAVORABLE'
        : outcome === 'UNRESOLVED'
        ? 'NEXT_CANDLE_INCONCLUSIVE'
        : outcome;

    // Update telemetry record in-place
    if (!candidate.next_candle_observation) {
      candidate.next_candle_observation = { status: researchObservation };
    } else {
      candidate.next_candle_observation.status = researchObservation;
      candidate.next_candle_observation.observation_timestamp = new Date().toISOString();
      candidate.next_candle_observation.observed_candle = {
        timestamp: new Date().toISOString(),
        ...nextCandle,
        volume: 0,
      };
    }

    const record: SignalOutcomeRecord = {
      setup_id: setupId,
      pair: candidate.metadata.pair || candidate.metadata.asset || 'EUR/USD',
      bias: candidate.market_context.local_bias,
      timeframe: candidate.market_context.selected_timeframe,
      signal_timestamp_utc: candidate.metadata.signal_timestamp_utc || candidate.metadata.timestamp_utc,
      result_timestamp_utc: new Date().toISOString(),
      signal_outcome: standardizedOutcome,
      outcome: standardizedOutcome,
      user_recorded_action: candidate.system_execution.user_recorded_action || 'NOT_RECORDED',
      userAction: candidate.system_execution.user_recorded_action || 'NOT_RECORDED',
      next_candle: nextCandle,
      nextCandleOpen: nextCandle.open,
      nextCandleClose: nextCandle.close,
      notes,
    };

    durableStorage.recordOutcome(record);
    this.persist();
    return record;
  }

  public getStats(): ExperimentStats {
    let validCount = 0;
    let rejectedCount = 0;
    let inconclusiveCount = 0;
    let confirmedCount = 0;
    let favorable = 0;
    let unfavorable = 0;
    let neutral = 0;
    let notTaken = 0;
    let taken = 0;

    for (const item of this.candidatesHistory) {
      const decision = item.system_execution.system_decision;
      if (decision === 'PASS') validCount++;
      else if (decision === 'REJECT') rejectedCount++;
      else if (decision === 'INCONCLUSIVE') inconclusiveCount++;

      // Research observation
      const obs = item.next_candle_observation?.status;
      if (obs === 'NEXT_CANDLE_FAVORABLE') favorable++;
      else if (obs === 'NEXT_CANDLE_UNFAVORABLE') unfavorable++;
      else if (obs === 'NEXT_CANDLE_NEUTRAL') neutral++;

      // User action
      const userAction = item.system_execution.user_recorded_action;
      if (userAction === 'TAKEN' || userAction === 'WIN' || userAction === 'LOSS') taken++;
      else if (userAction === 'NOT_TAKEN' || userAction === 'SKIPPED') notTaken++;

      if (userAction && userAction !== 'NOT_RECORDED' && userAction !== 'PENDING') {
        confirmedCount++;
      }
    }

    const closedObservations = favorable + unfavorable;
    const favorableRate = closedObservations > 0 ? (favorable / closedObservations) * 100 : 0;

    return {
      experimentId: this.experimentId,
      strategyVersion: this.strategyVersion,
      configHash: this.configHash,
      isLocked: this.isLocked,
      scannerActive: this.scannerActive,
      alertsMuted: this.alertsMuted,
      totalCandidateFramesEvaluated: this.candidatesHistory.length,
      validSetupsCount: validCount,
      targetValidSetups: STRATEGY_MANIFEST.scope_freeze.target_valid_setups,
      rejectedSetupsCount: rejectedCount,
      inconclusiveCount: inconclusiveCount,
      userConfirmedActionsCount: confirmedCount,
      recordedFavorable: favorable,
      recordedUnfavorable: unfavorable,
      recordedNeutral: neutral,
      recordedNotTaken: notTaken,
      recordedTaken: taken,
      // Compatibility mappings
      recordedWins: favorable,
      recordedLosses: unfavorable,
      recordedSkipped: notTaken,
      winRatePercentage: Number(favorableRate.toFixed(1)),
    };
  }

  public getCandidates(filter?: 'ALL' | 'PASS' | 'REJECT' | 'INCONCLUSIVE', limit = 100): MasterTelemetry[] {
    if (!filter || filter === 'ALL') {
      return this.candidatesHistory.slice(0, limit);
    }
    return this.candidatesHistory
      .filter((c) => c.system_execution.system_decision === filter)
      .slice(0, limit);
  }

  public exportTelemetryJson(): string {
    return JSON.stringify(
      {
        experiment_id: this.experimentId,
        strategy_version: this.strategyVersion,
        config_hash: this.configHash,
        exported_at: new Date().toISOString(),
        manifest: STRATEGY_MANIFEST,
        telemetry_records: this.candidatesHistory,
        outcomes: durableStorage.loadOutcomes(),
      },
      null,
      2
    );
  }
}

export const experimentTracker = new ExperimentManager();
