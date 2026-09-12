import { createGatewayCommand } from './command';
import { isGatewayErrorCode, type GatewayCommand, type GatewayErrorCode, type NormalizedChannelEvent } from './contracts';
import { GatewayError } from './errors';
import type { InboundWorkItem, InboundWorkQueue } from './ingress';
import type { ContactIdentityResolver, ConversationResolver } from './resolution';
import type { RetryPolicyInput } from './retryPolicy';

export interface InboundWorkReferenceResolvers {
  contactIdentityResolver: ContactIdentityResolver;
  conversationResolver: ConversationResolver;
}

/** Existing references only; this boundary never creates a Contact or Conversation. */
export interface ResolvedInboundWorkReferences {
  contactId: string;
  contactIdentityId: string;
  conversationId: string;
}

/**
 * Resolves only inbound-message references after work has been leased. Status
 * and provider-state commands do not require CRM identity resolution.
 */
export function resolveInboundWorkReferences(
  event: NormalizedChannelEvent,
  dependencies: InboundWorkReferenceResolvers
): ResolvedInboundWorkReferences | undefined {
  if (event.eventType !== 'INBOUND_MESSAGE') return undefined;

  const externalAddress = event.payload.providerAddress;
  if (!externalAddress) throw new GatewayError('IDENTITY_REJECTED');

  const identity = dependencies.contactIdentityResolver.resolve({
    provider: event.provider,
    channel: event.channel,
    externalAddress
  });
  if (identity.status !== 'RESOLVED_EXISTING') {
    if (identity.status === 'NOT_FOUND') throw new GatewayError('IDENTITY_NOT_FOUND');
    if (identity.status === 'AMBIGUOUS') throw new GatewayError('IDENTITY_AMBIGUOUS');
    throw new GatewayError('IDENTITY_REJECTED');
  }

  const conversation = dependencies.conversationResolver.resolve({
    contactId: identity.contactId,
    provider: event.provider,
    channel: event.channel,
    externalConversationId: event.payload.externalConversationId
  });
  if (conversation.status !== 'RESOLVED_EXISTING') {
    if (conversation.status === 'NOT_FOUND') throw new GatewayError('CONVERSATION_NOT_FOUND');
    if (conversation.status === 'AMBIGUOUS') throw new GatewayError('CONVERSATION_AMBIGUOUS');
    throw new GatewayError('CONVERSATION_REJECTED');
  }

  return {
    contactId: identity.contactId,
    contactIdentityId: identity.contactIdentityId,
    conversationId: conversation.conversationId
  };
}

/**
 * The handler is an injected downstream boundary. The gateway supplies no
 * implementation, so this module cannot write CRM data or call a provider.
 */
export interface InboundCommandHandler {
  handle(execution: InboundCommandExecution): InboundCommandHandlingResult;
}

/** Sensitive command data stays in-process and is never returned by worker results. */
export interface InboundCommandExecution {
  workItemId: string;
  idempotencyKey: string;
  attempt: number;
  command: GatewayCommand;
  resolvedReferences?: ResolvedInboundWorkReferences;
}

export type InboundCommandHandlingResult =
  | { status: 'COMPLETED' }
  | { status: 'RETRYABLE_FAILURE'; reasonCode: GatewayErrorCode }
  | { status: 'FINAL_FAILURE'; reasonCode: GatewayErrorCode };

export interface InboundWorkerStepInput extends InboundWorkReferenceResolvers {
  queue: InboundWorkQueue;
  commandHandler: InboundCommandHandler;
  ownerId: string;
  now: Date;
  leaseDurationMs: number;
  retryPolicy: Omit<RetryPolicyInput, 'attempt' | 'retryability'>;
}

export type InboundWorkerStepStatus =
  | 'COMPLETED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FINAL'
  | 'NOT_AVAILABLE'
  | 'ACKNOWLEDGMENT_UNCONFIRMED'
  | 'STATE_TRANSITION_UNCONFIRMED';

export type InboundWorkerReasonCode =
  | GatewayErrorCode
  | 'EVENT_ACCEPTED'
  | 'WORK_NOT_AVAILABLE'
  | 'COMMAND_HANDLER_FAILED'
  | 'ACKNOWLEDGMENT_UNCONFIRMED'
  | 'STATE_TRANSITION_UNCONFIRMED';

/** Safe, payload-free result for one deterministic worker claim/processing step. */
export interface InboundWorkerStepResult {
  status: InboundWorkerStepStatus;
  reasonCode: InboundWorkerReasonCode;
  workItemId?: string;
  commandType?: GatewayCommand['type'];
}

function assertValidWorkerInput(input: InboundWorkerStepInput): void {
  const { retryPolicy } = input;
  if (
    input.ownerId.trim().length === 0 ||
    Number.isNaN(input.now.getTime()) ||
    !Number.isFinite(input.leaseDurationMs) ||
    input.leaseDurationMs <= 0 ||
    !Number.isInteger(retryPolicy.maxAttempts) ||
    retryPolicy.maxAttempts < 1 ||
    !Number.isFinite(retryPolicy.baseDelayMs) ||
    retryPolicy.baseDelayMs < 0 ||
    !Number.isFinite(retryPolicy.maxDelayMs) ||
    retryPolicy.maxDelayMs < 0
  ) {
    throw new Error('INVALID_INBOUND_WORKER_INPUT');
  }
}

function validHandlerResult(result: unknown): result is InboundCommandHandlingResult {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const candidate = result as { status?: unknown; reasonCode?: unknown };
  if (candidate.status === 'COMPLETED') return true;
  return (
    (candidate.status === 'RETRYABLE_FAILURE' || candidate.status === 'FINAL_FAILURE') &&
    isGatewayErrorCode(candidate.reasonCode)
  );
}

function failureResult(
  workItem: InboundWorkItem,
  input: InboundWorkerStepInput,
  reasonCode: InboundWorkerReasonCode
): InboundWorkerStepResult {
  try {
    const updated = input.queue.nack(
      workItem.workItemId,
      input.ownerId,
      input.now,
      reasonCode,
      input.retryPolicy
    );
    return {
      status: updated.state === 'FAILED_RETRYABLE' ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
      reasonCode,
      workItemId: workItem.workItemId
    };
  } catch {
    return {
      status: 'STATE_TRANSITION_UNCONFIRMED',
      reasonCode: 'STATE_TRANSITION_UNCONFIRMED',
      workItemId: workItem.workItemId
    };
  }
}

function finalFailureResult(
  workItem: InboundWorkItem,
  input: InboundWorkerStepInput,
  reasonCode: GatewayErrorCode
): InboundWorkerStepResult {
  try {
    input.queue.failFinal(workItem.workItemId, input.ownerId, input.now, reasonCode);
    return { status: 'FAILED_FINAL', reasonCode, workItemId: workItem.workItemId };
  } catch {
    return {
      status: 'STATE_TRANSITION_UNCONFIRMED',
      reasonCode: 'STATE_TRANSITION_UNCONFIRMED',
      workItemId: workItem.workItemId
    };
  }
}

function processReservedWorkItem(
  workItem: InboundWorkItem,
  input: InboundWorkerStepInput
): InboundWorkerStepResult {
  let command: GatewayCommand;
  try {
    const resolvedReferences = resolveInboundWorkReferences(workItem.event, input);
    command = createGatewayCommand(workItem.event);
    const handling = input.commandHandler.handle({
      workItemId: workItem.workItemId,
      idempotencyKey: workItem.idempotencyKey,
      attempt: workItem.attempt,
      command,
      ...(resolvedReferences ? { resolvedReferences } : {})
    });
    if (!validHandlerResult(handling)) throw new Error('INVALID_COMMAND_HANDLER_RESULT');

    if (handling.status === 'RETRYABLE_FAILURE') {
      return failureResult(workItem, input, handling.reasonCode);
    }
    if (handling.status === 'FINAL_FAILURE') {
      return finalFailureResult(workItem, input, handling.reasonCode);
    }
  } catch (error) {
    return failureResult(
      workItem,
      input,
      error instanceof GatewayError ? error.code : 'COMMAND_HANDLER_FAILED'
    );
  }

  try {
    input.queue.ack(workItem.workItemId, input.ownerId, input.now);
    return {
      status: 'COMPLETED',
      reasonCode: 'EVENT_ACCEPTED',
      workItemId: workItem.workItemId,
      commandType: command.type
    };
  } catch {
    // A real adapter may be uncertain after a crash at the acknowledgement boundary.
    // The injected handler receives the idempotency key so it can tolerate replay.
    return {
      status: 'ACKNOWLEDGMENT_UNCONFIRMED',
      reasonCode: 'ACKNOWLEDGMENT_UNCONFIRMED',
      workItemId: workItem.workItemId,
      commandType: command.type
    };
  }
}

/**
 * Executes at most one atomically claimed work item. It has no timer, loop,
 * network client, persistence implementation, or provider-specific behavior.
 */
export function dispatchNextInboundWorkItem(input: InboundWorkerStepInput): InboundWorkerStepResult {
  assertValidWorkerInput(input);
  const reserved = input.queue.reserveNext({
    ownerId: input.ownerId,
    now: input.now,
    leaseDurationMs: input.leaseDurationMs
  });
  if (reserved.status !== 'RESERVED') {
    return { status: 'NOT_AVAILABLE', reasonCode: 'WORK_NOT_AVAILABLE' };
  }
  return processReservedWorkItem(reserved.record, input);
}
