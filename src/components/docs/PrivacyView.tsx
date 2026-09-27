// Privacy Policy Page
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React from 'react';
import { Shield, Lock, Eye, FileText, CheckCircle2, AlertTriangle, Database, Globe } from 'lucide-react';

export const PrivacyView: React.FC = () => {
  return (
    <div className="space-y-10 text-slate-200">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
          <Shield className="w-3.5 h-3.5" />
          <span>Privacy &amp; Data Protection Policy</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs font-mono text-slate-500">
          Last Updated &amp; Effective: September 19, 2026 • Version 1.2
        </p>
      </div>

      {/* Overview & Scope */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <p>
          This Privacy Policy outlines how the <strong>ComVision-Assisted Strategy Research &amp; Decision-Support Engine</strong> ("we", "our", or "the platform") handles information collected through its public documentation pages, authenticated research dashboard, and backend services.
        </p>
        <p>
          We are committed to data minimization: <strong>we collect only the minimal data strictly necessary to authenticate operators, enforce role-based access control, and record empirical research telemetry</strong>.
        </p>
      </section>

      {/* 1. Information Collected */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span>1. Information We Actually Collect</span>
        </h2>
        <p className="text-xs text-slate-400">
          In strict adherence to truth-in-disclosure standards, we list only the data categories actually generated or processed by this application:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-100 font-mono text-xs text-indigo-300">
              A. Operator Account Data
            </h3>
            <ul className="space-y-1 text-slate-400 list-disc list-inside text-[11px]">
              <li>Username / handle</li>
              <li>Role classification (<code>Admin</code> or <code>Analyst</code>)</li>
              <li>Authorization status (<code>PENDING</code>, <code>APPROVED</code>, <code>SUSPENDED</code>, <code>REVOKED</code>)</li>
              <li>Account creation and status-update timestamps</li>
            </ul>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-100 font-mono text-xs text-indigo-300">
              B. Authentication &amp; Session Data
            </h3>
            <ul className="space-y-1 text-slate-400 list-disc list-inside text-[11px]">
              <li>Cryptographically hashed passwords (using <code>scrypt</code> with unique salts; plaintext passwords are never saved)</li>
              <li>Ephemeral cryptographically generated session bearer tokens</li>
              <li>Last login timestamp and active session expiration dates</li>
            </ul>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-100 font-mono text-xs text-indigo-300">
              C. Research Telemetry &amp; Logs
            </h3>
            <ul className="space-y-1 text-slate-400 list-disc list-inside text-[11px]">
              <li>Setup IDs and timestamped OHLCV validation metrics</li>
              <li>Sequential SHA-256 hash chains of evaluated candidates</li>
              <li>Operator-recorded setup evaluations (<code>WIN</code>, <code>LOSS</code>, <code>BREAK_EVEN</code>)</li>
            </ul>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-100 font-mono text-xs text-indigo-300">
              D. Technical &amp; Audit Logs
            </h3>
            <ul className="space-y-1 text-slate-400 list-disc list-inside text-[11px]">
              <li>HTTP request paths, response status codes, and latency</li>
              <li>Administrative action audit entries (account approval, status revocation)</li>
              <li>Client browser user-agent and coarse connection metadata</li>
            </ul>
          </div>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-500">
          <strong>Explicit Negative Declaration:</strong> We do NOT collect bank account numbers, credit cards, brokerage credentials, social security numbers, location GPS tracking, or private trade order tickets.
        </div>
      </section>

      {/* 2. How Information is Used */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Eye className="w-4 h-4 text-emerald-400" />
          <span>2. How Information Is Used</span>
        </h2>
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>We process collected data exclusively for the following technical and operational purposes:</p>
          <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
            <li><strong>Authentication &amp; Authorization:</strong> Verifying credentials and preventing unauthorized access to private dashboard components.</li>
            <li><strong>Research Operations:</strong> Rendering real-time chart canvases, executing Strategy v1.0 sequential pipeline stages, and calculating performance analytics.</li>
            <li><strong>Audit &amp; Security:</strong> Detecting brute-force login attempts, logging administrative account approvals, and maintaining tamper-evident SHA-256 telemetry chains.</li>
            <li><strong>System Diagnostics:</strong> Resolving network latency bottlenecks, data provider outages, and pipeline execution errors.</li>
          </ul>
        </div>
      </section>

      {/* 3. Data Sharing */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span>3. Data Sharing &amp; Third-Party Services</span>
        </h2>
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            <strong>We do NOT sell, rent, monetize, or disclose operator data to any third-party advertisers, brokers, or data brokers.</strong>
          </p>
          <p>
            <strong>External Data Feed Providers:</strong> If an operator configures an API key for Twelve Data or Alpha Vantage, the platform communicates with these external APIs solely to retrieve public OHLCV candle feeds. No operator identity, account handle, or personal information is transmitted to market feed providers.
          </p>
        </div>
      </section>

      {/* 4. Data Retention & Security */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400" />
          <span>4. Retention, Security &amp; Client Storage</span>
        </h2>
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            <strong>Storage &amp; Session Tokens:</strong> The client application stores the authenticated operator's bearer token in browser <code>localStorage</code> for session continuity. Logging out invalidates the server session and immediately clears local browser storage.
          </p>
          <p>
            <strong>Security Controls:</strong> All communications occur over encrypted TLS/HTTPS. Passwords are salted and hashed with <code>scrypt</code>. Protected API routes strictly enforce bearer token authorization.
          </p>
          <p>
            <strong>Retention Periods:</strong> Operator account records are retained while active. Telemetry records for experiment EXP-2026-001 are preserved in the research ledger for audit repeatability. Operators may request account deletion at any time.
          </p>
        </div>
      </section>

      {/* 5. User Rights & Contact */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <span>5. Operator Rights &amp; Privacy Contact</span>
        </h2>
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            Depending on your jurisdiction (such as GDPR or CCPA where applicable), you possess rights to inspect, rectify, or request the erasure of your personal account information.
          </p>
          <p className="text-slate-400">
            To submit a privacy inquiry or exercise data rights, contact our Data Protection Officer at: <code className="text-indigo-400">privacy@comvision-engine.internal</code>.
          </p>
        </div>
      </section>
    </div>
  );
};
