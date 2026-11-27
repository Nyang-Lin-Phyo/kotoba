import type { KotobaApi } from '../shared/contracts';

declare global {
  interface Window {
    readonly kotoba: KotobaApi;
  }
}
