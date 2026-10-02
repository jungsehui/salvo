interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

// esbuild bundles the stylesheet imported from main.tsx; TypeScript only needs to accept the import.
declare module '*.css';
