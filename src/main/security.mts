import type { BrowserWindowConstructorOptions } from 'electron';

const BASE_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
];

/**
 * Single source of truth for the renderer CSP.
 * Development relaxations (Vite HMR) must never reach a packaged build.
 */
export function cspFor(isDev: boolean): string {
  const directives = [...BASE_DIRECTIVES];
  if (isDev) {
    directives.push("script-src 'self' 'unsafe-inline'");
    directives.push("connect-src 'self' ws://localhost:* http://localhost:*");
  } else {
    directives.push("script-src 'self'");
    directives.push("connect-src 'self'");
  }
  return directives.join('; ');
}

export function windowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Kotoba',
    backgroundColor: '#0e1013',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  };
}

/**
 * The packaged renderer loads from `file://`; the dev renderer loads from the Vite
 * server. Anything else is rejected, so an unexpected page cannot talk to IPC.
 */
export function isTrustedSender(url: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:') return allowedOrigins.includes('file://');
  return allowedOrigins.includes(parsed.origin);
}
