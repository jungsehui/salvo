import type { GraphQLSchema } from 'graphql';
import { parseSalvoFile } from '../core/format/parse-salvo-file';
import { locateOperation } from '../core/lang/operation-source';
import {
  getCompletionsAt,
  getHoverAt,
  getOperationDiagnostics,
  getCompletionsInText,
  getDiagnosticsInText,
  getHoverInText,
  type CompletionItem,
} from '../core/lang/graphql-language';
import type { ParseIssue } from '../core/types';
import type { LangCompletion, LangDiagnostic, TextPosition } from '../shared/protocol';

export type { CompletionItem };

export function collectDiagnostics(text: string, schema: GraphQLSchema | undefined): ParseIssue[] {
  const parsed = parseSalvoFile(text);
  if (!parsed.ok) return parsed.issues;
  const issues = [...parsed.issues];
  if (schema) {
    const located = locateOperation(text);
    if (located.ok) issues.push(...getOperationDiagnostics(schema, located.source));
  }
  return issues;
}

export function completionsInFile(
  text: string,
  schema: GraphQLSchema | undefined,
  pos: { line: number; col: number }
): CompletionItem[] {
  if (!schema) return [];
  const located = locateOperation(text);
  if (!located.ok) return [];
  return getCompletionsAt(schema, located.source, pos);
}

export function hoverInFile(
  text: string,
  schema: GraphQLSchema | undefined,
  pos: { line: number; col: number }
): string | undefined {
  if (!schema) return undefined;
  const located = locateOperation(text);
  if (!located.ok) return undefined;
  return getHoverAt(schema, located.source, pos);
}

/** Language ops in operation-text coordinates, for the visual editor. All three stay quiet without a schema. */
export function completionsInOperation(schema: GraphQLSchema | undefined, text: string, pos: TextPosition): LangCompletion[] {
  if (!schema) return [];
  return getCompletionsInText(schema, text, pos).map((c) => ({
    label: c.label,
    ...(c.detail !== undefined ? { detail: c.detail } : {}),
    ...(typeof c.documentation === 'string' ? { documentation: c.documentation } : {}),
  }));
}

export function diagnosticsInOperation(schema: GraphQLSchema | undefined, text: string): LangDiagnostic[] {
  return schema ? getDiagnosticsInText(schema, text) : [];
}

export function hoverInOperation(schema: GraphQLSchema | undefined, text: string, pos: TextPosition): string | undefined {
  return schema ? getHoverInText(schema, text, pos) : undefined;
}
