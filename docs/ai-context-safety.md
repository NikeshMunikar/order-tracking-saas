# AI Context Safety and Recoverable Execution Protocol

**Document:** `docs/ai-context-safety.md`
**Status:** Governing
**Scope:** All AI-assisted implementation work in this repository

---

## 1. Purpose

This document defines the required behavior for AI coding agents when performing repository implementation work that may approach or exceed the agent's available context window.

Context exhaustion MUST be treated as a **recoverable execution event**, not as an acceptable way for an implementation stage to end.

The objective is to ensure that:

- implementation work is not abandoned in an ambiguous state;
- important reasoning is preserved before context is exhausted;
- partially completed work remains recoverable;
- a replacement AI agent can safely continue the work;
- incomplete work is never mistaken for completed work;
- official stage acceptance remains separate from recovery;
- Git remains the authoritative record of repository state.

This protocol supplements, but does not replace, the repository's existing architecture, security, development, testing, milestone, and stage-gate requirements.

---

# 2. Governing Principles

The following principles are mandatory.

### 2.1 Git is the source of truth for implementation state

The AI agent MUST treat the repository's actual Git state as authoritative for determining what has been implemented.

Conversation history MUST NOT be treated as the authoritative record of implementation state.

The agent MUST verify:

- current commit;
- branch;
- working-tree status;
- staged changes;
- unstaged changes;
- recent commits;
- relevant diffs;
- repository documentation.

An agent MUST NOT assume that something was completed merely because it was discussed, planned, or claimed in a previous conversation.

---

### 2.2 Context exhaustion is not stage completion

Reaching a context limit MUST NOT be interpreted as:

- successful completion;
- implicit approval;
- acceptance of the current implementation;
- permission to proceed to the next stage.

If context exhaustion occurs before all stage requirements are satisfied, the stage remains **INCOMPLETE**.

---

### 2.3 Safe recovery is more important than squeezing out additional implementation

When the agent determines that available context may be insufficient to safely complete the next substantial unit of work and its associated validation, the agent MUST prefer preserving a recoverable state over continuing implementation.

The agent MUST NOT intentionally consume the remaining context merely in an attempt to finish a stage.

---

### 2.4 Recovery state is not acceptance state

A recovery bundle represents a recoverable intermediate state.

It does NOT represent:

- stage completion;
- architectural approval;
- security approval;
- test acceptance;
- milestone completion.

Only the normal stage acceptance process can establish those states.

---

# 3. Context-Safety Gate

The **Context-Safety Gate** is the mandatory procedure activated when the agent determines that continuing substantial implementation may risk context exhaustion before the work can be safely completed and validated.

The agent SHOULD activate the gate conservatively.

When uncertain whether sufficient context remains to complete the next substantial operation and perform its required validation safely, the agent MUST prefer the Context-Safety Gate over continuing implementation.

---

## 3.1 Cost-Heuristic Checkpoint Triggers

The agent cannot reliably self-report remaining context or account quota.
Therefore the gate MUST be triggered by observable task shape, not by the
agent's subjective sense of running low.

The agent MUST checkpoint BEFORE starting any of the following, not after:

1. A loop of run → fail → fix → run repeated more than ~3 times without
   a checkpoint in between.
2. Any operation that will re-read more than ~5 files, or any single file
   over ~500 lines, since the last checkpoint.
3. A migration, schema change, or auth/security-sensitive change —
   checkpoint BEFORE starting it, not after, since these are the most
   expensive to redo if interrupted.
4. Starting a new logical unit of work (new feature, new module) when a
   checkpoint hasn't been made in the current unit yet.
5. Any task explicitly described by the user as "complex," "full,"
   "entire," or "whole codebase" — these are the highest-variance,
   hardest-to-predict-cost tasks and should be checkpointed BEFORE
   starting, with a plan posted first.

The agent MUST NOT wait for a feeling of context pressure. It MUST treat
checkpoint frequency as a function of task shape (above), not of
estimated remaining budget.

Additionally: before starting any task the user flags as heavy/complex,
the agent SHOULD state a rough relative cost estimate and proposed
checkpoint plan BEFORE executing — e.g. "this will likely take 3-4
tool-heavy steps; I'll checkpoint after step 2." This lets the human
decide whether to proceed in one pass or split it manually, rather than
discovering the cost after the fact.

---

## 3.2 Pre-Task Budget Declaration

For any task expected to involve more than ~5 tool calls or touch more
than one file, the agent MUST state, before starting:

- a one-line plan,
- an estimated relative cost (low / medium / high),
- the point at which it will checkpoint if the task runs long.
  The user may then choose to proceed as one pass, or explicitly request
  a smaller first step.

---

# 4. Context-Safety Gate Procedure

Once activated, the agent MUST follow this sequence.

## Step 1 — Stop starting new substantial work

The agent MUST stop beginning new implementation units.

It MUST NOT:

- start another unrelated feature;
- begin a large refactor;
- expand the scope;
- start the next stage;
- introduce additional improvements unrelated to recovery.

The objective becomes **preservation and recoverability**, not feature completion.

---

## Step 2 — Finish only the smallest active atomic operation

If the agent is already in the middle of a small, coherent operation, it MAY complete that operation if doing so is safe.

Examples:

- finishing a currently edited function;
- completing a small import correction;
- completing a currently running file modification;
- fixing an immediately obvious syntax error caused by the current operation.

The agent MUST NOT begin a new substantial implementation unit merely because the current one has finished.

If completing the current operation itself is unsafe due to context constraints, the agent SHOULD preserve the current state without attempting further implementation.

---

## Step 3 — Inspect repository state

The agent MUST inspect the actual repository state.

At minimum:

```bash
git status
git log --oneline -15
git diff --stat
git diff
```

If staged changes exist, the agent MUST also inspect the staged state as appropriate.

The purpose is to establish exactly what exists independently of conversation memory.

---

## Step 4 — Validate the recoverable state

The agent MUST run the most relevant validation that can reasonably be completed within the available context.

Examples include:

- unit tests;
- targeted tests;
- type checking;
- linting;
- schema validation;
- static security checks;
- relevant build checks.

The agent MUST NOT claim full stage validation if only partial validation was performed.

Validation results MUST distinguish between:

- passed;
- failed;
- not run;
- unavailable due to environment limitations.

---

# 5. Recovery Checkpoint

Before stopping, the agent MUST create or update a concise recovery checkpoint.

The checkpoint SHOULD be stored in:

```text
ai-context/
```

or another repository location explicitly designated by the project's AI-agent governance.

The checkpoint MUST clearly indicate that the stage is incomplete.

A recovery checkpoint MUST contain, at minimum:

```text
Stage:
Sub-stage:

Active session: <name>
Started: <timestamp>
Status: IN PROGRESS / HANDED OFF
Handoff status: READY FOR NEXT SESSION / DO NOT START YET

Completed:
- ...

In progress:
- ...

Incomplete:
- ...

Files changed:
- ...

Tests/validation performed:
- ...

Validation results:
- ...

Known failures:
- ...

Known security concerns:
- ...

Unresolved decisions:
- ...

Current Git commit:
- ...

Working-tree state:
- ...

Exact next action:
- ...
```

The checkpoint SHOULD contain only information necessary for safe recovery.

It MUST NOT become a substitute for architectural documentation or a second source of truth for project requirements.

---

# 6. Recovery Checkpoint Rules

The recovery checkpoint MUST:

1. describe the **actual** repository state;
2. distinguish completed work from planned work;
3. identify incomplete operations;
4. identify unresolved security or correctness concerns;
5. identify the exact next recommended action;
6. reference the current Git state;
7. explicitly state that the stage is incomplete.

The checkpoint MUST NOT:

- claim unimplemented functionality is complete;
- silently change project requirements;
- override `MASTER_SPEC.md`;
- introduce new architectural decisions without authorization;
- mark a stage accepted;
- conceal known failures.

---

# 7. WIP Git Commit

If the working tree contains coherent, recoverable implementation work, the agent SHOULD create a WIP commit before stopping.

A WIP commit MUST represent a recoverable repository state.

It MUST NOT be used to falsely represent stage completion.

Recommended format:

```text
wip(<milestone>): preserve recoverable implementation state
```

or, when more specific:

```text
wip(m2-stage2): preserve authorization implementation state
```

The commit message SHOULD make it clear that the work is incomplete.

---

## 7.1 WIP commit requirements

Before creating the WIP commit, the agent MUST:

1. inspect the diff;
2. ensure no secrets are included;
3. ensure unrelated files are not accidentally committed;
4. ensure the repository remains recoverable;
5. avoid committing generated or prohibited artifacts;
6. avoid modifying immutable governing documents unless explicitly required by the current stage.

The agent MUST NOT commit:

- `.env`;
- credentials;
- passwords;
- private keys;
- API secrets;
- database dumps containing sensitive data;
- temporary credentials;
- unrelated local artifacts.

---

# 8. Recovery Bundle

After preserving the recoverable Git state, the agent SHOULD create a Git recovery bundle.

Naming convention:

```text
order-tracking-saas-<milestone>-<stage>-recovery-<sequence>.bundle
```

Example:

```text
order-tracking-saas-m2-stage2-recovery-01.bundle
```

The recovery bundle MUST represent the state at which the agent intentionally stopped.

---

## 8.1 Recovery bundle requirements

Before reporting the recovery bundle as complete, the agent MUST verify:

```bash
git bundle verify <bundle-file>
```

The agent SHOULD also verify that the intended recovery commit is present in the bundle.

The bundle MUST be treated as a transfer artifact, not as evidence of stage acceptance.

---

# 9. Recovery Bundle Versus Official Stage Bundle

The repository uses two distinct bundle types.

## 9.1 Recovery bundle

Example:

```text
order-tracking-saas-m2-stage2-recovery-01.bundle
```

Meaning:

> The implementation is incomplete but has been preserved in a recoverable state.

A recovery bundle MUST NOT be described as a completed stage.

---

## 9.2 Official stage bundle

Example:

```text
order-tracking-saas-m2-stage2.bundle
```

Meaning:

> The stage has completed its implementation, validation, security review, documentation requirements, and acceptance criteria.

An official stage bundle MUST only be created after the normal stage completion process has succeeded.

---

# 10. Final Stage Completion

A stage MAY be declared complete only when its normal acceptance criteria have been satisfied.

The final stage process MUST include, as applicable:

1. implementation completion;
2. required tests;
3. type checking;
4. linting;
5. build verification;
6. security verification;
7. database/schema verification;
8. documentation updates;
9. repository-state verification;
10. Git diff review;
11. governing-document compliance review;
12. confirmation that prohibited scope has not been introduced;
13. final clean stage commit;
14. official stage bundle creation;
15. bundle verification.

Only then may the agent report:

```text
STAGE COMPLETE
```

---

# 11. Checkpoint Frequency

The agent SHOULD create or update checkpoints after meaningful implementation milestones.

Examples:

- completing a major service layer;
- completing authorization logic;
- completing a security-sensitive operation;
- completing a database migration;
- completing invitation/token logic;
- completing concurrency control;
- completing a major test group.

The agent SHOULD also checkpoint **before beginning unusually large, risky, or security-sensitive work** when doing so materially improves recoverability.

The agent MUST NOT wait until the context limit is imminent if a coherent recoverable checkpoint can reasonably be created earlier.

---

# 12. Atomic Work Preference

Long implementation tasks SHOULD be divided into coherent, recoverable units.

Where practical, the agent SHOULD structure work as:

```text
Plan
↓
Implement one coherent unit
↓
Validate
↓
Checkpoint
↓
Continue
```

rather than:

```text
Implement everything
↓
Validate everything
↓
Document everything
```

This reduces the amount of work that can become unrecoverable during a context boundary.

---

# 13. Security-Sensitive Work

The agent MUST be especially conservative when working on:

- authentication;
- authorization;
- tenant isolation;
- password handling;
- session handling;
- invitation tokens;
- access control;
- database constraints;
- concurrency-sensitive mutations;
- secrets;
- security boundaries.

If context becomes constrained while performing security-sensitive work, the agent MUST prefer preservation and review over additional implementation.

The agent MUST NOT leave an unresolved security-sensitive change falsely represented as complete.

The recovery checkpoint MUST explicitly identify any unresolved security concern.

---

# 14. Database and Migration Safety

When context becomes constrained during database-related work, the agent MUST clearly record:

- schema changes made;
- migration files created or modified;
- whether migrations were applied;
- database state if known;
- validation performed;
- known differences between repository and database state;
- any manual database operations performed.

The agent MUST NOT claim migration completion when the migration state has not been verified.

If a migration has been partially authored but not safely validated, that condition MUST be recorded explicitly.

---

# 15. No Silent Scope Expansion

Context recovery MUST NOT become an opportunity to introduce additional functionality.

A replacement agent MUST continue only the currently authorized stage.

It MUST NOT:

- begin the next milestone;
- implement deferred features;
- add speculative abstractions;
- introduce distributed infrastructure;
- create generic permission systems without authorization;
- implement features listed in `DO_NOT_BUILD.md`;
- modify `MASTER_SPEC.md` to accommodate implementation difficulties.

---

# 16. Replacement Agent Recovery Procedure

When a new AI coding session takes over after a context boundary, it MUST assume that the previous agent may have stopped at any point.

The replacement agent MUST NOT rely on conversational claims such as:

> "The previous agent already finished this."

Instead it MUST reconstruct the state from the repository.

At minimum it MUST inspect:

```bash
git status
git log --oneline -15
git diff --stat
git diff
```

It MUST then read:

1. governing project documentation;
2. the recovery checkpoint, if present;
3. relevant stage documentation;
4. relevant implementation files;
5. relevant tests.

If a recovery bundle was supplied, the agent MUST verify and inspect that bundle before continuing.

---

# 17. Recovery Validation

Before continuing implementation, the replacement agent MUST determine:

- what was actually completed;
- what was partially completed;
- what remains;
- which tests passed;
- which tests failed;
- which tests were not run;
- whether the current code contains incomplete changes;
- whether any security-sensitive work is unresolved;
- whether the current repository state is consistent with the approved architecture.

The replacement agent MUST NOT automatically reset, revert, delete, or overwrite previous work merely because it is incomplete.

It MUST first understand the state.

---

# 18. Recovery and Stage Gates

A recovery event does not advance the project.

For example:

```text
M2 Stage 2
    ↓
Context limit
    ↓
Recovery bundle
    ↓
New agent
    ↓
Continue M2 Stage 2
```

The project remains in:

```text
M2 Stage 2 — INCOMPLETE
```

until the normal Stage 2 acceptance gate is satisfied.

Only after acceptance may the project transition to:

```text
M2 Stage 3 — AUTHORIZED
```

or the next applicable stage.

---

# 19. No Implicit Acceptance

The following MUST NOT be interpreted as stage acceptance:

- context exhaustion;
- creation of a recovery checkpoint;
- creation of a WIP commit;
- creation of a recovery bundle;
- passing partial tests;
- a clean working tree;
- a successful build of incomplete functionality;
- a previous agent's statement that the work is "basically complete."

Acceptance requires explicit satisfaction of the project's defined stage criteria.

---

# 20. Bundle Integrity

All bundles used for project transfer MUST be verified before being reported as usable.

For an official bundle:

```bash
git bundle verify <bundle-file>
```

For a recovery bundle:

```bash
git bundle verify <bundle-file>
```

The agent MUST report:

- bundle filename;
- bundle verification result;
- commit contained in the bundle;
- whether it is a recovery or official stage bundle.

---

# 21. Artifact Hygiene

Recovery artifacts MUST NOT introduce repository contamination.

Unless explicitly required by project governance:

- recovery bundles MUST NOT be committed into the source repository;
- local database files MUST NOT be committed;
- `.env` files MUST NOT be committed;
- credentials MUST NOT be included;
- temporary logs MUST NOT be committed;
- generated dependency directories MUST NOT be committed.

Recovery bundles are external transfer artifacts unless the repository explicitly specifies otherwise.

---

# 22. Reporting Requirements

When the agent stops because of the Context-Safety Gate, its final report MUST be concise and unambiguous.

It MUST state:

```text
STATUS: STAGE INCOMPLETE — RECOVERY SAVED

Stage:
Sub-stage:
Handoff status: DO NOT START YET

Completed:
- ...

Incomplete:
- ...

Current Git commit:
- ...

Validation:
- ...

Known issues:
- ...

Recovery checkpoint:
- ...

Recovery bundle:
- ...

Next action:
- ...
```

The report MUST NOT use language implying successful completion.

---

# 23. Normal Completion Reporting

When the stage is genuinely complete, the agent MUST clearly distinguish that from a recovery event.

Example:

```text
STATUS: STAGE COMPLETE

Stage:
Final commit:
Handoff status: READY FOR NEXT SESSION

Validation:
- ...

Security checks:
- ...

Documentation:
- ...

Official bundle:
- ...

Bundle verification:
- ...

Next authorized stage:
- ...
```

---

# 24. Recovery Priority

When deciding between continuing implementation and preserving state, the priority order is:

1. Preserve repository integrity.
2. Preserve security and correctness.
3. Preserve recoverability.
4. Record actual state.
5. Validate what can safely be validated.
6. Create recovery artifacts.
7. Stop.
8. Continue implementation only in a fresh context.

The agent MUST NOT prioritize apparent completion over recoverability.

---

# 25. Relationship to Existing Governance

This protocol does not override any higher-level project authority.

The following remain authoritative according to their existing governance rules:

- `MASTER_SPEC.md`
- approved architecture decisions;
- security requirements;
- `DO_NOT_BUILD.md`;
- milestone scope;
- stage acceptance criteria;
- database constraints;
- repository security policies.

If a recovery checkpoint conflicts with governing documentation, the governing documentation takes precedence.

A recovery checkpoint records state; it does not create authority.

---

# 26. Mandatory Agent Rule

The following rule is mandatory for all AI coding agents:

> **Never allow the context window to become the only place where the state of important implementation work exists.**

Before context becomes unsafe, preserve enough information in Git, repository checkpoints, and recovery artifacts for another agent to reconstruct the work without relying on the previous conversation.

The agent MUST prefer an early, explicit, recoverable stop over an uncontrolled context exhaustion event.

---

# 27. Summary Workflow

### Normal implementation

```text
Stage authorized
      ↓
Plan
      ↓
Implement
      ↓
Meaningful milestone
      ↓
Checkpoint
      ↓
Continue
      ↓
Complete implementation
      ↓
Full validation
      ↓
Security review
      ↓
Final clean commit
      ↓
Official stage bundle
      ↓
Bundle verification
      ↓
Stage acceptance
```

### Context becomes unsafe

```text
Implementation in progress
      ↓
Context-Safety Gate
      ↓
Stop new substantial work
      ↓
Finish smallest safe atomic operation
      ↓
Inspect Git state
      ↓
Run relevant validation
      ↓
Create/update recovery checkpoint
      ↓
Create WIP commit if recoverable
      ↓
Create recovery bundle
      ↓
Verify bundle
      ↓
STOP
```

### New AI session

```text
Recovery bundle / repository state
      ↓
Inspect Git
      ↓
Read recovery checkpoint
      ↓
Read governing documentation
      ↓
Verify actual implementation state
      ↓
Continue SAME stage
      ↓
Complete normal validation
      ↓
Final clean stage commit
      ↓
Official stage bundle
      ↓
Acceptance
```

---

## 28. Core Rule

**A context limit must never be allowed to decide the state of the project.**

The AI agent decides when to stop safely.

Git records what actually exists.

The recovery checkpoint records what still needs to happen.

The recovery bundle preserves the state for another session.

The stage gate determines whether the work is actually complete.
