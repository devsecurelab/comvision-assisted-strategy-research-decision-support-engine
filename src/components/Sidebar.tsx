// Navigation Sidebar Component with Collapse/Slide-in-out Support
import React from 'react';
import {
  Activity,
  Eye,
  FlaskConical,
  History,
  BarChart2,
  Globe,
  Shield,
  Settings,
  FileText,
  Users,
  LogOut,
  ChevronRight,
  ChevronLeft,
  X,
  Download,
} from 'lucide-react';
import { UserAccount } from '../engine/types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: Omit<UserAccount, 'passwordHash'> | null;
  onLogout: () => void;
  onSwitchToPublic: () => void;
  onNavigate?: (route: string) => void;
  onDownloadHandover?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  onSwitchToPublic,
  onNavigate,
  onDownloadHandover,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [packageSize, setPackageSize] = React.useState<string>('309 KB');

  React.useEffect(() => {
    // Dynamic fetch of verified package size with anti-cache query
    fetch(`/api/engine/package-info?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sizeFormatted) {
          setPackageSize(data.sizeFormatted);
        } else if (data?.sizeBytes) {
          setPackageSize(`${Math.round(data.sizeBytes / 1024)} KB`);
        }
      })
      .catch(() => {});
  }, []);

  const handleItemClick = (tab: string) => {
    setActiveTab(tab);
    // Auto-close on mobile/tablet view
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      {/* Dimmed backdrop overlay on mobile/tablet */}
      {isOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-30 lg:hidden transition-opacity duration-300 animate-in fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        id="main-sidebar"
        className={`
          fixed lg:static inset-y-0 left-0 z-40 bg-slate-900 border-r border-slate-800
          flex flex-col justify-between shrink-0 select-none
          transition-all duration-300 ease-in-out
          ${
            isOpen
              ? 'w-64 p-4 translate-x-0 opacity-100 shadow-2xl lg:shadow-none'
              : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0 p-0 border-r-0 overflow-hidden opacity-0 pointer-events-none'
          }
        `}
      >
        <div className="space-y-4 min-w-[224px]">
          {/* Brand Logo & Collapse Button */}
          <div className="flex items-center justify-between px-2 py-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/30">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wide text-white leading-tight">
                  ComVision Engine
                </h1>
                <p className="text-[10px] text-indigo-400 font-mono tracking-wider">
                  RDP v3.0 MANUAL-ALERT
                </p>
              </div>
            </div>

            {/* Collapse Button inside Sidebar */}
            <button
              id="btn-collapse-sidebar-inner"
              onClick={onClose}
              title="Collapse Sidebar"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <SidebarItem
              id="nav-overview"
              icon={<Activity className="w-4 h-4" />}
              label="Overview"
              active={activeTab === 'overview'}
              onClick={() => handleItemClick('overview')}
            />
            <SidebarItem
              id="nav-vision"
              icon={<Eye className="w-4 h-4" />}
              label="AI Live Vision"
              active={activeTab === 'vision'}
              onClick={() => handleItemClick('vision')}
            />
            <SidebarItem
              id="nav-experiment"
              icon={<FlaskConical className="w-4 h-4" />}
              label="Experiment Mode"
              badge="EXP-V2"
              active={activeTab === 'experiment'}
              onClick={() => handleItemClick('experiment')}
            />
            <SidebarItem
              id="nav-logs"
              icon={<History className="w-4 h-4" />}
              label="Setup Logs"
              active={activeTab === 'logs'}
              onClick={() => handleItemClick('logs')}
            />
            <SidebarItem
              id="nav-analytics"
              icon={<BarChart2 className="w-4 h-4" />}
              label="Analytics Matrix"
              active={activeTab === 'analytics'}
              onClick={() => handleItemClick('analytics')}
            />
            <SidebarItem
              id="nav-news"
              icon={<Globe className="w-4 h-4" />}
              label="News Guard"
              active={activeTab === 'news'}
              onClick={() => handleItemClick('news')}
            />
            <SidebarItem
              id="nav-risk"
              icon={<Shield className="w-4 h-4" />}
              label="Risk Guardrails"
              active={activeTab === 'risk'}
              onClick={() => handleItemClick('risk')}
            />

            {isAdmin && (
              <SidebarItem
                id="nav-users"
                icon={<Users className="w-4 h-4 text-amber-400" />}
                label="User Approvals"
                badge="ADMIN"
                active={activeTab === 'users'}
                onClick={() => handleItemClick('users')}
              />
            )}
          </nav>
        </div>

        {/* Footer / System Controls */}
        <div className="pt-4 border-t border-slate-800 space-y-2 min-w-[224px]">
          <SidebarItem
            id="nav-settings"
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => handleItemClick('settings')}
          />

          {/* v2.0 Package ZIP Download (Directly Below Settings) */}
          <div className="pt-0.5 pb-0.5">
            <button
              id="btn-sidebar-download-v2-zip"
              onClick={onDownloadHandover}
              title="Download comvision-engine-v2.0-package.zip (Full Source Code & 9-Stage Engine)"
              className="w-full text-left p-2.5 bg-gradient-to-r from-indigo-950/80 to-purple-950/70 hover:from-indigo-900/90 hover:to-purple-900/80 border border-indigo-500/50 hover:border-indigo-400 rounded-xl flex items-center justify-between transition group shadow-md cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-indigo-600 group-hover:bg-indigo-500 rounded-lg text-white shadow-sm transition">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>v2.0 Package ZIP</span>
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40">
                      .ZIP
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-300 font-mono flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    <span>{packageSize} • Click to Download</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <SidebarItem
            id="nav-audit"
            icon={<FileText className="w-4 h-4" />}
            label="Audit Log"
            active={activeTab === 'audit'}
            onClick={() => handleItemClick('audit')}
          />

          {/* Public Portal Switcher */}
          <button
            id="btn-public-portal"
            onClick={() => {
              if (onNavigate) {
                onNavigate('/docs');
              } else {
                onSwitchToPublic();
              }
            }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-slate-400 hover:text-indigo-300 flex items-center justify-between rounded hover:bg-slate-800/40 transition"
          >
            <span>Documentation &amp; Legal</span>
            <ChevronRight className="w-3 h-3" />
          </button>

          {/* System Mode Notice */}
          <div className="mt-3 p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">System Mode</span>
              <span className="text-emerald-400 font-mono font-bold text-[11px]">
                RESEARCH
              </span>
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Auto-Click &amp; Broker Execution Disabled
            </div>
          </div>

          {/* User profile & Logout */}
          {currentUser && (
            <div className="pt-2 flex items-center justify-between border-t border-slate-800/60">
              <div className="overflow-hidden pr-2">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-indigo-400 font-mono">
                  {currentUser.role} • {currentUser.status}
                </div>
              </div>
              <button
                id="btn-sidebar-logout"
                onClick={onLogout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

interface SidebarItemProps {
  id?: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}

function SidebarItem({
  id,
  icon,
  label,
  badge,
  active,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
        active
          ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </div>
      {badge && (
        <span className="px-1.5 py-0.5 text-[9px] font-mono bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
          {badge}
        </span>
      )}
    </button>
  );
}
