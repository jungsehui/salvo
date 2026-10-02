export interface WebviewAssets {
  scriptUri: string;
  styleUri: string;
  cspSource: string;
  nonce: string;
}

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The editor's HTML shell. CSP allows exactly our bundle (by nonce), our
 * stylesheet (by origin), and CodeMirror's injected styles (by the same
 * nonce, handed to `EditorView.cspNonce` through `data-nonce`). Nothing
 * inline, nothing eval'd, nothing fetched.
 */
export function buildWebviewHtml(a: WebviewAssets): string {
  const csp = [
    "default-src 'none'",
    `img-src ${a.cspSource}`,
    `style-src ${a.cspSource} 'nonce-${a.nonce}'`,
    `script-src 'nonce-${a.nonce}'`,
    `font-src ${a.cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${escapeAttr(a.styleUri)}">
<title>Salvo</title>
</head>
<body>
<div id="root"></div>
<script nonce="${a.nonce}" data-nonce="${a.nonce}" src="${escapeAttr(a.scriptUri)}"></script>
</body>
</html>`;
}
