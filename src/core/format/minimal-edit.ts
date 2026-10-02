/** A single replacement in the OLD text; offsets are UTF-16 code units, matching VS Code's `positionAt`. */
export interface TextReplace {
  start: number;
  end: number;
  text: string;
}

const isHigh = (s: string, i: number): boolean => {
  const c = s.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff;
};

/**
 * Smallest single replacement turning `oldText` into `newText` (common prefix
 * and suffix stripped), or undefined when they are equal. Boundaries snap
 * outward off a surrogate pair so an edit never cuts an emoji in half.
 */
export function minimalTextEdit(oldText: string, newText: string): TextReplace | undefined {
  if (oldText === newText) return undefined;
  let start = 0;
  const max = Math.min(oldText.length, newText.length);
  while (start < max && oldText.charCodeAt(start) === newText.charCodeAt(start)) start += 1;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  if (start > 0 && isHigh(oldText, start - 1)) start -= 1;
  // Both ends move together: the suffix after them is identical in both
  // strings, so advancing both by one keeps the replacement exact.
  if (oldEnd < oldText.length && (isHigh(oldText, oldEnd - 1) || isHigh(newText, newEnd - 1))) {
    oldEnd += 1;
    newEnd += 1;
  }
  return { start, end: oldEnd, text: newText.slice(start, newEnd) };
}
