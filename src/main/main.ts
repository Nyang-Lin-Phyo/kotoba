import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { isTrustedSender, windowOptions } from './security.mts';

// Windows installer/uninstaller shortcuts must quit immediately.
if (started) {
  app.quit();
}

const devServerUrl: string | undefined = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const isDev = Boolean(devServerUrl);

const allowedOrigins: readonly string[] = devServerUrl
  ? ['file://', new URL(devServerUrl).origin]
  : ['file://'];

app.setName('Kotoba');

function createWindow(): void {
  const mainWindow = new BrowserWindow(windowOptions(path.join(__dirname, 'preload.cjs')));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });

  registerIpcHandlers(allowedOrigins, isDev);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  contents.on('will-navigate', (event, url) => {
    if (!isTrustedSender(url, allowedOrigins)) {
      event.preventDefault();
    }
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
