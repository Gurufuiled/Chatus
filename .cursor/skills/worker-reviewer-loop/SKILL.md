---
name: worker-reviewer-loop
description: Orchestrates a two-phase subagent workflow for development tasks: a worker subagent implements the task, then a reviewer subagent audits the result, and if critical issues or optimizations are found the worker is relaunched to address them. Use whenever implementing a feature, creating code, refactoring, or completing any development task that benefits from an automated quality gate.
---

# Worker → Reviewer → Worker Loop

When asked to implement, create, or develop anything, always run this three-phase loop instead of doing the work inline.

## Workflow

### Phase 1 — Worker (implement)

Launch a `worker` subagent (`subagent_type: "worker"`) with the full task description.

Provide the worker with:
- The complete task requirements
- Relevant file paths and context
- Any constraints or conventions to follow

Wait for the worker to finish before continuing.

### Phase 2 — Reviewer (audit)

Launch a `reviewer` subagent (`subagent_type: "reviewer"`) immediately after the worker completes.

Provide the reviewer with:
- A summary of what the worker was asked to do
- The list of files that were created or modified
- A request to apply the full review checklist

The reviewer will classify findings as:
- 🔴 **Critical** — must be fixed
- 🟡 **Warning** — should be fixed
- 🟢 **Suggestion** — optional

### Phase 3 — Worker again (fix, conditional)

**Only run this phase if** the reviewer's verdict is "Request changes" or there are any 🔴 Critical issues or significant 🟡 Warnings.

Launch a second `worker` subagent with:
- The original task description
- The reviewer's full output (copy it verbatim)
- An explicit instruction to address every 🔴 Critical issue and every 🟡 Warning listed

Skip this phase if the reviewer verdict is "Approve" or "Approve with minor fixes" with no Critical issues.

## Decision tree

```
Task received
    │
    ▼
[Worker] implement task
    │
    ▼
[Reviewer] audit result
    │
    ├─ Approve / Approve with minor fixes, no 🔴 → DONE
    │
    └─ Request changes OR any 🔴 present
            │
            ▼
       [Worker] fix all 🔴 and 🟡 issues
            │
            ▼
           DONE
```

## Rules

- Never skip the reviewer phase, even for small changes.
- Never run a third worker pass unless the user explicitly asks for another iteration.
- Always pass the reviewer's **complete output** to the second worker — do not summarize or paraphrase.
- After the loop completes, report to the user: what was implemented, what issues were found, and what was fixed.
