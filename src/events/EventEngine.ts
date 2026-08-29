import { mockDb } from '../repositories/MockDatabase';
import { FunnelStage, Order, Message } from '../domain/types';
import { createId } from '../utils/id';

// Events
export type AppEvent =
  | { type: 'CONTACT_CREATED', contactId: string }
  | { type: 'CONVERSATION_CREATED', conversationId: string, contactId: string }
  | { type: 'MESSAGE_DRAFT_CREATED', conversationId: string, contactId: string }
  | { type: 'MESSAGE_SENT', message: Message, contactId: string }
  | { type: 'MESSAGE_RECEIVED', message: Message, contactId: string }
  | { type: 'OPPORTUNITY_CREATED', opportunityId: string, contactId: string }
  | { type: 'FUNNEL_STAGE_CHANGED', opportunityId: string, newStage: FunnelStage, contactId: string }
  | { type: 'ORDER_CREATED', order: Order, contactId: string };

export const emitEvent = (event: AppEvent) => {
  console.log('[EventEngine]', event.type, event);
  
  mockDb.update(state => {
    const now = new Date();
    
    // Add to timeline
    const addTimeline = (type: string, desc: string) => {
      state.timeline = [...state.timeline, {
        id: createId('tl'),
        contactId: event.contactId,
        type,
        description: desc,
        createdAt: now,
      }];
    };

    // Ensure opportunity exists for the contact, else create one
    const getOrCreateOpportunity = () => {
      let opp = state.opportunities.find(o => o.contactId === event.contactId);
      if (!opp) {
        opp = {
          id: createId('opp'),
          tenantId: state.tenant.id,
          contactId: event.contactId,
          stage: 'RASCUNHO', // Default
          createdAt: now,
          updatedAt: now,
        };
        state.opportunities = [...state.opportunities, opp];
        addTimeline('OPPORTUNITY_CREATED', 'Oportunidade comercial criada.');
        addTimeline('FUNNEL_STAGE_CHANGED', `Funil alterado automaticamente: (Novo) → RASCUNHO.`);
      }
      return opp;
    };

    const updateFunnel = (newStage: FunnelStage, manual: boolean = false) => {
      const opp = getOrCreateOpportunity();
      if (opp.stage !== newStage) {
        const oldStage = opp.stage;
        state.opportunities = state.opportunities.map(o => 
          o.contactId === event.contactId ? { ...o, stage: newStage, updatedAt: now } : o
        );
        const prefix = manual ? 'Movimentação manual' : 'Funil alterado automaticamente';
        addTimeline('FUNNEL_STAGE_CHANGED', `${prefix}: ${oldStage} → ${newStage}.`);
      }
    };

    switch (event.type) {
      case 'MESSAGE_DRAFT_CREATED':
        addTimeline('MESSAGE_DRAFT_CREATED', 'Mensagem de venda ativa preparada.');
        updateFunnel('RASCUNHO');
        break;
        
      case 'MESSAGE_SENT':
        addTimeline('MESSAGE_SENT', 'Mensagem enviada pelo operador.');
        updateFunnel('LEAD');
        break;
        
      case 'MESSAGE_RECEIVED':
        addTimeline('MESSAGE_RECEIVED', 'Cliente respondeu.');
        updateFunnel('EM ATENDIMENTO');
        break;
        
      case 'ORDER_CREATED':
        addTimeline('ORDER_CREATED', `Pedido #${event.order.id.split('-')[1] || event.order.id} gerado.`);
        updateFunnel('PEDIDO GERADO');
        break;
        
      case 'FUNNEL_STAGE_CHANGED':
        updateFunnel(event.newStage, true);
        break;
    }
  });
};
