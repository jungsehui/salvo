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
import type { ParseIssue } from '../types';
import type { OperationSource } from './operation-source';

export type { CompletionItem };

export function getOperationDiagnostics(schema: GraphQLSchema, op: OperationSource): ParseIssue[] {
  return getDiagnostics(op.text, schema).map((d) => {
    const { line, col } = op.toFilePosition({ line: d.range.start.line, character: d.range.start.character });
    const msg = typeof d.message === 'string' ? d.message : d.message.value;
    return {
      message: msg.split('\n')[0] ?? msg,
      line,
      col,
      severity: d.severity === 2 ? ('warning' as const) : ('error' as const),
    };
  });
}

export function getCompletionsAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): CompletionItem[] {
  const pos = op.fromFilePosition(filePos);
  if (!pos) return [];
  return getAutocompleteSuggestions(schema, op.text, new Position(pos.line, pos.character));
}

export function getHoverAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): string | undefined {
  const pos = op.fromFilePosition(filePos);
  if (!pos) return undefined;
  const contents = getHoverInformation(schema, op.text, new Position(pos.line, pos.character));
  return typeof contents === 'string' && contents.length > 0 ? contents : undefined;
}

export function getVariablesJsonSchemaFor(
  schema: GraphQLSchema,
  operationText: string
): Record<string, unknown> | undefined {
  const facts = getOperationFacts(schema, operationText);
  if (!facts?.variableToType) return undefined;
  return getVariablesJSONSchema(facts.variableToType) as Record<string, unknown>;
}
