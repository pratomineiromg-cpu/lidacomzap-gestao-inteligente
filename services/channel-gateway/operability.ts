import type { ChannelProvider, CommunicationChannel } from '../../src/domain/omnichannel';
import type { GatewayErrorCode, PreparedOutboundMessage } from './contracts';
import type { GatewayFailureCategory } from './errors';

export interface RateLimitObservation {
  category: 'RATE_LIMITED';
  /** Provider-supplied hint only; no provider quota is hardcoded. */
  retryAfterMs?: number;
  observedAt: Date;
}

export interface RateLimitPolicy {
  selectDelayMs(observation: RateLimitObservation, policyDelayMs: number): number;
}

export class ProviderHintRateLimitPolicy implements RateLimitPolicy {
  selectDelayMs(observation: RateLimitObservation, policyDelayMs: number): number {
    return Math.max(0, policyDelayMs, observation.retryAfterMs ?? 0);
  }
}

export type GatewayOperationalStage =
  | 'AUTHENTICATION'
  | 'DECODING'
  | 'IDEMPOTENCY'
  | 'IDENTITY_RESOLUTION'
  | 'CONVERSATION_RESOLUTION'
  | 'QUEUE'
  | 'TRANSPORT';

export interface GatewayMetricEvent {
  provider: ChannelProvider;
  channel: CommunicationChannel;
  stage: GatewayOperationalStage;
  outcome: 'SUCCESS' | 'FAILURE';
  reasonCode: GatewayErrorCode | 'EVENT_ACCEPTED' | 'OPERATION_COMPLETED';
  durationBucket: 'LT_10_MS' | 'LT_100_MS' | 'LT_1_S' | 'GTE_1_S';
  retryCount: number;
  duplicate: boolean;
  correlationId: string;
  timestamp: string;
}

export interface GatewayOperationalEvent extends Omit<GatewayMetricEvent, 'durationBucket'> {
  healthImpact: 'NONE' | 'DEGRADED' | 'UNHEALTHY';
}

export function createGatewayMetricEvent(
  input: Omit<GatewayMetricEvent, 'durationBucket'> & { durationMs: number }
): GatewayMetricEvent {
  return {
    provider: input.provider,
    channel: input.channel,
    stage: input.stage,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    durationBucket: durationBucket(input.durationMs),
    retryCount: input.retryCount,
    duplicate: input.duplicate,
    correlationId: input.correlationId,
    timestamp: input.timestamp
  };
}

export function durationBucket(durationMs: number): GatewayMetricEvent['durationBucket'] {
  if (durationMs < 10) return 'LT_10_MS';
  if (durationMs < 100) return 'LT_100_MS';
  if (durationMs < 1_000) return 'LT_1_S';
  return 'GTE_1_S';
}

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
export type ReadinessStatus = 'READY' | 'NOT_READY';

export interface GatewayHealth {
  status: HealthStatus;
  checkedAt: Date;
  reasonCodes: readonly string[];
}

export type ProviderReadinessReason =
  | 'OFFICIAL_PROTOCOL_NOT_VERIFIED'
  | 'WEBHOOK_AUTH_NOT_CONFIGURED'
  | 'DURABLE_IDEMPOTENCY_NOT_CONFIGURED'
  | 'TRANSPORT_NOT_CONFIGURED'
  | 'PERSISTENCE_NOT_CONFIGURED'
  | 'RUNTIME_NOT_CONFIGURED';

export interface ProviderReadinessInput {
  provider: ChannelProvider;
  officialProtocolVerified: boolean;
  webhookAuthConfigured: boolean;
  durableIdempotencyConfigured: boolean;
  transportConfigured: boolean;
  persistenceConfigured: boolean;
  runtimeConfigured: boolean;
}

export interface ProviderLiveReadiness {
  provider: ChannelProvider;
  status: ReadinessStatus;
  reasons: readonly ProviderReadinessReason[];
}

export function evaluateProviderLiveReadiness(
  input: ProviderReadinessInput
): ProviderLiveReadiness {
  const reasons: ProviderReadinessReason[] = [];
  // F1B-07 contains no verified official provider protocol. Input cannot override that phase gate.
  if (input.provider === 'WHATSAPP_META_OFFICIAL' || !input.officialProtocolVerified) {
    reasons.push('OFFICIAL_PROTOCOL_NOT_VERIFIED');
  }
  if (!input.webhookAuthConfigured) reasons.push('WEBHOOK_AUTH_NOT_CONFIGURED');
  if (!input.durableIdempotencyConfigured) reasons.push('DURABLE_IDEMPOTENCY_NOT_CONFIGURED');
  if (!input.transportConfigured) reasons.push('TRANSPORT_NOT_CONFIGURED');
  if (!input.persistenceConfigured) reasons.push('PERSISTENCE_NOT_CONFIGURED');
  if (!input.runtimeConfigured) reasons.push('RUNTIME_NOT_CONFIGURED');
  return {
    provider: input.provider,
    status: reasons.length === 0 ? 'READY' : 'NOT_READY',
    reasons
  };
}

export interface SecretRef {
  /** Opaque secret-manager reference; never secret material. */
  id: string;
}

export interface ProviderSafeConfig {
  provider: ChannelProvider;
  channel: CommunicationChannel;
  enabled: boolean;
  requestTimeoutMs: number;
  retryPolicyRef: string;
}

export interface ProviderSecretRefs {
  authentication: SecretRef;
  webhookVerification: SecretRef;
}

export type ProviderTransportResult =
  | { status: 'PROVIDER_ACCEPTED'; providerReceiptId?: string }
  | { status: 'NOT_CONFIGURED'; reasonCode: 'TRANSPORT_NOT_CONFIGURED' }
  | { status: 'FAILED'; category: GatewayFailureCategory; retryAfterMs?: number };

export interface ProviderTransport {
  sendPreparedMessage(message: PreparedOutboundMessage): ProviderTransportResult;
}

export class UnconfiguredProviderTransport implements ProviderTransport {
  sendPreparedMessage(_message: PreparedOutboundMessage): ProviderTransportResult {
    return { status: 'NOT_CONFIGURED', reasonCode: 'TRANSPORT_NOT_CONFIGURED' };
  }
}
