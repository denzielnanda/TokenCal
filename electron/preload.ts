import { contextBridge, ipcRenderer } from 'electron';
import type { TokenCalAPI, Snapshot } from '../src/shared/types';
const api: TokenCalAPI = {
  getSnapshot: () => ipcRenderer.invoke('snapshot:get'),
  refresh: () => ipcRenderer.invoke('snapshot:refresh'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  choosePath: (kind) => ipcRenderer.invoke('path:choose', kind),
  exportCSV: () => ipcRenderer.invoke('usage:export'),
  showDashboard: () => ipcRenderer.invoke('dashboard:show'),
  setNotchExpanded: (expanded) => ipcRenderer.invoke('notch:expand', expanded),
  openPricing: (provider) => ipcRenderer.invoke('pricing:open', provider),
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: Snapshot) => callback(snapshot);
    ipcRenderer.on('snapshot:changed', listener);
    return () => ipcRenderer.removeListener('snapshot:changed', listener);
  },
};
contextBridge.exposeInMainWorld('tokenCal', api);
