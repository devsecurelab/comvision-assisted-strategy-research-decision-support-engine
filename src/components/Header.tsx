// Top Header Status Bar Component
import React from 'react';
import {
  Globe,
  Pause,
  Play,
  Square,
  Database,
  RefreshCw,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import { ProviderStatus } from '../engine/dataProviders';
import { PWAInstallButton } from './PWAInstallButton';

const PROVIDER_LABELS: Record<string, string> = {
  TWELVE_DATA: 'Twelve Data', OANDA: 'OANDA Practice', TIINGO: 'Tiingo FX',
};

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  scannerActive: boolean;
  onToggleScanner: () => void;
  onStopScanning: () => void;
  onManualScan: () => void;
  providerStatus?: ProviderStatus;
}

export const Header: React.FC<HeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  scannerActive,
  onToggleScanner,
  onStopScanning,
  onManualScan,
  providerStatus,
}) => {
  return (
    <header
      id="top-status-bar"
      className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 select-none"
    >
      <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap">
        {/* Sidebar Toggle Button */}
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse / Hide Sidebar' : 'Expand Sidebar'}
          className="p-2 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition border border-transparent hover:border-slate-700"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5 text-indigo-400" />
          ) : (
            <PanelLeft className="w-5 h-5 text-slate-300" />
          )}
        </button>

        {/* Scanner State Badge */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-full border border-slate-700 text-xs shadow-inner">
          <span
            className={`w-2 h-2 rounded-full ${
              scannerActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          ></span>
          <span className="font-mono text-slate-300 font-semibold text-[11px]">
            {scannerActive ? 'SCANNER: ACTIVE' : 'SCANNER: PAUSED'}
          </span>
        </div>

        {/* News Guard Status */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-full border border-slate-700 text-xs text-slate-300">
          <Globe className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[11px]">NEWS: NOT CHECKED (manual)</span>
        </div>

        {/* Provider Provenance Badge */}
        <div className={`hidden lg:flex items-center gap-2 px-3 py-1 rounded-full border text-xs ${
          providerStatus?.status === 'ONLINE'
              ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/60 text-rose-200'
        }`}>
          <Database className={`w-3.5 h-3.5 ${
            providerStatus?.status === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'
          }`} />
          <span className="text-[11px] font-mono">
            Provider:{' '}
            <strong className={
              providerStatus?.status === 'ONLINE' ? 'text-emerald-300' : 'text-rose-300'
            }>
              {providerStatus?.provider
                ? `${PROVIDER_LABELS[providerStatus.provider] || providerStatus.provider}${providerStatus.status === 'ONLINE' ? ' • VERIFIED' : ' • NOT VERIFIED'}`
                : 'Live provider not selected'}
            </strong>
          </span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2.5">
        <PWAInstallButton />



        <button
          id="btn-evaluate-next-candidate"
          onClick={onManualScan}
          title="Trigger immediate sequential 9-stage evaluation on latest market frame"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-500/30 transition shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Evaluate Frame</span>
        </button>

        <button
          id="btn-toggle-scanner"
          onClick={onToggleScanner}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
        >
          {scannerActive ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Alerts</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Resume Alerts</span>
            </>
          )}
        </button>

        <button
          id="btn-stop-scanning"
          onClick={onStopScanning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold rounded-lg border border-rose-500/30 transition"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span className="hidden sm:inline">Stop Scanning</span>
        </button>
      </div>
    </header>
  );
};
