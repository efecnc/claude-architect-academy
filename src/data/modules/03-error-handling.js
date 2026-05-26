export default {
  id: 'error-handling',
  num: 3,
  title: 'Error Handling in Agent Tools',
  summary: 'How to classify, structure, and route tool errors so agents can act correctly — covering MCP error tiers, retry responsibility, uncertain side effects, and idempotency.',
  estMinutes: 32,
  tags: ['Agents', 'MCP', 'Reliability'],

  lessons: [
    {
      id: 'structured-error-results',
      title: 'Structured Error Results',
      minutes: 8,
      body: `> **TL;DR** — A tool error is an *instruction* to the agent. A vague failure string makes it guess; a structured error result tells it exactly whether to retry, ask, escalate, or stop.

A tool error is the agent's entire decision surface for the failure. The model has no out-of-band channel to your tool's internals — it cannot read a stack trace, your logs, or your retry policy. The only thing it learns about the failure is the bytes you return, so the *structure* of that payload, not its prose, determines what the agent does next. Return \`"Error: request failed"\` and the model is forced to infer category from free text — which is exactly where hallucinated next-steps come from: it retries a permanently-broken call, gives up on a transient blip, or invents a reason to relay to the user. Every field you add (\`error_category\`, \`retryable\`, \`code\`, \`next_steps\`) removes one inference the model would otherwise have to guess.

### Return errors as tool results, not exceptions

In MCP, application-level errors should be returned as normal tool results with \`isError: true\`. Do **not** let exceptions propagate uncaught — many frameworks strip or obscure exception messages before the model ever sees them, leaving it with no useful signal at all. The exception that read perfectly in your server logs may reach the model as an empty string or a generic "tool failed."

A minimal structured error result on the wire:

\`\`\`json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "{\\"error_category\\":\\"business_rule\\",\\"retryable\\":false,\\"code\\":\\"warranty_window_closed\\",\\"customer_explanation\\":\\"This device is outside the standard warranty window.\\",\\"next_steps\\":[\\"offer_paid_repair\\",\\"escalate_for_exception_review\\"]}"
    }
  ]
}
\`\`\`

A cleaner internal object your tool might assemble before serializing:

\`\`\`json
{
  "success": false,
  "error_category": "validation",
  "retryable": false,
  "field": "shipping_postal_code",
  "message": "Postal code must be 5 digits for US addresses.",
  "user_repair": "Ask the user to confirm the postal code."
}
\`\`\`

### Fields that matter most

| Field | Purpose |
|---|---|
| \`error_category\` | Tells the agent *why* it failed (validation, business_rule, permission, transient, uncertain) |
| \`retryable\` | Boolean: should the same call be attempted again? |
| \`code\` | Machine-readable code for branching logic |
| \`message\` | Human-readable description for debugging |
| \`next_steps\` | Optional list of actions the agent can offer or take |
| \`field\` | For validation errors: which input field is wrong |
| \`user_repair\` | Instruction the agent can relay to gather the correct input |

### Weak vs strong: a failed warranty check

**❌ Weak — unstructured error string**
\`\`\`json
{ "isError": true, "content": [{ "type": "text", "text": "Error: not eligible" }] }
\`\`\`
The model cannot tell *why* it is ineligible, whether retrying might help, or what to offer the user. It may retry pointlessly, or fabricate a reason ("your warranty expired last week") that is not grounded in anything you returned.

**✅ Strong — structured error result**
\`\`\`json
{
  "isError": true,
  "error_category": "business_rule",
  "retryable": false,
  "code": "warranty_window_closed",
  "customer_explanation": "This device is outside the standard warranty window.",
  "next_steps": ["offer_paid_repair", "escalate_for_exception_review"]
}
\`\`\`
Now the agent knows it must **not** retry, *why* the operation failed, what to say to the user, and which two paths it may offer. Every decision is grounded in a field.

### Visual aid: from raw failure to agent action

\`\`\`mermaid
flowchart LR
    A["Raw Failure<br/>(exception / 503 / business rule)"] -->|"structured result"| B["Structured Error Result<br/>error_category<br/>retryable<br/>code + message<br/>next_steps"]
    B -->|"agent reads"| C["Agent Acts<br/>category → branch<br/>retryable → retry?<br/>next_steps → offer<br/>user_repair → ask"]
    D["&quot;Error: failed&quot;<br/>model must GUESS"] -. "weak path" .-> E["hallucinated<br/>next steps"]
    A -. "without structure" .-> D
\`\`\`

### Avoid returning empty data on failure

An empty list \`[]\` means "success with zero matches." If the upstream API fails, returning \`[]\` silently is a **lie**: the agent will conclude the data simply does not exist and move on. "No results found" and "the API is down" are opposite facts that must never share a representation. Always surface the failure explicitly with \`isError: true\`.

> ❓ **Check yourself:** Your inventory tool's upstream API is healthy but legitimately returns zero rows for a rare SKU, and on a *separate* call the same API throws a connection error. A teammate proposes returning \`[]\` for both "to keep the agent's code path simple." What breaks?
>
> *(The two cases are opposite facts that now share one representation. "Zero matches" is a true success; "API down" is a failure the agent must surface or retry. Collapsing them means a real outage reads as "this SKU doesn't exist," and the agent confidently moves on. Keep \`[]\` for genuine empty success only; the connection error must be \`isError: true\` with a structured payload.)*

### Key takeaways
- An error is a decision surface: the model acts on **only** the fields you return.
- Return application errors as tool results with \`isError: true\` — never as uncaught exceptions frameworks may strip.
- Structure errors with machine-readable fields: \`error_category\`, \`retryable\`, \`code\`, \`next_steps\`.
- An empty result on failure is a silent lie; "no matches" must never look like "the API failed."`,
      principles: [
        "Return business errors with `isError: true` — uncaught exceptions may be stripped before reaching the model.",
        "Use `error_category`, `retryable`, `code`, and `next_steps` so every agent decision is grounded in a field.",
        "`[]` on failure is a silent lie: it signals zero matches, not a backend error; surface `isError: true`.",
      ],
      pitfalls: [
        "Throwing exceptions for business errors — frameworks often strip details, leaving the model an empty string.",
        "Free-text errors force the model to guess next steps — add `error_category`, `retryable`, and `code` instead.",
        "Returning `[]` or `null` on backend failure signals false success; always use `isError: true` with a payload.",
      ],
    },
    {
      id: 'mcp-error-tiers',
      title: 'MCP Error Tiers: Protocol vs Execution',
      minutes: 7,
      body: `> **TL;DR** — Protocol errors mean "the call was never well-formed"; execution errors mean "the call ran but the operation failed." Putting a failure in the wrong tier makes the agent debug the wrong layer.

The tier records *where in the request lifecycle* the failure happened, and that location tells the agent which layer to fix. A **protocol error** means the request was rejected before the tool body ran — the JSON-RPC contract between caller and server was broken (unknown tool, malformed request, a schema-required parameter missing). A **tool execution error** means the call was accepted and dispatched, but the underlying operation failed — a 404, a 503, a business-rule violation. The boundary is simply: *did the tool body execute?* Misfiling a failure misroutes the repair — a protocol error tells the agent "your call shape is wrong, change the arguments," so smuggling a missing-record fact into that tier makes the agent mutate inputs that were already correct.

### Protocol errors (JSON-RPC errors)

A **protocol error** means the request could not be processed *as a protocol operation*. The contract between caller and server was broken before execution began. Examples:

- The caller names a tool that does not exist.
- The JSON-RPC request is malformed.
- A required parameter declared in the tool's input schema is missing entirely.
- The method is not supported by this MCP server.

Protocol errors travel as JSON-RPC error objects, **not** as tool results. The tool body never ran. There is nothing to retry at the business level — something about the call itself must change.

### Tool execution errors (isError: true)

A **tool execution error** means the tool was invoked correctly, but the *underlying operation* failed. The contract held; reality did not cooperate. Examples:

- The upstream API returned 404 because the requested record does not exist.
- The upstream API returned 503 because the service is temporarily unavailable.
- A business rule was violated (duplicate order, insufficient balance).
- The authenticated user lacks permission.

These are returned as normal tool results with \`isError: true\` and a structured payload (Lesson 1). They represent real-world outcomes, and the *right* outcome may be to retry, escalate, or explain — which is exactly why they need structured fields.

### Why the distinction matters

The failure mode runs both directions. Smuggle a missing-record fact into a protocol error and the agent concludes its *arguments* were malformed, mutating inputs that were already correct. Bury a malformed-call (a genuine contract break) inside \`isError: true\` business prose and the agent retries a structurally impossible call forever. Each tier points the agent at a different repair, so the tier must match where the failure actually occurred.

### Worked example: \`check_availability(user_email)\`

Consider a calendar availability tool that accepts a required \`user_email\` parameter.

1. **Caller omits \`user_email\` entirely.** The call violates the input schema before execution begins. This is a **protocol error** (JSON-RPC error). The tool body never ran.
2. **Calendar API returns 404 — user does not exist in the system.** The tool was invoked correctly; the operation simply failed. This is a **tool execution error** with \`isError: true\`.
3. **Calendar API returns 503 — service temporarily down.** Again, the tool was invoked correctly. **Tool execution error** with \`isError: true\` (and a transient one — see Lesson 3).

### Weak vs strong: a missing backend record

**❌ Weak — promote a missing record to a protocol error**
\`\`\`json
{ "jsonrpc": "2.0", "error": { "code": -32602, "message": "Invalid params: user not found" } }
\`\`\`
This tells the agent its *arguments* were invalid. The agent may "fix" the email it sent — even though the email was correct and the user simply does not exist. Wrong layer, wrong repair.

**✅ Strong — report it as an execution error**
\`\`\`json
{
  "isError": true,
  "error_category": "business_rule",
  "retryable": false,
  "code": "user_not_found",
  "message": "No calendar user exists for the provided email."
}
\`\`\`
The contract was honored; the operation failed. The agent now knows not to mangle its inputs and can explain or escalate.

### Visual aid: which tier?

\`\`\`mermaid
flowchart TD
    Q1{"Did the call satisfy the protocol contract?<br/>(known tool, valid JSON-RPC,<br/>schema-required args present)"}
    Q1 -->|no| PE["Protocol Error<br/>(JSON-RPC error object)<br/>unknown tool / malformed /<br/>missing required param<br/>→ fix the CALL SHAPE"]
    Q1 -->|yes| Q2{"Did the underlying<br/>operation succeed?"}
    Q2 -->|no| EE["Tool Execution Error<br/>(isError: true)<br/>404 / 503 / business /<br/>permission / rate limit<br/>→ fix the WORLD / inputs / escalate"]
    Q2 -->|yes| OK["Normal success result"]
\`\`\`

### The cardinal rule

> Do not turn ordinary business failures into protocol failures. A missing backend record is not a JSON-RPC protocol error — it is a tool execution result with \`isError: true\`.

Protocol errors signal broken contracts. Execution errors signal real-world outcomes. Keep them separate.

> ❓ **Check yourself:** Your MCP server validates that \`order_id\` matches a known order *inside the tool body* and, when it doesn't, returns a JSON-RPC error with code -32602 (Invalid params) because "the parameter was effectively invalid." Why is this the wrong tier?
>
> *(The schema was satisfied and the tool body ran — that already makes it an execution error, not a protocol error. -32602 tells the agent its call shape was malformed, so it will mutate an \`order_id\` that was perfectly well-formed and simply pointed at a nonexistent order. "Unknown record" is a business outcome: return \`isError: true\` with \`error_category: business_rule\`, \`code: order_not_found\`. Protocol tier is only for failures that occur before execution begins.)*

### Key takeaways
- Protocol error = structurally broken call (front desk); execution error = valid call, failed operation (kitchen).
- Business failures (404, rate limit, permission denied, 503) are **always** execution errors, never protocol errors.
- The tier tells the agent which layer to fix — wrong tier sends it debugging the wrong layer.`,
      principles: [
        "Protocol error = broken call; execution error = valid call, failed op — wrong tier misdirects the agent.",
        "404, 503, rate limits, permission denials: always execution errors (`isError: true`), never protocol errors.",
      ],
      pitfalls: [
        "Raising a protocol error for a missing record makes the agent mutate correct inputs hunting for a call fix.",
        "If the tool body ran, the failure is an execution error — schema violations belong at the protocol layer only.",
      ],
    },
    {
      id: 'retry-responsibility',
      title: 'Retry Responsibility: Who Should Retry?',
      minutes: 8,
      body: `> **TL;DR** — Put retry logic where the information to decide lives. The tool retries transient blips invisibly; the model retries when *inputs* must change; a human approves when a retry could duplicate a side effect.

Retry belongs at whichever layer holds the information needed to make the failure succeed, because that is the only layer that can change the outcome. A transient network blip needs no new information — the *same* call will likely work — so the **tool** retries internally and never spends a model turn surfacing it. A malformed filter needs *different inputs*, which only the **model** or user can supply, so the tool surfaces structured detail and stops. A timed-out write needs a *policy judgment* about whether a duplicate side effect is acceptable, which only a **human** can make. Route the failure to a layer that lacks the deciding information and you either burn model turns retrying the unfixable or silently double-charge a customer.

### Error categories and their correct handler

| Category | Example | Correct handler |
|---|---|---|
| Transient infrastructure | Timeout, 503, connection reset | Retry **inside the tool** with backoff when safe |
| Permanent validation | Bad date format, invalid enum value, malformed ID | Surface immediately — model or user must correct input |
| Business rule | Not eligible, duplicate entry, insufficient balance | Non-retryable; agent returns user-facing explanation |
| Permission | Authenticated user lacks access | Non-retryable; return escalation path |
| Uncertain write state | Timeout after submitting payment | Report uncertainty; do not retry without idempotency check |

### Tool-level retry (the tool holds the piece)

Transient backend failures are the one case where **the tool itself should retry** before the model ever sees a failure. If a read-only API times out and 8 out of 10 immediate retries succeed within a second, returning the first failure to the model wastes a full model turn, costs latency and tokens, and may confuse the agent into telling the user "try again later" for something that would have worked on attempt two.

\`\`\`python
import time

def call_catalog_api(query, max_attempts=3):
    for attempt in range(max_attempts):
        try:
            response = catalog_client.search(query)
            return {"success": True, "results": response.items}
        except TransientTimeoutError:
            if attempt < max_attempts - 1:
                time.sleep(0.5 * (attempt + 1))  # simple backoff
            else:
                return {
                    "success": False,
                    "error_category": "transient",
                    "retryable": False,  # we already retried internally
                    "message": "Catalog service unavailable after 3 attempts."
                }
        except ValidationError as e:
            # Never retry validation errors — the model must change the input
            return {
                "success": False,
                "error_category": "validation",
                "retryable": False,
                "field": e.field,
                "message": e.message
            }
\`\`\`

Notice the final transient result is \`retryable: False\` — the tool already exhausted retries, so it would be wrong to invite the model to retry again.

### Model-level retry (the model holds the piece)

Validation and syntax errors require the **model** (or the user) to fix the input. The tool returns structured details; the agent reads them and either corrects the call or asks for clarification.

A bare \`retryable: true\` flag alone is **weaker** than actually retrying inside the tool, because it still costs a model turn *and* risks the agent retrying without changing anything. A flag is a suggestion; an internal retry is a guarantee. Prefer to retry transient failures inside the tool rather than exporting a boolean and hoping the agent does the right thing.

### Human approval (the human holds the piece)

Retry requires human approval when repeating the operation might:
- Duplicate a real-world side effect (charge a card, send a message) — see Lesson 4.
- Violate policy even if technically successful.

### Weak vs strong: a mixed-failure search tool

A \`search_catalog\` tool logs 12% failures: ~8% are transient timeouts (usually succeed on first retry) and ~4% are syntax errors in user-supplied filters (never succeed).

**❌ Weak — return both failure types identically**
\`\`\`json
{ "isError": true, "message": "Search failed. Please try again later." }
\`\`\`
The agent wastes turns retrying unfixable syntax errors, and tells users to "try again later" for timeouts that would have recovered instantly inside the tool. The same wrong handler is applied to two opposite problems.

**✅ Strong — split by who can fix it**
\`\`\`mermaid
flowchart LR
    FT["Transient Timeout<br/>(8% of failures)"] -->|"tool handles"| RT["Retry inside the tool<br/>with backoff<br/>→ surface only final outcome"]
    SE["Syntax Error<br/>(4% of failures)"] -->|"model handles"| RS["Surface immediately<br/>field + expected format<br/>→ model corrects or asks"]
\`\`\`
Each failure goes to the layer that holds the information to fix it. No wasted turns, no misleading "try later" advice.

### Visual aid: the retry decision flow

\`\`\`mermaid
flowchart TD
    F["Tool operation fails"]
    F --> Q1{"Transient infra failure<br/>(timeout / 503 / reset)<br/>on a safe operation?"}
    Q1 -->|yes| R1["Retry INSIDE the tool<br/>with backoff<br/>→ surface only final outcome"]
    Q1 -->|no| Q2{"Could a retry<br/>DUPLICATE a side effect?<br/>(charge / send / post)"}
    Q2 -->|yes| R2["Do NOT auto-retry<br/>→ HUMAN approval<br/>or idempotency key"]
    Q2 -->|no| Q3{"Does fixing it require<br/>DIFFERENT inputs?<br/>(validation / syntax / wrong id)"}
    Q3 -->|yes| R3["Surface structured detail<br/>→ MODEL corrects input<br/>or asks user"]
    Q3 -->|no| R4["Permanent business or<br/>permission failure<br/>→ non-retryable +<br/>explanation / escalation"]
\`\`\`

> ❓ **Check yourself:** A read-only tool hits a transient 503. One engineer wants the tool to retry internally with backoff; another wants it to return \`retryable: true\` and let the agent decide, arguing that "keeps retry policy visible to the orchestration layer." Which is correct, and what does the losing option actually cost?
>
> *(Retry inside the tool. The transient case needs no new information — the same call will likely work — so the deciding layer is the tool. Exporting \`retryable: true\` instead spends a full model turn surfacing a failure that would have cleared on attempt two, adds latency and tokens, and risks the agent retrying with no backoff or telling the user "try again later." A flag is a hint the agent may misuse; an internal retry is a guarantee. Visibility belongs in logs, not in a wasted turn.)*

### Key takeaways
- Retry belongs where the deciding information lives: tool (transient), model (input fix), human (side-effect/policy).
- Transient infrastructure failures should be retried inside the tool, invisibly to the model.
- Validation errors must surface immediately with field-level detail; they are never \`retryable: true\`.
- A \`retryable: true\` boolean is weaker than an actual internal retry — it costs a turn and the agent may retry blindly.`,
      principles: [
        "Retry transient infrastructure failures inside the tool invisibly — surfacing them wastes a model turn.",
        "Validation errors surface with `field`, `user_repair`, `retryable: false` — no backoff fixes malformed input.",
        "Retry that could duplicate a side effect requires human approval or an idempotency key.",
      ],
      pitfalls: [
        "Surfacing transient failures to the model instead of retrying inside the tool wastes turns and misleads users.",
        "Marking a validation error `retryable: true` causes the identical bad call to fail again every time.",
        "`retryable: true` is a hint; prefer retrying transients inside the tool and return `retryable: false` after.",
      ],
    },
    {
      id: 'uncertain-side-effects',
      title: 'Uncertain Side Effects and Idempotency',
      minutes: 9,
      body: `> **TL;DR** — A timeout *after* a write was submitted is not a failed write — the effect may already have happened. Never mark it retryable unless an idempotency key lets the server deduplicate.

A timeout tells you the response never arrived; it tells you nothing about whether the server acted. For a read that distinction is irrelevant — no side effect occurred, so re-issuing it cannot duplicate anything. For a write submitted *before* the timeout, the operation may have already succeeded on the server even though the acknowledgment was lost, so a blind retry can fire the effect twice: a double charge, a duplicate notification, a duplicate post. In your logs both look identical — a request went out, nothing came back — which is precisely the trap. Only the tool knows which kind of operation it performed, so the tool must encode that into the error rather than collapsing both into a generic transient failure the agent will happily retry.

### The dangerous scenario

A \`process_payment\` tool submits a charge to the payment processor. The network times out **after the request left the client**. The tool does not know whether:

- The processor never received the request (safe to retry).
- The processor received and processed it (retry = duplicate charge).

Returning a generic error here — especially one marked \`retryable: true\` — invites the agent to fire the same call again. The result can be a double charge, a duplicate notification, or a double post.

### Weak vs strong: the timed-out payment

**❌ Weak — generic transient error**
\`\`\`json
{ "isError": true, "error_category": "transient", "retryable": true, "message": "Request timed out." }
\`\`\`
This looks exactly like a safe read timeout. The agent retries, and the customer is charged twice. The fatal flaw: \`retryable: true\` on an operation whose outcome is genuinely unknown.

**✅ Strong — explicit uncertain-write result**
\`\`\`json
{
  "success": false,
  "error_category": "uncertain_write",
  "retryable": false,
  "code": "submission_timeout",
  "message": "Timeout after payment submission. Delivery status unknown. Payment may have been processed.",
  "safe_to_retry": false,
  "recommended_action": "Verify payment status via check_payment_status before retrying or escalating to the user."
}
\`\`\`
Key decisions:
- \`retryable: false\` — the tool explicitly declines to recommend retry.
- \`safe_to_retry: false\` — a second, redundant field so no single misread invites a retry.
- \`recommended_action\` — tells the agent what to do *instead*: a status lookup or user escalation.

### Idempotency keys: the real fix

The reliable long-term fix is designing write operations with **idempotency keys**. The client generates a unique key per logical operation and passes it on every attempt. The server detects a duplicate key and returns the result of the first execution rather than processing again — so a retry with the *same* key cannot double-apply the effect.

\`\`\`python
import uuid

def process_payment(order_id, amount_cents, currency):
    idempotency_key = f"payment-{order_id}-{uuid.uuid4()}"  # unique per intent
    try:
        result = payment_client.charge(
            amount=amount_cents,
            currency=currency,
            idempotency_key=idempotency_key
        )
        return {"success": True, "transaction_id": result.id}
    except TimeoutError:
        return {
            "success": False,
            "error_category": "uncertain_write",
            "retryable": True,  # safe to retry BECAUSE we pass the SAME idempotency key
            "idempotency_key": idempotency_key,
            "message": "Timeout after submission. Retry with the same idempotency_key is safe."
        }
\`\`\`

Critical detail: a retry must reuse the **same** key. Generating a *new* key on retry defeats the entire mechanism — the server sees a fresh operation and may charge again. Without a key, marking an uncertain write retryable is a design defect.

### Visual aid: read vs write timeout decision

\`\`\`mermaid
flowchart TD
    T["Timeout — no response received"]
    T -->|read| RD["No side effect possible<br/>RETRY SAFE<br/>(re-issue the read)"]
    T -->|write| Q1{"Did the request leave<br/>the client BEFORE<br/>the timeout?"}
    Q1 -->|no| NS["Never sent<br/>RETRY SAFE"]
    Q1 -->|yes| Q2{"Effect MAY have occurred<br/>Is an idempotency key<br/>in use?"}
    Q2 -->|yes| IK["Retry with SAME key<br/>→ server deduplicates<br/>RETRY SAFE"]
    Q2 -->|no| UW["uncertain_write<br/>retryable: false<br/>→ recommend status check"]
\`\`\`

| Situation | Retry safe? | Why |
|---|---|---|
| Read API times out before response | Yes | No side effect occurred |
| Write API times out before sending | Yes | Request never left the client |
| Write API times out after sending | No (without idempotency key) | Effect may have occurred |
| Write API times out after sending + idempotency key | Yes | Server deduplicates the same key |

> ❓ **Check yourself:** A \`process_payment\` tool already passes an idempotency key, so a teammate adds a retry-on-timeout wrapper that generates a fresh \`uuid4()\` key on each attempt "to keep every retry uniquely traceable." The first charge times out after submission; the wrapper retries. What happens, and what is the one-line fix?
>
> *(The customer can be charged twice. A new key on retry presents the processor with a brand-new logical operation, so its dedupe never fires and the timed-out-but-succeeded first charge is repeated. Idempotency only protects you when the *same* key is reused across attempts. Fix: generate the key once per logical payment and reuse it on every retry — trace attempts with a separate request id, never by rotating the idempotency key.)*

### Key takeaways
- A timeout after write submission is **not** a failed write — the effect may have occurred.
- Uncertain-write errors are never \`retryable: true\` unless an idempotency key is in use.
- Recommend a status check or user confirmation instead of automatic retry for uncertain writes.
- An idempotency key makes retry safe only when the **same** key is reused; a new key reintroduces the duplicate risk.`,
      principles: [
        "A write timeout after submission is not a failed write — use `uncertain_write`, not `transient`.",
        "Uncertain writes without an idempotency key must be `retryable: false` — retrying fires a duplicate operation.",
        "For uncertain writes recommend a status check; idempotency makes retry safe only when reusing the same key.",
      ],
      pitfalls: [
        "Marking post-submission write timeouts `retryable: true` — the agent retries and the side effect fires twice.",
        "Write timeouts differ from read timeouts — a submitted write may have succeeded even when no response arrived.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-classify-error',
      type: 'mcq',
      scenario: 'A tool calls a shipping API to book a delivery. The API returns HTTP 422 with a body: {"error": "Invalid postal code format for country CA — expected A1A 1A1"}.',
      question: 'Which error category applies and what should the tool return?',
      options: [
        'Transient infrastructure — retry inside the tool with backoff.',
        'Validation — return a non-retryable error with field and repair details so the model can correct or ask.',
        'Business rule — return a non-retryable error with a user-facing explanation and next steps.',
        'Protocol error — raise a JSON-RPC error because the call was structurally invalid.',
      ],
      answer: 1,
      explanation: 'HTTP 422 Unprocessable Entity indicates a validation failure — the input was well-formed but semantically wrong. The correct handler is a non-retryable structured error with the field ("postal_code") and the expected format so the agent or user can fix it. It is not transient (retrying the same value will fail again), not a business rule (the data is wrong, not the business state), and not a protocol error (the call reached the tool correctly).',
    },
    {
      id: 'ex-retry-decision',
      type: 'mcq',
      scenario: 'A notification tool calls a third-party SMS API to send a one-time passcode. The HTTPS request is sent and acknowledged at the TCP layer, but the tool receives a response timeout before the API replies with success or failure. The SMS API does not support idempotency keys.',
      question: 'What is the correct tool response?',
      options: [
        'Return retryable: true — timeouts are always transient.',
        'Throw an exception so the orchestration layer can decide.',
        'Return an uncertain-write error with retryable: false and recommend verifying delivery status before any retry.',
        'Return success: true — the TCP acknowledgment means delivery succeeded.',
      ],
      answer: 2,
      explanation: 'The request was sent; the SMS may or may not have been dispatched. Without an idempotency key, retrying risks a duplicate OTP. The tool must return an uncertain-write error with retryable: false and recommend a status check or user confirmation. A TCP ACK only confirms network receipt by the server process — it does not confirm that the SMS was queued or sent.',
    },
    {
      id: 'ex-error-type-mcq',
      type: 'mcq',
      scenario: 'A tool named `check_availability` requires a `user_email` parameter. A caller omits `user_email` entirely. The tool is invoked and the underlying calendar API returns 404 for a second call that did include a valid email. In a third call the calendar API returns 503.',
      question: 'Which statement correctly classifies all three outcomes?',
      options: [
        'All three are protocol errors because the tool failed to return a successful result in each case.',
        'The missing parameter is a protocol error; the 404 and the 503 are both tool execution errors returned with isError: true.',
        'The missing parameter and the 404 are validation errors; only the 503 is a protocol error.',
        'The 503 is a protocol error because the server rejected the request; the other two are execution errors.',
      ],
      answer: 1,
      explanation: 'A missing required parameter breaks the input schema before the tool body runs — that is a JSON-RPC protocol error. The 404 (user not found) and the 503 (service unavailable) both occur after the tool was invoked correctly; they are tool execution errors returned with isError: true. The 404 is non-retryable (missing record); the 503 is transient and should be retried inside the tool with backoff. Business or infrastructure failures that happen during execution are never protocol errors, regardless of the HTTP status code.',
    },
    {
      id: 'lab-payment-error',
      type: 'lab',
      title: 'Design a structured error result for a failed payment tool',
      brief: `A \`process_payment\` tool accepts \`order_id\`, \`amount_cents\`, \`currency\`, and \`customer_id\`. Design the **structured error result** (as a JSON object) the tool should return when a payment submission times out after the request has already been sent to the payment processor and no idempotency key was used.

Your design must:
1. Set the correct \`error_category\` value.
2. Clearly indicate whether the error is retryable and why.
3. Include a \`recommended_action\` field guiding the agent's next step.
4. Include a \`message\` field suitable for logging/debugging.
5. Avoid any field that might encourage the agent to automatically retry.

Paste your JSON error result below.`,
      placeholder: '{\n  "success": false,\n  "error_category": "...",\n  "retryable": ...,\n  ...\n}',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate structured error result designs for agent tools. Be concise (under 300 words). Give: (1) a score out of 10, (2) what the design gets right, (3) concrete fixes for any gaps. Focus on: correct error_category for an uncertain write, retryable set to false without an idempotency key, a recommended_action that prevents duplicate side effects, no fields that could be misread as an invitation to retry, and valid JSON structure.',
      evalTemplate: 'A learner submitted this structured error result design for a payment tool timeout-after-submission scenario:\n\n{{input}}\n\nReview it per your rubric. If it is not valid JSON, say so and show a corrected minimal example. Pay special attention to whether the design could lead an agent to retry unsafely.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'A weather tool calls an upstream forecast API. The API call fails with a connection error, and the tool returns an empty results array so the agent "has something to work with." What is the consequence?',
      options: [
        'The agent treats the empty array as "no forecast exists" and proceeds on false information.',
        'The agent correctly detects the failure because an empty array always implies an error.',
        'Nothing — an empty array is the safest neutral value to return on failure.',
        'The framework converts the empty array into a protocol error automatically.',
      ],
      answer: 0,
      explanation: 'An empty list means "success with zero matches," so returning [] on a backend failure is a silent lie: the agent concludes the data does not exist and moves on. That is exactly why it is wrong — the agent does NOT detect the failure, because an empty array signals success, not error. It is not a safe neutral value; it actively misleads the model. And nothing converts it to a protocol error — the tool simply reported false success. The failure must be surfaced explicitly with isError: true.',
    },
    {
      id: 'q2',
      question: 'A subscription-management tool throws an uncaught exception when a customer is not eligible for a refund. The agent then responds vaguely and cannot explain why. What is the recommended fix?',
      options: [
        'Add more text to the exception message so the stack trace is richer.',
        'Convert the eligibility failure into a JSON-RPC protocol error.',
        'Return the eligibility failure as a tool result with isError: true and a structured business_rule payload.',
        'Retry the call automatically a few times before giving up.',
      ],
      answer: 2,
      explanation: 'Expected business errors like ineligibility should be returned as tool results with isError: true and structured fields (error_category, code, customer_explanation, next_steps) so the agent can explain and act. Throwing exceptions is the root problem: frameworks often strip or obscure exception messages, which is why a richer stack-trace message does not help — the model may never see it. It is not a protocol error, because the call was structurally valid and the tool ran. Retrying is wrong because an ineligible customer stays ineligible no matter how many times the same call repeats.',
    },
    {
      id: 'q3',
      question: 'An MCP client calls check_availability but omits the required user_email parameter declared in the tool\'s input schema. How should this be reported?',
      options: [
        'As a tool execution error with isError: true and error_category "validation."',
        'As a JSON-RPC protocol error, because the call violated the input schema before execution.',
        'As an empty successful result, since no email means no availability to return.',
        'As an uncertain-write error, because the tool state is unknown.',
      ],
      answer: 1,
      explanation: 'A missing schema-required parameter makes the call structurally invalid before the tool body ever runs, which is precisely a JSON-RPC protocol error. It is not a tool execution error (isError: true), because execution errors require the tool to have been invoked correctly and the underlying operation to fail. It is not an empty success — a broken contract is not a "no matches" result. And it is not an uncertain write, since no operation was attempted at all; the contract was violated up front.',
    },
    {
      id: 'q4',
      question: 'A calendar tool is invoked correctly, but the upstream calendar API returns 404 because the user does not exist in the system. What is the correct classification?',
      options: [
        'A protocol error — the resource was not found, so the request was invalid.',
        'A silent empty result — return [] so the agent assumes the user has no events.',
        'A transient error — retry inside the tool with backoff until the user appears.',
        'A tool execution error (isError: true) — the call was valid but the operation failed.',
      ],
      answer: 3,
      explanation: 'A missing backend record is a real-world outcome of a correctly-invoked tool, so it is a tool execution error returned with isError: true. It is not a protocol error: the call was well-formed and reached execution; protocol errors signal broken contracts, not missing data. Returning [] would be a silent lie that hides the failure. And it is not transient — retrying with backoff will never make a non-existent user appear, so backoff just wastes turns.',
    },
    {
      id: 'q5',
      question: 'A read-only catalog search tool logs 12% failures: about 8% are transient timeouts that usually succeed on immediate retry, and about 4% are syntax errors in user-supplied filters that never succeed. What is the correct design?',
      options: [
        'Return both failure types identically and let the agent decide whether to retry.',
        'Mark both failure types retryable: true so the agent can re-attempt either one.',
        'Retry the transient timeouts inside the tool with backoff and surface only the final outcome; return the syntax errors immediately with the invalid field and expected format.',
        'Retry both failure types inside the tool with backoff before surfacing anything.',
      ],
      answer: 2,
      explanation: 'Transient timeouts that usually recover should be absorbed by the tool with internal backoff so only the final outcome surfaces, while syntax errors must surface immediately with field-level detail so the model can correct or ask. Returning both identically forces the agent to waste turns retrying unfixable syntax errors while telling users to "try again later" for fixable timeouts. Marking both retryable: true is wrong because the same bad filter syntax will fail every time. Retrying the syntax errors internally is equally pointless — they never succeed regardless of backoff.',
    },
    {
      id: 'q6',
      question: 'A tool returns a validation error with retryable: true after the user submitted a malformed order ID. The agent immediately re-issues the exact same call. What went wrong?',
      options: [
        'Nothing — the retryable flag correctly told the agent to retry.',
        'The error should have been retryable: false with field-level detail; the same malformed input will just fail again.',
        'The tool should have retried internally with backoff instead of returning anything.',
        'The error should have been raised as a protocol error so the agent stops.',
      ],
      answer: 1,
      explanation: 'Validation errors are permanent for the given input, so they must be non-retryable and carry field-level detail (field, expected format, user_repair) so the model corrects the input or asks the user. Marking it retryable: true caused the agent to repeat the identical bad call, which always fails again — so "nothing went wrong" is incorrect. Internal backoff retry is for transient infrastructure failures, not malformed input. And it is not a protocol error: the call was structurally valid; the value was simply semantically wrong.',
    },
    {
      id: 'q7',
      question: 'A process_payment tool submits a charge, then the network times out AFTER the request left the client. The payment processor does not support idempotency keys. What should the tool return?',
      options: [
        'retryable: true with error_category "transient" — timeouts are always safe to retry.',
        'success: true — the request was sent, so the charge can be assumed complete.',
        'An uncertain_write error with retryable: false recommending a status check before any retry.',
        'An empty result so the agent re-attempts the payment from scratch.',
      ],
      answer: 2,
      explanation: 'After submission the charge may or may not have gone through, so the tool reports an uncertain_write with retryable: false (and safe_to_retry: false) plus a recommended_action like verifying payment status before retrying or escalating. Marking it transient/retryable: true invites a duplicate charge — the central danger of uncertain writes. Assuming success is unsafe because the timeout means delivery status is genuinely unknown. Returning an empty result hides the failure and would prompt a re-attempt, again risking a double charge.',
    },
    {
      id: 'q8',
      question: 'A payment tool generates a unique idempotency key per logical charge and passes it to the processor on every attempt. The first submission times out after sending. How does this change the retry guidance?',
      options: [
        'It makes no difference — write timeouts are never retryable.',
        'A retry with the same idempotency key is safe, because the server deduplicates and returns the original result.',
        'The tool should now generate a new idempotency key for the retry to avoid collisions.',
        'The tool should treat it as a protocol error since the first attempt did not return.',
      ],
      answer: 1,
      explanation: 'With an idempotency key, retrying using the SAME key is safe: the server detects the duplicate and returns the result of the first execution instead of charging again, so retryable can correctly be true. The blanket "never retryable" rule applies only to uncertain writes without idempotency; the key is exactly what removes that constraint. Generating a NEW key for the retry defeats the mechanism — the server would see a fresh operation and could double-charge. And a write timeout is an execution outcome, not a protocol error.',
    },
    {
      id: 'q9',
      question: 'A read-only inventory lookup times out before any response is received. Compared with a write that times out after submission, why is retrying the read safe?',
      options: [
        'Reads are always faster, so a retry is cheaper.',
        'No side effect occurred, so re-issuing the read cannot duplicate anything.',
        'Reads automatically carry idempotency keys while writes do not.',
        'The read returns an empty array, which is always safe to repeat.',
      ],
      answer: 1,
      explanation: 'A read that times out before responding produced no side effect, so retrying it cannot duplicate or corrupt anything — that is the core distinction from a post-submission write timeout, where the effect may have already happened. Speed is irrelevant to safety. Reads do not automatically carry idempotency keys; safety here comes from the absence of a side effect, not from a key. And the safety has nothing to do with returning an empty array — surfacing [] on a failed read would itself be a silent lie.',
    },
    {
      id: 'q10',
      question: 'An upstream API responds 429 Too Many Requests to a read-only search tool. How should this be handled within the MCP error model?',
      options: [
        'As a JSON-RPC protocol error, since the request was rejected.',
        'As a tool execution error; rate limits are transient, so retry inside the tool with backoff before surfacing failure.',
        'As a permanent validation error returned non-retryable immediately.',
        'As an uncertain_write error, because the rate limiter may have partially processed the call.',
      ],
      answer: 1,
      explanation: 'A 429 occurs during execution of a structurally valid call, making it a tool execution error, and because rate limits are transient the tool should back off and retry internally before surfacing any failure. It is not a protocol error — the call was well-formed and reached the upstream service. It is not a permanent validation error; the input was fine and the same call can succeed once the limit clears. And on a read-only search there is no write side effect, so the uncertain_write category does not apply.',
    },
    {
      id: 'q11',
      question: 'A tool returns a structured error so the agent can branch its behavior. Which set of fields best supports that goal?',
      options: [
        'A single free-text message describing what happened.',
        'error_category, retryable, code, and (for validation) field plus user_repair.',
        'Only an HTTP status code forwarded from the upstream API.',
        'A boolean success flag and nothing else.',
      ],
      answer: 1,
      explanation: 'Machine-readable fields — error_category (why it failed), retryable (should the same call be tried again), code (for branching), and for validation field plus user_repair — give the agent the structure it needs to decide whether to retry, correct input, escalate, or stop. A single free-text message forces the model to parse prose and guess, which the lessons warn against. A bare upstream status code lacks the retry and category guidance the agent needs. A lone success boolean tells the agent that something failed but nothing about why or what to do next.',
    },
    {
      id: 'q12',
      question: 'An authenticated user calls a tool to modify a record, but their role lacks permission. How should the tool respond?',
      options: [
        'Retry inside the tool with backoff in case the permission is granted soon.',
        'Raise a JSON-RPC protocol error because the call should not have been allowed.',
        'Return a non-retryable tool execution error with an escalation or permission path.',
        'Return an empty result so the agent assumes there is nothing to modify.',
      ],
      answer: 2,
      explanation: 'A permission denial is a real-world outcome of a correctly-invoked tool, so it is a non-retryable tool execution error (isError: true) that should include an escalation or permission path for the agent to relay. Retrying with backoff is pointless because the role will not change between rapid attempts. It is not a protocol error: the call was structurally valid and reached execution. Returning an empty result would be a silent lie, hiding the access problem and misleading the agent into thinking there was simply nothing to act on.',
    },
    {
      id: 'q13',
      question: 'During a multi-step booking workflow, one tool call fails after several earlier steps already succeeded. What is the best graceful-degradation behavior?',
      options: [
        'Immediately escalate to a human and discard everything done so far.',
        'Report a flat success message so the user is not alarmed.',
        'Silently retry the failing step indefinitely until it succeeds.',
        'Explain what was verified, state what could not be completed, and offer next steps such as retry or escalation.',
      ],
      answer: 3,
      explanation: 'Graceful degradation means delivering useful partial progress: explain what is done, what is pending, and how to finish (retry, escalate, or notify). Escalating immediately and discarding completed work throws away progress the agent could still surface and answers nothing. A flat success message is dangerous because it claims completion the system has not achieved, and users especially resent later discovering an action silently failed. Silent indefinite retries hide the problem and waste effort — repeated identical failures are a signal to switch strategies, not retry harder.',
    },
    {
      id: 'q14',
      question: 'A tool keeps failing with the same error every time it is called with the same input. What does this pattern indicate the agent should do?',
      options: [
        'Increase the backoff interval and keep retrying the same call.',
        'Switch strategies — try a different tool, ask a clarifying question, or escalate — rather than burning more retries.',
        'Mark the error retryable: true so the orchestration layer retries faster.',
        'Return an empty result and continue as if the step succeeded.',
      ],
      answer: 1,
      explanation: 'Repeated identical failures on the same input signal that retrying harder will not help; the agent should change strategy — a different tool, a clarifying question, or escalation. Increasing the backoff and retrying the same call just delays the same guaranteed failure. Marking it retryable: true encourages exactly the futile re-attempts that are already failing. Returning an empty result and pretending success is a silent lie that hides the failure and corrupts the agent\'s downstream decisions.',
    },
    {
      id: 'q15',
      question: 'An extraction tool returns data that passes JSON schema validation but fails domain validation (the line items do not sum to the stated total). What is the most effective next step?',
      options: [
        'Re-send the exact same request unchanged and hope for a better result.',
        'Lower the temperature to 0 and retry the identical prompt.',
        'Send a correction request including the source, the previous extraction, and the exact validation errors.',
        'Accept the output, since it already passed JSON schema validation.',
      ],
      answer: 2,
      explanation: 'A validation-error feedback loop — re-prompting with the source, the prior invalid extraction, and the specific validation errors — is far more effective than blind retries because it tells the model exactly what to fix. Re-sending the same request unchanged just reproduces the same mismatch. Setting temperature to 0 only removes variability; it does not address the underlying total mismatch. Accepting the output is wrong because schema compliance proves shape, not semantic correctness — domain validation caught a real inconsistency that must be corrected.',
    },
  ],
}
