// Security Architecture & Cryptographic Integrity Page
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React from 'react';
import { Shield, Lock, Key, Hash, CheckCircle2, AlertTriangle, Users, FileCode, Server } from 'lucide-react';

export const SecurityView: React.FC = () => {
  return (
    <div className="space-y-10 text-slate-200">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
          <Lock className="w-3.5 h-3.5" />
          <span>Security Architecture &amp; System Hardening</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Security &amp; Data Integrity
        </h1>
        <p className="text-xs font-mono text-slate-500">
          Security Baseline: Specification v3.4 • Tier-1 Hardened Infrastructure
        </p>
      </div>

      {/* Security Principles Overview */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <p>
          Security in the ComVision Research Engine is architected around three non-negotiable principles:
          <strong> Zero Execution Exposure</strong>, <strong>Server-Authoritative Enforcement</strong>, and <strong>Cryptographic Auditability</strong>.
        </p>
      </section>

      {/* 1. Server-Side Authorization Gateway */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Server className="w-4 h-4 text-indigo-400" />
          <span>1. Server-Side Authorization &amp; Session Protection</span>
        </h2>
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            Unlike client-only applications that rely on hiding user interface controls, ComVision enforces authorization strictly at the backend API boundary.
          </p>
          <ul className="space-y-2 text-slate-400 text-xs list-disc list-inside">
            <li><strong>Bearer Token Authentication:</strong> Protected endpoints (<code>/api/engine/*</code>, <code>/api/admin/*</code>) validate cryptographically generated session tokens on every request.</li>
            <li><strong>Immediate Revocation:</strong> Logging out destroys the server-side session, returning immediate <code>401 Unauthorized</code> to subsequent calls.</li>
            <li><strong>Account Status Gate:</strong> Accounts with <code>PENDING</code>, <code>SUSPENDED</code>, or <code>REVOKED</code> status are rejected with <code>403 Forbidden</code> at the middleware layer.</li>
          </ul>
        </div>
      </section>

      {/* 2. Password Protection & Cryptographic Storage */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <span>2. Password Security via Modern KDF</span>
        </h2>
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            Operator authentication utilizes modern key derivation algorithms designed to resist hardware-accelerated GPU and ASIC dictionary attacks:
          </p>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
            <div className="text-emerald-400 font-bold">Standard: Node.js Crypto scrypt</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Every password is combined with a unique, cryptographically random 16-byte salt and hashed via <code>scrypt</code> (64-byte key length). Plaintext passwords never touch logs, storage, or telemetry payloads.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Role Separation */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          <span>3. Strict Role-Based Separation (RBAC)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <span className="font-mono text-xs font-bold text-indigo-400 block">Analyst Role</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Authorized to monitor live market-data evaluations, inspect telemetry, and record empirical trade outcomes. Analysts are strictly barred from administrative endpoints.
            </p>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <span className="font-mono text-xs font-bold text-amber-400 block">Administrator Role</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Authorized to approve or revoke user accounts, inspect immutable security audit logs, and review engine health metrics.
            </p>
          </div>
        </div>
      </section>

      {/* 4. SHA-256 Telemetry Hash-Chaining */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Hash className="w-4 h-4 text-indigo-400" />
          <span>4. SHA-256 Telemetry Hash-Chaining &amp; Audit Trail</span>
        </h2>
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            To guarantee research integrity in EXP-2026-001, each candidate evaluation is cryptographically chained to its predecessor:
          </p>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
            <div className="text-indigo-300 font-bold">SHA-256 Tamper-Evident Protocol:</div>
            <code className="text-[11px] text-slate-400 block">
              record_hash = SHA256( canonicalJSON(telemetry) + previous_record_hash )
            </code>
            <p className="text-slate-500 text-[10px] leading-normal pt-1">
              If any historical candidate record is modified, reordered, or deleted, the sequential hash chain breaks immediately, alerting the system to tampering.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Responsible Disclosure */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-400" />
          <span>5. Responsible Security Disclosure</span>
        </h2>
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            We take system security seriously. If you discover a potential vulnerability in the authentication system, session tokens, or API endpoints, please disclose it responsibly.
          </p>
          <p className="text-slate-400">
            Submit findings directly to the security team at: <code className="text-indigo-400">security@comvision-engine.internal</code>.
          </p>
        </div>
      </section>
    </div>
  );
};
