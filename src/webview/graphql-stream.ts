import { HighlightStyle, StreamLanguage, type StreamParser } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const KEYWORDS = new Set(['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null']);

/**
 * Token-level GraphQL highlighting. Deliberately not a parser: the host owns
 * validation, and a grammar would drag `graphql` into the webview bundle.
 */
const parser: StreamParser<object> = {
  name: 'graphql',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('"""')) {
      // Block strings rarely appear in operations; paint the rest of the line.
      stream.skipToEnd();
      return 'string';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/^\$[_A-Za-z][_0-9A-Za-z]*/)) return 'variableName';
    if (stream.match(/^@[_A-Za-z][_0-9A-Za-z]*/)) return 'meta';
    if (stream.match(/^[_A-Za-z][_0-9A-Za-z]*/)) {
      const word = stream.current();
      return KEYWORDS.has(word) ? 'keyword' : /^[A-Z]/.test(word) ? 'typeName' : 'propertyName';
    }
    if (stream.match(/^[{}()[\]:!=,|&.]/)) return 'punctuation';
    stream.next();
    return null;
  },
};

export const graphqlLanguage = StreamLanguage.define(parser);

const fg = (v: string): string => `var(${v}, var(--vscode-editor-foreground))`;

/** Token colors from the active VS Code theme, so dark, light, and high-contrast themes all stay legible. */
export const graphqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: fg('--vscode-symbolIcon-keywordForeground') },
  { tag: tags.typeName, color: fg('--vscode-symbolIcon-classForeground') },
  { tag: tags.propertyName, color: fg('--vscode-symbolIcon-fieldForeground') },
  { tag: tags.variableName, color: fg('--vscode-symbolIcon-variableForeground') },
  { tag: tags.string, color: fg('--vscode-debugTokenExpression-string') },
  { tag: tags.number, color: fg('--vscode-debugTokenExpression-number') },
  { tag: tags.meta, color: fg('--vscode-symbolIcon-constantForeground') },
  { tag: tags.comment, color: fg('--vscode-descriptionForeground'), fontStyle: 'italic' },
]);
