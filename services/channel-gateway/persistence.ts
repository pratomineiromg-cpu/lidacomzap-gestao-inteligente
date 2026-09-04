import type { DurableIdempotencyStore } from './idempotency';
import type { OutboundQueue } from './outboundQueue';
import type { ContactIdentityResolver, ConversationResolver } from './resolution';

/** Technology-neutral server persistence ports; no implementation is selected. */
export interface ChannelGatewayPersistencePorts {
  idempotency: DurableIdempotencyStore;
  contactIdentities: ContactIdentityResolver;
  conversations: ConversationResolver;
  outboundQueue: OutboundQueue;
}
