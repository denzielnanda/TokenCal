import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

if (process.platform === 'darwin') {
  const source = await fs.stat('native/NotchInfo.swift');
  const binary = await fs.stat('native/bin/notch-info').catch(() => null);
  if (binary && binary.mtimeMs >= source.mtimeMs) process.exitCode = 0;
  else {
    const exec = promisify(execFile);
    await fs.mkdir('native/bin', { recursive: true });
    const sdk = (await exec('/usr/bin/xcrun', ['--show-sdk-path'])).stdout.trim();
    for (const arch of ['arm64', 'x86_64']) {
      await exec(
        '/usr/bin/xcrun',
        [
          'swiftc',
          '-O',
          '-sdk',
          sdk,
          '-target',
          `${arch}-apple-macos14.0`,
          'native/NotchInfo.swift',
          '-o',
          path.resolve(`native/bin/notch-info-${arch}`),
        ],
        { timeout: 120000 },
      );
    }
    await exec('/usr/bin/lipo', [
      '-create',
      'native/bin/notch-info-arm64',
      'native/bin/notch-info-x86_64',
      '-output',
      'native/bin/notch-info',
    ]);
    await fs.chmod('native/bin/notch-info', 0o755);
    console.log('Built universal MacBook display geometry helper.');
  }
}
