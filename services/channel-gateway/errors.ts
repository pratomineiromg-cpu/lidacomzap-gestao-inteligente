import type { GatewayErrorCode, GatewayRetryability } from './contracts';

const RETRYABLE_CODES: ReadonlySet<GatewayErrorCode> = new Set([
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'UNKNOWN_PROVIDER_ERROR'
]);

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly retryability: GatewayRetryability;

  constructor(code: GatewayErrorCode) {
    super(code);
    this.name = 'GatewayError';
    this.code = code;
    this.retryability = RETRYABLE_CODES.has(code) ? 'RETRYABLE' : 'NON_RETRYABLE';
  }
}

export function classifyGatewayError(code: GatewayErrorCode): GatewayRetryability {
  return RETRYABLE_CODES.has(code) ? 'RETRYABLE' : 'NON_RETRYABLE';
}
