import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokencal-desktop-'));
const now = Date.now();
await fs.mkdir(path.join(root, '.codex', 'sessions'), { recursive: true });
await fs.mkdir(path.join(root, '.claude', 'projects'), { recursive: true });
const log = (type, payload, at = now) =>
  JSON.stringify({ timestamp: new Date(at).toISOString(), type, payload });
await fs.writeFile(
  path.join(root, '.codex', 'sessions', 'sample.jsonl'),
  [
    log('session_meta', { id: 'fixture', cwd: '/sample/=SAMPLE' }, now - 180000),
    log('turn_context', { model: 'gpt-6.1-sol' }, now - 180000),
    log('event_msg', { type: 'task_started', turn_id: 'turn-1' }, now - 180000),
    log(
      'token_usage_record',
      {
        response_id: 'response-1',
        usage: { input_tokens: 1000, cached_input_tokens: 500, output_tokens: 100 },
      },
      now - 120000,
    ),
    log('event_msg', { type: 'task_complete' }, now - 60000),
    log('event_msg', {
      type: 'token_count',
      rate_limits: {
        limit_id: 'codex',
        plan_type: 'plus',
        primary: { used_percent: 25, window_minutes: 300, resets_at: now / 1000 + 3600 },
        secondary: { used_percent: 42, window_minutes: 10080, resets_at: now / 1000 + 86400 },
      },
    }),
  ].join('\n') + '\n',
);
const support =
  process.platform === 'darwin'
    ? path.join(root, 'Library', 'Application Support')
    : path.join(root, 'AppData', 'Roaming');
await fs.mkdir(path.join(support, 'Claude'), { recursive: true });
await fs.writeFile(
  path.join(support, 'Claude', 'plan-usage-history.json'),
  JSON.stringify({ version: 2, samples: [{ t: now, org: 'fixture', u: { fh: 18, sd: 51 } }] }),
);
await fs.mkdir(path.join(root, 'data'));
// First launch: no settings file and no folder picker. Only synthetic agent logs exist.
const env = {
  ...process.env,
  HOME: root,
  USERPROFILE: root,
  APPDATA: support,
  CLAUDE_CONFIG_DIR: path.join(root, '.claude'),
  CODEX_HOME: path.join(root, '.codex'),
  TOKENCAL_DATA_DIR: path.join(root, 'data'),
  TOKENCAL_SKIP_KEYCHAIN: '1',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.TOKENCAL_DEV_URL;
let application;
try {
  application = await electron.launch({
    args: process.env.TOKENCAL_TEST_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.TOKENCAL_TEST_EXECUTABLE,
    env,
    timeout: 60000,
  });
  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForFunction(
    async () => {
      const s = await window.tokenCal?.getSnapshot();
      return s && !s.scanning && s.sessions.length === 1;
    },
    null,
    { timeout: 30000 },
  );
  await expect(page.getByText('Your usage, at a glance.')).toBeVisible();
  const chrome = await application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('surface=dashboard'),
    );
    return { movable: w.isMovable(), bounds: w.getBounds(), content: w.getContentBounds() };
  });
  expect(chrome.movable).toBe(true);
  expect(chrome.content.y).toBeGreaterThan(chrome.bounds.y);
  const dragRegions = await page.evaluate(() => {
    const region = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.getPropertyValue('app-region') || style.getPropertyValue('-webkit-app-region');
    };
    return {
      header: region('.topbar'),
      logo: region('.sidebar > .wordmark'),
      controls: region('.topbar > div'),
    };
  });
  expect(dragRegions).toEqual({ header: 'drag', logo: 'drag', controls: 'no-drag' });
  const movement = await application.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('surface=dashboard'),
    );
    const original = w.getBounds();
    const moves = [];
    for (const display of screen.getAllDisplays()) {
      const area = display.workArea;
      const width = Math.max(860, Math.min(original.width, area.width));
      const height = Math.max(640, Math.min(original.height, area.height));
      const target = {
        x: area.x + Math.min(40, Math.max(0, area.width - width)),
        y: area.y + Math.min(40, Math.max(0, area.height - height)),
        width,
        height,
      };
      w.setBounds(target);
      moves.push({ target, actual: w.getBounds() });
    }
    w.setBounds(original);
    return moves;
  });
  for (const move of movement) expect(move.actual).toEqual(move.target);
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  const totals = await page.evaluate(
    async () => (await window.tokenCal.getSnapshot()).totals.today,
  );
  expect(totals.totalTokens).toBe(1100);
  expect(totals.cost).toBeCloseTo(0.00205);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('no-such-project');
  await expect(page.getByText('No sessions here yet')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('');
  await page.getByRole('button', { name: '=SAMPLE' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close session details' }).click();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await expect(page.getByText('By model', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // Real provider transport is replaced only inside this isolated test process.
  // No genuine credentials, Keychain reads, or network requests are used.
  await application.evaluate(() => {
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://api.anthropic.com/api/oauth/usage' || options.redirect !== 'error' ||
        options.headers.Authorization !== 'Bearer tokencal-synthetic-login-token')
        throw new Error('Unexpected provider request.');
      return new Response(JSON.stringify({
        five_hour: { utilization: 4, resets_at: new Date(Date.now() + 3600000).toISOString() },
        seven_day: { utilization: 79, resets_at: new Date(Date.now() + 86400000).toISOString() },
      }), { headers: { 'content-type': 'application/json' } });
    };
  });
  const credentialsPath = path.join(root, '.claude', '.credentials.json');
  const credentials = JSON.stringify({ claudeAiOauth: { accessToken: 'tokencal-synthetic-login-token',
    expiresAt: Date.now() + 3600000, scopes: ['user:profile'], subscriptionType: 'max' } });
  await fs.writeFile(credentialsPath, credentials);
  await page.evaluate(() => window.tokenCal.refresh());
  await expect.poll(() => page.evaluate(async () => (await window.tokenCal.getSnapshot()).claudeLive.state)).toBe('ready');
  const live = await page.evaluate(async () => (await window.tokenCal.getSnapshot()).limits
    .find(p => p.provider === 'claude'));
  expect(live.windows.map(w => w.usedPercent)).toEqual([4, 79]);
  expect(live.windows.every(w => !w.resetEstimated && !w.stale && w.source === 'claude-live')).toBe(true);
  expect(JSON.stringify(live)).not.toContain('tokencal-synthetic-login-token');
  expect(await fs.readFile(credentialsPath, 'utf8')).toBe(credentials);
  expect(await fs.stat(path.join(root, '.claude', 'settings.json')).then(() => true, () => false)).toBe(false);
  await page.getByRole('switch', { name: 'Refresh Claude plan usage automatically' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.tokenCal.getSnapshot()).claudeLive.state)).toBe('disabled');
  expect(await page.evaluate(async () => (await window.tokenCal.getSnapshot()).limits
    .find(p => p.provider === 'claude').windows[0].source)).toBe('claude-desktop');
  await page.getByRole('switch', { name: 'Show notch / top-edge widget' }).click();
  await expect(page.getByRole('switch', { name: 'Show notch / top-edge widget' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect.poll(() => application.windows().length).toBe(2);
  const widget = application.windows().find((w) => w !== page);
  await fs.mkdir('.cache/screenshots', { recursive: true });
  await expect(widget.getByRole('button', { name: 'Expand TokenCal widget' })).toBeVisible();
  await widget.screenshot({ path: '.cache/screenshots/notch-collapsed.png' });
  const geometry = await page.evaluate(async () => (await window.tokenCal.getSnapshot()).widget);
  if (process.env.TOKENCAL_EXPECT_NOTCH === 'true') expect(geometry.placement).toBe('notch');
  const bounds = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('surface=notch'))
      .getBounds(),
  );
  expect(bounds).toEqual(geometry.collapsed);
  // Activate the explicit widget button. CDP hover can lose its target when
  // a floating native window resizes, particularly under Rosetta.
  await widget.getByRole('button', { name: 'Expand TokenCal widget' }).dispatchEvent('click');
  await expect(widget.getByRole('button', { name: 'Open dashboard', exact: true })).toBeVisible();
  if (geometry.placement === 'notch') {
    const clear = await widget.evaluate(() => {
      const camera = document.querySelector('.camera-spacer').getBoundingClientRect();
      const left = document.querySelector('.notch-left strong').getBoundingClientRect();
      const right = document.querySelector('.notch-right strong').getBoundingClientRect();
      return left.right <= camera.left && right.left >= camera.right;
    });
    expect(clear).toBe(true);
  }
  await widget.screenshot({ path: '.cache/screenshots/notch-expanded.png' });
  await page.getByRole('combobox', { name: 'Widget placement' }).selectOption('edge');
  await expect
    .poll(() => page.evaluate(async () => (await window.tokenCal.getSnapshot()).widget.placement))
    .toBe('edge');
  await page.getByRole('combobox', { name: 'Widget placement' }).selectOption('auto');
  await page.getByRole('switch', { name: 'Show notch / top-edge widget' }).click();
  await expect.poll(() => application.windows().length).toBe(1);
  await page.getByRole('switch', { name: 'Show cost in the menu bar' }).click();
  await expect(page.getByRole('switch', { name: 'Show cost in the menu bar' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(root, 'data', 'settings.json'), 'utf8')).trayCost,
    )
    .toBe(false);
  const exportPath = path.join(root, 'export.csv');
  await application.evaluate(({ dialog }, filename) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
  }, exportPath);
  await page.evaluate(() => window.tokenCal.exportCSV());
  expect(await fs.readFile(exportPath, 'utf8')).toContain("'=SAMPLE");
  await application.evaluate(({ app }) =>
    process
      .getBuiltinModule('module')
      .createRequire(`${app.getAppPath()}/package.json`)('./dist-electron/main.cjs')
      .showPopup(),
  );
  await expect.poll(() => application.windows().length).toBe(2);
  const popup = application.windows().find((w) => w !== page);
  await expect(popup.getByRole('button', { name: 'Open dashboard', exact: true })).toBeVisible();
  const popupRegion = await popup.evaluate(() =>
    getComputedStyle(document.querySelector('.compact-header')).getPropertyValue('app-region'),
  );
  expect(popupRegion).toBe('drag');
  await fs.mkdir('.cache/screenshots', { recursive: true });
  await popup.screenshot({ path: '.cache/screenshots/tray.png' });
  await popup.getByRole('button', { name: 'Open dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Explore sample data' }).click();
  await expect(page.getByText('Sample data · explore how TokenCal works')).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dismiss notice' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.mouse.move(1150, 75);
  await page.screenshot({ path: 'assets/screenshot-demo.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to my usage' }).click();
  expect(errors).toEqual([]);
  console.log(
    'Desktop smoke passed: automatic Claude login detection, live quotas/provider resets, no agent edits or credential export, disable/fallback, native title bar, movable windows, collector, sandbox, navigation, settings, widget, tray, CSV, sample mode.',
  );
} finally {
  await application?.close();
  await fs.rm(root, { recursive: true, force: true });
}
