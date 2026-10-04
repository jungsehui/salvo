import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Bridge } from './bridge';
import './styles.css';

const vscode = acquireVsCodeApi();
const bridge = new Bridge((m) => vscode.postMessage(m));
// The host stamps the CSP nonce on our script tag; CodeMirror needs it for its injected styles.
const nonce = (document.currentScript as HTMLScriptElement | null)?.dataset['nonce'] ?? '';
const root = document.getElementById('root');
if (root) createRoot(root).render(<App bridge={bridge} nonce={nonce} />);

// Hiding the panel does not blur the focused field; blur it so the normal commit runs. (The save shortcut is handled by each field without blurring.)
const flushDrafts = (): void => {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushDrafts();
});
window.addEventListener('pagehide', flushDrafts);
