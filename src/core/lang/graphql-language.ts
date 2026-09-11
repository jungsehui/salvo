import { type GraphQLSchema } from 'graphql';
import {
  getAutocompleteSuggestions,
  getDiagnostics,
  getHoverInformation,
  getOperationFacts,
  getVariablesJSONSchema,
  Position,
  type CompletionItem,
} from 'graphql-language-service';
import type { LangDiagnostic, TextPosition } from '../../shared/protocol';
import type { ParseIssue } from '../types';
import type { OperationSource } from './operation-source';

export type { CompletionItem };

/** Diagnostics in operation-text coordinates; the file-positioned variant maps these through the OperationSource. */
export function getDiagnosticsInText(schema: GraphQLSchema, text: string): LangDiagnostic[] {
  return getDiagnostics(text, schema).map((d) => {
    const msg = typeof d.message === 'string' ? d.message : d.message.value;
    return {
      message: msg.split('\n')[0] ?? msg,
      start: { line: d.range.start.line, character: d.range.start.character },
      end: { line: d.range.end.line, character: d.range.end.character },
      severity: d.severity === 2 ? ('warning' as const) : ('error' as const),
    };
  });
}

export function getCompletionsInText(schema: GraphQLSchema, text: string, pos: TextPosition): CompletionItem[] {
  return getAutocompleteSuggestions(schema, text, new Position(pos.line, pos.character));
}

export function getHoverInText(schema: GraphQLSchema, text: string, pos: TextPosition): string | undefined {
  const contents = getHoverInformation(schema, text, new Position(pos.line, pos.character));
  return typeof contents === 'string' && contents.length > 0 ? contents : undefined;
}

export function getOperationDiagnostics(schema: GraphQLSchema, op: OperationSource): ParseIssue[] {
  return getDiagnosticsInText(schema, op.text).map((d) => {
    const { line, col } = op.toFilePosition(d.start);
    return { message: d.message, line, col, severity: d.severity };
  });
}

export function getCompletionsAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): CompletionItem[] {
  const pos = op.fromFilePosition(filePos);
  return pos ? getCompletionsInText(schema, op.text, pos) : [];
}

export function getHoverAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): string | undefined {
  const pos = op.fromFilePosition(filePos);
  return pos ? getHoverInText(schema, op.text, pos) : undefined;
}

export function getVariablesJsonSchemaFor(
  schema: GraphQLSchema,
  operationText: string
): Record<string, unknown> | undefined {
  const facts = getOperationFacts(schema, operationText);
  if (!facts?.variableToType) return undefined;
  return getVariablesJSONSchema(facts.variableToType) as Record<string, unknown>;
}
