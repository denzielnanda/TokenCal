import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Provider, Settings, SourceStatus, Snapshot } from '../src/shared/types';
import { consumeLine, initialState, type FileState } from './parser';
import { claudeHistoryLimits } from './limits';
import { buildSnapshot } from './summary';

interface Checkpoint {
  offset: number;
  size: number;
  mtime: number;
  inode: number;
  signature: string;
  state: FileState;
}
interface Cache {
  version: number;
  config: string;
  files: Record<string, Checkpoint>;
}
const CACHE_VERSION = 2;
const MAX_LINE = 32 * 1024 * 1024;
export class Collector {
  private files: Record<string, Checkpoint> = {};
  private config = '';
  private loaded = false;
  constructor(private cachePath?: string) {}
  async scan(settings: Settings, now = Date.now()): Promise<Snapshot> {
    const config = JSON.stringify([
      settings.claudeEnabled,
      settings.codexEnabled,
      settings.claudePath,
      settings.codexPath,
      settings.retentionDays,
    ]);
    if (!this.loaded) {
      this.loaded = true;
      if (this.cachePath)
        try {
          const stat = await fs.stat(this.cachePath);
          if (stat.size < 100 * 1024 * 1024) {
            const cache = JSON.parse(await fs.readFile(this.cachePath, 'utf8')) as Cache;
            if (
              cache.version === CACHE_VERSION &&
              cache.config === config &&
              cache.files &&
              typeof cache.files === 'object'
            )
              this.files = cache.files;
          }
        } catch {
          /* A cache is disposable. Source logs are authoritative. */
        }
    }
    let changed = false;
    if (this.config && this.config !== config) {
      this.files = {};
      changed = true;
    }
    this.config = config;
    const warnings: string[] = [],
      sources: SourceStatus[] = [],
      states: FileState[] = [];
    const seen = new Set<string>();
    const cutoff = now - settings.retentionDays * 86_400_000;
    for (const provider of ['claude', 'codex'] as Provider[]) {
      const root = settings[`${provider}Path`];
      const source: SourceStatus = {
        id: provider,
        label: provider === 'claude' ? 'Claude Code sessions' : 'Codex sessions',
        path: root,
        state: settings[`${provider}Enabled`] ? 'ready' : 'disabled',
        files: 0,
      };
      sources.push(source);
      if (source.state === 'disabled') continue;
      let candidates: string[] = [];
      try {
        candidates = await this.discover(root, 0, warnings);
        if (provider === 'codex' && path.basename(root) === 'sessions') {
          try {
            candidates.push(
              ...(await this.discover(
                path.join(path.dirname(root), 'archived_sessions'),
                0,
                warnings,
              )),
            );
          } catch {
            /* Optional archive. */
          }
        }
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        source.state = code === 'ENOENT' ? 'missing' : 'error';
        source.message =
          code === 'ENOENT'
            ? 'No session folder found yet.'
            : 'Cannot read this folder. Check file permissions.';
        continue;
      }
      for (const file of candidates) {
        try {
          const stat = await fs.stat(file);
          if (stat.mtimeMs < cutoff) continue;
          source.files++;
          seen.add(file);
          let checkpoint = this.files[file];
          if (
            !checkpoint ||
            checkpoint.inode !== stat.ino ||
            stat.size < checkpoint.offset ||
            (stat.size === checkpoint.size && stat.mtimeMs !== checkpoint.mtime)
          ) {
            checkpoint = {
              offset: 0,
              size: 0,
              mtime: 0,
              inode: stat.ino,
              signature: '',
              state: initialState(provider, file),
            };
            changed = true;
          } else if (
            checkpoint.offset > 0 &&
            (checkpoint.size !== stat.size || checkpoint.mtime !== stat.mtimeMs)
          ) {
            const signature = await this.signature(file, checkpoint.offset);
            if (signature !== checkpoint.signature) {
              checkpoint = {
                offset: 0,
                size: 0,
                mtime: 0,
                inode: stat.ino,
                signature: '',
                state: initialState(provider, file),
              };
              changed = true;
            }
          }
          if (checkpoint.size !== stat.size || checkpoint.mtime !== stat.mtimeMs) {
            checkpoint.offset = await this.readLines(file, checkpoint.offset, checkpoint.state);
            checkpoint.size = stat.size;
            checkpoint.mtime = stat.mtimeMs;
            checkpoint.signature = await this.signature(file, checkpoint.offset);
            // Prune metadata only; no transcript text enters the cache.
            for (const [id, e] of Object.entries(checkpoint.state.events))
              if (e.timestamp < cutoff) delete checkpoint.state.events[id];
            for (const [id, a] of Object.entries(checkpoint.state.activities))
              if ((a.endedAt ?? a.startedAt) < cutoff) delete checkpoint.state.activities[id];
            changed = true;
          }
          this.files[file] = checkpoint;
          states.push(checkpoint.state);
        } catch {
          source.state = 'error';
          source.message = 'Some logs could not be read. Readable sessions are still included.';
        }
      }
    }
    for (const file of Object.keys(this.files))
      if (!seen.has(file)) {
        delete this.files[file];
        changed = true;
      }
    let history: unknown = null;
    const historySource: SourceStatus = {
      id: 'claude-history',
      label: 'Claude desktop limits',
      path: settings.claudeHistoryPath,
      state: settings.claudeEnabled ? 'ready' : 'disabled',
      files: 0,
    };
    sources.push(historySource);
    if (settings.claudeEnabled)
      try {
        const stat = await fs.stat(settings.claudeHistoryPath);
        if (stat.size > 4 * 1024 * 1024) throw new Error('History too large');
        history = JSON.parse(await fs.readFile(settings.claudeHistoryPath, 'utf8'));
        historySource.files = 1;
      } catch (e) {
        historySource.state = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error';
        historySource.message = 'Open Claude desktop to make local plan usage available.';
      }
    const malformed = states.reduce((n, s) => n + s.malformed, 0);
    if (malformed) warnings.push(`${malformed} malformed or oversized log lines were skipped.`);
    if (changed && this.cachePath)
      try {
        await fs.mkdir(path.dirname(this.cachePath), { recursive: true, mode: 0o700 });
        const tmp = this.cachePath + '.tmp';
        await fs.writeFile(
          tmp,
          JSON.stringify({ version: CACHE_VERSION, config, files: this.files }),
          { mode: 0o600 },
        );
        await fs.rename(tmp, this.cachePath);
      } catch {
        warnings.push('The usage cache could not be saved. Tracking still works.');
      }
    return buildSnapshot(
      states,
      settings,
      sources,
      claudeHistoryLimits(history, now),
      now,
      warnings,
    );
  }
  private async discover(root: string, depth: number, warnings: string[]): Promise<string[]> {
    if (depth > 10) {
      warnings.push('Folders deeper than ten levels were skipped.');
      return [];
    }
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
      const name = path.join(root, e.name);
      if (e.isDirectory())
        try {
          files.push(...(await this.discover(name, depth + 1, warnings)));
        } catch {
          warnings.push('An unreadable session subfolder was skipped.');
        }
      else if (e.isFile() && e.name.endsWith('.jsonl')) files.push(name);
      // Symlinks are intentionally not followed outside a selected source folder.
      if (files.length >= 20000) {
        warnings.push('The first 20,000 session files were scanned.');
        break;
      }
    }
    return files;
  }
  private async signature(file: string, offset: number) {
    if (!offset) return '';
    const h = await fs.open(file, 'r');
    try {
      const b = Buffer.alloc(Math.min(256, offset));
      await h.read(b, 0, b.length, offset - b.length);
      return createHash('sha256').update(b).digest('hex');
    } finally {
      await h.close();
    }
  }
  private async readLines(file: string, start: number, state: FileState): Promise<number> {
    let parts: Buffer[] = [],
      length = 0,
      skip = false,
      position = start,
      committed = start;
    const stream = createReadStream(file, { start, highWaterMark: 256 * 1024 });
    for await (const chunk of stream) {
      const buffer = chunk as Buffer;
      let cursor = 0;
      while (cursor < buffer.length) {
        const newline = buffer.indexOf(10, cursor),
          end = newline < 0 ? buffer.length : newline;
        const part = buffer.subarray(cursor, end);
        length += part.length;
        if (length > MAX_LINE) {
          skip = true;
          parts = [];
        } else if (!skip) parts.push(part);
        position += part.length + (newline < 0 ? 0 : 1);
        if (newline >= 0) {
          if (skip) state.malformed++;
          else consumeLine(state, Buffer.concat(parts, length).toString('utf8'));
          committed = position;
          parts = [];
          length = 0;
          skip = false;
        }
        cursor = end + 1;
      }
    }
    // An unfinished JSONL record is re-read next scan after its newline arrives.
    return committed;
  }
}
