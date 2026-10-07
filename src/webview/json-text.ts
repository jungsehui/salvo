/** The JSON body as the visual editor shows it: two-space pretty printing. */
export function formatJsonBody(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

/**
 * Re-prints valid JSON in the shown form, so the host's echo of the committed
 * body matches the pending commit; invalid text passes through for the host to
 * refuse with a notice.
 */
export function normalizeJsonText(text: string): string {
  try {
    return formatJsonBody(JSON.parse(text));
  } catch {
    return text;
  }
}
