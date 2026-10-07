import { describe, it, expect } from 'vitest';
import { Substituter } from '../../src/core/vars/substitute';

const secrets = async (n: string) => (n === 'PW' ? 'pw-123' : undefined);
const make = (scope: Record<string, string | number | boolean | null>) => new Substituter(scope, secrets);

describe('Substituter.text', () => {
  it('replaces placeholders as text, with null and missing values as empty', async () => {
    const s = make({ a: 'x', n: 5, z: null });
    expect(await s.text('{{a}}-{{n}}-{{z}}-{{gone}}-{{secret:PW}}')).toBe('x-5---pw-123');
    expect(s.problems()).toBe('undefined variables: gone');
  });

  it('resolves one nesting level and reports cycles', async () => {
    const s = make({ token: '{{secret:PW}}', a: '{{b}}', b: '{{a}}' });
    expect(await s.text('Bearer {{token}}')).toBe('Bearer pw-123');
    await s.text('{{a}}');
    expect(s.problems()).toContain('cyclic variable references');
  });
});

describe('Substituter.typed', () => {
  it('keeps the type of a single placeholder', async () => {
    const s = make({ n: 30, t: true, z: null, str: 'hi' });
    expect(await s.typed('{{n}}')).toBe(30);
    expect(await s.typed('{{ t }}')).toBe(true);
    expect(await s.typed('{{z}}')).toBeNull();
    expect(await s.typed('{{str}}')).toBe('hi');
    expect(await s.typed('{{secret:PW}}')).toBe('pw-123');
  });

  it('treats anything else as text', async () => {
    const s = make({ n: 30, z: null });
    expect(await s.typed('n={{n}}')).toBe('n=30');
    expect(await s.typed(' {{n}}')).toBe(' 30');
    expect(await s.typed('{{z}}{{z}}')).toBe('');
    expect(await s.typed('plain')).toBe('plain');
  });

  it('reports a missing single placeholder as an undefined variable', async () => {
    const s = make({});
    expect(await s.typed('{{gone}}')).toBe('');
    expect(s.problems()).toBe('undefined variables: gone');
  });
});

describe('Substituter.json', () => {
  it('substitutes at any depth, omits object keys that resolve to null, and keeps array nulls', async () => {
    const s = make({ name: 'Ann', age: 30, none: null, tag: 'x' });
    const out = await s.json({
      name: '{{name}}',
      age: '{{age}}',
      gone: '{{none}}',
      kept: null,
      tags: ['{{tag}}', '{{none}}'],
      nested: { label: 'hi {{name}}' },
      '{{name}}': 1,
    });
    expect(out).toEqual({ name: 'Ann', age: 30, kept: null, tags: ['x', null], nested: { label: 'hi Ann' }, '{{name}}': 1 });
  });

  it('passes non-string scalars through', async () => {
    expect(await make({}).json([1, true, null])).toEqual([1, true, null]);
  });
});
