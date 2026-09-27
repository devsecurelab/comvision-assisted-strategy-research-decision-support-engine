// Authentication Modal Component
// Supports Custom Credentials + Status Lifecycle + Quick Demo Logins

import React, { useState } from 'react';
import { X, Lock, Mail, User, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { UserAccount, UserStatus } from '../engine/types';
import { apiFetch } from '../config/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: Omit<UserAccount, 'passwordHash'>) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    status: UserStatus;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusNotice(null);
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password } : { name, email, password };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Authentication request failed.');
        setLoading(false);
        return;
      }

      if (isLogin) {
        if (data.status !== 'APPROVED') {
          setStatusNotice({
            status: data.status,
            message: `Your account authorization status is '${data.status}'. Only APPROVED accounts can access the private ComVision Dashboard. Please contact the administrator.`,
          });
          setLoading(false);
          return;
        }

        onSuccess(data.token, data.user);
        onClose();
      } else {
        // Registration complete -> show PENDING notice
        setStatusNotice({
          status: 'PENDING',
          message: data.message || 'Account registered! Your account is in PENDING state awaiting administrator approval before accessing the research dashboard.',
        });
        setIsLogin(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network communication error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 rounded-md text-white">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {isLogin ? 'Access ComVision Engine' : 'Register Operator Account'}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Server-Side Authentication & Authorization Gate
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security / Role Notice */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 text-indigo-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            Controlled Research Access
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
            New accounts undergo administrator approval before dashboard telemetry access is granted.
          </p>
        </div>

        {/* Error / Status Messages */}
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusNotice && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>STATUS: {statusNotice.status}</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              {statusNotice.message}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Alex Mercer"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@devsecure.engine"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-indigo-600/20"
          >
            {loading
              ? 'Processing...'
              : isLogin
              ? 'Authenticate & Enter Dashboard'
              : 'Create Account (Pending Admin Review)'}
          </button>
        </form>

        {/* 1-Click Quick Operator Access for Instant Evaluation */}
        {isLogin && (
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 text-slate-300 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Quick Operator Access:
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                APPROVED
              </span>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setEmail('analyst@devsecure.engine');
                setPassword('TestAnalystPass2026!');
                setLoading(true);
                setErrorMessage(null);
                try {
                  const res = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: 'analyst@devsecure.engine',
                      password: 'TestAnalystPass2026!',
                    }),
                  });
                  const data = await res.json();
                  if (res.ok && data.token && data.user) {
                    onSuccess(data.token, data.user);
                    onClose();
                  } else {
                    setErrorMessage(data.message || 'Quick login failed');
                  }
                } catch (err: any) {
                  setErrorMessage(err.message || 'Communication error during quick sign in');
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full py-2 px-3 bg-slate-800/90 hover:bg-slate-800 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-400 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition shadow-sm"
            >
              <span>1-Click Operator Sign In (analyst@devsecure.engine)</span>
            </button>
          </div>
        )}

        {/* Toggle Login/Register */}
        <div className="text-center pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMessage(null);
              setStatusNotice(null);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
          >
            {isLogin
              ? "Don't have an account yet? Register here"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
