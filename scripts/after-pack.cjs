const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const bundle = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // Finder can add attributes to generated Desktop bundles that codesign rejects.
  // Remove only the two prohibited metadata keys; preserve quarantine and all others.
  for (const key of ['com.apple.FinderInfo', 'com.apple.ResourceFork']) {
    await promisify(execFile)('/usr/bin/xattr', ['-d', '-r', '-s', key, bundle]);
  }
  // Electron's prebuilt executable retains its old signature after the bundle is
  // repackaged. Give local builds a valid ad-hoc seal, including bundled helpers.
  // Electron Builder replaces this seal with Developer ID when one is configured.
  await promisify(execFile)('/usr/bin/codesign', [
    '--force', '--deep', '--sign', '-', '--entitlements',
    path.join(context.packager.projectDir, 'assets/entitlements.mac.plist'), bundle,
  ]);
};
