import type { ChannelProvider, CommunicationChannel } from '../../src/domain/omnichannel';

export interface ContactIdentityResolutionRequest {
  provider: ChannelProvider;
  channel: CommunicationChannel;
  /** Transient PII: never log, persist, or use as an internal/idempotency ID here. */
  externalAddress: string;
  providerIdentityId?: string;
}

export type ContactIdentityResolutionResult =
  | { status: 'RESOLVED_EXISTING'; contactId: string; contactIdentityId: string }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS' }
  | { status: 'REJECTED'; reasonCode: string };

export interface ContactIdentityResolver {
  resolve(request: ContactIdentityResolutionRequest): ContactIdentityResolutionResult;
}

export interface ConversationResolutionRequest {
  contactId: string;
  provider: ChannelProvider;
  channel: CommunicationChannel;
  externalConversationId?: string;
}

export type ConversationResolutionResult =
  | { status: 'RESOLVED_EXISTING'; conversationId: string }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS' }
  | { status: 'REJECTED'; reasonCode: string };

export interface ConversationResolver {
  resolve(request: ConversationResolutionRequest): ConversationResolutionResult;
}

export function mayContinueAfterIdentityResolution(
  result: ContactIdentityResolutionResult
): result is Extract<ContactIdentityResolutionResult, { status: 'RESOLVED_EXISTING' }> {
  return result.status === 'RESOLVED_EXISTING';
}

export function mayContinueAfterConversationResolution(
  result: ConversationResolutionResult
): result is Extract<ConversationResolutionResult, { status: 'RESOLVED_EXISTING' }> {
  return result.status === 'RESOLVED_EXISTING';
}
