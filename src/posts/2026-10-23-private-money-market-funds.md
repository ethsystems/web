---
layout: post
title: "Building Private Money Market Funds on Ethereum"
description: "Confidential fund shares on Ethereum, with a complete register of record."
date: 2026-10-23 15:00:00 +0200
author: "David"
image: ../assets/posts/2026-10-23-private-money-market-funds/hero.png
published: true
tags:
  - money-market-funds
  - tokenization
  - shielded-pool
  - transfer-agent
  - noir
  - zero-knowledge
  - proof-of-concept
map_refs:
  - private-money-market-funds
  - approach-private-money-market-funds
  - pattern-shielding
  - pattern-verifiable-attestation
  - pattern-regulatory-disclosure-keys-proofs
  - pattern-erc3643-rwa
  - pattern-mpc-custody
  - pattern-noir-private-contracts

---

Tokenized money market funds manage [billions](https://app.rwa.xyz/treasuries) on public blockchains. Institutions hold them as cash that earns a yield, and they already serve as collateral and as reserves behind stablecoins.

However, tokenized money market funds on Ethereum publish their shareholder books. Each holder's balance sits at a public address, and every subscription, redemption and daily yield payment is a public transfer. For an institution that parks its cash in the fund, that means publishing the size of its reserve and every time it moves.

Hiding the balances inside the token does not work for these funds, because the token's compliance rules read public state. The rail that enforces eligibility, whether [ERC-3643](https://eips.ethereum.org/EIPS/eip-3643) or [DS Protocol](https://github.com/securitize-io/dstoken), looks up the parties of every transfer in an investor registry, checks their country, and keeps count of how many investors the fund has. Encrypt the balances and those checks have nothing left to read.

At the same time, the fund cannot look away. Its transfer agent, the firm that processes the fund's subscriptions and redemptions, keeps the register of record: who owned how many shares on any given date, rebuilt without asking the holders for help. The fund relies on it to check eligibility, count investors against legal caps, and screen for sanctions and report for tax, among other compliance requirements. Whatever hides positions from the public has to leave them fully visible to the agent.

This proof of concept keeps the fund's token and its rules where they are, and moves the confidential holdings into a pool that holds the token on their behalf. It builds on our [Compliant Shielded Pools](/writeups/building-compliant-shielded-pools-on-ethereum/), where the same proof that transfers value also enforces the compliance policy. Here that proof also delivers the transfer agent's record of every note it creates, so the register cannot miss one.

## What we built

The pool is a single holder of the fund's public token. Behind it, every position is a note: a private record whose commitment, a hash of its contents, sits in a Merkle tree. To move a position, its owner proves the note's commitment is in the tree, retires the note, and creates new ones in its place. The transfer agent decides who may hold notes, by attesting eligible holders' keys in an on-chain attestation registry, and it keeps the fund's register of who owns how much. Transfers, the agent's included, go to the pool through a relayer (not shown in the diagram), which pays the gas and cannot alter a proof.

![The investor’s wallet, with its custodian’s signer, sends transfer and withdraw proofs to the pool, which holds the fund’s public token and moves it with transferFrom and transfer. The fund reinvests its income into the token daily. The transfer agent sends the pool hand-out and claim proofs, the daily deposit and withdrawal, and the attestation root, and receives the register feed, encrypted to it and checked by the proof.](../assets/posts/2026-10-23-private-money-market-funds/system.svg)

Only attested owners can receive and spend notes: a proof that creates a note for a new owner, or that spends a note on its owner's authority, proves that the owner's attestation is current. Attestations expire, so the agent revokes one simply by not renewing it. In case quick action is needed, the agent can freeze the holder's notes instead. The fund's caps on investor numbers are enforced by the agent when it attests, counting public and confidential holders together, so an investor counts once however it holds.

Issuance and redemption run through the transfer agent. Investors pay cash off-chain, as they already do. Once a day the agent deposits the day's total into the pool in one public deposit, then splits it into one note per order with a tree of ordinary shielded transfers, which look like any other transfer. Redemption runs the other way: a holder transfers its note to the agent, and the agent withdraws the day's total.

The proof of concept rests on a few main ideas.

**Notes hold units, and the pool prices them.** A note does not hold the fund's shares. It holds units of the pool, and each unit is worth a number of fund shares that the pool derives from its own token balance. When the fund reinvests its daily income, the pool's balance grows and each unit is worth more.

**Note spends use a custodian model.** The key that moves a note is an ordinary ECDSA key, the kind a custodian's HSM or MPC signer already holds for most institutions. The circuit checks its signature, so the key never leaves the custodian's signer, and an institution keeps its signer and its approvals, adding one check before it signs.

**The agent can read every note and act on any of them.** These are the two powers the fund's compliance rests on. Every proof that creates a note also encrypts it to the transfer agent, and the circuit checks that encryption, so no note can be created that the agent cannot read. We call this the register feed. A second path through the transfer circuit, the claim path, is authorized by the agent's own key and re-creates a note under a lock or for a different owner, which is how the agent freezes, releases and seizes. For observers, a claim looks like any other transfer.

The [specification and code](https://github.com/ethsystems/pocs/tree/master/pocs/private-mmf/shielded-notes) are public, from the circuits and contracts to the Rust wallet and transfer agent. The end-to-end flows run with real proofs, and the costs quoted below come from a test anyone can rerun. The code also puts our own toolkit to work: each recipient's note is sealed with [sealring](/writeups/building-blocks-sealring/), and the wallet and the transfer agent keep their copies of the pool's Merkle trees in [rotortree](/writeups/building-blocks-rotortree/), two libraries we built and wrote up in our building-blocks series.

## The register is the ledger, decrypted

A transfer agent's register has to be complete. It is the record a regulator, an auditor or a court relies on for who owned the fund on a given date, and in several registered tokenized funds the on-chain ledger is part of that official record. A confidential ledger that the agent can mostly read is not a register.

Shielded pools usually give an auditor viewing capabilities through a copy of each note that the sender encrypts to the auditor. When that copy travels beside the proof instead of inside it, the sender can attach any ciphertext and the note still lands in the tree. The pool cannot tell, because it never sees the plaintext. A holder who expects a freeze can then move its position into a note the agent cannot read, leaving a gap in the register that the agent may not notice.

Here the copy is part of what the proof proves. The circuit that builds an output note also derives an encryption key from the agent's public register key, which the pool supplies, and computes the ciphertext from the same private values that go into the note's commitment. The ciphertext is a public input. A valid proof therefore carries the ciphertext of exactly the note it created, and a proof with any other ciphertext fails verification.

![One proof goes from the sender’s wallet to the pool, and three parties see three different things. The public observer sees commitments and nullifiers, so only that a transfer happened. The recipient gets its own note, through a payload encrypted to it. The transfer agent gets both new notes, through the register feed, encrypted to it and checked by the proof.](../assets/posts/2026-10-23-private-money-market-funds/three-views.svg)

*One transfer, three views. The same proof tells the public only that a transfer happened, gives the recipient its new note, and gives the transfer agent every note the transfer creates, through a feed the proof itself checks. The agent recognizes the spent notes by their nullifiers.*

This lets the agent rebuild its register from the chain and its own records, with no help from the holders. It decrypts every feed with its register key and recognizes each spent note by its nullifier, the tag a spend publishes, using the nullifier keys holders give it at onboarding. That gives it the register at any block. The terms of a lock travel in the same ciphertext, so frozen notes and notes in a holding period come back with their conditions.

Checking the register feed in the proof means the agent no longer has to trust the sender to encrypt the right note, and no one else has to check the encryption. The cost is extra data for every note: the ciphertext goes into the proof as public inputs, and the pool emits it in the transfer's event. With the verifier this pool uses, extra public inputs are cheap.

## Yield without touching the notes

A money market fund earns every day. A stable-NAV fund on Ethereum typically pays that yield as new shares minted to every holder's address, and the pool in this proof of concept is built for a fund that does so daily. An alternative design where the pool paid each day's yield as new shares in every note would need a new note for every holder every day, and a proof that the shares were split fairly among notes nobody can see.

The pool avoids this by never storing shares in a note. It counts the total units `U` across all notes, reads its own token balance `B`, and derives the multiplier `m = B/U`, the number of shares one unit is worth. The fund's reinvestment mints shares to the pool's address, just as it does for any public holder. `B` grows, `U` does not, and `m` rises for every note at once. This is the exchange-rate model DeFi already relies on, as in wrapped stETH and ERC-4626 vaults: a holder's units stay fixed, and what each unit is worth grows.

Take a note of 100 units in a pool where `m` is 1.00. It is worth 100 shares. After a year at 5%, `m` is about 1.05, and the same note withdraws about 105 shares. No transaction touched it. A holder's yield is its units times the change in `m`, and since its units are hidden, so is its yield. Locked notes accrue the same way.

Deposits round up and withdrawals round down, both in the pool's favour, which keeps `m` from falling as holders come and go. The rounding leaves less than a millionth of a share per note behind in the pool. Only the agent can compute that remainder, from its register, and it reports it at reconciliation. The agent's daily deposit lands after the fund's reinvestment for that day, so units issued on a given day do not share that day's yield.

`m` can still fall if shares leave the pool some other way. A fund's token usually lets the issuer force-transfer or burn any holder's shares, and used on the pool, such a power would hit every confidential holder at once. The token has to exempt the pool, or the issuer has to commit in the fund's documents never to use it there. If it happens anyway, the pool halts. Deposits and withdrawals stop until `m` is back at its last level and governance, under a timelock, clears the halt.

Once the pool halts, it stays halted until governance acts, even as the next day's reinvestment raises `m` again, so a loss never disappears quietly into the yield. Outflows too small to trip the on-chain check, under one day's yield, are caught off-chain. The agent sees every token transfer out of the pool that is not a withdrawal, and it alerts governance, which asks the issuer to return the shares, and the guardian, which can pause the pool in the meantime.

## Keys a custodian can hold

Custodians keep their clients' keys in HSMs and MPC signers, which sign what a policy engine approves. Many of those signers sign only raw digests on a standard curve. The pool asks for no more than a 32-byte digest signed on secp256k1. A signer that hashes the message on its own side would need that hash in the circuit, which is not built.

A note's owner is a single field element, the owner value, which is the pool's version of an Ethereum address. The owner value is computed as the hash of the spend key, an ECDSA key on secp256k1 that never leaves the custodian's signer, and the nullifier key, a random value that the holder's wallet keeps and that derives the nullifier marking a note as spent. The owner value sits, hidden, inside every note the holder owns. At onboarding, the holder gives the transfer agent its public spend key and its nullifier key, and the agent computes the owner value itself and records it against the investor ID it assigned. A holder can register more than one owner value; they look unrelated on-chain, and only the agent's record ties them together.

A spend is authorized by the spend key's signature over a transaction plan: a 32-byte digest of the chain, the pool, the operation, the path (the owner's or the agent's), the notes spent, the notes created, any amount entering or leaving the pool and where it goes, and an expiry. The circuit verifies the signature, so neither the key nor the signature appears on-chain, and nothing links a holder's spends to each other. That check takes about 42,500 gates, half of the deposit circuit and a fifth of the transfer circuit.

The wallet builds the proof, so a compromised wallet could ask the signer to approve a payment to itself. Since the plan covers the notes created, the custody platform can catch that, as long as it never signs a digest it is handed. The specification requires it to rebuild the digest from the plan's fields and the output notes, check the owners and amounts against what it approves, and sign only what it computed itself.

Even the expiry stays private. A public expiry would show when each plan was signed. An MPC approval that takes hours would then set a custodian's clients apart from the agent's instant signatures. The circuit checks the expiry against the current day instead.

The transfer agent can recognize every spend, since onboarding gives it every investor's nullifier key. However, the agent can't use it to spend. A holder's notes move only under its own spend key, which stays with the custodian, or under the agent's claim key, described below.

## Freeze and seizure look like any transfer

A transfer agent freezes shares under a court order or a sanctions designation, and sometimes moves them. A public token does this with administrative functions that act on an address. Inside the pool there are no addresses, and an administrative call that could rewrite notes would break the rule that only a verified proof creates a note.

The agent acts through the claim path, a second path in the transfer circuit. The claim path is authorized by the agent's claim key, kept in its own HSM, whose hash the pool stores. The agent opens the target note from the feed, computes its nullifier from the nullifier key on file, and spends it. What it creates in its place depends on the action:

- The same note, for the same owner, under a freeze lock.
- The same note, for the same owner, when a lock is removed.
- A note of the same value, for the agent or for a beneficiary, in case of a seizure.

Which path a proof took is a private input, so on-chain a freeze is one more transfer, and it costs the same gas as one.

![The transfer agent opens the target note from the register feed and sends a claim-path plan, a freeze in place, to its HSM, which returns a signature with the claim key. The agent sends the proof to the pool through a private channel, and the pool verifies it like any transfer. Later the agent releases the note, or seizes it to a beneficiary.](../assets/posts/2026-10-23-private-money-market-funds/claim.svg)

A lock is a hashed field in the note. It records a reason, the party allowed to claim the note, and in case of a temporary hold, the date after which the owner may spend again. A freeze lock never releases on its own. Only the claim path can create a lock, so a holder cannot pay a counterparty with a frozen note. For the same reason, a hand-out that starts a holding period goes through the claim path.

The claim path skips the input owner's attestation, so the agent can still act on a holder whose attestation has lapsed. Every new owner is still checked.

The public mempool should not be used for claims, since they carry the target's nullifier; the holder's wallet would see it coming, and could spend the note first, frontrunning it. The agent should send its claims through the relayer over a private transaction channel, which passes them straight to a block builder. If the race is lost anyway, the agent follows the funds through the feed and claims the new notes. If the holder wins it with a withdrawal, the shares land on the public token, where the token's own freeze takes over.

## What it costs

The [specification](https://github.com/ethsystems/pocs/blob/master/pocs/private-mmf/shielded-notes/SPEC.md) lists these measurements and how they were taken, with proving times for an Apple M1 Pro laptop.

| Operation | Proving time | Gas | Register feed |
|---|---|---|---|
| Deposit | 1.1 s | 3.0 million | 320 bytes |
| Transfer | 2.4 s | 3.2 million | 576 bytes |
| Claim (freeze, release or seizure) | 2.4 s | 3.2 million | 576 bytes |
| Withdrawal | 1.4 s | 2.8 million | none |

The gas covers the whole operation, register feed included, and verifying the proof accounts for about 90% of it. A claim runs the transfer circuit, so it costs the same gas as a transfer.

## What an observer still sees

For any given transfer, a public observer sees only that it happened, two nullifiers, two commitments, and ciphertexts it cannot read. It does not see amounts, owners, or which path the proof took, for example whether it was an ordinary transfer or a claim from the transfer agent.

Consider a fund with forty confidential holders. On a quiet Tuesday, a single investor subscribes for two million dollars. The agent's daily deposit is public, so the chain shows two million shares entering the pool, followed by a single hand-out transfer. Anyone watching learns that one investor subscribed two million that day. They do not learn which one, but forty holders is a short list, and the next large redemption narrows it further.

On a busy day the same deposit reveals only the average subscription, and the number of hand-outs hints at the number of orders. Nothing in the pool hides the aggregate, because the fund's token has to see the shares arrive.

The set a holder hides in is the attested owner values, whose pseudonyms appear in the attestation registry's batches. A single-fund pool with few large holders gives a small set, and transaction volume does not grow it. Whether that is enough is for the fund and its regulators to decide. Padding the hand-outs with dummy transfers, or netting redemptions against the next day's hand-outs, would hide the counts, and a pool shared across funds would widen the set. None of them is built.

## Related work

| Approach | In common with this pool | How it differs |
|---|---|---|
| [Compliant shielded pools](/writeups/building-compliant-shielded-pools-on-ethereum/) | The base: notes, an expiring attestation registry, a policy inside the proof | Built for payments compliance. It has no transfer agent, no yield and no claim path, and its audit copy is not bound to the proof |
| [ERC-3643](https://eips.ethereum.org/EIPS/eip-3643) and [DS Protocol](https://github.com/securitize-io/dstoken) tokens | The rules this pool sits behind | Balances and transfers are public. The pool keeps the token as the public side of the fund |
| Confidential tokens, such as [ERC-7984](https://eips.ethereum.org/EIPS/eip-7984) | Keep one token and hide amounts in place | Hide amounts and balances. Sender and receiver stay public |
| TEE-based privacy | Hide balances from the public | Trust moves to hardware and its operator |
| Confidential supply native to the token | Hide positions | A larger change to the issuer's token than one exempt holder |

## What the design relies on

**The transfer agent is a single point of failure.** If it stops, subscriptions and redemptions stop, just as they do in current public setups. Attestations expire, so after a long enough outage holders also lose the ability to move their notes, though the notes keep accruing and move again once attestations resume. An exit path that would let holders withdraw without the agent is sketched in the specification, not built.

**The agent concentrates secrets.** It holds every investor's nullifier key, the register key and the claim key, and a breach exposes every position and spend history. A leaked register key alone puts no funds at risk. The agent can rotate it at once, which protects the feeds created after the rotation; those already on chain stay readable with the old key. A register key held by a threshold of parties would remove that single point, but it is not built.

**The issuer has to exempt the pool.** The pool works only if the token exempts it from per-holder limits, country rules and the administrative powers that act on one address. In a token already in use, changing those powers is an upgrade the issuer, its platform and possibly its regulator must approve. Until then the pool rests on the issuer's commitment not to use them. If the powers are used anyway, the halt holds deposits and withdrawals until governance clears it, normally once the shares are back. Governance can also clear it once yield alone has restored `m`, which absorbs the loss as forgone yield. The issuer could also withhold the pool's yield, by reinvesting less into the pool than into other holders. No shares leave the pool, so neither the halt nor the agent's outflow check sees it; the agent can catch it by comparing the pool's growth with the fund's published rate, a check the PoC does not run.

**It is a proof of concept.** The circuits, the contracts and the agent's register logic run as specified, but there are some simplifications, such as a mock fund token, a software custody signer, one account for all roles, and agent state kept in memory. Code has not been audited.

**Legal acceptance is the open question.** We have not evaluated whether a regime would accept the pool's ledger as part of the record of ownership, the pool's exemption from the token's per-holder controls with the transfer agent applying those controls instead, or a rise in the multiplier as the fund's reinvestment.

## Closing

This proof of concept shows that a fund can hide its holders from the public without its transfer agent losing sight of a single position. The pool relies on zero-knowledge proofs to get there: the proof that creates a note also hands the agent its record of it, so the register follows from the ledger. The next steps build on that: holder proofs that a position exceeds a threshold, a confidential cash leg settled atomically with the shares, and pledging notes as collateral.
