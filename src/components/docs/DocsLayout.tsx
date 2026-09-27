// Shared Layout for Documentation & Legal Pages
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React, { useState } from 'react';
import {
  Activity,
  BookOpen,
  Shield,
  FileText,
  Lock,
  ArrowLeft,
  ChevronRight,
  Menu,
  X,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Footer } from '../Footer';

interface DocsLayoutProps {
  currentPath: string;
  onNavigate: (route: string) => void;
  isAuthenticated: boolean;
  userStatus?: string;
  onOpenAuth: () => void;
  children: React.ReactNode;
}

export const DocsLayout: React.FC<DocsLayoutProps> = ({
  currentPath,
  onNavigate,
  isAuthenticated,
  userStatus,
  onOpenAuth,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Documentation / How It Works', path: '/docs', icon: BookOpen },
    { label: 'About Engine & Mission', path: '/about', icon: Activity },
    { label: 'Security & Integrity', path: '/security', icon: Lock },
    { label: 'Terms of Use', path: '/terms', icon: FileText },
    { label: 'Privacy Policy', path: '/privacy', icon: Shield },
  ];

  const handleNavClick = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-medium transition py-1 px-2 rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-600 rounded-md text-white shadow-md shadow-indigo-600/30">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100 tracking-wide">
                ComVision Docs &amp; Legal
              </span>
              <span className="hidden md:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                Strategy v1.0 Frozen
              </span>
            </div>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <button
              onClick={() => onNavigate('/dashboard')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
            >
              <span>Dashboard</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Operator Sign In</span>
            </button>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 md:hidden text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar Navigation */}
        <aside className="w-64 border-r border-slate-800/80 p-6 hidden md:block shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto space-y-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
              Documentation &amp; Engine
            </div>
            <nav className="space-y-1">
              {navItems.slice(0, 3).map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item.path)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
              Legal &amp; Governance
            </div>
            <nav className="space-y-1">
              {navItems.slice(3).map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item.path)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Specification v3.4</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Non-execution quantitative research protocol. All affirmative outputs strictly emit MANUAL_ALERT.
            </p>
          </div>
        </aside>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-x-0 top-16 bg-slate-900 border-b border-slate-800 p-4 space-y-2 z-20">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 text-slate-500" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-6 sm:p-10 max-w-4xl mx-auto overflow-hidden">
          {children}
        </main>
      </div>

      {/* Footer */}
      <Footer
        currentPath={currentPath}
        onNavigate={onNavigate}
        isAuthenticated={isAuthenticated}
        userStatus={userStatus}
        onOpenAuth={onOpenAuth}
      />
    </div>
  );
};
