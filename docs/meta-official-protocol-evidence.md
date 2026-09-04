# Meta Official Protocol Evidence

Verification date: 2026-09-04

This document records only the official-source facts supplied for F1B-08. It
does not add live configuration, credentials, network calls, or provider access.

## Sources

- Meta official Postman workspace: WhatsApp Business Platform.
- WhatsApp Cloud API: Webhook Payload Reference.
- WhatsApp Cloud API: Webhook Subscriptions.
- WhatsApp Cloud API: Override Callback URL.

## VERIFIED_OFFICIAL

| Fact | Classification |
|---|---|
| WhatsApp Cloud API is the official API for WhatsApp Business Platform. | VERIFIED_OFFICIAL |
| Webhooks are HTTP/HTTPS callbacks for events. | VERIFIED_OFFICIAL |
| Receiving Webhooks for a WABA requires the app to be subscribed to that WABA. | VERIFIED_OFFICIAL |
| A future public webhook callback requires HTTPS and a valid SSL certificate. | VERIFIED_OFFICIAL |
| The generic documented envelope uses `object = whatsapp_business_account`. | VERIFIED_OFFICIAL |
| The generic documented envelope has an `entry` array. | VERIFIED_OFFICIAL |
| Entries include `entry[].id`. | VERIFIED_OFFICIAL |
| Entries include a `changes` array. | VERIFIED_OFFICIAL |
| Changes include `changes[].value`. | VERIFIED_OFFICIAL |
| Message and status events use `changes[].field = messages`. | VERIFIED_OFFICIAL |
| `value.messaging_product` may be `whatsapp`. | VERIFIED_OFFICIAL |
| `value.metadata` may include `display_phone_number` and `phone_number_id`. | VERIFIED_OFFICIAL |
| Documented status values implemented in this phase are `sent`, `delivered`, `read`, and `failed`. | VERIFIED_OFFICIAL |
| Alternate callback URL configuration uses a `verify_token` concept. | VERIFIED_OFFICIAL |
| Subscription management uses management authentication. | VERIFIED_OFFICIAL |

## PENDING_OFFICIAL_SPEC_VERIFICATION

| Fact | Classification |
|---|---|
| Exact POST webhook signature header. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Exact live signature algorithm. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Exact canonicalization for signature verification. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Exact GET challenge protocol. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Exact challenge query keys. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Integral Coexistence behavior. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Message echo. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Contact sync. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| History sync. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Presence. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Catalog. | PENDING_OFFICIAL_SPEC_VERIFICATION |
| Specific limits not verified in this phase. | PENDING_OFFICIAL_SPEC_VERIFICATION |

## F1B-08 Implementation Boundary

The offline decoder accepts only the verified official envelope shape above plus
the minimal message/status fields required by the local gateway contract. It
does not configure Graph API subscription management, create a token, implement
the GET challenge, bind a Meta signature header, call a provider, or persist a
CRM entity.
