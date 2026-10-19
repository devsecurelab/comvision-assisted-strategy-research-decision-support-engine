// Server-Side Authentication & Access Control Service
// Custom Credentials + Password Hashing (scrypt) + Authorization Status Lifecycle
// (PENDING | APPROVED | SUSPENDED | REVOKED)
// Integrated with Durable Persistence Storage (survives server restart)
// NO HARDCODED PASSWORDS IN SOURCE CODE.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { UserAccount, UserRole, UserStatus } from '../engine/types';
import { durableStorage, StoredSession } from './storage';

export class AuthService {
  private users: Map<string, UserAccount> = new Map();
  private sessions: Map<string, StoredSession> = new Map();
  private sessionDurationMs = 24 * 60 * 60 * 1000; // 24 hours
  private readonly scryptAsync = promisify(crypto.scrypt);
  private activeVerifications = 0;
  private verificationQueue: Array<() => void> = [];
  private loginFailures = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
  private ipRequests = new Map<string, { count: number; firstAt: number }>();
  private registrationRequests = new Map<string, { count: number; firstAt: number }>();
  private dummyPasswordHash = '';

  constructor() {
    this.dummyPasswordHash = this.hashPassword('dummy-password-for-timing-only');
    this.initializeFromStorage();
  }

  /**
   * Cryptographically secure password hash using scrypt
   */
  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Timing-safe password verification
   */
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
      derivedKey = await this.scryptAsync(password, salt, 64) as Buffer;
    } finally {
      release();
    }
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
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

  public resetForTesting() {
    this.users.clear();
    this.sessions.clear();
    this.initializeFromStorage();
  }

  private initializeFromStorage() {
    // 1. Load users from durable storage
    const storedUsers = durableStorage.loadUsers();
    if (storedUsers && storedUsers.length > 0) {
      for (const u of storedUsers) {
        this.users.set(u.id, u);
      }
    } else {
      // First boot: Bootstrap secure default admin without hardcoded cleartext password in source
      this.bootstrapDefaultAccounts();
    }

    // 2. Load active sessions from durable storage
    const now = Date.now();
    const storedSessions = durableStorage.loadSessions();
    for (const s of storedSessions) {
      if (s.expiresAt > now) {
        const key = s.tokenHash || (s.token ? this.hashToken(s.token) : '');
        if (key) this.sessions.set(key, { ...s, tokenHash: key, token: undefined });
      }
    }
  }

  private bootstrapDefaultAccounts() {
    // Secure bootstrap: Generate random key or use environment variable
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || crypto.randomBytes(12).toString('hex');
    
    // 1. Master Administrator (APPROVED)
    const adminId = 'usr-admin-001';
    const adminUser: UserAccount = {
      id: adminId,
      email: 'admin@devsecure.engine',
      name: process.env.ADMIN_NAME || 'Administrator',
      role: 'ADMIN',
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      passwordHash: this.hashPassword(bootstrapPassword),
    };
    this.users.set(adminId, adminUser);

    // Save initial state to disk
    this.persistUsers();

    // Write one-time bootstrap notice to private data file if generated
    try {
      const credsPath = path.join(process.cwd(), 'data', '.admin_bootstrap_secret');
      fs.writeFileSync(credsPath, `email: admin@devsecure.engine\ninitial_password: ${bootstrapPassword}\ngenerated_at: ${new Date().toISOString()}\n`, { mode: 0o600 });
      console.log(`[AuthService] Bootstrapped initial admin: admin@devsecure.engine. Credentials saved securely to data/.admin_bootstrap_secret`);
    } catch {
      // Ignore file write errors if directory not writable
    }
  }

  private persistUsers() {
    durableStorage.saveUsers(Array.from(this.users.values()));
  }

  private persistSessions() {
    durableStorage.saveSessions(Array.from(this.sessions.values()));
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public register(
    name: string,
    email: string,
    password: string,
    role: UserRole = 'ANALYST',
    forceStatus?: UserStatus
  ): { success: boolean; message: string; user?: Omit<UserAccount, 'passwordHash'> } {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name || !normalizedEmail || !password) {
      return { success: false, message: 'All fields are required.' };
    }

    if (password.length < 12 || password.length > 128) return { success: false, message: 'Password must be between 12 and 128 characters long.' };
    if (normalizedEmail.length > 254) return { success: false, message: 'Email is too long.' };
    if (name.trim().length > 100) return { success: false, message: 'Name is too long.' };

    // Check existing
    for (const u of this.users.values()) {
      if (u.email === normalizedEmail) {
        return { success: false, message: 'An account with this email already exists.' };
      }
    }

    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      email: normalizedEmail,
      name: name.trim(),
      role,
      status: forceStatus || 'PENDING',
      createdAt: new Date().toISOString(),
      passwordHash: this.hashPassword(password),
    };

    this.users.set(newUser.id, newUser);
    this.persistUsers();

    durableStorage.recordAuditEvent({
      event_type: 'USER_REGISTERED',
      actor_id: newUser.id,
      actor_email: newUser.email,
      details: { role: newUser.role, status: newUser.status },
    });

    const { passwordHash: _, ...safeUser } = newUser;
    return {
      success: true,
      message: forceStatus === 'APPROVED' 
        ? 'Account created and approved.' 
        : 'Registration submitted. Account status is PENDING administrator approval.',
      user: safeUser,
    };
  }

  public async login(
    email: string,
    password: string,
    ipAddress = 'unknown'
  ): Promise<{
    success: boolean;
    message: string;
    token?: string;
    user?: Omit<UserAccount, 'passwordHash'>;
    status?: UserStatus;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericFailure = { success: false, message: 'Invalid email or password.' } as const;
    const now = Date.now();
    this.ipRequests ||= new Map();
    this.loginFailures ||= new Map();
    const request = this.ipRequests.get(ipAddress);
    if (request && now - request.firstAt < 15 * 60 * 1000 && request.count >= 30) return genericFailure;
    if (!request || now - request.firstAt >= 15 * 60 * 1000) this.ipRequests.set(ipAddress, { count: 1, firstAt: now });
    else request.count += 1;
    let matchedUser: UserAccount | null = null;

    for (const u of this.users.values()) {
      if (u.email === normalizedEmail) {
        matchedUser = u;
        break;
      }
    }

    const failureKey = `${normalizedEmail}|${ipAddress}`;
    const failure = this.loginFailures.get(failureKey);
    if (failure && failure.lockedUntil > now) return genericFailure;
    const passwordValid = await this.verifyPassword(password, matchedUser?.passwordHash || this.dummyPasswordHash || this.hashPassword('dummy-password-for-timing-only'));
    if (!passwordValid) {
      const current = this.loginFailures.get(failureKey);
      const next = !current || now - current.firstAt >= 15 * 60 * 1000 ? { count: 1, firstAt: now, lockedUntil: 0 } : { ...current, count: current.count + 1 };
      if (next.count >= 5) next.lockedUntil = now + 15 * 60 * 1000;
      this.loginFailures.set(failureKey, next);
      durableStorage.recordAuditEvent({
        event_type: 'AUTH_FAILED_PASSWORD',
        actor_email: normalizedEmail,
        details: { reason: 'Password mismatch' },
      });
      return genericFailure;
    }
    if (!matchedUser) return genericFailure;

    // Check status
    if (matchedUser.status !== 'APPROVED') {
      durableStorage.recordAuditEvent({
        event_type: 'AUTH_DENIED_STATUS',
        actor_id: matchedUser.id,
        actor_email: matchedUser.email,
        details: { status: matchedUser.status },
      });
      return {
        success: false,
        status: matchedUser.status,
        message: `Account is ${matchedUser.status}. Access requires APPROVED authorization from Lead Researcher.`,
      };
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const sessionNow = Date.now();
    const session: StoredSession = {
      tokenHash,
      userId: matchedUser.id,
      createdAt: sessionNow,
      expiresAt: sessionNow + this.sessionDurationMs,
    };

    this.sessions.set(tokenHash, session);
    this.persistSessions();

    matchedUser.lastLogin = new Date().toISOString();
    this.persistUsers();

    durableStorage.recordAuditEvent({
      event_type: 'AUTH_SUCCESS_LOGIN',
      actor_id: matchedUser.id,
      actor_email: matchedUser.email,
      details: { role: matchedUser.role },
    });

    const { passwordHash: _, ...safeUser } = matchedUser;
    return {
      success: true,
      message: 'Authentication successful.',
      token,
      user: safeUser,
      status: matchedUser.status,
    };
  }

  public getUserByToken(token: string): Omit<UserAccount, 'passwordHash'> | null {
    const tokenHash = this.hashToken(token);
    const session = this.sessions.get(tokenHash);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(tokenHash);
      this.persistSessions();
      return null;
    }

    let user = this.users.get(session.userId);
    if (!user) {
      const storedUsers = durableStorage.loadUsers();
      const matchedUser = storedUsers?.find((u) => u.id === session.userId);
      if (matchedUser) {
        this.users.set(matchedUser.id, matchedUser);
        user = matchedUser;
      }
    }
    if (!user) return null;

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  public logout(token: string): boolean {
    const existed = this.sessions.delete(this.hashToken(token));
    if (existed) {
      this.persistSessions();
    }
    return existed;
  }

  public updateUserStatus(
    adminUserId: string,
    targetUserId: string,
    newStatus: UserStatus
  ): { success: boolean; message: string } {
    const admin = this.users.get(adminUserId);
    if (!admin || admin.role !== 'ADMIN') {
      return { success: false, message: 'Forbidden: Only Master Administrator can modify user statuses.' };
    }

    const target = this.users.get(targetUserId);
    if (!target) {
      return { success: false, message: 'Target user account not found.' };
    }

    if (target.id === adminUserId && newStatus !== 'APPROVED') {
      return { success: false, message: 'Cannot demote or revoke the active Master Administrator.' };
    }

    const oldStatus = target.status;
    target.status = newStatus;
    this.persistUsers();

    // If revoked or suspended, terminate their active sessions
    if (newStatus === 'SUSPENDED' || newStatus === 'REVOKED') {
      for (const [token, session] of this.sessions.entries()) {
        if (session.userId === targetUserId) {
          this.sessions.delete(token);
        }
      }
      this.persistSessions();
    }

    durableStorage.recordAuditEvent({
      event_type: 'USER_STATUS_UPDATED',
      actor_id: adminUserId,
      actor_email: admin.email,
      details: { target_id: targetUserId, target_email: target.email, old_status: oldStatus, new_status: newStatus },
    });

    return { success: true, message: `User status updated from ${oldStatus} to ${newStatus}.` };
  }

  public listUsers(requesterId: string): Omit<UserAccount, 'passwordHash'>[] {
    const requester = this.users.get(requesterId);
    if (!requester || requester.role !== 'ADMIN') {
      return [];
    }

    return Array.from(this.users.values()).map((u) => {
      const { passwordHash: _, ...safe } = u;
      return safe;
    });
  }

  /**
   * Helper for tests to provision a test user with a specified password
   */
  public bootstrapUser(
    name: string,
    email: string,
    password: string,
    role: UserRole,
    status: UserStatus
  ): Omit<UserAccount, 'passwordHash'> {
    const normalizedEmail = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === normalizedEmail) {
        u.name = name;
        u.role = role;
        u.status = status;
        u.passwordHash = this.hashPassword(password);
        this.persistUsers();
        const { passwordHash: _, ...safe } = u;
        return safe;
      }
    }

    const user: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      email: normalizedEmail,
      name,
      role,
      status,
      createdAt: new Date().toISOString(),
      passwordHash: this.hashPassword(password),
    };
    this.users.set(user.id, user);
    this.persistUsers();
    const { passwordHash: _, ...safe } = user;
    return safe;
  }
}

export const authService = new AuthService();
