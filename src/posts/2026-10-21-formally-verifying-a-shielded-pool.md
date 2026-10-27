---
layout: post
title: "Formally verifying a shielded pool: from spec to bytecode"
description: "We took our shielded pool and pushed formal verification from the written spec down to the bytecode on a testnet: what it bought, what it cost, and where it stopped."
date: 2026-10-27 12:00:00 +0100
author: "Oskar"
image: ../assets/posts/2026-10-21-formally-verifying-a-shielded-pool/hero.png
tags:
  - formal-verification
  - shielded-pool
  - lean
  - specifications
map_refs:
  - pattern-shielding
  - approach-private-payments
  - private-payments
  - pattern-immutable-guarantees
---

How sure can you be that a confidential system does what it says it does? Not just the smart contract: the circuits, the hash, the verifier, the wallet, the deployment, and the spec they're all supposed to follow. We took one of our own, a shielded pool for private transfers, and pushed formal verification as far as today's tools reach, from the written spec down to the bytecode running on a testnet. This post is about what that bought us, what it cost, and where it stopped. We wrote it for the engineer shipping a pool like this, and for the technical reader an institution sends to evaluate one.

Here is the whole thing in one picture.

<div class="figure-scroll">

![One withdraw as the pool runs it. The wallet holds a note and builds a proof with the withdraw circuit. The pool contract asks the verifier contract, checks that the root is one it recently held and that the nullifier is unused, then pays out. The Poseidon hash is the one piece both the circuit and the contract use. Above: the spec and the Lean model of its rules. Below: the deployment on Sepolia. Darker fill is proved, a Lean theorem that holds for every input the model allows; lighter fill is checked, a tool confirmed it within stated bounds; dashed is outside the claim. The spec box has no fill because it carries no status: it is the document the rest is read against. Assumed: the hash has no collisions, the verifier rejects false proofs, and the contract behaves as the model says.](../assets/posts/2026-10-21-formally-verifying-a-shielded-pool/f1-withdraw.svg)

</div>

## How sure can you be?

There are several kinds of evidence that a piece of software does what it should, and they cost different amounts and catch different things. Tests check the cases someone thought of. A review or an audit adds independent eyes for a bounded time. A specification writes down what the system is supposed to do. A reproducible build ties the bytes on the chain to the source you read. Formal verification is the most expensive of these: you state a property as mathematics, and a machine checks a proof that the program, or a model of it, has that property. A test suite rarely tells you about the rule nobody wrote down. A proof about a model will not tell you that the deployed bytes are the ones you proved things about. You want more than one of these, to strengthen your risk model.

Our [launch post](https://ethsystems.org/writeups/introducing-ethsystems/) said we are past crypto's YOLO phase. Institutions moving onto Ethereum have billions of dollars at stake and want to know what the guarantees are and what they rest on. How far do today's tools get on one real system, and what do you find on the way?

## What did we set out to prove?

### Start with a spec

Verification needs a statement of what the software should do. Ours is a [numbered specification](https://specs.ethsystems.org/), written before the proofs. [Spec 2/SHIELDED-POOL](https://specs.ethsystems.org/2/) describes a pool for confidential payments, written against the ERC-20 token interface, which permissioned token standards expose as well: you deposit tokens and get a note that only you can spend, you transfer notes privately, you withdraw. Its requirements are numbered and written in MUST language, so a reviewer can point at the clause a line of code has to satisfy, and it states its trust model, threat model and compliance boundary, so an engineer, an auditor and a regulator can each read the same document and find what they need.

A shielded pool is a contract holding many people's tokens with no public ledger of ownership. On deposit it records a commitment, a hash of your note; you keep the note. Spending publishes a zero-knowledge proof that you own a note in the pool's tree, and a nullifier: a one-way tag marking it spent without identifying it. Two failures lose money, and the pool must prevent both: spending a note twice, and a transfer that creates or destroys value. Get the second wrong and someone mints coins out of nothing, which is what the Zcash flaw found this year allowed.[^12]

The spec holds the system's meaning. People can read it, auditors can cite it, and AI agents can work from it, as they did to build the Lean model below. The model expands selected spec rules into machine-checkable form. Explicit requirements do not automate verification: translating spec to model is still a human reading.

[Section 6.2 of the spec](https://specs.ethsystems.org/2/#62-guarantees) is a table of guarantees, each with its verification level: asserted (designed for and reviewed), tested (the implementation has tests for it), or machine-checked (there is a proof). The table when we started:

| Property | What it promises | Level |
|---|---|---|
| Confidentiality | Note amounts and owners are hidden in commitments; revealed only via viewing key | asserted |
| Unlinkability | A transfer breaks the public link between input and output notes, among flows with indistinguishable amount and timing | asserted |
| No double-spend | A note spends at most once | tested |
| Value conservation | No transfer creates or destroys value | tested |
| Selective disclosure | A viewing key grants read access without spending authority | asserted |

The three asserted rows, confidentiality, unlinkability and selective disclosure, rest on the standard shielded-pool construction, commitments and nullifiers behind a zero-knowledge proof, which is well understood and reviewed. For those rows, the evidence is a design argument.

We checked the ledger's two core security invariants first: no note spent twice, no value created or destroyed. A theorem can state both over every history of deposits, transfers and withdrawals. The other three rows are about privacy, what an observer can learn; those harder proofs have their own section below.

### The model and the two theorems

A model is a small, exact restatement of the rules. Ours is under 500 lines of Lean, pinned to spec revision [`4d4dce1`](https://github.com/ethsystems/specs/commit/4d4dce1), covering sections 4 to 6, with three operations:

| Operation | What it does | What the pool checks before accepting it |
|---|---|---|
| Deposit | Locks tokens, mints a note | The token is supported, the amount is nonzero and in range, the commitment is new |
| Transfer | Spends two notes, mints two | The root is a recent one, the inputs are owned by the key and in the tree at that root (the second may be ballast, an amount-zero note), their nullifiers are fresh and distinct, one token across all four notes, the amounts are in range and balance, and the two new commitments are distinct and not already in the tree |
| Withdraw | Spends a note, pays out | The root is a recent one, the note is in the tree and owned by the key, its nullifier is fresh, the amount is nonzero, in range and covered by the pool's balance |

Hashes are opaque, the Merkle tree is a list, amounts are natural numbers, steps are atomic; the [model repository](https://github.com/ethsystems/shielded-pool-model) lists 16 such simplifications. Three terms recur: a commitment is the hash that stands for a note on chain, a nullifier is the public marker that spends it, and a recent root is one in the pool's root window, the short list of past tree roots the contract still accepts.

`CryptoHyp`, as it stands in [the model](https://github.com/ethsystems/shielded-pool-model/blob/4913117/LeanShieldedPool/Statements/L3.lean#L31-L67), assumes that within one history no two well-formed notes share a commitment and no two spending keys derive the same public key. Theorem 1: under that assumption, no commitment is consumed twice in any history the pool accepts from empty. Theorem 2: under the same conditions, deposits equal withdrawals plus live value, for every token.

```lean
structure CryptoHyp (P : PrimSpec) (txs : List (Tx P)) : Prop where
  commit_inj : ∀ n ∈ runNotes txs, ∀ n' ∈ runNotes txs,
    n.wf → n'.wf → n.cm = n'.cm → n = n'
  derivePub_inj : ∀ k ∈ runKeys txs, ∀ k' ∈ runKeys txs,
    P.derivePub k = P.derivePub k' → k = k'

def noDoubleSpend (P : PrimSpec) : Prop :=
  ∀ (sup : P.Token → Prop) (txs : List (Tx P)) (st : St P),
    Run sup txs st → CryptoHyp P txs → noteSpentAtMostOnce txs

def valueConservation (P : PrimSpec) : Prop :=
  ∀ (sup : P.Token → Prop) (txs : List (Tx P)) (st : St P),
    Run sup txs st → CryptoHyp P txs →
      ∀ t : P.Token, st.deposited t = st.withdrawn t + liveValue st t
```

`Run sup txs st` says the pool accepted the history `txs` from empty and ended in state `st`, with `sup` the supported tokens. Think of a note as an IOU with a secret serial number: no IOU is cashed twice and the books always balance, provided no two IOUs in the history share a fingerprint and no two keys open the same lock. The base model has nine theorems, four needing no cryptographic assumption. The spec says what this level does not cover, in its own words: "it covers no implementation, and not field overflow, two encodings of one nullifier, circuit wiring, or Merkle-tree binding". Those live below. We also modelled the [epoch extension](https://ethsystems.org/writeups/exploring-hardened-shielded-pools/) the proof-of-concept code specifies for bounding nullifier state, and proved double-spend safety survives epoch rollover: six more theorems, same repository.[^14]

<div class="figure-scroll">

![No double spend, as Lean states it. Left, the statement from the model, one part per row: for every set of supported tokens, every history of operations and every end state; if the pool, starting empty, accepts the history and ends in that state, and no two notes or keys in the history collide; then no note in the history is spent twice. Right, each row in plain English. Below, Lean's answer to "what does the proof rest on": the three standard axioms propext, Classical.choice and Quot.sound, and nothing else; the hash assumption is a premise of the sentence, not an axiom. Last, the same question for a proof with a hole in it: Lean lists sorryAx, and the gate fails with GATE FAIL: sorry. Darker fill marks the proved statement.](../assets/posts/2026-10-21-formally-verifying-a-shielded-pool/f2-theorem.svg)

</div>

What does `CryptoHyp` cost? It is collision resistance of the hash, restricted to the history at hand, and we did not prove it; whether Poseidon has that property at these parameters is a question for cryptographers, and a bigger one than this pool. We also assume the verifier rejects false proofs and the contract behaves as the model says. The [model repository](https://github.com/ethsystems/shielded-pool-model) holds the proofs and the checks below, each as a package with its own command.[^3]

## What does it take to make that proof about the real pool?

### The system and the tools

The parts use different languages; each needed its own tool. Everything here concerns the deployed commit, [`a04b8b3`](https://github.com/ethsystems/pocs/commit/a04b8b3), in our public [pocs](https://github.com/ethsystems/pocs) repository. The current code differs from it in the transfer circuit, its verifier and the pool contract, which gained the verifier timelock and lets a withdrawal of a removed token through. Neither the proofs nor the contract checks cover those changes until we move the pin.

[Noir](https://noir-lang.org) is the language the circuits are written in; its compiler emits ACIR, a flat list of constraints a proof has to satisfy, and that flat list is what the prover runs. [Poseidon](https://eprint.iacr.org/2019/458) is the hash the pool uses for commitments, nullifiers and the Merkle tree. [Halmos](https://github.com/a16z/halmos) and [Kontrol](https://github.com/runtimeverification/kontrol) run Solidity on symbolic inputs, each input standing for every value it could take, so one run covers a whole family of transactions within a stated bound; [Verus](https://github.com/verus-lang/verus) and [Aeneas](https://github.com/AeneasVerif/aeneas) do related jobs for Rust. [Lean 4](https://lean-lang.org) is the proof assistant: a language where a proof is a program, and a small kernel checks that the program is sound. It has a large [mathematics library](https://leanprover-community.github.io), and much of the recent verification work around Ethereum and zero knowledge is written in it.[^1] AI agents wrote most of our proofs; the kernel checked every one.[^2]

| Part | Written in | What we checked it with | What the check says, and what it still assumes |
|---|---|---|---|
| The rules | Spec 2, then a Lean 4 model | Lean | No double spend and value conservation hold over every accepted history; 9 theorems in all, two of them these guarantees. Assumes no commitment or key collision within the history |
| Circuits (deposit, transfer, withdraw) | Noir, compiled to ACIR | Lean over the compiled circuit | Amounts fit and balance: 5 theorems over 42,713 compiled instructions. Assumes the translation from ACIR into Lean; the hash and Merkle equations stay outside |
| Poseidon hash | A Noir library and a Solidity library | Lean | Both copies equal the textbook reference: 155 theorems. Assumes the transcriptions into Lean |
| Verifier contracts | Solidity, generated from the circuits | A pinned rebuild | 3 files match byte for byte. Assumes the proof system rejects every false proof, which no tool here checks |
| Pool contract | Solidity | Halmos and Kontrol (symbolic execution), plus the circuit proofs and verifier rebuild | 20 of 36 obligations closed within a stated scope, 9 of them by contract checks. Assumes the other 16: the success paths, state updates, Merkle membership and whole calls |
| Deployment | Sepolia | An offline rebuild compared with the chain | 12 runtime codes match byte for byte. Says nothing about who may change the contract later |
| Wallet (the Rust client) | Rust | Aeneas and Verus, on selected functions | Checked in part; outside the chain-side claim. Assumes production libraries behave like their stand-ins |

### Below the model

Figure 1 puts four boxes between model and chain: withdraw circuit, Poseidon hash, verifier contract, pool contract. For the theorems to reach the pool, each link must hold: the circuits enforce what the model assumes, circuit and contract use the same hash, the on-chain verifier comes from those circuits, and the contract follows the rules.

**The circuits.** A zero-knowledge circuit lists equations a proof must satisfy. We proved properties over the Noir compiler's ACIR, the compiled form the prover runs. Every assignment satisfying all 42,713 instructions across the three circuits has amounts below 2^128, transfer inputs summing to outputs without wrap-around, and four matching token fields. The hash and Merkle equations stay outside this route.[^4]

**The hash.** A Noir library in the circuits and a Solidity library in the contract both hash Merkle nodes with Poseidon; disagreement would give them different trees. In Lean, over the circuits' field, we proved the Noir permutation equals the textbook reference across all 65 rounds, and the Solidity transcription equals it too. Both transcriptions into Lean are trusted.[^5]

**The verifier.** The contract checks each proof with a Solidity verifier generated from its circuit. Regenerating all three with pinned tools matched the committed files and verification-key hashes byte for byte. That says they are the toolchain's output. Whether the proof system rejects every false proof remains a separate assumption.

**The contract.** Matching the model takes 36 obligations: reject reused nullifiers, mark them before payout, accept only recent roots, and so on. Most are model guards and state updates; some, including who may call, are unstated there. The model repository's board tracks each rule. Twenty close within a stated scope; sixteen keep named assumptions, covering the hard cases: success paths, state updates, Merkle membership, whole calls. Nine of the twenty use Halmos and Kontrol: bounded depths and byte domains, named callers, simplified hash and verifier stand-ins. Seven use Lampe, a circuit-source extractor we patched twice. Compiled-circuit proofs and the verifier rebuild supply the rest, and most checked rules cover rejection.[^6]

**The wallet.** The Rust client builds notes, proofs and transactions. Our claim covers only the chain side and must hold against hostile clients: the contract checks every proof, and a broken client hurts only its own user. We still checked parts. Aeneas extracted 22 functions into Lean; Verus checked 96 reviewed mirrors of shipped functions, with library stand-ins. The sets overlap, and together give each of the 110 security-relevant functions at least one selected property, including amount guards, assuming production libraries behave like their stand-ins.[^7]

### The gap between the contract and the model

The model has three atomic operations over lists and natural numbers, which is what makes the theorems provable. The contract has loops, fixed-width words, an external verifier, an external hash, a Merkle tree it updates in place, callers, gas, and an owner. The model abstracts all of that away, so the contract could diverge from it at any of those points.

Closing the gap takes what the field calls refinement: prove post-conditions for every entry point over the whole state space, then prove they imply model steps. We have bounded checks with mocks and a composition lemma for one withdraw: if the contract meets its post-conditions, the circuits say what we proved, and an accepted proof's hidden inputs can be recovered, that withdraw lands in the model. All premises are written and named, none proved for production, and a toy instance shows they can hold together.

<div class="figure-scroll">

![One withdraw, from the contract to the model. On the left the contract as it runs, Solidity on the EVM. On the right the model, three operations over lists and natural numbers. The solid span between them is the composition lemma: if all three premises hold, this withdraw lands in the model. Three supports hang from the span, drawn as thin grey lines that stop in mid-air, one per premise: the contract meets its post-conditions, the circuits say what we proved they say, and the hidden inputs can be recovered from an accepted proof. Each is written and named, and none is proved for the production system. Below them, in the gap, what the model leaves out and the contract still has: loops, fixed-width words, an external verifier, an external hash, a Merkle tree updated in place, callers, gas, and an owner. A toy instance shows the three premises can hold at once. Closing the gap takes a post-condition for every entry point, over the whole state space.](../assets/posts/2026-10-21-formally-verifying-a-shielded-pool/f3-gap.svg)

</div>

### The code on chain

A proof about source says nothing about what runs; that is what a reproducible build is for. We deployed the pinned commit to Sepolia, 13 contracts in all (the thirteenth is a mock token for the test deployment, outside the claim), and ran a check against a fork frozen at block 11949456: rebuild everything offline from the commit, compare with the chain. All 12 runtime codes in the claim match byte for byte, the real verifiers are wired in, and the event log shows no verifier change since deployment.[^8] The checker and the record of its runs are in the model repository. If you can't rebuild the bytes on the chain from a commit, you don't know what you've checked.

### The contract owner

[Section 6.1 of the spec](https://specs.ethsystems.org/2/#61-threat-model) is the threat model: five adversaries, each with what they can do and what stops them. The last row is the contract owner. In the spec's words: "With a mutable verifier, can install an accept-everything verifier and mint or drain the pool". And the mitigation: "A deployment MUST enumerate owner powers and put verifier changes behind a timelock and multi-party control, or make the verifier immutable and migrate by redeployment. Every guarantee in 6.2 is conditional on these controls".

The theorems hold for every accepted history and say nothing about who can change the verifier: the model has no owner. An owner who swaps in an accept-everything verifier doesn't break the proofs; they were never about the owner. At the commit we deployed, verifier replacement had no timelock. The code [has one now](https://github.com/ethsystems/pocs/commit/1e5de9b); the pool on Sepolia does not, and the next deployment will. The pool has changed since we first [wrote about it](https://ethsystems.org/writeups/building-private-transfers-on-ethereum-with-shielded-pools/) in February, and the changes sort by origin: the audit, the spec, this verification.[^15] Multi-party control is for whoever deploys for real. The lesson is older than this pool: the proofs say the vault's rules are right, and the owner still holds a key to the back door. Before believing any guarantee about a deployed contract, check who can change it and how long that takes.

### Privacy: what can we prove?

Confidentiality, unlinkability and selective disclosure stayed "asserted". Privacy proofs are harder than ledger proofs; the difference is what the statement is about.

| Kind of property | What the statement is about | What a proof needs |
|---|---|---|
| Ledger invariant (no double spend, conservation) | The pool's state after any history | A model of the rules and an induction over histories |
| Privacy (confidentiality, unlinkability) | An observer: what it sees, and what it can't tell apart | A precise game: the observer, its view, two worlds it should not distinguish, and a fact about the hash that hides the difference |

In Lean we defined this pool observer's view and when two histories look the same. In that model an anonymity set of two exists, and a family of size k for every positive k. Commitments ignore token and amount; the observer sees no public token, amount, address or root. We proved conditional bounds in restricted event-log models. One proof needs a hiding property of Poseidon at these parameters we could not establish; another models the hash as a random oracle and assumes it; connecting either model to the deployed pool remains open.[^9]

Privacy is partially checked in models of this pool, not yet in its deployment. The spec's table has no word for partial, so those rows stay "asserted", and the games above are the next research step.

## What did we learn?

### What we found

This well-understood pool had reviews during development: an agent-run audit we triaged and fixed, an adversarial agent spec review, a colleague's peer review. So the Critical nullifier aliasing bug and the High funding-address theft path were already fixed.[^10] We expected no bugs that severe and found none.

| Finding | Where | Status |
|---|---|---|
| A Merkle root was banked between a transfer's two insertions, so a half-finished state entered the root window. Low impact, no theft path found. | Pool contract | Fixed, and now a model theorem with its own control |
| The transfer circuit skipped the proof-length range check for a ballast input (an unused input carried with a zero amount); the spec requires it in 5.3. | Transfer circuit | Fixed after the pinned commit; the new circuit is not covered by our proofs |
| Verifier replacement with no timelock and no multi-party control, which the spec requires | Pool contract, owner | Raised by the August audit and by section 6.1, not found here. Timelock merged; multi-party control is a deployment matter |
| In Lampe, the tool that extracts Noir into Lean, the rule for a zero-iteration loop proved any postcondition, including False | Tool | Reported as [#314](https://github.com/reilabs/lampe/issues/314); our fix [#315](https://github.com/reilabs/lampe/pull/315) merged |
| A second Lampe defect: an unconstrained cast builtin | Tool | Reported as [#316](https://github.com/reilabs/lampe/issues/316); our fix [#317](https://github.com/reilabs/lampe/pull/317) merged |
| In evm-smith, a Lean framework for proving EVM bytecode safe, two axioms about frames prove False | Tool | [#4](https://github.com/leonardoalt/evm-smith/issues/4), open |

Three of the six are in the verification tools. Two let you prove False, and therefore any statement. The tools are young and need checking too.

A proof system that can prove False passes every build, so test the checker too. A theorem with no content also passes. Plant cheats and require the gate, the command rebuilding every proof and failing on any hole, to fail on each. The model also helps compare code with the spec: asking how the contract should handle an intermediate root exposed the banked-root bug, and symbolic execution confirmed it in a fraction of a second.[^17] Reviewers from a second model family found errors in our claims, never in a proof. The claims are where most of our errors were.

What stopped short shows the field's limits better than the bugs. Some next steps are days of work and some are projects. Where someone else has done the step, we name them.[^16]

| Layer | What we tried | What we ran into | What it would take |
|---|---|---|---|
| Model | A Lean gate, nine theorems, 16 named simplifications | The level "machine-checked (model)" stops where the model does: field overflow, two encodings of one nullifier, circuit wiring and Merkle binding stay outside | Keep the model in step with the spec as it moves |
| Circuits, compiled route | Lean proofs over the ACIR of all three circuits, and an under-constraint probe with an SMT solver | The first Poseidon template took weeks, then hours per instance; the monolithic check and the SMT probe ran out of memory; the hash and Merkle equations stayed outside | Hash-bound rules as a separate project at the scale of the soispoke project below; one Poseidon block is done, its link to the circuit's satisfiability predicate open |
| Circuits, source route | A patched Lampe on the extracted Noir: commitment, nullifier, ownership, depth bounds, the Merkle fold | Two soundness bugs in the extractor, both reported, both fixed by us; no theorem says the extracted program and the printed ACIR accept the same assignments | Prove the Lampe Poseidon permutation equals the hash package's; a bridge between the two routes |
| Circuit completeness | Not attempted | Proving every honest spend has a satisfying assignment, for the whole spend relation, is a project the size of the soispoke repository, 161,700 lines of Lean for one circuit as we counted it[^11] | A project of that size |
| Hash | Lean over the field, 65 rounds, both copies against the reference | The transcribers are trusted; the unbounded Solidity check did not finish; equality to Lampe's permutation unproved | Generate the Solidity transcription instead of cutting it by hand; the same Lampe link |
| Verifier | A byte-for-byte rebuild of the three verifiers with pinned tools | No tool we used touches UltraHonk, the proof system the verifiers implement, so the rebuild says nothing about whether the verifier is correct; soundness stays a premise | A cross-check that the ACIR we proved over is the ACIR the toolchain consumed; soundness itself is specialist work, as Ironwood did for its own verifier |
| Contract | Halmos and Kontrol on the contract rules, with a mock verifier, a hash stub, bounded calldata and a gas cap | Scoped loop effects, not whole calls; Halmos closes the insertion checks at Merkle depths 0 to 3; the Kontrol proof of the insertion loop parses and runs but stalls; the Kontrol build alone wants 8 GiB | A loop invariant for insertion at the remaining depths, up to 255, and a frame lemma over the tree's storage, in Lean |
| Contract to model | A composition lemma for one withdraw, with a toy instance | Premises named, none discharged; the lemma is outside the model repository's replay | Connect execution to the premises; the lemma's library could become a model-repository package |
| Wallet | Aeneas on 22 functions, Verus on 96 mirrors | The real big-integer and ABI libraries use loop breaks and early returns Aeneas aborts on, the note decoders fail translation, and Verus needs specifications for those libraries, so mirrors stand in for shipped code | Production equivalence for every library stand-in |
| Privacy | Event-log games in Lean under a hiding hypothesis, and the symbolic k-anonymity toys | The statistical hiding premise is not met at a useful error for Poseidon's commitments; adaptive choice, corruption and later spends are open | A hiding result for the hash at these parameters, or a different hash |
| Deployment | An offline rebuild compared with the chain, with three planted deviations caught | Its first run caught the toolchain dropping a library on a nonce clash and still printing success | Redeploy with the timelock and move every pin in one step |


## Where does this go?

### Where this leads

Today each layer needs its own method, with assumptions between layers. The many languages are one reason to want something simpler: Rust in the client, Noir in the circuits, Solidity in the contracts, a verifier generated by a proving toolchain, and EVM bytecode. In [The Final Form of Software Development](https://blog.zksecurity.xyz/posts/end-coding/), Yoichi Hirai argues for removing the joints: agents write the assembly and prove it in Lean, with no high-level language and no compiler to trust. We think it's worth exploring, and there's a trade-off in it. Assembly and proofs are legible to machines and almost nobody else; auditors, operators and integrators read neither. We want a readable specification, code and proofs generated from it, and checked connections between them. If agents write code and proofs, the one thing a person still writes is what the system should do, which the business owns and understands. Many systems holding money today keep business logic only in code, and none of this reaches them until someone writes the spec down.

### Related work

Machine-checked verification of blockchain and zero-knowledge systems has gotten busy, much of it in Lean. One event this year explains why. In May, a researcher using an AI model with a custom audit harness found a counterfeiting flaw in Zcash's Orchard pool that had sat there since 2022 through years of scrutiny: under the right conditions, a valid-looking proof could mint shielded ZEC out of nothing. An emergency fix went out in June, and Ironwood followed in July with the circuit proved in Lean by Project Tachyon, with contributions from zkSecurity and ZODL, and a concrete knowledge-soundness bound in the algebraic group and random oracle models.[^12] That flaw lived in the circuit, below the model, so a ledger theorem like ours would not have seen it. The compiled-circuit proofs of the sum rules are the layer that looks for it, and value conservation is what it broke. It is part of why we started where we did.

Three projects sit closest to ours. [soispoke/verified-shielded-pool](https://github.com/soispoke/verified-shielded-pool) proves the whole spend relation of a minimal pool over 14,802 pinned constraints, both ways, hash included, so it goes deeper into the circuit than we did; its chain half is still open. StarkWare's [STRK20](https://starkware.co/blog/strk20-formal-verification/) proves over 230 theorems about a privacy-pool protocol model in Lean, under a [globally injective hash](https://github.com/starkware-libs/starknet-privacy/tree/main/lean), and stops at the model. LFG Labs' [Verity](https://github.com/lfglabs-dev/verity) writes contracts in a small language inside Lean, with compiler theorems down to Yul that hold under stated conditions, the write-once-and-generate route in practice. The Ethereum Foundation's [Verified zkEVM programme](https://verified-zkevm.org/), zkSecurity's [Clean](https://clean.zksecurity.xyz), Reilabs' [Lampe](https://github.com/reilabs/lampe), Nethermind's [Clear](https://github.com/NethermindEth/Clear), now archived, and Runtime Verification's [deposit-contract proof](https://github.com/runtimeverification/deposit-contract-verification) each cover one layer.[^13] We worked the whole chain on one running system, checking each connection between layers or naming its assumption.

### What we proved, and what's next

Two spec rows gained "machine-checked (model)" beside "tested": proofs about a model of the rules, each naming its theorem, commit and premise. Below them: compiled-circuit and hash proofs, a verifier rebuilt byte for byte, bounded contract checks rule by rule, deployed bytes matching the commit. We still assume no hash collisions, a verifier that rejects false proofs, and agreement between contract and model. Every guarantee still depends on who holds the owner key.

Formal verification has come a long way in a short time. In a few weeks a small team, with AI agents writing the proofs and Lean checking them, took this pool from spec to deployed bytes; the theorems were the easy part. The joints stopped us: contract loops, the hash inside the circuit, a verifier no tool models yet, and a privacy statement that needs a fact about Poseidon we could not establish. These are tooling problems as much as research problems, and the tools move fast enough that we expect to close some on the next pass.

None of it works without the specification. Without numbered requirements there is nothing to prove, nothing to compare code against, and nothing for a reviewer to cite.

Everything here is open: the code, the model, the obligations board, the findings register, the Lampe proofs, the deployment checker, the Halmos and Kontrol harnesses, the Verus mirrors and the privacy models. If you build the verification tools, the table of what we ran into is our wish list. If you build systems holding other people's money on Ethereum, we think this is how: a spec with a guarantees table, proofs where the tools reach, and plain statements of what is still assumed. We'd like to work with you.

[^1]: Of the efforts in the related-work section, Ironwood, verified-shielded-pool, STRK20, Clean, Lampe, Clear and Verity are in Lean 4, as is most of the Verified zkEVM programme's work; the deposit-contract proof is in K.

[^2]: The campaign took four weeks of elapsed time, measured once; we did not count hours. "Measured once" in these notes means two things: the figure comes from a single run, and the model repository's gate does not rerun it. One person directed agents from two model families; a colleague reviewed the repository's pull requests, and a separate review checked the model's reading of the spec.

[^3]: The proofs rerun from a fresh clone: one command rebuilds them and fails on any unfinished proof, extra axiom or changed statement; a second plants cheats and checks that the gate catches every one. The README has the commands. The model is 470 lines. The gate covers 65 inventoried statements and runs in about a minute with the dependency cache warm. 17 refutation controls each make one documented change and show the theorem fails. All 26 planted cheats failed the gate, in 20 minutes. A reviewer runs the gate from a trusted base, not the candidate's own pins. The gate reads Lean's printed axiom list, not the kernel's, and is not proved to catch every cheat.

[^4]: The compiled-circuit check replays in 1,101 seconds from a fresh clone. A decoder and comparator check the printed instructions against the bytecode; both are reviewed code, not proofs. The translation from ACIR into Lean, its reading of each instruction and the mapping of inputs are trusted. Commit [`748884e`](https://github.com/ethsystems/pocs/commit/748884e) changed the transfer circuit and its verifier after `a04b8b3`; neither new file is covered.

[^5]: The hash package holds 155 theorems and checks in 33 seconds with dependencies cached. The Solidity half holds mostly by construction, since both sides read constants from the same text; the split into segments is a trusted step. The verifier rebuild takes 9 seconds with its reference string cached.

[^6]: The 36-rule board was measured once. Some rejection results assume a transaction gas cap. The circuit side of the board has two routes, the compiled constraints and a patched Lampe at source level that trusts the compiler but does prove the hash and Merkle equations; the two are not proved equivalent. The composition lemma goes through an abstract contract interface, with the circuit facts entering by citation; its premises also cover cryptography, the tree, the deployment and the client. Token behaviour, key secrecy and owner conduct are assumptions. The lemma was measured once.

[^7]: The client is 3,631 lines of Rust with 110 security-relevant functions at the pinned commit. Aeneas 22, Verus 96, overlap 8. The Verus mirrors are verbatim except for library stand-ins, and a script checks that per function. The client package in the model repository reruns the Verus check: 241 negative controls, 239 refuted, 2 stopped at the solver limit and each covered by a second, refuted control. The guards accept exactly 0 < amount < 2^128 for deposit and, for transfer, four amounts and two sums below 2^128 with equal sums; an earlier transfer sum check that wrapped at 2^256 was fixed before the pin. Five live encoders are Verus-checked in the public code. The rest was measured once.

[^8]: The deployment check reruns as one command from the model repository; any metadata difference fails it, so the match includes the metadata tail. The owner is the claimed one and no token is supported at the pinned block; the event checks say nothing about what the owner does next. The pool is at `0xABefB40982E399F979cfdc712E57e334eA2B10eA` on Sepolia.

[^9]: The statistical analysis excludes attackers holding keys or payloads, including counterparties who know note secrets. Its bounds and the toy negations were measured once.

[^10]: The audit was a ten-agent pipeline over the circuits, contracts and client: 31 findings, 1 Critical, 3 Medium, 15 Low, 12 Info. The Critical and one Medium were fixed within days, two Mediums deferred (one to the spec, one the timelock that came later), and the rest closed within three weeks. The spec was written the day of the audit and promoted to draft after a code-conformance review and a colleague's review of its pull request. An independent agent re-check of the fixes found one High, approval theft through an unauthorised funding address, fixed the same way. No external firm was involved, and there was no fuzzing.

[^11]: Our own count of the `soispoke/verified-shielded-pool` repository in October 2026: 654 Lean files, 161,700 lines. Measured once.

[^12]: The Zcash timeline from the [Zcash community forum](https://forum.zcashcommunity.com/t/the-orchard-counterfeiting-vulnerability-and-next-steps/56015) and [CoinDesk](https://www.coindesk.com/markets/2026/06/05/zcash-plummets-30-as-developer-reveals-a-major-bug-that-went-undetected-for-four-years): found 2026-05-29 by Taylor Hornby, engaged by Shielded Labs, with Claude Opus 4.8 and a custom harness, present since Orchard's activation in May 2022, fixed 2026-06-01, publicly disclosed 2026-06-04; exploitation before the fix cannot be ruled out. Ironwood activated 2026-07-28, per Sean Bowe and Tal Derei's [post of that day](https://tachyon.z.cash/blog/ironwood-verification-complete/).

[^13]: Each project above links to its own primary source. The descriptions follow those sources as we read them in October 2026.

[^14]: The epoch extension is specified by the PoC, not the core spec, which only points to it. The model (L5) carries its own hypothesis, binding full notes and keys within the run, and six theorems with three refutation controls: cross-epoch no double spend (a zero-amount ballast input excluded, because the circuit skips its chain check), frozen-root immutability, canonical append, chain-key binding, a one-way refinement of epoch-zero runs to the base model, and spendability after rollover as model liveness, not a payout claim.

[^15]: Since the February post, by origin. From the agent audit: reject any public input at or above the field modulus (the Critical: nullifier aliasing could double spend or mint) and amounts at or above 2^128; a fresh random salt for ballast notes (the Medium). From comparing code against spec: deposit binds the spending key and a funding address with a sender guard, the payload hash is bound to the proof, a proof length per input with range checks, u128 amounts, re-entrancy guards and event order. From this verification: one root per operation, so no intermediate root enters the window; client amount guards; per-call prover directories so the spending key no longer lands in a prover file. After the pinned commit: the unconditional range check on the ballast input's proof length in the transfer circuit, which changes the transfer verifier key, so the deployed pin no longer matches master; and the verifier timelock (propose, apply, cancel with a two-day delay, the proposed verifier's code hash pinned) with withdrawals of a removed token allowed through.

[^16]: The monolithic compiled-circuit check was killed at 3 GiB, the SMT probe at 10.3 GB; the Kontrol build needs 8 GiB; the laptop had 30 GiB. The per-circuit instruction counts are 7,662, 11,508 and 23,543. The unbounded Solidity hash check was stopped at 2,700 seconds. The toy instance of the composition lemma uses the hash a+b+1.

[^17]: Halmos found the banked-root bug in 0.13 seconds; measured once. The campaign's findings register has 80 rows, 29 of them our own claim errors, caught by judges from both model families, by reviewers and by Lean itself.
