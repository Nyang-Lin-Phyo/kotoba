import { app, ipcMain } from 'electron';
import { CHANNELS, type AppInfo } from '../shared/contracts';
import { isTrustedSender } from './security.mts';

export function buildAppInfo(isDev: boolean): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
    platform: process.platform,
    isDev,
  };
}

export function registerIpcHandlers(allowedOrigins: readonly string[], isDev: boolean): void {
  ipcMain.handle(CHANNELS.appInfo, (event) => {
    if (!isTrustedSender(event.senderFrame?.url, allowedOrigins)) {
      throw new Error('UNTRUSTED_SENDER');
    }
    return buildAppInfo(isDev);
  });
}
