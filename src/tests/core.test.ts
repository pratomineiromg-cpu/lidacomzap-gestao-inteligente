import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '../repositories';
import { prepareCampaignQueue, processQueueDrafts, sendDraftMessage, simulateClientResponse, createOrder, updateCampaignDailyLimit } from '../services/Actions';

describe('Core Commercial Flow Tests', () => {
  beforeEach(async () => {
    await repository.reset();
  });

  it('Test 10 - IDs: Should generate unique IDs for opportunities, queue entries, and pending messages', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;

    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);

    const newState = repository.getState();
    
    const oppIds = new Set(newState.opportunities.map(o => o.id));
    expect(oppIds.size).toBe(20);
    expect(newState.opportunities.length).toBe(20);

    const dqIds = new Set(newState.dispatchQueue.map(q => q.id));
    expect(dqIds.size).toBe(20);
    expect(newState.dispatchQueue.length).toBe(20);

    const pmIds = new Set(newState.pendingMessages.map(pm => pm.id));
    expect(pmIds.size).toBe(20);
    expect(newState.pendingMessages.length).toBe(20);
  });

  it('Test 11 - Funnel Isolation: Client 2 should not change when Client 1 is sent', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const c1 = state.contacts.find(c => c.name === 'Cliente 1')!;
    const c2 = state.contacts.find(c => c.name === 'Cliente 2')!;
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);

    let newState = repository.getState();
    expect(newState.opportunities.find(o => o.contactId === c1.id)?.stage).toBe('RASCUNHO');
    expect(newState.opportunities.find(o => o.contactId === c2.id)?.stage).toBe('RASCUNHO');

    const conv1 = newState.conversations.find(c => c.contactId === c1.id)!;
    await sendDraftMessage(conv1.id);

    newState = repository.getState();
    expect(newState.opportunities.find(o => o.contactId === c1.id)?.stage).toBe('LEAD');
    expect(newState.opportunities.find(o => o.contactId === c2.id)?.stage).toBe('RASCUNHO');
    
    const rascunhos = newState.opportunities.filter(o => o.stage === 'RASCUNHO');
    const leads = newState.opportunities.filter(o => o.stage === 'LEAD');
    expect(rascunhos.length).toBe(19);
    expect(leads.length).toBe(1);
  });

  it('Test 12 - Response: Client 1 response moves funnel and queue correctly', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const c1 = state.contacts.find(c => c.name === 'Cliente 1')!;
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    const conv1 = repository.getState().conversations.find(c => c.contactId === c1.id)!;
    await sendDraftMessage(conv1.id);
    
    await simulateClientResponse(conv1.id);
    
    const newState = repository.getState();
    expect(newState.opportunities.find(o => o.contactId === c1.id)?.stage).toBe('EM ATENDIMENTO');
    const queueEntry = newState.dispatchQueue.find(q => q.contactId === c1.id);
    expect(queueEntry?.status).toBe('REPLIED');
    
    const rascunhos = newState.opportunities.filter(o => o.stage === 'RASCUNHO');
    const emAtendimento = newState.opportunities.filter(o => o.stage === 'EM ATENDIMENTO');
    expect(rascunhos.length).toBe(19);
    expect(emAtendimento.length).toBe(1);
  });

  it('Test 13 - Order: Create order through chat for Client 1', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const c1 = state.contacts.find(c => c.name === 'Cliente 1')!;
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    const conv1 = repository.getState().conversations.find(c => c.contactId === c1.id)!;
    await sendDraftMessage(conv1.id);
    await simulateClientResponse(conv1.id);
    
    await createOrder(c1.id, [{ productId: '1', productName: 'Prod', quantity: 1, price: 10, observation: '' }], 'PIX');
    
    const newState = repository.getState();
    expect(newState.opportunities.find(o => o.contactId === c1.id)?.stage).toBe('PEDIDO GERADO');
    expect(newState.orders.length).toBe(1);
    
    const order = newState.orders[0];
    expect(order.entryPoint).toBe('CHAT');
    expect(order.channel).toBe('WHATSAPP');
    expect(order.creationMode).toBe('HUMAN_OPERATOR');
    expect(order.conversationId).toBe(conv1.id);
  });

  it('Test 14 - Idempotency: Duplicate send attempts do not duplicate messages or queue entries', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const c1 = state.contacts.find(c => c.name === 'Cliente 1')!;
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    const conv1 = repository.getState().conversations.find(c => c.contactId === c1.id)!;
    
    await sendDraftMessage(conv1.id);
    let messagesCount = repository.getState().messages.length;
    
    // Attempt second send
    await sendDraftMessage(conv1.id);
    expect(repository.getState().messages.length).toBe(messagesCount); // No new message
    expect(repository.getState().pendingMessages.find(pm => pm.conversationId === conv1.id)).toBeUndefined(); // Draft is gone
    
    // Repopulate queue
    await prepareCampaignQueue(campaignId);
    expect(repository.getState().dispatchQueue.length).toBe(20); // Still 20 entries
  });

  it('Test 15 - Daily Limit: Should respect daily limit for drafts', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    
    await updateCampaignDailyLimit(campaignId, 5);
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    
    const newState = repository.getState();
    const queued = newState.dispatchQueue.filter(q => q.status === 'QUEUED');
    const drafts = newState.dispatchQueue.filter(q => q.status === 'DRAFT_PREPARED');
    
    expect(queued.length).toBe(15);
    expect(drafts.length).toBe(5);
    expect(newState.pendingMessages.length).toBe(5);
  });

  it('Test 16 - Timeline: Semantic accuracy of timeline events', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const c1 = state.contacts.find(c => c.name === 'Cliente 1')!;
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    const conv1 = repository.getState().conversations.find(c => c.contactId === c1.id)!;
    await sendDraftMessage(conv1.id);
    await simulateClientResponse(conv1.id);
    await createOrder(c1.id, [{ productId: '1', productName: 'Prod', quantity: 1, price: 10, observation: '' }], 'PIX');
    
    const newState = repository.getState();
    const timeline = newState.timeline.filter(t => t.contactId === c1.id);
    
    const types = timeline.map(t => t.type);
    expect(types).toEqual([
      'MESSAGE_DRAFT_CREATED',
      'OPPORTUNITY_CREATED',
      'FUNNEL_STAGE_CHANGED',
      'MESSAGE_SENT',
      'FUNNEL_STAGE_CHANGED',
      'MESSAGE_RECEIVED',
      'FUNNEL_STAGE_CHANGED',
      'ORDER_CREATED',
      'FUNNEL_STAGE_CHANGED'
    ]);
  });
  
  it('Test 17 - Repository Contract / Infrastructure Independence', async () => {
    // Assert strictly via public interface checking types without using mock specifics
    expect(repository.addDispatchQueueEntries).toBeDefined();
    expect(repository.transitionOpportunityStage).toBeDefined();
    
    // We can prove we aren't leaking the generic mutation logic out of the app
    const AnyRepo = repository as any;
    expect(AnyRepo.update).toBeUndefined(); // Generic mutable update must be dead
    
    // Check that our business rules are working correctly under the explicit commands
    await prepareCampaignQueue('camp-1');
    const newState = repository.getState();
    expect(newState.dispatchQueue.length).toBe(20); // The core is functional via commands
  });

  it('Test 19 - Multi-item Order', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const c1 = state.contacts.find(c => c.name === 'Cliente 1')!;
    
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    const conv1 = repository.getState().conversations.find(c => c.contactId === c1.id)!;
    await sendDraftMessage(conv1.id);
    await simulateClientResponse(conv1.id);
    
    await createOrder(c1.id, [
      { productId: '1', productName: 'Prod A', quantity: 2, price: 10, observation: '' },
      { productId: '2', productName: 'Prod B', quantity: 1, price: 5, observation: '' }
    ], 'CREDIT_CARD');
    
    const newState = repository.getState();
    expect(newState.orders.length).toBe(1);
    
    const order = newState.orders[0];
    const orderItems = newState.orderItems.filter(item => item.orderId === order.id);
    
    expect(orderItems.length).toBe(2);
    expect(order.total).toBe(25);
    expect(order.entryPoint).toBe('CHAT');
    expect(order.channel).toBe('WHATSAPP');
    expect(order.creationMode).toBe('HUMAN_OPERATOR');
    expect(order.conversationId).toBe(conv1.id);
    
    orderItems.forEach(item => {
      expect(item.orderId).toBe(order.id);
    });
  });

  it('Test 20 - Atomic Opportunity Transition Contract', async () => {
    const state = repository.getState();
    const c1 = state.contacts[0];
    const tenantId = state.tenant.id;
    const now = new Date();

    // Transição 1 - deve criar
    const r1 = await repository.transitionOpportunityStage(c1.id, tenantId, 'RASCUNHO', now);
    expect(r1.created).toBe(true);
    expect(r1.changed).toBe(true);
    expect(r1.currentStage).toBe('RASCUNHO');

    // Transição 2 - para o mesmo estágio, não deve mudar
    const r2 = await repository.transitionOpportunityStage(c1.id, tenantId, 'RASCUNHO', now);
    expect(r2.created).toBe(false);
    expect(r2.changed).toBe(false);
    expect(r2.currentStage).toBe('RASCUNHO');

    // Transição 3 - deve evoluir o estágio, aproveitando a mesma oportunidade
    const r3 = await repository.transitionOpportunityStage(c1.id, tenantId, 'LEAD', now);
    expect(r3.created).toBe(false);
    expect(r3.changed).toBe(true);
    expect(r3.previousStage).toBe('RASCUNHO');
    expect(r3.currentStage).toBe('LEAD');
    expect(r3.opportunity.id).toBe(r1.opportunity.id);

    const newState = repository.getState();
    const oppsForContact = newState.opportunities.filter(o => o.contactId === c1.id);
    expect(oppsForContact.length).toBe(1);
    expect(oppsForContact[0].stage).toBe('LEAD');
  });

  it('Test 21 - Dispatch Queue Logical Uniqueness', async () => {
    const campaignId = repository.getState().campaigns[0].id;
    
    // First call
    await prepareCampaignQueue(campaignId);
    let state = repository.getState();
    expect(state.dispatchQueue.length).toBe(20);

    // Second call
    await prepareCampaignQueue(campaignId);
    state = repository.getState();
    
    // Should still be exactly 20 (idempotent at repository boundary level now)
    expect(state.dispatchQueue.length).toBe(20);
  });

  it('Test 22 - Pending Draft Logical Idempotency', async () => {
    const campaignId = repository.getState().campaigns[0].id;
    await prepareCampaignQueue(campaignId);
    
    // First call
    await processQueueDrafts(campaignId);
    let state = repository.getState();
    expect(state.pendingMessages.length).toBe(20);

    // Second call
    await processQueueDrafts(campaignId);
    state = repository.getState();
    
    // Should still be exactly 20, no duplicate drafts
    expect(state.pendingMessages.length).toBe(20);
  });

  it('Test 23 - Repository Send Idempotency', async () => {
    const campaignId = repository.getState().campaigns[0].id;
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    
    const state = repository.getState();
    const draft = state.pendingMessages[0];
    const now = new Date();
    const msg = {
      id: 'msg-test',
      conversationId: draft.conversationId,
      sender: 'USER' as const,
      content: draft.content,
      createdAt: now
    };

    // First send attempt directly to repo
    const sent1 = await repository.sendPreparedMessage(msg, draft.id, draft.queueEntryId, now);
    expect(sent1).toBe(true);

    // Second send attempt directly to repo with same draft and entry
    const sent2 = await repository.sendPreparedMessage(msg, draft.id, draft.queueEntryId, now);
    expect(sent2).toBe(false); // Already sent, draft doesn't exist or entry status changed

    const finalState = repository.getState();
    const sentMessages = finalState.messages.filter(m => m.id === 'msg-test');
    expect(sentMessages.length).toBe(1); // Only inserted once
  });

  it('Test 24 - Opportunity ID Policy', async () => {
    const state = repository.getState();
    const c1 = state.contacts[0];
    const tenantId = state.tenant.id;
    const now = new Date();

    const result = await repository.transitionOpportunityStage(c1.id, tenantId, 'RASCUNHO', now);
    expect(result.created).toBe(true);
    expect(result.opportunity.id.startsWith('opp-')).toBe(true);
    // UUID format check (8-4-4-4-12) after prefix
    const idPart = result.opportunity.id.slice(4);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(idPart)).toBe(true);
  });

  it('Test 25 - Same-batch Dispatch Queue Uniqueness', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const contactId = state.contacts[0].id;
    const now = new Date();

    const entries = [
      { id: 'uuid-1', campaignId, contactId, position: 1, status: 'QUEUED' as const, attempts: 0, createdAt: now },
      { id: 'uuid-2', campaignId, contactId, position: 2, status: 'QUEUED' as const, attempts: 0, createdAt: now }
    ];

    await repository.addDispatchQueueEntries(entries);
    
    const newState = repository.getState();
    const specificEntries = newState.dispatchQueue.filter(q => q.campaignId === campaignId && q.contactId === contactId);
    
    expect(specificEntries.length).toBe(1);
    expect(specificEntries[0].id).toBe('uuid-1');
  });

  it('Test 26 - Same-batch Pending Draft Uniqueness', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    await prepareCampaignQueue(campaignId);
    
    const queueEntry = repository.getState().dispatchQueue[0];
    const now = new Date();
    
    const updates = [{ id: queueEntry.id, status: 'DRAFT_PREPARED' as const, preparedAt: now }];
    const drafts = [
      { id: 'draft-1', contactId: queueEntry.contactId, campaignId: queueEntry.campaignId, queueEntryId: queueEntry.id, conversationId: 'c-1', content: 'A', createdAt: now },
      { id: 'draft-2', contactId: queueEntry.contactId, campaignId: queueEntry.campaignId, queueEntryId: queueEntry.id, conversationId: 'c-1', content: 'B', createdAt: now }
    ];

    await repository.prepareDrafts(updates, drafts);
    
    const newState = repository.getState();
    const draftsForEntry = newState.pendingMessages.filter(pm => pm.queueEntryId === queueEntry.id);
    
    expect(draftsForEntry.length).toBe(1);
    expect(draftsForEntry[0].id).toBe('draft-1');
  });

  it('Test 27 - Invalid Reply Transition', async () => {
    const campaignId = repository.getState().campaigns[0].id;
    await prepareCampaignQueue(campaignId);
    await processQueueDrafts(campaignId);
    
    const state = repository.getState();
    const draft = state.pendingMessages[0];
    const qEntry = state.dispatchQueue.find(q => q.id === draft.queueEntryId)!;
    const now = new Date();
    
    expect(qEntry.status).toBe('DRAFT_PREPARED');
    
    const msg = {
      id: 'msg-reply',
      conversationId: draft.conversationId,
      sender: 'CONTACT' as const,
      content: 'Hello',
      createdAt: now
    };

    // Tenta transitar DRAFT_PREPARED -> REPLIED (não deve funcionar)
    await repository.processClientResponse(msg, draft.conversationId, now, qEntry.id, now);
    
    let checkState = repository.getState();
    expect(checkState.dispatchQueue.find(q => q.id === qEntry.id)?.status).toBe('DRAFT_PREPARED');

    // Envia corretamente
    const systemMsg = { ...msg, sender: 'USER' as const, id: 'msg-sys' };
    await repository.sendPreparedMessage(systemMsg, draft.id, qEntry.id, now);
    
    checkState = repository.getState();
    expect(checkState.dispatchQueue.find(q => q.id === qEntry.id)?.status).toBe('SENT');

    // Agora sim simula resposta
    await repository.processClientResponse(msg, draft.conversationId, now, qEntry.id, now);
    
    checkState = repository.getState();
    expect(checkState.dispatchQueue.find(q => q.id === qEntry.id)?.status).toBe('REPLIED');
  });

  it('Test 28 - Draft Queue Referential Integrity', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const now = new Date();
    
    // We need two QueueEntries and two Drafts. Let's create them directly.
    const q1Id = 'q1-test';
    const q2Id = 'q2-test';
    const c1Id = state.contacts[0].id;
    const c2Id = state.contacts[1].id;
    
    await repository.addDispatchQueueEntries([
      { id: q1Id, campaignId, contactId: c1Id, position: 1, status: 'QUEUED', attempts: 0, createdAt: now },
      { id: q2Id, campaignId, contactId: c2Id, position: 2, status: 'QUEUED', attempts: 0, createdAt: now }
    ]);
    
    const conv1 = state.conversations.find(c => c.contactId === c1Id)!;
    const conv2 = state.conversations.find(c => c.contactId === c2Id)!;
    
    const d1Id = 'd1-test';
    const d2Id = 'd2-test';
    
    await repository.prepareDrafts([
      { id: q1Id, status: 'DRAFT_PREPARED', preparedAt: now },
      { id: q2Id, status: 'DRAFT_PREPARED', preparedAt: now }
    ], [
      { id: d1Id, contactId: c1Id, campaignId, queueEntryId: q1Id, conversationId: conv1.id, content: 'A', createdAt: now },
      { id: d2Id, contactId: c2Id, campaignId, queueEntryId: q2Id, conversationId: conv2.id, content: 'B', createdAt: now }
    ]);
    
    const msg = {
      id: 'msg-test-28',
      conversationId: conv1.id,
      sender: 'USER' as const,
      content: 'A',
      createdAt: now
    };
    
    // Attempt incorrect binding: d1 + q2
    const sentBad = await repository.sendPreparedMessage(msg, d1Id, q2Id, now);
    expect(sentBad).toBe(false);
    
    let checkState = repository.getState();
    expect(checkState.pendingMessages.find(pm => pm.id === d1Id)).toBeDefined();
    expect(checkState.pendingMessages.find(pm => pm.id === d2Id)).toBeDefined();
    expect(checkState.dispatchQueue.find(q => q.id === q1Id)?.status).toBe('DRAFT_PREPARED');
    expect(checkState.dispatchQueue.find(q => q.id === q2Id)?.status).toBe('DRAFT_PREPARED');
    
    // Attempt correct binding: d1 + q1
    const sentGood = await repository.sendPreparedMessage(msg, d1Id, q1Id, now);
    expect(sentGood).toBe(true);
    
    checkState = repository.getState();
    expect(checkState.pendingMessages.find(pm => pm.id === d1Id)).toBeUndefined();
    expect(checkState.dispatchQueue.find(q => q.id === q1Id)?.status).toBe('SENT');
    
    expect(checkState.pendingMessages.find(pm => pm.id === d2Id)).toBeDefined();
    expect(checkState.dispatchQueue.find(q => q.id === q2Id)?.status).toBe('DRAFT_PREPARED');
  });

  it('Test 29 - Draft Conversation Referential Integrity', async () => {
    const state = repository.getState();
    const campaignId = state.campaigns[0].id;
    const now = new Date();
    
    const q1Id = 'q3-test';
    const c1Id = state.contacts[0].id;
    const c2Id = state.contacts[1].id;
    
    await repository.addDispatchQueueEntries([
      { id: q1Id, campaignId, contactId: c1Id, position: 1, status: 'QUEUED', attempts: 0, createdAt: now },
    ]);
    
    const conv1 = state.conversations.find(c => c.contactId === c1Id)!;
    const conv2 = state.conversations.find(c => c.contactId === c2Id)!; // belongs to different contact
    
    const d1Id = 'd3-test';
    
    await repository.prepareDrafts([
      { id: q1Id, status: 'DRAFT_PREPARED', preparedAt: now },
    ], [
      { id: d1Id, contactId: c1Id, campaignId, queueEntryId: q1Id, conversationId: conv1.id, content: 'A', createdAt: now },
    ]);
    
    // Attempt incorrect conversation binding
    const badMsg = {
      id: 'msg-test-29',
      conversationId: conv2.id, // incorrect
      sender: 'USER' as const,
      content: 'A',
      createdAt: now
    };
    
    const sentBad = await repository.sendPreparedMessage(badMsg, d1Id, q1Id, now);
    expect(sentBad).toBe(false);
    
    let checkState = repository.getState();
    expect(checkState.pendingMessages.find(pm => pm.id === d1Id)).toBeDefined();
    expect(checkState.dispatchQueue.find(q => q.id === q1Id)?.status).toBe('DRAFT_PREPARED');
    
    // Attempt correct conversation binding
    const goodMsg = {
      ...badMsg,
      conversationId: conv1.id
    };
    
    const sentGood = await repository.sendPreparedMessage(goodMsg, d1Id, q1Id, now);
    expect(sentGood).toBe(true);
    
    checkState = repository.getState();
    expect(checkState.pendingMessages.find(pm => pm.id === d1Id)).toBeUndefined();
    expect(checkState.dispatchQueue.find(q => q.id === q1Id)?.status).toBe('SENT');
  });
});
