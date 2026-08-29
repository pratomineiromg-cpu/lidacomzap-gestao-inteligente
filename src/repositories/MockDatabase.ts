import {
  Tenant, User, Contact, Conversation, Message, PendingOutboundMessage,
  Opportunity, DispatchCampaign, DispatchQueueEntry, Order, OrderItem, TimelineEvent, Product
} from '../domain/types';

export interface DatabaseState {
  tenant: Tenant;
  users: User[];
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  pendingMessages: PendingOutboundMessage[];
  opportunities: Opportunity[];
  campaigns: DispatchCampaign[];
  dispatchQueue: DispatchQueueEntry[];
  orders: Order[];
  orderItems: OrderItem[];
  timeline: TimelineEvent[];
  products: Product[];
}

export const createInitialState = (): DatabaseState => {
  const tenantId = 't-1';
  const now = new Date();

  const contacts: Contact[] = Array.from({ length: 20 }).map((_, i) => ({
    id: `c-${i + 1}`,
    tenantId,
    name: `Cliente ${i + 1}`,
    phone: `55119999900${i.toString().padStart(2, '0')}`,
    tags: i % 3 === 0 ? ['VIP'] : [],
    notes: '',
    createdAt: new Date(now.getTime() - i * 10000000),
    updatedAt: new Date(now.getTime() - i * 100000),
  }));

  const conversations: Conversation[] = contacts.map(c => ({
    id: `conv-${c.id}`,
    tenantId,
    contactId: c.id,
    unreadCount: 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  const products: Product[] = [
    { id: 'p-1', name: 'X-Burger', price: 25.00, category: 'Lanches' },
    { id: 'p-2', name: 'X-Bacon', price: 32.00, category: 'Lanches' },
    { id: 'p-3', name: 'Batata Frita', price: 15.00, category: 'Porções' },
    { id: 'p-4', name: 'Refrigerante Cola Lata', price: 6.00, category: 'Bebidas' },
  ];

  return {
    tenant: { id: tenantId, name: 'Restaurante Prato Mineiro', createdAt: now, updatedAt: now },
    users: [{ id: 'u-1', tenantId, name: 'Atendente', email: 'atendimento@demo.com', createdAt: now, updatedAt: now }],
    contacts,
    conversations,
    messages: [],
    pendingMessages: [],
    opportunities: [], // Let event engine or manual actions populate these
    campaigns: [{
      id: 'camp-1',
      tenantId,
      name: 'Promoção de Terça',
      template: 'Olá {{nome}}! Veja nosso cardápio de hoje com descontos especiais.',
      dailyLimit: 250,
      createdAt: now,
      updatedAt: now
    }],
    dispatchQueue: [],
    orders: [],
    orderItems: [],
    timeline: [],
    products,
  };
};

// Singleton in-memory store for demonstration purposes
let state: DatabaseState = createInitialState();
type Listener = () => void;
const listeners = new Set<Listener>();

export const mockDb = {
  getState: () => state,
  setState: (newState: DatabaseState) => {
    state = newState;
    listeners.forEach(l => l());
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  
  // Helpers
  update: (updater: (draft: DatabaseState) => void) => {
    const nextState = { ...state };
    // Deep clone arrays if we are going to modify them, but for simplicity we will just re-assign arrays.
    // To make it simpler, we will just mutate the state object directly since it's a mock DB,
    // and then call listeners. (In a real app with Redux/Context we'd return a new object).
    // Let's do a shallow clone pattern:
    updater(nextState);
    mockDb.setState(nextState);
  },
  
  reset: () => {
    mockDb.setState(createInitialState());
  }
};
