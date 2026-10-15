import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Settings } from '../src/shared/types';

export interface DiscoveryContext {
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  wslHomes: { distro: string; home: string }[];
}
export function sourceCandidates(settings: Settings, context: DiscoveryContext) {
  const { home, platform, env } = context;
  const p = platform === 'win32' ? path.win32 : path.posix;
  const claude = [settings.claudePath],
    codex = [settings.codexPath],
    history = [settings.claudeHistoryPath];
  if (settings.autoDetectSources) {
    for (const root of [
      env.CLAUDE_CONFIG_DIR,
      p.join(home, '.claude'),
      p.join(home, '.config', 'claude'),
    ])
      if (root && p.isAbsolute(root)) claude.push(p.join(root, 'projects'));
    for (const root of [env.CODEX_HOME, p.join(home, '.codex')])
      if (root && p.isAbsolute(root)) codex.push(p.join(root, 'sessions'));
    if (platform === 'win32') {
      for (const item of context.wslHomes) {
        if (
          !/^[a-zA-Z0-9._-]+$/.test(item.distro) ||
          !item.home.startsWith('/') ||
          item.home.includes('..')
        )
          continue;
        const base = p.join(
          '\\\\wsl.localhost',
          item.distro,
          ...item.home.split('/').filter(Boolean),
        );
        claude.push(
          p.join(base, '.claude', 'projects'),
          p.join(base, '.config', 'claude', 'projects'),
        );
        codex.push(p.join(base, '.codex', 'sessions'));
      }
      if (env.APPDATA) history.push(p.join(env.APPDATA, 'Claude', 'plan-usage-history.json'));
    } else if (platform === 'darwin')
      history.push(
        p.join(home, 'Library', 'Application Support', 'Claude', 'plan-usage-history.json'),
      );
  }
  const unique = (values: string[]) => [
    ...new Map(values.map((v) => [platform === 'win32' ? v.toLowerCase() : v, v])).values(),
  ];
  return { claude: unique(claude), codex: unique(codex), history: unique(history) };
}
const exec = promisify(execFile);
let wslCheckedAt = 0,
  wslHomes: DiscoveryContext['wslHomes'] = [];
async function runningWslHomes() {
  if (Date.now() - wslCheckedAt < 60000) return wslHomes;
  wslCheckedAt = Date.now();
  wslHomes = [];
  try {
    const { stdout } = await exec('wsl.exe', ['--list', '--running', '--quiet'], {
      encoding: 'buffer',
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 65536,
    });
    const raw = stdout.includes(0) ? stdout.toString('utf16le') : stdout.toString('utf8');
    for (const distro of raw
      .replace(/\uFEFF/g, '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^[a-zA-Z0-9._-]+$/.test(s))
      .slice(0, 8)) {
      try {
        const { stdout: output } = await exec(
          'wsl.exe',
          ['--distribution', distro, '--exec', '/usr/bin/printenv', 'HOME'],
          { timeout: 3000, windowsHide: true, maxBuffer: 4096 },
        );
        const home = output.trim();
        if (home.startsWith('/') && !home.includes('\n')) wslHomes.push({ distro, home });
      } catch {
        /* A running distribution may stop between discovery and lookup. */
      }
    }
  } catch {
    /* WSL is optional. Native Windows logs still work. */
  }
  return wslHomes;
}
export async function discoverSources(settings: Settings, context?: DiscoveryContext) {
  const candidates = sourceCandidates(
    settings,
    context ?? {
      home: os.homedir(),
      platform: process.platform,
      env: process.env,
      wslHomes:
        settings.autoDetectSources && process.platform === 'win32' ? await runningWslHomes() : [],
    },
  );
  const existing = async (paths: string[], directory: boolean) => {
    const found: string[] = [];
    for (const source of paths) {
      try {
        const stat = await fs.stat(source);
        if (directory ? stat.isDirectory() : stat.isFile()) found.push(source);
      } catch {
        /* Sources can appear after an agent's first run. */
      }
    }
    return found.length ? found : paths.slice(0, 1);
  };
  return {
    claude: await existing(candidates.claude, true),
    codex: await existing(candidates.codex, true),
    history: await existing(candidates.history, false),
  };
}
