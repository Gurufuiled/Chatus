# implement

Execute the **worker → reviewer → worker** development loop from the `worker-reviewer-loop` skill.

## Steps

1. Read and follow @.cursor/skills/worker-reviewer-loop/SKILL.md in full.
2. Treat everything the user wrote after `/implement` as the task description.
3. Run all three phases of the loop exactly as the skill describes:
   - **Phase 1** — launch a `worker` subagent to implement the task.
   - **Phase 2** — launch a `reviewer` subagent to audit the result.
   - **Phase 3** — if the reviewer finds 🔴 Critical issues or requests changes, launch a second `worker` subagent to fix them.
4. After the loop completes, report to the user: what was built, what issues were found, and what was fixed.
