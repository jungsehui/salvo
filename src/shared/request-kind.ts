import type { GraphqlRequest, HttpRequest } from '../core/generated/salvo-file';

/** The methods an HTTP request may use (schema `httpRequest.method`). */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Untrusted input (a webview message) naming a method. */
export function isHttpMethod(x: unknown): x is HttpMethod {
  return typeof x === 'string' && (HTTP_METHODS as readonly string[]).includes(x);
}

/** A request with an `operation` is GraphQL; anything else is a plain HTTP request (spec section 1). */
export function isGraphqlRequest(request: GraphqlRequest | HttpRequest): request is GraphqlRequest {
  return typeof request.operation === 'string';
}
