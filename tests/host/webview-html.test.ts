import { describe, it, expect } from 'vitest';
import { buildWebviewHtml } from '../../src/host/webview-html';

describe('buildWebviewHtml', () => {
  const html = buildWebviewHtml({
    scriptUri: 'https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.js',
    styleUri: 'https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.css',
    cspSource: 'https://*.vscode-cdn.net',
    nonce: 'N0nce+/=',
  });

  it('locks the CSP down to the nonce and the webview origin', () => {
    expect(html).toContain(
      `content="default-src 'none'; img-src https://*.vscode-cdn.net; style-src https://*.vscode-cdn.net 'nonce-N0nce+/='; script-src 'nonce-N0nce+/='; font-src https://*.vscode-cdn.net"`
    );
    expect(html).not.toContain('unsafe-inline');
    expect(html).not.toContain('unsafe-eval');
  });

  it('loads the bundle with the nonce and exposes it to the page', () => {
    expect(html).toContain('<script nonce="N0nce+/=" data-nonce="N0nce+/=" src="https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.css">');
    expect(html).toContain('<div id="root"></div>');
  });

  it('escapes attribute characters in URIs', () => {
    expect(buildWebviewHtml({ scriptUri: 'a"b<c', styleUri: 's', cspSource: 'c', nonce: 'n' })).toContain('src="a&quot;b&lt;c"');
  });
});
