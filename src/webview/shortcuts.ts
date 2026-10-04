/** True for Cmd+S / Ctrl+S (with or without Shift), the shortcuts that save the document. */
export function isSaveShortcut(e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  // `code` names the physical key, so a non-Latin input method (where `key` is e.g. 'ㄴ') still matches.
  return (e.metaKey || e.ctrlKey) && !e.altKey && (e.key.toLowerCase() === 's' || e.code === 'KeyS');
}
