import { useEffect, useState } from 'react';
import type { Bridge } from './bridge';

export interface OperationEditorProps {
  text: string;
  bridge: Bridge;
  nonce: string;
  schemaReady: boolean;
  onCommit: (text: string) => void;
}

/** Plain textarea; commits on blur when the text changed. Task 5 replaces this with CodeMirror behind the same props. */
export function OperationEditor({ text, onCommit }: OperationEditorProps) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  return (
    <textarea
      className="operation"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== text) onCommit(draft);
      }}
    />
  );
}
