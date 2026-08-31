import { build } from 'esbuild';

await build({
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
