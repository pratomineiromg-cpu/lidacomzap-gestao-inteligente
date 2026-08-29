import { mockDb } from '../repositories/MockDatabase';
import { emitEvent, AppEvent } from '../events/EventEngine';
import { FunnelStage } from '../domain/types';
import { createId } from '../utils/id';

export const prepareCampaignQueue = (campaignId: string) => {
  mockDb.update(state => {
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    const existingContactIds = new Set(state.dispatchQueue.filter(q => q.campaignId === campaignId).map(q => q.contactId));
    
    let maxPosition = state.dispatchQueue
      .filter(q => q.campaignId === campaignId)
      .reduce((max, q) => Math.max(max, q.position), 0);
      
    const now = new Date();
    
    state.contacts.forEach(contact => {
      if (!existingContactIds.has(contact.id)) {
        maxPosition++;
        state.dispatchQueue = [...state.dispatchQueue, {
          id: createId('dq'),
          campaignId,
          contactId: contact.id,
          position: maxPosition,
          status: 'QUEUED',
          attempts: 0,
          createdAt: now
        }];
      }
    });
  });
};

export const processQueueDrafts = (campaignId: string) => {
  let eventsToEmit: AppEvent[] = [];
  
  mockDb.update(state => {
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    const now = new Date();

    const queued = state.dispatchQueue
      .filter(q => q.campaignId === campaignId && q.status === 'QUEUED')
      .sort((a, b) => a.position - b.position)
      .slice(0, campaign.dailyLimit);
    
    queued.forEach(q => {
      const contact = state.contacts.find(c => c.id === q.contactId);
      if (!contact) return;

      const conversation = state.conversations.find(c => c.contactId === contact.id);
      if (!conversation) return;

      const messageContent = campaign.template.replace('{{nome}}', contact.name.split(' ')[0]);

      state.pendingMessages = [...state.pendingMessages, {
        id: createId('pm'),
        conversationId: conversation.id,
        contactId: contact.id,
        campaignId: campaign.id,
        queueEntryId: q.id,
        content: messageContent,
        createdAt: now
      }];

      // Update queue status by id
      state.dispatchQueue = state.dispatchQueue.map(item => 
        item.id === q.id ? { ...item, status: 'DRAFT_PREPARED', preparedAt: now } : item
      );

      eventsToEmit.push({ type: 'MESSAGE_DRAFT_CREATED', conversationId: conversation.id, contactId: contact.id });
    });
  });
  
  eventsToEmit.forEach(emitEvent);
};

export const sendDraftMessage = (conversationId: string) => {
  let eventsToEmit: AppEvent[] = [];
  
  mockDb.update(state => {
    const draftIndex = state.pendingMessages.findIndex(pm => pm.conversationId === conversationId);
    if (draftIndex === -1) return;

    const draft = state.pendingMessages[draftIndex];
    const conversation = state.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    const now = new Date();
    const newMessage = {
      id: createId('msg'),
      conversationId: conversation.id,
      sender: 'USER' as const,
      content: draft.content,
      createdAt: now
    };

    state.messages = [...state.messages, newMessage];
    state.pendingMessages = state.pendingMessages.filter(pm => pm.id !== draft.id);

    state.dispatchQueue = state.dispatchQueue.map(q => 
      q.id === draft.queueEntryId ? { ...q, status: 'SENT', sentAt: now } : q
    );

    eventsToEmit.push({ type: 'MESSAGE_SENT', message: newMessage, contactId: conversation.contactId });
  });
  
  eventsToEmit.forEach(emitEvent);
};

export const simulateClientResponse = (conversationId: string, content: string = 'Olá, tenho interesse!') => {
  let eventsToEmit: AppEvent[] = [];
  
  mockDb.update(state => {
    const conversation = state.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    const now = new Date();
    const newMessage = {
      id: createId('msg'),
      conversationId: conversation.id,
      sender: 'CONTACT' as const,
      content,
      createdAt: now
    };

    state.messages = [...state.messages, newMessage];
    
    state.conversations = state.conversations.map(c => 
      c.id === conversation.id ? { ...c, unreadCount: c.unreadCount + 1, updatedAt: now } : c
    );
    
    // Find most recent SENT entry for this contact
    const contactSentEntries = state.dispatchQueue
      .filter(q => q.contactId === conversation.contactId && q.status === 'SENT')
      .sort((a, b) => (b.sentAt?.getTime() || 0) - (a.sentAt?.getTime() || 0));
      
    if (contactSentEntries.length > 0) {
      const latestSent = contactSentEntries[0];
      state.dispatchQueue = state.dispatchQueue.map(q => 
        q.id === latestSent.id ? { ...q, status: 'REPLIED', repliedAt: now } : q
      );
    }

    eventsToEmit.push({ type: 'MESSAGE_RECEIVED', message: newMessage, contactId: conversation.contactId });
  });
  
  eventsToEmit.forEach(emitEvent);
};

export const createOrder = (contactId: string, item: { productId: string, productName: string, quantity: number, price: number, observation: string }, paymentMethod: string) => {
  let eventsToEmit: AppEvent[] = [];
  
  mockDb.update(state => {
    const now = new Date();
    const orderId = createId('ord');
    const order = {
      id: orderId,
      tenantId: state.tenant.id,
      contactId,
      source: 'WHATSAPP' as const,
      total: item.price * item.quantity,
      status: 'CREATED' as const,
      paymentMethod,
      createdAt: now,
      updatedAt: now,
    };
    
    const orderItem = {
      id: createId('oi'),
      orderId: order.id,
      ...item
    };

    state.orders = [...state.orders, order];
    state.orderItems = [...state.orderItems, orderItem];

    const conversation = state.conversations.find(c => c.contactId === contactId);
    if (conversation) {
      state.messages = [...state.messages, {
        id: createId('msg'),
        conversationId: conversation.id,
        sender: 'SYSTEM',
        content: `Pedido #${order.id.split('-')[1] || order.id} gerado com sucesso. Valor total: R$ ${order.total.toFixed(2)}`,
        createdAt: now
      }];
    }

    eventsToEmit.push({ type: 'ORDER_CREATED', order, contactId });
  });
  
  eventsToEmit.forEach(emitEvent);
};

export const changeOpportunityStage = (contactId: string, newStage: FunnelStage) => {
  let eventsToEmit: AppEvent[] = [];
  const state = mockDb.getState();
  const opp = state.opportunities.find(o => o.contactId === contactId);
  if (opp) {
    eventsToEmit.push({ type: 'FUNNEL_STAGE_CHANGED', opportunityId: opp.id, newStage, contactId });
  } else {
    // Force create opp
    eventsToEmit.push({ type: 'FUNNEL_STAGE_CHANGED', opportunityId: createId('opp'), newStage, contactId });
  }
  
  eventsToEmit.forEach(emitEvent);
};

export const updateCampaignDailyLimit = (campaignId: string, limit: number) => {
  mockDb.update(state => {
    state.campaigns = state.campaigns.map(c => 
      c.id === campaignId ? { ...c, dailyLimit: limit, updatedAt: new Date() } : c
    );
  });
};
