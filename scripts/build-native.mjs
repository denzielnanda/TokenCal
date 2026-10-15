import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

if (process.platform === 'darwin') {
  const exec = promisify(execFile);
  await fs.mkdir('native/bin', { recursive: true });
  await fs.mkdir('.cache/swift-modules', { recursive: true });
  let sdk;
  for (const [sourceFile, name] of [['native/NotchInfo.swift', 'notch-info'], ['native/ClaudeAccess.swift', 'claude-access']]) {
    const source = await fs.stat(sourceFile);
    const binary = await fs.stat(`native/bin/${name}`).catch(() => null);
    if (binary && binary.mtimeMs >= source.mtimeMs) continue;
    sdk ??= (await exec('/usr/bin/xcrun', ['--show-sdk-path'])).stdout.trim();
    for (const arch of ['arm64', 'x86_64']) {
      await exec('/usr/bin/xcrun', ['swiftc', '-O', '-sdk', sdk,
        '-module-cache-path', path.resolve('.cache/swift-modules'), '-target', `${arch}-apple-macos14.0`,
        sourceFile, '-o', path.resolve(`native/bin/${name}-${arch}`)], { timeout: 120000 });
    }
    await exec('/usr/bin/lipo', ['-create', `native/bin/${name}-arm64`, `native/bin/${name}-x86_64`,
      '-output', `native/bin/${name}`]);
    await fs.chmod(`native/bin/${name}`, 0o755);
    console.log(`Built universal ${name} helper.`);
  }
}
