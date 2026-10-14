// Developer diagnostic: read this machine's local usage, print aggregate counts only.
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const home = os.homedir();
const claudeDir =
  process.env.CLAUDE_CONFIG_DIR ||
  (fs.existsSync(path.join(home, '.claude'))
    ? path.join(home, '.claude')
    : path.join(home, '.config', 'claude'));
const settings = {
  claudeEnabled: true,
  codexEnabled: true,
  claudePath: path.join(claudeDir, 'projects'),
  codexPath: path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'sessions'),
  claudeHistoryPath: path.join(
    process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    'Claude',
    'plan-usage-history.json',
  ),
  pollSeconds: 10,
  retentionDays: 90,
  launchAtLogin: false,
  notchEnabled: false,
  trayCost: true,
  notifications: false,
  dailyBudget: 0,
  priceOverrides: {},
};
const worker = new Worker(path.resolve('dist-electron/collector.cjs'), {
  workerData: { cachePath: path.resolve('.cache/local-usage-cache.json') },
});
let started = Date.now(),
  runs = 0;
const timeout = setTimeout(() => {
  console.error('Collector timed out');
  worker.terminate();
  process.exitCode = 1;
}, 180000);
worker.on('message', async (result) => {
  if (result.error) {
    console.error(result.error);
    clearTimeout(timeout);
    await worker.terminate();
    process.exitCode = 1;
    return;
  }
  const s = result.snapshot;
  console.log(
    JSON.stringify(
      {
        scan: runs ? 'warm' : 'first',
        milliseconds: Date.now() - started,
        sessions: s.sessions.length,
        todayTokens: s.totals.today.totalTokens,
        todayEstimatedUSD: Math.round(s.totals.today.cost * 100) / 100,
        unpricedModels: s.unknownModels,
        sources: s.sources.map((x) => ({ id: x.id, state: x.state, files: x.files })),
        windows: s.limits.map((p) => ({ provider: p.provider, windows: p.windows.length })),
        warnings: s.warnings,
      },
      null,
      2,
    ),
  );
  if (!runs++) {
    started = Date.now();
    worker.postMessage({ settings });
  } else {
    clearTimeout(timeout);
    await worker.terminate();
  }
});
worker.on('error', (error) => {
  console.error(error.message);
  clearTimeout(timeout);
  process.exitCode = 1;
});
worker.postMessage({ settings });
