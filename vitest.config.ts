import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

// graphql has no "exports" map, so both Node's native CJS `require('graphql')`
// (used internally by graphql-language-service's CJS bundle) and native ESM
// `import.meta.resolve('graphql')` resolve via "main" to index.js -- the
// "module" field is a bundler-only convention Node itself never reads. Vite's
// own resolver, however, prefers "module" and picks index.mjs for every
// `import ... from 'graphql'` in our source/tests. Two different files means
// two GraphQLSchema classes and failing instanceof checks across them
// (classic dual-package hazard). Force Vite's resolver onto the same CJS
// entry Node (and graphql-language-service's native require) already uses,
// so the test environment matches real Node resolution instead of diverging
// from it.
const graphqlCjsEntry = createRequire(import.meta.url).resolve('graphql');

export default defineConfig({
  resolve: {
    alias: { graphql: graphqlCjsEntry },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
