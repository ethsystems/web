---
layout: post
title: "What Ethereum's Roadmap Changes for Institutions"
description: "Five upcoming Ethereum L1 changes, read through one private redemption: who pays gas, whether it gets included, and what leaks before it does."
date: 2026-07-02 15:00:00 +0200
author: "Aaryamann"
image: /assets/images/2026-07-02-ethereum-roadmap-for-institutions/hero.png
tags:
  - ethereum-roadmap
  - account-abstraction
  - focil
  - encrypted-mempool
  - censorship-resistance
  - institutional-privacy
---

*The posts on this blog so far built privacy and resilience [on Ethereum as it is today](/blog/building-private-transfers-on-ethereum-with-shielded-pools/): a shielded pool, a plasma chain, an identity layer, a disbursement rail, a petition system. Every one works around the base layer's current limits instead of asking it to change. This post turns the other way, to the changes the protocol itself is now being asked to make: for each, where the proposal sits in Ethereum's open standards process, and where an institution can push to get it included.*

Every private payment we have shipped depended on the base layer in the same way. The cryptography hid who paid whom, but getting that payment onto Ethereum could leak, stall, or hinge on a third party's discretion, so we worked around it each time. Those workarounds run through the [shielded pool](/blog/building-private-transfers-on-ethereum-with-shielded-pools/), the [plasma transfers](/blog/building-private-transfers-on-ethereum-with-plasma/), the whole [Resilient series](/blog/resilient-disbursement-rails/), and the post on [hardened shielded pools](/blog/exploring-hardened-shielded-pools/). None of those workarounds was a guarantee. Each was an assumption the protocol did not enforce.

Five proposals would take those guarantees off the application layer and move them into the protocol, where every application inherits them at once. None is a privacy feature by itself. They sit at different stages of an open process, and an institution seeking one shaped a particular way can submit that requirement while the decisions are being made.

## How the redemption works around the base layer today

Take an anonymized custodian running a shielded-pool redemption, the same pattern we built in [Building Private Transfers on Ethereum with Shielded Pools](/blog/building-private-transfers-on-ethereum-with-shielded-pools/). The cryptography is settled and works today: the custodian proves it owns a note, burns a nullifier, and the pool releases tokens to a fresh address without revealing who held the note.

The base layer is where it leaks, in four ways before it lands on Ethereum. Paying gas from the custodian's own address re-links it to the private spend. The pool's single nonce lets one stuck withdrawal freeze every redemption behind it. The protocol guarantees nothing about inclusion. Before it is even ordered, the redemption's amount and destination sit in the public mempool. The five proposals below each take one of these off.

## Paying for a private spend without a relayer in the path

The gas payer and the spender have to be the same account. [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) frame transactions would drop that, pushing account abstraction down into the base layer: a transaction splits into ordered frames, one to validate, one to approve who pays the gas, one to run the user's operations, so fee payment becomes programmable instead of hanging off a single ECDSA key.

For the custodian's redemption, the frame that approves payment is a native paymaster. Gas comes from a separate custodian account, with no third-party relayer or bundler in the path, so the address that paid never re-links to the withdrawal. Every prior PoC leaned on a relayer that doubled as a privacy leak and a censorship chokepoint; frame transactions would remove it.

![Today a third-party relayer pays gas and submits the shielded-pool spend, a relinkable censorship point; EIP-8141 frame transactions replace it with validate, native-paymaster, and execute frames so the gas payer never re-links to the withdrawal.](/assets/images/2026-07-02-ethereum-roadmap-for-institutions/today_retires.png)

Frame transactions are [listed as Considered for Inclusion](https://forkcast.org/eips/8141/) for [Hegota](https://forkcast.org/upgrade/hegota/), the upgrade after [Glamsterdam](https://forkcast.org/upgrade/glamsterdam). Core developers declined to make frame transactions that fork's headliner, citing implementation complexity, but kept it in scope as a non-headliner under active development, and it could return as a headliner candidate later. The limit: frame transactions fix the gas-payer leak but not the order-flow leak, since the transaction's intent is still visible during public-mempool validation, so a confidential flow has to pair them with the encrypted-mempool work below.

## One stuck withdrawal no longer freezes the queue

The next limit is head-of-line blocking: many users behind one address share a single sequential nonce. [EIP-8250](https://eips.ethereum.org/EIPS/eip-8250) keyed nonces, which build on frame transactions, would replace that one nonce with several independent lanes the protocol tracks separately.

A shielded pool is exactly the shared address this is built for. Every client redeems through the pool, so under one serial nonce a single withdrawal that stalls on an underpriced fee freezes every redemption behind it. With keyed nonces each redemption takes its own lane, and a stalled one blocks only itself. This is a liveness fix, separate from privacy: a redemption queue that one stuck transaction can block is one you cannot put a settlement deadline on.

![Under a single serial nonce one stuck transaction blocks every redemption behind it; EIP-8250 keyed nonces give one shared pool address independent lanes, so a stuck lane is isolated and the others clear.](/assets/images/2026-07-02-ethereum-roadmap-for-institutions/nonce_retires.png)

**Where it stands.** [EIP-8250](https://eips.ethereum.org/EIPS/eip-8250) is a Draft, a sub-proposal that reworks frame transactions by swapping the single sender nonce for a keyed scheme run through a nonce-manager system contract. The forum discussion ties it to the [Hegota](https://forkcast.org/upgrade/hegota/) work, but it does not yet carry a [formal inclusion status](https://forkcast.org/eips/8250/). The limit: keyed nonces are an enabling primitive rather than a privacy feature. They remove a liveness bottleneck and have no effect on unlinkability.

## Making inclusion enforceable

Keyed nonces clear the queue once a redemption is in it. The open question is whether it lands in a block at all. For a regulated institution, that is a question of settlement assurance: a redemption or a coupon payment should not depend on a block producer choosing to include it.

Today inclusion is not enforced by protocol rules. A handful of builders produce most blocks, and any of them can drop a transaction for any reason. [EIP-7805](https://eips.ethereum.org/EIPS/eip-7805), known as FOCIL for fork-choice enforced inclusion lists, would change that. A rotating committee of validators each publishes a list of transactions it has seen, and the fork-choice rules force the next block to include all of them, so one honest committee member is enough to make a publicly broadcast transaction uncensorable. For the custodian, a settlement leg that has to land by a deadline gets enforced inclusion instead of a builder's discretion.

![The custodian's redemption sits in the public mempool while a rotating FOCIL committee each publishes an inclusion list, and the fork-choice rule forces the next block to include every listed transaction, so one honest committee member suffices (EIP-7805).](/assets/images/2026-07-02-ethereum-roadmap-for-institutions/focil.png)

**Maturity: scheduled for inclusion.** [FOCIL](https://eips.ethereum.org/EIPS/eip-7805) was a candidate for [Glamsterdam](https://forkcast.org/upgrade/glamsterdam), then deferred when pairing it with enshrined proposer-builder separation in one upgrade was judged too risky. It is now the consensus-layer headliner for [Hegota](https://forkcast.org/upgrade/hegota/), [marked Scheduled for Inclusion](https://forkcast.org/eips/7805/) and targeting late 2026. That status can still change at any core-developers call, so the open question is which committee parameters an institution can accept. FOCIL would guarantee inclusion but not confidentiality. The transaction still sits in the public mempool with its contents exposed, which is why it has to pair with an encrypted mempool.

## Removing the trusted relay underneath block production

Underneath all of this sits a trusted, off-protocol chokepoint: the hand-off between the proposer of a block and the builder assembling it runs through relays such as MEV-Boost, which can delay or front-run flow with no in-protocol recourse. [EIP-7732](https://eips.ethereum.org/EIPS/eip-7732), enshrined proposer-builder separation, would pull that hand-off into the protocol itself, replacing the relay with a slashing-backed fair exchange of block payload for payment, the consensus substrate that inclusion lists and encrypted mempools have to be enforced on.

For the custodian, this removes the shared dependency the other four workarounds lean on: no trusted relay free to filter or reorder the redemption, and inclusion timing a settlement desk can price.

![Today a trusted MEV-Boost relay sits between proposer and builder and can filter, delay, or front-run; EIP-7732 ePBS pulls the hand-off into the protocol as a slashing-backed fair exchange, leaving a free-option gap where the builder reveals the payload later and may withhold it.](/assets/images/2026-07-02-ethereum-roadmap-for-institutions/epbs.png)

[EIP-7732](https://eips.ethereum.org/EIPS/eip-7732) is the consensus-layer headliner of [Glamsterdam](https://forkcast.org/upgrade/glamsterdam), [scheduled for inclusion](https://forkcast.org/eips/7732/), sitting alongside block-level access lists on the execution side. It also carries the most implementation risk in that upgrade: the sticking point is coordinating a two-party block, so treat any activation timing as provisional, pending devnet results. Two limits. ePBS removes a chokepoint, not a leak, so on its own it adds no transaction privacy. It also opens a free option: the builder commits first and reveals later, so in that gap it can withhold the payload if the trade moved against it. This is the same last-look risk familiar from traditional execution, left for the encrypted mempool below to address.

## Hiding the order before anyone can read it

The last gap is outside the cryptography's scope: the redemption's amount and destination sit in the public mempool before it is ordered. [EIP-8184](https://eips.ethereum.org/EIPS/eip-8184), called LUCID, would close it. The withdrawal travels the permissionless inclusion path as a sealed ciphertext; the builder must commit to including it while blind to its contents, and only then is the key released. LUCID is encryption-scheme-agnostic commit-before-reveal rather than a [Shutter](https://shutter.network/)-style keyper-committee scheme, and in the simplest case the sender releases its own key, so no committee has to be trusted to decrypt. For the custodian, a desk could route a large rebalance without leaking who sent it or how much until ordering is fixed, and paired with [FOCIL](https://eips.ethereum.org/EIPS/eip-7805), the builder can neither read the transaction nor exclude it.

![EIP-8184 LUCID flow: the custodian encrypts the redemption as a sealed ciphertext, the builder commits to include it while blind to its contents, the sender releases the key, and the decrypted transaction executes top-of-block in the next slot.](/assets/images/2026-07-02-ethereum-roadmap-for-institutions/lucid.png)

Of the five, [EIP-8184](https://eips.ethereum.org/EIPS/eip-8184) is the least settled: a Draft with [no formal inclusion status](https://forkcast.org/eips/8184/) yet, discussed as a post-[Hegota](https://forkcast.org/upgrade/hegota/) encrypted-mempool candidate. It competes with several other designs and is taking active criticism on ethresear.ch. With the design still open, a desk that can specify exactly what pre-trade confidentiality it needs records that requirement without endorsing any single design.

Three limits. Protection is pre-execution only, so once the trade executes top-of-block, ordinary on-chain extraction still applies unless the settlement is also shielded. Second: if a sealed transaction can be tied to a known institution, a front-runner can infer its contents, which the unlinkable addresses from frame transactions and keyed nonces are meant to prevent. Third, the right to reveal is itself a free option, the same commit-first-reveal-later gap ePBS opens, now controlled by the sender.

## What this changes for compliance

None of these proposals removes regulatory visibility. Pre-trade confidentiality is part of best execution: an order that leaks before it fills has its execution quality compromised, and SEC Rule 15c3-5 market-access controls assume the venue is not leaking it against the client. Confidentiality of a redemption's amount and destination is data minimization, the principle behind GDPR Article 25, and the shielded-pool work's viewing keys still let a regulator audit. Sanctions screening and the conduct rules under MiCA keep running at the application layer, where an institution already runs them. Privacy here supports these obligations rather than amounting to legal compliance on its own, and any deployment still needs its own legal review.

## Related work and references

The primary sources are the five EIPs: [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) frame transactions, [EIP-8250](https://eips.ethereum.org/EIPS/eip-8250) keyed nonces, [EIP-7805](https://eips.ethereum.org/EIPS/eip-7805) FOCIL, [EIP-7732](https://eips.ethereum.org/EIPS/eip-7732) ePBS, and [EIP-8184](https://eips.ethereum.org/EIPS/eip-8184) LUCID. The live debate sits on [Ethereum Magicians](https://ethereum-magicians.org/) and ethresear.ch, and [Forkcast](https://forkcast.org/) tracks the inclusion status of each, upgrade by upgrade.

[Shutter](https://shutter.network/) is the threshold-encryption ancestor of the encrypted-mempool line, though LUCID is not built like it. Order-flow-protection designs such as [Renegade](https://renegade.fi/) go after the same pre-trade leakage from the application side, complementary to these protocol-side proposals rather than rivals.

## What the institutional reader can do about it

Every resilient PoC on this blog depended, underneath the cryptography, on an unenforced base-layer assumption. These five proposals would move those assumptions into the protocol, and the interval between proposed and shipped is when institutional requirements can still affect the outcome.

The same proposals serve two institutional needs with opposing requirements. A payment that has to settle, a redemption or a margin call, needs the inclusion guarantee most: a weak inclusion-list parameter would let it be dropped with no visible signal. A desk working a large order needs the confidentiality most: a scheme that breaks once a transaction is linked to a named firm does not protect it. A single protocol can satisfy both, but only if both sets of requirements are submitted during its design.

If you run custody, issue tokenized assets, trade, or operate market infrastructure, bring a concrete requirement to where these proposals are decided: the EIP threads on [Ethereum Magicians](https://ethereum-magicians.org/), the [AllCoreDevs process](https://github.com/ethereum/pm) where inclusion is called, and [Forkcast](https://forkcast.org/) to track each one as the stages move. Tell us which guarantee is blocking a private flow from production, and we will bring that requirement to these processes. The [iptf-map](https://github.com/ethereum/iptf-map) catalogues the wider set of patterns these proposals plug into, and the [proof-of-concept repository](https://github.com/ethereum/iptf-pocs) is where we build against them. These decisions are being made now, while the parameters are still open.
