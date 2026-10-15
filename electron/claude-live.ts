import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderLimits, Settings, LimitWindow, ClaudeLiveStatus } from '../src/shared/types';
import { discoverSources } from './discovery';
import { ageWindow } from './limits';

export const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
type Login = { token: string; expiresAt: number | null; plan: string | null };
type LoginRead = { login: Login } | { error: ClaudeLiveStatus['state'] };
const POLL_MS = 3 * 60_000;
const NOTES: Record<ClaudeLiveStatus['state'], string> = {
  checking: 'Checking Claude plan usage…',
  ready: 'Plan usage and reset times from Claude. Refreshes automatically.',
  disabled: 'Live Claude plan usage is off. Saved desktop history is shown when available.',
  missing: 'No Claude Code login found. Sign in through Claude Code to read plan usage automatically.',
  permission: 'macOS needs permission to read Claude Code’s saved login. Click Refresh to retry the Keychain request.',
  expired: 'Claude Code’s saved login has expired. Continue in Claude Code to renew it, then refresh TokenCal.',
  scope: 'This Claude Code login cannot read plan usage. Sign in with a Claude subscription account in Claude Code.',
  offline: 'Claude plan usage could not refresh. The last reading remains dated and marked stale.',
  'rate-limited': 'Claude asked TokenCal to wait before refreshing. It will retry automatically.',
  error: 'Claude did not return a readable plan allowance. Session costs still update.',
};

export function parseClaudeLogin(data: unknown, now = Date.now()): LoginRead {
  const d = (data as any)?.claudeAiOauth;
  if (!d || typeof d.accessToken !== 'string' ||
    !/^[a-zA-Z0-9._~+\/=\-]{16,8192}$/.test(d.accessToken)) return { error: 'missing' };
  if (Array.isArray(d.scopes) && !d.scopes.includes('user:profile')) return { error: 'scope' };
  const expiresAt = typeof d.expiresAt === 'number' && Number.isFinite(d.expiresAt) ? d.expiresAt : null;
  if (expiresAt !== null && expiresAt <= now) return { error: 'expired' };
  return { login: { token: d.accessToken, expiresAt,
    plan: typeof d.subscriptionType === 'string' && /^[a-zA-Z0-9 _-]{1,40}$/.test(d.subscriptionType)
      ? d.subscriptionType : null } };
}

export async function readClaudeLogin(settings: Settings, helper: string, allowPrompt: boolean,
  options: { platform?: NodeJS.Platform; home?: string; skipKeychain?: boolean;
    keychain?: (prompt: boolean) => Promise<unknown> } = {}): Promise<LoginRead> {
  const platform = options.platform ?? process.platform, home = options.home ?? os.homedir();
  const selected = path.dirname(settings.claudePath);
  const defaultProfile = path.resolve(selected) === path.resolve(home, '.claude');
  if (platform === 'darwin' && defaultProfile && !options.skipKeychain) {
    try {
      const data = options.keychain ? await options.keychain(allowPrompt)
        : JSON.parse((await promisify(execFile)(helper, allowPrompt ? ['--allow-prompt'] : [], {
          timeout: allowPrompt ? 60_000 : 5000, maxBuffer: 1024 * 1024,
        })).stdout);
      if ((data as any)?.status === 'permission') return { error: 'permission' };
      if ((data as any)?.status && !['missing', 'invalid'].includes((data as any).status)) return { error: 'error' };
      if (!(data as any)?.status) return parseClaudeLogin(data);
    } catch { return { error: 'permission' }; }
  }
  const roots = settings.autoDetectSources ? (await discoverSources(settings)).claude : [settings.claudePath];
  for (const directory of [...new Set([selected, ...roots.map(root => path.dirname(root))])]) {
    const file = path.join(directory, '.credentials.json');
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > 1024 * 1024) continue;
      // Decode transiently, then discard everything except the access token and plan metadata.
      return parseClaudeLogin(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { error: 'error' };
    }
  }
  return { error: 'missing' };
}

export function parseClaudeUsage(data: unknown, plan: string | null, now = Date.now()): ProviderLimits | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, any>, windows: LimitWindow[] = [];
  for (const [key, id, label, minutes] of [
    ['five_hour', 'fh', '5-hour window', 300], ['seven_day', 'sd', 'Weekly window', 10080],
    ['seven_day_opus', 'so', 'Opus weekly', 10080], ['seven_day_sonnet', 'sn', 'Sonnet weekly', 10080],
  ] as const) {
    const value = d[key];
    if (!value || typeof value.utilization !== 'number' || !Number.isFinite(value.utilization) ||
      value.utilization < 0 || value.utilization > 100) continue;
    const reset = typeof value.resets_at === 'string' ? Date.parse(value.resets_at) : NaN;
    const resetsAt = Number.isFinite(reset) && reset > 0 && reset < now + 370 * 86_400_000 ? reset : null;
    windows.push(ageWindow({ id: `claude:${id}`, label, windowMinutes: minutes,
      usedPercent: value.utilization, resetsAt, resetEstimated: false, observedAt: now,
      source: 'claude-live', stale: false, expired: false }, now));
  }
  return windows.length ? { provider: 'claude', plan, windows, note: NOTES.ready } : null;
}

async function boundedJSON(response: Response) {
  if (Number(response.headers.get('content-length')) > 1024 * 1024) throw new Error('Oversized usage response');
  if (!response.body) throw new Error('Empty usage response');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024 * 1024) throw new Error('Oversized usage response');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

export class ClaudeLiveUsage {
  status: ClaudeLiveStatus = { state: 'checking', checkedAt: null, nextCheckAt: null, message: NOTES.checking };
  private last: ProviderLimits | null = null;
  private token: string | null = null; // Memory only. Never included in snapshots, logs or caches.
  private profile = '';
  private pending: Promise<void> | null = null;
  private generation = 0;
  private controller: AbortController | null = null;
  constructor(private readLogin: (settings: Settings, allowPrompt: boolean) => Promise<LoginRead>,
    private transport: typeof fetch = (...args) => fetch(...args)) {}
  private setStatus(state: ClaudeLiveStatus['state'], now: number, delay = POLL_MS) {
    this.status = { state, checkedAt: now, nextCheckAt: now + delay, message: NOTES[state] };
  }
  getLimits(now = Date.now()): ProviderLimits | null {
    if (!this.last) return null;
    return { ...this.last, note: this.status.message, windows: this.last.windows.map(w => ({
      ...ageWindow(w, now), stale: this.status.state !== 'ready' || ageWindow(w, now).stale,
    })) };
  }
  async refresh(settings: Settings, force = false, allowPrompt = false, now = Date.now()) {
    if (!settings.claudeEnabled || settings.claudePlanSource !== 'account') {
      this.generation++; this.controller?.abort();
      this.last = null; this.token = null; this.profile = '';
      this.setStatus('disabled', now);
      return;
    }
    if (this.profile !== settings.claudePath) {
      this.generation++; this.controller?.abort();
      this.profile = settings.claudePath; this.token = null; this.last = null;
      this.status = { state: 'checking', checkedAt: null, nextCheckAt: null, message: NOTES.checking };
    }
    if (this.pending) return this.pending;
    // Manual refresh also respects a provider's explicit rate-limit backoff.
    if ((this.status.state === 'rate-limited' || !force) &&
      this.status.nextCheckAt !== null && now < this.status.nextCheckAt) return;
    this.controller = new AbortController();
    this.pending = this.fetchReading(settings, allowPrompt, now, this.generation, this.controller.signal)
      .finally(() => { this.pending = null; });
    await this.pending;
  }
  private async fetchReading(settings: Settings, allowPrompt: boolean, now: number, generation: number, signal: AbortSignal) {
    try {
      const result = await this.readLogin(settings, allowPrompt);
      if (generation !== this.generation) return;
      if ('error' in result) {
        if (result.error === 'missing') { this.last = null; this.token = null; }
        this.setStatus(result.error, now, result.error === 'permission' ? 15 * 60_000 : POLL_MS);
        return;
      }
      const { token, plan } = result.login;
      if (this.token !== token) { this.last = null; this.token = token; }
      const response = await this.transport(CLAUDE_USAGE_URL, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20',
          Accept: 'application/json', 'User-Agent': 'TokenCal/0.2.3' },
      });
      if (generation !== this.generation) return;
      if (response.status === 429) {
        const raw = response.headers.get('retry-after');
        const seconds = raw === null ? NaN : Number(raw);
        const requested = Number.isFinite(seconds) ? seconds * 1000 : raw ? Date.parse(raw) - now : POLL_MS;
        this.setStatus('rate-limited', now, Math.min(3_600_000, Math.max(POLL_MS, requested || POLL_MS)));
        return;
      }
      if (!response.ok) {
        this.setStatus(response.status === 401 ? 'expired' : response.status === 403 ? 'scope'
          : response.status >= 500 ? 'offline' : 'error', now);
        if (response.status === 401 || response.status === 403) { this.last = null; this.token = null; }
        return;
      }
      const reading = parseClaudeUsage(await boundedJSON(response), plan, now);
      if (generation !== this.generation) return;
      if (!reading) { this.setStatus('error', now); return; }
      this.last = reading;
      this.setStatus('ready', now);
    } catch { if (generation === this.generation) this.setStatus('offline', now); }
  }
}
