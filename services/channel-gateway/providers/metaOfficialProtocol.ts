import type {
  GatewayNormalizationContext,
  NormalizedChannelEvent
} from '../contracts';
import { GatewayError } from '../errors';
import {
  decodeRawWebhookJson,
  type ProviderRawDecoder,
  type RawWebhookRequest
} from '../rawWebhook';
import type { SecretRef } from '../operability';

export const META_OFFICIAL_WEBHOOK_OBJECT = 'whatsapp_business_account' as const;
export const META_OFFICIAL_MESSAGES_FIELD = 'messages' as const;
export const META_OFFICIAL_MESSAGING_PRODUCT = 'whatsapp' as const;

export type MetaOfficialMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface MetaWebhookMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface MetaWebhookTextMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text';
  text: {
    body: string;
  };
}

export interface MetaWebhookUnsupportedMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
}

export type MetaWebhookMessage = MetaWebhookTextMessage | MetaWebhookUnsupportedMessage;

export interface MetaWebhookStatus {
  id: string;
  status: MetaOfficialMessageStatus | string;
  timestamp: string;
}

export interface MetaWebhookValue {
  messaging_product: typeof META_OFFICIAL_MESSAGING_PRODUCT;
  metadata: MetaWebhookMetadata;
  messages?: readonly MetaWebhookMessage[];
  statuses?: readonly MetaWebhookStatus[];
}

export interface MetaWebhookChange {
  field: typeof META_OFFICIAL_MESSAGES_FIELD;
  value: MetaWebhookValue;
}

export interface MetaWebhookEntry {
  id: string;
  changes: readonly MetaWebhookChange[];
}

export interface MetaWebhookEnvelope {
  object: typeof META_OFFICIAL_WEBHOOK_OBJECT;
  entry: readonly MetaWebhookEntry[];
}

export type MetaOfficialUnsupportedReason =
  | 'UNSUPPORTED_MESSAGE_TYPE'
  | 'UNSUPPORTED_STATUS'
  | 'UNSUPPORTED_EMPTY_CHANGE';

export type MetaOfficialProviderEvent =
  | {
      kind: 'message';
      providerEventId: string;
      providerMessageId: string;
      providerAddress: string;
      providerTimestamp: string;
      occurredAt: Date;
      text: string;
      externalConversationId: string;
    }
  | {
      kind: 'status';
      providerEventId: string;
      providerMessageId: string;
      providerTimestamp: string;
      occurredAt: Date;
      status: MetaOfficialMessageStatus;
    }
  | {
      kind: 'unsupported_event';
      providerEventId: string;
      reason: MetaOfficialUnsupportedReason;
    };

export interface MetaWabaSubscriptionContract {
  provider: 'WHATSAPP_META_OFFICIAL';
  required: true;
  configured: boolean;
  managementAuthentication: 'NOT_CONFIGURED';
}

export interface MetaWebhookVerifyTokenBoundary {
  provider: 'WHATSAPP_META_OFFICIAL';
  verifyTokenRef?: SecretRef;
  challengeProtocol: 'PENDING_OFFICIAL_SPEC_VERIFICATION';
}

export interface MetaOfficialProtocolReadinessContract {
  wabaSubscription: MetaWabaSubscriptionContract;
  webhookVerifyToken: MetaWebhookVerifyTokenBoundary;
  genericCryptoPrimitive: 'READY';
  metaPostSignatureProtocol: 'PENDING_OFFICIAL_SPEC_VERIFICATION';
}

const SUPPORTED_STATUSES: readonly MetaOfficialMessageStatus[] = [
  'sent',
  'delivered',
  'read',
  'failed'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GatewayError('INVALID_EVENT');
  }
  return value.trim();
}

function requiredRecord(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = record[field];
  if (!isRecord(value)) {
    throw new GatewayError('INVALID_EVENT');
  }
  return value;
}

function optionalArray(record: Record<string, unknown>, field: string): readonly unknown[] | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new GatewayError('INVALID_EVENT');
  }
  return value;
}

function requiredArray(record: Record<string, unknown>, field: string): readonly unknown[] {
  const value = record[field];
  if (!Array.isArray(value) || value.length === 0) {
    throw new GatewayError('INVALID_EVENT');
  }
  return value;
}

function parseProviderTimestamp(timestamp: string): Date {
  const trimmed = timestamp.trim();
  if (/^\d+$/.test(trimmed)) {
    const epochSeconds = Number(trimmed);
    if (!Number.isSafeInteger(epochSeconds)) {
      throw new GatewayError('INVALID_EVENT');
    }
    return new Date(epochSeconds * 1_000);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new GatewayError('INVALID_EVENT');
  }
  return parsed;
}

function decodeMetadata(input: unknown): MetaWebhookMetadata {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }
  return {
    display_phone_number: requiredString(input, 'display_phone_number'),
    phone_number_id: requiredString(input, 'phone_number_id')
  };
}

function decodeMessage(input: unknown): MetaWebhookMessage {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }

  const type = requiredString(input, 'type');
  const base = {
    id: requiredString(input, 'id'),
    from: requiredString(input, 'from'),
    timestamp: requiredString(input, 'timestamp'),
    type
  };

  if (type !== 'text') {
    return base;
  }

  const text = requiredRecord(input, 'text');
  return {
    ...base,
    type: 'text',
    text: {
      body: requiredString(text, 'body')
    }
  };
}

function decodeStatus(input: unknown): MetaWebhookStatus {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }

  return {
    id: requiredString(input, 'id'),
    status: requiredString(input, 'status'),
    timestamp: requiredString(input, 'timestamp')
  };
}

function decodeValue(input: unknown): MetaWebhookValue {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }
  if (requiredString(input, 'messaging_product') !== META_OFFICIAL_MESSAGING_PRODUCT) {
    throw new GatewayError('INVALID_EVENT');
  }

  const messages = optionalArray(input, 'messages')?.map(decodeMessage);
  const statuses = optionalArray(input, 'statuses')?.map(decodeStatus);

  return {
    messaging_product: META_OFFICIAL_MESSAGING_PRODUCT,
    metadata: decodeMetadata(input.metadata),
    ...(messages ? { messages } : {}),
    ...(statuses ? { statuses } : {})
  };
}

function decodeChange(input: unknown): MetaWebhookChange {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }
  if (requiredString(input, 'field') !== META_OFFICIAL_MESSAGES_FIELD) {
    throw new GatewayError('INVALID_EVENT');
  }
  return {
    field: META_OFFICIAL_MESSAGES_FIELD,
    value: decodeValue(input.value)
  };
}

function decodeEntry(input: unknown): MetaWebhookEntry {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }
  return {
    id: requiredString(input, 'id'),
    changes: requiredArray(input, 'changes').map(decodeChange)
  };
}

export function decodeMetaWebhookEnvelope(input: unknown): MetaWebhookEnvelope {
  if (!isRecord(input)) {
    throw new GatewayError('INVALID_EVENT');
  }
  if (requiredString(input, 'object') !== META_OFFICIAL_WEBHOOK_OBJECT) {
    throw new GatewayError('INVALID_EVENT');
  }
  return {
    object: META_OFFICIAL_WEBHOOK_OBJECT,
    entry: requiredArray(input, 'entry').map(decodeEntry)
  };
}

function messageEventId(entryId: string, changeIndex: number, providerMessageId: string): string {
  return `meta:message:${entryId}:${changeIndex}:${providerMessageId}`;
}

function statusEventId(
  entryId: string,
  changeIndex: number,
  providerMessageId: string,
  status: string,
  timestamp: string
): string {
  return `meta:status:${entryId}:${changeIndex}:${status}:${providerMessageId}:${timestamp}`;
}

export function decodeMetaOfficialWebhookEvents(input: unknown): readonly MetaOfficialProviderEvent[] {
  const envelope = decodeMetaWebhookEnvelope(input);
  const events: MetaOfficialProviderEvent[] = [];

  for (const entry of envelope.entry) {
    entry.changes.forEach((change, changeIndex) => {
      const externalConversationId = `${entry.id}:${change.value.metadata.phone_number_id}`;

      if (change.value.messages) {
        for (const message of change.value.messages) {
          const providerEventId = messageEventId(entry.id, changeIndex, message.id);
          if (message.type !== 'text') {
            events.push({
              kind: 'unsupported_event',
              providerEventId,
              reason: 'UNSUPPORTED_MESSAGE_TYPE'
            });
            continue;
          }
          const textMessage = message as MetaWebhookTextMessage;

          events.push({
            kind: 'message',
            providerEventId,
            providerMessageId: textMessage.id,
            providerAddress: textMessage.from,
            providerTimestamp: textMessage.timestamp,
            occurredAt: parseProviderTimestamp(textMessage.timestamp),
            text: textMessage.text.body,
            externalConversationId
          });
        }
      }

      if (change.value.statuses) {
        for (const status of change.value.statuses) {
          const providerEventId = statusEventId(entry.id, changeIndex, status.id, status.status, status.timestamp);
          if (!SUPPORTED_STATUSES.includes(status.status as MetaOfficialMessageStatus)) {
            events.push({
              kind: 'unsupported_event',
              providerEventId,
              reason: 'UNSUPPORTED_STATUS'
            });
            continue;
          }

          events.push({
            kind: 'status',
            providerEventId,
            providerMessageId: status.id,
            providerTimestamp: status.timestamp,
            occurredAt: parseProviderTimestamp(status.timestamp),
            status: status.status as MetaOfficialMessageStatus
          });
        }
      }

      if (!change.value.messages && !change.value.statuses) {
        events.push({
          kind: 'unsupported_event',
          providerEventId: `meta:unsupported:${entry.id}:${changeIndex}`,
          reason: 'UNSUPPORTED_EMPTY_CHANGE'
        });
      }
    });
  }

  return events;
}

export function normalizeMetaOfficialProviderEvent(
  event: MetaOfficialProviderEvent,
  context: GatewayNormalizationContext
): NormalizedChannelEvent {
  if (event.kind === 'unsupported_event') {
    throw new GatewayError('UNSUPPORTED_EVENT');
  }

  if (event.kind === 'message') {
    return {
      internalEventId: context.createInternalEventId(),
      provider: 'WHATSAPP_META_OFFICIAL',
      channel: 'WHATSAPP',
      providerEventId: event.providerEventId,
      providerMessageId: event.providerMessageId,
      occurredAt: new Date(event.occurredAt.getTime()),
      eventType: 'INBOUND_MESSAGE',
      originSurface: 'CUSTOMER',
      payload: {
        providerAddress: event.providerAddress,
        externalConversationId: event.externalConversationId,
        providerTimestamp: event.providerTimestamp,
        content: {
          contentType: 'TEXT',
          text: event.text
        }
      }
    };
  }

  if (event.status === 'read') {
    return {
      internalEventId: context.createInternalEventId(),
      provider: 'WHATSAPP_META_OFFICIAL',
      channel: 'WHATSAPP',
      providerEventId: event.providerEventId,
      providerMessageId: event.providerMessageId,
      occurredAt: new Date(event.occurredAt.getTime()),
      eventType: 'READ_STATUS',
      originSurface: 'PROVIDER',
      payload: {
        readStatus: 'READ',
        providerTimestamp: event.providerTimestamp
      }
    };
  }

  return {
    internalEventId: context.createInternalEventId(),
    provider: 'WHATSAPP_META_OFFICIAL',
    channel: 'WHATSAPP',
    providerEventId: event.providerEventId,
    providerMessageId: event.providerMessageId,
    occurredAt: new Date(event.occurredAt.getTime()),
    eventType: 'DELIVERY_STATUS',
    originSurface: 'PROVIDER',
    payload: {
      deliveryStatus: event.status === 'sent'
        ? 'SENT'
        : event.status === 'delivered'
          ? 'DELIVERED'
          : 'FAILED',
      providerTimestamp: event.providerTimestamp
    }
  };
}

export function createMetaOfficialProtocolReadinessContract(
  verifyTokenRef?: SecretRef
): MetaOfficialProtocolReadinessContract {
  return {
    wabaSubscription: {
      provider: 'WHATSAPP_META_OFFICIAL',
      required: true,
      configured: false,
      managementAuthentication: 'NOT_CONFIGURED'
    },
    webhookVerifyToken: {
      provider: 'WHATSAPP_META_OFFICIAL',
      verifyTokenRef,
      challengeProtocol: 'PENDING_OFFICIAL_SPEC_VERIFICATION'
    },
    genericCryptoPrimitive: 'READY',
    metaPostSignatureProtocol: 'PENDING_OFFICIAL_SPEC_VERIFICATION'
  };
}

export class WhatsAppMetaOfficialWebhookDecoder implements ProviderRawDecoder {
  readonly provider = 'WHATSAPP_META_OFFICIAL' as const;

  decode(
    request: RawWebhookRequest,
    context: GatewayNormalizationContext
  ): NormalizedChannelEvent {
    const parsed = decodeRawWebhookJson(request, this.provider);
    const events = decodeMetaOfficialWebhookEvents(parsed.value);

    if (events.length !== 1) {
      throw new GatewayError('UNSUPPORTED_EVENT');
    }

    return normalizeMetaOfficialProviderEvent(events[0], context);
  }
}
