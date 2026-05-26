export default {
  id: 'batch-cost-latency',
  num: 12,
  title: 'Batch Processing, Cost, and Latency',
  summary: 'Master the Message Batches API, understand the 50% cost discount and 24-hour window, and learn to design SLAs, optimize costs with prompt caching and model selection, and balance throughput against interactive latency.',
  estMinutes: 30,
  tags: ['Batching', 'Cost', 'Latency'],

  lessons: [
    {
      id: 'batch-fundamentals',
      title: 'The Message Batches API: When and How to Use It',
      minutes: 8,
      body: `> **TL;DR** — The Message Batches API trades immediacy for economy: submit many independent requests at once, pay roughly half, and wait up to 24 hours for results matched back by \`custom_id\`.

Batch processing decouples submission from results. You hand the API a collection of independent requests and it processes them asynchronously in the background; you do not hold a connection open per request. That asynchrony is exactly what buys the discount — by relinquishing immediacy, you let the backend schedule the work when capacity is available. Results come back unordered, so each request carries a client-chosen \`custom_id\` that you join on afterward. Treat it like a coat-check ticket: you reclaim work by ticket, never by the order you submitted it.

### What batching actually is

The **Message Batches API** lets you submit a collection of independent Messages API requests for *asynchronous* processing. Instead of blocking on each response, you bundle many requests, submit them once, and either poll for status or receive a webhook when the batch finishes. Each request inside the batch supports the same general shape as a normal Messages API call — \`model\`, \`messages\`, \`system\`, \`tools\`, \`max_tokens\` — and each carries a client-chosen \`custom_id\`.

### The two numbers that define batch economics

| Property | Value | Why it matters |
|---|---|---|
| **Cost discount** | ~50% off equivalent on-demand pricing | The savings compound enormously at scale |
| **Maximum processing window** | 24 hours | A hard ceiling — design SLAs around this worst case |

The discount is compelling; the window is a hard constraint. Many batches finish far sooner than 24 hours, but you **cannot rely on that** — design around the worst case, not the typical case. Batching is **not** a drop-in replacement for real-time calls. It is a different execution model with fundamentally different latency guarantees.

### Anatomy of a batch request

Each item in a batch carries a \`custom_id\` (chosen by your application) and a full Messages API request body:

\`\`\`json
{
  "requests": [
    {
      "custom_id": "doc-record-8842",
      "params": {
        "model": "claude-opus-4-5",
        "max_tokens": 1024,
        "messages": [{ "role": "user", "content": "Summarize this report..." }]
      }
    },
    {
      "custom_id": "doc-record-8843",
      "params": {
        "model": "claude-opus-4-5",
        "max_tokens": 1024,
        "messages": [{ "role": "user", "content": "Summarize this report..." }]
      }
    }
  ]
}
\`\`\`

### Statuses and per-request outcomes

A batch moves through processing states such as **in_progress** (actively processing), **canceling** (a cancel was requested, still winding down), and **ended** (all requests resolved — though some may be errors). Within a batch, each individual request can independently **succeed**, **error**, be **canceled**, or **expire**. A healthy "ended" batch does not mean every request succeeded; you must inspect per-request outcomes.

### Weak vs strong: reconciling results

**❌ Weak — match by position**
\`\`\`mermaid
flowchart LR
    R0["result_line 0"] -->|"maps to (WRONG)"| I0["input_record 0"]
    R1["result_line 1"] -->|"maps to (WRONG)"| I1["input_record 1"]
    note["JSONL order is NOT guaranteed<br/>Positional join silently corrupts data"]
\`\`\`
Results come back as **JSONL** (one JSON object per line) and the order is **not guaranteed to match input order**. Positional joins silently attach extracted fields to the wrong source records — a data-corruption bug that passes every "it ran" check.

**✅ Strong — match by \`custom_id\`**
\`\`\`python
for result in jsonl_results:
    record = db.lookup(result["custom_id"])  # join on the stable key
    record.apply(result["output"])
\`\`\`
Use a **stable, unique** identifier — typically the primary key of the source record. Re-running a failed subset then becomes trivial: you already know exactly which IDs need a retry.

### Visual aid: result reconciliation

\`\`\`mermaid
flowchart LR
    subgraph IN["INPUT (your order)"]
        A["custom_id: rec-A"]
        B["custom_id: rec-B"]
        C["custom_id: rec-C"]
    end
    subgraph OUT["BATCH RESULT (JSONL, any order)"]
        D["custom_id: rec-C ..."]
        E["custom_id: rec-A ..."]
        F["custom_id: rec-B ..."]
    end
    IN -->|"submitted"| OUT
    OUT --> J["Join on custom_id<br/>NEVER on line number"]
\`\`\`

### Validate before you commit a large batch

A single malformed request inside a batch does **not** abort the whole batch — it produces a per-request error you must reconcile afterward. So validate your request shape against the standard Messages API on a small sample **before** submitting thousands of items. The cost of a validation run is orders of magnitude smaller than discovering a schema bug in a 100k-item batch result. Batches also have **platform limits** on request count and payload size, so large pipelines must be split into multiple batches — build orchestration that tracks which batch IDs contain which \`custom_id\` ranges.

> ❓ **Check yourself:** A batch reaches the \`ended\` status with no API errors, so a teammate marks the whole job complete and writes every result to the database. What did they miss?
>
> *(\`ended\` only means every request resolved — individually some may have errored, expired, or been canceled. They must inspect per-request outcomes and reconcile failures, not treat batch-level \`ended\` as per-request success.)*

### Key takeaways
- Batch saves ~50% but carries a hard **24-hour** window — design SLAs around the worst case, not the average.
- Match every result to its source by **\`custom_id\`**, never by position.
- A malformed request errors *that request only*; **validate on a small sample first**, and split large jobs across multiple batches.`,
      principles: [
        "Batch saves ~50% but has a hard 24-hour window — design SLAs around the worst case, not the average.",
        "Match results to inputs by `custom_id`, never by position — JSONL order is not guaranteed.",
        "Validate request shape on a small sample first — schema bugs in a large batch cost far more to fix.",
      ],
      pitfalls: [
        "Using batch for interactive workflows — the 24-hour worst case makes it categorically wrong for waiting users.",
        "Joining results by position instead of `custom_id` — JSONL order is not guaranteed and silently corrupts data.",
        "Re-using or duplicating `custom_id` values makes reconciliation ambiguous and targeted retry impossible.",
        "Skipping validation on a small sample — a malformed block can fail every request in a large batch.",
      ],
    },
    {
      id: 'batch-fit',
      title: 'Choosing Batch vs Real-Time: Fit Criteria and SLA Design',
      minutes: 8,
      body: `> **TL;DR** — Batch vs real-time is a *latency and SLA* decision first and a cost decision second; size your submission cadence as SLA minus the 24-hour window minus your post-processing buffer, and design for the slowest record.

The choice is governed by latency tolerance, not price. A real-time call returns in seconds but at full cost; batch costs roughly half but adds two delays in series — the wait until the next submission fires, plus up to 24 hours of processing. So the decision rule is not "which is cheaper" but "can this result wait?" The cost discount only becomes relevant once you have confirmed the SLA can absorb the worst-case delay. And because a continuous stream means some record always arrives just after a submission, you size cadence for that tail record, not the average.

### When batch is a good fit

| Criterion | Why it matters |
|---|---|
| High volume of independent requests | Each request is self-contained; no result feeds the next |
| Results not needed immediately | The workflow can absorb hours of delay |
| SLA allows for the 24-hour window | You can design your cadence around the worst case |
| Cost reduction is a priority | The ~50% discount compounds significantly at scale |

### When batch is a poor fit

| Criterion | Why batch fails here |
|---|---|
| A user is waiting interactively | Even a 60-second wait is too long, let alone 24 hours |
| Alerts or business actions have short deadlines | Batch latency could miss the window entirely |
| Each step depends on the previous result | Batch requests are independent; chained logic needs real-time |
| Humans need immediate feedback to continue | Reviewers cannot wait for a batch to tell them what to fix |

### SLA arithmetic: the cadence formula

When records arrive continuously, you need a **submission cadence** — how often you gather pending records and submit a new batch. The worst-case latency for any single record is:

> **worst-case latency = (time until next submission) + (batch processing time, up to 24 h) + (post-processing)**

Rearranging to find the maximum safe interval between submissions:

> **max cadence = SLA − batch window (24 h) − post-processing buffer**

Work backward from your SLA:

**Example 1 — 36-hour SLA, 6-hour buffer:** 36 − 24 − 6 = **6 hours**. Submit at most every 6 hours. A record arriving one second after a submission waits 6 h for the next bus, then up to 24 h to process, then 6 h downstream — exactly 36 h, right at the boundary.

**Example 2 — 30-hour SLA, 6-hour buffer:** 30 − 24 − 6 = **0 hours**. The margin is gone; submission must be effectively continuous (in practice a very tight cadence such as every 30 minutes) and batch is barely viable.

**Example 3 — 26-hour SLA, 2-hour buffer:** 26 − 24 − 2 = **0 hours**. Same story — almost no room. Tightening the cadence costs more API calls and orchestration but is the only way to honor a tight SLA against the 24-hour ceiling.

The **slowest record** sets the worst case, not the average. "Submit once a day" is only safe when the SLA is at least **48 hours** and you can absorb tail latency.

### Visual aid: the tail record's journey

\`\`\`mermaid
flowchart TD
    R["Record arrives 1s after a submission"]
    R --> W["Wait for next batch run<br/>up to ONE full cadence interval"]
    W --> P["Batch processing<br/>up to 24 h"]
    P --> B["Post-processing buffer"]
    B --> T["= Total worst-case latency"]
\`\`\`

### Weak vs strong: choosing a cadence for a 36-hour SLA

**❌ Weak** — "The average batch finishes in 4 hours, so submitting once a day is plenty." This designs around the median and ignores both the 24-hour worst case and the up-to-24-hour wait a tail record endures before the next daily run. Tail records blow the SLA.

**✅ Strong** — Apply the formula: 36 − 24 − 6 = 6 h, so submit at least every 6 hours. The slowest possible record still lands inside 36 hours. The design survives the worst case, not just the lucky one.

### Failure handling: resubmit only failures

When a batch finishes with a small percentage of errors, do **not** rerun the entire batch. Handle by failure type:

- **context_length_exceeded** — chunk only the failed inputs, then merge partial extractions.
- **Validation failure** — resubmit the failed records with the validation-error feedback in the prompt.
- **Prompt/schema issue** — refine the prompt and resubmit affected \`custom_id\`s.
- **Expired or canceled** — collect incomplete \`custom_id\`s and resubmit only those.

Tracking per-\`custom_id\` status in your own database makes targeted resubmission straightforward.

> ❓ **Check yourself:** Your batches finish in about 4 hours on average, so a teammate sets cadence using 4 h instead of the 24-hour ceiling, and measures latency from the average record rather than the one that just missed a submission. Which two errors will blow the SLA?
>
> *(Sizing cadence on the average finish time instead of the 24-hour worst case, and measuring the average record instead of the tail record that waits a full cadence interval before the next submission. Cadence must use SLA − 24 h − buffer and be designed for the slowest record.)*

### Key takeaways
- Latency and SLA dominate the batch-vs-real-time decision; cost is the secondary benefit once latency is acceptable.
- **Cadence = SLA − 24 h window − buffer.** Design for the slowest record, not the median.
- On partial failure, resubmit **only the failed \`custom_id\`s** — never the whole batch.`,
      principles: [
        "SLA fit dominates the batch-vs-real-time decision; the ~50% cost discount is a secondary benefit.",
        "Cadence = SLA − 24 h window − post-processing buffer — design for the tail record, not the median.",
        "On partial failure, resubmit only the failed `custom_id`s — rerunning successes wastes cost.",
      ],
      pitfalls: [
        "Choosing batch for cost without confirming the 24-hour window fits the SLA — tight SLAs will miss deadlines.",
        "Setting cadence by gut feel — a tail record waits the full interval before the next batch submission.",
        "Rerunning an entire batch when only a fraction failed — collect failed `custom_id`s and resubmit only those.",
        "Using batch for chained workflows where each step needs the previous result — batch items are independent.",
      ],
    },
    {
      id: 'cost-optimization',
      title: 'Cost Optimization: Prompt Caching, Token Budgeting, and Model Selection',
      minutes: 8,
      body: `> **TL;DR** — Three multiplicative levers cut cost — prompt caching of stable prefixes, token budgeting of every category, and using the smallest model that meets the quality bar — but none of them extends a context window or reduces synchronous latency.

Cost is a function of tokens processed times per-token price, and the three levers attack different factors. Prompt caching removes the cost of *reprocessing* a stable prefix that repeats across requests — a 20k-token system prompt sent 200,000 times is paid for roughly once instead of 200,000 times. Token budgeting shrinks the raw token count per request. Model selection lowers the per-token price. They compose multiplicatively, so applying all three can drop per-request cost by an order of magnitude. Crucially, all three operate on cost only: none enlarges the context window, and none makes a synchronous response arrive sooner.

### Lever 1: Prompt caching

Prompt caching marks a segment of the prompt (typically the system prompt or a large shared context) as a **cache candidate**. When subsequent requests share the same prefix up to the cache breakpoint, the cached portion is not reprocessed from scratch.

- The cache is keyed on the **exact byte sequence** up to the breakpoint. **A single character change busts the cache.**
- It is most effective for **high-cardinality request streams** that share a large static prefix (e.g., a 20k-token legal corpus + a varying question, sent 1,000 times per day).
- It does **not** solve context-limit problems — caching a shared prefix does not make the window larger.
- It does **not** reduce real-time latency below synchronous response time. If you need results in seconds, both batch discount and cache savings are irrelevant to that requirement.

\`\`\`json
{
  "system": [
    {
      "type": "text",
      "text": "You are a legal extraction assistant...[20k tokens of stable policy text]",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [{ "role": "user", "content": "Extract parties from: ..." }]
}
\`\`\`

### Lever 2: Token budgeting

Every token is a cost unit. The main budget categories:

| Category | Example | Mitigation |
|---|---|---|
| System prompt | 500–5,000 tokens | Minimize verbose instructions; move static context to cache |
| Tool/schema definitions | ~2,500 tokens for a 12-field tool | Include only tools relevant to the current step |
| Input documents | Varies widely | Chunk and filter; send only relevant sections |
| Output tokens | Proportional to response length | Cap with \`max_tokens\`; prefer structured output over prose |

**Step-scoped tools:** in a multi-step pipeline, do not include every tool in every step — send only the tools relevant to the current stage. Beyond saving tokens, this **improves model behavior**: fewer irrelevant tools means less ambiguity about which one to call.

### Lever 3: Model selection

Smaller models are dramatically cheaper and faster. The decision rule: **use the smallest model that reliably meets the task quality bar.**

- Test quality across your **real distribution of inputs**, not just easy examples.
- For high-volume extraction: pilot with a smaller model; escalate only when the quality gap is measurable and costly.
- For interactive chat: latency often matters more than throughput, so a faster smaller model may be preferable even if slightly lower quality.

### Weak vs strong: a 200k-document nightly extraction job

**❌ Weak** — Opus on every request, all 7 tools included even though each document type uses only 2, the 15k-token system prompt resent and reprocessed 200,000 times, no caching. You pay full price to re-typeset the same book 200,000 times *and* carry ~12,500 tokens of unused tool schema per request.

**✅ Strong** — cache the stable 15k-token system prefix so it is effectively paid once across the run; include only the 2 relevant tools per request (removing ~12,500 tokens each); submit via batch for the ~50% discount; and pilot a smaller model, validating quality on the real input mix before committing. Each lever attacks a different cost category and they **multiply**.

### Visual aid: where the tokens (and savings) live

\`\`\`mermaid
flowchart LR
    subgraph WEAK["Per-request tokens - weak"]
        W1["System prompt: 15,000 tokens"]
        W2["7 tool schemas: 17,500 tokens"]
        W3["Document: 1,000 tokens"]
        W4["Output: 500 tokens"]
    end
    subgraph STRONG["Per-request tokens - strong"]
        S1["System prompt: ~0 tokens (cached)"]
        S2["2 tool schemas: ~5,000 tokens"]
        S3["Document: 1,000 tokens"]
        S4["Output: 500 tokens"]
    end
    WEAK -->|"cache prefix<br/>prune tools<br/>batch discount ~50%<br/>validated smaller model"| STRONG
\`\`\`

### What these levers do NOT fix

- A request that exceeds the context window → caching cannot extend the window (chunk/filter instead).
- A workflow that needs sub-second latency → caching does not eliminate network and generation time.
- Quality problems → a cheaper model with caching can be cheaper *and* worse; validate quality separately.

> ❓ **Check yourself:** Caching cut your bill, so the team expects the interactive endpoint that shares the cached prefix to also return faster and to fit a document that previously overflowed the context window. Will either hold?
>
> *(No on both. Caching only discounts reprocessing a repeated prefix — it does not enlarge the context window, so the over-length request still will not fit, and it does not shorten generation or network time, so the synchronous response is no faster. Chunk or filter the input for the window; these are cost levers, not latency or capacity levers.)*

### Key takeaways
- Prompt caching, token budgeting, and model selection are **multiplicative** — apply all three.
- Use the **smallest model that reliably meets the quality bar**, validated on the real input distribution.
- Caching reduces cost on **repeated prefixes**; it does not extend context windows or cut synchronous latency.`,
      principles: [
        "Caching, token budgeting, and model selection are multiplicative — each attacks a different cost category.",
        "Use the smallest model that reliably meets the quality bar, validated on the real input distribution.",
        "Caching cuts cost on repeated prefixes but does not extend the context window or reduce synchronous latency.",
      ],
      pitfalls: [
        "Any per-request change to the shared prefix (e.g., a timestamp) busts the cache and yields near-zero hit rate.",
        "Including all tools in every step inflates token cost and reduces model focus — scope the tool list per step.",
        "Downgrading models without validating on real inputs — edge cases in production may silently fail.",
        "Conflating cost and latency optimization — caching cuts cost but does not make responses arrive sooner.",
      ],
    },
    {
      id: 'throughput-vs-interactivity',
      title: 'Throughput vs Interactivity: Designing for the Right Trade-off',
      minutes: 6,
      body: `> **TL;DR** — Throughput and interactivity are different axes: optimize batch jobs for cost and volume, optimize interactive UIs for *time to first token*, and ask "does a human need this result before they can do the next thing?" to place any workload correctly.

Throughput and per-request latency are independent axes, and optimizing one does little for the other. Batch maximizes aggregate volume per dollar by sacrificing individual response time; interactive serving minimizes the latency a single user perceives, which is dominated by *time to first token*, not total generation. The common failure is conflating the two — routing latency-sensitive traffic through batch to chase the discount, or paying real-time prices for bulk overnight work that no one is waiting on. The placement test is whether a human is blocked on the result before they can proceed.

### The spectrum

| Mode | Optimize for | Typical latency | Use case |
|---|---|---|---|
| **Batch offline** | Cost, throughput | Hours to 24 h | Nightly document indexing, report generation |
| **Batch near-real-time** | Cost with some latency tolerance | Minutes to hours | Periodic extraction pipelines, moderation queues |
| **Synchronous async** | Moderate latency, high concurrency | Seconds to ~60 s | Background enrichment, non-blocking UI tasks |
| **Synchronous streaming** | Perceived latency (time to first token) | Sub-second time to first token | User-facing chat, interactive assistants |

### Latency components to understand

**Time to first token (TTFT)** — how quickly the stream starts. Reduced by smaller input (fewer tokens to encode), smaller models (faster prefill), and enabling streaming.

**Time to last token (TTLT) / total generation time** — how long until the response is complete. Dominated by output token count and model size.

For interactive UIs, **TTFT often matters more than TTLT**: once tokens start streaming, the user sees progress and the response *feels* fast even if full generation takes a few seconds. The two metrics are not locked together — cutting total generation time does not necessarily make the first token arrive sooner.

### Weak vs strong: tuning a user-facing chat assistant

**❌ Weak** — the engineer pours effort into shrinking total generation time (TTLT) and ignores TTFT, even routing the assistant through batch on quiet nights to save cost. The user stares at a blank screen waiting for the batch — or waiting for the full response to finish generating before anything appears. It *feels* broken.

**✅ Strong** — keep the assistant on synchronous **streaming**, cache the stable system prompt to cut input-processing time, and optimize **TTFT** so the first tokens appear sub-second. Generation can take a few more seconds; the user already sees the answer forming and perceives it as fast.

### Visual aid: place the workload

\`\`\`mermaid
flowchart TD
    Q{"Does a human need this result<br/>before they can do the next thing?"}
    Q -->|yes| RT["Real-time streaming<br/>Optimize time to first token, cache prefix<br/>e.g. chat assistant, interactive refinement"]
    Q -->|no| BT["Batch viable<br/>Optimize cost and throughput<br/>e.g. nightly index build, bulk enrichment, offline reports"]
\`\`\`

### Mixing both modes in one system

Many production systems legitimately run **both** modes for different task classes: interactive refinement and user feedback go real-time; bulk pre-processing, index building, and offline enrichment go batch; background jobs kicked off by user actions with delayed delivery use batch with webhook notification. The deciding question is always whether a human is blocked. **Expediting "urgent" items inside a batch defeats the purpose** — batch processing latency is the very reason urgent items cannot use it.

### Scaling each axis

When **batch throughput** is the bottleneck: parallelize submission (run multiple batches concurrently), shard by \`custom_id\` ranges so each shard reconciles independently, and track per-shard status so partial failures stay isolated.

When **real-time latency** is the bottleneck: enable streaming for perceived speed, cache the system prompt to cut input processing, and move non-critical context out of the prompt into a retrieval step that runs only when needed.

> ❓ **Check yourself:** A chat assistant runs on batch overnight to save money, with an "urgent" flag that jumps flagged messages to the front of the batch queue. Users still wait far too long. Why can't the flag fix this?
>
> *(The wait is the batch processing window itself — up to 24 hours — not queue position, so reordering within the batch changes nothing for a waiting human. Interactive traffic must run synchronously with streaming, optimized for time to first token; expediting inside a batch contradicts the reason batch is cheap.)*

### Key takeaways
- Ask "**does a human need this result before they can do the next thing?**" — yes means real-time, no means batch is viable.
- For interactive UIs, **time to first token** usually matters more than total generation time.
- Large systems often use **both** modes by task class; never expedite urgent items inside a batch.`,
      principles: [
        "\"Does a human need this before doing the next thing?\" — yes means real-time; no means batch is viable.",
        "For interactive UIs, time to first token usually matters more than total generation time — tokens streaming feel fast.",
        "Large systems legitimately run both modes by task class; never expedite urgent items inside a batch.",
      ],
      pitfalls: [
        "Routing user-facing requests through batch to save cost — the 24-hour window makes this categorically wrong.",
        "Tuning total generation time for chat while ignoring time to first token — users perceive speed from when the first token arrives.",
        "Treating throughput and latency as one axis — batch parallelism scales volume, not individual response time.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-batch-vs-realtime',
      type: 'mcq',
      scenario: 'A financial services company processes 500,000 loan application documents per day. Each document must be extracted into structured fields (income, liabilities, credit score range). A compliance officer reviews results the following morning. Processing time for the full set takes about 8 hours with batch. The SLA is 18 hours from document submission to review-ready.',
      question: 'Which processing strategy is most appropriate?',
      options: [
        'Synchronous real-time calls for every document to minimize latency.',
        'Message Batches API with a submission cadence designed around the 18-hour SLA.',
        'Streaming API calls with parallel workers to maximize throughput.',
        'Real-time calls during business hours, no processing overnight.',
      ],
      answer: 1,
      explanation: 'This is a textbook batch use case: high volume, independent requests, results needed the next morning (not immediately), and cost reduction is valuable at 500k docs/day. The SLA arithmetic: 18 h SLA − 8 h batch worst-case − buffer leaves room for a reasonable cadence. Real-time calls would work but at roughly 2x the cost with no user-experience benefit since no one is waiting synchronously.',
    },
    {
      id: 'ex-cost-reduction-tactics',
      type: 'mcq',
      scenario: 'A team runs a nightly batch that extracts metadata from 200,000 articles using a 15k-token shared legal system prompt, 1k-token article, and a 7-tool schema (only 2 tools are used per article type, but all 7 are included in every request). They want to reduce cost without degrading quality.',
      question: 'Which combination of changes will have the highest cost impact?',
      options: [
        'Enable streaming and increase max_tokens.',
        'Apply prompt caching to the shared system prompt and include only the 2 relevant tools per request.',
        'Switch from JSONL result processing to a database for result storage.',
        'Reduce the number of articles processed per night.',
      ],
      answer: 1,
      explanation: 'Prompt caching eliminates repeated processing of the 15k-token system prompt — effectively paying for it once across 200,000 requests. Including only 2 relevant tools instead of 7 removes ~12,500 tokens of tool-schema overhead per request (roughly 5x the article size). These two changes together attack the two largest token categories. Streaming and result storage do not affect token cost; processing fewer articles defeats the business purpose.',
    },
    {
      id: 'ex-batch-concepts-match',
      type: 'mcq',
      scenario: 'A batch job returns JSONL results. The engineer loops over the result file and pairs the Nth result line with the Nth input record. After running, extracted fields are found attached to the wrong source records.',
      question: 'Which statement best explains both the root cause and the correct fix?',
      options: [
        'JSONL result order is not guaranteed to match input order; the fix is to join each result to its source by custom_id, never by position.',
        'The batch silently dropped records causing an off-by-one shift; the fix is to resubmit the full batch.',
        'JSONL cannot preserve field names so positional matching is the only option; the fix is to add explicit field headers.',
        'The batch API returns results sorted by model confidence; sort inputs the same way before joining.',
      ],
      answer: 0,
      explanation: 'Batch results are returned as JSONL with no guarantee that result order matches input order — that is exactly why custom_id exists. Joining by position silently corrupts data without any visible error. The correct fix is to match every result back to its source record by custom_id. Results are not dropped or confidence-sorted; JSONL fully preserves field names including custom_id.',
    },
    {
      id: 'lab-cost-latency-plan',
      type: 'lab',
      title: 'Design a cost and latency optimization plan',
      brief: `You are the architect for a **high-volume contract extraction pipeline**. The system receives 300,000 PDF contracts per day. Each contract is converted to text (average 8,000 tokens). The extraction task uses a shared 12,000-token system prompt (same for all contracts) and a 6-tool schema (only 2 tools fire per contract type, but all 6 are currently included in every request). Results are consumed by a downstream review queue; reviewers check results within 12 hours of submission.

**Current setup (baseline):**
- Synchronous API calls, claude-opus-4-5, all 6 tools every request, no caching.
- Estimated daily cost: very high; latency not a concern since review is next-morning.

**Your task:**

Write a structured optimization plan covering:
1. **Processing mode** — should this use batch or real-time? Justify with SLA arithmetic.
2. **Prompt caching strategy** — what to cache, where to place the breakpoint, and what would bust the cache.
3. **Token budget reductions** — which categories to shrink and how.
4. **Model selection rationale** — which model tier to start with and how you would validate the quality bar.
5. **Failure handling** — how you handle partial batch failures without rerunning everything.

Be specific: include numbers where relevant (token counts, expected cost levers, cadence).`,
      placeholder: 'Write your optimization plan here. Cover all 5 sections with specific reasoning and numbers.',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam, evaluating cost and latency optimization plans for high-volume extraction pipelines. Be concise (under 350 words). Provide: (1) a score out of 10, (2) what the learner got right, (3) specific gaps or errors. Evaluate on: correct use of batch vs real-time with SLA arithmetic, accurate understanding of prompt caching mechanics and cache-bust risks, identification of the highest-impact token categories (system prompt, tool schema), sound model selection reasoning with quality validation, and targeted failure-only resubmission strategy.',
      evalTemplate: 'A learner submitted this cost and latency optimization plan for a high-volume contract extraction pipeline:\n\n{{input}}\n\nReview it per your rubric. If the plan is missing one or more of the 5 required sections, call that out explicitly and explain what a complete answer would include for the missing section.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'A team is deciding whether to move a 400,000-document nightly enrichment job to the Message Batches API. The lead argues the main reason to switch is the ~50% cost discount. Which framing is most accurate?',
      options: [
        'Cost is the right primary driver; if the discount is large enough, batch is always the better choice.',
        'The discount is real, but the decision should turn first on whether the 24-hour window fits the SLA — cost is a secondary benefit once latency is acceptable.',
        'Batch is a drop-in replacement for synchronous calls, so the team can switch with no other design changes.',
        'The discount only applies to output tokens, so the savings are usually too small to matter.',
      ],
      answer: 1,
      explanation: 'Correct: the latency/SLA question dominates because batch carries a hard 24-hour window, and cost savings only matter once that delay is acceptable, so SLA fit must be confirmed first. Treating cost as an unconditional primary driver ignores that the window can break time-sensitive workflows. Batch is a different execution model, not a drop-in replacement with no design changes. And the ~50% discount applies to equivalent on-demand pricing broadly, not output tokens alone.',
    },
    {
      id: 'q2',
      question: 'An engineer pairs the Nth line of a batch JSONL result file with the Nth record in the original input list. During testing the extracted fields are attached to the wrong source records. What is the root cause?',
      options: [
        'Batch results are not guaranteed to be in input order; results must be joined by custom_id, not by position.',
        'The JSONL file is corrupted and must be re-downloaded.',
        'The batch silently dropped records, shifting every line by one.',
        'JSONL cannot preserve field names, so positional matching is required.',
      ],
      answer: 0,
      explanation: 'Correct: batch results come back as JSONL with no guarantee that result order matches input order, which is exactly why custom_id is mandatory — join on it, never on position. The file is not corrupted; positional matching is simply the wrong strategy. There is no evidence of dropped records causing an off-by-one shift; the reordering is by design. And JSONL fully preserves field names, including custom_id, so positional matching is never required.',
    },
    {
      id: 'q3',
      question: 'A pipeline submits a 100,000-item batch and discovers afterward that a malformed system block caused every single request to error. How could this have been prevented most cheaply?',
      options: [
        'By relying on the batch to abort automatically when the first request failed.',
        'By assuming a malformed request aborts the whole batch, so only one item would have been wasted.',
        'By validating the request shape against the standard Messages API on a small sample before submitting the full batch.',
        'By re-using the same custom_id for every item to simplify debugging.',
      ],
      answer: 2,
      explanation: 'Correct: a small validation run against the Messages API catches schema bugs for a tiny fraction of the cost of discovering them in a 100k-item result. A batch does not abort on a bad request — each malformed item produces a per-request error — so neither auto-abort nor the assumption that only one item is wasted holds. Re-using one custom_id across all items would make reconciliation ambiguous and would not have prevented the schema error at all.',
    },
    {
      id: 'q4',
      question: 'A continuous stream of records must be processed within a 36-hour SLA. Batch worst case is 24 hours and post-processing takes 6 hours. What is the maximum acceptable submission cadence?',
      options: [
        '12 hours',
        '6 hours',
        '2 hours',
        '0 hours (effectively continuous)',
      ],
      answer: 1,
      explanation: 'Correct: cadence = SLA − batch window − post-processing buffer = 36 − 24 − 6 = 6 hours, so batches may be submitted at most every 6 hours. 12 hours is too long: a record arriving just after a submission waits 12 h before entering the next batch, then 24 + 6 more, exceeding 36. 2 hours and continuous submission are safe but unnecessarily aggressive given the formula leaves a full 6-hour margin.',
    },
    {
      id: 'q5',
      question: 'A 26-hour SLA must be met with batch processing (24-hour worst case) plus a 2-hour post-processing buffer. The team proposes submitting one batch per day. Why is this risky?',
      options: [
        'Daily submission is fine because the average batch finishes well under 24 hours.',
        'Daily submission violates the platform maximum of one batch per hour.',
        'The 24-hour window only applies to batches over 50,000 items, so the SLA is not actually at risk.',
        'The cadence formula yields 0 hours, so submission must be effectively continuous; a once-a-day cadence guarantees tail records miss the SLA.',
      ],
      answer: 3,
      explanation: 'Correct: cadence = 26 − 24 − 2 = 0 hours, meaning submission must be essentially continuous, so a once-a-day cadence leaves tail records no room. Designing around the average finish time is the classic error — design around the 24-hour worst case, not the median. There is no platform rule of one batch per hour, and the 24-hour window is not gated on item count. Once-a-day is only safe when the SLA is at least 48 hours.',
    },
    {
      id: 'q6',
      question: 'A 200,000-document batch returns with 1,500 context_length_exceeded errors and the rest succeeded. What is the most cost-effective recovery?',
      options: [
        'Resubmit the entire 200,000-document batch to be safe.',
        'Discard the failures since 99% succeeded and partial coverage is acceptable.',
        'Chunk only the 1,500 failed inputs, merge their partial extractions, and resubmit just those custom_ids.',
        'Switch the whole job to real-time calls and reprocess everything synchronously.',
      ],
      answer: 2,
      explanation: 'Correct: context_length_exceeded means only those specific inputs were too long, so chunk only the failed records, merge the partial extractions, and resubmit just their custom_ids. Rerunning all 200,000 wastes cost on records that already succeeded. Silently discarding failures abandons data the workflow presumably needs. Moving everything to real-time discards the batch discount and fixes the length problem for none of the records.',
    },
    {
      id: 'q7',
      question: 'A product team wants to use the Batch API for a multi-step research agent where each step reads the output of the previous step before deciding what to do next. Why is batch a poor fit here?',
      options: [
        'Batch cannot return JSON, so structured agent steps are impossible.',
        'Batch requests are processed independently, so a step that must consume the previous result needs real-time sequential calls.',
        'Batch is fine; the steps will automatically run in dependency order within the batch.',
        'Batch only supports a single request per submission, so multi-step work is unsupported.',
      ],
      answer: 1,
      explanation: 'Correct: batch items are independent — no result feeds the next — so a chained workflow where each step depends on the prior output requires real-time sequential calls. Batch results are JSONL and can carry structured output, so the JSON claim is false. The batch will not order items by dependency; it processes them independently. And a batch submission carries many requests, not one, so the single-request claim is wrong.',
    },
    {
      id: 'q8',
      question: 'An engineer enables prompt caching, but every request carries a system prompt dynamically rebuilt with a slightly different timestamp string at the top. Cache hit rate is near zero. Why?',
      options: [
        'Caching only works for output tokens, not the system prompt.',
        'Caching requires the Batch API, which is not in use.',
        'The system prompt is too short to be eligible for caching.',
        'The cache is keyed on the exact byte sequence up to the breakpoint; a single character change (the varying timestamp) busts the cache.',
      ],
      answer: 3,
      explanation: 'Correct: the cache is keyed on the exact byte sequence up to the breakpoint, so a per-request varying prefix (the timestamp) means nothing matches and almost nothing is cached. Caching applies to repeated input prefixes, not output tokens. It is a Messages API feature independent of batch. And the issue is the varying prefix, not prompt length — moving the static portion above the timestamp would restore hits.',
    },
    {
      id: 'q9',
      question: 'A single document request already exceeds the model\'s context window. A teammate suggests enabling prompt caching on the shared 20k-token system prefix to fix it. What is the flaw in this reasoning?',
      options: [
        'Caching reduces cost on repeated prefixes but does not extend the context window, so an over-length request still will not fit.',
        'Caching will work; it compresses the prefix and frees room in the window.',
        'Caching only helps if the system prompt is under 1k tokens.',
        'Caching automatically chunks the document to fit the window.',
      ],
      answer: 0,
      explanation: 'Correct: caching saves reprocessing cost on a shared prefix but does not make the context window larger, so a request that is too long still will not fit — the fix is chunking or filtering the input. Caching does not compress tokens or free window space. It is most effective for large shared prefixes, so a small-prompt restriction is fabricated. And it does no automatic chunking; that is the application\'s job.',
    },
    {
      id: 'q10',
      question: 'A multi-step extraction pipeline includes all 9 of its tools in every request even though each step only ever calls 1 or 2 of them. Besides the token cost, what additional benefit comes from sending only the tools relevant to the current step?',
      options: [
        'It enables prompt caching of the document body automatically.',
        'It improves model behavior — fewer irrelevant tools means less ambiguity about which tool to use.',
        'It guarantees the model will never call a tool at all.',
        'It removes the need for any output validation.',
      ],
      answer: 1,
      explanation: 'Correct: step-scoped tools cut token cost and also reduce ambiguity, helping the model focus on the right tool for the current stage. It does not automatically cache the document body — caching is configured on a chosen prefix. Limiting tools does not prevent tool calls; relevant tools are still available. And it has nothing to do with eliminating validation, which remains a separate responsibility.',
    },
    {
      id: 'q11',
      question: 'A team migrates a high-volume extraction job from Opus to a smaller, cheaper model purely on cost grounds, without testing. Accuracy on a key document type drops sharply in production. What principle was violated?',
      options: [
        'Always use the largest model regardless of cost.',
        'Smaller models are always lower quality, so the downgrade was guaranteed to fail.',
        'Use the smallest model that reliably meets the task quality bar — and validate quality across the real input distribution before committing.',
        'Model selection has no effect on cost, so the migration was pointless.',
      ],
      answer: 2,
      explanation: 'Correct: the rule is to pick the smallest model that reliably meets the quality bar and validate that quality across the real distribution of inputs, not just easy examples, before committing. Defaulting to the largest model ignores legitimate cost and latency wins. Smaller models are not always worse — many tasks meet the bar — so the failure was skipping validation, not the downgrade itself. And model selection materially affects cost, so the migration was not pointless, just unvalidated.',
    },
    {
      id: 'q12',
      question: 'A processing target of 1M documents/day uses a 5k-token shared system prompt, a 2k-token document, and 500-token outputs. Which set of levers should the architect apply to minimize cost?',
      options: [
        'Pick exactly one lever — for example, only the batch discount — since the levers are alternatives.',
        'Rely on streaming alone, since it lowers token cost the most.',
        'Increase max_tokens so each call does more work per dollar.',
        'Apply batch discount, prompt caching of the shared prefix, and a validated model downgrade together, because the levers multiply.',
      ],
      answer: 3,
      explanation: 'Correct: prompt caching, token budgeting/model selection, and the batch discount are multiplicative, so applying batch + caching + a validated downgrade together can drop per-document cost by an order of magnitude. Treating the levers as mutually exclusive leaves most savings on the table. Streaming improves perceived latency, not token cost. And raising max_tokens increases output tokens and therefore cost rather than reducing it.',
    },
    {
      id: 'q13',
      question: 'A team must classify where each workload sits. A nightly job that builds a search index over millions of documents has no user waiting on it. Where does it belong on the throughput-vs-interactivity spectrum?',
      options: [
        'Synchronous streaming, optimizing for sub-second time to first token.',
        'Batch offline, optimizing for cost and throughput with hours-to-24h latency.',
        'Synchronous async, optimizing for sub-60-second latency.',
        'Real-time, because indexing is always latency-critical.',
      ],
      answer: 1,
      explanation: 'Correct: no human is blocked, the volume is large, and a multi-hour delay is acceptable — that is the batch-offline end of the spectrum, optimized for cost and throughput. Synchronous streaming and its sub-second TTFT target are for user-facing assistants. Synchronous async fits background near-real-time tasks needing results in tens of seconds, which this job does not. Indexing is not inherently latency-critical, so forcing it into real-time wastes the available cost savings.',
    },
    {
      id: 'q14',
      question: 'For a user-facing chat assistant, an engineer is tuning to reduce total generation time (time to last token) while ignoring time to first token. Why is this likely the wrong focus?',
      options: [
        'Total generation time is irrelevant; only batch latency matters for chat.',
        'Time to first token cannot be measured, so it should be ignored.',
        'For interactive UIs, time to first token usually matters more — users perceive the response as fast once streaming starts, even if full generation takes a few seconds.',
        'Reducing total generation time always reduces time to first token by the same amount.',
      ],
      answer: 2,
      explanation: 'Correct: in interactive UIs perceived latency is driven by TTFT — once tokens stream, the experience feels fast even if total generation takes seconds — so optimizing TTLT alone misses what users feel. Total generation time is not irrelevant, just secondary for chat. TTFT is measurable and is reduced by smaller inputs, smaller models, and streaming. And the two metrics are not locked together — cutting total generation time does not necessarily improve when the first token arrives.',
    },
    {
      id: 'q15',
      question: 'A production system has both a bulk offline enrichment job and an interactive user-facing assistant. An architect proposes routing everything through batch to capture the discount, expediting urgent items inside the batch. What is the best design?',
      options: [
        'Route everything through batch and expedite urgent items within the batch to get the discount everywhere.',
        'Use batch for the interactive assistant and real-time for the offline enrichment to balance the load.',
        'Legitimately use both modes by task class: real-time for the interactive assistant, batch for the offline enrichment, asking whether a human needs the result before doing the next thing.',
        'Route everything through real-time to keep the architecture uniform and simple.',
      ],
      answer: 2,
      explanation: 'Correct: large systems often legitimately run both modes for different task classes; the deciding question is whether a human needs the result before doing the next thing — yes means real-time (the assistant), no means batch (the enrichment). Expediting urgent items inside a batch defeats the purpose, because batch processing latency is the very reason urgent items cannot use it. Forcing everything to real-time throws away the discount on work that tolerates delay. And routing interactive traffic to batch while enrichment goes real-time inverts the correct mapping.',
    },
  ],
}
