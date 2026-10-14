import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultSettings } from '../electron/settings';
import { discoverSources, sourceCandidates } from '../electron/discovery';
const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
describe('automatic local source discovery', () => {
  it('finds an agent installed after TokenCal first opens, and the legacy Claude directory', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tokencal-discovery-'));
    temporary.push(home);
    const settings = defaultSettings(home);
    settings.claudePath = path.join(home, '.claude/projects');
    settings.codexPath = path.join(home, '.codex/sessions');
    const context = { home, platform: 'darwin' as const, env: {}, wslHomes: [] };
    expect((await discoverSources(settings, context)).claude).toEqual([settings.claudePath]);
    const legacy = path.join(home, '.config/claude/projects');
    await fs.mkdir(legacy, { recursive: true });
    await fs.mkdir(settings.codexPath, { recursive: true });
    expect((await discoverSources(settings, context)).claude).toEqual([legacy]);
    expect((await discoverSources(settings, context)).codex).toEqual([settings.codexPath]);
  });
  it('respects custom agent homes, deduplicates roots and lets manual mode restrict scanning', () => {
    const settings = defaultSettings('/tmp/fixture');
    const context = {
      home: '/tmp/fixture',
      platform: 'darwin' as const,
      env: { CLAUDE_CONFIG_DIR: '/tmp/custom-claude', CODEX_HOME: '/tmp/custom-codex' },
      wslHomes: [],
    };
    expect(sourceCandidates(settings, context).claude).toContain('/tmp/custom-claude/projects');
    expect(sourceCandidates(settings, context).codex).toContain('/tmp/custom-codex/sessions');
    const manual = sourceCandidates({ ...settings, autoDetectSources: false }, context);
    expect(manual.claude).toEqual([settings.claudePath]);
    expect(manual.codex).toEqual([settings.codexPath]);
  });
  it('maps running WSL homes without starting distributions or interpolating shell commands', () => {
    const settings = {
      ...defaultSettings('/tmp/fixture'),
      claudePath: 'C:\\Users\\Ada\\.claude\\projects',
      codexPath: 'C:\\Users\\Ada\\.codex\\sessions',
    };
    const context = {
      home: 'C:\\Users\\Ada',
      platform: 'win32' as const,
      env: {},
      wslHomes: [
        { distro: 'Ubuntu', home: '/home/ada' },
        { distro: 'unsafe;command', home: '/home/ada' },
      ],
    };
    const roots = sourceCandidates(settings, context);
    expect(roots.codex).toEqual([
      'C:\\Users\\Ada\\.codex\\sessions',
      '\\\\wsl.localhost\\Ubuntu\\home\\ada\\.codex\\sessions',
    ]);
    expect(roots.claude).toContain('\\\\wsl.localhost\\Ubuntu\\home\\ada\\.claude\\projects');
  });
});
