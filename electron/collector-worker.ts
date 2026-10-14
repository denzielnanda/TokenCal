import { parentPort, workerData } from 'node:worker_threads';
import { Collector } from './collector';
import type { Settings } from '../src/shared/types';
const collector = new Collector(workerData.cachePath);
let scanning = false;
parentPort?.on('message', async (message: { settings: Settings }) => {
  if (scanning) return;
  scanning = true;
  try {
    parentPort?.postMessage({ snapshot: await collector.scan(message.settings) });
  } catch {
    parentPort?.postMessage({
      error: 'Usage collection failed. Check your source paths and refresh.',
    });
  } finally {
    scanning = false;
  }
});
