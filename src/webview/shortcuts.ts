/** True for Cmd+S / Ctrl+S (with or without Shift), the shortcuts that save the document. */
export function isSaveShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's';
}
