import type { Bridge } from './bridge';
import type { GoodView } from './state';
import { ScalarField } from './ScalarField';
import { OperationEditor } from './OperationEditor';
import { HttpRequestPanel } from './HttpRequestPanel';
import { isGraphqlRequest } from '../shared/request-kind';

export function RequestPanel({
  model,
  bridge,
  nonce,
  schemaReady,
  readOnly,
}: {
  model: GoodView;
  bridge: Bridge;
  nonce: string;
  schemaReady: boolean;
  readOnly: boolean;
}) {
  const req = model.file.request;
  if (!isGraphqlRequest(req)) return <HttpRequestPanel request={req} bridge={bridge} readOnly={readOnly} />;
  const headers = Object.entries(req.headers ?? {});
  return (
    <section className="panel request">
      <h2>Request</h2>
      <ScalarField
        label="URL"
        value={req.url}
        disabled={readOnly}
        onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'url'], value: v })}
      />
      {headers.length > 0 && (
        <div className="headers">
          <h3>Headers</h3>
          {headers.map(([name, value]) => (
            <ScalarField
              key={name}
              label={name}
              value={value}
              disabled={readOnly}
              onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'headers', name], value: v })}
            />
          ))}
        </div>
      )}
      <h3>
        Operation {schemaReady ? null : <span className="muted">(no schema: completions and checks are off)</span>}
      </h3>
      {readOnly ? (
        <pre className="operation-readonly">{req.operation}</pre>
      ) : (
        <OperationEditor
          text={req.operation}
          bridge={bridge}
          nonce={nonce}
          schemaReady={schemaReady}
          onCommit={(t) => bridge.send({ type: 'editOperation', text: t })}
        />
      )}
    </section>
  );
}
