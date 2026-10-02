import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Bridge } from './bridge';
import { isSaveShortcut } from './shortcuts';
import './styles.css';

const vscode = acquireVsCodeApi();
const bridge = new Bridge((m) => vscode.postMessage(m));
// The host stamps the CSP nonce on our script tag; CodeMirror needs it for its injected styles.
const nonce = (document.currentScript as HTMLScriptElement | null)?.dataset['nonce'] ?? '';
const root = document.getElementById('root');
if (root) createRoot(root).render(<App bridge={bridge} nonce={nonce} />);

// Fields commit on blur. A save shortcut or hiding the panel does not blur
// them, so blur the focused element first and let the normal commit run.
const flushDrafts = (): void => {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
};
window.addEventListener('keydown', (e) => {
  if (isSaveShortcut(e)) flushDrafts();
}, true);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushDrafts();
});
window.addEventListener('pagehide', flushDrafts);
