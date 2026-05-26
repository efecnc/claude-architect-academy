export default {
  id: 'context-management',
  num: 5,
  title: 'Conversation Context Management',
  summary: 'Context management is state management: you decide what the model sees each turn. This module covers sliding windows, progressive summarization, structured state, retrieval, tool-result compression, and handling stale data across sessions.',
  estMinutes: 38,
  tags: ['Context', 'State', 'Memory'],

  lessons: [
    {
      id: 'state-is-yours',
      title: 'You Own the State — Not the Model',
      minutes: 7,
      body: `> **TL;DR** — Context management *is* state management. The model sees a request, not your database. Every turn, you decide what it sees — and that decision, not the window size, determines quality.

Because the Messages API is stateless, *your application* is the state machine: the model conditions only on the bytes you place in the current request, with no access to anything from prior turns or your database. The context window is therefore working memory you assemble per call, not a persistent store the model reads from. Whatever you don't include, the model cannot know — no matter how thoroughly it was discussed earlier. Assemble a tight, relevant request and the model performs; pad it with stale or irrelevant content and quality drops, even when everything technically "fits."

> **Context management is state management. The model sees a request, not your database. You decide what to include.**

### The right strategy depends on what you must preserve

Different information has different shelf lives and different precision requirements. The single biggest source of context bugs is choosing the wrong strategy for a given *type* of content — for example, summarizing an exact dollar figure into vague prose, or using a sliding window where the user reaches back to a decision made 40 turns ago. Match the tool to the need:

| Need | Best Strategy |
|---|---|
| Recent conversational flow | Keep recent turns verbatim |
| Long-term narrative continuity | Progressive summaries with decisions and themes |
| Current user preferences | Structured state object |
| Exact facts and numbers | Retrieval from source or structured fact store |
| Persistent creative canon | Compact reference section |
| Tool-heavy workflows | Extract relevant fields; discard verbose payloads |

The rest of this module is essentially a guided tour of this table, one row at a time.

### Capacity is not attention

A 200K-token context window is a measure of *capacity*, not *salience*. Stuffing the window full does not make every detail equally retrievable. Long, noisy contexts dilute the signal — the model has more competing information to weigh, and quality on the details you actually care about can drop, especially near the context boundary. Curating what the model sees beats dumping everything in, even when "everything" fits comfortably.

### Weak vs strong: a 60-turn travel planner

**❌ Weak — resend everything, every turn**

\`\`\`mermaid
flowchart LR
    T1["turn 1<br/>budget stated"] --> T2["turn 2"] --> T3["..."] --> T59["turn 59"] --> T60["turn 60"]
    ALL["ALL 60 turns sent<br/>every call"] -.->|"cost + latency grow"| T1
\`\`\`

Cost and latency climb each turn; the budget stated in turn 2 competes with 58 turns of chatter; the model fixates on a stale aside from turn 9.

**✅ Strong — a curated briefing folder**

\`\`\`mermaid
flowchart TD
    SYS["system<br/>persona + rules"]
    ST["state<br/>budget_usd: 3500<br/>hotel_pref: boutique central"]
    SUM["summary<br/>Decisions: chose Lisbon over Porto<br/>Open: confirm dates"]
    REC["recent turns<br/>turn 58 · turn 59 · turn 60<br/>verbatim"]
    SYS --> ST --> SUM --> REC
\`\`\`

Durable facts live in a small structured object, older turns collapse into a structured summary, and only the most recent turns stay verbatim. Smaller, sharper, cheaper.

### Visual: where each piece of state lives

\`\`\`mermaid
flowchart LR
    subgraph APP["YOUR APP (the state machine)"]
        A1["database · session store"]
        A2["structured state · summaries"]
        A3["raw transcripts · fact tables"]
        A4["RAG index · tool-result cache"]
    end
    subgraph REQ["THE REQUEST (all the model sees)"]
        R1["system: rules / persona"]
        R2["state: canonical truth"]
        R3["summary: decisions + facts"]
        R4["recent: last few turns verbatim"]
    end
    APP -->|"build each turn"| REQ
    note1["you hold ALL of it"] -.-> APP
    note2["you choose what crosses over"] -.-> REQ
\`\`\`

> ❓ **Check yourself:** A 180K-token request fits comfortably inside a 200K window, yet the model keeps overlooking a constraint stated halfway through. The data is present and well-formed. Why does presence not guarantee use?
>
> *(Capacity is not attention. Tokens being in the window does not make them equally salient; long, noisy context dilutes the signal and degrades recall mid-context. The fix is curation — trim competing material so the constraint stands out — not a larger window.)*

### Key takeaways
- The model sees **only the request** you assemble; your application owns all state.
- Match the **strategy to the content type** — verbatim recency, structured state for preferences, retrieval for exact facts.
- A large window is **capacity, not attention**; curate intentionally even when everything fits.`,
      principles: [
        "Context management is state management — the API is stateless; your app builds the briefing folder each turn.",
        "A 200K window is capacity, not attention — noisy contexts dilute signal; curate even when everything fits.",
        "Match strategy to content type: verbatim for recency, structured state for preferences, retrieval for facts.",
      ],
      pitfalls: [
        "Treating window size as a strategy — capacity does not equal recall; stuffing the window degrades quality.",
        "Confusing a large window with reliable recall — noisy contexts produce competing signals and hurt precision.",
      ],
    },
    {
      id: 'sliding-window-and-summarization',
      title: 'Sliding Window and Progressive Summarization',
      minutes: 8,
      body: `> **TL;DR** — A sliding window keeps a fixed number of the most recent turns and drops the rest — cheap, but it silently forgets. Progressive summarization keeps continuity by replacing old turns with a *structured* summary while keeping recent turns verbatim.

These two strategies trade off recency against continuity. A sliding window is a fixed-size FIFO buffer over the message list: it bounds token cost at the price of dropping anything older than the cutoff, with no record that it ever existed. Progressive summarization instead compresses the dropped region into a running *structured* summary, so the durable substance — decisions, preferences, open questions, facts — survives even after the raw turns are gone. The window handles immediacy cheaply; the summary handles long-range continuity. Most production systems combine both: a verbatim recent window plus a summary of everything before it.

---

### Sliding Window — simple, cheap, forgetful

A sliding window keeps a fixed number of the most recent messages and drops older ones. It is the simplest strategy and has a clear niche: conversations where older context is *genuinely* rarely needed.

**When it works well.** Production logs are the deciding evidence. If 94% of user messages only reference the previous 3–5 exchanges, and the remaining 6% ask for information users could easily re-state, then keeping the last 8–10 turns plus the system prompt restores speed and quality without meaningful loss. On the rare reach-back, the assistant simply asks the user to re-state the detail.

**A separate window for RAG results.** Accumulated retrievals from many earlier queries pile up and crowd out turn-by-turn coherence. The fix is to window *the retrievals specifically* — keep the last 2–3 — while conversation history keeps its own policy. Aggressively deduplicating or merging every retrieval into one digest is more complex and rarely better.

**Where it fails.** If users refer back to earlier decisions, stated preferences, or exact numbers, a pure window loses them *silently*. The user said "keep my budget under \\$8,000" four turns ago; once it ages out, it is simply gone, and nothing flags the loss.

\`\`\`mermaid
flowchart LR
    turn1["turn 1<br/>budget $8k"]
    turn2["turn 2"]
    turn3["turn 3"]
    turn4["turn 4"]
    turn5["turn 5"]
    turn6["turn 6"]
    turn7["turn 7"]
    turn1 --> turn2 --> turn3 --> turn4 --> turn5 --> turn6 --> turn7
    dropped["DROPPED<br/>(aged out)"]
    kept["KEPT and sent<br/>(last 4 turns)"]
    turn1 -.->|"ages out"| dropped
    turn2 -.->|"ages out"| dropped
    turn3 -.->|"ages out"| dropped
    turn4 --- kept
    turn5 --- kept
    turn6 --- kept
    turn7 --- kept
    gone["budget $8k is GONE"]
    dropped --> gone
\`\`\`

---

### Progressive Summarization — keep continuity, not transcript

Progressive summarization replaces older conversation blocks with a running **structured** summary while keeping recent turns verbatim. The operative word is *structured*.

**A useful summary (structured extraction):**

> **Decisions:**
> - The user selected option B because it preserves existing integrations.
>
> **Current preferences:**
> - Budget target: \\$8,000.
> - Avoid vendor lock-in.
>
> **Open questions:**
> - Confirm whether the migration must support offline mode.
>
> **Important facts:**
> - Existing system processes about 40K records per day.

**A bad summary (vague prose):**

> The user and assistant discussed several options. The user seemed to prefer
> something that fit their budget and didn't create dependencies.

When the user later asks "what budget did we agree on?", the structured version answers instantly; the prose version has already thrown the number away.

### Weak vs strong: a 25-turn product-design session at the limit

**❌ Weak — raise the window from 25 to 50 turns.** This only *defers* the limit. You pay more tokens now and still drop the early decisions later. It treats a structural problem as a sizing problem.

**✅ Strong — hybrid summarization.** Replace older turns with a structured summary (decisions, preferences, open questions, facts) and keep the most recent turns verbatim. Long-term continuity survives at a fraction of the token cost, and the limit stops being a moving cliff.

**Implementation note.** Generate summaries in a *separate* Claude call with a strict extraction prompt — explicitly ask for the four sections above. Do **not** ask the model to "summarize the conversation so far," which invites exactly the vague prose that loses the facts.

### Visual: hybrid context layout

\`\`\`mermaid
flowchart TD
    SP["system prompt"]
    SS["STRUCTURED SUMMARY<br/>(older turns, distilled)<br/>Decisions / Preferences / Open Qs / Facts"]
    VR["VERBATIM RECENT TURNS<br/>(last few, untouched)<br/>turn 23 · turn 24 · turn 25"]
    SP --> SS --> VR
    C1["continuity (summary)"] -.-> SS
    C2["immediacy (verbatim)"] -.-> VR
\`\`\`

> ❓ **Check yourself:** Summarization is keeping the conversation on-topic and coherent, but exact figures the user agreed to keep vanishing from the assistant's answers. The window size and recency are fine. What property of the summaries is failing, and what changes it?
>
> *(They are free-form prose, which preserves gist and discards exact values by design. Replace the open-ended "summarize" prompt with a structured extraction into fixed sections — decisions, current preferences, open questions, key facts — so specific figures survive compression.)*

### Key takeaways
- Use a **sliding window** only when production data shows older context is genuinely rarely needed; apply a **separate** window to RAG results.
- Progressive summaries must be **structured** (decisions / preferences / open questions / facts), never vague prose.
- **Hybrid** (structured summary + verbatim recent turns) beats enlarging the window, which only defers the limit.`,
      principles: [
        "Use a sliding window only when logs confirm older context is rarely needed — verify with production data.",
        "Window RAG results separately (keep last 2–3) so accumulated retrievals don't crowd out conversation history.",
        "Progressive summaries must be structured — decisions, preferences, open questions, facts — never vague prose.",
        "Hybrid (structured summary + verbatim recent turns) beats enlarging the window, which only defers the problem.",
      ],
      pitfalls: [
        "Using a pure sliding window when users reach back to earlier decisions — facts age out silently.",
        "Writing vague prose summaries — \"preferred a lower budget\" destroys exact values; structure summaries.",
        "Expanding the window instead of summarizing — doubling from 25 to 50 turns just defers the same cliff.",
        "Keeping every RAG result forever — accumulated retrievals crowd out recent turns; window them separately.",
      ],
    },
    {
      id: 'persistent-reference-and-structured-state',
      title: 'Persistent Reference Sections and Structured State',
      minutes: 8,
      body: `> **TL;DR** — Some facts must stay *exact and permanent* (a reference section); some facts *change* and must reflect current truth (a structured state object). Both beat hoping the model infers the right value from a noisy transcript.

The two patterns here differ in their update rule, not their goal: both hand the model an explicit, authoritative value instead of forcing it to reconstruct one from a noisy transcript. A **persistent reference section** is append-only and immutable for the session — allergies, world-building rules, user-defined terms — and you deliberately exclude it from any summarization or trimming pass so it can never be blurred away. A **structured state object** is mutable: you overwrite fields in place as preferences change (budget \\$5,000 → \\$4,200, "shared desk" dropped) and inject the current version each turn, so the model reads canonical truth rather than diffing scattered, contradictory turns to derive it.

---

### Persistent Reference Sections — exact and permanent

Some content must remain exact and stable across the whole conversation even when the surrounding discussion shifts:

- **Story bibles:** character backgrounds, plot structure, world-building rules.
- **User-defined terms:** "room temperature butter means 68°F in this kitchen."
- **Critical safety info:** allergies, medication interactions.
- **Active scaling parameters:** "scale all recipes to 8 servings."

The pattern: separate this content into a **retained reference section** at the start of context, and apply trimming or summarization *only* to the surrounding ephemeral discussion.

**Why not mix them?** A single summarization pass over a combined context risks blurring or dropping the very details the user expects to be permanent. A dinner-party assistant that knows about a nut allergy and an 8-serving requirement must protect those facts: a pure sliding window loses the allergy once it ages out; a single summary blurs the exact serving count. The right design **combines three techniques** — extract critical data into a compact reference block, summarize general back-and-forth, and retain recent exchanges verbatim.

---

### Structured State — the canonical current truth

When users revise preferences mid-conversation, maintain a **canonical state object** that represents current truth and inject it into every request:

\`\`\`json
{
  "workspace_search": {
    "monthly_budget_max": 4200,
    "space_type": "private_office",
    "must_have": ["bike storage", "after-hours access"],
    "no_longer_relevant": ["shared desk"]
  }
}
\`\`\`

Update the object whenever the user changes a preference; inject it every turn. This is more reliable than the common alternatives, each of which has a specific failure mode:

| Alternative | Why it is weaker |
|---|---|
| Let the model infer current truth from the transcript | Old and new values coexist; the model may act on a superseded one |
| System-prompt rule: "prefer the most recent preference" | Usually works, not reliably enough to bet on |
| Prune old turns to remove stale values | May delete context needed for unrelated reasons |
| Few-shot examples of "applying changes correctly" | Shapes framing but gives no single source of truth |

### Weak vs strong: revised workspace preferences

**❌ Weak**

> system: "Always prioritize the most recently stated preference."
> messages: [...45 turns where budget changed twice and a requirement was dropped...]

The model has to *reconstruct* current truth from scattered, contradictory turns — and sometimes picks a stale value.

**✅ Strong**

\`\`\`mermaid
flowchart TD
    INJ["state object injected every turn<br/>monthly_budget_max: 4200<br/>no_longer_relevant: shared desk"]
    MSG["recent turns only"]
    MODEL["model reads canonical truth<br/>no reconstruction needed"]
    INJ --> MSG --> MODEL
\`\`\`

Current truth is explicit and authoritative; the model reads it instead of inferring it.

**Conflicting preferences — surface, don't silently reconcile.** A user who says "I have very low risk tolerance" and later "I want to maximize returns like my friends did with crypto" has stated genuinely incompatible goals. The right behavior is to **surface the contradiction and ask which priority should govern.** A silent "most recent wins" assumes recency equals intent; a balanced compromise risks recommending something that fits *neither* stated preference.

**Multi-issue sessions.** Structured state scales to complex sessions. If a customer raises a refund, a subscription question, and a payment update across 45 turns, structured state tracks each issue's status independently of the linear conversation — so the agent can reliably answer "what happened with my refund?" at any point:

\`\`\`json
{
  "issues": {
    "refund": { "order_id": "ORD-8842", "status": "pending", "amount": 49.99 },
    "subscription": { "plan": "pro", "query": "upgrade eligibility", "status": "resolved" },
    "payment": { "invoice_id": "INV-2044", "status": "open" }
  }
}
\`\`\`

> ❓ **Check yourself:** A cooking assistant must hold a guest's nut allergy and a "scale all recipes to 8 servings" rule exactly, across a long chat that rambles about plating and timing. Why is a single summarization pass over the whole conversation the wrong tool here, and what replaces it?
>
> *(Summarization is lossy: one pass over everything can blur the exact serving count and drop the safety-critical allergy. Isolate those must-stay-exact facts in a retained reference section excluded from trimming, then summarize only the ephemeral discussion and keep recent turns verbatim — three techniques, not one.)*

### Key takeaways
- Put **permanent, must-stay-exact** data in a retained reference section; summarize only the ephemeral discussion around it.
- Maintain a **canonical structured state object** for changing preferences — update on every change, inject on every request.
- **Surface** conflicting preferences instead of silently reconciling them; use structured state to track **multiple issues** independently.`,
      principles: [
        "Extract must-stay-exact data into a retained reference section; summarize only the ephemeral discussion.",
        "Maintain a canonical state object for changing preferences — update on every change, inject every request.",
        "Surface conflicting preferences rather than silently reconciling them; recency does not equal intent.",
        "Structured state enables reliable multi-issue tracking independently of linear conversation flow.",
      ],
      pitfalls: [
        "Mixing permanent critical data with ephemeral chat in one summarization pass — exact facts get blurred.",
        "Relying on \"prefer the most recent preference\" — unreliable when stale and fresh values coexist in context.",
        "Silently resolving conflicting preferences — a balanced compromise fits neither stated goal; surface and ask.",
      ],
    },
    {
      id: 'retrieval-and-compression',
      title: 'Retrieval, Fact Stores, and Tool-Result Compression',
      minutes: 8,
      body: `> **TL;DR** — Summaries lose precision, so fetch exact facts from the source on demand and keep them in structured stores. And after a verbose tool result is used, compress it to the fields that still matter — don't let raw payloads pile up.

Summarization is lossy compression: it preserves gist and discards exact values, which is fatal when a later question needs a specific p-value, clause, or transaction ID. The fix is to keep precision at the source — store facts in a structured database and retrieve the relevant passage on demand — rather than trying to carry every number forward in context, which just inflates the summary back toward the original document. The same discipline applies to tool outputs: once a verbose result has been used for the current turn, compress it to the few fields the *rest* of the conversation will need and discard the raw payload, so repeated calls don't accumulate into context-dominating bulk.

---

### Retrieval and Fact Stores — precision belongs at the source

Summaries lose precision by design. When users need exact p-values, source quotes, contract clauses, transaction IDs, or numeric thresholds, a summary cannot be trusted to preserve them. Store facts in a structured database and retrieve the relevant passage when needed.

**Pattern for a research assistant** — three layers for three kinds of content:

| What to store | How to serve it |
|---|---|
| Interpretive discussion | Progressive summaries |
| Exact source claims | Re-inject relevant source sections on demand |
| Recurring numerical lookups | Structured fact table |

**On-demand retrieval beats full-fidelity summaries.** Say a research assistant summarizes paper discussions after 8 turns, and a user then asks for the exact sample size or p-value. Two responses both "work," but one scales:
- *(a) Write summaries that preserve every number.* These balloon back toward the size of the original document — defeating the point of summarizing.
- *(b) Re-inject the relevant source section on demand* when the question signals precision. This scales: you inject only what the current question needs.

A separate structured fact store of *every* numerical detail is heavier still and may not match the variety of follow-ups. The signal to retrieve is a question naming a specific entity, a measurement, or "exact" / "precise" language.

---

### Tool-Result Compression — extract, then discard

Verbose tool results crowd out useful conversation. After a tool result has been processed, **extract the fields that matter and discard the rest.**

\`\`\`json
// Raw tool result (40+ fields)
{
  "order_id": "ORD-8842",
  "purchase_date": "2026-03-15",
  "items": [{ "sku": "WD-1200", "qty": 2, "price": 24.99 }],
  "return_window_days": 30,
  "payment_status": "paid",
  "resolution_state": "open",
  "internal_routing_id": "...",
  "warehouse_zone": "...",
  "... 33 more fields ...": "..."
}

// Compressed version to retain in context
{
  "order_id": "ORD-8842",
  "purchase_date": "2026-03-15",
  "items": [{ "sku": "WD-1200", "qty": 2, "price": 24.99 }],
  "return_window_days": 30,
  "payment_status": "paid",
  "resolution_state": "open"
}
\`\`\`

### Weak vs strong: a three-order return investigation

**❌ Weak — keep accumulating raw results.** Three calls to \`lookup_order\`, each returning 40+ fields, and the raw payloads come to dominate the context, eventually hitting the limit. Alternatives that *also* fail: summarizing all three into prose (loses the exact IDs and amounts the agent still needs) or moving them to a vector database (complex, and often misses structured lookups).

**✅ Strong — compress each prior result first.** Reduce each processed result to its return-relevant fields, *then* make the additional lookups. Exact IDs and values survive; space is reclaimed; the context stays sharp.

**The compression rule:** after each tool result is used, reduce it to the fields needed for the **remainder of the conversation** — not every field that was relevant at the moment of retrieval.

### Visual: the tool-result compression cycle

\`\`\`mermaid
flowchart TD
    CT["call tool"]
    RR["RAW result<br/>(40+ fields)"]
    USE["USE it<br/>(answer this turn)"]
    COMP["COMPRESS to fields<br/>still needed later<br/>(6 fields)"]
    RET["retain compressed<br/>discard raw"]
    NL["next lookup"]
    REP["repeat"]
    CT --> RR --> USE --> COMP --> RET --> NL --> REP
\`\`\`

> ❓ **Check yourself:** A research assistant compressed paper discussions into summaries after 8 turns; a user now asks for one study's exact sample size and p-value. Writing summaries that preserve every number would answer it — so why is on-demand source retrieval the better design as the corpus grows?
>
> *(Number-preserving summaries balloon back toward the size of the original documents, defeating compression, and a fact store of every figure is heavier and rarely matches the variety of follow-ups. Re-injecting the relevant source section only when a question signals precision pays cost proportional to demand, so it scales.)*

### Key takeaways
- Keep **precision at the source**: retrieve exact facts on demand rather than writing summaries that try to preserve every number.
- Use a **three-layer split** for research workloads: summaries for discussion, retrieval for exact claims, fact tables for recurring lookups.
- **Compress** each tool result after use to only the fields needed for the rest of the session; never let raw payloads accumulate.`,
      principles: [
        "Re-inject source sections on demand for precision questions — \"exact,\" a named entity, or a measurement.",
        "After using a tool result, compress it to the fields still needed — don't let raw payloads accumulate.",
        "Research: summaries for discussion, source retrieval for exact claims, fact tables for recurring lookups.",
      ],
      pitfalls: [
        "Summarizing exact facts — p-values, IDs, amounts — into prose; once blurred they cannot be recovered.",
        "Accumulating raw tool results across multiple calls until they dominate context — compress prior results.",
        "High-fidelity summaries that preserve every number balloon back toward the source; use on-demand retrieval.",
      ],
    },
    {
      id: 'sessions-and-versioning',
      title: 'Returning Users, Stale Data, and System-Prompt Versioning',
      minutes: 7,
      body: `> **TL;DR** — Tool results age. Don't resume an old transcript full of stale outputs — start a returning session from a structured summary plus targeted fresh lookups, inject out-of-band updates explicitly, and version your system prompts.

A tool result embedded in a transcript is a point-in-time snapshot, not a live value — it records what was true when the call ran, and nothing re-validates it when you replay the transcript later. The model has no way to tell a stale "pending" from a current one, and will often anchor to the older result precisely because it is more detailed than a fresh one. So a returning session should start from a structured summary of what happened plus a fresh lookup before any claim about current status, out-of-band updates must be injected explicitly and timestamped to outrank stale snapshots, and system-prompt changes must be versioned because prior turns still carry the old rules.

---

### Returning Users and Stale Data

Tool results age. A user returning hours or days later must not be served from stale tool outputs embedded in an old transcript. The model cannot know those results are stale unless you tell it — and even when told, it may still reference them, *especially when the older results are more detailed than the newer ones.*

**Reliable pattern for returning sessions:**
1. Store a **structured summary** of the prior interaction — do not resume the raw transcript.
2. Inject that summary as context at the start of the new session.
3. Perform **targeted fresh lookups** for data that may have changed.
4. Never rely on an instruction like "prefer the most recent tool results" — it is not reliable enough.

**Example structured returning-session summary:**
\`\`\`json
{
  "user_issue": "billing adjustment requested",
  "prior_actions": ["validated identity", "opened case"],
  "known_ids": ["case_9138", "invoice_2044"],
  "last_known_status": "pending as of 2026-04-28T15:30:00Z",
  "fresh_lookup_required": true
}
\`\`\`
The \`fresh_lookup_required: true\` flag signals the agent to call the lookup tool before making any claim about current status.

### Weak vs strong: the returning billing customer

**❌ Weak — resume the transcript and add "prefer the most recent tool results."** The agent often references the older "pending" result anyway, especially since it is more detailed. Two related anti-patterns: *filtering* the old \`tool_result\` messages confuses the model about why earlier turns reference data it can no longer see; *re-calling every prior tool* wastes calls on results that may be irrelevant to today's question.

**✅ Strong — structured summary + targeted fresh lookup.** Start from the JSON summary above, see \`fresh_lookup_required: true\`, call \`lookup_invoice\` once, and answer from the *fresh* result. Reliable, cheap, and never anchored to stale data.

---

### External Updates During an Active Conversation

When an external system receives new information mid-chat (a webhook fires: "order shipped"), inject the fresh state into the **next** request. Depending on architecture this may be a system/application context block, an injected state section, or a prefix on the next user turn. The principles:

- Do **not** expect Claude to know about events outside the current request.
- Do **not** generate unsolicited assistant messages unless the product intentionally supports proactive notifications.
- Make the injected state clearly **more authoritative** than stale prior tool results by labeling it: \`"[CURRENT STATE — authoritative as of {timestamp}]"\`.

Rewriting history (editing an old tool result in place to say "shipped") is fragile and misrepresents what was actually returned earlier — prefer an explicit, timestamped authoritative block.

---

### System-Prompt Versioning

When you change a system prompt for users with ongoing multi-session conversations, old context can conflict with the new behavior. A persona shift, a new policy, or a changed tone applied midstream produces visible contradictions — the prior turns still reflect the *old* rules, and sending the new prompt fresh each turn does not erase them.

**Mitigations:**
- **Version** system prompts and associate each conversation record with the version it started under.
- For **major** changes, use a deliberate migration: re-summarize the prior conversation under the new rules when the session resumes.
- For **minor** changes, a brief transition note bridges the gap: "Starting this session, the following policy applies..."

Never assume a system-prompt change is transparent to ongoing conversations.

### Visual: returning-session decision flow

\`\`\`mermaid
flowchart TD
    START["User returns to an old session"]
    RESUME{"Resume the raw transcript?"}
    NO["NO<br/>(stale tool results, anchoring risk)"]
    LOAD["Load STRUCTURED SUMMARY<br/>of prior interaction"]
    CHECK{"fresh_lookup_required?"}
    FRESH["call lookup tool<br/>answer from FRESH result"]
    SUMM["answer from summary<br/>(no current-status claims)"]
    START --> RESUME
    RESUME -->|no| NO
    NO --> LOAD
    LOAD --> CHECK
    CHECK -->|yes| FRESH
    CHECK -->|no| SUMM
\`\`\`

> ❓ **Check yourself:** Mid-chat, a webhook reports the user's order shipped, but the transcript still carries an older tool result saying "processing." Editing that old result in place to say "shipped" looks simplest. Why is that wrong, and what is the correct move?
>
> *(Rewriting history misrepresents what the tool actually returned earlier and is fragile. Instead, inject the fresh state into the next request as an explicit block labeled authoritative as of a timestamp, so it outranks the stale snapshot. The model only sees the current request — it cannot infer out-of-band events — and you should not emit an unsolicited message unless the product supports proactive notifications.)*

### Key takeaways
- Start returning sessions from a **structured summary + targeted fresh lookups**, not a resumed transcript of stale tool outputs.
- Inject **out-of-band updates explicitly** and label them authoritative; the model knows only what the current request contains.
- **Version** system prompts per conversation and migrate deliberately; mid-conversation prompt changes can contradict prior turns.`,
      principles: [
        "Start returning sessions from a structured summary + targeted fresh lookups — never resume raw transcripts.",
        "Inject external updates in the next request with an authoritative timestamp; the model sees only the request.",
        "Version system prompts per conversation and migrate deliberately — mid-session changes contradict prior turns.",
      ],
      pitfalls: [
        "Resuming old transcripts with stale tool outputs — the model may anchor to yesterday's result over newer data.",
        "Relying on \"prefer the most recent tool results\" — not reliable when older results are more detailed.",
        "Changing a system prompt mid-conversation without migration — prior turns still reflect the old rules.",
        "Expecting the model to discover external updates — out-of-band events are invisible until explicitly injected.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-strategy-long-session',
      type: 'mcq',
      scenario: 'A travel planning assistant has a 60-turn conversation. The user stated their budget of $3,500 in turn 2, then refined hotel preferences in turns 12 and 28. The context window is getting crowded. A pure sliding window keeping the last 15 turns is being considered.',
      question: 'What is the primary risk of using a pure sliding window here?',
      options: [
        "The sliding window will be too slow to compute at 60 turns.",
        "The original budget and early preference refinements will be dropped, causing the assistant to lose critical decision context.",
        "The model will refuse to operate with fewer than 60 turns in context.",
        "A sliding window is always fine for travel assistants because users will re-state preferences.",
      ],
      answer: 1,
      explanation: "A pure sliding window drops older messages. Budget ($3,500, stated turn 2) and early preference refinements (turns 12, 28) fall outside the last 15 turns and are lost. The correct approach is hybrid summarization: a structured summary capturing budget, preferences, and decisions, plus verbatim recent turns.",
    },
    {
      id: 'ex-stale-data-returning',
      type: 'mcq',
      scenario: 'A customer support agent handled a billing case yesterday. Today the same user returns. The agent resumes the old conversation transcript, which contains a tool result showing the invoice status as "pending" from yesterday.',
      question: 'What is the best way to handle the returning session?',
      options: [
        "Resume the transcript as-is and add a system prompt note saying \"prefer the most recent tool results.\"",
        "Filter out all tool_result messages from the old transcript before resuming.",
        "Start with a structured summary of the prior interaction and perform a fresh lookup of the invoice status before making claims.",
        "Re-call every tool from the previous session at the start of the new one before responding.",
      ],
      answer: 2,
      explanation: "Starting with a structured summary plus targeted fresh lookups is the most reliable pattern. \"Prefer recent results\" instructions are not reliable. Filtering tool_results confuses the model about references in earlier turns. Re-calling all prior tools wastes calls on potentially irrelevant data.",
    },
    {
      id: 'ex-strategy-match',
      type: 'mcq',
      scenario: 'A workspace-search conversation has run 40 turns. The user revised their monthly budget from $5,000 to $4,200 in turn 18, removed "shared desk" from must-haves in turn 31, and added "bike storage" in turn 38. RAG retrievals from earlier queries are also piling up in context.',
      question: 'Which combination of context strategies best addresses this situation?',
      options: [
        "A pure sliding window over all content — drop everything older than 15 turns to save tokens.",
        "A canonical structured state object for preferences plus a separate sliding window on RAG results, keeping the last 2–3 retrievals.",
        "Progressive summarization of the entire context, including preferences and RAG results, into one prose paragraph.",
        "A persistent reference section containing every message verbatim so nothing is ever lost.",
      ],
      answer: 1,
      explanation: "A canonical structured state object captures current preferences (budget $4,200, must-haves, no_longer_relevant) as explicit truth, preventing stale values from competing. A separate sliding window on RAG results (last 2–3) clears accumulated retrievals without touching conversation history. A pure sliding window would silently drop preference changes. A single prose summary loses exact values. A verbatim reference section of all messages misuses a tool meant for must-stay-exact data.",
    },
    {
      id: 'ex-tool-compression',
      type: 'mcq',
      scenario: 'A customer service agent calls a `lookup_order` tool that returns 45 fields per order. Over an investigation into three separate orders, the agent has accumulated three raw tool results in context. The context window is filling up.',
      question: 'What is the recommended approach?',
      options: [
        "Move all tool results to a vector database and retrieve them semantically.",
        "Summarize all three raw tool results into a single prose paragraph.",
        "Compress each prior tool result to only the fields relevant to the remainder of the conversation, then continue.",
        "Increase the context window limit and keep the raw results.",
      ],
      answer: 2,
      explanation: "Tool-result compression — retaining only the fields needed for the rest of the session after processing — is the right approach. Vector retrieval adds complexity. Prose summaries lose exact IDs and values. Simply expanding the window defers the problem without fixing it.",
    },
    {
      id: 'lab-structured-state',
      type: 'lab',
      title: 'Design a Structured State Object for a Multi-Session Support Bot',
      brief: `You are designing a **multi-session customer support bot** that handles users who return across multiple days. Each session may involve different issues (billing, technical support, account changes). The bot must:

1. Know what happened in prior sessions without replaying raw transcripts.
2. Track each active issue's current status independently.
3. Flag which data needs a fresh lookup before the agent makes claims.
4. Avoid serving stale tool results from old sessions.

**Your task:** Design a **structured state object** (JSON) that this bot would maintain and inject at the start of each session. Include:
- User/account identification fields
- A section for tracking multiple concurrent issues (with status, relevant IDs, resolution state)
- A field indicating when the state was last updated
- A flag for which issues require a fresh lookup before responding
- Any other fields you consider essential

Paste your JSON state object below. The reviewer will evaluate it for completeness, clarity of issue tracking, stale-data handling, and whether it would reliably support returning sessions without resuming raw transcripts.`,
      placeholder: '{\n  "account_id": "...",\n  "last_updated": "...",\n  "issues": {\n    ...\n  },\n  "fresh_lookup_required": [...]\n}',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate structured state object designs for multi-session support bots. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is done well, (3) concrete improvements. Focus on: does the design track multiple concurrent issues independently, does it handle stale data with a fresh-lookup flag, are relevant IDs captured per issue, is the last-updated timestamp present, and would this object reliably support a returning session without resuming a raw transcript.',
      evalTemplate: 'A learner submitted this structured state object design for a multi-session customer support bot:\n\n{{input}}\n\nReview it per your rubric. If it is not valid JSON, say so and show a corrected minimal example. Evaluate: multi-issue tracking, stale-data handling, ID capture, timestamp, and returning-session reliability.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: "A developer insists their chat app needs no context strategy because the model has a 200K-token window and \"everything fits.\" After many turns, users report the assistant ignores details they care about. What is the most accurate diagnosis?",
      options: [
        "The window must have overflowed; the only fix is a larger-window model.",
        "Context capacity is not the same as attention — a large window does not make every detail equally salient, so intentional curation is still required.",
        "The model has a hidden session store that became corrupted between calls.",
        "The system prompt was dropped automatically once the conversation grew long.",
      ],
      answer: 1,
      explanation: "Correct: a large window provides capacity, not reliable recall — long, noisy context degrades quality on what matters, so you must curate. \"The window overflowed; use a larger model\" misframes a salience problem as a sizing problem. \"A hidden session store became corrupted\" is wrong because the Messages API is stateless and keeps no server-side conversation store. \"The system prompt was dropped automatically\" is a different, fabricated failure mode — nothing silently drops it.",
    },
    {
      id: 'q2',
      question: "Which statement best captures the core mental model of conversation context management?",
      options: [
        "The model remembers prior calls through a session_id, so you mainly manage that identifier.",
        "Summarizing everything on every turn is the safest universal strategy.",
        "Context management is state management — the model sees a request, not your database, so you decide what to include each turn.",
        "Once the system prompt is sent on turn one, the model retains it for the rest of the session.",
      ],
      answer: 2,
      explanation: "Correct: because the API is stateless, your application is the state machine and chooses what the model sees each turn. \"Manage the session_id\" is wrong — that ID locates stored history in your system but gives the model no memory. \"Summarize everything\" is wrong because summaries lose exact facts, which is exactly why retrieval and structured state exist. \"The prompt is retained after turn one\" is false — it must be resent every request.",
    },
    {
      id: 'q3',
      question: "Production logs for a support chatbot show 94% of user messages only reference the previous 3–5 exchanges, and the remaining 6% ask for information users could easily re-state. Responses have gotten slow and noisy. What is the most appropriate strategy?",
      options: [
        "A pure sliding window keeping the last 8–10 turns plus the system prompt.",
        "Progressive structured summarization of the entire history on every turn.",
        "A persistent reference section holding every prior message verbatim.",
        "A canonical structured state object tracking each message as a separate issue.",
      ],
      answer: 0,
      explanation: "Correct: this traffic profile is exactly where a sliding window shines — older context is rarely needed, so keeping the last 8–10 turns plus the system prompt restores speed and quality, and the rare reach-back can be handled by asking the user to re-state. \"Summarize the entire history every turn\" adds cost and complexity the profile does not justify. \"A reference section of every message verbatim\" misuses a tool meant for must-stay-exact data, not bulk chat history. \"Track each message as a separate issue\" misapplies structured state, which tracks evolving preferences or issues, not message recency.",
    },
    {
      id: 'q4',
      question: "An assistant accumulates RAG retrievals from many earlier queries, and they are crowding out turn-by-turn coherence. The conversation history itself is fine. What is the recommended fix?",
      options: [
        "Aggressively deduplicate and merge all retrievals into a single combined digest.",
        "Move the entire conversation, including history, to a tighter sliding window.",
        "Apply a sliding window specifically to the RAG results (keep the last 2–3) while preserving conversation history under its own policy.",
        "Stop retrieving and rely on the model to recall earlier retrieved passages.",
      ],
      answer: 2,
      explanation: "Correct: window the retrieved results separately — keep the last 2–3 — while conversation history keeps its own policy. \"Merge all retrievals into one digest\" is more complicated and rarely better. \"Tighten the whole conversation window\" punishes coherent history that was not the problem. \"Stop retrieving and rely on the model to recall\" fails because the model only sees what the current request contains — dropped passages are simply gone.",
    },
    {
      id: 'q5',
      question: "A team writes progressive summaries by prompting the model to \"summarize the conversation so far.\" Later a user asks \"what budget did we agree on?\" and the assistant cannot answer. What is the underlying mistake?",
      options: [
        "Summaries should never be used; only verbatim transcripts preserve meaning.",
        "The summary is vague free prose; it should be a structured extraction of decisions, current preferences, open questions, and key facts.",
        "The summary was generated in the same call as the response instead of a separate one.",
        "The sliding window was too small, so the budget turn was dropped before summarizing.",
      ],
      answer: 1,
      explanation: "Correct: the fix is structure — a good summary explicitly extracts decisions, current preferences, open questions, and key facts, so the exact budget survives. \"Summaries should never be used\" is wrong; structured summaries are the right tool for long-term continuity. \"Generated in the same call\" is an implementation detail, not the failure here — vague content is. \"The window was too small\" is not what is described; the summary itself blurred the value rather than dropping the turn.",
    },
    {
      id: 'q6',
      question: "A product-design assistant hits its context limit around turn 25. An engineer proposes raising the sliding window from 25 to 50 turns, but decisions and stated preferences from early turns must survive long-term. What is the better design?",
      options: [
        "Raise the window to 50 turns as proposed; it doubles the available history.",
        "Switch to a pure sliding window of 10 turns to save the most tokens.",
        "Keep the full transcript and let a larger context window absorb it.",
        "Adopt hybrid summarization: structured summaries of older turns plus verbatim recent turns.",
      ],
      answer: 3,
      explanation: "Correct: hybrid summarization preserves long-term continuity at much lower token cost by replacing older turns with structured summaries while keeping recent turns verbatim. \"Raise to 50 turns\" only defers the limit and still eventually drops the early decisions. \"A 10-turn pure window\" discards the early preferences even faster. \"Keep the full transcript\" reintroduces the cost and attention problems that caused the limit in the first place.",
    },
    {
      id: 'q7',
      question: "A cooking assistant must remember a guest's nut allergy and a \"scale all recipes to 8 servings\" instruction while the conversation rambles about timing and plating. What design protects the critical facts?",
      options: [
        "Run a single progressive-summarization pass over the entire conversation, including the allergy and serving count.",
        "Use a pure sliding window so only the most recent cooking discussion remains.",
        "Extract the allergy, serving count, and user-defined terms into a retained reference section; summarize general discussion and keep recent turns verbatim.",
        "Add a system-prompt line saying \"always remember the allergy and serving count.\"",
      ],
      answer: 2,
      explanation: "Correct: a retained reference section keeps critical, must-stay-exact data stable at the start of context, while trimming and summarization apply only to the ephemeral chatter. \"A single summarization pass over everything\" risks blurring the exact serving count and could drop the allergy. \"A pure sliding window\" silently loses the allergy once it ages out. \"A prompt instruction to always remember\" helps salience but is not a reliable guarantee for safety-critical facts.",
    },
    {
      id: 'q8',
      question: "A workspace-search user says budget is $4,200, then later raises must-haves, then drops a \"shared desk\" requirement across a long session. The team wants the model to always act on current truth. What is the most reliable mechanism?",
      options: [
        "Add a system-prompt rule: \"always prioritize the most recently stated preferences.\"",
        "Keep every turn in context so the model can infer the latest values itself.",
        "Provide few-shot examples of the assistant correctly applying preference changes.",
        "Maintain a canonical structured state object reflecting current truth, updating it on every change and injecting it on every request.",
      ],
      answer: 3,
      explanation: "Correct: a canonical state object updated on each change and injected every request gives the model a single source of truth — the most reliable option. \"Prioritize most recent\" usually works but is not reliable enough to bet on. \"Keep every turn so the model infers the latest values\" is exactly the error structured state exists to avoid, since old and new values coexist. \"Few-shot examples\" shape framing but provide no single authoritative current state.",
    },
    {
      id: 'q9',
      question: "During an investment-advice session a user says \"I have very low risk tolerance\" and later \"I want to maximize returns like my friends did with crypto.\" How should the agent proceed?",
      options: [
        "Surface the contradiction and ask which priority should govern.",
        "Silently follow the most recent statement and steer toward high-risk crypto.",
        "Average the two goals into a moderate, balanced recommendation.",
        "Silently keep the earliest stated preference and recommend conservative options.",
      ],
      answer: 0,
      explanation: "Correct: the goals are genuinely incompatible, so the agent should surface the conflict and let the user decide which priority governs. \"Silently follow the most recent statement\" assumes recency equals intent, which the guidance warns against. \"Average into a balanced recommendation\" risks something that fits neither stated preference. \"Silently keep the earliest preference\" is equally arbitrary and hides the real tension from the user.",
    },
    {
      id: 'q10',
      question: "A support agent handles a refund, a subscription question, and a payment update for one customer across 45 turns. Later the user asks \"what happened with my refund?\" What design makes this reliably answerable?",
      options: [
        "A sliding window keeping only the last few turns of the linear conversation.",
        "A single prose summary blending all three issues into one paragraph.",
        "A structured state object tracking each issue independently (order ID, amounts, resolution state).",
        "Relying on the model to scan the full transcript and locate the refund turns.",
      ],
      answer: 2,
      explanation: "Correct: structured state scales to multi-issue sessions by tracking each issue's status, IDs, and amounts independently of the linear flow, so the refund status is directly queryable at any point. \"A sliding window of the last few turns\" would drop the refund turns once they age out. \"A blended prose summary\" loses the per-issue IDs and resolution states. \"Relying on the model to scan the whole transcript\" is unreliable and exactly what structured state replaces.",
    },
    {
      id: 'q11',
      question: "A research assistant summarizes paper discussions after 8 turns to control context. A user then asks for the exact sample size and p-value from one paper. What is the most scalable design response?",
      options: [
        "Rewrite the summaries as high-fidelity versions that preserve every number from each paper.",
        "Move all paper content into a vector database and retrieve semantically for every question.",
        "Instruct the model to recall the exact figures from the earlier summary.",
        "Re-inject the relevant source section on demand when the question signals precision is needed.",
      ],
      answer: 3,
      explanation: "Correct: on-demand source retrieval scales best — inject only the section the precision-signaling question needs, rather than carrying every number forever. \"High-fidelity summaries\" balloon back toward the full document, defeating the purpose of summarizing. \"A vector database for every question\" is heavier and may not match the variety of structured numerical follow-ups. \"Instruct the model to recall the figures\" fails because the summary already blurred them — precision must come from the source.",
    },
    {
      id: 'q12',
      question: "A customer-service agent has called a lookup_order tool three times during an investigation, each returning 40+ fields, and the raw results now dominate the context. What is the recommended approach before making more lookups?",
      options: [
        "Summarize all three raw results into a single prose paragraph.",
        "Compress each prior result to only the fields needed for the remainder of the session, then continue.",
        "Move the raw results into a vector database and retrieve them when needed.",
        "Keep accumulating raw results and request a higher context limit.",
      ],
      answer: 1,
      explanation: "Correct: tool-result compression — reducing each processed result to the fields needed for the rest of the conversation — keeps exact IDs and values while reclaiming space. \"A single prose paragraph\" loses the precise order IDs and amounts the agent still needs. \"A vector database\" adds complexity and often misses structured lookups. \"Keep accumulating and raise the limit\" just runs into the context limit again, which is the problem being solved.",
    },
    {
      id: 'q13',
      question: "A user returns the next day to a billing case. Yesterday's transcript contains a tool result showing the invoice as \"pending.\" What is the most reliable way to start the new session?",
      options: [
        "Resume the transcript and add a system-prompt note to \"prefer the most recent tool results.\"",
        "Filter out all tool_result messages from the old transcript before resuming.",
        "Re-call every tool used in the previous session at the start of the new one.",
        "Start with a structured summary of the prior interaction and perform targeted fresh lookups before claiming current status.",
      ],
      answer: 3,
      explanation: "Correct: a structured prior-interaction summary plus targeted fresh lookups (signaled by a fresh_lookup_required flag) is the reliable pattern, because tool results age and stale outputs must not drive new claims. \"Prefer the most recent results\" is unreliable when older results are more detailed. \"Filter out tool_results\" confuses the model about why earlier turns reference data it can no longer see. \"Re-call every prior tool\" wastes calls on results that may be irrelevant to the new question.",
    },
    {
      id: 'q14',
      question: "While a chat is active, a webhook reports that the user's order has shipped. The current transcript still contains an older tool result saying \"processing.\" How should the system handle the update?",
      options: [
        "Do nothing and wait for the user to ask, since the model will infer the change from context.",
        "Inject the fresh state into the next request, labeled as authoritative as of a timestamp so it outranks the stale \"processing\" result.",
        "Generate an unsolicited assistant message immediately announcing the shipment.",
        "Edit the old tool result in place to say \"shipped\" and resend the transcript.",
      ],
      answer: 1,
      explanation: "Correct: the model only knows what the next request contains, so the fresh state must be injected explicitly and labeled authoritative (with a timestamp) to clearly outrank the stale prior result. \"Do nothing and wait\" assumes the model can discover out-of-band events, which it cannot. \"Generate an unsolicited message\" is inappropriate unless the product intentionally supports proactive notifications. \"Edit the old result in place\" rewrites history, is fragile, and misrepresents what was actually returned earlier.",
    },
    {
      id: 'q15',
      question: "You roll out a new system prompt with a changed support policy and tone. Many users have ongoing multi-session conversations started under the old prompt. What is the primary risk and the right mitigation?",
      options: [
        "There is no risk because the system prompt is sent fresh on every request, so behavior updates cleanly.",
        "The new prompt will retroactively rewrite the old conversation logs; archive them first.",
        "Prior context reflects the old behavior and can contradict the new prompt; version prompts per conversation and use a deliberate migration (or a brief transition note).",
        "The model will refuse to run when the conversation version and prompt version differ.",
      ],
      answer: 2,
      explanation: "Correct: earlier conversation content reflects the old persona and policy, so applying new rules midstream produces visible contradictions; the mitigation is versioning prompts per conversation and migrating deliberately, with a transition note for minor changes. \"No risk because the prompt is sent fresh\" ignores the contradicting prior turns still in the messages array. \"The new prompt rewrites old logs\" is false — the conflict is between old content and new behavior, not log mutation. \"The model refuses on version mismatch\" is not a real failure mode.",
    },
  ],
}
