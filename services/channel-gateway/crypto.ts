import { createHmac, timingSafeEqual } from 'node:crypto';

export interface DigestVerificationInput {
  rawBody: Uint8Array;
  presentedDigest: Uint8Array;
}

export interface DigestVerifier {
  verify(input: DigestVerificationInput): boolean;
}

/**
 * Provider-neutral primitive only. Algorithm, encoding, and header decoding are
 * adapter responsibilities after official protocol verification.
 */
export class InjectedHmacDigestVerifier implements DigestVerifier {
  private readonly secretBytes: Uint8Array;

  constructor(
    private readonly algorithm: string,
    secret: Uint8Array
  ) {
    if (algorithm.trim().length === 0 || secret.byteLength === 0) {
      throw new Error('INVALID_DIGEST_CONFIGURATION');
    }
    this.secretBytes = new Uint8Array(secret);
  }

  verify(input: DigestVerificationInput): boolean {
    const expected = createHmac(this.algorithm, this.secretBytes).update(input.rawBody).digest();
    return expected.byteLength === input.presentedDigest.byteLength &&
      timingSafeEqual(expected, input.presentedDigest);
  }
}
