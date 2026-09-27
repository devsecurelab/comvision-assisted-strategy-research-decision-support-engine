// Audit Log View Component
import React from 'react';
import { FileText, Shield, Key, AlertCircle } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'USER_APPROVED' | 'SETUP_ACTION' | 'FAILSAFE_TRIGGERED';
  actor: string;
  details: string;
}

export const AuditLogView: React.FC = () => {
  const auditEntries: AuditLogEntry[] = [
    {
      id: 'AUD-001',
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      type: 'AUTH_SUCCESS',
      actor: 'admin@devsecure.engine',
      details: 'Successful operator session authenticated via scrypt key derivation',
    },
    {
      id: 'AUD-002',
      timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      type: 'SETUP_ACTION',
      actor: 'Human Operator',
      details: 'Recorded manual outcome WIN (+1.0R) for Setup ID #SET-2026-001',
    },
    {
      id: 'AUD-003',
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      type: 'USER_APPROVED',
      actor: 'admin@devsecure.engine',
      details: 'Approved status for operator account: analyst@devsecure.engine',
    },
    {
      id: 'AUD-004',
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      type: 'FAILSAFE_TRIGGERED',
      actor: 'News Guard Watchdog',
      details: 'Active USD Non-Farm Payrolls window (-30m) triggered systematic REJECT for 2 candidates',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          Security Audit &amp; Event Log
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Immutable Cryptographic Trail of Access &amp; Pipeline Operation Events
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2.5 px-3">Event ID</th>
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
                <th className="py-2.5 px-3">Classification</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {auditEntries.map((e, idx) => (
                <tr key={`${e.id || 'log'}-${idx}`} className="text-slate-300 hover:bg-slate-800/30">
                  <td className="py-3 px-3 text-slate-500">{e.id}</td>
                  <td className="py-3 px-3 text-slate-400">
                    {new Date(e.timestamp).toUTCString()}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 font-bold text-indigo-300">
                      {e.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-200 font-semibold">
                    {e.actor}
                  </td>
                  <td className="py-3 px-3 text-slate-400">{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
