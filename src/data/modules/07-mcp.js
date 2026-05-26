export default {
  id: 'mcp',
  num: 7,
  title: 'Model Context Protocol (MCP)',
  summary: 'MCP is an open standard for connecting AI applications to external systems via tools, resources, and prompts. This module covers the architecture, the trust model, two-tier error handling, tool discovery and progressive availability, and server-scoped configuration in Claude Code.',
  estMinutes: 32,
  tags: ['MCP', 'Tools', 'Integration'],

  lessons: [
    {
      id: 'why-mcp',
      title: 'Why MCP and When to Use It',
      minutes: 6,
      body: `> **TL;DR** — MCP is an open standard that lets you expose a capability *once* and have any compliant AI client connect to it. It is a protocol, not a middleware platform — auth, retries, and caching stay your job.

MCP standardizes the wire format and capability-description schema between AI clients and external systems, so an integration written to the spec works against any compliant host. The motivating problem is combinatorial: without a shared protocol, connecting *N* AI clients to *M* internal systems trends toward *N times M* bespoke connectors — one per client-and-system pair — each separately built and maintained. MCP collapses that to *N plus M* — each system exposes one server, each client speaks one protocol. That is the entire reason it exists: stop reimplementing the same integration once per client. (It is the USB analogy — define the device once, plug it into any port — except the "device" is a capability and the "port" is the protocol.)

### The three-layer architecture

MCP splits responsibility across three participants. Confusing their roles is a common source of design mistakes.

- **MCP servers** expose capabilities (tools, resources, prompts) to the network. The server is where your real integration logic and the actual business invariants live.
- **MCP clients** connect to servers and relay their advertised capabilities into the host.
- **Host applications** (Claude Code, Claude.ai, your custom agent) decide how the model and user actually interact with those capabilities — including which security checks to enforce.

### When MCP is worth it (and when it is not)

MCP earns its weight when an integration should be **reusable across multiple clients**. If five AI tools all need the same internal ticketing data, one MCP server serves all of them and you stop maintaining five copies. If only a single, deeply application-specific workflow needs a capability — one no other agent will ever touch — a custom tool baked into that one application is often simpler than standing up, operating, and securing a whole server.

### Weak vs strong: deciding where a capability lives

**❌ Weak** — "MCP is the modern way, so wrap *everything* in MCP servers, including the one-off workflow only our billing agent uses." You now operate a server, define a protocol surface, and secure a network endpoint for a capability with exactly one consumer. The protocol overhead buys you nothing because there is no reuse.

**✅ Strong** — Expose the shared ticketing data through *one* MCP server reused by all five tools (this is exactly what MCP is for), and implement the single-consumer billing workflow as a local custom tool inside the billing agent. Reuse drives the server; a one-off stays local.

### What MCP does NOT do for you

MCP is a *protocol*, not a complete middleware platform. Connecting a server does **not** automatically provide:

| Concern | Who owns it under MCP |
|---|---|
| Authentication / authorization | The server builder and operator |
| Rate limiting and retry logic | The server builder and operator |
| Response caching | The server builder and operator |
| Performance optimization | The server builder and operator |

These remain system-design responsibilities. They do not vanish when you adopt MCP — they shift to whoever builds and runs the server.

\`\`\`mermaid
flowchart LR
    subgraph bespoke["Without a shared protocol: one connector per pair"]
        A["tool A"] --> T1["tickets"]
        A --> T2["deploys"]
        A --> T3["metrics"]
        B["tool B"] --> T1
        B --> T2
        B --> T3
        C["tool C"] --> T1
        C --> T2
        C --> T3
    end
    subgraph mcp["With MCP: one server per system, one protocol per client"]
        A2["tool A"] --> MCP["MCP servers<br/>(one per system)"]
        B2["tool B"] --> MCP
        C2["tool C"] --> MCP
    end
    bespoke -->|"one protocol<br/>to speak"| mcp
\`\`\`

> ❓ **Check yourself:** Only one internal application will ever call a particular capability, yet a teammate insists on exposing it as an MCP server "because MCP is the standard." What does the protocol actually buy you here, and what does it cost?
>
> *(It buys nothing: MCP's payoff is reuse across many clients, and there is exactly one consumer. It costs you a server to operate, a protocol surface to define, and a network endpoint to secure. A local custom tool is the simpler choice; reserve a server for capabilities multiple clients share.)*

### Key takeaways
- MCP is USB for AI capabilities: expose a capability **once**, connect from any compliant client.
- Use MCP when the same data or capability should be reachable from **multiple** clients — not for every one-off integration.
- MCP is a **protocol**, not a platform: auth, retries, caching, and rate-limiting are yours to build.`,
      principles: [
        "Use MCP when multiple clients share a capability; single-consumer needs stay cleaner as local tools.",
        "MCP is a **protocol**, not middleware — auth, retries, caching, and rate-limiting are yours to build.",
      ],
      pitfalls: [
        "Assuming MCP provisions auth, retries, or caching — it standardizes exchange only; implement each yourself.",
        "MCP for a single-consumer capability adds protocol overhead with zero reuse gain.",
      ],
    },
    {
      id: 'tools-resources-prompts',
      title: 'Tools, Resources, and Prompts — the Right Building Block',
      minutes: 6,
      body: `> **TL;DR** — Tools are *actions* (model-controlled), resources are *passive reference context* (application-controlled), and prompts are *reusable workflows* (user/application-controlled). Picking the wrong block is one of the most common MCP design mistakes.

The three building blocks differ along two axes that decide everything: **who initiates use**, and **whether using them changes state**. Tools are model-controlled and may mutate the world or hit live data — every invocation is a round-trip the model chooses to make. Resources are application-controlled, passive context the agent reads like any other input; reading one is side-effect-free and costs no per-use call loop. Prompts are user/application-controlled templates that package a repeatable workflow. Choosing the wrong block is rarely a naming quibble — it forces an avoidable round-trip (static data behind a tool) or strands the agent unable to act (everything behind resources).

### The three building blocks at a glance

| Building Block | Who Controls It | Purpose | State / cost |
|---|---|---|---|
| **Tools** | Model-controlled | Actions and computations the model may invoke | Live or mutating; one round-trip per call |
| **Resources** | Application-controlled | Passive context: files, schemas, catalogs, documents | Read-only; no call loop after fetch |
| **Prompts** | User/application-controlled | Reusable prompt templates or workflows | Invoked on demand by a human/app |

### When to use a tool

Use a **tool** when the capability requires **computation or a live external lookup** at the moment of use: search, create, update, analyze, send, calculate, fetch the *current* state of an order. Anything where the answer depends on *right now* or where invoking it *changes the world* is a tool.

### When to use a resource

Use a **resource** when the content is **reference material** the agent might want to consult before acting: database schemas, API specifications, file catalogs, project guidelines, configuration. The agent reads a resource like context — no iterative call loop is needed beyond the initial fetch. Crucially, resources **reduce exploratory tool calls** because the agent can see what information exists before deciding to act.

### When to use a prompt

Use a **prompt** for **reusable workflows** that humans or applications invoke: review checklists, report templates, investigation playbooks. In Claude Code, MCP prompts surface as slash commands following the \`mcp__<server>__<prompt>\` naming pattern.

### Tools and resources are complements, not alternatives

A well-designed MCP server typically exposes **both**. Resources answer "what is true and stable about this system"; tools answer "what actions can be taken on it."

- Replacing resources with tools forces the agent to make a tool call just to *learn* something static.
- Replacing tools with resources leaves the agent able to read but **unable to act at all**.

### Weak vs strong: exposing a database catalog

**❌ Weak** — Expose the database schema as a tool, \`get_schema\`, that runs a live \`INFORMATION_SCHEMA\` query on every call. The agent must spend a round-trip just to learn table structure that changes maybe once a week — and may call it repeatedly because nothing told it the structure is stable.

**✅ Strong** — Expose the schema as a **resource** the agent reads as context, and expose **tools** for the actions (\`run_query\`, \`create_ticket\`). The agent reads the stable catalog once, then acts. Resources tell it *what is true*; tools let it *do something*.

### The aggregator anti-pattern

If an agent is overwhelmed by similar tools from many servers, the temptation is to build a single "natural language entry tool" that re-routes internally to the real tools. **Avoid this.** It hides the real tool surface from the model, produces *worse* selection, and does nothing to fix the underlying description-quality problem. The correct fixes are improving descriptions and using progressive availability (later lessons).

\`\`\`mermaid
flowchart LR
    R["RESOURCE<br/>(read first)<br/>---<br/>what is true and stable<br/>schema, spec, catalog<br/>passive -- no loop"]
    T["TOOL<br/>(act now)<br/>---<br/>what can be done<br/>search, create, send<br/>computation / live"]
    P["PROMPT<br/>(reuse a workflow)<br/>---<br/>how we do X repeatably<br/>review checklist, playbook<br/>slash command in Claude Code"]
    R --- T --- P
\`\`\`

> ❓ **Check yourself:** Your agent calls \`get_schema\` before nearly every query, and the schema almost never changes. A colleague proposes raising the response cache TTL on that tool. Why is that the wrong building block entirely, and what is the right one?
>
> *(The schema is stable reference material, so it should be a resource the agent reads as context — not a tool it must call. A resource removes the round-trip and lets the agent see the structure up front, so it stops re-querying. Caching the tool only masks the symptom; it is still a per-call loop for static data.)*

### Key takeaways
- Catalogs and schemas are **resources**; live lookups and mutations are **tools**; reusable workflows are **prompts**.
- Tools and resources are **complements** — a well-designed server exposes both.
- Never hide tool sprawl behind an aggregator entry tool; fix descriptions and use progressive availability instead.`,
      principles: [
        "Schemas → **resources**; actions → **tools**; reusable workflows → **prompts**. Wrong block wastes round-trips.",
        "Tools and resources are **complements** — expose both: resources for stable facts, tools for actions.",
      ],
      pitfalls: [
        "Exposing a static schema as a tool forces a live round-trip for stable data; serve it as a resource.",
        "Aggregator entry tools hide the real surface and worsen model selection; fix descriptions instead.",
      ],
    },
    {
      id: 'tool-discovery-selection',
      title: 'Tool Discovery, Descriptions, and Selection',
      minutes: 5,
      body: `> **TL;DR** — When many servers are connected, the agent sees one combined registry and selects mostly on the **tool description**. If your specialized tool gets ignored, the fix is almost always a better description — not deleting the competition.

When several servers are connected, the host flattens their tools, the built-in tools, and any other servers' tools into one combined registry, and the model picks among them primarily on the **description text** — that string is the dominant ranking signal at selection time. So when the agent skips your specialized MCP tool and falls back to generic search or shell commands, a thin description is almost always the cause, and rewriting it is the fix — **not** removing the competing tools, since the agent legitimately needs those for other work. A description like "Analyzes code" competes against a generic \`grep\` the model already understands and loses, because it gives no reason to prefer it.

A strong MCP tool description should:

1. **Explain when this tool is preferable** to generic alternatives. *"Use this instead of shell grep when searching the internal codebase — it understands our monorepo layout and returns ranked, source-attributed results."*
2. **Describe inputs and outputs** precisely — units, formats, and constraints.
3. **Include examples** of realistic inputs and what the output looks like.
4. **Call out non-obvious capabilities**: transitive dependency analysis, safe refactoring support, pagination, source metadata, ranking signals.

### Weak vs strong: a code-search tool that keeps losing

**❌ Weak**

> name: search_code
> description: "Analyzes code."

The agent has no idea this beats \`grep\`, what it takes, or what it returns — so it falls back to the generic tool it already understands.

**✅ Strong**

> name: search_code
> description: "Search the internal monorepo by symbol, file, or natural-language
>   intent. Prefer this over shell grep for our codebase: it understands the
>   monorepo layout, follows transitive dependencies, and returns ranked results
>   with file path, line, and source attribution.
>   Input: { query: string, scope?: 'symbol'|'text', limit?: number }.
>   Example: { query: 'where is AuthToken minted', scope: 'symbol' } →
>   ranked hits with path:line and a short snippet."

### The \`list_changed\` notification

Servers can notify clients when their tool set changes — a feature flag flipped, a permission changed, another server connected downstream. The client refreshes its tool list and the agent can pick up the new capability (or drop a removed one) **without a session restart**. This matters in dynamic environments where tool availability is not static at session start.

### Progressive availability (preview)

Hosts with many connected servers may limit which tool definitions the agent sees at once — **progressive availability**, covered in depth in the final lesson. The implication for description authors: your description must read well **in isolation**, because the agent may discover your tool through a search step rather than seeing it lined up next to its siblings.

> ❓ **Check yourself:** An agent ignores your internal code-search tool (described "Analyzes code") and uses shell \`grep\`. A teammate proposes unregistering \`grep\` so the agent is forced onto your tool. Why is that the wrong fix, and what is the actual root cause?
>
> *(The agent still legitimately needs \`grep\` for other work, so removing it breaks unrelated tasks. The root cause is that the description gives the model no reason to prefer your tool: rewrite it to say when it beats generic alternatives, specify inputs and outputs, show an example, and surface non-obvious capabilities like ranking and source attribution.)*

### Key takeaways
- A poor description is the **most common** reason an agent skips a specialized MCP tool.
- Explain when the tool is **preferable** to generic alternatives, not just what it does.
- \`list_changed\` lets the agent pick up changed tool sets mid-session; progressive availability means your description must stand alone.`,
      principles: [
        "A weak description is the **most common** reason a tool is skipped — it is the primary selection signal.",
        "Strong descriptions say **when the tool beats alternatives**, describe inputs and outputs, give examples, and flag non-obvious capabilities.",
      ],
      pitfalls: [
        "\"Analyzes code\" gives no reason to prefer your tool over `grep`; explain when it wins and show an example.",
        "Removing competing tools to force selection is wrong — the agent still needs them; improve the description.",
      ],
    },
    {
      id: 'annotations-trust',
      title: 'Tool Annotations and the Trust Boundary',
      minutes: 5,
      body: `> **TL;DR** — Annotations like \`readOnlyHint\` are **untrusted hints, not a security boundary**. Use them to choose UX affordances; never use them to skip a security check your policy requires.

Annotations are metadata the server attaches to its own tool definitions — \`readOnlyHint\`, \`destructiveHint\`, and friends are values the server *asserts about itself*, and the host has no way to verify them. That single fact decides how you may use them: they are an input to UX (which dialog to show, what to auto-allow) but never an input to an authorization decision, because a malicious or buggy server can advertise \`readOnlyHint: true\` on a tool that deletes data. Treat an annotation the way you treat any client-supplied claim crossing a trust boundary — useful for presentation, inadmissible as proof.

### The standard annotation hints

| Annotation | Meaning |
|---|---|
| \`readOnlyHint\` | The tool does not modify state |
| \`destructiveHint\` | The tool may make irreversible changes |
| \`idempotentHint\` | Calling with the same input twice has the same effect as calling once |
| \`openWorldHint\` | The tool reaches external systems whose behavior the host cannot fully predict |

### How annotations *should* be used

Annotations help the **host build sensible UI affordances**:

- Auto-allow read-only tools without a confirmation prompt.
- Show a warning dialog before destructive operations.
- Suppress repeat-confirmation for idempotent calls.
- Display extra caution on open-world tools that touch external systems.

All of these are **UX decisions**. None of them is a security guarantee.

### Annotations are NOT a security boundary

This is a critical exam point. A malicious or simply buggy server can advertise \`readOnlyHint: true\` for a tool that **deletes data**. The annotation is **self-reported by the server**, and the host has no way to verify it independently.

The correct policy: **use annotations to choose which prompt or affordance to show the user, but never use them to skip a security check that your policy requires.** Base actual permission and confirmation decisions on the server's **configured trust level** (who approved it, how it was set up), the user's **policy**, the tool's identity, and the operation's real risk.

A concrete correct rule: *"If the server's trust level requires confirmation before destructive operations, confirm — regardless of whether \`destructiveHint\` is false or absent."*

### Weak vs strong: deciding whether to auto-approve

**❌ Weak — annotation as a security boundary**
\`\`\`js
if (tool.annotations.readOnlyHint === true) {
  autoApprove();   // trusting a self-reported flag
}
\`\`\`
A hostile server sets \`readOnlyHint: true\` on \`delete_all_records\`. The host auto-approves and data is destroyed.

**✅ Strong — annotation for UX, policy enforced in code**
\`\`\`js
const trust = registry.trustLevelFor(server);     // host-verified, not server-claimed
if (policy.requiresConfirmation(trust, operationRisk(tool))) {
  confirmWithUser();                               // enforced regardless of hints
}
// readOnlyHint only chooses a lighter dialog when policy already permits:
const dialog = tool.annotations.readOnlyHint ? "light" : "full";
\`\`\`

\`\`\`mermaid
flowchart LR
    subgraph server["SERVER SAYS (untrusted)"]
        S["readOnlyHint: true<br/>destructiveHint: false<br/>(self-reported)"]
    end
    subgraph host["HOST DECIDES (trusted)"]
        H["configured trust level<br/>user policy<br/>operation's real risk"]
    end
    S -->|"hints only<br/>not proof"| H
    S -.->|"chooses UX affordance"| S
    H -.->|"makes the security call"| H
\`\`\`

> ❓ **Check yourself:** Your policy requires confirmation before any destructive operation against a given server. A tool arrives advertising \`readOnlyHint: true\` and no \`destructiveHint\` at all. Does that combination let you safely auto-approve it?
>
> *(No. Both fields are self-reported by the server and unverifiable, so a hostile or buggy server could set them on a tool that deletes data. The confirmation requirement is bound to the server's configured trust level, not to its annotations; you still confirm. Annotations may only pick a lighter dialog once policy has already permitted the action.)*

### Key takeaways
- Annotations are **untrusted hints** from the server — use them for UX affordances, never to skip security checks.
- Base permission decisions on the server's **configured trust level** and your **policy**, not on what the server claims about itself.
- A missing or \`false\` annotation is not evidence of safety.`,
      principles: [
        "Annotations are **untrusted self-reports** — use for UX affordances only; never skip security checks on them.",
        "Base permission decisions on the server's **configured trust level and policy**, not on annotation values.",
      ],
      pitfalls: [
        "`readOnlyHint: true` is self-reported; auto-approving on it is a security mistake — use trust level instead.",
        "Absent `destructiveHint` is not evidence of safety; tie confirmation to trust level, not annotation presence.",
      ],
    },
    {
      id: 'error-handling',
      title: 'MCP Error Handling — Two Tiers',
      minutes: 5,
      body: `> **TL;DR** — Invalid invocation (missing param, bad method) → **JSON-RPC protocol error** (the model never sees it). The tool ran but the target failed (404, 503, denial) → **tool result with \`isError: true\`** (the model sees it and can adapt). Using the wrong tier is a classic bug.

The two tiers map to two distinct failure points: the call was never structurally valid, versus the call ran and its target failed. The first — missing required parameter, unknown method, malformed JSON — is a **JSON-RPC protocol error**, handled at the client/host layer and never relayed to the model as a result, because there is nothing for the model to reason about: the invocation itself was wrong. The second — a 404, a 503, a permission denial from the system the tool reached — is a **tool result with \`isError: true\`**, which the model *does* see and can act on by retrying, switching tools, or escalating. The dividing line is whether the failure occurred before or after the tool's business logic began executing; route on that, not on whether the call "felt" successful.

### Tier 1: JSON-RPC protocol errors

Return a **JSON-RPC protocol error** when the request itself is malformed or the tool cannot be invoked at all:

- Missing required parameters
- Unknown method name
- Malformed JSON
- Parameter type mismatches

The client treats these as **protocol-level failures**. They are **not** relayed to the model as a tool result — the model cannot "see" a protocol error and adapt. These signals go to the client/host layer.

### Tier 2: tool result with \`isError: true\`

Return a **tool result with \`isError: true\`** when the tool ran but failed semantically:

- A remote 404 (resource not found on the target system)
- A 503 from an upstream service
- A permission denial from the underlying system
- A validation rejection from the target API

The model **sees** these as tool results and can adapt: retry with different parameters, choose a different tool, or surface the problem to the user.

### The decision rule

> If the failure happened **before the tool's business logic could execute**, return a JSON-RPC protocol error. If the tool **reached its target system** and that system or operation failed, return a tool result with \`isError: true\` and a useful message.

### Weak vs strong: a tool wrapping a flaky internal API

**❌ Weak — wrong tier in both directions**

> - Missing required "order_id" → returns { isError: true, "need order_id" }
>      The model sees a tool result and retries with the SAME bad call → loop.
> - Upstream returns HTTP 503   → returns JSON-RPC error -32603
>      The model never sees it and cannot retry or escalate → silent dead end.

**✅ Strong — tier matched to cause**

> - Missing required "order_id" → JSON-RPC protocol error (invocation invalid;
>      handled at client/host layer, never reaches the model as a result).
> - Upstream returns HTTP 503   → { isError: true, content: "Upstream 503; transient,
>      safe to retry shortly or escalate." }  The model can reason about it.

### Why getting this wrong hurts

| Wrong choice | Effect |
|---|---|
| Missing-parameter failure in \`isError\` | Model retries with the same bad call — infinite loop |
| Remote 503 as a JSON-RPC error | Model cannot retry or recover — the error is invisible to it |

For **resources**, servers should validate URIs and return appropriate JSON-RPC errors for not-found or internal failures. For **tools** wrapping inherently flaky network calls, lean toward \`isError: true\` with a clear message so the agent can decide whether to retry, switch tools, or escalate.

> ❓ **Check yourself:** You return missing-parameter failures as \`isError: true\` and upstream 503s as JSON-RPC protocol errors, reasoning that both are "errors the client should know about." Trace what the model actually experiences in each case.
>
> *(Both are inverted. The \`isError\` on a missing parameter is relayed to the model, which retries the same structurally invalid call and loops. The protocol error on the 503 never reaches the model, so it cannot retry, switch tools, or escalate a transient failure it should have been able to recover from. Route on where the failure occurred: invalid invocation → protocol error; the tool reached its target and that target failed → \`isError: true\`.)*

### Key takeaways
- Protocol errors are for **invalid invocations**; \`isError: true\` is for **runtime failures** the model can reason about.
- A clear \`isError\` message lets the model retry intelligently — a JSON-RPC error on a transient failure **silences** it.
- Missing-parameter as \`isError\` causes retry loops; a remote 503 as a protocol error blinds the model.`,
      principles: [
        "Invalid call → **JSON-RPC error** (model can't see it); runtime failure → **`isError: true`** (model adapts).",
        "Wrong tier: `isError` on bad params → retry loop; protocol error on a 503 → silences a recoverable failure.",
      ],
      pitfalls: [
        "`isError: true` on a missing-parameter call makes the model retry the same broken request in a loop.",
        "A JSON-RPC protocol error for a remote 503 hides the failure from the model; return `isError: true` instead.",
      ],
    },
    {
      id: 'progressive-availability-claude-code',
      title: 'Progressive Availability and MCP in Claude Code',
      minutes: 5,
      body: `> **TL;DR** — Progressive availability shows the agent a small tool surface and lets it pull more on demand, so descriptions must stand alone. In Claude Code, MCP servers configure at three scopes — and personal credentials must never land in project scope.

A host wired to dozens of servers cannot afford to inline every tool definition at session start — that would burn a large fraction of the context window before any work begins. Progressive availability solves this by presenting a small initial surface and letting the agent pull additional definitions **on demand**, paying tokens only for tools it is about to use. The design consequence is concrete: the agent often encounters your tool through a search step and ranks it on its **description alone**, before the full schema ever loads, so a weak description means the tool is never pulled and never selected.

### Progressive tool availability

**Design implication:** if your MCP server targets a progressive-availability host, descriptions must read well **in isolation**. The agent often discovers your tool through a **search step** and sees only the description before deciding whether to pull the full schema. A weak description means the tool is never selected — it is never even fully loaded.

### \`list_changed\` and dynamic tool sets

A server can send a \`list_changed\` notification to tell clients its tool set has changed. Clients refresh their registry, and the agent can pick up a new capability — or lose a removed one — **without a session restart**. This supports feature-flag-driven exposure and permission-based availability. Note the contrast: progressive availability controls *which definitions the agent sees up front*; \`list_changed\` signals *that the set itself changed*. They are not the same mechanism.

### MCP scopes in Claude Code

Claude Code configures MCP servers at three scopes:

| Scope | Storage | Visibility | Typical Use |
|---|---|---|---|
| **Project** | \`.mcp.json\` at the repo root, checked in | Everyone who clones the repo | Shared team tools: docs servers, test runners, build orchestration |
| **Local** | Entry in \`~/.claude.json\` keyed to the project path | Current user, only in that project | Sensitive personal credentials, experimental servers not ready to share |
| **User** | Entry in \`~/.claude.json\`, not tied to a project | Current user, in any project | Personal productivity tools: calendar, email, notes |

When the same server name appears at multiple scopes, the higher-precedence scope wins. The typical convention is **project > local > user**: a team-shared \`.mcp.json\` definition overrides a user's experimental copy of the same server name.

### Weak vs strong: where to put a personal OAuth token

**❌ Weak** — Put the experimental server using your personal OAuth token in **project scope** (\`.mcp.json\`) "so the config is captured in version control." The token is now committed and shared with everyone who clones the repo — a credential leak.

**✅ Strong** — Put it in **local scope**: an entry in \`~/.claude.json\` keyed to the project path. It is visible only to you, only in that project, and **nothing is committed**. When you are ready to share the server (without the secret), promote it to project scope.

### Key nuances for the exam

- Local and user scopes **both live in \`~/.claude.json\`** but at different keys. They are **not** the same scope with different names. Local entries are scoped to a project path; user entries are global to the user.
- **Never put personal credentials in project scope** — they belong in local or user scope, where they stay on the developer's machine and are not committed.
- MCP prompts surface in Claude Code as **slash commands** with the pattern \`mcp__<server>__<prompt>\`.
- MCP tool output can be large. Authors should control output size and offer pagination or summarization affordances so a single call does not crowd out the conversation context.

\`\`\`mermaid
flowchart TD
    subgraph pa["Progressive Availability (a menu)"]
        PA1["small surface shown first"]
        PA2["agent pulls definitions on demand"]
        PA3["description must stand alone"]
        PA4["list_changed = the menu changed"]
        PA1 --> PA2 --> PA3
        PA4 -.->|"signals set change"| PA2
    end
    subgraph sc["Scopes in Claude Code"]
        PR["project scope<br/>.mcp.json (shared, committed)"]
        LO["local scope<br/>~/.claude.json keyed to path"]
        US["user scope<br/>~/.claude.json global"]
        PR -->|"highest precedence"| LO --> US
    end
\`\`\`

> ❓ **Check yourself:** A developer puts an experimental server holding their personal OAuth token in user scope, reasoning "user scope is in \`~/.claude.json\`, so it stays on my machine and is never committed." The credential is indeed safe from version control — so what is still wrong with this placement?
>
> *(Scope is about visibility, not just secrecy. User scope exposes the server in *every* project the developer opens, well beyond the one project they are testing in. The correct choice is local scope — also in \`~/.claude.json\` but keyed to the project path — which both keeps the token uncommitted and confines the server to that single project.)*

### Key takeaways
- Progressive availability means descriptions must **sell the tool in isolation** — search finds it before the schema loads.
- Project scope is **shared and version-controlled** — never put personal credentials there.
- Local and user scopes share a file but differ: local is per-project-path, user is global to the developer.`,
      principles: [
        "Under progressive availability the agent judges a tool by description alone — descriptions must **stand alone**.",
        "**Project scope** (`.mcp.json`) is committed and shared — team tools only; credentials belong in **local scope**.",
      ],
      pitfalls: [
        "Personal credentials in `.mcp.json` are committed and leak to all cloners; use local scope instead.",
        "Local and user scope both live in `~/.claude.json` but differ: local is per-project-path; user is global.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-building-block-choice',
      type: 'mcq',
      scenario: 'Your agent needs to consult a database schema (table names, column types, relationships) before deciding which tables to query. The schema changes at most once a week.',
      question: 'Which MCP building block is most appropriate for exposing the database schema?',
      options: [
        'A tool called get_schema that executes a live INFORMATION_SCHEMA query each time.',
        'A resource containing the schema, which the agent can fetch as reference context.',
        'A prompt template that embeds the schema and is invoked as a slash command.',
        'A combination of readOnlyHint-annotated tools, one per table.',
      ],
      answer: 1,
      explanation: 'Stable reference material — a schema that changes weekly — belongs in a resource. Resources reduce exploratory tool calls because the agent can read the schema as context without making a live query. A tool forces an extra round-trip to learn static information; a prompt is for reusable workflow templates, not passive data.',
    },
    {
      id: 'ex-error-tier',
      type: 'mcq',
      scenario: 'An MCP tool wraps an internal REST API. A caller invokes the tool with a correctly formed request. The upstream REST API returns HTTP 503 Service Unavailable.',
      question: 'How should the MCP tool surface this failure?',
      options: [
        'Return a JSON-RPC protocol error with code -32601 (Method not found).',
        'Return a JSON-RPC protocol error with a custom error code.',
        'Return a tool result with isError: true and a descriptive message about the 503.',
        'Swallow the error and return an empty tool result so the model can continue.',
      ],
      answer: 2,
      explanation: 'The tool reached its target system and that system failed — this is a semantic/runtime failure, not a protocol violation. Return isError: true with a clear message. The model can then decide to retry, switch tools, or escalate. A JSON-RPC protocol error would be invisible to the model and prevent recovery.',
    },
    {
      id: 'ex-annotation-match',
      type: 'mcq',
      scenario: "A host receives an MCP tool with the annotation `idempotentHint: true`. According to the MCP annotation model, what is the most appropriate way for the host to use this hint?",
      question: "What does `idempotentHint: true` mean and how should the host apply it?",
      options: [
        "The tool cannot modify state, so the host may auto-approve it without confirmation.",
        "The tool may make irreversible changes, so the host should show a full warning dialog.",
        "Calling the tool twice with the same input has the same effect as once, so the host can suppress repeat-confirmation dialogs as a UX affordance.",
        "The tool reaches external systems, so the host should apply extra caution before allowing the call.",
      ],
      answer: 2,
      explanation: "`idempotentHint: true` means duplicate calls with identical inputs produce the same outcome — the host can safely suppress repeat-confirmation dialogs. Option A describes `readOnlyHint` (no state modification). Option B describes `destructiveHint` (irreversible changes). Option D describes `openWorldHint` (external system reach). All annotations are untrusted UX hints only and never substitute for policy-based security checks.",
    },
    {
      id: 'ex-scope-choice',
      type: 'mcq',
      scenario: 'A developer is evaluating an experimental MCP server that connects to their personal GitHub account using an OAuth token. They want it available only in one specific project while they test it, and they do not want to commit any credentials.',
      question: 'Which Claude Code MCP scope should they use?',
      options: [
        'Project scope — store in .mcp.json at the repo root so the whole team can use it.',
        'Local scope — stored in ~/.claude.json keyed to the project path, visible only to this user in this project.',
        'User scope — stored in ~/.claude.json globally so it is available across all their projects.',
        'There is no scope for single-project personal use; project scope is the only option.',
      ],
      answer: 1,
      explanation: 'Local scope is exactly right: it lives in ~/.claude.json keyed to the project path, so it is only visible to this user when working in that project, and credentials are never committed to the repo. Project scope would share credentials with everyone who clones. User scope would expose the server in every project the developer works on.',
    },
    {
      id: 'lab-trust-boundaries',
      type: 'lab',
      title: 'Design MCP Server Trust Boundaries for a Real Scenario',
      brief: `You are the architect for an internal developer platform. Your team is deploying three MCP servers:

1. **docs-server** — serves internal API documentation and architecture diagrams (read-only, public within the company).
2. **deploy-server** — triggers production deployments and rollbacks (irreversible operations, restricted to senior engineers).
3. **metrics-server** — queries a live observability platform and returns dashboards (read-only, but reaches an external SaaS).

For each server, write a short policy decision covering:
- Which Claude Code scope (project / local / user) it should be configured in and why.
- Which MCP annotation hints it should advertise and whether the host should use them to skip confirmation steps.
- One concrete security control the host must enforce regardless of what the server advertises.

Write your response as structured prose or a table. Be specific — say what you would actually configure, not just the principles.`,
      placeholder: 'docs-server:\n  Scope: ...\n  Annotations: ...\n  Security control: ...\n\ndeploy-server:\n  Scope: ...\n  Annotations: ...\n  Security control: ...\n\nmetrics-server:\n  Scope: ...\n  Annotations: ...\n  Security control: ...',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate MCP trust-boundary and configuration decisions. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is correct, (3) concrete improvements. Focus on: correct scope selection and rationale, appropriate annotation use without over-trusting self-reported hints, meaningful security controls that are independent of annotation values, and avoiding credential leakage via project scope.',
      evalTemplate: 'A learner submitted this MCP trust-boundary design for a three-server developer platform scenario:\n\n{{input}}\n\nReview it against these criteria: (1) scope selection matches visibility and credential-safety requirements, (2) annotations are used for UX affordances only — not to skip required security checks, (3) at least one concrete host-enforced control per server that does not rely on server-reported annotation values, (4) deploy-server has the strictest controls given its destructive/irreversible nature. If the learner confuses local vs user scope or trusts annotations as security boundaries, call it out specifically.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'A platform team has five different AI tools that all need to read from the same internal ticketing system. A sixth, highly specialized workflow needs a one-off capability that no other agent will ever use. How should the team approach these two integrations?',
      options: [
        'Build MCP servers for both — MCP is always the most maintainable choice for any external integration.',
        'Expose the ticketing data through one MCP server reused by all five tools, but consider a custom tool baked into the single app for the one-off workflow.',
        'Build a custom tool for the ticketing data so each of the five apps owns its own copy, and an MCP server for the one-off workflow.',
        'Use MCP for the one-off workflow only, since MCP is designed specifically for application-specific capabilities.',
      ],
      answer: 1,
      explanation: 'Correct: MCP earns its weight when the same capability should be reachable from multiple clients, so one ticketing server serves all five tools and avoids five bespoke integrations, while a capability only one agent needs is often simpler as a local custom tool. "Build MCP servers for both" is wrong because a single-consumer capability gains nothing from the protocol overhead. "A custom tool ... so each of the five apps owns its own copy" recreates exactly the duplication MCP exists to remove. "MCP for the one-off only" inverts the rule — MCP is for reuse, not application-specific one-offs, which are the case where a custom tool is simpler.',
    },
    {
      id: 'q2',
      question: 'An architect connects an MCP server and assumes that doing so will automatically give the integration authentication, rate limiting, and response caching. Why is this assumption wrong?',
      options: [
        'MCP provides authentication and caching but not rate limiting, which must be added separately.',
        'MCP is a protocol, not a middleware platform — auth, rate limiting, retries, and caching remain the responsibility of whoever builds and operates the server.',
        'MCP provides all three automatically, but only when the server runs over a secure transport.',
        'MCP provides these only for resources, not for tools.',
      ],
      answer: 1,
      explanation: 'Correct: MCP standardizes how capabilities are described and exchanged but is a protocol, not a complete middleware platform, so auth, rate limiting, retries, and caching stay with the server builder/operator. "Authentication and caching but not rate limiting" is wrong because it provides none of them automatically, not some. "All three automatically over a secure transport" is wrong because transport security does not implement auth or caching. "Only for resources, not tools" is wrong because neither building block gets these concerns for free.',
    },
    {
      id: 'q3',
      question: 'An agent needs to consult an API specification (endpoint shapes, request formats) before deciding which call to make. The spec is stable, changing at most monthly. Which MCP building block fits best?',
      options: [
        'A tool that returns the current spec on every invocation, so the agent always gets fresh data.',
        'A prompt template embedding the spec, invoked as a slash command.',
        'A resource containing the spec, which the agent reads as reference context before acting.',
        'A set of readOnlyHint-annotated tools, one per endpoint.',
      ],
      answer: 2,
      explanation: 'Correct: stable reference material the agent consults before acting belongs in a resource — it reads it like context and avoids extra exploratory tool calls. "A tool that returns the spec on every invocation" forces a round-trip to learn static structure, the exact anti-pattern of exposing a schema as a tool. "A prompt template" is for reusable workflows like checklists and playbooks, not passive reference data. "Per-endpoint annotated tools" fragments stable reference content and confuses passive context with invokable actions — annotations do not make that the right block.',
    },
    {
      id: 'q4',
      question: 'A team argues that since their MCP server exposes resources for the database catalog, it does not also need tools — the agent can just read the catalog. What is the flaw in this reasoning?',
      options: [
        'Resources cannot represent a catalog, so the design would not work at all.',
        'Resources and tools are complements: resources tell the agent what is true and stable, but without tools the agent cannot take any action on the system.',
        'A server may expose either resources or tools but never both, so the team must pick one.',
        'Resources are model-controlled, so the agent would modify the catalog unintentionally.',
      ],
      answer: 1,
      explanation: 'Correct: resources answer "what is true and stable" and tools answer "what actions can be taken" — they are complements, and replacing tools with resources leaves the agent able to learn but unable to act. "Resources cannot represent a catalog" is wrong; that is a textbook resource use. "Either resources or tools but never both" is wrong — a well-designed server exposes both. "Resources are model-controlled" is wrong: resources are application-controlled passive context, so reading one does not let the agent mutate the catalog.',
    },
    {
      id: 'q5',
      question: 'An agent connected to eight MCP servers keeps falling back to generic shell grep instead of a specialized internal code-search tool. The tool\'s description currently just says "Analyzes code." What is the best first fix?',
      options: [
        'Remove the generic shell and search tools so the agent is forced onto the code-search tool.',
        'Replace the individual server tools with one aggregator entry tool that routes requests internally.',
        'Rewrite the description to explain when it beats generic alternatives, its inputs/outputs, examples, and non-obvious capabilities.',
        'Reduce the number of connected MCP servers to cut down on competition.',
      ],
      answer: 2,
      explanation: 'Correct: a weak description like "Analyzes code" is the most common reason an agent skips a specialized tool, so the fix is a description that says when the tool is preferable, describes inputs/outputs, gives examples, and calls out capabilities like ranking and source attribution. "Remove the generic tools" is wrong because the agent usually still needs them for other work. "One aggregator entry tool" hides the real tool surface and produces worse selection. "Reduce the number of servers" addresses competition crudely while leaving the actual description-quality problem unsolved.',
    },
    {
      id: 'q6',
      question: 'An MCP server runs on a host that uses progressive availability, so the agent often discovers a tool through a search step and sees only its description before pulling the full schema. What does this imply for the tool author?',
      options: [
        'Descriptions can be terse because the agent always sees the full schema alongside sibling tools.',
        'The description must read well in isolation, since the agent may judge the tool on its description alone before loading the schema.',
        'The server should send a list_changed notification on every turn so the agent re-reads all tools.',
        'Progressive availability removes the need for good descriptions because search ranks tools automatically.',
      ],
      answer: 1,
      explanation: 'Correct: under progressive availability the host shows a small surface and the agent pulls definitions on demand, often discovering a tool via search and seeing only its description first, so the description must sell the tool in isolation. "Descriptions can be terse" fails precisely because the agent does not see the tool listed alongside its siblings. "Send list_changed every turn" misuses that mechanism, which signals a changed tool set, not forced re-reading. "Removes the need for good descriptions" is wrong — the description is the very signal search and the agent rank on.',
    },
    {
      id: 'q7',
      question: 'A reviewer wants to auto-approve an MCP tool without confirmation because it advertises readOnlyHint: true. Under a sound trust policy, what is the correct stance?',
      options: [
        'Auto-approve it — readOnlyHint: true is the specification\'s guarantee that the tool cannot modify state.',
        'Auto-approve it only if it also carries idempotentHint: true.',
        'Auto-approve based on the vendor\'s reputation rather than the annotation.',
        'Do not treat the annotation as proof of safety — annotations are self-reported hints, so the decision must rest on the server\'s configured trust level and policy.',
      ],
      answer: 3,
      explanation: 'Correct: annotations are self-reported and the host cannot verify them — a malicious or buggy server can advertise readOnlyHint: true on a tool that deletes data — so the decision must rest on the server\'s configured trust level and your policy. "readOnlyHint: true is the spec\'s guarantee" is the exact mistake the trust model warns against. "Only if it also carries idempotentHint" changes nothing — both are still untrusted self-reports. "Based on the vendor\'s reputation" is not the operative control; the configured trust level and your own checks are, with annotations used only for UX affordances.',
    },
    {
      id: 'q8',
      question: 'A host\'s policy requires confirmation before any destructive operation against a particular server. A tool from that server arrives with destructiveHint absent (not set). What should the host do?',
      options: [
        'Skip the confirmation, since the absence of destructiveHint indicates the operation is not destructive.',
        'Still require confirmation, because the policy is tied to the server\'s trust level, not to self-reported annotation values.',
        'Skip confirmation but log the call for later audit.',
        'Ask the server to re-send the tool definition with annotations populated before deciding.',
      ],
      answer: 1,
      explanation: 'Correct: if the server\'s trust level requires confirmation before destructive operations, confirm regardless of whether destructiveHint is false or absent — annotations influence UX, not policy. "Skip the confirmation" trusts a self-reported, possibly omitted hint to override a required security check. "Skip but log for audit" does not satisfy a policy that requires confirmation before the operation. "Ask the server to repopulate annotations" still relies on untrusted server-supplied data and does not change what policy demands.',
    },
    {
      id: 'q9',
      question: 'A caller invokes an MCP tool but omits a parameter the tool\'s schema declares as required. How should the server respond, and why?',
      options: [
        'Return a tool result with isError: true so the model can see the problem and try again.',
        'Return an empty successful tool result so the model moves on to another approach.',
        'Return a JSON-RPC protocol error, because the failure happened before any business logic could run.',
        'Return isError: true only if the missing parameter was optional, otherwise a protocol error.',
      ],
      answer: 2,
      explanation: 'Correct: a missing required parameter means the call was never structurally valid, so the failure happened before the tool\'s business logic could execute — a JSON-RPC protocol error handled at the client/host layer. "Return isError: true" is the classic bug: the model sees a tool result and retries with the same bad call, risking an infinite loop. "An empty successful result" hides a real invocation failure and misleads the model. "isError only if the parameter was optional" is muddled — a truly optional parameter would not trigger this error at all.',
    },
    {
      id: 'q10',
      question: 'An MCP tool wraps a flaky internal API. A well-formed call reaches the API, which returns HTTP 503 Service Unavailable. What is the correct error response?',
      options: [
        'A JSON-RPC protocol error, so the client knows the server could not complete the request.',
        'A tool result with isError: true and a clear message about the 503, so the model can decide whether to retry, switch tools, or escalate.',
        'A JSON-RPC error with code -32602 (Invalid params).',
        'An empty tool result, letting the model assume there was simply no data.',
      ],
      answer: 1,
      explanation: 'Correct: the tool reached its target and that system failed at runtime — a semantic failure the model should see — so return isError: true with a useful message, letting the agent reason about retrying or escalating. "A JSON-RPC protocol error" would be invisible to the model, preventing recovery from a transient failure. "-32602 Invalid params" is wrong because the call was well-formed — nothing was invalid at the protocol boundary. "An empty result" falsely signals "no data" rather than an upstream outage, leading the model to a wrong conclusion.',
    },
    {
      id: 'q11',
      question: 'A team is deciding where to store an MCP server that triggers their shared build orchestration, which every developer who clones the repo should be able to use. Which Claude Code scope is appropriate?',
      options: [
        'Project scope — a .mcp.json checked into the repo root, visible to everyone who clones it.',
        'Local scope — an entry in ~/.claude.json keyed to the project path, visible only to the current developer.',
        'User scope — an entry in ~/.claude.json not tied to any project, visible to the developer everywhere.',
        'Either local or user scope, since both live in ~/.claude.json and are functionally the same.',
      ],
      answer: 0,
      explanation: 'Correct: a shared team tool like build orchestration belongs in project scope — a checked-in .mcp.json at the repo root that everyone who clones sees, exactly its intended use. "Local scope" is per-user and per-project-path, so it would not reach the rest of the team. "User scope" is global to one developer and not committed, so teammates would never get it. "Either local or user, functionally the same" is a known trap: they share the ~/.claude.json file at different keys, with local scoped to a project path and user global to the developer.',
    },
    {
      id: 'q12',
      question: 'A developer is evaluating an experimental MCP server that uses their personal OAuth token. They want it available only in one project while testing, and they must not commit any credentials. Which scope is correct?',
      options: [
        'Project scope, so the configuration is captured in version control for reproducibility.',
        'User scope, so it is conveniently available in every project they touch.',
        'Local scope — an entry in ~/.claude.json keyed to the project path, visible only to them in that project, with nothing committed.',
        'No single scope fits; they must split the token into project scope and the server into user scope.',
      ],
      answer: 2,
      explanation: 'Correct: local scope lives in ~/.claude.json keyed to the project path, is visible only to this developer in that one project, and commits nothing — ideal for sensitive personal credentials and not-yet-shared experiments. "Project scope" would commit the OAuth token into a shared .mcp.json, leaking credentials to everyone who clones — the cardinal mistake. "User scope" would expose the experimental server in every project, broader than wanted. "Split the token and server across scopes" is needless complexity; local scope already satisfies all three requirements.',
    },
    {
      id: 'q13',
      question: 'A feature flag flips downstream of an MCP server, changing which tools the server offers. The team wants connected agents to pick up the new tool without users restarting their sessions. Which mechanism enables this?',
      options: [
        'Progressive availability, which loads every tool definition at session start.',
        'A list_changed notification from the server, prompting clients to refresh their tool registry mid-session.',
        'An isError: true tool result that signals the registry is stale.',
        'Re-advertising readOnlyHint on the affected tools so the host re-reads them.',
      ],
      answer: 1,
      explanation: 'Correct: a server sends a list_changed notification when its tool set changes — a flipped feature flag, a permission change, a downstream connection — and clients refresh their registry so the agent gains or loses capabilities without a session restart. "Progressive availability ... loads every tool at session start" is backwards: it shows a small surface and pulls definitions on demand, and is not the notification mechanism. "An isError: true result" reports a runtime tool failure, not a registry change. "Re-advertising readOnlyHint" is a UX hint about behavior and has nothing to do with signaling that the tool list changed.',
    },
    {
      id: 'q14',
      question: 'A user types a slash command of the form mcp__docs__review_checklist in Claude Code. What does this most likely represent?',
      options: [
        'An MCP tool being invoked directly, bypassing the model\'s tool selection.',
        'An MCP resource being fetched into context as a slash command.',
        'An MCP prompt — a reusable workflow surfaced as a slash command following the mcp__<server>__<prompt> pattern.',
        'A protocol-level error namespace returned by the docs server.',
      ],
      answer: 2,
      explanation: 'Correct: MCP prompts are reusable workflows (checklists, report templates, playbooks) that surface in Claude Code as slash commands following the mcp__<server>__<prompt> pattern, so mcp__docs__review_checklist is the docs server\'s review-checklist prompt. "An MCP tool invoked directly" is wrong — tools are model-controlled actions, not user-typed slash commands in this pattern. "An MCP resource fetched as a slash command" is wrong — resources are passive context the agent reads, not slash commands. "A protocol-level error namespace" is wrong — the string is a prompt identifier; protocol errors are JSON-RPC failures, not slash-command names.',
    },
    {
      id: 'q15',
      question: 'An MCP tool returns very large payloads that quickly crowd out the rest of the conversation context. What is the recommended way for the tool author to handle this?',
      options: [
        'Always return the full payload — trimming output risks hiding data the model needs.',
        'Move the data into a JSON-RPC protocol error so it does not count against context.',
        'Control output size and offer pagination or summarization affordances so a single call does not dominate the context.',
        'Rely on the host\'s progressive availability to discard the output automatically after the call.',
      ],
      answer: 2,
      explanation: 'Correct: MCP tool output can be large, so authors should control output size and provide pagination or summarization affordances, preventing one call from crowding out the conversation. "Always return the full payload" is exactly the problem being described and ignores the author\'s responsibility to manage output. "Move the data into a JSON-RPC protocol error" misuses the error tier — protocol errors are for invalid invocations and are not even relayed to the model as results. "Rely on progressive availability to discard output" is wrong: it governs which tool definitions the agent sees up front, not retroactive trimming of returned output.',
    },
  ],
}
