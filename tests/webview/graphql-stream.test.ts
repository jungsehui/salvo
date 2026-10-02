import { describe, it, expect } from 'vitest';
import { graphqlLanguage } from '../../src/webview/graphql-stream';

const tokens = (text: string): string[] => {
  const out: string[] = [];
  graphqlLanguage.parser.parse(text).iterate({
    enter: (n) => {
      if (n.from !== n.to && n.type.id !== 0) out.push(`${n.name}:${text.slice(n.from, n.to)}`);
    },
  });
  return out;
};

describe('graphql tokenizer', () => {
  it('classifies the token kinds the highlight style colors', () => {
    const t = tokens('query Q($v: ID!) { user(id: $v) @include(if: true) { name } } # c\n"s" 12');
    for (const expected of [
      'keyword:query', 'typeName:Q', 'variableName:$v', 'typeName:ID', 'propertyName:user',
      'meta:@include', 'keyword:true', 'propertyName:name', 'comment:# c', 'string:"s"', 'number:12',
    ]) {
      expect(t, expected).toContain(expected);
    }
  });

  it('terminates on unterminated strings and stray characters', () => {
    expect(tokens('"open ~ query').length).toBeGreaterThan(0);
  });
});
