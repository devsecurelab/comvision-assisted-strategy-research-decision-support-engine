import React, { useState } from 'react';
import { Download, Smartphone, X, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Termux browser flow
  if (isInstallable) {
    return (
      <button
        onClick={async () => {
          setInstalling(true);
          try {
            await install();
          } finally {
            setInstalling(false);
          }
        }}
        disabled={installing}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium tracking-wide transition shadow-sm border border-cyan-400/40"
        title="Install as Android / Desktop PWA"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install PWA</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium border border-slate-700 transition"
          title="Add to Home Screen on iOS Safari"
        >
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>Install PWA</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-cyan-400" />
                  Install on iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed space-y-2 mb-4">
                <span>1. Tap the <strong>Share</strong> icon in the Safari toolbar.</span><br />
                <span>2. Scroll down and tap <strong>Add to Home Screen</strong>.</span><br />
                <span>3. Launch ComVision directly from your iOS app grid.</span>
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-medium text-slate-200 border border-slate-600"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
