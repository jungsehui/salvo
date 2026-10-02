import { build } from 'esbuild';

const host = build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  // platform 'node' resolves packages main-first, which keeps a single
  // `graphql` module realm in the bundle (the dual-realm hazard plan 2 hit
  // under vitest cannot recur here as long as this stays 'node').
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});

const webview = build({
  entryPoints: ['src/webview/main.tsx'],
  outfile: 'dist/webview.js',
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  jsx: 'automatic',
  // React's CJS entry switches on this; folding it selects the production build.
  define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: true,
  logLevel: 'info',
});

await Promise.all([host, webview]);
