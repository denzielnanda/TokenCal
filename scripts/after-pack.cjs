const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const bundle = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // Finder can add attributes to generated Desktop bundles that codesign rejects.
  // Remove only the two prohibited metadata keys; preserve quarantine and all others.
  const script = `
import os, sys
bundle = sys.argv[1]
keys = {'com.apple.FinderInfo', 'com.apple.ResourceFork'}
for root, dirs, files in os.walk(bundle, followlinks=False):
    for item in [root] + [os.path.join(root, f) for f in files]:
        if os.path.islink(item): continue
        for key in set(os.listxattr(item)) & keys:
            os.removexattr(item, key)
`;
  await promisify(execFile)('/usr/bin/python3', ['-c', script, bundle]);
};
