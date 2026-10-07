import { useEffect, useReducer } from 'react';
import type { HostToWebview } from '../shared/protocol';
import { isGraphqlRequest } from '../shared/request-kind';
import type { Bridge } from './bridge';
import { dismissNotice, initialState, modelOf, reduce, selectCase, type WebviewState } from './state';
import { RequestPanel } from './RequestPanel';
import { CasesPanel } from './CasesPanel';
import { ResultsPanel } from './ResultsPanel';

type Action = { kind: 'host'; msg: HostToWebview } | { kind: 'select'; index: number } | { kind: 'dismiss' };

const reducer = (s: WebviewState, a: Action): WebviewState =>
  a.kind === 'host' ? reduce(s, a.msg) : a.kind === 'select' ? selectCase(s, a.index) : dismissNotice(s);

export function App({ bridge, nonce }: { bridge: Bridge; nonce: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const onMessage = (e: MessageEvent<HostToWebview>) => {
      if (!bridge.receive(e.data)) dispatch({ kind: 'host', msg: e.data });
    };
    window.addEventListener('message', onMessage);
    // Pull the full state only once the listener exists, so the reply cannot
    // arrive before anyone hears it. Runs on first load and on every re-show,
    // because a hidden webview is destroyed and rebuilt (decision 8).
    bridge.send({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [bridge]);

  const snap = state.snapshot;
  const model = modelOf(state);
  // While the banner is up the GUI shows the last good model, so edits would be path-based against different live text.
  const readOnly = state.banner !== undefined;
  // HTTP files have no GraphQL schema, so the badge would only confuse.
  const graphql = model ? isGraphqlRequest(model.file.request) : true;
  if (!snap) return <div className="empty">Loading…</div>;

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Salvo</span>
        <label className="env">
          Environment
          <select
            value={snap.envName ?? ''}
            disabled={snap.envNames.length === 0}
            onChange={(e) => bridge.send({ type: 'selectEnvironment', name: e.target.value })}
          >
            {snap.envNames.length === 0 ? <option value="">none</option> : snap.envNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {graphql && <span className={`schema schema-${snap.schema}`}>schema: {snap.schema}</span>}
        <button className="primary" disabled={snap.running || !model || readOnly} onClick={() => bridge.send({ type: 'run', selected: 'all' })}>
          {snap.running ? 'Running…' : 'Run all cases'}
        </button>
      </header>
      {state.banner && <div className="banner error">{state.banner} The last valid version is shown read-only. Fix the file in the text editor to edit it here again.</div>}
      {state.notice && (
        <div className={`banner ${state.notice.level}`} onClick={() => dispatch({ kind: 'dismiss' })}>
          {state.notice.message}
        </div>
      )}
      {model ? (
        <main className="panels">
          <RequestPanel model={model} bridge={bridge} nonce={nonce} schemaReady={snap.schema === 'ready'} readOnly={readOnly} />
          <CasesPanel
            model={model}
            bridge={bridge}
            selected={state.selectedCase}
            onSelect={(i) => dispatch({ kind: 'select', index: i })}
            results={snap.results}
            running={snap.running}
            readOnly={readOnly}
          />
          <ResultsPanel results={snap.results} selected={state.selectedCase} />
        </main>
      ) : (
        <div className="empty">Open the file as text to fix the errors above.</div>
      )}
    </div>
  );
}
