export type WebhookVerificationResult = 'VERIFIED' | 'REJECTED' | 'NOT_CONFIGURED';

export interface WebhookVerificationInput {
  rawBody: string;
  headers: Readonly<Record<string, string>>;
}

export interface WebhookAuthenticator {
  readonly status: 'NOT_CONFIGURED' | 'CONFIGURED';
  verify(input: WebhookVerificationInput): WebhookVerificationResult;
}

/** Explicit future boundary. It does not simulate production verification. */
export class UnconfiguredWebhookAuthenticator implements WebhookAuthenticator {
  readonly status = 'NOT_CONFIGURED' as const;

  verify(_input: WebhookVerificationInput): WebhookVerificationResult {
    return 'NOT_CONFIGURED';
  }
}
