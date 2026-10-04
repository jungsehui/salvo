import { useEffect, useRef, useState } from 'react';
import { consumeEcho } from './echo';
import { isSaveShortcut } from './shortcuts';

/** Text input that commits on blur, Enter, or the save shortcut, and follows external changes to `value`. */
export function ScalarField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement | null>(null);
  // Commits still on their way back from the host; their echo must not reset the draft.
  const pending = useRef<string[]>([]);
  useEffect(() => {
    if (consumeEcho(pending.current, value)) return;
    setDraft(value);
  }, [value]);
  const commit = (next: string): void => {
    if (next === value) return;
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
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        ref={input}
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
    </label>
  );
}
