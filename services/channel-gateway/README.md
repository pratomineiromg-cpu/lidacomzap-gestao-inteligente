# Channel Gateway Offline Foundation

This directory is a server-side/offline boundary around the approved domain
contracts. The dependency direction is `channel-gateway -> src/domain`; domain,
repositories, and UI do not import this service.

The adapters accept only objects marked `synthetic: true`, normalize them to a
provider-neutral event, reserve a process-local idempotency key, produce a
provider-neutral command boundary, and return a sanitized audit record. They do
not create Contact, Conversation, Order, or any repository write.

`prepareOutbound` produces an in-memory `PREPARED` envelope from an existing
domain `RoutingDecision`. The gateway does not calculate or change routing and
has no delivery operation.

The simulator reads only JSON basenames from `simulator/fixtures`. It does not
open a port or expose an ingress process. Repeating a fixture in one command
proves process-local idempotency:

```powershell
npm run gateway:simulate -- --provider WHATSAPP_META_OFFICIAL --fixture whatsapp-inbound-text.json --repeat 2
```

Standard output is a sanitized audit event. It never contains the fixture's
address, message content, raw payload, or provider identifiers.

## Fixture policy

**FIXTURES ARE SYNTHETIC TEST DATA.** They contain only deliberately invented
addresses, opaque identifiers, and test text. They are not production payloads,
provider webhook samples, or customer data.

Provider capabilities are supplied explicitly to each adapter instance. Empty
configuration means no known capability. Normalizing an observed application
message does not claim that message echo is universally available.

The webhook authenticator remains `NOT_CONFIGURED`. Future verification,
persistent idempotency, queues, workers, ingress, observability, and runtime
deployment belong to later phases.
