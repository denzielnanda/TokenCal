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
};
