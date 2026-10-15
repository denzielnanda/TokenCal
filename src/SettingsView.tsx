import { useState } from 'react';
import {
  Check,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Info,
  LockKeyhole,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Price, Settings, Snapshot } from './shared/types';
import { modelLabel, providerLabel, relativeTime } from './shared/format';

export default function SettingsView({
  snapshot,
  demo,
  onUpdate,
  onError,
  onNotice,
}: {
  snapshot: Snapshot;
  demo: boolean;
  onUpdate: (patch: Partial<Settings>) => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const settings = snapshot.settings;
  const [busy, setBusy] = useState(false),
    [model, setModel] = useState(snapshot.unknownModels[0] ?? '');
  const [rates, setRates] = useState({
    input: '',
    cached: '',
    output: '',
    cacheWrite: '',
    cacheWriteLong: '',
  });
  const [budget, setBudget] = useState(String(settings.dailyBudget));
  async function save(patch: Partial<Settings>) {
    setBusy(true);
    try {
      await onUpdate(patch);
      onError('');
      onNotice('Preferences saved.');
      setTimeout(() => onNotice(''), 3500);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Preferences could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function choose(kind: 'claude' | 'codex' | 'history') {
    if (demo) return;
    try {
      const file = await window.tokenCal!.choosePath(kind);
      if (file)
        await save({
          [kind === 'history'
            ? 'claudeHistoryPath'
            : kind === 'claude'
              ? 'claudePath'
              : 'codexPath']: file,
        });
    } catch {
      onError('The source picker could not open.');
    }
  }
  const toggle = (key: keyof Settings, label: string, description: string) => (
    <div className="setting-row" key={key}>
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={Boolean(settings[key])}
        aria-label={label}
        disabled={demo || busy}
        className={`toggle ${settings[key] ? 'on' : ''}`}
        onClick={() => save({ [key]: !settings[key] })}
      >
        <span />
      </button>
    </div>
  );
  const selectModel = (value: string) => {
    setModel(value);
    const price = snapshot.prices[value];
    if (price)
      setRates(
        Object.fromEntries(
          Object.keys(rates).map((k) => [k, String(price[k as keyof Price] ?? 0)]),
        ) as typeof rates,
      );
  };
  return (
    <div className="settings-stack">
      {demo && (
        <div className="warning-banner">
          <Info size={16} /> Preferences are read-only while sample data is on.
        </div>
      )}
      <section className="card settings-card">
        <div className="section-row">
          <div>
            <h3>Desktop preferences</h3>
            <p>A quiet companion for your workflow.</p>
          </div>
          <HardDrive size={20} />
        </div>
        {toggle(
          'launchAtLogin',
          'Launch at login',
          'Start quietly in the menu bar or system tray.',
        )}
        {toggle(
          'notchEnabled',
          'Show notch / top-edge widget',
          'Keep cost and session time beside your MacBook’s camera. Hover for usage and resets.',
        )}
        <div className="setting-row">
          <div>
            <strong>Widget placement</strong>
            <p>
              {snapshot.widget?.note ??
                'Automatically fits a MacBook notch, or uses a top-edge panel.'}
            </p>
          </div>
          <select
            aria-label="Widget placement"
            disabled={demo || busy}
            value={settings.widgetMode}
            onChange={(e) => save({ widgetMode: e.target.value as Settings['widgetMode'] })}
          >
            <option value="auto">Automatic</option>
            <option value="notch">MacBook notch</option>
            <option value="edge">Top-edge panel</option>
          </select>
        </div>
        {toggle(
          'trayCost',
          'Show cost in the menu bar',
          'Display today’s estimated USD next to the macOS menu icon.',
        )}
        {toggle(
          'notifications',
          'Usage notifications',
          'Notify at 80% and 95% of a freshly observed limit, or your daily cost target.',
        )}
        <div className="setting-row">
          <div>
            <strong>Refresh interval</strong>
            <p>Only changed local logs are processed.</p>
          </div>
          <select
            aria-label="Refresh interval"
            disabled={demo || busy}
            value={settings.pollSeconds}
            onChange={(e) => save({ pollSeconds: Number(e.target.value) })}
          >
            {[5, 10, 30, 60, 300].map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} seconds` : `${n / 60} minute${n > 60 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>History range</strong>
            <p>How far back TokenCal reads. Source files stay untouched.</p>
          </div>
          <select
            aria-label="History range"
            disabled={demo || busy}
            value={settings.retentionDays}
            onChange={(e) => save({ retentionDays: Number(e.target.value) })}
          >
            {[7, 30, 90, 365].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </div>
        <form
          className="setting-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ dailyBudget: Number(budget) });
          }}
        >
          <div>
            <strong>Daily cost target</strong>
            <p>API-equivalent USD. Set to 0 to disable the target.</p>
          </div>
          <div className="budget-input">
            <span>$</span>
            <input
              aria-label="Daily cost target"
              disabled={demo || busy}
              type="number"
              min="0"
              max="100000"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <button disabled={demo || busy} className="secondary-button" type="submit">
              Save
            </button>
          </div>
        </form>
      </section>
      <section className="card settings-card">
        <h3>Local data sources</h3>
        <p>TokenCal finds your existing agent logs and Claude Code login automatically.</p>
        {toggle('liveClaudeUsage', 'Refresh Claude plan usage automatically',
          'Use Claude Code’s saved login to read usage from Anthropic every three minutes. No new sign-in or changes to Claude settings.')}
        {snapshot.claudeLive && <div className="settings-info"><Info size={16} /><p>
          {snapshot.claudeLive.message} {snapshot.claudeLive.state === 'permission'
            ? 'Use Refresh at the top of TokenCal to request access again.' : ''}
        </p></div>}
        {toggle(
          'autoDetectSources',
          'Find sessions automatically',
          'Detect native folders, custom agent homes, and running WSL distributions. No setup needed.',
        )}
        {toggle(
          'claudeEnabled',
          'Track Claude Code',
          'Read token counts and model names from Claude Code transcripts.',
        )}
        {toggle(
          'codexEnabled',
          'Track Codex',
          'Read local rollouts, archived sessions, and recorded usage limits.',
        )}
        <details className="source-advanced">
          <summary>Source details and optional folder overrides</summary>
          <div className="source-list">
            {snapshot.sources.map((source) => (
              <div className="source-row" key={source.id}>
                <div>
                  <div>
                    <strong>{source.label}</strong>
                    <span className={`source-state ${source.state}`}>
                      {source.state === 'ready' ? <Check size={11} /> : null}
                      {source.state}
                    </span>
                  </div>
                  <code>{source.path}</code>
                  <small>
                    {source.message ??
                      `${source.files} ${source.id === 'claude-history' ? 'usage history file' : 'session files'}`}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Choose ${source.label} path`}
                  disabled={demo || busy}
                  onClick={() =>
                    choose(
                      source.id === 'claude-history'
                        ? 'history'
                        : source.id.startsWith('claude')
                          ? 'claude'
                          : 'codex',
                    )
                  }
                >
                  <FolderOpen size={18} />
                </button>
              </div>
            ))}
          </div>
        </details>
        <div className="settings-info">
          <Info size={16} />
          <p>
            Start a coding session and it will appear automatically. On Windows, running WSL
            distributions are detected too. Claude plan usage refreshes from the saved Claude Code
            login. Desktop history is a fallback. Limits cover the account that supplied the reading.
          </p>
        </div>
      </section>
      <section className="card settings-card">
        <div className="section-row">
          <div>
            <h3>Model pricing</h3>
            <p>USD per 1 million tokens · verified {snapshot.pricingUpdatedAt}</p>
          </div>
          <div className="pricing-links">
            {(['claude', 'codex'] as const).map((p) => (
              <button
                key={p}
                className="text-button"
                disabled={demo}
                onClick={() => void window.tokenCal?.openPricing(p)}
              >
                {providerLabel(p)}
                <ExternalLink size={13} />
              </button>
            ))}
          </div>
        </div>
        {snapshot.unknownModels.length > 0 && (
          <div className="inline-warning">
            No verified price for: {snapshot.unknownModels.map(modelLabel).join(', ')}. These tokens
            are shown separately until you add an override.
          </div>
        )}
        <form
          className="price-form"
          onSubmit={(e) => {
            e.preventDefault();
            const price = Object.fromEntries(
              Object.entries(rates).map(([k, v]) => [k, Number(v)]),
            ) as unknown as Price;
            void save({
              priceOverrides: {
                ...settings.priceOverrides,
                [model]: { ...snapshot.prices[model], ...price },
              },
            });
          }}
        >
          <label className="model-input">
            Model identifier
            <input
              required
              disabled={demo || busy}
              list="model-identifiers"
              value={model}
              onChange={(e) => selectModel(e.target.value)}
              placeholder="e.g. claude-opus-5"
              pattern="[a-zA-Z0-9._:/-]{1,160}"
            />
            <datalist id="model-identifiers">
              {[...new Set([...snapshot.unknownModels, ...Object.keys(snapshot.prices)])].map(
                (id) => (
                  <option key={id} value={id} />
                ),
              )}
            </datalist>
          </label>
          <div className="price-inputs">
            {(
              [
                ['input', 'Input'],
                ['cached', 'Cache read'],
                ['output', 'Output'],
                ['cacheWrite', 'Cache write'],
                ['cacheWriteLong', '1h cache write'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  required
                  disabled={demo || busy}
                  type="number"
                  min="0"
                  max="10000000"
                  step="any"
                  value={rates[key]}
                  onChange={(e) => setRates({ ...rates, [key]: e.target.value })}
                  placeholder="0.00"
                />
              </label>
            ))}
          </div>
          <button className="primary-button" disabled={demo || busy || !model} type="submit">
            <Plus size={16} />
            Save local price override
          </button>
        </form>
        {Object.keys(settings.priceOverrides).length > 0 && (
          <div className="override-list">
            {Object.entries(settings.priceOverrides).map(([id, p]) => (
              <div key={id}>
                <span>
                  <strong>{modelLabel(id)}</strong>
                  <small>
                    ${p.input} input · ${p.cached} cached · ${p.output} output
                  </small>
                </span>
                <button
                  className="icon-button"
                  disabled={demo || busy}
                  aria-label={`Remove ${id} override`}
                  onClick={() => {
                    const next = { ...settings.priceOverrides };
                    delete next[id];
                    void save({ priceOverrides: next });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <details className="price-details">
          <summary>View bundled price table ({Object.keys(snapshot.prices).length} models)</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Input</th>
                  <th>Cache read</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(snapshot.prices).map(([id, p]) => (
                  <tr key={id}>
                    <td>{modelLabel(id)}</td>
                    <td>${p.input}</td>
                    <td>${p.cached}</td>
                    <td>${p.output}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <div className="settings-info">
          <Info size={16} />
          <p>
            API value is an estimate, not a subscription invoice. Unknown models stay unpriced.
            Caching, service tier, and available long-context modifiers are applied per response.
          </p>
        </div>
      </section>
      <section className="card privacy-settings">
        <LockKeyhole size={24} />
        <div>
          <h3>Your data stays here.</h3>
          <p>
            No telemetry or new sign-in. Claude plan usage requests go only to Anthropic using your
            existing Claude Code login. Login tokens stay in memory and are never cached or exported.
          </p>
          <small>Last collection: {relativeTime(snapshot.collectedAt)}</small>
        </div>
      </section>
    </div>
  );
}
