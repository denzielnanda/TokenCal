import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('Build macOS installers on macOS.');
const keep = process.argv.includes('--keep-unpacked');
const args = process.argv.slice(2).filter((arg) => arg !== '--keep-unpacked');
// Desktop/cloud folders can reapply FinderInfo while codesign is running.
// Sign in a private temporary directory and copy only finished archives out.
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'tokencal-mac-'));
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.resolve('node_modules/electron-builder/out/cli/cli.js'),
        '--mac',
        'dmg',
        'zip',
        '--arm64',
        '--x64',
        `--config.directories.output=${output}`,
        '--publish',
        'never',
        ...args,
      ],
      { stdio: 'inherit', env: process.env },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Packaging exited ${code}.`)),
    );
  });
  await fs.mkdir('release', { recursive: true });
  for (const file of await fs.readdir(output)) {
    if (/^TokenCal-.*\.(dmg|zip|blockmap)$/.test(file)) {
      await fs.copyFile(path.join(output, file), path.resolve('release', file));
    }
  }
  if (keep) {
    await fs.mkdir('.cache', { recursive: true });
    await fs.writeFile('.cache/mac-build.json', JSON.stringify({ directory: output }));
    console.log(`Packaged applications retained for testing: ${output}`);
  }
  console.log('macOS installers saved in release/');
} finally {
  if (!keep) await fs.rm(output, { recursive: true, force: true });
}
