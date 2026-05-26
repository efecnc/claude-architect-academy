export default {
  id: 'tool-interfaces',
  num: 2,
  title: 'Designing Tool Interfaces for LLM Agents',
  summary: 'Tool design is prompt design plus API design. Learn how to write descriptions that guide selection, parameters that prevent invalid combinations, outputs that enable reliable multi-step workflows, and structural safety patterns that prompts alone cannot provide.',
  estMinutes: 42,
  tags: ['Tools', 'Agents', 'Schema'],

  lessons: [
    {
      id: 'tool-descriptions',
      title: 'Writing Tool Descriptions That Actually Guide the Model',
      minutes: 8,
      body: `> **TL;DR** — A tool description is a *prompt*, not documentation. It is injected into the model's context and decides whether the right tool gets picked. Thin descriptions force the model to guess; rich ones make the right choice obvious.

The model never sees your implementation. It selects tools purely from their **names, descriptions, parameter schemas, and examples** — text you wrote, sitting in the context window alongside the conversation. So tool design is **prompt design plus API design**, and the description carries the load: it is the only signal the model has for *when* and *how* to call a tool. A description like \`"Search documents"\` forces a guess about whether it hits a knowledge base, a billing system, or the web, and what shape the query takes. A description that states scope, triggers, and exclusions makes the right action easy and the wrong action hard — and it is your cheapest lever for that, well before you reach for schema constraints.

### The six questions every description should answer

1. **What does this tool do?** State the operation in one clear sentence.
2. **When should you use it?** Give a representative trigger so the model recognizes the situation.
3. **When should you *not* use it?** Prevent misuse — critical when a sibling tool covers an adjacent domain.
4. **What format do inputs need?** ISO 8601 dates, 10-digit IDs, currency in cents — say it here (or in the schema), never in the parameter *name*.
5. **What does the output contain?** Identifiers, counts, nested objects the model will reason about next.
6. **What are the limits or safety concerns?** Destructive effects, rate limits, irreversibility.

### Weak vs. strong: a knowledge-base search tool

❌ **Weak — thin description**

> "Search documents for a query."

The model cannot tell this apart from a billing search or a web search. Billing questions get misrouted here and return nothing useful.

✅ **Strong — scoped description**

> "Search the internal knowledge base for documents matching a natural-language query.
> Use when the user asks something answerable by internal policy, procedures, or
> historical reports. Do NOT use for billing queries — use search_billing_records
> instead. Returns up to 10 results with document_id, title, owner, and updated_at.
> Does not search email or calendar data."

Every one of the six questions is answered, and the explicit "do NOT use" line steers the model away from its sibling tool.

### Visual: how the model routes a query

\`\`\`mermaid
flowchart TD
    U["user: why was I charged twice?"] --> M["model reads tool descriptions"]
    M --> D1["Search documents.<br/>(knowledge base? billing? web? — guess)"]
    M --> D2["Search billing records.<br/>Use for charges, refunds, invoices.<br/>NOT for policy questions."]
    D1 --> R1["coin-flip routing — wrong tool"]
    D2 --> R2["confident match — correct tool"]
\`\`\`

### Input examples earn their keep on complex tools

For tools with nested objects, date formats, or domain-specific enums, include \`input_examples\` (where the API supports them). A single concrete example — \`"device_id": "dv_0039fba"\` — communicates the expected shape better than a paragraph of prose ever will.

> ❓ **Check yourself:** A teammate fixes misrouting between \`search_knowledge_base\` and \`search_billing_records\` by leaving the descriptions thin but appending "If unsure, prefer the knowledge base" to the system prompt. Routing improves on your test set. Ship it?
>
> *(No. You biased the tie-breaker, not the signal — the model still cannot tell the domains apart, so it now misroutes systematically toward the knowledge base, and any prompt edit can undo the gain. Put the discriminating information where selection happens: each description's scope and an explicit "do NOT use — use the sibling" line.)*

### Key takeaways
- The model selects tools from names, descriptions, schemas, and examples — the description *is* a prompt.
- Answer all six questions, especially **when NOT to use** when sibling tools overlap.
- Put format hints in the description or schema (and an input example), never in the parameter name.`,
      principles: [
        "A tool description is a prompt: the model selects tools from names, descriptions, and schemas — not code.",
        "Explicitly state when NOT to use a tool to prevent misrouting to superficially similar sibling tools.",
        "Include `input_examples` for nested objects, IDs, and enums — one example beats a prose paragraph.",
      ],
      pitfalls: [
        "Thin one-line descriptions force the model to guess scope; answer all six questions in every description.",
        "Omitting \"when not to use\" when two tools overlap causes ~50/50 misrouting; cross-reference the sibling.",
        "Encoding format hints in the parameter name (e.g., `date_iso_yyyy_mm_dd`) is fragile; use the schema.",
      ],
    },
    {
      id: 'parameter-design',
      title: 'Parameter Design: Enums, Identifiers, and Splitting Tools',
      minutes: 9,
      body: `> **TL;DR** — Make valid inputs easy and invalid inputs *structurally impossible*. Use enums for closed sets, stable IDs over derived values, and separate tools when operations have different required fields.

The schema is the model's only constraint surface, so the cardinal rule is to **make the schema match the operation's real domain model**. A free-text string accepts every value, valid or not, and defers all checking to your tool code or — worse — to the model's judgment. A typed, enumerated, well-partitioned schema moves that enforcement up front, into the structure the model samples against: it cannot emit a value the schema doesn't permit. Do not hand the model a bag of strings and ask it to reconstruct your business invariants; encode the invariants where they cannot be violated.

### Enums for closed sets

Whenever a parameter accepts a fixed set of values, encode it as an \`enum\`. This stops the model from hallucinating a value, surfaces the valid options inside the schema, and lets you reject bad input early.

\`\`\`json
{
  "source": {
    "type": "string",
    "enum": ["knowledge_base", "billing_records", "support_tickets"],
    "description": "Which repository to search."
  }
}
\`\`\`
Without the enum, the model might invent \`"billing"\`, \`"support"\`, or \`"kb"\` — none of which match your backend routing.

### Lookup-then-act for ambiguous entities

When users name entities instead of giving IDs, and several entities might match, use two steps:

1. \`search_projects(query)\` — returns candidate IDs plus distinguishing metadata (creation date, owner, last activity).
2. \`archive_project(project_id)\` — acts only on an unambiguous, stable ID.

If the lookup returns multiple candidates, **present them to the user with differentiating fields** and let them pick. A single-click selection — user sees three candidates, picks one, agent proceeds with the confirmed ID — is far more reliable than letting the model guess and immediately run a destructive operation. This is *complementary* to preview-then-execute: disambiguation resolves **which entity** the user means; preview-then-execute confirms **what action** happens to it.

### Stable identifiers reduce coupling

Prefer stable IDs over derived intermediate values. If the user already has a \`device_id\`, the downstream tool should accept \`device_id\` directly instead of forcing an upstream call just to extract an address.

❌ **Bad — brittle two-step chain**
\`\`\`mermaid
flowchart LR
    A["get_device_address(device_id)"] -->|"returns: '1234 Oak St'"| B["get_neighborhood_info('1234 Oak St')"]
    B --> C["fails if address string differs"]
\`\`\`
If step 1 fails or returns a slightly different string, step 2 breaks.

✅ **Better — let the tool resolve mechanical dependencies**
\`\`\`mermaid
flowchart LR
    A["get_neighborhood_info(device_id)"] --> B["resolves address internally<br/>one round-trip, no coupling"]
\`\`\`
One round-trip, no failure coupling, no string-matching fragility.

### Split tools when parameter sets diverge

When operation subtypes have **fundamentally different required fields**, use separate tools. A unified \`manage_order(action, ...)\` invites omitted parameters and irrelevant fields the model must reason around.

| ❌ Unified (problematic) | ✅ Split (better) |
|---|---|
| \`manage_order(action="refund", ...)\` | \`issue_store_credit(order_id, amount)\` |
| \`manage_order(action="cancel", ...)\` | \`cancel_subscription(subscription_id, reason)\` |
| \`manage_order(action="replace", ...)\` | \`replace_damaged_item(order_id, item_sku)\` |

Same lesson for fitness logging: a single \`log_workout(type, value, unit)\` lets the model submit \`unit: "reps"\` for a cardio session. Separate \`log_cardio_session\` and \`log_strength_session\` tools make the schema itself encode the distinction — the invalid combination becomes unrepresentable.

> ❓ **Check yourself:** To stop \`unit: "reps"\` on cardio entries, an engineer keeps the single \`log_workout\` tool but makes \`unit\` a JSON Schema conditional: when \`type\` is \`"cardio"\`, \`unit\` must be \`"min"\`. The schema is now valid and self-documenting. Good enough, or still split the tool?
>
> *(Still split. Conditional schemas (\`if\`/\`then\`, \`oneOf\`) often constrain less reliably than a flat shape the model samples against, and they bury the operation's real branching inside one over-loaded tool. Two tools — \`log_cardio_session\` and \`log_strength_session\` — make each unit set unrepresentable by construction and read more clearly at selection time.)*

### Key takeaways
- Enums turn closed sets into schema-enforced choices, killing hallucinated values.
- Use lookup-then-act for named entities; never guess on a destructive action.
- Accept stable IDs to drop mechanical chains; split tools when required-field sets diverge.`,
      principles: [
        "Enums prevent hallucinated values for closed sets and surface valid options directly in the schema.",
        "Use lookup-then-act for named entities: show candidates with differentiating fields before any destructive op.",
        "Split tools when parameter sets diverge; a unified action-flag tool makes invalid combinations representable.",
      ],
      pitfalls: [
        "Free-text strings for closed sets invite hallucinated values and move validation out of the schema; use enums.",
        "Chaining tools to resolve an ID the downstream tool could accept directly adds latency and failure coupling.",
        "An action-flag tool forces the model to navigate an irrelevant schema per action; use one tool per operation.",
      ],
    },
    {
      id: 'output-design',
      title: 'Output Design: Structured, Compact, and Identifier-Bearing',
      minutes: 8,
      body: `> **TL;DR** — A tool's output is the model's working memory for its *next* move. Return structured data with stable IDs, normalize messy backends, and never disguise an empty result as an error.

Whatever a tool returns is the entire substrate the model reasons over on the following turn — it has no other handle on what the tool did. So output design is downstream-action design. Prose like "found three vendors" is a dead end: the next tool call needs a stable handle (\`doc_284\`) to act on, and there is none, forcing a redundant lookup just to recover it. Return identifiers and structure, and the model's next step has something concrete to operate on; omit them and it is stuck re-deriving what you already knew.

### Weak vs. better: a document search result

❌ **Weak — prose only**

> Found these documents: Maintenance Schedule, Lab Access Plan, Vendor Notes.

A downstream \`open_document\` tool has nothing concrete to act on — it must run another search just to recover IDs.

✅ **Better — structured with IDs and a count**
\`\`\`json
{
  "results": [
    { "document_id": "doc_284", "title": "Maintenance Schedule", "owner": "operations", "updated_at": "2026-04-20" },
    { "document_id": "doc_291", "title": "Lab Access Plan", "owner": "facilities", "updated_at": "2026-03-15" }
  ],
  "total_matches": 2
}
\`\`\`
Now downstream tools have stable \`document_id\` values, and \`total_matches\` tells the model whether it has seen everything.

### Normalize heterogeneous backends

If three shipping carriers report status with different codes and field names, **normalize in the tool** before returning:
\`\`\`json
{ "status": "delayed", "estimated_delivery": "2026-05-28", "delay_reason": "weather", "requires_action": false }
\`\`\`
Do not dump raw carrier payloads and expect the model to learn each carrier's schema. Mapping logic belongs in deterministic tool code, not in model reasoning.

### Empty result vs. error — a crucial distinction

A query that legitimately matches nothing is a **successful** result:
\`\`\`json
{ "results": [], "total_matches": 0 }
\`\`\`
Do **not** return \`isError: true\`. If "no matches" looks like a failure, the agent may retry a perfectly valid query as though the tool broke — burning turns and confusing the user.

### Visual: the empty-result decision

\`\`\`mermaid
flowchart TD
    Q{"Did the query run?"}
    Q -->|"no — timeout, auth, 500"| E["isError: true + reason<br/>genuine fault"]
    Q -->|yes| M{"Any matches?"}
    M -->|no| Empty["results: [] and total_matches: 0<br/>success — empty result"]
    M -->|yes| Data["results: [...] and total_matches: N<br/>success — data returned"]
\`\`\`

### Pagination: do not boil the ocean

For APIs that can match thousands of items, auto-fetching every page causes long latency, wasted tokens, and context overflow. Instead:

- Return the **first page** plus a \`total_count\` (or estimate).
- Include a **cursor or continuation token** so the agent can request more *only when needed*.

> ❓ **Check yourself:** A search tool returns \`{ "results": [], "total_matches": 0 }\` for a genuinely empty match — the right call. But it returns the same payload when the backend times out, reasoning "no data either way." The agent stops cleanly in both cases. What breaks?
>
> *(Silent data loss. A timeout is a fault, not an empty result: the agent now reports "nothing found" when records may exist, and it never retries or escalates. Empty-as-success only applies when the query actually ran — a timeout, auth failure, or 500 must return \`isError: true\` with a reason.)*

### Key takeaways
- Return stable IDs and structure so the model's next step has something to act on.
- Normalize messy backends in the tool layer, not in the model's head.
- Empty is a success (\`results: []\`); paginate with first page + total_count + cursor.`,
      principles: [
        "Include stable identifiers in every result so downstream tools can act without an additional lookup.",
        "Normalize heterogeneous backends in tool code — deterministic mapping belongs there, not in the model.",
        "An empty result is a success: return `results:[]` with `total_matches:0`; reserve `isError` for real faults.",
      ],
      pitfalls: [
        "Prose-only output omits stable IDs; downstream tools cannot act reliably without `document_id` or `order_id`.",
        "Returning `isError` for \"no results\" triggers agent retry loops on valid queries; use `results:[]` instead.",
        "Auto-fetching all pages causes latency, token waste, and context overflow; return first page + cursor instead.",
      ],
    },
    {
      id: 'composition-and-large-sets',
      title: 'Tool Composition, Large Tool Sets, and Progressive Availability',
      minutes: 8,
      body: `> **TL;DR** — Compose tools only when no model judgment lives between the steps. When you have many tools, expose a discovery tool and register matches dynamically rather than dumping dozens of options at once.

The deciding test for composition is whether a *decision point* sits between the steps. Collapsing two calls into one removes the model's chance to inspect the intermediate result and react to it. When step 2 always follows step 1 unconditionally — a purely mechanical sequence — that lost inspection costs nothing and you gain a round-trip. When the intermediate result should change what happens next, composition silently swallows a decision the model needed to make, and it will commit to the wrong next action with no way to course-correct.

### When to compose — and when not to

✅ **Good candidates for composition**
- **Mechanical sequences** where the model would always call step 2 after step 1 without inspecting the result.
- **Latency-heavy repeated lookups** that always happen together.
- **Atomic operations** where separate calls create race conditions — "check availability and book" must be atomic if another user could grab the slot between two calls.

❌ **Keep separate when**
- The model must **inspect intermediate results** before deciding.
- The step is **selection, judgment, or editorial choice** — that belongs outside a composite tool.

### Worked examples

| Scenario | Correct design |
|---|---|
| News-curation agent | Composite \`discover_and_score_articles(topic)\` returns candidates + scores. Keep \`add_article_to_collection(article_id)\` separate — editorial choice needs judgment. |
| Appointment booking | Combine "check availability" and "reserve slot" into atomic \`find_and_book_appointment\` — separate calls risk a lost slot. |
| Research workflow | Do NOT combine "retrieve sources" and "write conclusion" — the model must inspect sources and preserve provenance. |

When a downstream tool always needs an upstream output for a purely **mechanical** reason, redesign it to accept the stable identifier and resolve the dependency internally (the Lesson 2 pattern).

### Large tool sets degrade selection accuracy

Tool-selection accuracy drops noticeably as the count grows past a handful of *similar* options. An agent staring at dozens of connectors routes worse than one with a focused set.

### Progressive availability

\`\`\`mermaid
flowchart TD
    A["Default tools<br/>search_available_connectors<br/>small and generic"]
    A -->|"agent calls with user intent"| B["Discovery returns ranked shortlist<br/>stripe_refund — confidence 0.91<br/>shopify_refund — confidence 0.44"]
    B -->|"host dynamically registers the match"| C["Agent tool set now includes stripe_refund"]
    C --> D["Agent calls stripe_refund on next turn"]
\`\`\`

1. Start with a small set of **discovery tools** (e.g., \`search_available_connectors\`, \`find_relevant_operations\`).
2. They return a **ranked shortlist** with names, descriptions, required inputs, and confidence.
3. **Dynamically register** the matched tools so the agent calls them on later turns; once discovered they persist for the session.

This is *not* a monolithic \`find_and_execute\` tool. Search-and-execute hides the final decision and can fire the wrong action too early. Discovery **narrows** choices; the agent or user should still inspect the selected operation before execution when risk is meaningful.

The Claude Agent SDK supports this natively via tool search and dynamic registration; MCP servers can notify clients when their tool list changes, so connected agents refresh available tools without reconnecting.

> ❓ **Check yourself:** You composed booking into an atomic \`find_and_book_appointment\` to close the race window — correct. A product manager now asks you to compose \`retrieve_sources\` and \`write_summary\` the same way, "to save a round-trip." The two calls also always happen in sequence. Same pattern?
>
> *(No — opposite pattern. "Always sequential" is not the test; "no decision between the steps" is. Booking has no judgment between checking and reserving; summarization requires the model to inspect which sources came back and preserve provenance. Composing it swallows that decision and lets the model cite sources it never actually read.)*

### Key takeaways
- Compose mechanical sequences and atomic ops; keep judgment/editorial steps separate.
- Past a handful of similar tools, selection accuracy drops — use discovery + dynamic registration.
- A find-and-execute wrapper hides the decision; a discovery tool keeps control visible.`,
      principles: [
        "Compose mechanical sequences and atomic ops; keep steps separate when the model must inspect the result.",
        "Use a discovery tool + dynamic registration instead of surfacing dozens of similar tools at once.",
        "A find-and-execute tool hides the decision; a discovery tool narrows options and keeps the selection visible.",
      ],
      pitfalls: [
        "Composing steps that need model inspection eliminates the judgment point; compose only mechanical retrieval.",
        "Exposing all connectors at once bloats context and raises error rates; use discovery + dynamic registration.",
        "A search-and-execute wrapper collapses discovery and execution with no checkpoint; keep them separate.",
      ],
    },
    {
      id: 'safety-and-review',
      title: 'Safety, Confirmation Tokens, and requires_review Hints',
      minutes: 9,
      body: `> **TL;DR** — Prompts cannot enforce safety. Make unsafe execution *mechanically impossible* with separate preview/execute tools and a bound confirmation token, return calibrated review flags instead of raw scores, and disambiguate targets before queuing destructive ops.

Any safety control the model can choose to ignore is not a control. A \`dry_run: boolean\` flag and a "always preview first" system-prompt rule both live entirely at the prompt level: nothing stops the model from setting \`dry_run: false\`, and instructions degrade under edge cases, prompt injection, or ordinary model error. Real enforcement has to sit in code, where the unsafe path is unreachable rather than merely discouraged — execution that cannot occur without a token the model could not have fabricated.

### The structural pattern for destructive actions

Split the operation into two tools where execution is impossible without the preview:

1. **\`preview_delete_workspace(workspace_id)\`** — returns an impact summary and a **one-time confirmation token**.
2. The user reviews the impact.
3. **\`execute_delete_workspace(workspace_id, confirmation_token)\`** — requires the token and verifies it matches the previewed action. The token is cryptographically bound to *that* workspace ID, so a token from previewing workspace A cannot execute on workspace B.

❌ **Weak — model-chosen flag**
\`\`\`json
{ "name": "delete_workspace", "input": { "workspace_id": "ws_9", "dry_run": false } }
\`\`\`
Nothing stops \`dry_run: false\`. An enum \`mode: "preview" | "execute"\` has the identical flaw — the model still picks the value.

✅ **Strong — token gate**
\`\`\`json
{ "name": "execute_delete_workspace",
  "input": { "workspace_id": "ws_9", "confirmation_token": "tok_from_preview_ws_9" } }
\`\`\`
No valid token → no execution. The gate lives in code, not in a prompt.

### Confirmation content must be meaningful

A dialog that says \`"Ready to proceed. Confirm?"\` is weak *even when users always click yes* — they have nothing to evaluate. Surface:

- **Target** — which account, record, or resource.
- **Irreversible effects** — what cannot be undone.
- **Cost / schedule** — billing impact, timing.
- **Scope** — how many records, downstream dependencies.

This is not UX polish; it is the only mechanism by which a user can catch a mistake before it happens.

### requires_review: calibrate, don't dump scores

When output carries uncertainty (e.g., ML extractions with confidence scores), do **not** hand the model raw scores to interpret. Calibrate thresholds against a labeled validation set and return a derived boolean with reasons:
\`\`\`json
{
  "fields": {
    "vendor": { "value": "Acme Corp", "confidence": 0.94 },
    "amount": { "value": 1280.50, "confidence": 0.62 }
  },
  "requires_review": true,
  "review_reasons": ["amount_below_confidence_threshold"]
}
\`\`\`
Raw scores invite both over-trust and over-escalation depending on how the model reads them in context. A calibrated boolean produces **consistent agent behavior** regardless of temperature or phrasing.

### Annotations are hints, not a security boundary

An MCP \`readOnlyHint: true\` may inform which prompt to show, but a malicious or buggy server can advertise it on a tool that deletes data. Never skip a policy-required permission check on a server's word. Security belongs in **code, hooks, permissions, and tool logic** — not annotations or descriptions.

### Disambiguate the target *before* queuing the op

For ambiguous destructive operations, resolve the entity first. If a CRM has several similarly named contacts, show candidates with differentiating fields (email domain, company, last-activity date) and require a choice **before** the operation is queued — not inside a confirmation dialog, which answers "what action," not "which entity."

> ❓ **Check yourself:** Deletion now uses separate \`preview_delete_workspace\` and \`execute_delete_workspace\` tools, and execute refuses to run without a one-time token the preview returns. To simplify, the token is a random UUID the backend just checks for "was issued and unused." Is the gate sound?
>
> *(No — the token is unbound. A preview of workspace A yields a valid, unused token that will execute a delete on workspace B, so a confused or injected model can destroy the wrong workspace through a legitimate-looking call. The token must be cryptographically bound to the specific previewed target, and execute must verify that binding.)*

### Key takeaways
- Structural safety (separate preview/execute + bound token) beats prompt-based dry_run flags.
- Confirmation must show target, irreversible effects, cost/schedule, and scope.
- Return calibrated requires_review booleans; treat annotations as untrusted hints; disambiguate before queuing.`,
      principles: [
        "Separate preview/execute tools with a bound token make destructive execution impossible without prior preview.",
        "Return a calibrated `requires_review` boolean with `review_reasons`; raw scores produce erratic behavior.",
        "Disambiguate the target before queuing a destructive op; a confirmation dialog answers \"what,\" not \"which.\"",
      ],
      pitfalls: [
        "A `dry_run` flag is model-chosen — nothing blocks `dry_run:false`; execute must require a preview token.",
        "Raw ML scores without a calibrated threshold cause inconsistent escalation; return `requires_review` instead.",
        "`readOnlyHint` is an untrusted hint, not a security boundary; security belongs in code, hooks, and policy.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-description-mcq',
      type: 'mcq',
      scenario: 'An agent has two tools: search_knowledge_base and search_billing_records. Users sometimes ask billing questions and the agent routes them to search_knowledge_base, producing unhelpful results. Both tools have one-line descriptions.',
      question: 'Which change is most likely to fix the misrouting?',
      options: [
        'Add a third tool called route_query that decides which tool to call.',
        'Expand both tool descriptions to include explicit "when NOT to use" guidance pointing to the other tool.',
        'Remove search_knowledge_base so the model always uses the billing tool.',
        'Set tool_choice to "any" so the model is forced to pick a tool.',
      ],
      answer: 1,
      explanation: 'Misrouting between overlapping tools is a description problem. Adding "do NOT use this tool for billing queries — use search_billing_records instead" (and vice versa) gives the model the guidance it needs to pick correctly. A third routing tool adds complexity. Removing a tool is a workaround, not a fix. tool_choice: "any" only forces a call — it does not improve which tool is chosen.',
    },
    {
      id: 'ex-parameter-mcq',
      type: 'mcq',
      scenario: 'A fitness tracking agent uses a single log_workout(type, value, unit) tool. Type can be "cardio" or "strength". When type is "cardio", value is minutes and unit is "min". When type is "strength", value is the weight lifted and unit is "kg" or "lbs". The model occasionally submits unit: "reps" for cardio sessions.',
      question: 'What is the most robust fix?',
      options: [
        'Add a prompt instruction telling the model which units are valid for each type.',
        'Add an enum to the unit parameter listing all possible values across both types.',
        'Split into two tools: log_cardio_session and log_strength_session, each with its own schema.',
        'Add a validation check in the description that lists invalid combinations.',
      ],
      answer: 2,
      explanation: "When parameter sets are fundamentally incompatible between operation subtypes, split into separate tools. Each tool's schema then makes valid combinations explicit and invalid ones structurally impossible. Prompt instructions and description caveats are weaker than schema enforcement. A combined enum still allows cross-type invalid combinations like unit: \"reps\" on cardio.",
    },
    {
      id: 'ex-output-mcq',
      type: 'mcq',
      scenario: 'A document search tool returns the prose string "Found these documents: Maintenance Schedule, Lab Access Plan, Vendor Notes." A downstream open_document tool needs to act on one of those documents.',
      question: 'Which output design principle does this response most clearly violate?',
      options: [
        'It returns too many results — output should be limited to one item per call.',
        'It lacks stable identifiers, so a downstream tool cannot reliably act without another lookup.',
        'It should return isError: true since no structured JSON was produced.',
        'Prose output must always be paginated before it is returned to the model.',
      ],
      answer: 1,
      explanation: 'Tool results are the model\'s working memory for the next step. Prose-only output omits stable identifiers like document_id, so a downstream open_document tool has nothing concrete to act on and must issue a redundant search. Result count is not the issue. isError is for genuine failures, not prose. Pagination applies to high-match APIs, not to a fixed result count.',
    },
    {
      id: 'ex-composition-mcq',
      type: 'mcq',
      scenario: 'An agent that manages many external integrations exposes 60 connector tools simultaneously. Users report slow responses and the agent occasionally calls the wrong connector.',
      question: 'Which design pattern does the source guidance recommend for this situation?',
      options: [
        'Merge all connectors into one find_and_execute(intent) tool so the model only sees one option.',
        'Use progressive availability: expose a small discovery tool, return a ranked shortlist, and dynamically register the matched connector.',
        'Alphabetically sort the 60 tools so the model can scan them more efficiently.',
        'Remove all but the five most popular connectors and document the rest in the system prompt.',
      ],
      answer: 1,
      explanation: 'Tool-selection accuracy degrades as the number of similar options grows. Progressive availability starts with a discovery tool that returns a ranked shortlist, then dynamically registers the matching connector so the agent can call it on the next turn. A monolithic find_and_execute collapses selection and execution, hiding the decision and risking the wrong action. Sorting or pruning tools does not address the core selection-accuracy problem the same way dynamic registration does.',
    },
    {
      id: 'lab-order-tools',
      type: 'lab',
      title: 'Design an order-management tool set',
      brief: `An e-commerce platform needs an agent that can handle three distinct order operations:

1. **Issue store credit** — requires order ID and a credit amount in USD.
2. **Cancel a subscription** — requires subscription ID and a cancellation reason (one of: "too_expensive", "not_needed", "switching_provider", "other").
3. **Replace a damaged item** — requires order ID and the item SKU.

Your task: design **three separate tool definitions** in JSON (name, description, and input_schema for each). Your descriptions must include when to use and when NOT to use each tool. Use enums where appropriate.

Paste your three tool definitions below. The reviewer will check: correct splitting rationale, enum usage, identifier stability, description quality (what/when/when-not/limits), and whether a unified manage_order tool was incorrectly used.`,
      placeholder: '[\n  {\n    "name": "issue_store_credit",\n    "description": "...",\n    "input_schema": { "type": "object", "properties": { ... }, "required": [ ... ] }\n  },\n  { ... },\n  { ... }\n]',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate tool interface designs submitted by learners. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is good, (3) specific, actionable fixes. Evaluate on: whether three separate tools are used (not a unified manage_order), enum usage for closed sets, stable identifiers, description quality covering what/when/when-not/output/limits, and JSON schema validity. If the learner submitted a single unified tool, explain clearly why splitting is preferred here.',
      evalTemplate: 'A learner submitted this order-management tool set design:\n\n{{input}}\n\nReview it per your rubric. If the JSON is invalid or incomplete, note that first and show what a corrected version would look like for one of the three tools.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'An agent has search_knowledge_base and search_billing_records. Each has only the description "Search documents." The agent keeps routing billing questions to the knowledge-base tool. What is the most direct fix?',
      options: [
        'Add a third route_query tool that classifies each request before dispatching.',
        'Expand each description to state what it covers, when to use it, and when NOT to use it (pointing to the sibling tool).',
        'Merge both tools into one search tool with a free-text source parameter.',
        'Set tool_choice to a specific named tool so the model is forced to call the right one.',
      ],
      answer: 1,
      explanation: 'Correct: misrouting between superficially similar tools is a description problem — a thin "Search documents" string forces the model to guess, so richer descriptions stating coverage and an explicit "when NOT to use" pointing to the sibling resolve it. The route_query meta-tool adds an extra hop and its own selection problem without fixing the weak descriptions. Merging into one tool with a free-text source reintroduces ambiguity and invites hallucinated source values. Forcing tool_choice to a named tool only works if your code already knows the answer, defeating the point of letting the model route.',
    },
    {
      id: 'q2',
      question: 'A teammate names a parameter date_string_iso_yyyy_mm_dd to communicate the expected format to the model. What is the problem with this approach?',
      options: [
        'Long parameter names are rejected by JSON Schema validators.',
        'The model cannot read parameter names, only descriptions.',
        'Format hints belong in the description or schema, not encoded in the parameter name.',
        'ISO 8601 dates should always be passed as integers instead.',
      ],
      answer: 2,
      explanation: 'Correct: encoding format hints in the parameter name is a listed pitfall — format expectations belong in the description or schema (and ideally an input example like a sample date). JSON Schema does not reject long names, so that is not the issue. The model does read parameter names, so claiming it cannot is false. Dates should not become integers; the point is where the format guidance lives, not the data type.',
    },
    {
      id: 'q3',
      question: 'A tool accepts a source parameter that routes to one of exactly three backends. The model occasionally invents values like "kb" or "support" that no backend recognizes. What is the best schema change?',
      options: [
        'Define source as an enum listing the three valid repository values.',
        'Make source a free-text string and validate it inside the tool.',
        'Add a sentence to the description listing the allowed values.',
        'Remove source and infer the backend from the query text.',
      ],
      answer: 0,
      explanation: 'Correct: for a fixed, closed set an enum in the JSON Schema prevents hallucinated values, surfaces the valid options directly, and catches bad input early. A free-text string with internal validation still lets the model emit "kb" and wastes a turn on rejection. Listing values only in the description is weaker than schema enforcement — exactly the gap an enum closes. Inferring the backend from query text removes explicit control and adds ambiguity.',
    },
    {
      id: 'q4',
      question: 'A user says "archive the Orion project," but three projects contain "Orion." The archive operation is destructive. What is the recommended pattern?',
      options: [
        'Have the model pick the most recently active match and archive it immediately.',
        'Ask the user to retype the exact full project name until only one matches.',
        'Archive all three matching projects to be safe and let the user restore any mistakes.',
        'Call search_projects(query) first, present candidates with differentiating fields, and let the user confirm before archive_project(project_id).',
      ],
      answer: 3,
      explanation: 'Correct: this is lookup-then-act — search returns candidate IDs plus distinguishing metadata, the user confirms which is meant, and only then does the agent act on a stable unambiguous ID. Letting the model guess and immediately run a destructive operation is exactly what the module warns against. Forcing the user to retype names is poor UX and may still not disambiguate. Archiving all three is destructive over-reach; "restore later" is no substitute for not acting wrongly.',
    },
    {
      id: 'q5',
      question: 'An e-commerce agent uses one manage_order(action, ...) tool where action can be "refund", "cancel", or "replace", each needing different fields. The model frequently omits required fields or fills in irrelevant ones. What is the recommended redesign?',
      options: [
        'Keep one tool but mark every field optional so omissions never error.',
        'Split into separate tools such as issue_store_credit, cancel_subscription, and replace_damaged_item, each with its own schema.',
        'Add a long description enumerating which fields each action requires.',
        'Keep one tool but add an enum on the action parameter.',
      ],
      answer: 1,
      explanation: 'Correct: when operation subtypes have fundamentally different required fields, splitting into separate tools makes each schema encode exactly the fields that operation needs. Making every field optional removes the schema\'s ability to require what is genuinely needed, hiding errors rather than preventing them. A description enumerating per-action fields is weaker than schema enforcement. An enum on action only constrains the action label, not the divergent field sets behind each action.',
    },
    {
      id: 'q6',
      question: 'A neighborhood-info tool requires a street address, so the agent must always first call get_device_address(device_id) and pass the result through. No model judgment happens between the two calls. What is the best redesign?',
      options: [
        'Wrap both calls in a composite tool that the model calls once.',
        'Cache get_device_address results so the second call is faster.',
        'Make the neighborhood-info tool accept device_id and resolve the address internally.',
        'Add address as an optional parameter so the model can skip the lookup when it already knows it.',
      ],
      answer: 2,
      explanation: 'Correct: when a downstream tool always needs an upstream output for a purely mechanical reason, redesign it to accept the stable identifier (device_id) and resolve the dependency internally, removing an extra round-trip and the failure coupling when the upstream call fails. A composite wrapper still performs two backend calls and is heavier than simply accepting the ID. Caching only speeds the redundant call without eliminating it or its coupling. Making address optional keeps the brittle two-step path available and does not address the mechanical dependency.',
    },
    {
      id: 'q7',
      question: 'A search tool returns the prose line "Found these documents: Maintenance Schedule, Lab Access Plan, Vendor Notes." A later tool needs to act on one of those documents. Why is this output design weak?',
      options: [
        'Prose responses use more tokens than JSON in every case.',
        'The model cannot read prose, only JSON.',
        'It lacks stable identifiers, so downstream tools cannot reliably act without another lookup.',
        'Returning more than two results requires pagination by default.',
      ],
      answer: 2,
      explanation: "Correct: tool results are the model's working memory for the next step, and prose-only output omits stable identifiers like document_id, so a downstream tool has nothing concrete to act on and must perform another lookup. Token count is not the core issue and prose is not always larger. The model can read prose perfectly well; the problem is actionability, not legibility. Returning three results does not force pagination — pagination is about high-match counts, not a fixed threshold of two.",
    },
    {
      id: 'q8',
      question: 'Three shipping carriers each report delivery status with different codes and field names. What does the module recommend the tool do before returning results to the agent?',
      options: [
        "Return each carrier's raw payload and let the model learn each schema.",
        'Normalize the data into a single consistent schema (e.g., status, estimated_delivery, delay_reason, requires_action).',
        'Return only the carrier whose format is easiest for the model to parse.',
        "Add a system-prompt section mapping each carrier's codes to a common meaning.",
      ],
      answer: 1,
      explanation: "Correct: normalization belongs in the tool layer, translating heterogeneous backends into one consistent schema so the model never has to learn carrier-specific codes. Returning raw payloads pushes that burden into the model's reasoning, which the module explicitly warns against. Returning only one carrier silently drops data the user may need. Putting the code mappings in the system prompt is brittle and bloats context; the mapping logic belongs in deterministic tool code.",
    },
    {
      id: 'q9',
      question: 'A query legitimately matches nothing. How should the tool report this so the agent behaves correctly?',
      options: [
        'Return isError: true with the message "No matches found."',
        'Return an empty string so the model knows to stop.',
        'Throw an exception so the framework surfaces the failure.',
        'Return { "results": [], "total_matches": 0 } with no error flag.',
      ],
      answer: 3,
      explanation: 'Correct: a successful empty result is still a success — an empty results array and total_matches of 0 tells the agent clearly that nothing matched. Returning isError for "no results" signals a tool failure, which can make the agent retry a perfectly valid query and waste turns. An empty string is unstructured and ambiguous. Throwing an exception is even worse than isError, conflating a normal empty result with a genuine fault.',
    },
    {
      id: 'q10',
      question: 'A connector backs a search API that can match thousands of items. The user usually only wants the first few. What output design avoids latency, wasted tokens, and context overflow?',
      options: [
        'Auto-fetch every page and return the full set so the model has complete information.',
        'Return the first page plus a total_count and a cursor or continuation token.',
        'Return a random sample of items capped at 50.',
        'Return only the count and require a second tool call for any item details.',
      ],
      answer: 1,
      explanation: 'Correct: for paginated APIs the module recommends returning the first page, a total_count (or estimate), and a cursor so the agent can request more only when needed, avoiding long latency, wasted tokens, and context overflow. Auto-fetching every page is exactly the pitfall being avoided. A random sample loses ordering and relevance and still hides how many matches exist. Returning only a count with no items forces an extra round-trip even when the first page would have sufficed.',
    },
    {
      id: 'q11',
      question: 'A news-curation agent should discover candidate articles, score them, and add chosen ones to a collection. Which decomposition matches the composition guidance?',
      options: [
        'One tool discover_score_and_add(topic) that finds, scores, and files everything automatically.',
        'Three fully separate tools with the model manually chaining every step including scoring.',
        'A composite discover_and_score_articles(topic) plus a separate add_article_to_collection(article_id) for the editorial choice.',
        'A single add_article_to_collection tool that internally discovers and scores first.',
      ],
      answer: 2,
      explanation: 'Correct: discovery and scoring are mechanical steps that always happen together, so composing them is fine; adding an article is an editorial choice requiring judgment, so it stays separate where the model can inspect candidates first. A single discover-score-and-add tool hides the editorial decision and can file the wrong articles. Forcing the model to chain scoring manually loses the benefit of composing the mechanical steps. Hiding discovery and scoring inside the add tool buries the judgment step again and removes the chance to inspect scored candidates.',
    },
    {
      id: 'q12',
      question: 'A workspace deletion must always be previewed before it executes. An engineer proposes a single delete_workspace tool with a dry_run boolean. Why is this insufficient, and what is the structural fix?',
      options: [
        'It is fine as long as the system prompt always instructs the model to preview first.',
        'Boolean flags are deprecated; use an enum mode parameter with "preview" and "execute" values instead.',
        'Add a second confirmation boolean so both must be true before deletion proceeds.',
        'The model can call it with dry_run: false; use separate preview and execute tools where execute requires a one-time confirmation token bound to that workspace.',
      ],
      answer: 3,
      explanation: 'Correct: a dry_run flag is unsafe because nothing mechanically stops the model from calling with dry_run: false, and prompt instructions can be bypassed by edge cases, injection, or model error; the structural fix is two tools where execute refuses to run without a one-time token cryptographically bound to that workspace. Relying on the system prompt is precisely the prompt-based approach being rejected. An enum mode parameter has the same flaw as dry_run, since the model still chooses the value. A second boolean is still just model-chosen flags with no mechanical gate.',
    },
    {
      id: 'q13',
      question: 'A confirmation step always shows "Ready to proceed. Confirm?" and users always click yes. Why does the module still call this weak, and what should the confirmation surface instead?',
      options: [
        'Without showing target, irreversible effects, cost/schedule, and scope, the user has no way to catch a mistake before it happens.',
        'It is fine because the user explicitly confirms every time.',
        'The wording is too long and should be shortened to a single word.',
        'Confirmation should be removed entirely and replaced by an undo feature.',
      ],
      answer: 0,
      explanation: 'Correct: meaningful confirmation is the only mechanism by which a user can catch a mistake before it occurs, so it must show the target, irreversible effects, cost or schedule, and scope. A bare "Confirm?" gives the user nothing to evaluate even when they always click yes, so consistent clicking does not make it safe. The wording problem is missing content, not excess length. Removing confirmation in favor of undo fails for genuinely irreversible operations, which these flows guard.',
    },
    {
      id: 'q14',
      question: 'An MCP server marks a tool readOnlyHint: true, but the host is deciding whether to skip a required permission check for it. What is the correct stance on annotations?',
      options: [
        'Trust the annotation and skip the check, since the server declared the tool read-only.',
        'Reject any tool that includes annotations, since they cannot be verified.',
        'Treat annotations as untrusted hints for UI affordances only; base actual permission and confirmation decisions on trust level, policy, and real risk.',
        'Require the model to re-validate the annotation before each call.',
      ],
      answer: 2,
      explanation: 'Correct: annotations are untrusted hints, not a security boundary — a malicious or buggy server can advertise readOnlyHint: true on a tool that deletes data, so they may inform which prompt to show but must never skip a policy-required check. Skipping the check on the server\'s word is the exact failure mode being warned against. Rejecting all annotated tools is overkill and discards useful UI signals. Asking the model to re-validate the hint is meaningless, since the model has no independent way to verify what the tool actually does; security belongs in code, hooks, and permissions.',
    },
    {
      id: 'q15',
      question: 'A CRM delete flow occasionally targets the wrong contact because several contacts share a name. When should the target be disambiguated relative to the confirmation dialog?',
      options: [
        'Inside the confirmation dialog, which already assumes the correct target was chosen.',
        'After execution, by letting the user undo if the wrong contact was affected.',
        'It does not matter, since a confirmation dialog will catch any mistake.',
        'Before the operation is queued, by showing candidates with differentiating fields (email domain, company, last activity) and having the user choose.',
      ],
      answer: 3,
      explanation: 'Correct: ambiguity about which entity is meant must be resolved before the destructive operation is queued, by presenting candidates with differentiating fields so the user picks the intended record. A confirmation dialog answers "what action will happen," not "which entity," and it assumes the correct target was already selected, so disambiguating inside it is too late. Relying on post-execution undo fails for irreversible deletes. Assuming the dialog will catch any mistake conflates action confirmation with entity disambiguation, which are complementary but distinct steps.',
    },
  ],
}
