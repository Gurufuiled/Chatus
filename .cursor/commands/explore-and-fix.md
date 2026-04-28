# explore-and-fix

Execute the **explore → reviewer → [worker → reviewer]…** loop from the `explore-review-fix-loop` skill: investigate code, audit for issues, fix them, re-audit until clean or max cycles.

## Steps

1. Read and follow @.cursor/skills/explore-review-fix-loop/SKILL.md in full.
2. Treat everything the user wrote after `/explore-and-fix` as the **investigation task** (e.g. "how is message delivery implemented in our messenger", "исследуй передачу сообщений").
3. Run the full workflow:
   - **Phase 1** — launch an **explorer** subagent (`subagent_type: "explore"`) with the task; use @.cursor/agents/explorer.md so the explorer outputs the structured report.
   - **Phase 2** — launch a **reviewer** subagent with the explorer's report and file list to audit the code for errors.
   - **Phase 3** — if the reviewer found 🔴 Critical or requested changes: launch **worker** to fix, then **reviewer** again; repeat until reviewer approves or up to 3 fix cycles.
4. After the loop completes, report to the user: what was explored, what issues were found, what was fixed, and what (if anything) remains.
