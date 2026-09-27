// User Management View Component (Admin Only)
import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, Ban, AlertTriangle, Shield, RefreshCw } from 'lucide-react';
import { UserAccount, UserStatus } from '../../engine/types';
import { TelegramAdminTool } from '../TelegramAdminTool';
import { apiFetch } from '../../config/api';

interface UserManagementViewProps {
  authToken: string;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  authToken,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [authToken]);

  const handleUpdateStatus = async (userId: string, newStatus: UserStatus) => {
    try {
      const res = await apiFetch('/api/admin/users/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ userId, status: newStatus }),
      });

      if (res.ok) {
        setActionMessage(`Updated user status to ${newStatus}`);
        setTimeout(() => setActionMessage(null), 3000);
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to update user status:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            User Authorization &amp; Access Control (Admin)
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Manage PENDING / APPROVED / SUSPENDED / REVOKED Account Privileges
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Users
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs font-mono">
          {actionMessage}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Email</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Authorization Status</th>
                <th className="py-2.5 px-3">Created At</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {users.map((u) => {
                const isPending = u.status === 'PENDING';
                const isApproved = u.status === 'APPROVED';

                return (
                  <tr key={u.id} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-semibold text-slate-200">
                      {u.name}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{u.email}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-indigo-300 border border-slate-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : u.status === 'PENDING'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right space-x-1.5">
                      {u.status !== 'APPROVED' && (
                        <button
                          onClick={() => handleUpdateStatus(u.id, 'APPROVED')}
                          className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded border border-emerald-500/30 text-[10px] font-semibold transition"
                        >
                          Approve
                        </button>
                      )}

                      {u.status !== 'SUSPENDED' && (
                        <button
                          onClick={() => handleUpdateStatus(u.id, 'SUSPENDED')}
                          className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded border border-amber-500/30 text-[10px] font-semibold transition"
                        >
                          Suspend
                        </button>
                      )}

                      {u.status !== 'REVOKED' && (
                        <button
                          onClick={() => handleUpdateStatus(u.id, 'REVOKED')}
                          className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 rounded border border-rose-500/30 text-[10px] font-semibold transition"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Telegram Bot & Chat ID Inspector */}
      <TelegramAdminTool authToken={authToken} />
    </div>
  );
};
