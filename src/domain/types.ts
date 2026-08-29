export type ID = string;

export interface Tenant {
  id: ID;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: ID;
  tenantId: ID;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: ID;
  tenantId: ID;
  name: string;
  phone: string;
  avatar?: string;
  tags: string[];
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: ID;
  tenantId: ID;
  contactId: ID;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageSender = 'USER' | 'CONTACT' | 'SYSTEM';

export interface Message {
  id: ID;
  conversationId: ID;
  sender: MessageSender;
  content: string;
  createdAt: Date;
}

export interface PendingOutboundMessage {
  id: ID;
  conversationId: ID;
  contactId: ID;
  campaignId: ID;
  queueEntryId: ID;
  content: string;
  createdAt: Date;
}

export type FunnelStage = 
  | 'RASCUNHO' 
  | 'LEAD' 
  | 'EM ATENDIMENTO' 
  | 'PEDIDO GERADO' 
  | 'AGUARDANDO PAGAMENTO' 
  | 'PAGO' 
  | 'PRODUÇÃO' 
  | 'ENTREGUE' 
  | 'FECHADO' 
  | 'PÓS-VENDA';

export interface Opportunity {
  id: ID;
  tenantId: ID;
  contactId: ID;
  stage: FunnelStage;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchCampaign {
  id: ID;
  tenantId: ID;
  name: string;
  template: string;
  dailyLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

export type DispatchQueueStatus = 'QUEUED' | 'DRAFT_PREPARED' | 'SENT' | 'REPLIED' | 'FAILED' | 'SKIPPED';

export interface DispatchQueueEntry {
  id: ID;
  campaignId: ID;
  contactId: ID;
  position: number;
  status: DispatchQueueStatus;
  attempts: number;
  createdAt: Date;
  preparedAt?: Date;
  sentAt?: Date;
  repliedAt?: Date;
}

export type OrderSource = 'WHATSAPP' | 'APP' | 'WEB';
export type OrderStatus = 'CREATED' | 'PAID' | 'CANCELED';

export interface Order {
  id: ID;
  tenantId: ID;
  contactId: ID;
  source: OrderSource;
  total: number;
  status: OrderStatus;
  paymentMethod: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: ID;
  orderId: ID;
  productId: ID;
  productName: string;
  quantity: number;
  price: number;
  observation?: string;
}

export interface TimelineEvent {
  id: ID;
  contactId: ID;
  type: string;
  description: string;
  createdAt: Date;
}

export interface Product {
  id: ID;
  name: string;
  price: number;
  category: string;
}
