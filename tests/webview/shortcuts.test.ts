import { describe, it, expect } from 'vitest';
import { isSaveShortcut } from '../../src/webview/shortcuts';

describe('isSaveShortcut', () => {
  it('matches Cmd+S and Ctrl+S only', () => {
    expect(isSaveShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: false })).toBe(true);
    expect(isSaveShortcut({ key: 'S', metaKey: false, ctrlKey: true, altKey: false })).toBe(true);
    expect(isSaveShortcut({ key: 's', metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isSaveShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: true })).toBe(false);
    expect(isSaveShortcut({ key: 'a', metaKey: true, ctrlKey: false, altKey: false })).toBe(false);
  });
});
