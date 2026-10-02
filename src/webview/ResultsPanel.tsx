import type { RunResult } from '../core/types';

export function ResultsPanel({ results, selected }: { results: RunResult[] | undefined; selected: number }) {
  const r = results?.find((x) => x.caseIndex === selected);
  if (!results) {
    return (
      <section className="panel results">
        <h2>Response</h2>
        <p className="muted">Run the cases to see responses here.</p>
      </section>
    );
  }
  if (!r) {
    return (
      <section className="panel results">
        <h2>Response</h2>
        <p className="muted">This case was not part of the last run.</p>
      </section>
    );
  }
  return (
    <section className="panel results">
      <h2>
        Response <span className={`outcome ${r.outcome}`}>{r.outcome.toUpperCase()}</span>
      </h2>
      {r.error && <p className="error">{r.error}</p>}
      {r.response && (
        <p className="muted">
          HTTP {r.response.status} in {r.response.durationMs} ms
        </p>
      )}
      {r.assertions.length > 0 && (
        <table className="assertions">
          <thead>
            <tr>
              <th></th>
              <th>Target</th>
              <th>Expected</th>
              <th>Actual</th>
            </tr>
          </thead>
          <tbody>
            {r.assertions.map((a, i) => (
              <tr key={i} className={a.pass ? 'pass' : 'fail'}>
                <td>{a.pass ? '✓' : '✗'}</td>
                <td>{a.target}</td>
                <td>{a.expected}</td>
                <td>{a.actual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.response && <pre className="body">{r.response.json !== undefined ? JSON.stringify(r.response.json, null, 2) : r.response.bodyText}</pre>}
    </section>
  );
}
