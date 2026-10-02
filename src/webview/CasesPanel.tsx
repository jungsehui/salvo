import type { RunResult } from '../core/types';
import type { Bridge } from './bridge';
import type { GoodView } from './state';
import { ScalarField } from './ScalarField';

export function CasesPanel({
  model,
  bridge,
  selected,
  onSelect,
  results,
  running,
  readOnly,
}: {
  model: GoodView;
  bridge: Bridge;
  selected: number;
  onSelect: (index: number) => void;
  results: RunResult[] | undefined;
  running: boolean;
  readOnly: boolean;
}) {
  const cases = model.file.cases ?? [];
  const kase = cases[selected];
  const outcomeOf = (i: number) => results?.find((r) => r.caseIndex === i)?.outcome ?? 'none';
  return (
    <section className="panel cases">
      <h2>Cases</h2>
      <ul className="case-list">
        {cases.map((c, i) => (
          <li key={i} className={i === selected ? 'selected' : ''}>
            <button className="case-row" onClick={() => onSelect(i)}>
              <span className={`dot ${outcomeOf(i)}`} />
              {c.name}
            </button>
            <button className="icon" title="Run this case" disabled={running || readOnly} onClick={() => bridge.send({ type: 'run', selected: [i] })}>
              ▶
            </button>
            <button className="icon" title="Remove this case" disabled={readOnly || running} onClick={() => bridge.send({ type: 'removeCase', index: i })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-case"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = String(new FormData(form).get('name') ?? '').trim();
          if (name) {
            bridge.send({ type: 'appendCase', name });
            form.reset();
          }
        }}
      >
        <input name="name" placeholder="New case name" disabled={readOnly} />
        <button type="submit" disabled={readOnly}>
          Add case
        </button>
      </form>
      {kase && (
        <div key={selected} className="case-detail">
          <ScalarField
            label="Name"
            value={kase.name}
            disabled={readOnly}
            onCommit={(v) => bridge.send({ type: 'edit', path: ['cases', selected, 'name'], value: v })}
          />
          {Object.entries(kase.vars ?? {}).map(([k, v]) => (
            <ScalarField
              key={k}
              label={`vars.${k}`}
              value={v === null ? '' : String(v)}
              disabled={readOnly}
              onCommit={(nv) => bridge.send({ type: 'edit', path: ['cases', selected, 'vars', k], value: nv })}
            />
          ))}
          <details>
            <summary>expect</summary>
            <pre>{JSON.stringify(kase.expect ?? {}, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
