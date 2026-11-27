import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type AppInfo, type KotobaApi } from '../shared/contracts';

// The renderer gets this object and nothing else: no ipcRenderer, no Node, no paths.
const api: KotobaApi = {
  appInfo: () => ipcRenderer.invoke(CHANNELS.appInfo) as Promise<AppInfo>,
};

contextBridge.exposeInMainWorld('kotoba', api);
