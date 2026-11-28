import { describe, expect, it } from 'vitest';
import { cspFor, isTrustedSender, windowOptions } from '../../src/main/security.mts';

function directive(csp: string, name: string): string {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found === undefined ? '' : found.slice(name.length).trim();
}

describe('content security policy', () => {
  const prod = cspFor(false);

  it('locks the default source to self', () => {
    expect(directive(prod, 'default-src')).toBe("'self'");
  });

  it('never allows inline or eval scripts in a packaged build', () => {
    const scriptSrc = directive(prod, 'script-src');
    expect(scriptSrc).toBe("'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('does not allow websocket or remote connections in a packaged build', () => {
    const connectSrc = directive(prod, 'connect-src');
    expect(connectSrc).toBe("'self'");
    expect(connectSrc).not.toContain('ws:');
    expect(connectSrc).not.toContain('http:');
  });

  it('blocks plugins, base tag hijacking and framing', () => {
    expect(directive(prod, 'object-src')).toBe("'none'");
    expect(directive(prod, 'base-uri')).toBe("'none'");
    expect(directive(prod, 'frame-ancestors')).toBe("'none'");
  });

  it('permits local blob playback for optional recordings but no remote media', () => {
    expect(directive(prod, 'media-src')).toBe("'self' blob:");
    expect(directive(prod, 'media-src')).not.toContain('https:');
  });

  it('relaxes only the dev policy for Vite HMR', () => {
    const dev = cspFor(true);
    expect(directive(dev, 'connect-src')).toContain('ws://localhost');
    expect(directive(dev, 'script-src')).toContain('unsafe-inline');
    expect(directive(prod, 'connect-src')).not.toBe(directive(dev, 'connect-src'));
  });
});

describe('browser window security', () => {
  const options = windowOptions('/app/preload.cjs');

  it('isolates and sandboxes the renderer', () => {
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  it('uses the preload path it was given', () => {
    expect(options.webPreferences?.preload).toBe('/app/preload.cjs');
  });
});

describe('ipc sender validation', () => {
  const devOrigins = ['file://', 'http://localhost:5173'] as const;

  it('accepts the packaged file origin and the dev server origin', () => {
    expect(isTrustedSender('file:///app/index.html', devOrigins)).toBe(true);
    expect(isTrustedSender('http://localhost:5173/index.html', devOrigins)).toBe(true);
  });

  it('rejects remote pages and unknown ports', () => {
    expect(isTrustedSender('https://evil.example/', devOrigins)).toBe(false);
    expect(isTrustedSender('http://localhost:9999/', devOrigins)).toBe(false);
    expect(isTrustedSender('file:///app/index.html', ['http://localhost:5173'])).toBe(false);
  });

  it('rejects missing and malformed urls', () => {
    expect(isTrustedSender(undefined, devOrigins)).toBe(false);
    expect(isTrustedSender('not a url', devOrigins)).toBe(false);
  });
});
