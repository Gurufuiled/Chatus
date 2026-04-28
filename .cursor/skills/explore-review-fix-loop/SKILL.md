---
name: explore-review-fix-loop
description: Investigate code with an explorer, then have reviewer audit the found code for issues; if issues exist, worker fixes them and reviewer re-audits. Repeats until reviewer approves or max fix cycles reached. Use for tasks like "investigate how message delivery works and fix any bugs you find".
---

# Explore → Reviewer → [Worker → Reviewer] Loop

Use this workflow when the user asks to **investigate** how something works in the codebase and to **find and fix** any bugs in that area (e.g. "исследуй как устроена передача сообщений и исправь ошибки", "explore message delivery and fix issues").

## Workflow

### Phase 1 — Explorer (investigate)

Launch an **explorer** subagent (`subagent_type: "explore"`) with:

- The investigation question or task (e.g. "How is message delivery implemented in this messenger? Trace sender → server/WS → receiver → storage. List all relevant files and key code paths.")
- Request to follow the explorer agent instructions and output the structured report (summary, files and locations, key code paths, snippets).

Wait for the explorer to finish. You will get a report with a list of **files and locations** to audit.

### Phase 2 — Reviewer (audit the explored code)

Launch a **reviewer** subagent (`subagent_type: "reviewer"`) with:

- The explorer's full report (copy it).
- The list of files from the report.
- Instruction: "Audit the code in these files for correctness, security, and robustness. The explorer described the flow above; check that flow for bugs, missing error handling, and logic errors. Use your usual severity labels (Critical, Warning, Suggestion) and output format (Review summary, Issues, Positives, Verdict)."

Wait for the reviewer to finish.

### Phase 3 — Worker (fix issues), then Reviewer again — repeat until clean

- If the reviewer's verdict is **"Approve"** or **"Approve with minor fixes"** and there are **no 🔴 Critical** issues → **DONE**. Report to the user: what was explored, what was found, that no critical issues were found (or list minor ones).
- If the reviewer's verdict is **"Request changes"** or there are **any 🔴 Critical** (or you decide to fix 🟡 Warnings) → continue:

**3a. Worker (fix)**

Launch a **worker** subagent with:

- The explorer's report (context).
- The **reviewer's full output** (copy verbatim).
- Instruction: "Fix all 🔴 Critical and all 🟡 Warning issues listed in the review above. Do not change code that was not mentioned. Re-run build/lint/tests after edits."

Wait for the worker to finish.

**3b. Reviewer again (re-audit)**

Launch a **reviewer** subagent with:

- Summary: "The worker just applied fixes for the issues you reported. The modified files are: [list files the worker changed]."
- The list of modified files.
- Instruction: "Review the updated code. Confirm that Critical and Warning issues are resolved. If new issues appeared or something is still wrong, list them with severity and Verdict. If everything is fine, verdict Approve."

Wait for the reviewer.

**3c. Loop or stop**

- **Max fix cycles:** do **at most 3** worker passes (3 full "Worker → Reviewer" cycles). If after 3 passes the reviewer still requests changes, stop and report to the user with the last reviewer output and a short summary of what was fixed and what remains.
- If reviewer verdict is **Approve** (or Approve with minor fixes) and no 🔴 Critical → **DONE**. Report to the user.
- If reviewer still has **Request changes** or 🔴 Critical and cycles left → go back to **3a** (Worker with the latest reviewer output).

## Decision tree

```
User task: "investigate X and fix errors"
    │
    ▼
[Explorer] investigate X → report + file list
    │
    ▼
[Reviewer] audit code in those files
    │
    ├─ Approve / no 🔴 → DONE (report to user)
    │
    └─ Request changes OR 🔴 present
            │
            ▼
       [Worker] fix all 🔴 and 🟡
            │
            ▼
       [Reviewer] re-audit fixed code
            │
            ├─ Approve / no 🔴 → DONE
            │
            └─ Still issues AND cycles left (< 3) → repeat Worker → Reviewer
            │
            └─ No cycles left → DONE (report what’s left)
```

## Rules

- Always run Explorer first, then Reviewer. Do not skip the first review.
- Pass the **explorer's full report** to the reviewer so they know the flow they are auditing.
- Pass the **reviewer's full output** to the worker each time — do not summarize.
- Cap at **3** worker→reviewer fix cycles to avoid infinite loops.
- After finishing, report to the user in one short summary: what was explored, what issues were found, what was fixed, and what (if anything) remains.