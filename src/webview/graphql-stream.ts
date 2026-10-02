import { StreamLanguage, type StreamParser } from '@codemirror/language';

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
