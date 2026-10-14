import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  dialog,
  shell,
  Notification,
  protocol,
  session,
} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Settings, Snapshot, WidgetGeometry } from '../src/shared/types';
import { defaultSettings, validateSettings } from './settings';
import { buildSnapshot } from './summary';
import { parseNativeDisplays, widgetGeometry, type NativeDisplay } from './notch';

protocol.registerSchemesAsPrivileged([
  { scheme: 'tokencal', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const devURL = process.env.TOKENCAL_DEV_URL;
const dataDir = process.env.TOKENCAL_DATA_DIR;
if (dataDir) app.setPath('userData', path.resolve(dataDir));
app.setName('TokenCal');
if (!app.requestSingleInstanceLock()) app.quit();
let dashboard: BrowserWindow | null = null,
  popup: BrowserWindow | null = null,
  notch: BrowserWindow | null = null,
  tray: Tray | null = null;
let worker: Worker | null = null,
  timer: NodeJS.Timeout | null = null,
  quitting = false,
  scanning = false,
  rescan = false;
let settings = defaultSettings();
let nativeDisplays: NativeDisplay[] = [],
  widget: WidgetGeometry | undefined,
  notchExpanded = false;
let snapshot = buildSnapshot([], settings, [], {
  provider: 'claude',
  plan: null,
  windows: [],
  note: 'Reading local usage…',
});
const noticeKeys = new Set<string>();
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
async function saveSettings() {
  await fs.mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
  const tmp = settingsFile() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await fs.rename(tmp, settingsFile());
}
function publish() {
  snapshot = { ...snapshot, settings, scanning, widget };
  for (const w of [dashboard, popup, notch])
    if (w && !w.isDestroyed()) w.webContents.send('snapshot:changed', snapshot);
  const cost = snapshot.totals.today.cost.toFixed(2);
  if (tray) {
    tray.setToolTip(
      `TokenCal · Today $${cost} estimated · ${snapshot.sessions.filter((s) => s.status === 'working').length} active`,
    );
    if (process.platform === 'darwin')
      tray.setTitle(settings.trayCost ? `$${cost}` : '', { fontType: 'monospacedDigit' });
  }
}
function collect() {
  if (scanning) {
    rescan = true;
    return;
  }
  scanning = true;
  publish();
  worker?.postMessage({ settings });
}
function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(collect, settings.pollSeconds * 1000);
}
function notify() {
  if (!settings.notifications || !Notification.isSupported()) return;
  for (const provider of snapshot.limits)
    for (const w of provider.windows) {
      if (w.stale || w.expired || w.usedPercent < 80) continue;
      const threshold = w.usedPercent >= 95 ? 95 : 80;
      const key = w.id + ':' + w.resetsAt + ':' + threshold;
      if (noticeKeys.has(key)) continue;
      noticeKeys.add(key);
      new Notification({
        title: `${provider.provider === 'claude' ? 'Claude' : 'Codex'} usage at ${Math.round(w.usedPercent)}%`,
        body: `Your ${w.label.toLowerCase()} is approaching its limit.`,
      }).show();
    }
  const key = 'budget:' + new Date().toDateString();
  if (
    settings.dailyBudget > 0 &&
    snapshot.totals.today.cost >= settings.dailyBudget &&
    !noticeKeys.has(key)
  ) {
    noticeKeys.add(key);
    new Notification({
      title: 'Daily cost target reached',
      body: `API-equivalent usage today is $${snapshot.totals.today.cost.toFixed(2)}.`,
    }).show();
  }
}
function createWindow(surface: 'dashboard' | 'popup' | 'notch') {
  const compact = surface !== 'dashboard',
    overlay = surface === 'notch';
  const w = new BrowserWindow({
    width: overlay ? 330 : compact ? 460 : 1180,
    height: overlay ? 48 : compact ? 700 : 820,
    minWidth: compact ? undefined : 860,
    minHeight: compact ? undefined : 640,
    show: false,
    frame: surface === 'dashboard',
    movable: !overlay,
    resizable: !compact,
    transparent: overlay,
    enableLargerThanScreen: overlay,
    backgroundColor: overlay ? '#00000000' : '#f5f6f8',
    title: 'TokenCal',
    skipTaskbar: compact,
    alwaysOnTop: compact,
    hasShadow: !overlay,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.on('will-attach-webview', (e) => e.preventDefault());
  if (overlay) {
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  const url = devURL
    ? `${devURL}/?surface=${surface}`
    : `tokencal://app/index.html?surface=${surface}`;
  void w.loadURL(url);
  w.on('ready-to-show', () => {
    if (overlay) w.showInactive();
  });
  return w;
}
function showDashboard() {
  if (!dashboard || dashboard.isDestroyed()) {
    dashboard = createWindow('dashboard');
    dashboard.on('close', (e) => {
      if (!quitting) {
        e.preventDefault();
        dashboard?.hide();
        if (process.platform === 'darwin') app.dock?.hide();
      }
    });
    dashboard.once('ready-to-show', () => {
      dashboard?.show();
      dashboard?.focus();
    });
  } else {
    dashboard.show();
    dashboard.focus();
  }
  if (process.platform === 'darwin') app.dock?.show();
  popup?.hide();
}
export function showPopup() {
  if (!popup || popup.isDestroyed()) {
    popup = createWindow('popup');
    popup.on('blur', () => popup?.hide());
    popup.once('ready-to-show', () => {
      positionPopup();
      popup?.show();
      popup?.focus();
    });
  } else if (popup.isVisible()) popup.hide();
  else {
    positionPopup();
    popup.show();
    popup.focus();
  }
}
function positionPopup() {
  if (!popup || !tray) return;
  const b = tray.getBounds(),
    display = screen.getDisplayNearestPoint({ x: b.x, y: b.y }),
    area = display.workArea;
  const width = 460,
    height = Math.min(700, area.height - 12);
  const x = Math.round(
    Math.max(area.x + 6, Math.min(b.x + b.width / 2 - width / 2, area.x + area.width - width - 6)),
  );
  const y =
    process.platform === 'darwin'
      ? area.y + 6
      : Math.max(area.y + 6, area.y + area.height - height - 6);
  popup.setBounds({ x, y, width, height });
}
function positionNotch() {
  widget = widgetGeometry(
    screen.getAllDisplays(),
    screen.getPrimaryDisplay().id,
    nativeDisplays,
    settings.widgetMode,
  );
  if (notch && !notch.isDestroyed())
    notch.setBounds(notchExpanded ? widget.expanded : widget.collapsed);
}
async function readDisplays() {
  if (process.platform === 'darwin') {
    try {
      const helper = app.isPackaged
        ? path.join(process.resourcesPath, 'notch-info')
        : path.join(app.getAppPath(), 'native/bin/notch-info');
      const { stdout } = await promisify(execFile)(helper, [], { timeout: 5000, maxBuffer: 65536 });
      nativeDisplays = parseNativeDisplays(stdout);
    } catch {
      nativeDisplays = [];
    }
  }
  positionNotch();
  publish();
}
function applyNotch() {
  if (!settings.notchEnabled) {
    notch?.close();
    notch = null;
    notchExpanded = false;
    positionNotch();
    return;
  }
  if (!notch || notch.isDestroyed()) notch = createWindow('notch');
  positionNotch();
}
function menu() {
  return Menu.buildFromTemplate([
    { label: 'Open TokenCal', click: showDashboard },
    { label: 'Refresh usage', click: collect },
    { type: 'separator' },
    {
      label: 'Show notch / top-edge widget',
      type: 'checkbox',
      checked: settings.notchEnabled,
      click: async (item) => {
        settings = { ...settings, notchEnabled: item.checked };
        applyNotch();
        await saveSettings();
        publish();
      },
    },
    { type: 'separator' },
    { label: 'Quit TokenCal', click: () => app.quit() },
  ]);
}
function authorize(e: Electron.IpcMainInvokeEvent) {
  const allowed = [dashboard, popup, notch].some((w) => w?.webContents === e.sender);
  if (!allowed || e.senderFrame !== e.sender.mainFrame)
    throw new Error('Untrusted TokenCal request.');
}
function handle(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, (e, ...args) => {
    authorize(e);
    return fn(...args);
  });
}
export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function registerIPC() {
  handle('snapshot:get', () => snapshot);
  handle('snapshot:refresh', () => collect());
  handle('dashboard:show', () => showDashboard());
  handle('notch:expand', (expanded: unknown) => {
    if (typeof expanded !== 'boolean') throw new Error('Invalid widget state.');
    notchExpanded = expanded;
    positionNotch();
  });
  handle('settings:update', async (patch: unknown) => {
    const next = validateSettings(patch, settings);
    if (next.launchAtLogin !== settings.launchAtLogin)
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] });
    settings = next;
    await saveSettings();
    applyNotch();
    schedule();
    publish();
    collect();
    return settings;
  });
  handle('path:choose', async (kind: unknown) => {
    if (!['claude', 'codex', 'history'].includes(String(kind))) throw new Error('Invalid source.');
    const result = await dialog.showOpenDialog({
      title: kind === 'history' ? 'Choose Claude usage history' : 'Choose session folder',
      properties:
        kind === 'history' ? ['openFile', 'showHiddenFiles'] : ['openDirectory', 'showHiddenFiles'],
      filters: kind === 'history' ? [{ name: 'JSON', extensions: ['json'] }] : undefined,
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('pricing:open', async (provider: unknown) => {
    if (provider !== 'claude' && provider !== 'codex') throw new Error('Invalid provider.');
    await shell.openExternal(
      provider === 'claude'
        ? 'https://platform.claude.com/docs/en/about-claude/pricing'
        : 'https://developers.openai.com/api/docs/pricing',
    );
  });
  handle('usage:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export session metadata',
      defaultPath: `TokenCal-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const rows = [
      [
        'Provider',
        'Project',
        'Model',
        'Started',
        'Last activity',
        'Active minutes',
        'Input tokens',
        'Cached input',
        'Cache writes',
        'Output tokens',
        'Estimated USD',
        'Unpriced tokens',
      ],
    ];
    for (const s of snapshot.sessions)
      rows.push([
        s.provider,
        s.project,
        s.models.join(' / '),
        new Date(s.startedAt).toISOString(),
        new Date(s.lastActivity).toISOString(),
        (s.activeMs / 60000).toFixed(2),
        String(s.tokens.input),
        String(s.tokens.cached),
        String(s.tokens.cacheWrite),
        String(s.tokens.output),
        s.cost.toFixed(6),
        String(s.unpricedTokens),
      ]);
    await fs.writeFile(
      result.filePath,
      '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'),
      { mode: 0o600 },
    );
    return result.filePath;
  });
}
app.on('second-instance', () => showDashboard());
app.on('activate', () => showDashboard());
app.on('window-all-closed', () => {
  /* Remain in the tray until explicitly quit. */
});
app.on('before-quit', () => {
  quitting = true;
  if (timer) clearInterval(timer);
  void worker?.terminate();
});
void app.whenReady().then(async () => {
  try {
    settings = validateSettings(JSON.parse(await fs.readFile(settingsFile(), 'utf8')), settings);
  } catch {
    /* First launch or invalid settings. */
  }
  snapshot = { ...snapshot, settings };
  protocol.handle('tokencal', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const root = path.join(app.getAppPath(), 'dist'),
      file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    try {
      return new Response(await fs.readFile(file), {
        headers: { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local =
      url.protocol === 'tokencal:' ||
      url.protocol === 'devtools:' ||
      url.protocol === 'data:' ||
      (!!devURL &&
        ['http:', 'ws:'].includes(url.protocol) &&
        url.hostname === '127.0.0.1' &&
        url.port === '5173');
    callback({ cancel: !local });
  });
  const icon = path.join(
    app.getAppPath(),
    'assets',
    process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png',
  );
  const img = nativeImage
    .createFromPath(icon)
    .resize({ width: process.platform === 'darwin' ? 18 : 32 });
  if (process.platform === 'darwin') img.setTemplateImage(true);
  tray = new Tray(img);
  tray.on('click', showPopup);
  tray.on('right-click', () => tray?.popUpContextMenu(menu()));
  registerIPC();
  worker = new Worker(path.join(__dirname, 'collector.cjs'), {
    workerData: { cachePath: path.join(app.getPath('userData'), 'usage-cache.json') },
  });
  worker.on('message', (message) => {
    scanning = false;
    if (message.snapshot) snapshot = message.snapshot;
    else snapshot = { ...snapshot, warnings: [message.error ?? 'Collection failed.'] };
    publish();
    notify();
    if (rescan) {
      rescan = false;
      collect();
    }
  });
  worker.on('error', () => {
    scanning = false;
    snapshot = {
      ...snapshot,
      warnings: ['The collector stopped. Restart TokenCal to resume tracking.'],
    };
    publish();
  });
  screen.on('display-metrics-changed', () => void readDisplays());
  screen.on('display-added', () => void readDisplays());
  screen.on('display-removed', () => void readDisplays());
  await readDisplays();
  applyNotch();
  collect();
  schedule();
  if (!process.argv.includes('--hidden') && !app.getLoginItemSettings().wasOpenedAtLogin)
    showDashboard();
  else if (process.platform === 'darwin') app.dock?.hide();
});
