import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cspFor } from './src/main/security.mts';

// Injects the Content-Security-Policy meta tag. The dev policy is relaxed for HMR,
// the production policy is not; both come from one place (src/main/security.ts).
function cspPlugin(isDev: boolean): Plugin {
  return {
    name: 'kotoba-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('%CSP%', cspFor(isDev)),
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [cspPlugin(command === 'serve'), react()],
}));
