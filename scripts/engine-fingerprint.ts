import {
  ENGINE_FINGERPRINT,
  ENGINE_SNAPSHOT,
  CONFIG_HASH,
  CONFIG_HASH_EPOCH,
  SESSION_CONFIG_HASH,
  MARKET_CALENDAR_HASH,
  ACTIVE_STRATEGY_VERSION,
  ACTIVE_EXPERIMENT_ID,
} from '../src/engine/manifest';
import {
  V3_STRATEGY_PARAMS,
  V3_PARAMS_CANONICAL_JSON,
  V3_PARAMS_CANONICAL_HASH,
} from '../src/engine/params';
import { canonicalJson } from '../src/utils/canonicalJson';
import { sha256 } from '../src/utils/sha256';

const fingerprintPayload = {
  strategy_version: ACTIVE_STRATEGY_VERSION,
  config_hash: CONFIG_HASH,
  config_hash_epoch: CONFIG_HASH_EPOCH,
  params_canonical_hash: V3_PARAMS_CANONICAL_HASH,
  session_config_hash: SESSION_CONFIG_HASH,
  market_calendar_hash: MARKET_CALENDAR_HASH,
};

const output = {
  strategy_version: ACTIVE_STRATEGY_VERSION,
  experiment_id: ACTIVE_EXPERIMENT_ID,
  config_hash: CONFIG_HASH,
  config_hash_epoch: CONFIG_HASH_EPOCH,
  params_canonical_hash: V3_PARAMS_CANONICAL_HASH,
  engine_fingerprint: ENGINE_FINGERPRINT,
  engine_snapshot: ENGINE_SNAPSHOT,
  verification: {
    params_hash_matches: V3_PARAMS_CANONICAL_HASH === sha256(canonicalJson(V3_STRATEGY_PARAMS)),
    fingerprint_matches: ENGINE_FINGERPRINT === sha256(canonicalJson(fingerprintPayload)),
    canonical_json_bytes: Buffer.byteLength(V3_PARAMS_CANONICAL_JSON, 'utf8'),
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
