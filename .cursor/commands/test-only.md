# test-only

Execute the **explorer -> tester** flow (without worker fixes): find relevant code and run focused tests to produce a PASS/FAIL diagnosis.

## Steps

1. Read and follow @.cursor/skills/explore-test-fix-loop/SKILL.md in full.
2. Treat everything the user wrote after `/test-only` as the bug/task description.
3. Run only these phases:
   - **Phase 1** — launch an **explorer** subagent (`subagent_type: "explore"`) using @.cursor/agents/explorer.md output style.
   - **Phase 2** — launch a **tester** subagent (`subagent_type: "generalPurpose"`) using @.cursor/agents/tester.md instructions; run API/Unit/UI/E2E checks relevant to the bug.
4. Do **not** launch worker in this command. Stop after tester verdict.
5. Report to the user:
   - what explorer found,
   - what tests were run,
   - pass/fail result,
   - exact failures and likely causes,
   - recommended next fixes.
