import { describe, expect, it } from 'vitest';
import { findFaq } from '../src/data/faq';

describe('privacy-model FAQ', () => {
  it('describes Aztec private state as note-based rather than account-based', () => {
    const faq = findFaq('UTXO vs account model: which is better for privacy?');
    const answer = faq?.a.join(' ') ?? '';

    expect(answer).toContain("Aztec's private state");
    expect(answer).toContain('notes and nullifiers');
    expect(answer).toContain('public contract state');
    expect(answer).not.toContain('Account-based privacy (Aztec');
  });
});
