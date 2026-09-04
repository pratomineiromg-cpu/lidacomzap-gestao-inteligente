import type { ChannelGatewayAdapter, GatewayCommand, GatewayProcessResult, NormalizedChannelEvent } from './contracts';
import { GatewayError } from './errors';
import type { IdempotencyStore } from './idempotency';
import { assertNormalizedEvent, createOpaqueGatewayId } from './normalization';
import { createSanitizedAuditEvent } from './sanitizer';

function commandFor(event: NormalizedChannelEvent): GatewayCommand {
  switch (event.eventType) {
    case 'INBOUND_MESSAGE':
      return { type: 'InboundMessageReceived', event };
    case 'OUTBOUND_MESSAGE_OBSERVED':
      return { type: 'OutboundMessageObserved', event };
    case 'DELIVERY_STATUS':
      return { type: 'MessageDeliveryUpdated', event };
    case 'READ_STATUS':
      return { type: 'MessageReadUpdated', event };
    case 'CAPABILITY_UPDATE':
      return { type: 'ChannelCapabilityUpdated', event };
    case 'SUBSCRIPTION_UPDATE':
      return { type: 'ChannelSubscriptionUpdated', event };
    case 'PROVIDER_STATUS':
      return { type: 'ProviderStatusObserved', event };
  }
}

export interface ProcessInboundOptions {
  adapter: ChannelGatewayAdapter;
  rawFixture: unknown;
  idempotencyStore: IdempotencyStore;
  auditedAt?: Date;
  createInternalEventId?: () => string;
}

/** Pure orchestration apart from the injected process-local idempotency store. */
export function processInboundProviderEvent(options: ProcessInboundOptions): GatewayProcessResult {
  const auditedAt = options.auditedAt ?? new Date();
  const createInternalEventId = options.createInternalEventId ?? (() => createOpaqueGatewayId('gateway-event'));
  let event: NormalizedChannelEvent | undefined;

  try {
    event = options.adapter.normalizeEvent(options.rawFixture, { createInternalEventId });
    assertNormalizedEvent(event);
    const key = options.adapter.createIdempotencyKey(event);
    const accepted = options.idempotencyStore.reserve(key);

    if (!accepted) {
      return {
        outcome: 'DUPLICATE',
        event,
        audit: createSanitizedAuditEvent({
          event,
          internalEventId: event.internalEventId,
          provider: event.provider,
          channel: event.channel,
          outcome: 'DUPLICATE',
          reasonCode: 'DUPLICATE_EVENT',
          duplicate: true,
          auditedAt
        })
      };
    }

    return {
      outcome: 'ACCEPTED',
      event,
      command: commandFor(event),
      audit: createSanitizedAuditEvent({
        event,
        internalEventId: event.internalEventId,
        provider: event.provider,
        channel: event.channel,
        outcome: 'ACCEPTED',
        reasonCode: 'EVENT_ACCEPTED',
        duplicate: false,
        auditedAt
      })
    };
  } catch (error) {
    const code = error instanceof GatewayError ? error.code : 'INVALID_EVENT';
    return {
      outcome: 'REJECTED',
      audit: createSanitizedAuditEvent({
        internalEventId: event?.internalEventId ?? createInternalEventId(),
        provider: options.adapter.provider,
        channel: options.adapter.channel,
        eventType: event?.eventType,
        outcome: 'REJECTED',
        reasonCode: code,
        duplicate: false,
        auditedAt
      })
    };
  }
}
