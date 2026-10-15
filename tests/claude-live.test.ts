import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CLAUDE_USAGE_URL, ClaudeLiveUsage, parseClaudeLogin, parseClaudeUsage, readClaudeLogin } from '../electron/claude-live';
import { defaultSettings, validateSettings } from '../electron/settings';

const now = Date.now(), token = 'fixture-token-do-not-export';
const loginData = (value = token) => ({ claudeAiOauth: { accessToken: value,
  refreshToken: 'DO-NOT-READ-OR-SAVE', expiresAt: now + 3_600_000,
  scopes: ['user:profile'], subscriptionType: 'max' } });
const usage = (percent = 4) => ({ five_hour: { utilization: percent, resets_at: new Date(now + 3_600_000).toISOString() },
  seven_day: { utilization: 79, resets_at: new Date(now + 86_400_000).toISOString() } });
const localSettings = defaultSettings('/fixture');
const settings = { ...localSettings, claudePlanSource: 'account' as const };
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
describe('optional Claude account plan usage', () => {
  it('uses local files for new and upgraded installations and validates optional logins', () => {
    expect(localSettings.claudePlanSource).toBe('local');
    expect(validateSettings({ liveClaudeUsage: true }, localSettings).claudePlanSource).toBe('local');
    const result = parseClaudeLogin(loginData(), now);
    expect(result).toEqual({ login: { token, expiresAt: now + 3_600_000, plan: 'max' } });
    expect(parseClaudeLogin({ claudeAiOauth: { accessToken: token, scopes: ['user:inference'] } }, now))
      .toEqual({ error: 'scope' });
    expect(parseClaudeLogin({ claudeAiOauth: { accessToken: token, expiresAt: now - 1 } }, now))
      .toEqual({ error: 'expired' });
    expect(parseClaudeLogin({ claudeAiOauth: { accessToken: token + '\r\nInjected: header' } }, now))
      .toEqual({ error: 'missing' });
  });
  it('never reads credentials, prompts, or calls the API in default local mode, even on Refresh', async () => {
    let loginReads = 0, requests = 0;
    const live = new ClaudeLiveUsage(async () => { loginReads++; return parseClaudeLogin(loginData(), now); }, async () => { requests++; return Response.json(usage()); });
    await live.refresh(localSettings, false, true, now);
    await live.refresh(localSettings, true, true, now + 1000);
    expect(loginReads).toBe(0); expect(requests).toBe(0);
    expect(live.getLimits()).toBeNull();
  });
  it('reads Windows/custom-profile login files without modifying any agent settings', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokencal-login-test-')); roots.push(root);
    const folder = path.join(root, '.claude'); await fs.mkdir(folder);
    const file = path.join(folder, '.credentials.json'), raw = JSON.stringify(loginData());
    await fs.writeFile(file, raw, { mode: 0o600 });
    const prefs = { ...defaultSettings(root), autoDetectSources: false, claudePath: path.join(folder, 'projects') };
    expect(await readClaudeLogin(prefs, '', false, { platform: 'win32', home: root })).toEqual(parseClaudeLogin(loginData()));
    expect(await fs.readFile(file, 'utf8')).toBe(raw);
    expect(await fs.stat(path.join(folder, 'settings.json')).then(() => true, () => false)).toBe(false);
  });
  it('uses the Mac Keychain source ahead of a stale file, handles denied permission, and isolates custom profiles', async () => {
    const prefs = { ...defaultSettings('/fixture'), autoDetectSources: false, claudePath: '/fixture/.claude/projects' };
    let prompts: boolean[] = [];
    const keychain = async (prompt: boolean) => { prompts.push(prompt); return loginData(); };
    expect(await readClaudeLogin(prefs, '', true, { platform: 'darwin', home: '/fixture', keychain })).toEqual(parseClaudeLogin(loginData()));
    expect(prompts).toEqual([true]);
    expect(await readClaudeLogin(prefs, '', false, { platform: 'darwin', home: '/fixture',
      keychain: async () => ({ status: 'permission' }) })).toEqual({ error: 'permission' });
    await readClaudeLogin({ ...prefs, claudePath: '/fixture/custom/projects' }, '', false,
      { platform: 'darwin', home: '/fixture', keychain });
    expect(prompts).toEqual([true]);
  });
  it('uses provider reset times, supports missing five-hour data, and never turns missing values into zero', () => {
    const limits = parseClaudeUsage(usage(0), 'max', now);
    expect(limits?.windows[0]).toMatchObject({ usedPercent: 0, source: 'claude-live',
      observedAt: now, resetsAt: now + 3_600_000, resetEstimated: false });
    expect(parseClaudeUsage({ seven_day: usage().seven_day }, null, now)?.windows).toHaveLength(1);
    expect(parseClaudeUsage({ five_hour: { utilization: null } }, null, now)).toBeNull();
    expect(parseClaudeUsage({ five_hour: { utilization: true } }, null, now)).toBeNull();
    expect(parseClaudeUsage({ five_hour: { utilization: 4, resets_at: 'bad' } }, null, now)?.windows[0].resetsAt).toBeNull();
  });
  it('refreshes automatically with one fixed authenticated GET and exposes no tokens in snapshots', async () => {
    let requests = 0;
    const live = new ClaudeLiveUsage(async () => parseClaudeLogin(loginData(), now), async (url, init) => {
      requests++;
      expect(url).toBe(CLAUDE_USAGE_URL); expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
      expect((init?.headers as any).Authorization).toBe(`Bearer ${token}`);
      return Response.json(usage());
    });
    await live.refresh(settings, false, true, now);
    expect(live.status.state).toBe('ready'); expect(live.getLimits(now)?.windows.map(w => w.usedPercent)).toEqual([4, 79]);
    expect(JSON.stringify([live.status, live.getLimits(now)])).not.toContain(token);
    await live.refresh(settings, false, false, now + 1000);
    expect(requests).toBe(1);
    await live.refresh(settings, false, false, now + 180_001);
    expect(requests).toBe(2);
  });
  it('keeps failed refreshes visibly stale, respects 429 backoff even on manual refresh, and clears rejected logins', async () => {
    let response = Response.json(usage()), requests = 0;
    const live = new ClaudeLiveUsage(async () => parseClaudeLogin(loginData(), now), async () => { requests++; return response; });
    await live.refresh(settings, true, false, now);
    response = new Response('', { status: 429, headers: { 'retry-after': '600' } });
    await live.refresh(settings, true, false, now + 1000);
    expect(live.status.nextCheckAt).toBe(now + 601_000);
    expect(live.getLimits(now + 1000)?.windows[0]).toMatchObject({ stale: true, observedAt: now, usedPercent: 4 });
    await live.refresh(settings, true, false, now + 2000); expect(requests).toBe(2);
    response = new Response('', { status: 401 });
    await live.refresh(settings, true, false, now + 602_000);
    expect(live.status.state).toBe('expired'); expect(live.getLimits()).toBeNull();
  });
  it('does not carry one login’s readings into another login, or read any login while disabled', async () => {
    let readCount = 0, currentToken = token;
    let offline = false;
    const live = new ClaudeLiveUsage(async () => { readCount++; return parseClaudeLogin(loginData(currentToken), now); }, async () => {
      if (offline) throw new Error('offline');
      return Response.json(usage());
    });
    await live.refresh(settings, true, false, now);
    currentToken = 'different-fixture-account-token';
    offline = true;
    await live.refresh(settings, true, false, now + 1000); expect(live.getLimits()).toBeNull();
    await live.refresh({ ...settings, claudePlanSource: 'local' }, true, true, now + 1000);
    expect(readCount).toBe(2); expect(live.status.state).toBe('disabled'); expect(live.getLimits()).toBeNull();
  });
  it('ignores an in-flight login result after tracking is disabled', async () => {
    let finish: (value: ReturnType<typeof parseClaudeLogin>) => void;
    let requests = 0;
    const live = new ClaudeLiveUsage(async () => new Promise(resolve => { finish = resolve; }), async () => {
      requests++; return Response.json(usage());
    });
    const pending = live.refresh(settings, true, false, now);
    await live.refresh({ ...settings, claudePlanSource: 'local' }, true, false, now + 100);
    finish!(parseClaudeLogin(loginData(), now)); await pending;
    expect(requests).toBe(0); expect(live.status.state).toBe('disabled'); expect(live.getLimits()).toBeNull();
  });
});
