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
