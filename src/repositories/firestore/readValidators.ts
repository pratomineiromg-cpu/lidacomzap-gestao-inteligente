import { Timestamp } from 'firebase/firestore';
import {
  Contact,
  Conversation,
  Message,
  MessageSender,
  Opportunity,
  FunnelStage,
  DispatchCampaign,
  DispatchQueueEntry,
  DispatchQueueStatus,
  PendingOutboundMessage,
  Order,
  OrderEntryPoint,
  CommunicationChannel,
  OrderCreationMode,
  OrderStatus,
  OrderItem,
  TimelineEvent,
  CustomerProfile,
  CustomerAddress
} from '../../domain/types';

export function requireString(value: any, col: string, docId: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected non-empty string.`);
  }
  return value;
}

export function requireStringAllowEmpty(value: any, col: string, docId: string, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected string.`);
  }
  return value;
}

export function optionalString(value: any, col: string, docId: string, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected string when provided.`);
  }
  return value.trim().length === 0 ? undefined : value;
}

export function requireFiniteNumber(value: any, col: string, docId: string, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected finite number.`);
  }
  return value;
}

export function parseStrictDate(value: any): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime()) ? value : null;
  }
  if (value instanceof Timestamp) {
    const d = value.toDate();
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  if (value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (value && typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
    const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    const d = new Date(value.seconds * 1000 + Math.floor(nanos / 1000000));
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

export function requireDate(value: any, col: string, docId: string, field: string): Date {
  const d = parseStrictDate(value);
  if (!d) {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected valid date/timestamp.`);
  }
  return d;
}

export function optionalDate(value: any, col: string, docId: string, field: string): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const d = parseStrictDate(value);
  if (!d) {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected valid date/timestamp when provided.`);
  }
  return d;
}

export function requireStringArray(value: any, col: string, docId: string, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Invalid field "${field}" in collection "${col}" doc "${docId}": expected array of strings.`);
  }
  return value;
}

export function requireEnum<T extends string>(value: any, allowed: readonly T[], col: string, docId: string, field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid enum "${field}" in collection "${col}" doc "${docId}": expected one of [${allowed.join(', ')}].`);
  }
  return value as T;
}

export const ALLOWED_FUNNEL_STAGES: readonly FunnelStage[] = [
  'RASCUNHO',
  'LEAD',
  'EM ATENDIMENTO',
  'PEDIDO GERADO',
  'AGUARDANDO PAGAMENTO',
  'PAGO',
  'PRODUÇÃO',
  'ENTREGUE',
  'FECHADO',
  'PÓS-VENDA'
];

export const ALLOWED_MESSAGE_SENDERS: readonly MessageSender[] = ['USER', 'CONTACT', 'SYSTEM'];
export const ALLOWED_QUEUE_STATUSES: readonly DispatchQueueStatus[] = ['QUEUED', 'DRAFT_PREPARED', 'SENT', 'REPLIED', 'FAILED', 'SKIPPED'];
export const ALLOWED_ORDER_ENTRY_POINTS: readonly OrderEntryPoint[] = ['DIGITAL_MENU', 'CHAT', 'POS', 'TABLE_QR'];
export const ALLOWED_ORDER_CHANNELS: readonly CommunicationChannel[] = ['WHATSAPP', 'RCS', 'NONE'];
export const ALLOWED_ORDER_CREATION_MODES: readonly OrderCreationMode[] = ['CUSTOMER', 'HUMAN_OPERATOR', 'AI_ASSISTED', 'AUTOMATION'];
export const ALLOWED_ORDER_STATUSES: readonly OrderStatus[] = ['CREATED', 'PAID', 'CANCELED'];

export function validateContact(d: any): Contact {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'contacts', docId, 'id'),
    tenantId: requireString(d?.tenantId, 'contacts', docId, 'tenantId'),
    name: requireString(d?.name, 'contacts', docId, 'name'),
    phone: requireString(d?.phone, 'contacts', docId, 'phone'),
    avatar: optionalString(d?.avatar, 'contacts', docId, 'avatar'),
    tags: requireStringArray(d?.tags, 'contacts', docId, 'tags'),
    notes: requireStringAllowEmpty(d?.notes, 'contacts', docId, 'notes'),
    createdAt: requireDate(d?.createdAt, 'contacts', docId, 'createdAt'),
    updatedAt: requireDate(d?.updatedAt, 'contacts', docId, 'updatedAt')
  };
}

export function validateConversation(d: any): Conversation {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'conversations', docId, 'id'),
    tenantId: requireString(d?.tenantId, 'conversations', docId, 'tenantId'),
    contactId: requireString(d?.contactId, 'conversations', docId, 'contactId'),
    unreadCount: requireFiniteNumber(d?.unreadCount, 'conversations', docId, 'unreadCount'),
    createdAt: requireDate(d?.createdAt, 'conversations', docId, 'createdAt'),
    updatedAt: requireDate(d?.updatedAt, 'conversations', docId, 'updatedAt')
  };
}

export function validateMessage(d: any): Message {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'messages', docId, 'id'),
    conversationId: requireString(d?.conversationId, 'messages', docId, 'conversationId'),
    sender: requireEnum<MessageSender>(d?.sender, ALLOWED_MESSAGE_SENDERS, 'messages', docId, 'sender'),
    content: requireString(d?.content, 'messages', docId, 'content'),
    createdAt: requireDate(d?.createdAt, 'messages', docId, 'createdAt')
  };
}

export function validateOpportunity(d: any): Opportunity {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'opportunities', docId, 'id'),
    tenantId: requireString(d?.tenantId, 'opportunities', docId, 'tenantId'),
    contactId: requireString(d?.contactId, 'opportunities', docId, 'contactId'),
    stage: requireEnum<FunnelStage>(d?.stage, ALLOWED_FUNNEL_STAGES, 'opportunities', docId, 'stage'),
    createdAt: requireDate(d?.createdAt, 'opportunities', docId, 'createdAt'),
    updatedAt: requireDate(d?.updatedAt, 'opportunities', docId, 'updatedAt')
  };
}

export function validateDispatchCampaign(d: any): DispatchCampaign {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'dispatchCampaigns', docId, 'id'),
    tenantId: requireString(d?.tenantId, 'dispatchCampaigns', docId, 'tenantId'),
    name: requireString(d?.name, 'dispatchCampaigns', docId, 'name'),
    template: requireString(d?.template, 'dispatchCampaigns', docId, 'template'),
    dailyLimit: requireFiniteNumber(d?.dailyLimit, 'dispatchCampaigns', docId, 'dailyLimit'),
    createdAt: requireDate(d?.createdAt, 'dispatchCampaigns', docId, 'createdAt'),
    updatedAt: requireDate(d?.updatedAt, 'dispatchCampaigns', docId, 'updatedAt')
  };
}

export function validateDispatchQueueEntry(d: any): DispatchQueueEntry {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'dispatchQueue', docId, 'id'),
    campaignId: requireString(d?.campaignId, 'dispatchQueue', docId, 'campaignId'),
    contactId: requireString(d?.contactId, 'dispatchQueue', docId, 'contactId'),
    position: requireFiniteNumber(d?.position, 'dispatchQueue', docId, 'position'),
    status: requireEnum<DispatchQueueStatus>(d?.status, ALLOWED_QUEUE_STATUSES, 'dispatchQueue', docId, 'status'),
    attempts: requireFiniteNumber(d?.attempts, 'dispatchQueue', docId, 'attempts'),
    createdAt: requireDate(d?.createdAt, 'dispatchQueue', docId, 'createdAt'),
    preparedAt: optionalDate(d?.preparedAt, 'dispatchQueue', docId, 'preparedAt'),
    sentAt: optionalDate(d?.sentAt, 'dispatchQueue', docId, 'sentAt'),
    repliedAt: optionalDate(d?.repliedAt, 'dispatchQueue', docId, 'repliedAt')
  };
}

export function validatePendingOutboundMessage(d: any): PendingOutboundMessage {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'pendingOutboundMessages', docId, 'id'),
    queueEntryId: requireString(d?.queueEntryId, 'pendingOutboundMessages', docId, 'queueEntryId'),
    campaignId: requireString(d?.campaignId, 'pendingOutboundMessages', docId, 'campaignId'),
    contactId: requireString(d?.contactId, 'pendingOutboundMessages', docId, 'contactId'),
    conversationId: requireString(d?.conversationId, 'pendingOutboundMessages', docId, 'conversationId'),
    content: requireString(d?.content, 'pendingOutboundMessages', docId, 'content'),
    createdAt: requireDate(d?.createdAt, 'pendingOutboundMessages', docId, 'createdAt')
  };
}

export function validateOrder(d: any): Order {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'orders', docId, 'id'),
    tenantId: requireString(d?.tenantId, 'orders', docId, 'tenantId'),
    contactId: requireString(d?.contactId, 'orders', docId, 'contactId'),
    entryPoint: requireEnum<OrderEntryPoint>(d?.entryPoint, ALLOWED_ORDER_ENTRY_POINTS, 'orders', docId, 'entryPoint'),
    channel: requireEnum<CommunicationChannel>(d?.channel, ALLOWED_ORDER_CHANNELS, 'orders', docId, 'channel'),
    creationMode: requireEnum<OrderCreationMode>(d?.creationMode, ALLOWED_ORDER_CREATION_MODES, 'orders', docId, 'creationMode'),
    total: requireFiniteNumber(d?.total, 'orders', docId, 'total'),
    status: requireEnum<OrderStatus>(d?.status, ALLOWED_ORDER_STATUSES, 'orders', docId, 'status'),
    paymentMethod: requireString(d?.paymentMethod, 'orders', docId, 'paymentMethod'),
    createdAt: requireDate(d?.createdAt, 'orders', docId, 'createdAt'),
    updatedAt: requireDate(d?.updatedAt, 'orders', docId, 'updatedAt'),
    conversationId: optionalString(d?.conversationId, 'orders', docId, 'conversationId'),
    dispatchCampaignId: optionalString(d?.dispatchCampaignId, 'orders', docId, 'dispatchCampaignId'),
    queueEntryId: optionalString(d?.queueEntryId, 'orders', docId, 'queueEntryId')
  };
}

export function validateOrderItem(d: any): OrderItem {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'orderItems', docId, 'id'),
    orderId: requireString(d?.orderId, 'orderItems', docId, 'orderId'),
    productId: requireString(d?.productId, 'orderItems', docId, 'productId'),
    productName: requireString(d?.productName, 'orderItems', docId, 'productName'),
    price: requireFiniteNumber(d?.price, 'orderItems', docId, 'price'),
    quantity: requireFiniteNumber(d?.quantity, 'orderItems', docId, 'quantity'),
    observation: optionalString(d?.observation, 'orderItems', docId, 'observation')
  };
}

export function validateTimelineEvent(d: any): TimelineEvent {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'timelineEvents', docId, 'id'),
    contactId: requireString(d?.contactId, 'timelineEvents', docId, 'contactId'),
    type: requireString(d?.type, 'timelineEvents', docId, 'type'),
    description: requireString(d?.description, 'timelineEvents', docId, 'description'),
    createdAt: requireDate(d?.createdAt, 'timelineEvents', docId, 'createdAt')
  };
}

export function validateCustomerProfile(d: any): CustomerProfile {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'customerProfiles', docId, 'id'),
    contactId: requireString(d?.contactId, 'customerProfiles', docId, 'contactId'),
    fullName: requireString(d?.fullName, 'customerProfiles', docId, 'fullName'),
    phone: requireString(d?.phone, 'customerProfiles', docId, 'phone'),
    email: optionalString(d?.email, 'customerProfiles', docId, 'email')
  };
}

export function validateCustomerAddress(d: any): CustomerAddress {
  const docId = String(d?._docId || d?.id || 'unknown');
  return {
    id: requireString(d?.id, 'customerAddresses', docId, 'id'),
    contactId: requireString(d?.contactId, 'customerAddresses', docId, 'contactId'),
    street: requireString(d?.street, 'customerAddresses', docId, 'street'),
    number: requireString(d?.number, 'customerAddresses', docId, 'number'),
    neighborhood: requireString(d?.neighborhood, 'customerAddresses', docId, 'neighborhood'),
    complement: optionalString(d?.complement, 'customerAddresses', docId, 'complement'),
    postalCode: requireString(d?.postalCode, 'customerAddresses', docId, 'postalCode')
  };
}
