import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import type { Settings, Price } from '../src/shared/types';

export function defaultSettings(home = os.homedir(), platform = process.platform): Settings {
  const claudeDir =
    process.env.CLAUDE_CONFIG_DIR ||
    (existsSync(path.join(home, '.claude'))
      ? path.join(home, '.claude')
      : existsSync(path.join(home, '.config', 'claude'))
        ? path.join(home, '.config', 'claude')
        : path.join(home, '.claude'));
  const codexDir = process.env.CODEX_HOME || path.join(home, '.codex');
  const support =
    platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return {
    claudeEnabled: true,
    codexEnabled: true,
    claudePath: path.join(claudeDir, 'projects'),
    codexPath: path.join(codexDir, 'sessions'),
    claudeHistoryPath: path.join(support, 'Claude', 'plan-usage-history.json'),
    pollSeconds: 10,
    retentionDays: 90,
    launchAtLogin: false,
    notchEnabled: false,
    widgetMode: 'auto',
    autoDetectSources: true,
    claudePlanSource: 'local',
    trayCost: true,
    notifications: false,
    dailyBudget: 0,
    priceOverrides: {},
  };
}
const boolKeys = [
  'claudeEnabled',
  'codexEnabled',
  'launchAtLogin',
  'notchEnabled',
  'trayCost',
  'notifications',
  'autoDetectSources',
] as const;
const pathKeys = ['claudePath', 'codexPath', 'claudeHistoryPath'] as const;
export function validateSettings(patch: unknown, current: Settings): Settings {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('Settings must be an object.');
  const result = { ...current },
    p = patch as Record<string, unknown>;
  for (const key of boolKeys)
    if (key in p) {
      if (typeof p[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
      result[key] = p[key] as boolean;
    }
  for (const key of pathKeys)
    if (key in p) {
      if (
        typeof p[key] !== 'string' ||
        (p[key] as string).length > 4096 ||
        !path.isAbsolute(p[key] as string)
      )
        throw new Error('Choose an absolute local path.');
      result[key] = p[key] as string;
    }
  if ('claudePlanSource' in p) {
    if (p.claudePlanSource !== 'local' && p.claudePlanSource !== 'account')
      throw new Error('Invalid Claude plan source.');
    result.claudePlanSource = p.claudePlanSource;
  }
  // The old preview's automatic liveClaudeUsage flag is deliberately ignored.
  // Upgrades require a new, explicit account-source choice.
  if ('widgetMode' in p) {
    if (!['auto', 'notch', 'edge'].includes(String(p.widgetMode)))
      throw new Error('Invalid widget placement.');
    result.widgetMode = p.widgetMode as Settings['widgetMode'];
  }
  for (const [key, min, max] of [
    ['pollSeconds', 5, 300],
    ['retentionDays', 7, 365],
    ['dailyBudget', 0, 100000],
  ] as const)
    if (key in p) {
      const n = p[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
        throw new Error(`Invalid ${key}.`);
      result[key] = key === 'dailyBudget' ? n : Math.round(n);
    }
  if ('priceOverrides' in p) {
    if (
      !p.priceOverrides ||
      typeof p.priceOverrides !== 'object' ||
      Array.isArray(p.priceOverrides)
    )
      throw new Error('Invalid price overrides.');
    const overrides: Record<string, Price> = {};
    if (Object.keys(p.priceOverrides).length > 200) throw new Error('Too many price overrides.');
    for (const [model, value] of Object.entries(p.priceOverrides)) {
      if (
        !/^[a-zA-Z0-9._:/-]{1,160}$/.test(model) ||
        ['__proto__', 'constructor', 'prototype'].includes(model) ||
        !value ||
        typeof value !== 'object'
      )
        throw new Error('Invalid model price.');
      const price = value as Record<string, unknown>,
        clean: Record<string, number> = {};
      for (const key of [
        'input',
        'cached',
        'output',
        'cacheWrite',
        'cacheWriteLong',
        'fastMultiplier',
        'longContextAbove',
        'longInputMultiplier',
        'longOutputMultiplier',
        'domesticMultiplier',
      ]) {
        const n = price[key];
        if (
          n === undefined &&
          !['input', 'cached', 'output', 'cacheWrite', 'cacheWriteLong'].includes(key)
        )
          continue;
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e7)
          throw new Error(`Invalid ${key} price.`);
        clean[key] = n;
      }
      overrides[model] = clean as unknown as Price;
    }
    result.priceOverrides = overrides;
  }
  return result;
}
