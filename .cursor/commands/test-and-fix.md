# test-and-fix

Execute the **explorer -> tester -> [worker -> tester]...** loop from the `explore-test-fix-loop` skill: find relevant code, run focused tests, fix failures, and re-test until PASS or max cycles.

## Steps

1. Read and follow @.cursor/skills/explore-test-fix-loop/SKILL.md in full.
2. Treat everything the user wrote after `/test-and-fix` as the bug/task description.
3. Run the full workflow:
   - **Phase 1** — launch an **explorer** subagent (`subagent_type: "explore"`) using @.cursor/agents/explorer.md output style.
   - **Phase 2** — launch a **tester** subagent (`subagent_type: "tester"` or `"generalPurpose"` with tester instructions) to run API/Unit/UI/E2E checks; get PASS/FAIL.
   - **Phase 3** — if tester verdict is **FAIL**:
     - **3a.** Launch a **worker** subagent (`subagent_type: "worker"`) in a **separate task** — do **not** apply fixes inline in this chat. Pass the explorer report and the **full tester output** to the worker; instruct it to fix all reported failures and root causes, then re-run checks.
     - **3b.** After the worker finishes, launch the **tester** subagent again to re-validate; repeat up to 3 fix cycles.
4. After loop completion, report to the user:
   - what explorer found,
   - what tests were run,
   - what failed,
   - what was fixed (by the worker subagent),
   - what remains (if anything).

## Rule

- **Worker must run as a subagent:** use the task/subagent launcher (e.g. `mcp_task` with `subagent_type: "worker"`). The worker runs in its own context and returns when done; only then run the tester again.
