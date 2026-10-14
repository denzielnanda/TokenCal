import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Collector } from '../electron/collector';
import { defaultSettings } from '../electron/settings';
import type { Settings } from '../src/shared/types';
let root: string, settings: Settings, file: string;
const now = Date.now();
const record = (id: string) =>
  JSON.stringify({
    timestamp: new Date(now).toISOString(),
    type: 'token_usage_record',
    payload: { response_id: id, usage: { input_tokens: 100, output_tokens: 50 } },
  });
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokencal-test-'));
  settings = {
    ...defaultSettings(root),
    autoDetectSources: false,
    claudePath: path.join(root, 'claude'),
    codexPath: path.join(root, 'sessions'),
    claudeHistoryPath: path.join(root, 'history.json'),
  };
  await fs.mkdir(settings.codexPath);
  await fs.mkdir(settings.claudePath);
  file = path.join(settings.codexPath, 's.jsonl');
  await fs.writeFile(
    file,
    JSON.stringify({
      timestamp: new Date(now).toISOString(),
      type: 'turn_context',
      payload: { model: 'gpt-6.1-sol', cwd: '/work/test' },
    }) +
      '\n' +
      record('one') +
      '\n',
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
describe('incremental local collector', () => {
  it('reads growing files, defers unfinished lines, and resumes its metadata cache', async () => {
    const cache = path.join(root, 'cache.json'),
      collector = new Collector(cache);
    expect((await collector.scan(settings, now)).totals.today.totalTokens).toBe(150);
    await fs.appendFile(file, record('two'));
    expect((await collector.scan(settings, now)).totals.today.totalTokens).toBe(150);
    await fs.appendFile(file, '\n');
    expect((await collector.scan(settings, now)).totals.today.totalTokens).toBe(300);
    expect((await new Collector(cache).scan(settings, now)).totals.today.totalTokens).toBe(300);
  });
  it('rebuilds on file truncation or replacement instead of keeping phantom usage', async () => {
    const c = new Collector();
    await c.scan(settings, now);
    await fs.writeFile(file, record('replacement') + '\n');
    expect((await c.scan(settings, now)).totals.today.totalTokens).toBe(150);
    await fs.unlink(file);
    expect((await c.scan(settings, now)).totals.today.totalTokens).toBe(0);
  });
  it('does not retain prompts or replies in its persisted cache', async () => {
    await fs.writeFile(
      path.join(settings.claudePath, 's.jsonl'),
      JSON.stringify({
        timestamp: new Date(now).toISOString(),
        sessionId: 's',
        type: 'assistant',
        message: {
          id: 'm',
          model: 'claude-sonnet-5',
          content: [{ type: 'text', text: 'SECRET DO NOT STORE' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      }) + '\n',
    );
    const cache = path.join(root, 'cache.json');
    const snapshot = await new Collector(cache).scan(settings, now);
    expect(snapshot.totals.today.totalTokens).toBe(180);
    expect(await fs.readFile(cache, 'utf8')).not.toContain('SECRET');
    expect((await fs.stat(cache)).mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
  });
  it('clears a disabled provider and does not follow symlinks', async () => {
    const cache = path.join(root, 'cache.json'),
      c = new Collector(cache);
    await c.scan(settings, now);
    if (process.platform !== 'win32') {
      await fs.symlink(file, path.join(settings.claudePath, 'copy.jsonl'));
      expect((await c.scan(settings, now)).sources[0].files).toBe(0);
    }
    const snapshot = await c.scan({ ...settings, codexEnabled: false }, now);
    expect(snapshot.totals.today.totalTokens).toBe(0);
    expect(await fs.readFile(cache, 'utf8')).not.toContain('response_id');
    expect(snapshot.sources[1].state).toBe('disabled');
  });
  it('survives a corrupt cache and missing provider folders', async () => {
    const cache = path.join(root, 'cache.json');
    await fs.writeFile(cache, 'not json');
    const snapshot = await new Collector(cache).scan(
      { ...settings, claudePath: path.join(root, 'missing') },
      now,
    );
    expect(snapshot.totals.today.totalTokens).toBe(150);
    expect(snapshot.sources[0].state).toBe('missing');
  });
});
