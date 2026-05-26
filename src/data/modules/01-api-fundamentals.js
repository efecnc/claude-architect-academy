export default {
  id: 'api-fundamentals',
  num: 1,
  title: 'API Fundamentals and Output Control',
  summary: 'How the stateless Messages API works, why your app owns memory, and how to get reliable machine-readable output with structured outputs, tool use, and tool_choice.',
  estMinutes: 34,
  tags: ['API', 'Output', 'Tokens'],

  lessons: [
    {
      id: 'statelessness',
      title: 'The Messages API Is Stateless',
      minutes: 9,
      body: `> **TL;DR** — Claude remembers *nothing* between API calls. Every turn, your application must resend everything the model needs. "Memory" is a feature you build, not one the API provides.

The Messages API is **stateless** in the same sense HTTP is: the server holds no session between calls. Each request is evaluated in complete isolation — the model conditions its output only on the bytes in *that* request and has no access to anything from earlier turns. There is no server-side conversation store to fall back on. So what looks like "the model forgot" is almost always "the application didn't resend it" — reconstructing the full context on every request is the client's responsibility, not the API's.

### What statelessness forces you to do

Because the model only sees the current request body, a production chat app must store the conversation itself and **resend the full current context on every turn**:

- the **system prompt** (instructions, persona, rules)
- the **selected prior messages** (or a summary of them)
- current **application state** (cart contents, account tier, flags)
- any **retrieved documents** (RAG results)
- any **tool results** the model needs to reason about

### "But I pass a session_id..."

A \`session_id\` lives in *your* product, database, or orchestration layer. It helps *you* find stored history so you can rebuild the request. It does **not** change what Claude sees. The model only ever sees the bytes in the current request body.

> ❓ **Check yourself:** To cut cost, you stop sending older turns and instead pass a \`previous_response_id\` from your last API call, expecting Claude to resume from there. What happens?
>
> *(Nothing resumes — that id is meaningless to the Messages API. The model sees only the current request body, so dropping the older turns simply removes them from context. To cut cost you must summarize or window the history, not reference it by id.)*

### Message structure: where each piece goes

The Messages API uses a **top-level \`system\` parameter** for the system prompt — **not** a \`"system"\` role inside \`messages\`. User and assistant turns go in \`messages\`. Tool interactions are represented as content blocks:

\`\`\`json
{
  "system": "You are a support agent for Acme.",
  "messages": [
    { "role": "user", "content": "Cancel my order 8842." },
    { "role": "assistant", "content": [
      { "type": "tool_use", "id": "tu_1", "name": "cancel_order",
        "input": { "order_id": "8842" } }
    ]},
    { "role": "user", "content": [
      { "type": "tool_result", "tool_use_id": "tu_1",
        "content": "{\\"status\\":\\"cancelled\\"}" }
    ]}
  ]
}
\`\`\`

Assistant messages can contain \`tool_use\` blocks; the following user message carries the matching \`tool_result\` block. This loop is how the model "uses" tools across stateless requests — **you replay the whole exchange each turn.**

### One conversation, assembled fresh every turn

\`\`\`mermaid
sequenceDiagram
    participant App as Your App
    participant API as Claude API (stateless)
    Note over App: Stores the full conversation
    App->>API: Send: system prompt + every earlier turn + new message
    API-->>App: Reply, then discards everything
    App->>API: Next turn: system prompt + ALL prior turns again + new message
    Note over API: Each call sees ONLY what that request contains
\`\`\`

### Key takeaways
- The model sees **only** the current request. No request → no knowledge.
- "Memory," "sessions," and "history" are things **your application** implements by re-sending context.
- \`system\` is a **top-level parameter**; user/assistant turns live in \`messages\`; tools use \`tool_use\`/\`tool_result\` blocks.`,
      principles: [
        "The model sees only the current request body — state and history are yours to resend every turn.",
        "`system` is a top-level API parameter, not a `\"system\"` role in `messages` — misplacing it drops instructions.",
      ],
      pitfalls: [
        "Claude has no memory between calls — resend system prompt, prior turns, and needed state every request.",
        "`session_id` is your storage key, not model memory — use it to rebuild context and include it in the request.",
      ],
    },
    {
      id: 'structured-output',
      title: 'Structured Outputs vs Tool Use as Output Control',
      minutes: 9,
      body: `> **TL;DR** — When you need machine-readable output, *constrain* it with a schema. Asking nicely for JSON in the prompt is the fragile path; schema-backed output is the reliable one.

There are two ways to get structured output: *ask* for it in the prompt, or *constrain* the generation to a schema. The distinction is decisive. A prompt instruction ("respond only in JSON") is a soft target the model usually hits but can miss — a stray preamble, a dropped comma, a markdown fence, an unquoted number. A schema constraint operates on decoding itself: tokens that would violate the schema are not sampled, so non-conforming output is structurally impossible rather than merely discouraged.

> **Schema-backed output is more reliable than asking for free-form text that "looks like JSON" — it changes generation from a request into a guarantee.**

### Two mechanisms (and when each fits)

**1. JSON structured outputs** — \`output_config.format\` with a JSON Schema. Claude's **direct text response** is constrained to valid JSON matching that schema.
→ Use when the *final assistant response itself* should be JSON (e.g., an API endpoint that returns structured data to your frontend).

**2. Tool use / strict tool use** — define a tool with an \`input_schema\`; read the model's \`tool_use.input\` as structured data. Where supported, \`strict: true\` enforces parameter-schema compliance.
→ Use when the structured output represents a **function call, an extraction step, or an intermediate agent action**.

They combine: an agent can call tools with valid parameters *and* produce a structured final response.

### Weak vs strong: getting a refund record

**❌ Weak — prompt-only JSON**

> system: "Always respond with JSON like {amount, reason}."
> user:   "Refund $40 for the late delivery."

Failure modes: a stray "Sure! Here's the JSON:" prefix, missing field, \`\$40\` instead of \`40\`, or markdown fences your parser chokes on.

**✅ Strong — schema-constrained tool**
\`\`\`json
{
  "name": "record_refund",
  "input_schema": {
    "type": "object",
    "properties": {
      "amount_usd": { "type": "number" },
      "reason": { "type": "string", "enum": ["late", "damaged", "wrong_item"] }
    },
    "required": ["amount_usd", "reason"]
  }
}
\`\`\`
Now \`amount_usd\` is a number by construction and \`reason\` can only be one of three values. The shape is guaranteed before your code ever runs.

### Operational realities (the exam loves these)

| Reality | Implication |
|---|---|
| First request for a schema may compile a grammar | Adds **latency** on the first call |
| Schemas are **cached** for reuse | Subsequent calls are fast |
| Very complex schemas can exceed compilation limits | Keep schemas reasonable |
| A **refusal** or **max-token stop** can still emit nonconforming output | Always handle the unhappy path |

So: schema compliance is a *format* guarantee, **not** a *truth* guarantee. A perfectly-shaped object can still contain a hallucinated value.

> ❓ **Check yourself:** Your extraction returns valid JSON matching the schema, but the \`invoice_total\` is wrong. Did structured output fail?
>
> *(No. Structured output guarantees shape, not correctness. You need semantic validation in code — see Module 4.)*

### Key takeaways
- Prefer **constraining** output (schema/tool) over **requesting** it (prompt text).
- Final response should be JSON → **structured outputs**. Output is a call/step → **tool use**.
- Schema validity ≠ factual correctness. Validate meaning in your own code.`,
      principles: [
        "Use `output_config.format` when the response must be JSON; use tool use when the output is a call or step.",
        "Schema compliance guarantees shape, not correctness — a valid object can hold wrong values; still validate.",
      ],
      pitfalls: [
        "Prompt-only JSON is fragile — stray prose, missing commas, or fences break parsers; use a schema instead.",
        "Schema-valid output is not semantically correct — run domain checks after parsing; validity is format only.",
      ],
    },
    {
      id: 'tool-choice',
      title: 'Controlling Tool Use with tool_choice',
      minutes: 8,
      body: `> **TL;DR** — \`tool_choice\` decides *whether* and *which* tool the model must call. \`auto\` only *allows* a call; \`any\` and named tools *guarantee* one.

The key distinction is **permission vs obligation**. \`auto\` *permits* a tool call but leaves the model free to answer in plain text instead; \`any\` and a named tool *oblige* a call. Most "it just replied with prose instead of calling the tool" bugs trace to using \`auto\` (a permission) where the control flow actually required a guaranteed call (an obligation). Pick the setting from what your pipeline needs to be true, not from what you hope the model will do.

### The four settings

| Setting | Meaning | Use case |
|---|---|---|
| \`auto\` | Claude may call a tool **or** answer normally | General agents where tool use is optional |
| \`any\` | Claude **must** call one of the provided tools | One tool from a set must run, but you don't know which in advance |
| \`tool\` | Claude must call a **specific named** tool | A pipeline stage that must produce one schema before enrichment |
| \`none\` | Claude **cannot** call tools | Pure text response, or a step where tools are unsafe/unneeded |

### Why \`auto\` ≠ "required"

\`auto\` + a prompt that says "always use a tool" can **still** emit conversational text in edge cases — the prompt is a suggestion, the setting is the rule. \`any\` cannot produce plain text; it guarantees a tool call. This matters most for **extraction across unknown document types**: you have one tool per type and want a guaranteed call without committing to which schema up front.

### Forcing the first stage of a pipeline

When one tool must run **first**, name it explicitly:
\`\`\`json
{ "tool_choice": { "type": "tool", "name": "extract_metadata" } }
\`\`\`
Do **not** rely on reordering tool definitions or system-prompt priority to influence which tool runs first — that ordering is **unreliable**.

### Decision flow

\`\`\`mermaid
flowchart TD
    A{"Need a tool call at all?"} -->|no| N["tool_choice: none<br/>(or pass no tools)"]
    A -->|yes| B{"Is a call required this turn?"}
    B -->|no| Auto["auto<br/>model may call or just answer"]
    B -->|yes| C{"Do you know which tool must run?"}
    C -->|yes| Named["named tool<br/>type: tool, name: ..."]
    C -->|no| Any["any<br/>one of the set, model picks"]
\`\`\`

### A reliable extraction pipeline (preview of Module 4)
1. Define an extraction tool whose \`input_schema\` *is* the desired output schema.
2. Set \`tool_choice\` to that named tool (or \`any\` across several) so a call is guaranteed.
3. Receive the structured \`tool_use.input\`.
4. **Validate** the result in application code.
5. On semantic failure, call again with the source, the invalid output, and the **exact validation errors** — this feedback loop beats blind retries.

> ❓ **Check yourself:** You must guarantee one of three extractors runs, but the document type is unknown until runtime. Which setting?
>
> *(\`any\` — it forces a call to one of the set without you choosing the schema in advance.)*

### Key takeaways
- \`auto\` = *may*; \`any\` / named = *must*. Pick "must" when correctness depends on a call happening.
- Force ordering with a **named tool**, never with definition order or prompt priority.`,
      principles: [
        "Only `any` or a named tool guarantees a call; `auto` merely allows one — pick the most restrictive setting.",
        "Force pipeline stage order with a named `tool_choice`; definition order and prompt priority are unreliable.",
      ],
      pitfalls: [
        "`tool_choice: \"auto\"` allows a call but does not require one — use `any` or named when a call is required.",
        "Blind retries repeat the same error — re-call with the source, bad output, and exact validation errors.",
      ],
    },
    {
      id: 'token-growth',
      title: 'Token Growth, Prefill, and Cost in Long Sessions',
      minutes: 8,
      body: `> **TL;DR** — Every turn resends the whole history, so cost and latency climb as the conversation grows. Slow, pricey long sessions are almost always token growth — not a model defect.

Because the API is stateless (Lesson 1), every turn resends the entire conversation, so input size grows roughly linearly with conversation length. Since cost and latency both scale with input tokens, a long session gets progressively slower and more expensive on *every* turn — and the model also has more competing, possibly stale, material to attend to. This compounding is structural, not a sign of degradation.

### What grows, and why it matters
- **Input token count** rises with every message.
- **Latency** rises proportionally — more input to attend to.
- **Per-turn cost** rises.
- The model has **more competing information**: stale tool results, verbose RAG chunks, old preferences, its own earlier replies. Signal gets diluted.

\`\`\`mermaid
flowchart LR
    T1["Turn 1<br/>system + t1"] --> T2["Turn 2<br/>system + t1 + t2"] --> T3["Turn 3<br/>system + t1..t3"] --> TN["Turn N<br/>system + t1..tN<br/>biggest · slowest · priciest"]
\`\`\`

If users report slower, pricier responses in long sessions, suspect input-token growth first. The fixes are **context-management strategies** (sliding window, progressive summarization, structured state) — the whole of Module 5.

### Schemas and tool definitions cost tokens too

Tool definitions, tool/output schemas, and \`tool_use\`/\`tool_result\` blocks all consume input budget or add injected overhead. A 12-field tool with rich descriptions can eat **~2,500 tokens**. Combine that with a long document and you approach the context limit — at which point accuracy degrades on content **near the end** of the document. The root cause is *total context consumption*, not a model bug.

### Partial assistant prefill (a precision tool, not a default)

Claude can continue from a partially filled assistant turn. Useful for:
- Nudging a JSON-style start by prefilling \`{\`.
- Preventing repetitive greetings by supplying a concise opening.

But for machine-readable output, **schema-constrained tool use is better** than relying on text prefill.

### Weak vs strong: handling a 50-turn support thread

**❌ Weak** — send all 50 turns verbatim every time. Costs balloon; the model fixates on a stale complaint from turn 3.

**✅ Strong** — keep the last few turns verbatim, replace older ones with a compact summary, and store durable facts (account tier, open ticket id) in a small structured state object you resend each turn.

> ❓ **Check yourself:** A 40-turn chat has gotten slow and expensive. You enable prompt caching, but it barely helps. Why?
>
> *(Caching only discounts the stable prefix, like the system prompt. The part that keeps growing — the accumulating turn history — differs every turn, so it can't be cached. You have to shrink the history itself with windowing or summarization.)*

### Key takeaways
- Long-session slowdowns = token growth, by default. Reach for context management, not blame.
- Budget for **schemas and tool definitions**, not just the document/conversation.
- Use prefill sparingly for format/opening control; prefer tool use for structured data.`,
      principles: [
        "Long-session slowdowns are almost always input-token growth from resending full history — count tokens first.",
        "Tool definitions consume input budget like documents — a large schema plus a long doc degrades accuracy.",
      ],
      pitfalls: [
        "Ignoring tool-definition token cost — count the full request: schemas and `tool_use`/`tool_result` blocks too.",
        "Using text prefill for structured data — it nudges format but does not enforce schema types; prefer tool use.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-forgets',
      type: 'mcq',
      scenario: "A short 4-turn chat assistant keeps \"forgetting\" the user's name that was given in turn 1. The model, prompt, and database are all healthy.",
      question: 'What is the most likely cause?',
      options: [
        "The model's memory cache expired between turns.",
        "The application is not including the earlier messages in the current request.",
        "The session_id was not passed, so Claude lost its server-side memory.",
        "The temperature is too high.",
      ],
      answer: 1,
      explanation: "The Messages API is stateless — Claude only sees what the request contains. There is no server-side memory and no session_id-based recall. If earlier turns aren't in the request, the model can't use them.",
    },
    {
      id: 'ex-toolchoice-match',
      type: 'mcq',
      question: "You have a pipeline where one of several extraction tools must run, but you won't know the document type until runtime. Which tool_choice setting guarantees a tool call without locking you to a specific schema?",
      options: [
        "`auto` — the model will pick the right tool from the list.",
        "`any` — forces a call to one of the provided tools; the model selects which.",
        "`none` — disables tools so the model returns plain text for routing.",
        "A named tool — locks in the specific tool to call this turn.",
      ],
      answer: 1,
      explanation: "`any` guarantees a tool call to one of the provided set while letting the model choose the schema at runtime. `auto` only permits a call and can produce plain text. `none` forbids tool calls entirely. A named tool would lock you to one document type, which you cannot choose in advance.",
    },
    {
      id: 'ex-pipeline-order',
      type: 'mcq',
      question: "A multi-stage extraction pipeline must run `extract_metadata` before any enrichment tool. What is the reliable way to enforce this ordering?",
      options: [
        "List `extract_metadata` first in the tools array definition.",
        "Add \"always call extract_metadata first\" to the system prompt.",
        "Set `tool_choice` to `{\"type\": \"tool\", \"name\": \"extract_metadata\"}` for that call.",
        "Lower the temperature so the model deterministically picks the first tool.",
      ],
      answer: 2,
      explanation: "Naming the tool in `tool_choice` is the only API-level guarantee that a specific tool runs for a given call. Tool definition order does not reliably control selection. A system-prompt instruction is a suggestion, not a hard constraint. Temperature affects sampling variability, not which tool is mandated.",
    },
    {
      id: 'ex-guarantee',
      type: 'mcq',
      question: 'You must guarantee the model calls one of three extraction tools, but you cannot know which document type arrives. Which tool_choice do you use?',
      options: ['auto', 'any', 'none', 'A specific named tool'],
      answer: 1,
      explanation: '`any` forces a call to one of the provided tools without committing to which schema in advance. `auto` could still produce plain text; a named tool would lock you to one document type.',
    },
    {
      id: 'lab-schema',
      type: 'lab',
      title: 'Design and defend an extraction tool',
      brief: `Design a **tool definition** (name, description, and an \`input_schema\`) for extracting structured data from a customer **refund request email**. The output should capture: order id, requested amount (nullable if unstated), reason category (an enum), and whether human review is required.

Paste your tool definition (JSON) below. The reviewer will critique your schema discipline: enum usage, nullable fields, identifier stability, and whether the design avoids forcing the model to reconstruct business invariants.`,
      placeholder: '{\n  "name": "extract_refund_request",\n  "description": "...",\n  "input_schema": { "type": "object", "properties": { ... }, "required": [ ... ] }\n}',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate tool/schema designs. Be concise (under 250 words). Give: (1) a score out of 10, (2) what is good, (3) concrete fixes. Focus on: enums for closed sets, explicit nullable fields, stable identifiers, separating operations with different required fields, and not asking the model to reconstruct business invariants from free strings.',
      evalTemplate: 'A learner submitted this extraction tool definition for a refund-request email:\n\n{{input}}\n\nReview it per your rubric. If it is not valid JSON or not a tool definition, say so and show a corrected minimal example.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: "A support bot loses the user's stated address mid-conversation, even though it is saved in your database. Where is the fault most likely to be?",
      options: [
        "The model silently dropped it from its internal memory.",
        "The application did not include the address in the current request.",
        "The session_id rotated, clearing Claude's server-side state.",
        "The context window auto-expired the oldest facts.",
      ],
      answer: 1,
      explanation: "Correct: the API is stateless, so the model only sees what your app puts in the request — if the address isn't there, it can't be used. \"Internal memory\" is wrong because the model has none between calls. \"session_id ... server-side state\" is wrong because session_id is your concept and does not change what Claude sees. \"context window auto-expired\" is wrong: nothing auto-expires server-side; you control what is sent.",
    },
    {
      id: 'q2',
      question: 'Where does the system prompt belong in a Messages API request?',
      options: [
        "As a message with role \"system\" inside the messages array.",
        "In a top-level \"system\" parameter.",
        "As the first tool definition.",
        "Inside output_config.format.",
      ],
      answer: 1,
      explanation: "Correct: the system prompt is a top-level \"system\" parameter. A \"system\" role inside messages is wrong — only user/assistant turns go there. \"first tool definition\" confuses tools with instructions. \"output_config.format\" is for constraining JSON output, not for instructions.",
    },
    {
      id: 'q3',
      question: "You need the model's FINAL response to be JSON your frontend can render directly. Which mechanism fits best?",
      options: [
        "A prompt instruction: \"respond only in JSON\".",
        "JSON structured outputs via output_config.format.",
        "A forced tool call whose result you ignore.",
        "Assistant prefill starting with \"{\".",
      ],
      answer: 1,
      explanation: "Correct: structured outputs constrain the final text response to a JSON Schema — exactly when the response itself should be JSON. The prompt-only instruction is fragile (stray prose, fences). A forced tool call models a call/step, not a final response. Prefill nudges format but does not guarantee schema conformance.",
    },
    {
      id: 'q4',
      question: 'An extraction returns JSON that perfectly matches the schema, but a date field holds a value not present in the source document. What does this tell you?',
      options: [
        "Structured output is broken and should be disabled.",
        "Schema compliance guarantees shape, not truth — you still need semantic validation.",
        "The schema must be missing a \"required\" entry.",
        "Temperature should be raised to add variety.",
      ],
      answer: 1,
      explanation: "Correct: a schema guarantees the *shape*, not the *correctness*, of values — domain/semantic validation is your job. \"Broken/disable\" overreacts; the mechanism worked as designed. A missing \"required\" entry affects presence, not truth. Raising temperature increases variability, making fabrication more likely, not less.",
    },
    {
      id: 'q5',
      question: 'You have one extraction tool per document type and must guarantee a tool call, though the incoming type is unknown until runtime. Which tool_choice?',
      options: ['auto', 'any', 'none', 'A specific named tool'],
      answer: 1,
      explanation: "Correct: \"any\" forces a call to one of the set while letting the model pick the right schema at runtime. \"auto\" only permits a call and may return plain text. \"none\" forbids tools entirely. A named tool would lock you to a single document type, which you can't choose in advance.",
    },
    {
      id: 'q6',
      question: 'A multi-stage pipeline requires extract_metadata to run before any enrichment tool. What is the reliable way to enforce this?',
      options: [
        "List extract_metadata first in the tools array.",
        "Add \"always call extract_metadata first\" to the system prompt.",
        "Set tool_choice to the named tool extract_metadata for that call.",
        "Lower the temperature so ordering becomes deterministic.",
      ],
      answer: 2,
      explanation: "Correct: naming the tool in tool_choice guarantees it runs for that call. Definition order does not reliably control which tool the model picks. A system-prompt instruction is a suggestion, not a guarantee. Temperature affects sampling variability, not which tool is mandated.",
    },
    {
      id: 'q7',
      question: 'Users report a long chat session has become slow and expensive. Best first hypothesis?',
      options: [
        "A model regression in a new version.",
        "Input-token growth from resending the full history each turn.",
        "The database is throttling reads.",
        "The system prompt is too short.",
      ],
      answer: 1,
      explanation: "Correct: statelessness means every turn resends the whole conversation, so tokens — and thus cost and latency — grow with length. A model regression is far less likely than the structural cause. Database throttling would not scale with conversation length the same way. Prompt length is unrelated to this growth pattern.",
    },
    {
      id: 'q8',
      question: 'Why can accuracy drop on content near the END of a long document combined with a large tool schema?',
      options: [
        "The model ignores the final paragraph by design.",
        "Total context consumption approaches the limit, degrading attention near the boundary.",
        "JSON schemas truncate documents automatically.",
        "Tool definitions are processed after the document and overwrite it.",
      ],
      answer: 1,
      explanation: "Correct: tool/schema definitions consume input budget too, so a big schema plus a long document pushes total context toward the limit and accuracy degrades near the end. The model does not \"ignore\" the last paragraph by design. Schemas do not truncate documents. Tool definitions do not overwrite document content.",
    },
    {
      id: 'q9',
      question: 'Which statement about tool_choice: "auto" is accurate?',
      options: [
        "It guarantees the model will call a tool.",
        "It allows the model to call a tool or answer normally.",
        "It forbids tool calls entirely.",
        "It forces one specific named tool.",
      ],
      answer: 1,
      explanation: "Correct: \"auto\" permits but does not require a tool call. \"Guarantees a call\" describes \"any\" or a named tool, not \"auto\". \"Forbids tool calls\" is \"none\". \"Forces one specific named tool\" is the named-tool form. Confusing \"auto\" with required use is a classic pitfall.",
    },
    {
      id: 'q10',
      question: 'An extraction fails semantic validation because an amount is malformed. What is the most effective next step?',
      options: [
        "Retry the identical prompt several times.",
        "Call Claude again with the source, the invalid output, and the exact validation errors.",
        "Delete the amount field from the schema.",
        "Switch tool_choice from \"any\" to \"auto\".",
      ],
      answer: 1,
      explanation: "Correct: the validation-error feedback loop gives the model the specific defect to fix, which far outperforms blind retries. Retrying unchanged repeats the same failure. Deleting the field discards needed data. Switching to \"auto\" weakens the guarantee that a tool runs and does nothing about the malformed value.",
    },
    {
      id: 'q11',
      question: "What does a session_id in your own product actually provide to the model?",
      options: [
        "It restores Claude's memory of earlier turns automatically.",
        "Nothing directly — it helps your app locate stored history to rebuild the request.",
        "It enables a hidden server-side cache of the conversation.",
        "It increases the context window size.",
      ],
      answer: 1,
      explanation: "Correct: session_id is an application/orchestration concept used to fetch and replay context; the model still only sees the request body. It does not \"restore memory,\" there is no hidden server-side conversation cache, and it has no effect on the context window size.",
    },
    {
      id: 'q12',
      question: 'When is partial assistant prefill a reasonable choice?',
      options: [
        "As the primary mechanism for producing machine-readable JSON.",
        "To nudge a concise opening or a JSON-style start, while preferring tool use for structured data.",
        "To persist state between stateless requests.",
        "To force a specific tool to be called.",
      ],
      answer: 1,
      explanation: "Correct: prefill is a precision tool for format/opening control, but schema-constrained tool use is the better path for structured data. It is not the primary JSON mechanism, cannot persist state across stateless calls, and is unrelated to forcing tool calls (that is tool_choice).",
    },
    {
      id: 'q13',
      question: 'Which design most reliably yields a refund record with amount as a number and reason from a fixed set?',
      options: [
        "A system prompt describing the JSON shape in prose.",
        "A tool with an input_schema using a number type and an enum for reason.",
        "Asking the model to \"double-check the JSON\" before replying.",
        "Prefilling the assistant turn with an example object.",
      ],
      answer: 1,
      explanation: "Correct: a schema with a number type and an enum constrains both the type and the allowed values by construction. Prose descriptions and \"double-check\" requests are suggestions the model can violate. Prefilling an example biases format but does not enforce types or enumerations.",
    },
    {
      id: 'q14',
      question: 'A teammate claims structured outputs are "free" with no downside. Which caveat is correct?',
      options: [
        "They make the model factually correct.",
        "The first request for a schema may add latency while a grammar compiles.",
        "They eliminate the need to send the system prompt.",
        "They remove all token cost for tool definitions.",
      ],
      answer: 1,
      explanation: "Correct: schema grammar compilation can add latency on the first request (schemas are then cached). They do not make outputs factually correct, do not replace the system prompt, and do not remove the token cost of tool/schema definitions — those still consume budget.",
    },
    {
      id: 'q15',
      question: 'Across stateless requests, how does a tool interaction get represented so the model can continue reasoning?',
      options: [
        "The API stores the tool result and auto-injects it next time.",
        "The assistant turn carries a tool_use block and the following user turn carries the matching tool_result block, replayed each turn.",
        "Tool results are placed in the top-level system parameter.",
        "A session_id links the tool call to its result server-side.",
      ],
      answer: 1,
      explanation: "Correct: the assistant emits a tool_use block and the next user turn supplies the tool_result; you replay this exchange in every subsequent request. The API does not auto-inject results (statelessness). Tool results belong in messages content blocks, not the system parameter. session_id does not link calls server-side for the model.",
    },
  ],
}
