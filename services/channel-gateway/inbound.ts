import type { ChannelGatewayAdapter, GatewayCommand, GatewayProcessResult, NormalizedChannelEvent } from './contracts';
import { GatewayError } from './errors';
import type { DurableIdempotencyStore } from './idempotency';
import { assertNormalizedEvent, createOpaqueGatewayId } from './normalization';
import type { ProviderRawDecoder, RawWebhookRequest } from './rawWebhook';
import type { ContactIdentityResolver, ConversationResolver } from './resolution';
import { createSanitizedAuditEvent } from './sanitizer';
import type { WebhookAuthenticator } from './webhookAuth';

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

interface DurableProcessOptions {
  adapter: ChannelGatewayAdapter;
  idempotencyStore: DurableIdempotencyStore;
  ownerId: string;
  now: Date;
  leaseDurationMs: number;
  createInternalEventId?: () => string;
}

export interface ProcessTrustedSyntheticFixtureOptions extends DurableProcessOptions {
  rawFixture: unknown;
  trustMode: 'TRUSTED_SYNTHETIC_FIXTURE';
}

export interface ProcessLiveWebhookOptions extends DurableProcessOptions {
  request: RawWebhookRequest;
  authenticator: WebhookAuthenticator;
  liveDecoder: ProviderRawDecoder;
  contactIdentityResolver: ContactIdentityResolver;
  conversationResolver: ConversationResolver;
}

function rejectBeforeDecode(
  options: DurableProcessOptions,
  reasonCode: 'WEBHOOK_AUTH_NOT_CONFIGURED' | 'WEBHOOK_AUTH_REJECTED'
): GatewayProcessResult {
  const createInternalEventId = options.createInternalEventId ?? (() => createOpaqueGatewayId('gateway-event'));
  return {
    outcome: 'REJECTED',
    audit: createSanitizedAuditEvent({
      internalEventId: createInternalEventId(),
      provider: options.adapter.provider,
      channel: options.adapter.channel,
      outcome: 'REJECTED',
      reasonCode,
      duplicate: false,
      auditedAt: options.now
    })
  };
}

function processDurably(
  options: DurableProcessOptions,
  normalize: (context: { createInternalEventId: () => string }) => NormalizedChannelEvent,
  resolve?: (event: NormalizedChannelEvent) => void
): GatewayProcessResult {
  const createInternalEventId = options.createInternalEventId ?? (() => createOpaqueGatewayId('gateway-event'));
  let event: NormalizedChannelEvent | undefined;
  let acquiredKey: string | undefined;
  try {
    event = normalize({ createInternalEventId });
    assertNormalizedEvent(event);
    if (event.provider !== options.adapter.provider || event.channel !== options.adapter.channel) {
      throw new GatewayError('INVALID_EVENT');
    }
    const key = options.adapter.createIdempotencyKey(event);
    const acquired = options.idempotencyStore.tryAcquire({
      key,
      ownerId: options.ownerId,
      now: options.now,
      leaseDurationMs: options.leaseDurationMs
    });
    if (['ALREADY_PROCESSING', 'ALREADY_COMPLETED'].includes(acquired.status)) {
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
          auditedAt: options.now
        })
      };
    }
    if (acquired.status === 'FINAL_FAILURE') {
      throw new GatewayError('NON_RETRYABLE');
    }
    acquiredKey = key;
    resolve?.(event);
    const command = commandFor(event);
    options.idempotencyStore.complete(key, options.ownerId, options.now);
    return {
      outcome: 'ACCEPTED',
      event,
      command,
      audit: createSanitizedAuditEvent({
        event,
        internalEventId: event.internalEventId,
        provider: event.provider,
        channel: event.channel,
        outcome: 'ACCEPTED',
        reasonCode: 'EVENT_ACCEPTED',
        duplicate: false,
        auditedAt: options.now
      })
    };
  } catch (error) {
    if (acquiredKey) {
      // A resolution/storage failure must not become a successful duplicate ACK.
      // Allow retry without holding the lease; no downstream work ran here.
      try { options.idempotencyStore.fail(acquiredKey, options.ownerId, options.now, 'RETRYABLE'); }
      catch { /* A storage failure remains a rejected request. */ }
    }
    const code = error instanceof GatewayError ? error.code : 'INVALID_EVENT';
    return {
      outcome: 'REJECTED',
      audit: createSanitizedAuditEvent({
        event,
        internalEventId: event?.internalEventId ?? createInternalEventId(),
        provider: options.adapter.provider,
        channel: options.adapter.channel,
        eventType: event?.eventType,
        outcome: 'REJECTED',
        reasonCode: code,
        duplicate: false,
        auditedAt: options.now
      })
    };
  }
}

/** Explicit fixture-only entrypoint. It never produces a live verification claim. */
export function processTrustedSyntheticFixture(
  options: ProcessTrustedSyntheticFixtureOptions
): GatewayProcessResult {
  return processDurably(options, (context) => options.adapter.normalizeEvent(options.rawFixture, context));
}

/** Fail-closed live entrypoint. Authentication occurs on exact bytes before decoding. */
export function processLiveWebhookRequest(options: ProcessLiveWebhookOptions): GatewayProcessResult {
  if (
    options.request.trustMode !== 'LIVE_UNTRUSTED' ||
    options.authenticator.provider !== options.adapter.provider ||
    options.liveDecoder.provider !== options.adapter.provider
  ) {
    return rejectBeforeDecode(options, 'WEBHOOK_AUTH_REJECTED');
  }
  const authentication = options.authenticator.verify(options.request);
  if (authentication.status === 'NOT_CONFIGURED') {
    return rejectBeforeDecode(options, 'WEBHOOK_AUTH_NOT_CONFIGURED');
  }
  if (authentication.status !== 'VERIFIED') {
    return rejectBeforeDecode(options, 'WEBHOOK_AUTH_REJECTED');
  }
  return processDurably(options, (context) => options.liveDecoder.decode(options.request, context), (event) => {
    if (event.eventType !== 'INBOUND_MESSAGE') return;
    const externalAddress = event.payload.providerAddress;
    if (!externalAddress) throw new GatewayError('IDENTITY_REJECTED');
    const identity = options.contactIdentityResolver.resolve({
      provider: event.provider,
      channel: event.channel,
      externalAddress
    });
    if (identity.status === 'NOT_FOUND') throw new GatewayError('IDENTITY_NOT_FOUND');
    if (identity.status === 'AMBIGUOUS') throw new GatewayError('IDENTITY_AMBIGUOUS');
    if (identity.status === 'REJECTED') throw new GatewayError('IDENTITY_REJECTED');
    const conversation = options.conversationResolver.resolve({
      contactId: identity.contactId,
      provider: event.provider,
      channel: event.channel,
      externalConversationId: event.payload.externalConversationId
    });
    if (conversation.status === 'NOT_FOUND') throw new GatewayError('CONVERSATION_NOT_FOUND');
    if (conversation.status === 'AMBIGUOUS') throw new GatewayError('CONVERSATION_AMBIGUOUS');
    if (conversation.status === 'REJECTED') throw new GatewayError('CONVERSATION_REJECTED');
  });
}
