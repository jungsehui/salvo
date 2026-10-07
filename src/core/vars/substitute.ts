import type { Primitive, SecretResolver } from '../types';

const PLACEHOLDER = /\{\{\s*(secret:)?([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;
const SINGLE = /^\{\{\s*(secret:)?([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}$/;

/**
 * Resolves {{var}} and {{secret:NAME}} placeholders against one case's scope
 * (environment < file < case) and collects what could not be resolved.
 */
export class Substituter {
  readonly missingVars = new Set<string>();
  readonly missingSecrets = new Set<string>();
  readonly cyclicVars = new Set<string>();

  constructor(
    private readonly scope: Record<string, Primitive>,
    private readonly secrets: SecretResolver
  ) {}

  /** Every placeholder replaced as text; an undefined or null value becomes ''. */
  text(input: string): Promise<string> {
    return this.sub(input, new Set());
  }

  /**
   * A string that is exactly one placeholder keeps the variable's type
   * (string, number, boolean, null); secrets are always strings. Any other
   * string resolves as `text` (spec section 1, rule 1).
   */
  async typed(input: string): Promise<Primitive> {
    const m = SINGLE.exec(input);
    if (!m) return this.text(input);
    const [, isSecret, name] = m;
    if (isSecret) return this.secret(name!);
    const raw = this.scope[name!];
    if (raw === undefined) {
      this.missingVars.add(name!);
      return '';
    }
    // A string value may itself hold placeholders; `sub` resolves them and catches cycles.
    return typeof raw === 'string' ? this.sub(input, new Set()) : raw;
  }

  /**
   * Deep JSON substitution: strings resolve as `typed`; an object property
   * whose placeholder resolves to null is omitted; array elements keep null
   * (omitting would shift indexes); keys are never substituted.
   */
  async json(value: unknown): Promise<unknown> {
    if (typeof value === 'string') return this.typed(value);
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) out.push(await this.json(item));
      return out;
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        const resolved = await this.json(item);
        if (typeof item === 'string' && resolved === null) continue; // a placeholder that resolved to null
        out[key] = resolved;
      }
      return out;
    }
    return value;
  }

  /** What could not be resolved, as one English clause list; undefined when everything resolved. */
  problems(): string | undefined {
    const parts: string[] = [];
    if (this.missingSecrets.size) parts.push(`missing secrets: ${[...this.missingSecrets].join(', ')}`);
    if (this.missingVars.size) parts.push(`undefined variables: ${[...this.missingVars].join(', ')}`);
    if (this.cyclicVars.size) parts.push(`cyclic variable references: ${[...this.cyclicVars].join(', ')}`);
    return parts.length > 0 ? parts.join('; ') : undefined;
  }

  private async secret(name: string): Promise<string> {
    const value = await this.secrets(name);
    if (value === undefined) this.missingSecrets.add(name);
    return value ?? '';
  }

  private async sub(input: string, resolving: Set<string>): Promise<string> {
    let out = '';
    let last = 0;
    for (const m of input.matchAll(PLACEHOLDER)) {
      out += input.slice(last, m.index);
      const [, isSecret, name] = m;
      if (isSecret) {
        out += await this.secret(name!);
      } else {
        const raw = this.scope[name!];
        // A var's *value* may itself be a secret reference (one nesting level, e.g. token: "{{secret:T}}").
        if (raw === undefined) {
          this.missingVars.add(name!);
        } else if (resolving.has(name!)) {
          // A variable whose value leads back to itself would recurse forever.
          this.cyclicVars.add(name!);
        } else {
          // Reset lastIndex BEFORE recursing: matchAll seeds its clone from the
          // original regex's lastIndex, so a stale offset would skip the match.
          const hasPlaceholder = PLACEHOLDER.test(String(raw));
          PLACEHOLDER.lastIndex = 0;
          if (typeof raw === 'string' && hasPlaceholder) {
            resolving.add(name!);
            out += await this.sub(raw, resolving);
            resolving.delete(name!);
          } else {
            out += String(raw ?? '');
          }
        }
      }
      last = m.index! + m[0].length;
    }
    return out + input.slice(last);
  }
}
