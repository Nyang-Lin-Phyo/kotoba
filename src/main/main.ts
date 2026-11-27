import path from 'node:path';
import { app, BrowserWindow, dialog, powerMonitor, session } from 'electron';
import started from 'electron-squirrel-startup';
import { DatabaseManager } from './database/manager';
import { registerIpcHandlers } from './ipc';
import { resolveDataRoot, type ResolvedDataRoot } from './paths';
import { isTrustedSender, windowOptions } from './security.mts';
import { createBackup } from './services/backup';
import { TimerService } from './services/timer';

// Windows installer/uninstaller shortcuts must quit immediately.
if (started) {
  app.quit();
}

const devServerUrl: string | undefined = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const isDev = Boolean(devServerUrl);

const allowedOrigins: readonly string[] = devServerUrl
  ? ['file://', new URL(devServerUrl).origin]
  : ['file://'];

// Stable application identity: this decides where the profile database lives.
app.setName('Kotoba');

let manager: DatabaseManager | null = null;
let timer: TimerService | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const window = new BrowserWindow(windowOptions(path.join(__dirname, 'preload.cjs')));
  mainWindow = window;

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function openProfileDatabase(): { database: DatabaseManager; resolved: ResolvedDataRoot } {
  const resolved = resolveDataRoot({ isDev, userDataPath: app.getPath('userData') });
  const database = new DatabaseManager(resolved.root);

  database.open(Date.now(), {
    // Snapshot before an upgrade touches an existing database.
    backupBeforeUpgrade: (db) => {
      createBackup(db, database.backupsDir, Date.now(), 'pre-migration');
    },
  });

  console.log(`[kotoba] data root (${resolved.source}): ${resolved.root}`);
  return { database, resolved };
}

function bootstrap(): void {
  app.on('second-instance', () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });

    let opened: { database: DatabaseManager; resolved: ResolvedDataRoot };
    try {
      opened = openProfileDatabase();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error('[kotoba] could not open the profile database', cause);
      dialog.showErrorBox('Kotoba could not open its data', message);
      app.quit();
      return;
    }

    manager = opened.database;

    timer = new TimerService(() => opened.database.get());
    // A session still marked running at boot was interrupted by a crash.
    timer.recover();

    powerMonitor.on('suspend', () => {
      try {
        if (timer?.status().status === 'running') timer.pause();
      } catch (cause) {
        console.error('[kotoba] could not pause the timer on suspend', cause);
      }
    });

    app.on('before-quit', () => {
      try {
        if (timer?.status().active === true) timer.stop();
      } catch (cause) {
        console.error('[kotoba] could not stop the timer on quit', cause);
      }
    });

    registerIpcHandlers({
      isDev,
      allowedOrigins,
      db: opened.database,
      dataRoot: opened.resolved,
      now: () => Date.now(),
      timer,
    });

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

  app.on('will-quit', () => {
    try {
      timer?.dispose();
    } catch (cause) {
      console.error('[kotoba] could not dispose the timer', cause);
    }
    timer = null;

    try {
      manager?.close();
    } catch (cause) {
      console.error('[kotoba] could not close the profile database cleanly', cause);
    }
    manager = null;
  });
}

// A second instance would race the first one on the same SQLite file. Installer
// events must not take the lock, because the app is about to quit anyway.
const hasLock = started ? true : app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  bootstrap();
}
