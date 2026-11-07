// Server-side authentication and access-control service.
// Password derivation is asynchronous; raw session tokens are never persisted.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { UserAccount, UserRole, UserStatus } from '../engine/types';
import { durableStorage, type StoredSession } from './storage';

interface WindowCounter { count: number; firstAt: number }
interface LoginFailure extends WindowCounter { lockedUntil: number }
const scryptAsync = promisify(crypto.scrypt);

export class AuthService {
  private users: Map<string, UserAccount> = new Map();
  private sessions: Map<string, StoredSession> = new Map();
  private sessionDurationMs = 24 * 60 * 60 * 1000;
  private activeVerifications = 0;
  private verificationQueue: Array<() => void> = [];
  private loginFailures = new Map<string, LoginFailure>();
  private ipRequests = new Map<string, WindowCounter>();
  private registrationRequests = new Map<string, WindowCounter>();
  private globalRegistrationRequest: WindowCounter = { count: 0, firstAt: 0 };
  private dummyPasswordHash = '';
  private ready: Promise<void>;

  constructor() {
    this.ready = this.initializeFromStorage();
  }

  public async whenReady(): Promise<void> { await this.ready; }

  public async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  public async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== 64) return false;
    const release = await this.acquireVerificationSlot();
    let derivedKey: Buffer;
    try {
      derivedKey = await scryptAsync(password, salt, 64) as Buffer;
    } finally {
      release();
    }
    return keyBuffer.length === derivedKey.length && crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  private acquireVerificationSlot(): Promise<() => void> {
    this.verificationQueue ||= [];
    if (this.activeVerifications < 2) {
      this.activeVerifications += 1;
      return Promise.resolve(() => { this.activeVerifications -= 1; this.drainVerificationQueue(); });
    }
    return new Promise((resolve) => this.verificationQueue.push(() => {
      this.activeVerifications += 1;
      resolve(() => { this.activeVerifications -= 1; this.drainVerificationQueue(); });
    }));
  }

  private drainVerificationQueue() {
    if (this.activeVerifications < 2) this.verificationQueue.shift()?.();
  }

  public async resetForTesting(): Promise<void> {
    await this.ready;
    this.users.clear();
    this.sessions.clear();
    this.registrationRequests.clear();
    this.globalRegistrationRequest = { count: 0, firstAt: 0 };
    this.ready = this.initializeFromStorage();
    await this.ready;
  }

  private async initializeFromStorage(): Promise<void> {
    const storedUsers = durableStorage.loadUsers();
    if (storedUsers && storedUsers.length > 0) {
      for (const user of storedUsers) this.users.set(user.id, user);
    } else {
      await this.bootstrapDefaultAccounts();
    }

    const now = Date.now();
    for (const stored of durableStorage.loadSessions()) {
      if (stored.expiresAt > now) {
        const key = stored.tokenHash || (stored.token ? this.hashToken(stored.token) : '');
        if (key) this.sessions.set(key, { ...stored, tokenHash: key, token: undefined });
      }
    }
  }

  private async bootstrapDefaultAccounts(): Promise<void> {
    const dataDir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), 'data');
    // Remove the legacy plaintext bootstrap artifact from the configured data directory.
    const legacyFile = path.join(dataDir, ['.admin', 'bootstrap_secret'].join('_'));
    try { fs.rmSync(legacyFile, { force: true }); } catch { /* best effort migration */ }

    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
    if (!bootstrapPassword && process.env.NODE_ENV === 'production') {
      throw new Error('BOOTSTRAP_PASSWORD_REQUIRED: set ADMIN_BOOTSTRAP_PASSWORD before production startup.');
    }
    const password = bootstrapPassword || crypto.randomBytes(24).toString('base64url');
    const adminUser: UserAccount = {
      id: 'usr-admin-001',
      email: 'admin@devsecure.engine',
      name: process.env.ADMIN_NAME || 'Administrator',
      role: 'ADMIN',
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      passwordHash: await this.hashPassword(password),
    };
    this.users.set(adminUser.id, adminUser);
    this.dummyPasswordHash = await this.hashPassword('dummy-password-for-timing-only');
    this.persistUsers();
    if (!bootstrapPassword && process.env.NODE_ENV !== 'test') {
      console.warn('[AuthService] Generated an ephemeral development bootstrap password; it was not persisted.');
    }
  }

  private persistUsers() { durableStorage.saveUsers(Array.from(this.users.values())); }
  private persistSessions() { durableStorage.saveSessions(Array.from(this.sessions.values())); }
  private hashToken(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }

  private consumeRegistrationAttempt(ipAddress: string): string | null {
    this.registrationRequests ||= new Map();
    this.globalRegistrationRequest ||= { count: 0, firstAt: 0 };
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const ip = this.registrationRequests.get(ipAddress);
    if (!ip || now - ip.firstAt >= hour) this.registrationRequests.set(ipAddress, { count: 1, firstAt: now });
    else if (ip.count >= 5) return 'Registration rate limit exceeded for this IP. Try again later.';
    else ip.count += 1;

    if (!this.globalRegistrationRequest.firstAt || now - this.globalRegistrationRequest.firstAt >= hour) {
      this.globalRegistrationRequest = { count: 1, firstAt: now };
    } else if (this.globalRegistrationRequest.count >= 20) {
      return 'Global registration rate limit exceeded. Try again later.';
    } else {
      this.globalRegistrationRequest.count += 1;
    }
    return null;
  }

  public async register(
    name: string,
    email: string,
    password: string,
    role: UserRole = 'ANALYST',
    forceStatus?: UserStatus,
    ipAddress = 'unknown',
  ): Promise<{ success: boolean; message: string; user?: Omit<UserAccount, 'passwordHash'> }> {
    await this.ready;
    if (process.env.REGISTRATION_ENABLED !== 'true' && process.env.REGISTRATION_ENABLED !== '1') {
      return { success: false, message: 'Registration is disabled for this private tool.' };
    }
    const rateLimit = this.consumeRegistrationAttempt(ipAddress);
    if (rateLimit) return { success: false, message: rateLimit };
    const normalizedEmail = email.trim().toLowerCase();
    if (!name || !normalizedEmail || !password) return { success: false, message: 'All fields are required.' };
    if (password.length < 12 || password.length > 128) return { success: false, message: 'Password must be between 12 and 128 characters long.' };
    if (normalizedEmail.length > 254) return { success: false, message: 'Email is too long.' };
    if (name.trim().length > 100) return { success: false, message: 'Name is too long.' };
    if (Array.from(this.users.values()).some((user) => user.email === normalizedEmail)) return { success: false, message: 'An account with this email already exists.' };
    if ((forceStatus || 'PENDING') === 'PENDING' && Array.from(this.users.values()).filter((user) => user.status === 'PENDING').length >= 50) {
      return { success: false, message: 'Pending account limit reached.' };
    }

    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      email: normalizedEmail,
      name: name.trim(),
      role,
      status: forceStatus || 'PENDING',
      createdAt: new Date().toISOString(),
      passwordHash: await this.hashPassword(password),
    };
    this.users.set(newUser.id, newUser);
    this.persistUsers();
    durableStorage.recordAuditEvent({ event_type: 'USER_REGISTERED', actor_id: newUser.id, actor_email: newUser.email, details: { role: newUser.role, status: newUser.status } });
    const { passwordHash: _, ...safeUser } = newUser;
    return { success: true, message: forceStatus === 'APPROVED' ? 'Account created and approved.' : 'Registration submitted. Account status is PENDING administrator approval.', user: safeUser };
  }

  public async login(email: string, password: string, ipAddress = 'unknown'): Promise<{ success: boolean; message: string; token?: string; user?: Omit<UserAccount, 'passwordHash'>; status?: UserStatus }> {
    await this.ready;
    this.ipRequests ||= new Map();
    this.loginFailures ||= new Map();
    const normalizedEmail = email.trim().toLowerCase();
    const genericFailure = { success: false, message: 'Invalid email or password.' } as const;
    const now = Date.now();
    const request = this.ipRequests.get(ipAddress);
    if (request && now - request.firstAt < 15 * 60 * 1000 && request.count >= 30) return genericFailure;
    if (!request || now - request.firstAt >= 15 * 60 * 1000) this.ipRequests.set(ipAddress, { count: 1, firstAt: now }); else request.count += 1;
    const matchedUser = Array.from(this.users.values()).find((user) => user.email === normalizedEmail) || null;
    const failureKey = `${normalizedEmail}|${ipAddress}`;
    const failure = this.loginFailures.get(failureKey);
    if (failure && failure.lockedUntil > now) return genericFailure;
    const passwordValid = await this.verifyPassword(password, matchedUser?.passwordHash || this.dummyPasswordHash);
    if (!passwordValid) {
      const current = this.loginFailures.get(failureKey);
      const next: LoginFailure = !current || now - current.firstAt >= 15 * 60 * 1000 ? { count: 1, firstAt: now, lockedUntil: 0 } : { ...current, count: current.count + 1 };
      if (next.count >= 5) next.lockedUntil = now + 15 * 60 * 1000;
      this.loginFailures.set(failureKey, next);
      durableStorage.recordAuditEvent({ event_type: 'AUTH_FAILED_PASSWORD', actor_email: normalizedEmail, details: { reason: 'Password mismatch' } });
      return genericFailure;
    }
    if (!matchedUser) return genericFailure;
    if (matchedUser.status !== 'APPROVED') {
      durableStorage.recordAuditEvent({ event_type: 'AUTH_DENIED_STATUS', actor_id: matchedUser.id, actor_email: matchedUser.email, details: { status: matchedUser.status } });
      return { success: false, status: matchedUser.status, message: `Account is ${matchedUser.status}. Access requires APPROVED authorization from Lead Researcher.` };
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const sessionNow = Date.now();
    this.sessions.set(tokenHash, { tokenHash, userId: matchedUser.id, createdAt: sessionNow, expiresAt: sessionNow + this.sessionDurationMs });
    this.persistSessions();
    matchedUser.lastLogin = new Date().toISOString();
    this.persistUsers();
    durableStorage.recordAuditEvent({ event_type: 'AUTH_SUCCESS_LOGIN', actor_id: matchedUser.id, actor_email: matchedUser.email, details: { role: matchedUser.role } });
    const { passwordHash: _, ...safeUser } = matchedUser;
    return { success: true, message: 'Authentication successful.', token, user: safeUser, status: matchedUser.status };
  }

  public getUserByToken(token: string): Omit<UserAccount, 'passwordHash'> | null {
    const session = this.sessions.get(this.hashToken(token));
    if (!session || Date.now() > session.expiresAt) return null;
    const user = this.users.get(session.userId);
    if (!user) return null;
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  public logout(token: string): boolean {
    const existed = this.sessions.delete(this.hashToken(token));
    if (existed) this.persistSessions();
    return existed;
  }

  public updateUserStatus(adminUserId: string, targetUserId: string, newStatus: UserStatus): { success: boolean; message: string } {
    const admin = this.users.get(adminUserId);
    if (!admin || admin.role !== 'ADMIN') return { success: false, message: 'Forbidden: Only Master Administrator can modify user statuses.' };
    const target = this.users.get(targetUserId);
    if (!target) return { success: false, message: 'Target user account not found.' };
    if (target.id === adminUserId && newStatus !== 'APPROVED') return { success: false, message: 'Cannot demote or revoke the active Master Administrator.' };
    const oldStatus = target.status;
    target.status = newStatus;
    this.persistUsers();
    if (newStatus === 'SUSPENDED' || newStatus === 'REVOKED') {
      for (const [token, session] of this.sessions.entries()) if (session.userId === targetUserId) this.sessions.delete(token);
      this.persistSessions();
    }
    durableStorage.recordAuditEvent({ event_type: 'USER_STATUS_UPDATED', actor_id: adminUserId, actor_email: admin.email, details: { target_id: targetUserId, target_email: target.email, old_status: oldStatus, new_status: newStatus } });
    return { success: true, message: `User status updated from ${oldStatus} to ${newStatus}.` };
  }

  public listUsers(requesterId: string): Omit<UserAccount, 'passwordHash'>[] {
    const requester = this.users.get(requesterId);
    if (!requester || requester.role !== 'ADMIN') return [];
    return Array.from(this.users.values()).map(({ passwordHash: _, ...safe }) => safe);
  }

  public async bootstrapUser(name: string, email: string, password: string, role: UserRole, status: UserStatus): Promise<Omit<UserAccount, 'passwordHash'>> {
    await this.ready;
    const normalizedEmail = email.trim().toLowerCase();
    const existing = Array.from(this.users.values()).find((user) => user.email === normalizedEmail);
    const user: UserAccount = existing || { id: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, email: normalizedEmail, name, role, status, createdAt: new Date().toISOString() };
    user.name = name;
    user.role = role;
    user.status = status;
    user.passwordHash = await this.hashPassword(password);
    this.users.set(user.id, user);
    this.persistUsers();
    const { passwordHash: _, ...safe } = user;
    return safe;
  }
}

export const authService = new AuthService();
