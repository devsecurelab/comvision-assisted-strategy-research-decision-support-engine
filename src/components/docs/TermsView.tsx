// Terms of Use Page
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React from 'react';
import { FileText, AlertTriangle, Shield, Lock, Scale, CheckCircle2, Globe } from 'lucide-react';

export const TermsView: React.FC = () => {
  return (
    <div className="space-y-10 text-slate-200">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
          <Scale className="w-3.5 h-3.5" />
          <span>Legal Agreement &amp; Operating Guidelines</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Terms of Use
        </h1>
        <p className="text-xs font-mono text-slate-500">
          Effective Date: September 19, 2026 • Version 1.2
        </p>
      </div>

      {/* 1. Acceptance & Authorized Use */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
          1. Acceptance of Terms &amp; Authorized Use
        </h2>
        <p>
          By accessing the ComVision-Assisted Strategy Research &amp; Decision-Support Engine website, documentation, or authenticated private dashboard, you acknowledge and agree to be bound by these Terms of Use. If you do not agree with these terms, you are prohibited from accessing the system.
        </p>
        <p>
          Access to the private research dashboard is granted exclusively to authorized operators whose accounts have been formally reviewed and marked <code>APPROVED</code> by an Administrator.
        </p>
      </section>

      {/* 2. Research Nature & Non-Execution Mandate */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
          2. Research Nature &amp; Non-Execution Limitation
        </h2>
        <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2">
          <div className="text-xs font-mono font-bold text-indigo-300 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>CRITICAL LEGAL COVENANT: STRICTLY NON-EXECUTION</span>
          </div>
          <p className="text-xs text-indigo-100/90 font-serif italic leading-relaxed">
            «The ComVision Engine is solely a quantitative research and decision-support tool. It does not place orders, execute transactions, or connect to any brokerage or exchange. Every affirmative signal emits a MANUAL_ALERT which is strictly informational.»
          </p>
        </div>
        <p>
          The platform does not provide investment, financial, tax, or legal advice. Any decision to trade, invest, enter a financial contract, or manage risk in real financial markets is strictly your independent discretionary responsibility.
        </p>
      </section>

      {/* 3. No Warranty & Experimental Nature */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
          3. Experimental Nature &amp; No Guaranteed Outcomes
        </h2>
        <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-xl text-xs space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold font-mono">
            <AlertTriangle className="w-4 h-4" />
            <span>DISCLAIMER OF FINANCIAL RESULTS</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Strategy v1.0 is an experimental research specification (EXP-2026-001). We provide the system on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind. <strong>Passing software validation does not guarantee trading profitability, accuracy, or future market behavior.</strong> Trading foreign exchange, contracts for difference, commodities, and derivatives carries a high risk of capital loss.
          </p>
        </div>
      </section>

      {/* 4. Account Responsibility & Prohibited Conduct */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
          4. Operator Responsibility &amp; Prohibited Conduct
        </h2>
        <p>As an operator of this platform, you agree that you will NOT:</p>
        <ul className="space-y-1.5 text-slate-400 text-xs list-disc list-inside">
          <li>Share, lease, or transfer your operator account credentials or session tokens to unauthorized third parties.</li>
          <li>Attempt to bypass, defeat, or disable server-side authorization controls or API rate limiters.</li>
          <li>Scrape, extract, or inject automated headless bots (e.g. Selenium, PyAutoGUI) into the user interface.</li>
          <li>Tamper with or attempt to forge SHA-256 telemetry chains or falsify experiment outcomes.</li>
          <li>Reverse-engineer, decompile, or misuse the proprietary computer vision and pipeline algorithms.</li>
        </ul>
      </section>

      {/* 5. Suspension & Termination */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
          5. Suspension &amp; Account Revocation
        </h2>
        <p>
          Administrators reserve the unconditional right to suspend, terminate, or revoke access (changing account status to <code>SUSPENDED</code> or <code>REVOKED</code>) at any time, with or without prior notice, for conduct violating these Terms of Use, security breaches, or system abuse.
        </p>
      </section>

      {/* 6. Intellectual Property & Changes */}
      <section className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
          6. Intellectual Property &amp; Policy Modifications
        </h2>
        <p>
          All source code, algorithms, user interface designs, documentation, and technical specifications are protected by intellectual property laws. We reserve the right to revise these Terms of Use as the experimental research program evolves. Updated terms will be published to this page with an updated effective date.
        </p>
        <p className="text-slate-400 text-xs">
          For legal inquiries regarding these Terms, contact: <code className="text-indigo-400">legal@comvision-engine.internal</code>.
        </p>
      </section>
    </div>
  );
};
