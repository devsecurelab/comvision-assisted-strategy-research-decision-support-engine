// Reusable Consistent Footer Component
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React from 'react';
import { Shield, BookOpen, Info, FileText, Lock, Mail, ExternalLink, Activity } from 'lucide-react';

interface FooterProps {
  currentPath?: string;
  onNavigate: (route: string) => void;
  isAuthenticated: boolean;
  userStatus?: string;
  onOpenAuth?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  currentPath = '/',
  onNavigate,
  isAuthenticated,
  userStatus,
  onOpenAuth,
}) => {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-400 font-sans mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand & Mission */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-600 rounded-md text-white">
                <Activity className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-100 text-sm tracking-wide">ComVision Engine</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Strictly non-execution decision-support platform implementing frozen Strategy v1.0 market microstructure validation and empirical telemetry.
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] text-indigo-400 font-mono">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>EXP-2026-001 Frozen</span>
            </div>
          </div>

          {/* Research & Documentation */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Research & Docs
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/docs')}
                  className="hover:text-indigo-400 transition flex items-center gap-1.5 text-left"
                >
                  <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                  <span>Documentation / How It Works</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/about')}
                  className="hover:text-indigo-400 transition flex items-center gap-1.5 text-left"
                >
                  <Info className="w-3.5 h-3.5 text-slate-500" />
                  <span>About Engine &amp; Mission</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/security')}
                  className="hover:text-indigo-400 transition flex items-center gap-1.5 text-left"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Security &amp; Integrity</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Legal &amp; Policy
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/terms')}
                  className="hover:text-indigo-400 transition flex items-center gap-1.5 text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Terms of Use</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/privacy')}
                  className="hover:text-indigo-400 transition flex items-center gap-1.5 text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Privacy Policy</span>
                </button>
              </li>
              <li>
                <a
                  href="mailto:research@comvision-engine.internal"
                  className="hover:text-indigo-400 transition flex items-center gap-1.5 text-left"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Contact / Support</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Access & Status */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Access &amp; Portal
            </h4>
            <div className="space-y-2 text-xs">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400">
                    Status: <span className="font-mono text-emerald-400 font-semibold">{userStatus || 'AUTHENTICATED'}</span>
                  </div>
                  <button
                    onClick={() => onNavigate('/dashboard')}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded text-xs font-medium transition block w-full text-center"
                  >
                    Open Research Dashboard
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-500">
                    Dashboard access restricted to approved operator accounts.
                  </p>
                  <button
                    onClick={onOpenAuth}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-medium transition block w-full text-center"
                  >
                    Operator Sign In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Mandate & Disclaimer */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p className="text-center md:text-left leading-relaxed">
            <strong className="text-slate-400">Non-Execution Notice:</strong> The system evaluates market data according to frozen Strategy v1.0 rules and produces research validation and manual alerts. It does not place trades or execute broker orders.
          </p>
          <div className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
            v3.4 Technical Specification • Strictly Informational
          </div>
        </div>
      </div>
    </footer>
  );
};
