# big-task

Execute a large-task orchestration flow: break big tasks into small ones, then run each task through the chain **worker → reviewer → (worker if errors) → tester**.

## Usage

- `/big-task <goal text>`
- `/big-task phase=4 <goal text>`
- `/big-task prompts=4.1-4.4 <goal text>`
- `/big-task prompts=2.1,2.3,3.2 <goal text>`

By default, each selected `## Промпт X.Y` block from @docs/realize.md is executed as a separate task. Tasks are processed **one at a time** through the chain.

## Execution chain (per task)

```
worker → reviewer → [if errors: same worker → reviewer] → tester
```

1. **worker** (@.cursor/agents/worker.md) implements the task.
2. **reviewer** (@.cursor/agents/reviewer.md) audits the changes.
3. If reviewer finds issues: send findings back to the **same worker** who did the task → **reviewer** again. Repeat up to 3 cycles until reviewer approves.
4. When reviewer approves: send to **tester** (@.cursor/agents/tester.md).
5. If tester verdict is FAIL: return failures to **worker** and re-test (up to 3 cycles).

## Steps

1. Treat everything after `/big-task` as the high-level goal and optional scope.
2. Launch the `planer` subagent using @.cursor/agents/planer.md.
3. Instruct `planer` to:
   - parse @docs/realize.md by `## Фаза` and `## Промпт` (or decompose the goal if no prompts exist),
   - split work into small, prompt-sized tasks,
   - keep strict mapping `one prompt block -> one task -> one worker handoff`,
   - execute **one task at a time** in dependency order.
4. For **each** planned task (sequentially):
   - Launch **worker** with the task.
   - Launch **reviewer** on the produced changes.
   - If reviewer finds issues: send them back to the **same worker** (not a new one), then **reviewer** again. Max 3 review-fix cycles.
   - When reviewer approves: launch **tester**.
   - If tester verdict is FAIL: return failures to **worker**, re-test. Max 3 test-fix cycles.
   - Only after the task passes reviewer and tester, proceed to the next task.
5. Tester layer selection must follow changed files:
   - `rust-core/**` -> rust-core tests
   - `mobile/**` -> mobile unit/component tests
   - `backend/rust-server/**` -> backend API/integration tests
   - bridge/native changes -> bridge contract checks
   - E2E only when explicitly requested or required for final confidence
6. After completion, report:
   - task breakdown,
   - what was implemented,
   - reviewer findings and fixes,
   - tester scopes and PASS/FAIL results,
   - any blockers or remaining manual actions.

## Rules

- Use the subagent launcher for `planer`, `worker`, `reviewer`, and `tester`.
- Process tasks **one at a time**; do not run multiple tasks in parallel.
- Do not skip reviewer before tester.
- When reviewer finds errors, send back to the **same worker** who implemented that task.
- Do not mark a task done with unresolved critical review issues or failed required tests.
- Do not batch multiple prompts into one worker task unless the user explicitly asks to batch.
