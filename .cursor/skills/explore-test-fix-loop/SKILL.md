---
name: explore-test-fix-loop
description: Investigate code with explorer, validate behavior with tester, and if tests fail run worker fixes then tester re-check. Repeats until PASS or max cycles reached.
---

# Explorer -> Tester -> [Worker -> Tester] Loop

Use this workflow when the user asks to investigate a bug and resolve it with test-backed validation.

## Workflow

### Phase 1 - Explorer (locate code and flow)

Launch an **explorer** subagent (`subagent_type: "explore"`) with:
- The user bug/task description.
- Instruction to map relevant files, key call paths, and risky areas.
- Request for a structured report suitable for testing and fixing.

Wait for the explorer report.

### Phase 2 - Tester (run focused checks)

Launch a **tester** subagent (`subagent_type: "generalPurpose"`) with:
- Explorer full report.
- Task: run/describe the most relevant tests for this bug (API/Unit/UI/E2E as appropriate), then output PASS/FAIL.
- Instruction to include failing tests and actionable root causes.

Wait for tester result.

### Phase 3 - Worker (fix), then Tester again (re-test)

- If tester verdict is **PASS** -> DONE.
- If tester verdict is **FAIL** -> continue:

**3a. Worker (fix failures)**

Launch a **worker** subagent (`subagent_type: "worker"`) as a **separate task** (e.g. via the task/subagent launcher). Do **not** apply fixes inline in the same agent turn — the worker runs in its own context.

Pass to the worker:
- Explorer report (context).
- Tester full output (copy verbatim).
- Instruction: "Fix all test failures and root causes listed by tester. Keep changes scoped. Re-run relevant checks."

Wait for worker completion.

**3b. Tester again (re-validate)**

Launch a **tester** subagent (`subagent_type: "generalPurpose"`) with:
- Summary of worker changes and modified files.
- Instruction to re-run relevant checks and return PASS/FAIL.

Wait for tester verdict.

**3c. Loop or stop**

- Max fix cycles: up to **3** full `Worker -> Tester` rounds.
- Stop early when tester verdict is PASS.
- If still FAIL after 3 rounds, stop and report what remains.

## Decision tree

```text
User asks to test + fix bug
    |
    v
[Explorer] map code and paths
    |
    v
[Tester] run focused checks -> PASS/FAIL
    |
    +-- PASS -> DONE
    |
    +-- FAIL
          |
          v
      [Worker] fix failures
          |
          v
      [Tester] re-test -> PASS/FAIL
          |
          +-- PASS -> DONE
          +-- FAIL and cycles left -> repeat
          +-- FAIL and no cycles left -> DONE (report remaining)
```

## Rules

- Always start with Explorer before first Tester pass.
- Always pass tester full output to Worker without summarizing away failures.
- Cap at 3 fix cycles to avoid infinite loops.
- Final user report must include: explored scope, tests run, what failed, what was fixed, and residual risks.
