/**
 * Contracts shared by main, preload and renderer.
 * Keep this file free of Node and Electron imports: the renderer bundles it.
 */

export const CHANNELS = {
  appInfo: 'app:info',
} as const;

export type AppInfo = {
  readonly name: string;
  readonly version: string;
  readonly electron: string;
  readonly chrome: string;
  readonly node: string;
  readonly platform: string;
  readonly isDev: boolean;
};

/** The only surface exposed to the renderer through the preload bridge. */
export type KotobaApi = {
  appInfo(): Promise<AppInfo>;
};
