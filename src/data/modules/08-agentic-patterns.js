export default {
  id: 'agentic-patterns',
  num: 8,
  title: 'Agentic Patterns and Task Decomposition',
  summary: 'How to match the right multi-agent pattern to the shape of a task — from prompt chaining and routing to orchestrator-workers, dynamic decomposition, and parallel subagents — and how to handle context passing, tool distribution, state persistence, and provenance across agents.',
  estMinutes: 42,
  tags: ['Agents', 'Orchestration', 'Decomposition'],

  lessons: [
    {
      id: 'core-patterns',
      title: 'Matching the Right Pattern to the Task Shape',
      minutes: 8,
      body: `> **TL;DR** — There is no "best" agentic pattern in the abstract. The right pattern is the one whose structure matches the *shape* of the work in front of you.

Every agentic app runs the same loop — **observe → reason → act → observe again** — so the patterns do not differ in what they do but in *who decides the next step and how tightly that decision is constrained*. That is the single design dial: how much autonomy you hand the model versus how much structure you impose up front. The five patterns are points along that dial. The selection question is therefore not "which is best" but "what is the control structure of this work": are the steps fixed and ordered (constrain hard), do inputs fall into known classes (classify and dispatch), does the next action depend on the last finding (let the model re-plan), or are the units independent (fan out). Match the pattern to that structure, not to preference.

### The five patterns and the shapes they fit

| Pattern | Best for (task shape) | Avoid when |
|---|---|---|
| Prompt chaining | Fixed workflow, known steps, same order every time | The path depends heavily on findings |
| Routing | Inputs fall into distinct, stable categories | Categories are fuzzy or evolving rapidly |
| Orchestrator-workers | A coordinator must choose and delegate to specialists | A simple fixed chain would be cheaper |
| Dynamic decomposition | Investigation where each discovery changes the plan | The task is mechanical and well-defined |
| Parallel subagents | Independent workstreams that can run at once | Workstreams depend on each other's results |

### Why each pattern earns its keep

**Prompt chaining** sequences a fixed set of steps in a known order; each step feeds the next. It trades flexibility for reliability — the model cannot skip or rearrange steps. A three-stage review (style → security → documentation) fits because every document needs all three, in that order. You pay predictability cost; pay it only when the steps genuinely are fixed.

**Routing** classifies each request and dispatches it to a matching handler. Invoices, receipts, and contracts need different extraction tools, so a router reads the type and calls the right pipeline. Routing shines when categories are *clear and stable*; it breaks down when boundaries are fuzzy or new categories appear constantly.

**Orchestrator-workers** puts a coordinator model in charge of *deciding* which subtasks go to which specialist. A research coordinator might send one document to a legal analyst and another to a financial analyst, then synthesize. The point is the *choice* — if a fixed chain would do, use the chain, because each delegation costs a tool call, a fresh subagent context, and a separate model invocation.

**Dynamic decomposition** is for when the next step *genuinely depends on what the model just learned*. Debugging an intermittent backend failure, root-causing an odd error, narrowing a flaky test — the model cannot write a fixed plan upfront because each finding determines what to inspect next. The trade-off is unpredictability, so set explicit **termination criteria and step caps**.

**Parallel subagents** cut a large task into independent pieces — auditing 50 repos, analyzing 30 docs — and run them concurrently. The hard constraint: the pieces must be *genuinely independent*. If a finding from one stream must inform another, they cannot safely run in parallel.

### Weak vs strong: a security-triage agent

**❌ Weak — force a fixed chain onto an investigation**
\`\`\`mermaid
flowchart LR
    A["examine(alert)"] --> B["pull_logs — always"]
    A --> C["query_siem — always"]
    A --> D["page_oncall — always"]
    B & C & D --> E["Report<br/>(pages humans for benign alerts)"]
\`\`\`
Every alert runs every step regardless of relevance: shallow triage, wasted effort, and on-call paged for noise.

**✅ Strong — let findings drive the next action (dynamic decomposition)**
\`\`\`mermaid
flowchart LR
    A["examine(alert)"] --> B{"decide from<br/>alert content"}
    B -->|"logs needed?"| C["pull_logs"]
    B -->|"SIEM needed?"| D["query_siem"]
    B -->|"page needed?"| E["page_oncall"]
    C & D & E --> F{"still ambiguous?"}
    F -->|yes| A
    F -->|no| G["Done"]
\`\`\`
The action set is chosen *after* reading the alert, so the agent does only what the evidence warrants.

### The contrast that anchors the whole module

\`\`\`mermaid
flowchart LR
    subgraph FIXED["Billing Dispute — Prompt Chaining"]
        A1["Verify identity"] --> A2["Fetch invoice"] --> A3["Check policy"] --> A4["Propose adjustment"]
    end
    subgraph EXPLORATORY["Incident Triage — Dynamic Decomposition"]
        B1["Examine alert"] --> B2{"Next step depends<br/>on findings"}
        B2 -->|option| B3["Pull logs"]
        B2 -->|option| B4["Query SIEM"]
        B2 -->|option| B5["Page on-call"]
        B3 & B4 & B5 --> B6["Re-decide based<br/>on what was found"]
    end
\`\`\`

> ❓ **Check yourself:** Your billing workflow runs "verify identity → fetch invoice → check policy → propose adjustment" reliably. A teammate wants to switch it to dynamic decomposition "so it can handle edge cases the chain misses." The step order has never actually varied in production. Do you agree?
>
> *(No. Dynamic decomposition pays a per-turn re-planning cost and yields nondeterministic step order — for a sequence that is genuinely fixed, that buys unpredictability and inconsistent outputs with zero upside. Keep the chain; handle edge cases with branches or validation inside it, not by surrendering the order to a coordinator.)*

### Key takeaways
- Choose the pattern by **task shape**, not by preference or novelty.
- Fixed steps → **chaining**; stable categories → **routing**; specialist choice → **orchestrator-workers**; findings drive next step → **dynamic decomposition**; independent pieces → **parallel subagents**.
- Dynamic decomposition needs explicit termination criteria and step caps because its plans are unpredictable.`,
      principles: [
        "Match pattern to task shape: chain=fixed, route=stable, orchestrator=specialist, dynamic=findings-driven.",
        "Fixed workflows belong in chains; exploratory investigations belong in dynamic decomposition — not both.",
        "Routing requires stable, well-defined categories; fuzzy or rapidly-changing boundaries degrade it silently.",
      ],
      pitfalls: [
        "Chaining onto an investigation runs every step regardless of evidence; use dynamic decomposition instead.",
        "Orchestrator-workers when a fixed chain is cheaper — use the chain when steps are known upfront.",
        "Dynamic decomposition on mechanical tasks — planner overhead yields inconsistent results; use chaining.",
      ],
    },
    {
      id: 'when-not-to-delegate',
      title: 'When the Coordinator Should NOT Delegate',
      minutes: 6,
      body: `> **TL;DR** — Delegation has a fixed overhead. Pay it only for scope, specialization, or parallelism — never for busywork the coordinator could finish in its current turn.

Delegation is cheap to *write* and expensive to *run*. Every subagent invocation pays a fixed bundle of costs — a tool call, a fresh context the child cannot skip, a separate model invocation, and a result-passing step the coordinator must parse and merge — and none of that is free regardless of how small the delegated task is. So the decision is a straight cost-benefit comparison: delegation only pays off when it buys back something the inline path cannot, namely scope relief (the work would flood the coordinator's window), specialization (a different prompt or tool set), or parallelism (concurrent wall-clock savings). Absent one of those, doing the work in the current turn is strictly cheaper and faster.

### What every delegation actually costs

Each delegation incurs, without exception:

- A **tool call** from the coordinator to launch the subagent.
- A **fresh context** — the subagent starts from scratch, *not* from the coordinator's conversation.
- A **separate model invocation** with its own latency and cost.
- A **result-passing step** back to the coordinator, which must then parse and merge.

When the coordinator already holds the relevant context and the work is small, a subagent is strictly **slower and more expensive** than just doing the work inline.

### Decision criteria: delegate vs do it yourself

Delegate when **any** of these hold:

- **Scope** — the task would flood the coordinator's context (e.g., reading a long full-length document that would consume most of the window).
- **Specialization** — the task needs a different prompt or tool set: a specialist persona, tools the coordinator lacks, or a very different system prompt.
- **Parallelism** — the task can run concurrently with other subagent work, saving wall-clock time.

Do **not** delegate when:

- The coordinator already has everything it needs and the work is small.
- The task is a short synthesis of retrieved results ("summarize these three sentences").
- No latency or context savings result.

### Weak vs strong: a coordinator that just read an abstract

**❌ Weak — delegate for cleanliness**
\`\`\`mermaid
flowchart LR
    A["Coordinator reads<br/>3-sentence abstract<br/>(already in context)"] --> B["spawn SummarizerAgent"]
    B --> C["cost: tool call + fresh context<br/>+ model invocation + handoff"]
    C --> D["benefit: none<br/>no scope, specialization,<br/>or parallelism"]
\`\`\`

**✅ Strong — answer inline; reserve delegation for the heavy case**
\`\`\`mermaid
flowchart LR
    A{"Task size?"}
    A -->|"small — already in context"| B["Coordinator summarizes directly<br/>(zero overhead)"]
    A -->|"40 full papers — context overflow"| C["Partition into batches"]
    C --> D["Spawn parallel subagents"]
    D --> E["Coordinator synthesizes results"]
\`\`\`

### Visual aid: the delegation decision

\`\`\`mermaid
flowchart TD
    Q{"Will this task..."}
    Q -->|"flood my context?"| D["DELEGATE"]
    Q -->|"need different tools<br/>or persona?"| D
    Q -->|"run in parallel?"| D
    Q -->|"none of the above"| I["DO IT IN THIS TURN"]
\`\`\`

> ❓ **Check yourself:** Two cases. Case A: the coordinator needs a one-line summary of three sentences already in its context. Case B: the coordinator needs the same one-line summary, but the source is a 60-page filing it has *not* yet read. Same output shape — does the delegate decision differ?
>
> *(Yes, it flips. Case A is inline work: full subagent overhead for zero scope, specialization, or parallelism gain. Case B is a delegate: reading the 60-page filing would flood the coordinator's window, so a subagent that reads it and returns one line buys scope relief. The output shape is identical; the *input cost* is what decides.)*

### Key takeaways
- Delegation overhead is fixed: tool call + fresh context + model invocation + handoff.
- Delegate for **scope, specialization, or parallelism** — the three benefits that outweigh the cost.
- Trivial, already-in-context tasks belong in the coordinator's own turn.`,
      principles: [
        "Delegation overhead is fixed — pay it only when scope, specialization, or parallelism justifies the cost.",
        "Delegate for scope, specialization, or parallelism; do trivial already-in-context tasks inline.",
      ],
      pitfalls: [
        "Spawning a subagent to summarize text already in context — full overhead for zero benefit; summarize inline.",
        "Delegating small tasks repeatedly compounds cost; skip when no scope, specialization, or parallelism gain.",
      ],
    },
    {
      id: 'parallel-subagents',
      title: 'Partition-Then-Parallel: Scaling Across Independent Work',
      minutes: 6,
      body: `> **TL;DR** — Split a big uniform task into independent, equal-effort chunks, run them concurrently, then synthesize. Elapsed time drops from the *sum* of the parts to the *max* of the parts.

The whole point of this pattern is the latency arithmetic: when N independent units run concurrently, elapsed time collapses from \\\`sum(durations)\\\` to \\\`max(durations)\\\`. That single fact dictates everything else. Because the *maximum* dominates, the layout that minimizes elapsed time is the one with the smallest maximum chunk — which you get by balancing chunks on *expected effort*, not on count. An uneven split leaves one subagent carrying the heaviest slice while the rest finish early and idle, so the slowest unit sets the clock and the parallelism buys you little. The pattern therefore only applies to genuinely independent, uniform work the coordinator can describe from a template; the moment one unit must consult another's result, the \\\`max\\\` collapse no longer holds.

### The shape of the pattern

1. **Coordinator divides** the input set into N roughly equal chunks.
2. **N subagents are spawned** — one per chunk.
3. Each subagent works only on its slice and returns a **uniform result shape**.
4. **Coordinator synthesizes** the structured outputs.

The canonical phasing:

> **Serial decomposition → Parallel execution → Serial synthesis**

One call plans and identifies the independent units. Each unit runs concurrently as its own subagent or parallel tool call. One final call assembles the results. The parallel phase recovers the most latency when subtasks are **I/O-heavy** — fetches, searches, document analyses — because elapsed time becomes **max(subtask_durations)** instead of **sum(subtask_durations)**. For CPU-bound or token-bound work the speedup is smaller.

### Balance by effort, not by count

Do not split by raw count; split by **expected effort**. If a few partitions are far heavier than the rest, the slowest one dictates total time and the parallelism buys you nothing. Aim for roughly equal expected work per subagent.

### When to avoid this pattern

- Units depend on each other's findings — a result from slice A must inform slice B.
- Partitioning would split a logical unit (chopping a document mid-section breaks coherence).
- Sequential streaming output to the user matters more than total throughput.

And do not parallelize when the second task needs the first task's output: document analysis cannot inspect sources until sources are identified — but analyzing independent source documents *can* run in parallel after retrieval.

### Weak vs strong: analyzing 80 documents

**❌ Weak — even split by count**
\`\`\`mermaid
flowchart LR
    A["80 docs / 8 subagents<br/>= 10 docs each<br/>(split by COUNT)"] --> B["Subagent 5 gets the<br/>10 longest densest docs"]
    B --> C["elapsed = duration of subagent 5<br/>the rest sit idle"]
\`\`\`

**✅ Strong — balance by expected effort**
\`\`\`mermaid
flowchart LR
    A["Estimate effort per doc<br/>length x density"] --> B["Pack chunks to roughly<br/>equal total effort<br/>(split by EFFORT)"]
    B --> C["elapsed = average chunk duration<br/>no single bottleneck"]
\`\`\`

### Visual aid: serial vs parallel phasing

\`\`\`mermaid
flowchart LR
    subgraph SERIAL["Serial — elapsed = chunk 1 + chunk 2 + chunk 3"]
        S1["Decompose"] --> SA["Chunk 1"] --> SB["Chunk 2"] --> SC["Chunk 3"] --> SS["Synthesize"]
    end
    subgraph PARALLEL["Parallel — elapsed = slowest of chunk 1, 2, 3"]
        P1["Decompose"] --> PA["Chunk 1"] & PB["Chunk 2"] & PC["Chunk 3"] --> PS["Synthesize"]
    end
\`\`\`

> ❓ **Check yourself:** You balance 80 documents into 8 effort-equal chunks, and every subagent now finishes in about the same time — yet total wall-clock time is barely better than running them one after another. What is the most likely explanation?
>
> *(The subtasks aren't actually I/O-bound, so they don't overlap. Parallelism collapses sum to max only when the work spends its time waiting — on fetches, searches, document reads. If each chunk is CPU- or token-generation-bound, the subagents contend for the same compute and run effectively serial, so balancing the chunks can't help. Confirm the work is I/O-heavy before expecting the max(durations) win.)*

### Key takeaways
- Partition-then-parallel: coordinator splits, subagents work independently, coordinator synthesizes.
- Elapsed time becomes **max(subtask_durations)** — so balance partitions by effort, not count.
- Decompose serially, execute in parallel, synthesize serially; biggest wins are on I/O-heavy work.`,
      principles: [
        "Partition-then-parallel: equal-effort chunks run concurrently, then synthesize — time = max(subtasks) not sum.",
        "Balance partitions by effort, not count — a heavy slice dominates elapsed time and wastes parallelism.",
        "Decompose serially, execute in parallel, synthesize serially; biggest wins are on I/O-heavy subtasks.",
      ],
      pitfalls: [
        "Splitting by count instead of effort — the heaviest slice dominates; balance chunks by expected effort.",
        "Parallelizing dependent workstreams — concurrent execution breaks when slice A must inform slice B.",
        "Starting parallel analysis before source identification completes — analysis cannot inspect unknown sources.",
      ],
    },
    {
      id: 'context-passing',
      title: 'Multi-Agent Context Passing and Handoff Structure',
      minutes: 7,
      body: `> **TL;DR** — A subagent sees *only* what the parent puts in its prompt, plus its own definition. Everything it needs — goal, findings, sources, constraints, output shape — must be handed over explicitly.

A subagent invocation starts a fresh conversation, so the same statelessness that governs a single Messages API call governs the handoff: the child conditions only on the prompt the parent constructs plus its own definition (system prompt, allowed tools, model). It inherits none of the parent's prior turns, tool results, or earlier subagent runs. Two things follow directly. First, every input the child needs — goal, relevant findings, source references, constraints, expected output shape — must be placed in that prompt, because there is no shared context to fall back on. Second, there is no implicit "resume the previous subagent": a second invocation is a brand-new agent, and continuity exists only if the parent threads an identifier or re-includes a prior summary.

### What a subagent does NOT inherit

When the parent invokes a subagent (in the Claude Agent SDK, through a Task/Agent tool), the subagent starts a **fresh conversation**. It does **not** see:

- The parent's prior user turns
- The parent's prior assistant turns
- Prior tool results from the parent's session
- Memory of earlier subagent runs

### Two consequences that follow directly

**1. Every piece of context the subagent needs must be in the prompt the parent constructs** — the goal, relevant findings, constraints, expected output shape, and source references.

**2. There is no "resume the previous subagent" by default.** Calling the subagent tool again starts a brand-new agent. For continuity, the parent must persist an identifier and pass it through, or include the prior subagent's summary in the new prompt.

### Why a prose summary is a bad handoff for citations

For final report generation, **do not pass only a prose summary** when citations are required. A synthesis agent working from prose must *reconstruct provenance it never had* — and it will guess. Pass a **structured source index** mapping each claim to source IDs, URLs, excerpts, dates, and uncertainty notes. With the index, the synthesizer produces accurate, citable output; without it, citations are fabricated or dropped.

### Weak vs strong: handing off to a synthesis subagent

**❌ Weak handoff**

> Synthesize the findings.

The subagent has no goal scope, no source anchors, no output shape — it improvises and the coordinator cannot merge the result.

**✅ Strong handoff**
\`\`\`yaml
goal: >
  Synthesize the following claim-source records into an executive summary.
  Preserve uncertainty, cite each claim with its source_id, and separate
  established findings from contested findings.
records:
  - claim_id: c_40
    text: "..."
    source_id: src_17
    date: "2025-11"
    confidence: high
  - claim_id: c_41
    text: "..."
    source_id: src_22
    date: "2024-03"
    confidence: low
output: "markdown, headed 'Established' and 'Contested', inline (source_id) cites"
\`\`\`

### Visual aid: what every subagent prompt must carry

| Element | Why it matters |
|---|---|
| Concise goal statement | Subagent knows what success looks like |
| Relevant findings so far | Avoids re-discovering known context |
| Source references | Allows proper citation |
| Constraints (scope, depth) | Prevents scope creep |
| Expected output shape | Lets the coordinator parse and merge the result |

Without this discipline, subagents either produce outputs the coordinator cannot merge, or redo work already done.

> ❓ **Check yourself:** To save tokens, a teammate compresses each research subagent's structured claim records into a tight prose paragraph before handing them to the synthesis subagent, which must emit inline citations. The summaries read well. What breaks downstream, and why isn't it caught immediately?
>
> *(The claim-to-source mapping, dates, and excerpts are gone, so the synthesizer fabricates or drops citations — it can only cite provenance it received. It isn't caught immediately because the prose looks fluent and plausible; the failure surfaces only when someone checks a citation against its source. Pass the structured source index, not prose.)*

### Key takeaways
- Subagents start fresh; **every** needed piece of context must be in the parent's prompt.
- Pass **structured source indexes**, not only prose, whenever citations are required.
- A good handoff carries goal, relevant findings, source references, constraints, and expected output shape.`,
      principles: [
        "Subagents start fresh — goal, findings, constraints, sources, and output shape must be in the parent prompt.",
        "Pass structured source indexes, not prose, for citations — prose strips provenance and forces fabrication.",
        "Every handoff needs goal, findings, source refs, constraints, and output shape — any omission forces guessing.",
      ],
      pitfalls: [
        "Assuming a subagent inherits the parent context — it cannot; every element must be explicitly in the handoff.",
        "Prose handoff to a synthesis agent strips claim-to-source mapping; pass a structured source index instead.",
        "Re-invoking a subagent expecting continuity — each call starts fresh; persist a summary or session ID.",
      ],
    },
    {
      id: 'tool-distribution',
      title: 'Tool Distribution Across Agents',
      minutes: 6,
      body: `> **TL;DR** — Give each agent exactly the tools its role needs — no more. The parent needs the Task/Agent tool to delegate at all; the child's tools are configured independently.

A tool list is part of an agent's behavioral contract, not just a capability menu, so over-provisioning has two costs that scale with the list size. The model must reason over the full set on every step, raising the rate of wrong-tool selections; and an agent that *can* act outside its role often *will*, drifting into work that belongs to another agent. Scoping each toolkit to the minimum its role requires removes both. The non-obvious case is the *empty* tool list: a synthesis agent given no search tools is not under-equipped — the constraint is the feature, since it forces the agent to work strictly from vetted, supplied findings instead of pulling in fresh unscreened data.

### Two concrete harms of "every tool for everyone"

1. **Selection complexity** — the model must reason through a larger tool set on every step, raising the chance of calling the wrong one.
2. **Role drift** — agents with broad access stray outside their scope, performing actions that belong to other agents.

The principle: **restrict each agent's tools to exactly what it needs.**

### Role-based tool assignment

| Agent role | Appropriate tools |
|---|---|
| Web research subagent | Search, fetch/browse |
| Document analysis subagent | Document read, extraction |
| Synthesis subagent | None (works from supplied findings only) |
| Report generator | Formatting inputs, citation lookup |
| Coordinator/orchestrator | Task/Agent tool, summary tools |

A synthesis agent with **no** search tools is forced to work only from what the coordinator gave it. That is a *feature*: it prevents the synthesizer from gathering new, unvetted data that was never screened or structured.

### The Task/Agent tool: the two independent allowedTools lists

In the Claude Agent SDK, delegating to a subagent is **itself a tool** — typically named \`Task\` or \`Agent\`. For the parent to spawn subagents, **this tool must appear in the parent's \`allowedTools\` list.**

Forgetting to allow the Task/Agent tool is the most common reason an "orchestrator" cannot delegate at all: the subagent definitions exist and are correct, but the parent has **no callable interface** to launch them.

The subagent's own \`allowedTools\` is configured separately in its \`AgentDefinition\` and constrains what the subagent can do once spawned. The two lists are **independent**:

- Parent's \`allowedTools\`: must include \`Task\`/\`Agent\` to spawn children.
- Child's \`allowedTools\`: determines what the child can do.

A child cannot spawn further subagents unless \`Task\`/\`Agent\` appears in *its own* \`allowedTools\`.

### Weak vs strong: configuring a research orchestrator

**❌ Weak**
\`\`\`mermaid
flowchart TD
    P["parent<br/>allowedTools: Search, Fetch, Read, Extract<br/>NO Task tool — cannot delegate!"]
    S["synth<br/>allowedTools: Search, Fetch, Read, Extract, Task<br/>can wander + recurse"]
\`\`\`
The parent literally cannot launch a subagent, and the synthesizer can go gather unvetted data and even spawn its own agents.

**✅ Strong**
\`\`\`mermaid
flowchart TD
    P["parent<br/>allowedTools: Task, Summarize<br/>can delegate — minimal otherwise"]
    P -->|Task| R["research<br/>allowedTools: Search, Fetch — in-lane"]
    P -->|Task| D["docs<br/>allowedTools: Read, Extract — in-lane"]
    P -->|Task| S["synth<br/>allowedTools: none<br/>works only from supplied findings"]
\`\`\`

### Visual aid: independent allowedTools at each level

\`\`\`mermaid
flowchart TD
    C["Coordinator<br/>allowedTools: Task, Summarize<br/>(needs Task to delegate)"]
    C -->|Task| R["Research<br/>allowedTools: Search, Fetch"]
    C -->|Task| D["DocAnalysis<br/>allowedTools: Read, Extract"]
    C -->|Task| S["Synthesis<br/>allowedTools: none<br/>(intentionally empty — cannot spawn children)"]
\`\`\`

> ❓ **Check yourself:** Your orchestrator delegates fine to its research and document subagents. You add a third subagent that itself needs to spawn helper subagents. Its \`AgentDefinition\` looks identical to the others, but it can never delegate downward. The parent's \`allowedTools\` already includes \`Task\`. What is missing?
>
> *(\`Task\`/\`Agent\` must be in the *child's own* \`allowedTools\`, not just the parent's. The two lists are independent: the parent's \`Task\` lets the parent spawn children, but a child can spawn further subagents only if \`Task\` appears in its own toolset. Add it to the third subagent's \`allowedTools\`.)*

### Key takeaways
- Restrict tools to the **minimum** each agent's role requires; broad access causes selection complexity and role drift.
- The parent **must** have Task/Agent in its \`allowedTools\` to delegate at all.
- Parent and child \`allowedTools\` are configured **independently**; a synthesizer with no search tools is intentionally constrained.`,
      principles: [
        "Restrict tools to the minimum each role requires — broad access causes selection complexity and role drift.",
        "The parent must include Task/Agent in allowedTools — omitting it leaves no interface to spawn children.",
        "A synthesis agent with no search tools is intentional — it must work from vetted findings only.",
      ],
      pitfalls: [
        "Giving every agent all tools — raises selection complexity and role drift; assign only what each role needs.",
        "Omitting Task/Agent from coordinator allowedTools leaves the parent no interface to spawn any subagent.",
        "Parent and child allowedTools are independent; a child that spawns subagents needs Task in its own list.",
      ],
    },
    {
      id: 'state-provenance',
      title: 'State Persistence, Provenance, and Uncertainty',
      minutes: 6,
      body: `> **TL;DR** — Persist structured *manifests*, not raw transcripts, so a coordinator can resume cheaply — and carry source IDs, dates, and uncertainty on every claim so synthesis stays accurate and citable.

A raw transcript is an append-only log: it grows without bound and, on resume, must be replayed in full just to recover the current state. What the coordinator actually needs to continue is the *derived* state — which steps completed, what each produced, what remains open — which is far smaller and reloadable directly. So persist a structured manifest, not the message history, and inject only the relevant slice into each agent prompt. The same discipline applies inside the data: a claim that loses its source ID, date, or uncertainty language can no longer be cited, dated, or hedged correctly downstream, and the synthesizer will misread (for example, treating two same-metric values from different years as a contradiction rather than a trend). Preserve provenance and structure end-to-end; do not flatten to prose until the final render.

### State persistence: store the manifest

Long-running multi-agent workflows need durable state so the coordinator can resume after interruption or partial failure. A raw transcript of every subagent message becomes enormous and floods context on resume. What the coordinator actually needs is the **current plan state**: which steps completed, what was found, what is still open.

\`\`\`json
{
  "workflow_id": "research_2026_04_30",
  "completed_steps": ["source_search", "source_screening"],
  "documents": [
    { "source_id": "src_17", "status": "analyzed", "claims": ["claim_40", "claim_41"] }
  ],
  "open_gaps": ["recent regulatory changes"]
}
\`\`\`

On resume, the coordinator loads this manifest and injects only the **relevant state** into each agent prompt — far cheaper than replaying every transcript.

### Provenance, dates, and uncertainty: why each field exists

Research agents must preserve provenance throughout the pipeline:

- **Without dates**, a synthesis agent may treat older and newer statistics as *contradictory* when they actually show a *trend*.
- **Without source mapping**, claims lose their citations.
- **Without uncertainty structure**, reports become either overconfident or over-hedged.

So ask subagents to output structured claim records:

| Field | Purpose |
|---|---|
| Claim text | The finding itself |
| Source ID + location | Citation anchor |
| Publication / data-collection date | Temporal context (trend vs contradiction) |
| Methodology notes | Reproducibility and scope |
| Confidence / uncertainty language from source | Fidelity to the original |
| Status: established / contested / insufficiently supported | Synthesis classification |

### Render mixed content in its native form

Different content types belong in different formats: **financial metrics** in tables, **qualitative developments** in prose, **patent categories** in grouped lists. Flattening everything to undifferentiated prose forces the final render step to parse and re-structure content that could have stayed structured all along.

### Weak vs strong: resuming a long research run

**❌ Weak — replay the tapes**

> On resume: load full transcripts of all 12 subagent runs.
> Result: 300K tokens injected, context overflow, dates lost in prose —
> "2024: 12%" and "2026: 19%" read as a contradiction, not a trend.

**✅ Strong — load the ledger + structured claims**

> On resume: load manifest (completed_steps, documents, open_gaps).
> Inject only relevant claim records, each with source_id + date + status.
> Result: small context, citable claims — "12% (2024) → 19% (2026)" reads as a trend.

### Visual aid: manifest vs transcript on resume

\`\`\`mermaid
flowchart LR
    subgraph AVOID["Transcript — avoid"]
        T1["Every message<br/>every agent<br/>(grows without bound)"] --> T2["Replay all<br/>→ context overflow"]
    end
    subgraph PREFER["Manifest — prefer"]
        M1["completed_steps<br/>documents + open_gaps<br/>(bounded, structured)"] --> M2["Load and inject<br/>relevant state<br/>→ resume cheaply"]
    end
\`\`\`

> ❓ **Check yourself:** Your claim records already carry source IDs and confidence labels, so citations and hedging come out fine. But the synthesizer keeps reporting "12%" and "19%" for the same metric as a contradiction it cannot resolve. Which field's absence causes this specifically, and why don't source IDs fix it?
>
> *(The publication/data-collection date. Source IDs anchor *where* a value came from, but only the date tells the synthesizer the two figures are from different years — without it, same-metric values from 2024 and 2026 read as a contradiction instead of a trend. Provenance and temporal context are distinct fields; you need both.)*

### Key takeaways
- Persist **structured manifests**, not raw transcripts, so coordinators resume without flooding context.
- Every claim record must carry **source ID, date, methodology, uncertainty, and status**.
- Preserve structure end-to-end; do not flatten to prose prematurely.`,
      principles: [
        "Persist structured manifests (steps, statuses, gaps), not transcripts — inject only relevant state on resume.",
        "Every claim needs source ID, date, methodology notes, and uncertainty status for citable synthesis.",
        "Do not flatten structure early — render metrics in tables, qualitative in prose, and categories in lists.",
      ],
      pitfalls: [
        "Replaying raw transcripts on resume floods context; persist a bounded manifest and reload only needed fields.",
        "Prose handoff to a synthesis agent drops source IDs and dates; pass a structured source index instead.",
        "Omitting publication dates from claims — synthesizer treats time-series as contradictions without dates.",
      ],
    },
    {
      id: 'pitfalls',
      title: 'Common Pitfalls in Agentic Architectures',
      minutes: 5,
      body: `> **TL;DR** — Most agentic failures are a handful of recurring mistakes: over-pipelining trivia, stopping after one research pass, shoveling raw transcripts between agents, and over-scripting subagents.

The four failures below look unrelated but share one root cause: a dimension of the system is mismatched to the task. Each is one knob turned the wrong way — too much *effort* (pipelining a trivial fact), too little *adaptivity* (finalizing after one pass when gaps remain), too large a *payload* (raw transcripts flooding the next agent's context), or too little *autonomy* (brittle hand-scripted subagents). Naming the mismatched dimension gives you the fix directly: dial that one knob back toward what the task actually needs.

### Pitfall 1 — Using a full pipeline for simple facts

A user asks "What is the capital of France?" and the orchestrator spawns a research subagent, a fact-check subagent, and a formatting subagent. Latency: 10 seconds. Cost: 4× a direct answer.

**Fix:** Let the coordinator choose a *smaller path* for simple queries. Reserve full pipelines for tasks that genuinely benefit from the structure.

### Pitfall 2 — Strict one-pass research

The coordinator runs one round, finds three sources, and writes the report — even though the first source flagged a regulatory change that obviously needs follow-up. The report is thin and misses the real story.

**Fix:** Treat **gap detection as a coordinator responsibility**. When analysis reveals gaps, trigger targeted follow-up search rather than treating the first pass as final.

### Pitfall 3 — Passing raw 100K-token outputs between agents

Subagent A analyzes a 100K-token corpus and, instead of returning a structured summary plus a source index, hands its entire transcript to Subagent B, whose context immediately floods.

**Fix:** Pass **structured summaries plus source indexes** between agents. Raw massive outputs should never flow directly between agents.

### Pitfall 4 — Over-prescribing subagents

The coordinator hands each subagent a brittle, hand-crafted list of exact search strings, exact APIs, and exact fields. When a site changes its schema, every subagent breaks at once.

**Fix:** Give subagents **goals and quality criteria**, not brittle step-by-step scripts, when adaptability matters. Let them choose tactics within their scope.

### Weak vs strong: answering "What is the capital of France?"

**❌ Weak**
\`\`\`mermaid
flowchart LR
    Q["What is the capital of France?"] --> R["ResearchAgent"]
    R --> F["FactCheckAgent"]
    F --> Fmt["FormatAgent"]
    Fmt --> A["Answer: Paris<br/>cost: 10s, 4x a direct reply"]
\`\`\`

**✅ Strong**
\`\`\`mermaid
flowchart LR
    Q["What is the capital of France?"] --> C{"Simple fact?"}
    C -->|yes| A["Coordinator answers directly<br/>Paris — zero overhead"]
    C -->|no — multi-source complex task| P["3-agent pipeline"]
\`\`\`

### Visual aid: pitfall → root cause → fix

| Pitfall | Root mismatch | Fix |
|---|---|---|
| Full pipeline for a simple fact | Effort > task | Smaller path for simple queries |
| Strict one-pass research | Too little adaptivity | Coordinator detects gaps, follows up |
| Raw 100K-token handoff | Payload too large | Structured summary + source index |
| Over-prescribed subagents | Too little autonomy | Goals + quality criteria, not scripts |

> ❓ **Check yourself:** A report keeps missing leads that the first research pass clearly surfaced. A teammate proposes fixing it by adding a dedicated fact-check subagent and a formatting subagent to the pipeline. Will that fix it, and what is the actual fix?
>
> *(No — that addresses the wrong dimension. The failure is too little *adaptivity* (one-pass finalizing), not too little structure; bolting on more subagents adds latency and cost while still finalizing after one pass. The fix is to make gap detection a coordinator responsibility: when analysis reveals an open lead, trigger targeted follow-up search before finalizing.)*

### Key takeaways
- Match **effort** to the task — do not pipeline trivia.
- Match **adaptivity** — detect gaps and follow up instead of one-pass finalizing.
- Match **payload** (structured summaries, not raw transcripts) and **autonomy** (goals, not brittle scripts).`,
      pitfalls: [
        "Pipelining trivial queries — 10x latency; let the coordinator detect simple queries and respond inline.",
        "Finalizing after one research pass when gaps are obvious — make the coordinator detect gaps and follow up.",
        "Agent-to-agent transcript handoffs flood context — pass compact summaries and a source index instead.",
        "Prescribing search strings and API calls instead of goals — brittle; give goals and a quality bar instead.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-pattern-scenario-1',
      type: 'mcq',
      scenario: 'A legal team processes incoming documents that are always one of three types: invoices, contracts, or receipts. Each type needs a completely different extraction schema. The document type is always identifiable from the first line.',
      question: 'Which agentic pattern fits this task best?',
      options: [
        'Dynamic decomposition, because documents vary.',
        'Routing, because inputs fall into distinct, stable categories that each need different handling.',
        'Parallel subagents, because the documents are independent.',
        'Orchestrator-workers, because a coordinator must decide which specialist to call.',
      ],
      answer: 1,
      explanation: 'Routing is the right choice because the categories are well-defined, stable, and identifiable up front. Routing maps each document type to a pre-built handler without needing a coordinator to plan dynamically. Orchestrator-workers would work but adds unnecessary overhead when the routing decision is mechanical. Parallel subagents would apply if many documents of the same type arrived simultaneously.',
    },
    {
      id: 'ex-pattern-scenario-2',
      type: 'mcq',
      scenario: 'A security team uses an agent to triage alerts. After seeing each alert, the agent must decide whether to pull application logs, query a SIEM, page the on-call engineer, or some combination. The right action depends entirely on what the alert contains.',
      question: 'Which agentic pattern is most appropriate?',
      options: [
        'Prompt chaining with a fixed three-step triage sequence.',
        'Routing into four fixed handlers (one per action type).',
        'Dynamic decomposition, because the next step genuinely depends on current findings.',
        'Parallel subagents that simultaneously pull logs, query SIEM, and page on-call.',
      ],
      answer: 2,
      explanation: 'Dynamic decomposition fits because the next action cannot be determined until the alert is examined. A fixed chain would run all steps regardless of relevance (wasting effort or missing the real issue). Routing requires the decision to be made before the alert is examined. Parallel subagents would waste resources by doing all three actions even when only one is warranted.',
    },
    {
      id: 'ex-pattern-match',
      type: 'mcq',
      scenario: 'A coordinator manages a research workflow. After examining the first alert, it must choose whether to pull logs, query a SIEM, page on-call, or some combination — the right set of actions only becomes clear after reading the alert. A colleague suggests hard-coding a fixed three-step sequence instead.',
      question: 'Which pattern best fits the investigation scenario, and why is the fixed-sequence alternative wrong?',
      options: [
        'Prompt chaining; the fixed sequence ensures every alert is thoroughly investigated regardless of content.',
        'Routing; assigning each alert type to a pre-built handler avoids unnecessary steps.',
        'Dynamic decomposition; the next step genuinely depends on what the alert reveals, so a fixed sequence runs irrelevant steps and misses the real issue.',
        'Parallel subagents; running all actions simultaneously is fastest even if some are unnecessary.',
      ],
      answer: 2,
      explanation: 'Dynamic decomposition fits because the model cannot write a fixed plan upfront — the next action depends on the alert content observed. A fixed sequence (prompt chaining) runs every step regardless of relevance, producing shallow triage and wasted effort, including paging on-call for benign alerts. Routing requires the decision before examining the alert, which is impossible here. Parallel subagents waste resources and page on-call unconditionally even when unwarranted.',
    },
    {
      id: 'ex-handoff-order',
      type: 'mcq',
      scenario: 'A coordinator is about to hand off to a synthesis subagent that must produce an executive summary with inline citations. The coordinator has completed all parallel research subagent runs and collected structured claim records. It is deciding what to include in the handoff prompt.',
      question: 'Which handoff is correct for a synthesis subagent that must produce citable output?',
      options: [
        'Pass only a concise prose narrative summarizing the research findings.',
        'Pass the full raw transcripts from every prior research subagent run.',
        'Pass a structured source index mapping each claim to its source ID, URL, excerpt, date, and confidence notes, along with goal, constraints, and expected output shape.',
        'Pass only the single final conclusion from each prior subagent with no source metadata.',
      ],
      answer: 2,
      explanation: 'A synthesis agent can only produce accurate, citable output if it receives a structured source index linking claims to source IDs, URLs, excerpts, dates, and uncertainty notes. A prose narrative strips the citation structure, forcing the synthesizer to reconstruct provenance it never had — producing fabricated or missing citations. Raw transcripts flood the synthesis agent\'s context. Only final conclusions discard the evidence and source anchors needed to support each claim.',
    },
    {
      id: 'lab-decompose-task',
      type: 'lab',
      title: 'Decompose a multi-step task into a coordinator + subagents plan',
      brief: `You are designing an agentic system to answer this research question:

**"What are the leading causes of customer churn in SaaS businesses, and what interventions have shown measurable impact?"**

Design a coordinator + subagents plan. Your plan must specify:

1. **Which pattern(s) you use** and why (chaining, routing, orchestrator-workers, dynamic decomposition, parallel subagents, or a combination).
2. **The coordinator's responsibilities** — what it plans, what it delegates, when it re-plans.
3. **At least two named subagents**: their role, the tools they receive, and the output shape they return.
4. **The handoff structure**: what the coordinator passes to each subagent (goal, findings, source references, constraints, expected output shape).
5. **State persistence**: what the coordinator persists and in what structure.
6. **How provenance is preserved**: claim records must include source ID, date, and uncertainty status.

Write your plan in structured prose or as a labeled outline. Be specific — name agents, specify tools, and show the handoff prompts or at minimum the fields they include.`,
      placeholder: '## Agentic Plan\n\n### Pattern choice\n...\n\n### Coordinator responsibilities\n...\n\n### Subagent: [Name]\n- Role: ...\n- Tools: ...\n- Output shape: ...\n- Handoff from coordinator includes: ...\n\n### State persistence manifest\n...\n\n### Provenance structure\n...',
      system: 'You are a strict reviewer for the Claude Certified Architect exam. You evaluate multi-agent system designs. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is good, (3) concrete required fixes. Evaluate on: correct pattern selection and justification, coordinator responsibilities clearly separated from subagent work, at least two named subagents with roles/tools/output shapes, handoff prompts that include goal + findings + source refs + constraints + output shape, a structured state manifest (not just raw transcript), and provenance fields (source ID, date, uncertainty). Penalize vague answers that list agent names without specifying tools, outputs, or handoff content.',
      evalTemplate: 'A learner submitted this coordinator + subagents plan for a SaaS churn research task:\n\n{{input}}\n\nReview it per your rubric. If the plan is missing key elements (pattern justification, handoff structure, provenance, state manifest), name each gap explicitly and show a brief corrected example for the weakest section.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: "A documents team runs every file through the same fixed sequence: style review, then security review, then documentation review. The order never changes and every file needs all three. Which pattern fits best?",
      options: [
        "Dynamic decomposition, so the model can reorder steps per document.",
        "Prompt chaining, because the steps are fixed and every input needs them in the same order.",
        "Orchestrator-workers, so a coordinator can choose which review to run.",
        "Parallel subagents, because the three reviews are independent.",
      ],
      answer: 1,
      explanation: "Correct: prompt chaining sequences a fixed, known set of steps and is exactly right when every input needs all of them in the same order, trading flexibility for predictability. \"Dynamic decomposition\" is for investigations where each finding changes the plan, which contradicts a fixed sequence. \"Orchestrator-workers\" adds coordinator overhead to choose specialists when no choice is needed. \"Parallel subagents\" would only help if the reviews were independent, but a chained review pipeline is intentionally ordered, so parallelizing breaks the dependency.",
    },
    {
      id: 'q2',
      question: "A security agent triages alerts. After examining each alert it must decide whether to pull logs, query a SIEM, page on-call, or some combination — and the right action only becomes clear after reading the alert. Which pattern fits?",
      options: [
        "Prompt chaining through a fixed three-step triage sequence.",
        "Routing into four fixed handlers, one per action.",
        "Dynamic decomposition, because the next step genuinely depends on what the model just learned.",
        "Parallel subagents that always pull logs, query the SIEM, and page on-call at once.",
      ],
      answer: 2,
      explanation: "Correct: dynamic decomposition fits because the model cannot write a fixed plan upfront — the next action depends on the alert content it just observed. \"Prompt chaining\" through a fixed sequence would run every step regardless of relevance, producing shallow triage or wasted effort. \"Routing\" requires the handling decision before examining the alert, but here the decision needs the alert content. \"Parallel subagents that always\" run all three waste resources and page on-call even when unwarranted, since the actions are conditional, not independent givens.",
    },
    {
      id: 'q3',
      question: "A billing-dispute workflow always runs \"verify identity, fetch invoice, check policy, propose adjustment\" in that order. An engineer wants to rebuild it with dynamic decomposition so the coordinator re-plans each time. What is the main problem?",
      options: [
        "Dynamic decomposition cannot call tools, so identity verification would fail.",
        "It forces unpredictable, re-planned coordination onto a mechanical task whose steps are known upfront, wasting effort and producing inconsistent outputs.",
        "Dynamic decomposition requires parallel tool calls, which billing systems do not support.",
        "It would prevent the workflow from persisting any state.",
      ],
      answer: 1,
      explanation: "Correct: forcing dynamic decomposition onto a well-defined, mechanical sequence wastes coordinator effort and yields inconsistent results, where a fixed chain is cheaper and more predictable. \"Cannot call tools\" is false — dynamic decomposition absolutely can call tools. \"Requires parallel tool calls\" is unrelated; the pattern does not require parallelism. \"Prevent the workflow from persisting state\" is wrong because state persistence is orthogonal to pattern choice and is not blocked by decomposition.",
    },
    {
      id: 'q4',
      question: "A research coordinator has just retrieved and read a short three-sentence abstract. It considers spawning a subagent to summarize that abstract. What should it do?",
      options: [
        "Spawn a dedicated summarization subagent to keep responsibilities cleanly separated.",
        "Spawn a subagent only if it first persists a session identifier for continuity.",
        "Spawn three parallel subagents and synthesize their summaries.",
        "Summarize it directly in its own turn, because delegating here adds overhead with no benefit.",
      ],
      answer: 3,
      explanation: "Correct: the coordinator already has the abstract in context and the work is trivial, so doing it directly avoids the fixed overhead of a tool call, a fresh subagent context, and a separate model invocation. \"Spawn a dedicated subagent for clean separation\" pays overhead for busywork the coordinator could do immediately. \"Persist a session identifier\" addresses subagent continuity, which is irrelevant to a one-line summary. \"Three parallel subagents\" multiplies cost for a task with nothing to partition.",
    },
    {
      id: 'q5',
      question: "Which situation is a legitimate reason to delegate to a subagent rather than have the coordinator do the work itself?",
      options: [
        "The task would flood the coordinator's context, such as analyzing a long full-length document.",
        "The coordinator already has all needed context and the task is a short synthesis of retrieved results.",
        "The task is small and produces no latency or context savings when delegated.",
        "The coordinator wants to keep each turn short for readability.",
      ],
      answer: 0,
      explanation: "Correct: delegating is warranted when the task would flood the coordinator's context window — a long document analysis is the canonical case — and also for specialization or parallelism. \"A short synthesis the coordinator already has\" is exactly when not to delegate. \"A small task with no latency or context savings\" fails the cost-benefit test. \"Keeping turns short for readability\" is not a scope, specialization, or parallelism benefit, so it does not justify the overhead.",
    },
    {
      id: 'q6',
      question: "You must analyze 50 repositories against the same checklist of issues, and each repository's analysis is fully independent of the others. What is the best execution strategy?",
      options: [
        "Use dynamic decomposition so the coordinator re-plans after each repository.",
        "Process all 50 repositories sequentially in a single coordinator turn.",
        "Partition the repositories into roughly equal-effort chunks and run parallel subagents, then synthesize.",
        "Use routing to send each repository to a different handler by language.",
      ],
      answer: 2,
      explanation: "Correct: partition-then-parallel fits independent, uniform work — split the repos into balanced chunks, spawn parallel subagents that return a uniform result shape, and synthesize, so elapsed time becomes max(subtask_durations) instead of the sum. \"Dynamic decomposition\" is for investigations where each finding changes the plan, not uniform parallel work. \"Process sequentially in one turn\" forfeits the parallelism savings. \"Routing by language\" presumes distinct handlers per category, but every repo gets the same checklist, so routing adds no value.",
    },
    {
      id: 'q7',
      question: "A coordinator splits 80 documents evenly into 8 subagents of 10 documents each, but one subagent's slice contains the longest, densest documents and finishes far later than the rest. What was the partitioning mistake?",
      options: [
        "It used too few subagents; doubling to 16 would fix the imbalance automatically.",
        "It ran the subagents in parallel instead of serially.",
        "It failed to give each subagent the Task/Agent tool.",
        "It split partitions by raw count rather than by expected effort, so the heaviest slice dominates total time.",
      ],
      answer: 3,
      explanation: "Correct: because elapsed time equals max(subtask_durations), partitions must be balanced by expected effort, not raw count; an even count split left one subagent with disproportionately heavy work. \"Too few subagents\" does not fix imbalance if the split is still by count — the dense docs could still cluster. \"Ran in parallel instead of serially\" is backwards; parallel is the whole point. \"Failed to give the Task/Agent tool\" governs whether the parent can spawn children, not how evenly work is balanced.",
    },
    {
      id: 'q8',
      question: "A coordinator works in two stages: first identifying which source documents exist, then analyzing the content of each independent source. Which stages can run in parallel?",
      options: [
        "Both stages can run fully in parallel from the start.",
        "Source identification must complete first; the per-source analyses can then run in parallel because they are independent.",
        "Neither stage can be parallelized, because all agent work is sequential.",
        "Only source identification can be parallelized; the analyses must be serial.",
      ],
      answer: 1,
      explanation: "Correct: analysis cannot inspect sources until they are identified, so identification must finish first; once sources are known, analyzing each independent source can run concurrently. \"Both in parallel from the start\" is impossible because the second task needs the first task's output. \"Neither can be parallelized\" is false — independent units parallelize well. \"Only identification parallelizes\" is backwards; the independent per-source analyses are precisely what benefits from parallel execution.",
    },
    {
      id: 'q9',
      question: "A parent agent invokes a subagent through the Task tool. Which of the following does the subagent automatically receive?",
      options: [
        "The parent's prior user and assistant turns plus all earlier tool results.",
        "A shared memory object kept in sync across every agent in the system.",
        "Only the prompt the parent explicitly constructs for this invocation, plus the subagent's own definition.",
        "The transcript of every previous subagent run in the workflow.",
      ],
      answer: 2,
      explanation: "Correct: a subagent starts a fresh conversation and sees only what the parent explicitly passes in the constructed prompt, plus its own definition (system prompt, allowed tools, model). \"The parent's prior turns plus tool results\" are not inherited. \"A shared synchronized memory object\" across agents does not exist. \"The transcript of every previous subagent run\" is not visible either, since the subagent has no memory of earlier runs unless the parent deliberately includes them.",
    },
    {
      id: 'q10',
      question: "An engineer wants to continue work with \"the same\" research subagent across two coordinator turns, so they simply call the Agent tool a second time and expect it to remember the first run. What actually happens?",
      options: [
        "The tool resumes the prior subagent with its full prior context intact.",
        "The second call fails with an error because the subagent is still active.",
        "The platform automatically merges both runs into one shared transcript.",
        "A brand-new subagent starts with no memory of the prior run; continuity requires passing an identifier or including the prior summary.",
      ],
      answer: 3,
      explanation: "Correct: re-invoking the Task/Agent tool starts a brand-new agent with no memory of the previous run; there is no default \"resume the previous subagent.\" For continuity the parent must persist an identifier and pass it through, or include the prior subagent's summary in the new prompt. \"Resumes the prior subagent\" is wrong — there is no automatic restore. \"Fails with an error because still active\" is invented. \"Automatically merges both runs\" does not happen on its own.",
    },
    {
      id: 'q11',
      question: "A coordinator is about to hand off to a synthesis subagent that must produce an executive summary with inline citations. What should it pass?",
      options: [
        "A concise prose summary of the findings so the subagent can paraphrase it.",
        "A structured source index mapping each claim to its source ID, URL, excerpt, date, and confidence notes.",
        "The raw 100K-token transcripts from every prior subagent run.",
        "Only the single final conclusion from each prior subagent.",
      ],
      answer: 1,
      explanation: "Correct: a synthesis agent can only produce accurate, citable output if it receives a structured source index linking claims to source IDs, URLs, excerpts, dates, and uncertainty notes — provenance it never had otherwise. \"A prose summary\" strips the citation structure, forcing the synthesizer to reconstruct provenance it lacks. \"Raw 100K-token transcripts\" immediately flood the synthesis agent's context and should never flow directly between agents. \"Only final conclusions\" discards the evidence and source anchors needed to support each claim.",
    },
    {
      id: 'q12',
      question: "A team builds a research orchestrator with three correctly defined subagent definitions, but at runtime the parent cannot launch any of them. The subagent system prompts, models, and allowedTools all look correct. What is the most likely cause?",
      options: [
        "The subagents' allowedTools lists each forgot to include the Task tool.",
        "Parallel tool calls are disabled in the model settings.",
        "Subagent definitions need to be merged into the parent's system prompt.",
        "The parent's allowedTools does not include the Task/Agent tool, so it has no callable interface to spawn children.",
      ],
      answer: 3,
      explanation: "Correct: spawning a subagent is itself a tool call, so the Task/Agent tool must appear in the parent's allowedTools; forgetting it is the most common reason a correctly-defined orchestrator cannot delegate. \"The subagents' allowedTools forgot Task\" is wrong — a child needs Task only to spawn its own children, which is not the failure here. \"Parallel tool calls disabled\" is unrelated to whether delegation is possible. \"Merge definitions into the parent's system prompt\" is wrong; subagent definitions are separate configuration.",
    },
    {
      id: 'q13',
      question: "You are assigning tools to agents in a research pipeline. The synthesis subagent's job is to write an executive summary strictly from the structured findings the coordinator supplies. What tools should it get?",
      options: [
        "Search and fetch tools, so it can gather any additional supporting evidence it wants.",
        "Every tool available to the coordinator, to maximize flexibility.",
        "No external search tools — it should work only from the supplied findings, which is an intentional constraint.",
        "The Task tool, so it can spawn its own research subagents on demand.",
      ],
      answer: 2,
      explanation: "Correct: a synthesis agent with no search tools is intentionally constrained to work only from vetted, structured findings the coordinator supplied — a feature that prevents injecting unscreened new data. \"Search and fetch tools\" would let it gather unvetted evidence, defeating that guarantee. \"Every coordinator tool\" increases selection complexity and invites role drift. \"The Task tool\" would let the synthesizer spawn its own research agents, straying far outside its narrow synthesis role.",
    },
    {
      id: 'q14',
      question: "A long-running multi-agent workflow must be resumable after interruption. The team is deciding what to persist for the coordinator to reload. What should they store?",
      options: [
        "The full raw transcript of every message from every subagent, so nothing is ever lost.",
        "A structured manifest of completed steps, document statuses, and open gaps, injecting only relevant state on resume.",
        "Only the final synthesized report, discarding intermediate state.",
        "Nothing durable — re-run the entire workflow from scratch on every resume.",
      ],
      answer: 1,
      explanation: "Correct: persist a structured manifest (completed steps, document statuses, open gaps) so the coordinator can reload and inject only the relevant state into each agent prompt. \"The full raw transcript of every message\" becomes enormous and floods context on resume. \"Only the final report\" discards the intermediate plan state needed to continue partial work. \"Nothing durable, re-run from scratch\" wastes all prior work and defeats the purpose of resumability.",
    },
    {
      id: 'q15',
      question: "A coordinator runs one round of research, finds three sources, and writes the final report — even though the first source flagged a recent regulatory change that clearly needs follow-up. The report comes out thin and misses the real story. What is the correct fix?",
      options: [
        "Always spawn a fact-checking and a formatting subagent for every report, regardless of the query.",
        "Switch the whole workflow to strict prompt chaining so the steps are fixed.",
        "Pass the full raw research transcript into the report generator so nothing is lost.",
        "Treat gap detection as a coordinator responsibility: when analysis reveals gaps, trigger targeted follow-up search instead of finalizing the first pass.",
      ],
      answer: 3,
      explanation: "Correct: the pitfall is strict one-pass research, and the fix is for the coordinator to detect gaps and trigger targeted follow-up search rather than finalizing the first pass. \"Always adding fact-check and format subagents\" is the over-pipelining pitfall — added latency and cost without addressing the missed gap. \"Switch to strict prompt chaining\" removes the adaptive re-planning needed to chase the follow-up. \"Pass the full raw transcript\" floods the report generator's context; structured summaries plus a source index are what should flow between agents.",
    },
  ],
}
