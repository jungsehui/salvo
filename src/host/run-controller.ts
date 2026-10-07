import { parseSalvoFile } from '../core/format/parse-salvo-file';
import { runCases } from '../core/runner/run-cases';
import { redactResults } from '../core/runner/redact';
import type { SalvoManifest } from '../core/generated/salvo-manifest';
import type { ParseIssue, RunResult, SecretResolver, Transport } from '../core/types';

export async function runSalvoFile(args: {
  fileText: string;
  manifest: SalvoManifest | undefined;
  envName: string;
  selected?: number[] | 'all';
  deps: { secrets: SecretResolver; send: Transport };
}): Promise<{ ok: false; issues: ParseIssue[] } | { ok: true; results: RunResult[]; report: string }> {
  const parsed = parseSalvoFile(args.fileText);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  // Record every resolved secret and every value derived from one (Basic credentials, URL-encoded copies) so nothing a transport error or a server echo carries can leak into the report or a webview.
  const seen = new Set<string>();
  const secrets: SecretResolver = async (name) => {
    const value = await args.deps.secrets(name);
    if (value !== undefined) {
      seen.add(value);
      // Query entries and form bodies carry secrets URL-encoded; the encoding is per code point, so the encoded secret is still a substring of any larger encoded value.
      seen.add(new URLSearchParams([['', value]]).toString().slice(1));
    }
    return value;
  };
  const raw = await runCases({
    file: parsed.file,
    envName: args.envName,
    manifest: args.manifest,
    selected: args.selected ?? 'all',
    deps: { secrets, send: args.deps.send, sensitive: (value) => seen.add(value) },
  });
  const results = redactResults(raw, [...seen]);
  return { ok: true, results, report: formatRunReport(results, args.envName) };
}

export function formatRunReport(results: RunResult[], envName: string): string {
  const lines: string[] = [`Salvo run · environment "${envName}" · ${results.length} cases`];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of results) {
    if (r.outcome === 'passed') {
      passed += 1;
      lines.push(`  PASS  ${r.caseName} (${r.response?.status ?? '?'}, ${r.response?.durationMs ?? '?'}ms)`);
    } else if (r.outcome === 'failed') {
      failed += 1;
      const first = r.assertions.find((a) => !a.pass);
      lines.push(`  FAIL  ${r.caseName} — ${first ? `${first.target}: expected ${first.expected}, actual ${first.actual}` : 'assertion failed'}`);
    } else if (r.outcome === 'skipped') {
      skipped += 1;
      lines.push(`  SKIP  ${r.caseName} — ${r.error ?? 'skipped'}`);
    } else {
      errors += 1;
      lines.push(`  ERROR ${r.caseName} — ${r.error ?? 'unknown error'}`);
    }
  }
  lines.push(`${passed} passed, ${failed} failed, ${skipped} skipped, ${errors} error${errors === 1 ? '' : 's'}`);
  return lines.join('\n');
}
