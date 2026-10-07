import { describe, it, expect } from 'vitest';
import { Substituter } from '../../src/core/vars/substitute';

const make = () => new Substituter({}, async () => undefined);

describe('Substituter hardening', () => {
  it('reports Object.prototype names as undefined variables instead of resolving them', async () => {
    const s = make();
    expect(await s.typed('{{constructor}}')).toBe('');
    expect(await s.text('{{toString}}')).toBe('');
    expect(s.problems()).toBe('undefined variables: constructor, toString');
  });

  it('keeps a "__proto__" key in a JSON body as an own property', async () => {
    const out = await make().json(JSON.parse('{"__proto__":"x","k":"y"}'));
    expect(Object.keys(out as object)).toEqual(['__proto__', 'k']);
    expect(JSON.stringify(out)).toBe('{"__proto__":"x","k":"y"}');
  });
});
