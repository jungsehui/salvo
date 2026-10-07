import { useEffect, useRef, useState } from 'react';
import { consumeEcho } from './echo';
import { isSaveShortcut } from './shortcuts';

/**
 * Text input (or text area) that commits on blur, Enter (single line only), or
 * the save shortcut, and follows external changes to `value`. `normalize`
 * rewrites the draft before it is sent, so the host's echo of a normalized
 * value still matches the pending commit.
 */
export function ScalarField({
  label,
  value,
  onCommit,
  disabled,
  multiline,
  normalize,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  normalize?: (draft: string) => string;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Commits still on their way back from the host; their echo must not reset the draft.
  const pending = useRef<string[]>([]);
  useEffect(() => {
    // Only a focused field can hold keystrokes typed after its own commit.
    if (document.activeElement === input.current && consumeEcho(pending.current, value)) return;
    pending.current = [];
    setDraft(value);
  }, [value]);
  const commit = (raw: string): void => {
    const next = normalize ? normalize(raw) : raw;
    // Compare with what the host will hold once in-flight commits land, not the stale prop:
    // reverting to the old value before the echo must still be sent.
    const baseline = pending.current.at(-1) ?? value;
    if (next === baseline) return;
    pending.current.push(next);
    onCommit(next);
  };
  // Read at event time by the window listener below.
  const latest = useRef({ draft, commit });
  latest.current = { draft, commit };
  useEffect(() => {
    // Save without blurring: the caret stays where the user is typing.
    const onKey = (e: KeyboardEvent): void => {
      if (isSaveShortcut(e) && document.activeElement === input.current) latest.current.commit(latest.current.draft);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const bind = (el: HTMLInputElement | HTMLTextAreaElement | null): void => {
    input.current = el;
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? (
        <textarea
          ref={bind}
          value={draft}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
        />
      ) : (
        <input
          ref={bind}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
            }
          }}
        />
      )}
    </label>
  );
}
