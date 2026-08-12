# Skill Evolution quality contract

This contract belongs to Skill Evolution. It defines when evidence justifies a proposal and what a review artifact must contain. It is self-contained and does not import another Skill's rubric or validator.

## Role boundary

Skill Evolution owns the transition from observed behavior to a reviewable improvement proposal. It does not own authoring, package mutation, numeric audit scoring, installation, registry changes, Git writes, or publication.

An audit, test result, or external report may be used as evidence. None is required, and none grants permission to apply a change.

## Invariants

| ID | Invariant | Pass condition |
| --- | --- | --- |
| `SE-E1` | Evidence fidelity | Every proposed change cites an observed correction, reproduced failure, routing miss, verification gap, or repeated pattern. Facts and inference are labeled separately. |
| `SE-G1` | Generalization | The proposal explains why the lesson is reusable and why transient state should not be encoded. Weak evidence results in `no candidate`. |
| `SE-C1` | Candidate comparison | A proposal compares the smallest viable candidate with at least one safer or evidence-seeking alternative. |
| `SE-T1` | Target precision | Each candidate names the smallest durable surface and avoids unrelated files. |
| `SE-V1` | Regression evidence | Each intended behavior change has a focused validation or replay expectation. |
| `SE-A1` | Approval boundary | `mode` is `proposal-only`, `approval.required` is true, `approval.status` is `pending`, and `apply_plan` is null. |
| `SE-P1` | Portability | Runtime code uses Node.js standard-library modules and has no required sibling Skill, private absolute path, credential, or host-specific registry. |
| `SE-M1` | Maturity restraint | Any maturity advice names the observed facts, additional gates, and missing evidence. A proposal never changes maturity state. |

Failure of `SE-A1` or `SE-P1` blocks the artifact. The other failures require revision or a `no candidate` result.

## Signal decision

The bundled generator uses a deterministic signal score to organize evidence, not to decide truth. Direct user corrections carry more weight than generic workflow words. A score above the configured threshold permits proposal generation, but a reviewer must still test `SE-E1` and `SE-G1`.

Strong evidence includes:

- an exact user correction that changes future behavior;
- the same failure in more than one session;
- a reproduced route or execution failure;
- an explicit validation miss with a confirmed fix;
- a stable workflow repeatedly performed by hand.

Weak evidence includes task length by itself, a keyword mention, a single stylistic preference, or an unverified model inference.

## Proposal schema

The machine-readable artifact uses `schema_version: 2` and contains:

- `artifact_type: "skill-evolution-proposal"`;
- `status: "proposal"` or `"no-candidate"`;
- `mode: "proposal-only"`;
- `source`, `signal_assessment`, and redacted `evidence`;
- `target` and `maturity_impact`;
- `candidates` and `recommended_candidate` when status is `proposal`;
- `validation`, `approval`, and `apply_plan: null`.

A candidate contains an ID, label, target surface, intended behavior, rationale, evidence IDs, validation expectations, risk, and tradeoff. The proposal may describe an intended diff, but must not contain an executable apply plan.

## Maturity vocabulary

Use the following local vocabulary so this Skill remains shareable by itself:

| Mode | Evidence expectation |
| --- | --- |
| `scaffold` | Valid structure and one realistic use; routing evidence may be incomplete. |
| `production` | Repeatable workflow, working deterministic scripts, and positive, negative, near-neighbor, held-out, and pressure cases. |
| `library` | Production evidence plus portability, explicit exclusions, and distribution-safe metadata. |
| `governed` | Library evidence plus ownership, review, permission, rollback, and public-claim boundaries. |

Recommend the lowest mode supported by evidence. Use `observe more evidence` when the additional gates are not yet demonstrated.

## Acceptance evidence

A standalone release of Skill Evolution should provide:

1. Node.js syntax checks for every runtime script.
2. Tests for transcript extraction, redaction, proposal-only schema, no-candidate behavior, and package validation.
3. Balanced route fixtures with no required sibling Skill in `should_trigger`.
4. A self-validation result with no errors.
5. A fresh proposal fixture that passes the same validator.

These checks establish package and proposal behavior. They do not establish the quality of a future applied change.
