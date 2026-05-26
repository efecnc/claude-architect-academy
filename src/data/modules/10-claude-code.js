export default {
  id: 'claude-code',
  num: 10,
  title: 'Claude Code and Claude Agent SDK Workflows',
  summary: 'How Claude Code and the Claude Agent SDK work together: built-in tool selection, plan mode, sessions, CLAUDE.md memory hierarchy, hooks, subagents, and MCP scope — and the pitfalls that trip up even experienced practitioners.',
  estMinutes: 42,
  tags: ['Claude Code', 'Agent SDK', 'Workflows'],

  lessons: [
    {
      id: 'built-in-tools',
      title: 'Choosing the Right Built-in Tool',
      minutes: 6,
      body: `> **TL;DR** — Each built-in tool has one job. Grep reads *inside* files, Glob matches *filenames*, and dumping the whole repo into context before you know what matters is the fastest way to burn your budget.

Each built-in tool targets a distinct operation, and picking the wrong one does not just fail — it quietly spends the one resource an agent cannot reclaim: context budget. The split that matters most is the *search space* each tool indexes. **Grep** scans the bytes inside files; **Glob** matches filenames and paths; **Read** pulls one known file; **Task** delegates open-ended exploration to a subagent with its own context. Matching the tool to the operation is the difference between a precise lookup and a token-burning detour.

### The tool map

| Task | Best Tool |
|---|---|
| Search text *inside* files | **Grep** |
| Find files by path or name pattern | **Glob** |
| Read a file whose path you already know | **Read** |
| Make a targeted, unique in-place edit | **Edit** or **MultiEdit** |
| Replace an entire file | Read then **Write** |
| Run tests or shell commands | **Bash** |
| Delegate broad exploration or parallel work | **Task** (subagent) |

### Why the distinction matters (the "why" behind the table)

The deepest split is **Grep vs Glob**, and it confuses people because both feel like "search." But they search different *spaces*. Glob searches the **filesystem index** — names and paths — so it can answer "where are the test files?" with \`**/*.test.ts\`. Grep searches the **contents** — the bytes inside files — so it can answer "where is \`processPayment\` called?" Asking Glob to find a function call is asking the card catalog to tell you which sentences appear inside the books. It cannot; that is not what it indexes.

The second "why" is about **context economy**. Every file an agent reads consumes input tokens that it then carries on every subsequent turn (statelessness means the transcript is replayed). Reading 800 files upfront does not make the agent smarter — it dilutes the signal, pushes useful detail toward the context boundary where attention degrades, and costs money on every turn thereafter. So the discipline is **map first, read selectively**:

1. **Grep** for known anchors — route names, error codes, exported identifiers.
2. **Read** only the matching entry files.
3. Follow the **imports** to the core abstractions.
4. Trace **one or two** representative execution paths end-to-end.
5. Write a **scratchpad** of durable findings when the investigation runs long.

### Giving concrete context: weak vs strong

When you want the agent to imitate an existing pattern, *show* it the pattern instead of *describing* it.

**❌ Weak — vague style request**
> "Add the new repository the way we usually do it — follow our normal style."

The agent has nothing concrete to anchor on. It guesses, and its guess of "our style" is a generic average, not *your* convention.

**✅ Strong — concrete file reference**
> "Add a CustomerRepository following the exact pattern in
> @src/payments/repository.ts, and match the test layout in @docs/testing.md."

Now the agent reads a real example and mirrors the actual structure, naming, and error handling already in your codebase.

### Visual: search space, not just "search"

\`\`\`mermaid
flowchart LR
    Glob["Glob"] -->|searches| FN["File names and paths<br/>e.g. **/*.test.ts"]
    Grep["Grep"] -->|searches| FC["Text inside files<br/>e.g. processPayment"]
    Wrong["Wrong: Glob for processPayment"] -->|finds nothing useful| X["no results"]
    Right["Right: Grep for processPayment"] -->|finds| CS["every call site"]
\`\`\`

> ❓ **Check yourself:** A teammate runs \`Glob("**/*refundOrder*")\`, gets zero results, and concludes \`refundOrder\` is dead code. What did the empty result actually prove, and what should they have run?
>
> *(Only that no filename contains the substring \`refundOrder\` — Glob indexes paths, not file contents, so it says nothing about call sites. The identifier lives inside source bytes, so Grep is the correct tool; the "dead code" conclusion is unsupported.)*

### Key takeaways
- **Grep = inside files; Glob = filenames/paths.** Never use Glob to find code references.
- **Map first, read selectively.** Grep for anchors, follow imports — do not read the whole repo upfront.
- Point the agent at **concrete file references** (\`@path\`), not abstract style descriptions.`,
      principles: [
        "Grep searches text inside files; Glob matches filenames/paths only — never use Glob to find code references.",
        "Map first, read selectively: Grep for anchors, follow imports — don't load the whole repo upfront.",
        "Give concrete file references like @src/payments/repository.ts, not vague prose style descriptions.",
      ],
      pitfalls: [
        "Using Glob to find code references inside files — it only matches filenames, returning nothing useful.",
        "Reading the entire repository upfront floods context and burns tokens on every subsequent turn.",
      ],
    },
    {
      id: 'plan-mode-execution',
      title: 'Plan Mode vs Direct Execution',
      minutes: 6,
      body: `> **TL;DR** — Direct execution is for small, clear, low-risk changes; plan mode reads-only and waits for your approval, which is what you want for broad, architectural, or risky work.

The two modes differ in exactly one respect: whether a human approves the strategy before any file is written. Direct execution reads and edits as it goes; plan mode explores read-only, produces a plan, and blocks all writes until you approve it. The agent reasons identically either way — the only variable is the gate. You choose by blast radius: the larger the cost of being wrong, the more a review checkpoint earns its overhead.

### When direct execution is right

Direct execution (the default) reads and edits files as needed. Choose it when:
- The change is small and localized — one or two files.
- The target is unambiguous and the risk of getting it wrong is low.
- You want fast turnaround on a bug fix with a known, narrow root cause.

### When plan mode earns its overhead

Plan mode explores **read-only**, produces a plan, and waits for approval before touching disk. It adds real value when:
- The change spans many files or many teams.
- There are genuine **architectural choices** a human must weigh.
- The work involves **migrations** or breaking API changes.
- You need stakeholder sign-off before code lands.
- You want a read-only feasibility pass before writing a line.

In Claude Code, \`--permission-mode plan\` starts a session in plan mode, and in interactive sessions \`Shift+Tab\` toggles between modes.

### The "why": plan mode is a review *gate*, not a thinking boost

The reason plan mode exists is **workflow control** — it gates the transition from "thinking" to "doing" so a human can review the strategy and blast radius before any edit happens. The agent does not reason differently; it simply cannot write until you approve. That is its entire value, and also why using it for a one-line fix is pure overhead: there is no strategy worth gating.

### Production bugs: weak vs strong response

**❌ Weak — act fast because it is an emergency**
\`\`\`mermaid
flowchart LR
    A["Incident!"] -->|"jump straight to"| B["Direct edits on<br/>shared abstraction"]
    B -->|"silently"| C["Quick fix breaks<br/>three other services"]
\`\`\`
Emergencies create pressure to skip review — which is *exactly* when a narrow fix is most likely to break something broad.

**✅ Strong — gather evidence, then choose the mode by blast radius**
> 1. Collect stack trace, relevant source, logs, reproduction path.
> 2. Narrow + clear root cause? → implement DIRECTLY (fast, low risk).
> 3. Root cause touches a shared abstraction? → switch to PLAN MODE before expanding the change, so the broad impact is reviewed first.

### Visual: the decision tree

\`\`\`mermaid
flowchart TD
    A{"Is the change small,<br/>localized, low-risk?"} -->|yes| DE["DIRECT EXECUTION<br/>fast, no gate"]
    A -->|no| B{"Spans many files,<br/>architecture, migration,<br/>needs sign-off?"}
    B -->|yes| PM["PLAN MODE<br/>read-only then plan then approve"]
\`\`\`

> ❓ **Check yourself:** A colleague argues plan mode is pointless here because "the agent reasons just as well either way" while migrating 47 files to an object-relational mapper (ORM) whose query API forces several patterns to be redesigned. Where is their reasoning wrong?
>
> *(They are right that the model reasons identically, but that is not what plan mode buys you. Plan mode is a review gate, not a reasoning boost — on a high-blast-radius redesign it lets a human approve the strategy before any write lands, which is exactly what direct execution forfeits.)*

### Key takeaways
- **Direct execution** for small, localized, unambiguous, low-risk edits.
- **Plan mode** whenever the change spans files, has architectural implications, or needs approval.
- Emergencies are *when plan mode matters most* once the root cause reveals broad impact.`,
      principles: [
        "Use direct execution for small, localized, low-risk changes — plan mode overhead is not justified.",
        "Use plan mode when a change spans many files, involves architectural choices, or needs approval.",
      ],
      pitfalls: [
        "Using plan mode for trivial single-line fixes — it adds overhead with no safety benefit.",
        "Using direct execution for broad migrations — you lose the architecture review gate when you need it most.",
      ],
    },
    {
      id: 'plan-vs-thinking',
      title: 'Plan Mode vs Extended Thinking — Two Different Levers',
      minutes: 6,
      body: `> **TL;DR** — Plan mode controls *when the agent is allowed to act* (a workflow gate); extended thinking controls *how hard the model reasons* (a capability). Different problems, different levers.

These two get conflated because both feel like "more thinking before acting," but they operate on orthogonal axes. Plan mode is a session-level *permission* control: it gates whether the agent may write, independent of reasoning quality. Extended thinking is a *model capability*: it allocates more internal reasoning budget before the model responds, independent of whether writes are gated. One governs when action is allowed; the other governs how good the reasoning is. They compose freely, and the skill is matching the lever to the actual failure.

### Plan mode — a workflow-control lever

Plan mode gates the transition from exploration to implementation so a human can review the strategy before any file is touched. The agent reasons the same way internally; the difference is purely that **it cannot write until you approve**.

Reach for plan mode when the problem is **premature action** — the agent jumps straight into edits without surfacing trade-offs, alternatives, or blast radius.

### Extended thinking — a reasoning-quality lever

Extended thinking is a **model capability** that allocates more internal reasoning budget before the model responds. It improves quality on genuinely hard problems:
- Multi-step proofs or algorithmic derivations.
- Intricate code analysis with many interacting constraints.
- Ambiguous requirement reconciliation where the best interpretation is unclear.

Crucially, extended thinking **does not change whether the model acts or asks for approval.** You can have extended thinking fully enabled while the agent edits files directly with no gate at all.

### Why conflating them causes bugs

If the real problem is *premature action* and you reach for extended thinking, you get deeper reasoning followed by the same unreviewed edits — the gate you needed never appeared. If the real problem is *shallow analysis* and you reach for plan mode, you get a review gate in front of analysis that is still shallow. **Matching the lever to the problem is the whole skill.**

### Weak vs strong: an agent that edits before surfacing trade-offs

**❌ Weak — wrong lever**
> Problem: agent edits immediately without showing alternatives.
> Fix attempted: "enable extended thinking."
> Result: richer reasoning, but it STILL edits without approval. Gate missing.

**✅ Strong — right lever (and compose when needed)**
> Problem: agent edits immediately without showing alternatives.
> Fix: enable PLAN MODE — it now produces a plan and waits for approval.
> Bonus: if the analysis is ALSO shallow, add extended thinking so the plan you review is deeper. Gate + depth, each solving its own issue.

### Visual: orthogonal levers

\`\`\`mermaid
flowchart TD
    subgraph NoGate["Acts without approval — no gate"]
        DD["Direct + default<br/>shallow reasoning"]
        DE["Direct + extended thinking<br/>deep reasoning"]
    end
    subgraph Gate["Waits for approval — gate on"]
        PM["Plan mode<br/>shallow reasoning"]
        PME["Plan mode + extended thinking<br/>deep reasoning"]
    end
    DD -->|"extended thinking adds depth"| DE
    PM -->|"extended thinking adds depth"| PME
    DD -->|"plan mode adds gate"| PM
    DE -->|"plan mode adds gate"| PME
\`\`\`

> ❓ **Check yourself:** You enabled extended thinking to stop an agent that keeps editing before showing alternatives, and the edits got smarter but still landed without review. Diagnose the mistake and name the fix.
>
> *(You treated a permission problem as a reasoning problem. Extended thinking only deepens analysis; it never gates writes, so unreviewed edits continue. The failure is premature action, which only plan mode's approval gate addresses — keep extended thinking if you also want a deeper plan, but the gate is what was missing.)*

### Key takeaways
- **Plan mode = workflow gate** (when the agent may act). **Extended thinking = reasoning depth** (how well it reasons).
- They are **orthogonal** and compose: gate the workflow AND deepen the analysis when you need both.
- Match the lever to the problem: premature action → plan mode; shallow analysis → extended thinking.`,
      principles: [
        "Plan mode = workflow gate (when to act); extended thinking = reasoning depth — orthogonal, not substitutes.",
        "Compose both when you need deep analysis AND a human review gate; each solves a different problem.",
      ],
      pitfalls: [
        "Using extended thinking instead of plan mode when the problem is premature action — the gate never appears.",
        "Using plan mode hoping for better reasoning when the issue is analytical depth — the plan stays shallow.",
      ],
    },
    {
      id: 'sessions-scratchpads',
      title: 'Sessions, Context Isolation, and Scratchpads',
      minutes: 7,
      body: `> **TL;DR** — A session is a stored *conversation transcript*, not a filesystem snapshot. Pick the resume flag deliberately, isolate files when you fork, review with fresh context, and write scratchpads for long investigations.

A session persists exactly one thing: the conversation transcript — messages, tool calls, and tool results. It does *not* snapshot the working tree. That single fact drives every behavior below: a resumed session reasons from transcript entries that may describe files which have since changed on disk, so the agent can be confidently wrong about current state. Resume flags select *which* transcript you reload; worktrees, not sessions, isolate file state.

### Session flags (and why they are easy to confuse)

| Flag | Behavior | Best Use |
|---|---|---|
| \`--continue\` | Resumes the most recent session in the current directory, no picker | Returning to the latest in-progress work in a single-project directory |
| \`--resume\` / \`-r\` | Opens a picker, or resumes a specific named session | Selecting a known historical session |
| \`--session-id <UUID>\` | Uses or creates a session with a specific UUID | Programmatic workflows that need a stable, predictable identifier |
| \`--fork-session\` | Branches a new session from an existing transcript | Exploring an alternative approach without contaminating the original |

**The \`--continue\` trap:** "most recent" is only safe in a directory with one ongoing task. If you have juggled three unrelated tasks today, "the latest" may be the wrong one. When you need a *particular* session, use \`--resume\` with a specific identifier.

### Fork-session vs resuming twice — and why files must be isolated too

When you want to evaluate two approaches from the same starting point, **fork the session** so each conversation evolves independently. But forking the *transcript* does nothing to the *files* — both forks still edit the same checkout. So you also need **separate git worktrees** so the file changes do not collide.

\`\`\`mermaid
flowchart LR
    Origin["Starting point"] -->|"fork session"| TA["Transcript A"]
    Origin -->|"fork session"| TB["Transcript B"]
    TA --> WA["Worktree A<br/>separate checkout"]
    TB --> WB["Worktree B<br/>separate checkout"]
    ForkOnly["Fork only"] -->|"two transcripts, one shared checkout"| Collide["file edits collide"]
    WtOnly["Worktree only"] -->|"two checkouts, one transcript"| Mix["conversations intermingle"]
    Both["Fork + worktree"] -->|"fully independent"| OK["independent experiments"]
\`\`\`

Also: **never open the same session in two terminals at once.** Both processes append to the same transcript and corrupt later resumes.

### Stale context: resume vs start fresh

Because the transcript does not track the working tree, decide based on how much has changed:
- **Resume and explain what changed** when most prior context is still valid.
- **Start fresh with a summary** when the old transcript is likely misleading.

### Context isolation and self-review (the anchoring problem)

A session that wrote code carries its own earlier reasoning in context. That reasoning **anchors** the agent — it is less likely to spot flaws in a design it already talked itself into. For high-stakes review, strip the anchor: use a **fresh session seeded with only the diff and review criteria**, a dedicated **review subagent**, or a **continuous-integration review** stage.

**❌ Weak:** "Now critique your own work" in the same session — the prior reasoning biases it.
**✅ Strong:** Open a fresh context with just the diff + criteria — no prior rationalizations to defend.

### Scratchpads: cheap insurance for long investigations

For any investigation spanning many files, write a concise scratchpad of **durable findings**: important files and their roles, data flow between components, open questions, confirmed assumptions, risk areas, and next steps. It costs almost nothing and pays off heavily when the context compacts or when a separate session must continue the work.

> ❓ **Check yourself:** You forked a session precisely to keep two implementation approaches separate, yet they keep overwriting each other's files. Given the fork worked, what does that symptom reveal about what a session actually isolates?
>
> *(A session persists only the conversation transcript, so forking isolates the dialogue, never the working tree. Both forks point at the same checkout, so their writes collide regardless. File-level isolation comes from a separate git worktree per approach, not from the fork.)*

### Key takeaways
- A session stores the **conversation transcript, not filesystem state** — resumed sessions can be stale.
- **Fork the session AND use separate worktrees** when comparing two approaches; both are required.
- Review with **fresh context** to defeat anchoring; write **scratchpads** for long, multi-session work.`,
      principles: [
        "Fork session AND use separate worktrees when comparing approaches — forking isolates transcripts, not files.",
        "Fresh-context review (new session with only the diff) removes anchoring bias the authoring session carries.",
        "Write a scratchpad of key files, data flow, and open questions for any multi-file investigation.",
      ],
      pitfalls: [
        "Using `--continue` in a multi-task directory — the latest session may not be the one you want.",
        "Opening the same session in two terminals — both append to the transcript and corrupt later resumes.",
        "Assuming a resumed session reflects current files — sessions persist conversation, not filesystem state.",
      ],
    },
    {
      id: 'claude-md-memory',
      title: 'CLAUDE.md, Memory Hierarchy, and Slash Commands',
      minutes: 7,
      body: `> **TL;DR** — \`CLAUDE.md\` files are auto-loaded by *directory hierarchy*; more specific files refine more general ones. Diagnose missing behavior with \`/memory\` first, share content with \`@imports\`, and keep workflow-specific checklists out of always-loaded memory.

Which \`CLAUDE.md\` files load is a function of your working directory, not of any rule tagging. Claude Code walks from the user-level memory down through the repo root to the subdirectory you are in, layering each file from general to specific; where they overlap, the most specific file wins. This directory-driven loading *is* the path-scoping mechanism — you scope a rule to an area by placing a file at that level, which is also why a rule that silently fails is usually a file that never loaded for the current directory rather than a wording problem.

### The loading hierarchy

\`CLAUDE.md\` files are auto-loaded into Claude Code's context based on the directory you are working in:

1. **User-level memory file** — applies across all projects for this user (personal preferences only).
2. **Root \`CLAUDE.md\`** — at the repository root, applies to the whole project.
3. **Subdirectory \`CLAUDE.md\` files** — apply to work in that subtree, layered on top of the root.

More specific files **refine or override** more general ones for the area they cover. This directory-driven loading is the entire mechanism for *path scoping*: you scope a rule to an area by placing a \`CLAUDE.md\` at that directory level, not by tagging rules with paths.

### Sharing content with @imports

Use \`@path/to/file.md\` import syntax inside a \`CLAUDE.md\` to pull in shared content without copy-pasting. A shared coding-standards doc stays in sync across many \`CLAUDE.md\` files: update one source, every importer picks it up.

### What belongs where

| Scope | What to put there |
|---|---|
| User-level memory | Personal preferences: commit style, preferred test shortcuts, editor behavior |
| Root CLAUDE.md | Repo-wide build commands, architecture overview, team conventions |
| Subdirectory CLAUDE.md | Area-specific rules: API contract constraints, generated-file warnings |
| Slash command | Explicit workflows invoked intentionally: /review, /release-notes |
| Subagent | Heavy task-specific behavior that would bloat memory on every turn |

### Why bloated memory hurts (the "why")

Memory files are read on **every turn**. A code-review checklist sitting in the root \`CLAUDE.md\` costs tokens on every ordinary edit and dilutes the rules that actually matter for routine work — even though the checklist is only relevant during reviews. That is why occasional, workflow-specific content belongs in a **slash command** or a **review subagent**, not in always-loaded memory.

### Diagnosing inconsistent behavior: weak vs strong

**❌ Weak — reword the rule immediately**
> "Claude keeps ignoring our convention — let me rewrite the rule to be clearer."

If the file is not being *loaded* for the current working directory, no amount of rewording will help. You are polishing a note nobody is reading.

**✅ Strong — confirm loading first**
\`\`\`mermaid
flowchart TD
    A["Run /memory"] --> B{"Is the expected<br/>CLAUDE.md loaded<br/>for this directory?"}
    B -->|"loaded but ignored"| C["Consider wording<br/>and specificity"]
    B -->|"not loaded"| D["Fix the SCOPE<br/>place file at the right level"]
\`\`\`

### What does NOT exist

There is **no** \`.claude/rules/\` folder with per-rule YAML frontmatter for path scoping. Path scoping is achieved by placing \`CLAUDE.md\` files at the correct directory level; sharing is achieved with \`@imports\`. Treat any advice to add YAML-frontmatter rule files as not how the memory system works.

### Visual: scope precedence

\`\`\`mermaid
flowchart LR
    UL["User-level memory<br/>personal preferences<br/>LEAST specific"]
    RC["Root CLAUDE.md<br/>repo-wide rules"]
    SD["Subdirectory CLAUDE.md<br/>e.g. src/api/CLAUDE.md<br/>refines for that subtree<br/>MOST specific"]
    UL -->|"overridden by"| RC
    RC -->|"overridden by"| SD
    Imp["@imports"] -->|"pull shared docs into any level"| UL
    Imp -->|"pull shared docs into any level"| RC
    Imp -->|"pull shared docs into any level"| SD
\`\`\`

> ❓ **Check yourself:** A rule in \`src/api/CLAUDE.md\` is obeyed when you work inside \`src/api/\` but silently ignored when you run Claude Code from the repo root. Before touching the wording, what is the one-word explanation, and how do you confirm it?
>
> *(Scope. Memory loads by directory hierarchy, so a subdirectory \`CLAUDE.md\` is not loaded when your working directory is the repo root — the rule was never in context. Confirm with \`/memory\`, which lists exactly which files are loaded for the current directory; rewording changes nothing if the file is absent.)*

### Key takeaways
- Memory loads **by directory hierarchy**; more specific files refine more general ones — that *is* path scoping.
- Use \`/memory\` to confirm loading **before** rewording; put team rules in repo-tracked files, personal prefs in user memory.
- Keep workflow checklists in **slash commands / subagents**, not always-loaded memory; \`.claude/rules/\` YAML does not exist.`,
      principles: [
        "Run /memory first when Claude ignores a convention — confirm the file is loaded before rewording it.",
        "Put team rules in repo-tracked CLAUDE.md files; put personal preferences in user-level memory only.",
        "Use @imports to share standards docs across CLAUDE.md files without duplicating content.",
      ],
      pitfalls: [
        "Putting a code-review checklist in root CLAUDE.md — it loads every turn and dilutes routine context.",
        "Expecting `.claude/rules/` YAML-frontmatter files to work — that mechanism does not exist.",
        "Rewording a memory rule when the file isn't loaded for the current directory — run /memory first.",
      ],
    },
    {
      id: 'hooks-subagents-mcp',
      title: 'Hooks, Permissions, Subagents, and MCP Scope',
      minutes: 8,
      body: `> **TL;DR** — Hooks run as *code* in your environment, so a \`PreToolUse\` hook is the only thing a clever prompt cannot talk around. Subagents start with a blank slate (no parent context), and the most specific MCP scope wins.

The dividing line for enforcement is whether a rule lives in the prompt or in code. A system-prompt instruction is model guidance — usually followed, never guaranteed, and defeatable by the right phrasing or edge case. A \`PreToolUse\` hook executes as code in your environment before the tool call resolves, so it can deny or require approval regardless of what the model decides; no wording routes around it. That property makes hooks the right home for hard rules, while subagents (blank-slate context) and MCP scope precedence round out the rest of this lesson.

### Hooks: lifecycle enforcement points

| Hook | When it fires | What it can do |
|---|---|---|
| \`PreToolUse\` | Before a tool call | Deny, allow, ask user, defer, inject context, modify the tool's input |
| \`PostToolUse\` | After a tool call | Log, format, run secondary checks, append follow-up context |
| \`UserPromptSubmit\` | When a user submits a prompt | Block, modify, or attach extra context |
| \`SessionStart\` | Once when a session begins | Load project context, set environment variables, run pre-flight checks |

**\`PreToolUse\` is the canonical place for hard rules.** It fires *before* the call, so it can deny or require approval *in time to matter*. Because it executes as code in your environment — not as instructions to the model — it cannot be talked around. Typical policies: block destructive Bash patterns unless approved, prevent \`Edit\`/\`Write\` on \`/generated/**\`, require confirmation for writes outside an approved list of paths, or allow only a narrow tool set during a read-only audit.

Note the timing trap: a \`PostToolUse\` hook fires *after* execution — too late to stop a destructive command. Prevention belongs in \`PreToolUse\`.

**Security note:** Hooks execute shell commands in your environment. Treat them as code with full security implications — a malicious or buggy hook can damage your system or exfiltrate data. Review third-party hook configs before enabling them, and never put secrets in arguments a hook might log.

### Weak vs strong: enforcing destructive-command approval

**❌ Weak — enforce a rule via the prompt**
> system prompt: "IMPORTANT: always ask before running destructive Bash commands."

This is a sign, not a lock. Under the right prompt or edge case, the model can proceed anyway — there is no enforcement.

**✅ Strong — enforce a rule via a PreToolUse hook**
\`\`\`js
// PreToolUse hook — fires before every tool call
if (tool === "Bash" && /rm -rf|drop table|git push --force/.test(command)) {
  return { decision: "ask" }; // require explicit human approval
}
\`\`\`
Now the rule is code that runs before the call. No prompt can route around it.

### Subagents: a blank slate by design

Subagents have **separate context windows**, focused prompts, and configurable tool access. Use them when a side task would flood the main context, when specialized behavior is reused, or when independent work can run in parallel.

**Critical: a subagent does NOT inherit the parent's context.** When the parent launches it, the subagent receives only its own \`AgentDefinition\` (system prompt, allowed tools, model) plus the **prompt string the parent constructed for that one invocation**. It does not see the parent's earlier turns, prior tool results, or any other subagent's output. This is intentional — it keeps the subagent focused — but it means:

- **Do not assume it "remembers" the project.** The root \`CLAUDE.md\` is *not* automatically loaded into a subagent unless its definition does so. If it needs conventions, paste or reference them in the prompt.
- **Do not expect a second invocation to continue the first.** Each call is fresh; if state must persist, the parent stores it and re-supplies the relevant slice each time.

> Treat the prompt to a subagent like a brief to a contractor: **assume nothing carries over.**

Good subagent design: a single clear responsibility, a specific description so Claude knows when to invoke it, **limited tool access** (only what the role needs — broad access hurts focus and security), and an explicit output contract the coordinator can consume.

### MCP scope precedence

MCP servers can be configured at different scopes. When the same server or tool is configured at multiple levels, **more specific scope takes precedence**:

\`\`\`mermaid
flowchart LR
    GS["Global / system-level<br/>LEAST specific"]
    UL["User-level"]
    PL["Project-level<br/>this directory<br/>MOST specific — wins"]
    GS -->|"overridden by"| UL
    UL -->|"overridden by"| PL
    PL -->|"can override or exclude"| GS
\`\`\`

So if an MCP tool that works globally is missing inside one project, suspect the **project-level** config overriding or excluding it — check the most specific scope first.

> ❓ **Check yourself:** Your parent agent has the root \`CLAUDE.md\` style guide loaded and follows it perfectly, yet the review subagent it launches ignores those same rules. Why does the parent's compliance not carry over, and what is the fix?
>
> *(A subagent starts blank: it receives only its own \`AgentDefinition\` plus the prompt the parent constructed for that one call — never the parent's loaded memory or earlier turns. So the root \`CLAUDE.md\` simply is not in its context. Fix it by pasting the rules into the subagent's prompt or having its \`AgentDefinition\` load them.)*

### Key takeaways
- **\`PreToolUse\` hooks are code** that runs before the call — the only reliable enforcement for hard rules like destructive-command approval. Prompts and \`PostToolUse\` cannot prevent the action in time.
- **Subagents inherit nothing** from the parent; restate every fact (including conventions) they need, every invocation.
- **More specific MCP scope wins** — check project config first when a global tool goes missing.`,
      principles: [
        "`PreToolUse` hooks run as code before the call — they enforce hard rules that prompts cannot bypass.",
        "Subagents inherit no parent context; restate every needed fact in the prompt for each invocation.",
        "More specific MCP scope wins — check project-level config first when a global tool goes missing.",
      ],
      pitfalls: [
        "Relying on system-prompt instructions to block destructive commands — prompts are a sign, not a lock.",
        "Assuming a subagent sees root CLAUDE.md because the parent does — it does not; paste rules explicitly.",
        "Giving every subagent every tool — broad access reduces focus and widens the security surface.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-tool-selection',
      type: 'mcq',
      scenario: 'A developer asks Claude Code to find every place in the codebase where the function `processPayment` is called. The developer is considering using Glob for this.',
      question: 'Which built-in tool should be used, and why?',
      options: [
        'Glob, because it finds files that match a pattern, and `processPayment` is a pattern.',
        'Grep, because it searches the text content inside files for the string `processPayment`.',
        'Read, because you should read all files and scan them manually.',
        'Task, because finding references is always too broad for a single tool call.',
      ],
      answer: 1,
      explanation: 'Grep searches file contents for text patterns. Glob matches filenames and paths — it cannot find code references inside files. Read scans one file at a time and cannot search across the codebase. Task would add unnecessary overhead for a targeted content search.',
    },
    {
      id: 'ex-plan-vs-direct',
      type: 'mcq',
      scenario: 'Your team is migrating from one database ORM to another across 47 files. The new ORM has a different query API, and several query patterns need to be redesigned, not just mechanically translated.',
      question: 'Which execution mode should you use, and what is the primary reason?',
      options: [
        'Direct execution — migrations are routine and the agent can handle it automatically.',
        'Plan mode — the change spans many files and involves architectural choices that need human review before edits land.',
        'Direct execution with extended thinking enabled, which provides the same review gate as plan mode.',
        'Plan mode — but only because the number of files is odd (47 is not a round number).',
      ],
      answer: 1,
      explanation: 'Plan mode is the right choice when a change spans many files and involves genuine architectural decisions. The migration here is broad and involves redesigning query patterns — exactly the scenario plan mode exists for. Extended thinking improves reasoning quality but does not provide a review gate; it does not prevent the agent from touching files without approval.',
    },
    {
      id: 'ex-feature-match',
      type: 'mcq',
      scenario: 'A senior engineer is explaining Claude Code features to a new team member. They want to verify that the new member can correctly identify what each feature does.',
      question: 'Which statement correctly describes the primary purpose of `--fork-session`?',
      options: [
        'It branches a new session from an existing transcript so two approaches can evolve independently without contaminating the original.',
        'It resumes the most recent session in the current directory without prompting.',
        'It allocates more internal reasoning budget before the model responds, improving analytical depth.',
        'It runs as code before every tool call and can deny or require approval for the action.',
      ],
      answer: 0,
      explanation: '--fork-session creates a new session branched from an existing transcript, allowing you to explore an alternative approach while leaving the original session untouched. Resuming the most recent session without prompting is --continue. Allocating more internal reasoning budget is extended thinking. Running as code before tool calls to enforce rules is a PreToolUse hook.',
    },
    {
      id: 'ex-subagent-context',
      type: 'mcq',
      scenario: "A parent agent is working on a large refactor. It launches a subagent to review the changes and enforce the team's style guide. The style guide is documented in the root CLAUDE.md. The subagent consistently ignores style rules.",
      question: 'What is the most likely cause and the correct fix?',
      options: [
        'The subagent is using the wrong model. Switch to a larger model.',
        "The parent's CLAUDE.md rules conflict with the subagent's system prompt.",
        "The subagent does not inherit the parent's context, including CLAUDE.md, unless the subagent's definition explicitly loads it. The fix is to paste or reference the style rules in the subagent's prompt or definition.",
        'Subagents always ignore CLAUDE.md by design. Use a slash command instead.',
      ],
      answer: 2,
      explanation: "Subagents have separate context windows and do not see the parent's earlier turns, prior tool results, or memory files unless explicitly provided. The root CLAUDE.md is not automatically loaded into a subagent. The correct fix is to paste the relevant rules into the subagent's prompt or configure its AgentDefinition to load the file.",
    },
    {
      id: 'lab-claudemd-hooks',
      type: 'lab',
      title: 'Design a CLAUDE.md hierarchy and hook policy for a real repo',
      brief: `You are setting up Claude Code for a monorepo with this structure:

\`\`\`
/
  CLAUDE.md              ← repo root
  src/
    api/
      CLAUDE.md          ← API service
    generated/
      (auto-generated files — must never be edited manually)
  docs/
    standards/
      coding-style.md    ← shared team standards doc
\`\`\`

**Your task:** Write the following, in plain text or pseudocode:

1. **Root CLAUDE.md** content — what goes here and why.
2. **src/api/CLAUDE.md** content — what it adds or overrides, including how it references the shared standards doc.
3. **A PreToolUse hook specification** — describe what it checks and what it does when triggered, to prevent any Edit or Write call targeting a path under \`/src/generated/\`.
4. **One slash command** — name it and describe its purpose for a workflow that should NOT live in the root CLAUDE.md.

Explain your scoping decisions: why each piece of content lives where it does.`,
      placeholder: '# Root CLAUDE.md\n...\n\n# src/api/CLAUDE.md\n...\n\n# PreToolUse Hook\n...\n\n# Slash Command\n...\n\n# Scoping Decisions\n...',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate CLAUDE.md hierarchy designs and hook/permission configurations. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is well-designed, (3) concrete fixes needed. Focus on: correct directory placement for scoping, use of @imports for shared content, PreToolUse hook correctness (path matching, deny action), appropriate use of slash commands vs memory files, and whether personal preferences are correctly separated from team rules.',
      evalTemplate: 'A learner submitted this CLAUDE.md hierarchy and hook design for a monorepo:\n\n{{input}}\n\nReview it per your rubric. Check: (a) does the root CLAUDE.md contain repo-wide rules only, (b) does the API CLAUDE.md correctly use @import to reference the shared standards doc, (c) does the PreToolUse hook correctly match paths under /src/generated/ and deny the call, (d) is the slash command appropriate for content that should not be in memory files, (e) are scoping decisions justified. If any section is missing, note it explicitly.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'A developer is dropped into an unfamiliar 800-file service and asks Claude Code to "read the whole codebase so you understand it" before making any change. What is wrong with this approach?',
      options: [
        'Nothing — reading every file upfront is the only reliable way to understand a codebase.',
        'It floods the context budget before the agent knows what matters; the agent should map first by grepping for anchors, then read selectively along the imports.',
        'Read cannot open more than one file, so the request is technically impossible.',
        'The agent should use Glob to read file contents instead of Read.',
      ],
      answer: 1,
      explanation: 'Reading hundreds of files upfront floods the context budget before the agent knows what is relevant; the right move is to map first (grep for route names, error codes, exported identifiers), then follow imports and read selectively. Reading everything is explicitly called out as a pitfall, not the reliable approach. Read can open many files across calls, so it is not impossible, just wasteful here. Glob matches filenames and paths and cannot read file contents at all.',
    },
    {
      id: 'q2',
      question: 'You want Claude Code to find every location where the function transferFunds is called across the repository. Which tool fits, and why?',
      options: [
        'Glob, because transferFunds is a pattern it can match against files.',
        'Task, because locating call sites is always too broad for a single tool.',
        'Grep, because it searches the text content inside files for the identifier.',
        'Write, because you first replace each file and observe what breaks.',
      ],
      answer: 2,
      explanation: "Grep searches text inside file contents, which is exactly how you locate call sites of an identifier. Glob only matches filenames and paths and cannot see inside files — using it to find code references is one of the module's named pitfalls. Task (a subagent) adds unnecessary overhead for a targeted content search. Write replaces whole files and has nothing to do with searching.",
    },
    {
      id: 'q3',
      question: "A teammate wants Claude Code to refactor a module \"the way we usually do it\" and pastes a paragraph describing the team's style in prose. What is the higher-leverage way to give the agent this context?",
      options: [
        'Point at a concrete reference file such as @src/payments/repository.ts so the agent has something to read rather than a vague style description.',
        'Add the word IMPORTANT in front of the style paragraph so the agent treats it as a hard rule.',
        'Tell the agent to infer the style by reading every file in the repository first.',
        'Switch the agent to plan mode, which automatically discovers coding conventions.',
      ],
      answer: 0,
      explanation: "Pointing at a concrete file reference like @src/payments/repository.ts gives the agent a real example to imitate instead of a vague abstract instruction, which is the lesson's explicit guidance. Prefixing with IMPORTANT does not turn prose into something the agent can concretely follow. Reading the entire repository to infer style is the upfront-reading pitfall. Plan mode gates writes pending approval; it does not discover or supply coding conventions.",
    },
    {
      id: 'q4',
      question: 'A one-line null check needs to be added to fix a bug whose root cause is narrow, clear, and confined to a single file. Which mode is appropriate?',
      options: [
        'Plan mode, because every change should be reviewed before it lands.',
        'Direct execution, because the change is small, localized, and low-risk.',
        'Plan mode, because bug fixes always have broad architectural impact.',
        'Extended thinking instead of either mode, because it provides the approval gate.',
      ],
      answer: 1,
      explanation: "Direct execution is the right call for small, localized, unambiguous, low-risk changes — exactly this scenario. Using plan mode for a trivial single-line fix is a named pitfall: it adds unnecessary overhead. Bug fixes do not always carry broad architectural impact; this one's root cause is narrow and clear. Extended thinking improves reasoning depth but provides no approval gate, so it cannot substitute for the mode decision.",
    },
    {
      id: 'q5',
      question: 'During an urgent production incident, you gather the stack trace and logs and discover the fix would require changing a shared abstraction used across many services. The pressure is to act fast. What does the module recommend?',
      options: [
        'Implement the fix directly because emergencies justify skipping review.',
        'Enable extended thinking and let the agent edit directly — deeper reasoning replaces the review gate.',
        'Switch to plan mode before expanding the change, because the root cause now reveals broad architectural impact.',
        'Open the same session in two terminals so two people can fix it in parallel.',
      ],
      answer: 2,
      explanation: 'When the evidence reveals broad architectural impact, the decision tree says switch to plan mode before expanding the change — emergencies are precisely when plan mode keeps a narrow fix from breaking something broader. Acting directly because it is an emergency is the temptation the lesson warns against. Extended thinking deepens reasoning but does not gate the edits, so it is not a substitute for the review gate. Opening one session in two terminals corrupts the shared transcript and is an explicit pitfall.',
    },
    {
      id: 'q6',
      question: 'An agent keeps jumping straight into edits without surfacing alternative approaches or blast radius, even though its individual analyses are sound. Which lever addresses this specific problem?',
      options: [
        'Extended thinking, because the issue is insufficient analytical depth.',
        'Plan mode, because the problem is premature action — it gates the move from exploration to implementation pending human review.',
        'A PostToolUse hook that logs each edit after it happens.',
        'Increasing the sliding-window size so the agent retains more context.',
      ],
      answer: 1,
      explanation: 'The problem described is premature action, and plan mode is the workflow-control lever that gates the exploration-to-implementation transition until a human approves. Extended thinking improves analytical depth, but the analyses here are already sound — substituting it when the real issue is premature action is a named pitfall. A PostToolUse hook fires after the edit, too late to prevent the premature action. Sliding-window sizing is a context-management concern unrelated to gating writes.',
    },
    {
      id: 'q7',
      question: 'You have been working on three unrelated tasks in the same directory today and now want to return to a specific earlier session. Which flag is safest, and why avoid the alternative?',
      options: [
        '--continue, because it always resumes exactly the session you intend.',
        '--fork-session, because resuming any session in a multi-task directory corrupts it.',
        '--resume with a specific identifier, because --continue only grabs the most recent session, which may not be the one you want.',
        '--session-id with a brand-new UUID, because that reopens the most relevant past session.',
      ],
      answer: 2,
      explanation: 'In a directory with multiple unrelated tasks, --resume with a specific identifier lets you pick the exact session you want. --continue only resumes the most recent session, which in a multi-task directory may not be the right one — that is the named pitfall here. --fork-session branches a new session for exploring alternatives; it does not target an existing one to return to. --session-id with a new UUID creates or addresses a session by stable identifier for programmatic workflows, not a way to reopen the most relevant past work.',
    },
    {
      id: 'q8',
      question: 'A reviewer wants the most objective review of code that Claude Code just authored in the current session. What gives the least biased review?',
      options: [
        'Continue in the same session and ask the agent to critique its own work, since it has the most context.',
        'Use a fresh session (or dedicated review subagent) seeded with only the diff and the review criteria, removing the anchoring effect of the prior reasoning.',
        'Increase extended thinking in the authoring session so it reasons harder about its own design.',
        'Reword the system prompt to instruct the agent to be more critical of itself.',
      ],
      answer: 1,
      explanation: 'A fresh session (or a dedicated review subagent) given only the diff and criteria removes the anchoring effect, so it can spot flaws the authoring context would rationalize. Continuing in the same session carries the earlier reasoning that biases the review — the exact problem to avoid. More extended thinking deepens reasoning but does not remove the anchoring to a design the agent already reasoned through. Rewording the system prompt does not eliminate the in-context bias from prior reasoning.',
    },
    {
      id: 'q9',
      question: 'A long codebase investigation is likely to span several sessions and survive a context compaction. What practice does the module recommend to preserve the durable findings cheaply?',
      options: [
        'Open the investigation session in multiple terminals so progress is mirrored.',
        'Write a concise scratchpad capturing key files, data flow, open questions, confirmed assumptions, risks, and next steps.',
        'Rely on --continue to automatically reconstruct the prior findings.',
        'Raise the sliding window to 50 turns so nothing is ever dropped.',
      ],
      answer: 1,
      explanation: 'A concise scratchpad of durable findings (important files, data flow, open questions, confirmed assumptions, risks, next steps) costs almost nothing and pays off when context compacts or another session continues the work. Opening the session in multiple terminals corrupts the transcript and is an explicit pitfall. --continue merely resumes a transcript; it does not rebuild lost findings. Enlarging the window only defers the limit and does not produce a portable summary.',
    },
    {
      id: 'q10',
      question: "A developer resumes a week-old session to keep working, assuming the agent's view of the files is still accurate. The repository has changed substantially since. What is the key risk?",
      options: [
        'Sessions persist filesystem snapshots, so the resumed agent will silently overwrite the newer files.',
        'Sessions persist conversation history, not filesystem state, so the resumed transcript may no longer reflect the current files and can mislead the agent.',
        'Resuming a session automatically re-reads every file, so there is no risk at all.',
        'The session will refuse to resume because the files changed.',
      ],
      answer: 1,
      explanation: 'Sessions persist conversation history, not filesystem state, so a resumed transcript can be stale relative to files that changed — assuming otherwise is a named pitfall. When most prior context is still valid you resume and explain what changed; when the transcript is likely misleading you start fresh with a summary. Sessions do not store filesystem snapshots, so there is no silent overwrite of newer files. Resuming does not auto-re-read every file, and the session will resume regardless of file changes.',
    },
    {
      id: 'q11',
      question: 'A team wants a code-review checklist available to Claude Code. Where should it live, and why not the root CLAUDE.md?',
      options: [
        'In the root CLAUDE.md, so it is always loaded and never forgotten.',
        'In a user-level memory file, since reviews are a personal preference.',
        'In a /review slash command or a dedicated review subagent, because the checklist is only relevant during reviews and would burn tokens on every turn if it sat in memory.',
        'In a .claude/rules/ file with YAML frontmatter scoped to review tasks.',
      ],
      answer: 2,
      explanation: 'A review checklist belongs in a /review slash command or a dedicated review subagent — it is only relevant during reviews and would be read on every turn, diluting context and costing tokens, if placed in the root CLAUDE.md. Putting it in the root CLAUDE.md is the explicit pitfall this question targets. A team review process is not a personal preference, so user-level memory is wrong. The .claude/rules/ YAML-frontmatter mechanism does not exist.',
    },
    {
      id: 'q12',
      question: 'Claude Code keeps violating a documented project convention. A teammate suggests immediately rewording the rule in CLAUDE.md to be clearer. What should you do first?',
      options: [
        'Reword the rule right away, since unclear wording is the most common cause.',
        'Run /memory first to confirm the expected file is actually loaded for the current working directory before changing anything.',
        'Move the rule into a .claude/rules/ file so path scoping picks it up.',
        'Add the rule to the user-level memory file so it applies everywhere.',
      ],
      answer: 1,
      explanation: 'Use /memory first to confirm the expected memory file is actually loaded for the current directory; if it is not loaded, no rewording will fix the behavior because the problem is loading scope. Rewording before confirming loading is the named pitfall. Path scoping is achieved by placing CLAUDE.md files at the right directory level, not via a non-existent .claude/rules/ mechanism. Moving a project rule into personal user-level memory misplaces a team convention and still does not address whether it is loaded.',
    },
    {
      id: 'q13',
      question: 'A security requirement states that destructive Bash commands must always require explicit approval, with no exceptions. Where should this rule be enforced?',
      options: [
        'In a strongly worded system-prompt instruction telling the agent to always ask before destructive commands.',
        'In a root CLAUDE.md note marked IMPORTANT so the agent reads it every turn.',
        'In a PostToolUse hook that checks the command after it has executed.',
        'In a PreToolUse hook, because it runs as code before the call and cannot be talked around by a clever prompt.',
      ],
      answer: 3,
      explanation: 'A PreToolUse hook is the canonical enforcement mechanism for hard rules: it runs as code in your environment before the tool call and can deny or require approval, so a prompt cannot talk around it. Relying on a system-prompt instruction is the exact pitfall — prompt instructions are not hard enforcement. A CLAUDE.md note, even marked IMPORTANT, is still model guidance, not enforcement. A PostToolUse hook fires after execution, which is too late to prevent a destructive command.',
    },
    {
      id: 'q14',
      question: 'You are designing a subagent that needs limited tool access. A colleague proposes giving it the full tool set "just in case." What is the better design principle?',
      options: [
        'Grant every tool, since more capability always makes a subagent more useful.',
        'Give the subagent only the tools its role actually needs, plus a single clear responsibility and an explicit output contract.',
        'Give it every tool except Bash, which is the only one that matters for security.',
        'Skip tool restrictions and rely on the parent to catch misuse afterward.',
      ],
      answer: 1,
      explanation: 'Good subagent design means a single clear responsibility, a specific description, limited tool access (only what the role needs), and an explicit output contract — restricting tools improves both focus and security. Giving every subagent every tool is a named pitfall that reduces focus and security. Carving out only Bash ignores that any unneeded tool widens the surface and dilutes focus. Relying on the parent to catch misuse afterward abandons the up-front least-privilege principle.',
    },
    {
      id: 'q15',
      question: 'An expected MCP tool that works globally is suddenly unavailable when you run Claude Code inside a particular project directory. Where should you look first?',
      options: [
        'The user-level MCP configuration, which always overrides everything else.',
        'The project-level MCP configuration, because the most specific scope takes precedence and may be overriding or excluding the global server.',
        'The global configuration, since global scope wins over project scope.',
        'Nowhere — MCP scopes merge additively, so a project cannot remove a global tool.',
      ],
      answer: 1,
      explanation: 'More specific scope takes precedence, so the project-level configuration (closest to the current directory) can override or exclude a globally configured server — check it first. User-level configuration does not always win; it sits below project scope in specificity. Global scope is the least specific and is overridden by project scope, not the reverse. MCP scopes are not merged additively without precedence, so a project absolutely can restrict a global tool.',
    },
  ],
}
