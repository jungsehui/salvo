import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/vscode/**/*.test.js',
  workspaceFolder: 'examples/quickstart',
  mocha: { timeout: 20000, failZero: true },
  // This worktree's path is long enough that the default
  // .vscode-test/user-data IPC socket path exceeds macOS's ~104-byte
  // sockaddr_un limit (`listen EINVAL`). Force a short user-data-dir so the
  // socket path stays under the limit; unrelated to what is under test.
  launchArgs: ['--user-data-dir=/tmp/salvo-vscode-test-user-data'],
});
