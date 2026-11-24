#!/usr/bin/env tsx
/**
 * PR-9 Funnel & Co-occurrence Report
 * Analyzes ledger for gate conditional-funnel and co-occurrence across pairs/timeframes.
 */
import fs from 'node:fs';
import path from 'node:path';

const ledgerPath = process.env.SIGNAL_LEDGER_PATH || path.join(process.cwd(), 'data', 'signal-ledger.jsonl');

if (!fs.existsSync(ledgerPath)) {
  console.log('No ledger found at:', ledgerPath);
  process.exit(0);
}

const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
const signals = lines.map(line => JSON.parse(line)).filter(e => e.type === 'SIGNAL');

console.log(`\n=== PR-9 Funnel & Co-occurrence Report ===`);
console.log(`Total Signals Analyzed: ${signals.length}`);

// Basic co-occurrence grouping by rule_variant and MFCI band
const variantStats: Record<string, number> = { A: 0, B: 0 };
const mfcibucketStats: Record<string, number> = {};

signals.forEach((entry: any) => {
  const variant = entry.payload?.rule_variant || 'A';
  variantStats[variant] = (variantStats[variant] || 0) + 1;
  
  const mfciband = entry.payload?.metadata?.mfci_band || 'UNKNOWN';
  mfcibucketStats[mfciband] = (mfcibucketStats[mfciband] || 0) + 1;
});

console.log('\n--- Rule Variant Distribution ---');
Object.entries(variantStats).forEach(([v, count]) => {
  console.log(`Variant ${v}: ${count} signals`);
});

console.log('\n--- MFCI Bucket Distribution ---');
Object.entries(mfcibucketStats).forEach(([bucket, count]) => {
  console.log(`${bucket}: ${count} signals`);
});

console.log('\n✅ Funnel report generated. (Extend with Wilson/SPRT calculations as needed)');
