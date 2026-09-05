import type { GatewayProcessResult } from '../contracts';
import type { DurableIdempotencyStore } from '../idempotency';
import { processLiveWebhookRequest } from '../inbound';
import { createOpaqueGatewayId } from '../normalization';
import { createLiveWebhookRequest, type RawWebhookRequest } from '../rawWebhook';
import type { ContactIdentityResolver, ConversationResolver } from '../resolution';
import { isSecretRef, type SecretResolver } from '../secrets';
import { WhatsAppMetaOfficialWebhookDecoder } from './metaOfficialProtocol';
import {
  evaluateMetaHandshake, MetaWebhookAuthenticator, MetaWebhookHandshakeVerifier,
  type MetaWebhookSecurityConfig
} from './metaWebhookSecurity';
import { WhatsAppMetaOfflineAdapter } from './whatsapp-meta';

export interface MetaWebhookRuntimeDependencies {
  config: MetaWebhookSecurityConfig;
  secretResolver?: SecretResolver;
  idempotencyStore: DurableIdempotencyStore;
  contactIdentityResolver: ContactIdentityResolver;
  conversationResolver: ConversationResolver;
  /** Local lease policy; not a provider timeout. */
  leaseDurationMs: number;
  clock?: () => number;
}

export interface MetaWebhookAudit {
  event: 'META_WEBHOOK_REQUEST' | 'META_WEBHOOK_HANDSHAKE' | 'META_WEBHOOK_SIGNATURE';
  requestId: string;
  correlationId: string;
  provider: 'WHATSAPP_META_OFFICIAL';
  method: 'GET' | 'POST' | 'OTHER';
  result: string;
  reason: string;
  timestamp: string;
  durationMs: number;
  duplicate: boolean;
}

export interface MetaWebhookHttpResult {
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: string;
  /** Transient internal result, never HTTP-serialized or logged in its entirety. */
  processingResult?: GatewayProcessResult;
  audit: readonly MetaWebhookAudit[];
}

function validConfig(config: MetaWebhookSecurityConfig): boolean {
  return !!config && Object.keys(config).every((key) =>
    ['appSecretRef', 'verifyTokenRef', 'maxWebhookBodyBytes'].includes(key)) &&
    Number.isSafeInteger(config.maxWebhookBodyBytes) && config.maxWebhookBodyBytes > 0 &&
    (config.appSecretRef === undefined || isSecretRef(config.appSecretRef)) &&
    (config.verifyTokenRef === undefined || isSecretRef(config.verifyTokenRef));
}

/** Offline HTTP-shaped boundary. No runtime, I/O, or downstream worker is started. */
export function handleMetaWebhookRequest(
  input: RawWebhookRequest,
  dependencies: MetaWebhookRuntimeDependencies
): MetaWebhookHttpResult {
  const clock = dependencies.clock ?? Date.now;
  const startedAt = clock();
  // Ignore externally supplied IDs, which could contain addresses or body data.
  const requestId = createOpaqueGatewayId('request');
  const correlationId = createOpaqueGatewayId('correlation');
  const method = input.method === 'GET' || input.method === 'POST' ? input.method : 'OTHER';
  const timestamp = new Date(startedAt).toISOString();
  const audits: MetaWebhookAudit[] = [];
  const audit = (event: MetaWebhookAudit['event'], result: string, reason: string, duplicate = false) => {
    audits.push({ event, requestId, correlationId, provider: 'WHATSAPP_META_OFFICIAL',
      method, result, reason, timestamp, durationMs: Math.max(0, clock() - startedAt), duplicate });
  };
  const finish = (statusCode: number, result: string, reason: string,
    body = '', processingResult?: GatewayProcessResult): MetaWebhookHttpResult => {
    audit('META_WEBHOOK_REQUEST', result, reason, processingResult?.outcome === 'DUPLICATE');
    return {
      statusCode, headers: { 'content-type': 'text/plain; charset=utf-8',
        ...(statusCode === 405 ? { allow: 'GET, POST' } : {}) },
      body, processingResult, audit: audits
    };
  };
  if (method === 'OTHER') return finish(405, 'REJECTED', 'METHOD_NOT_ALLOWED');
  if (!validConfig(dependencies.config) || !Number.isFinite(dependencies.leaseDurationMs) ||
    dependencies.leaseDurationMs <= 0) {
    return finish(503, 'NOT_CONFIGURED', 'SECURITY_POLICY_NOT_CONFIGURED');
  }
  if (input.trustMode !== 'LIVE_UNTRUSTED') return finish(403, 'REJECTED', 'INVALID_TRUST_MODE');
  // Size precedes body copies, content checks, auth, and JSON parsing.
  if (method === 'POST' && input.rawBody.byteLength > dependencies.config.maxWebhookBodyBytes) {
    return finish(413, 'REJECTED', 'PAYLOAD_TOO_LARGE');
  }
  try {
    // Snapshot before invoking dependencies; GET never consumes the event body.
    const request = createLiveWebhookRequest({ ...input, requestId,
      rawBody: method === 'GET' ? new Uint8Array() : input.rawBody });
    if (method === 'GET') {
      const handshake = evaluateMetaHandshake(request,
        new MetaWebhookHandshakeVerifier(dependencies.config.verifyTokenRef, dependencies.secretResolver));
      audit('META_WEBHOOK_HANDSHAKE', handshake.status, handshake.reason);
      return finish(handshake.statusCode, handshake.status, handshake.reason, handshake.body);
    }
    const contentType = request.headers['content-type'];
    // Local JSON fixture policy: optional UTF-8 charset, no lists or other parameters.
    if (typeof contentType !== 'string' ||
      !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) {
      return finish(415, 'REJECTED', 'UNSUPPORTED_CONTENT_TYPE');
    }
    const authenticator = new MetaWebhookAuthenticator(dependencies.config.appSecretRef, dependencies.secretResolver);
    // Reuse the fail-closed pipeline, including its auth-before-decode boundary.
    let authenticationReason = 'WEBHOOK_AUTH_REJECTED';
    let authenticationStatus = 'REJECTED';
    const processingResult = processLiveWebhookRequest({
      request, adapter: new WhatsAppMetaOfflineAdapter(),
      authenticator: {
        provider: authenticator.provider, status: authenticator.status,
        verify: (raw) => {
          const result = authenticator.verify(raw);
          authenticationReason = result.reasonCode;
          authenticationStatus = result.status;
          audit('META_WEBHOOK_SIGNATURE', result.status, result.reasonCode);
          return result;
        }
      },
      liveDecoder: new WhatsAppMetaOfficialWebhookDecoder(),
      idempotencyStore: dependencies.idempotencyStore,
      contactIdentityResolver: dependencies.contactIdentityResolver,
      conversationResolver: dependencies.conversationResolver,
      ownerId: correlationId, now: new Date(startedAt), leaseDurationMs: dependencies.leaseDurationMs
    });
    if (authenticationStatus !== 'VERIFIED') {
      return finish(authenticationStatus === 'NOT_CONFIGURED' ? 503 : 403,
        authenticationStatus, authenticationReason, '', processingResult);
    }
    if (processingResult.outcome === 'REJECTED') {
      // Errors are fixed local policy codes; exception messages never become response data.
      const reason = processingResult.audit.reasonCode;
      const statusCode = ['MALFORMED_REQUEST', 'INVALID_EVENT', 'UNSUPPORTED_EVENT'].includes(reason) ? 400 : 503;
      return finish(statusCode, 'REJECTED', reason, '', processingResult);
    }
    return finish(200, processingResult.outcome, processingResult.audit.reasonCode, '', processingResult);
  } catch {
    return finish(503, 'REJECTED', 'REQUEST_PROCESSING_FAILED');
  }
}
