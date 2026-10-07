import type { HttpRequest } from '../core/generated/salvo-file';
import type { FieldPath } from '../shared/protocol';
import { HTTP_METHODS, type HttpMethod } from '../shared/request-kind';
import type { Bridge } from './bridge';
import { formatJsonBody, normalizeJsonText } from './json-text';
import { ScalarField } from './ScalarField';

type Scalar = string | number | boolean | null;
const show = (value: Scalar): string => (value === null ? '' : String(value));

/** One field per existing entry; adding or removing entries happens in the text editor (spec section 4). */
function EntryFields({
  title,
  path,
  entries,
  bridge,
  readOnly,
}: {
  title: string;
  path: FieldPath;
  entries: [string, Scalar][];
  bridge: Bridge;
  readOnly: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="field-group">
      <h3>{title}</h3>
      {entries.map(([name, value]) => (
        <ScalarField
          key={name}
          label={name}
          value={show(value)}
          disabled={readOnly}
          onCommit={(v) => bridge.send({ type: 'edit', path: [...path, name], value: v })}
        />
      ))}
    </div>
  );
}

/** The request panel for a plain HTTP request: method, URL, query, headers, Basic auth, and body. */
export function HttpRequestPanel({ request, bridge, readOnly }: { request: HttpRequest; bridge: Bridge; readOnly: boolean }) {
  const body = request.body;
  const basic = request.auth?.basic;
  return (
    <section className="panel request">
      <h2>Request</h2>
      <label className="field">
        <span className="field-label">Method</span>
        <select
          value={request.method ?? 'GET'}
          disabled={readOnly}
          onChange={(e) => bridge.send({ type: 'setMethod', method: e.target.value as HttpMethod })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <ScalarField
        label="URL"
        value={request.url}
        disabled={readOnly}
        onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'url'], value: v })}
      />
      <EntryFields title="Query" path={['request', 'query']} entries={Object.entries(request.query ?? {})} bridge={bridge} readOnly={readOnly} />
      <EntryFields title="Headers" path={['request', 'headers']} entries={Object.entries(request.headers ?? {})} bridge={bridge} readOnly={readOnly} />
      {basic && (
        <div className="field-group">
          <h3>Basic auth</h3>
          <ScalarField
            label="username"
            value={basic.username}
            disabled={readOnly}
            onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'auth', 'basic', 'username'], value: v })}
          />
          {basic.password !== undefined && (
            <ScalarField
              label="password"
              value={basic.password}
              disabled={readOnly}
              onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'auth', 'basic', 'password'], value: v })}
            />
          )}
        </div>
      )}
      {body !== undefined && Object.hasOwn(body, 'json') && (
        <div className="field-group">
          <h3>Body (JSON)</h3>
          <ScalarField
            label="json"
            multiline
            value={formatJsonBody(body.json)}
            normalize={normalizeJsonText}
            disabled={readOnly}
            onCommit={(t) => bridge.send({ type: 'editJsonBody', text: t })}
          />
        </div>
      )}
      {body?.text !== undefined && (
        <div className="field-group">
          <h3>Body (text)</h3>
          <ScalarField
            label="text"
            multiline
            value={body.text}
            disabled={readOnly}
            onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'body', 'text'], value: v })}
          />
        </div>
      )}
      {body?.form !== undefined && (
        <EntryFields title="Body (form)" path={['request', 'body', 'form']} entries={Object.entries(body.form)} bridge={bridge} readOnly={readOnly} />
      )}
    </section>
  );
}
