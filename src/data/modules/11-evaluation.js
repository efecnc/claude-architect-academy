export default {
  id: 'evaluation',
  num: 11,
  title: 'Iterative Refinement, Testing, and Evaluation',
  summary: 'How to build evaluation sets, write machine-checkable success criteria, run structured feedback loops, and iterate on prompts, schemas, and agent tools from real failures — so every iteration generalizes instead of papering over one bad run.',
  estMinutes: 36,
  tags: ['Evaluation', 'Testing', 'Iteration'],

  lessons: [
    {
      id: 'concrete-feedback',
      title: 'Why Concrete Feedback Is the Engine of Improvement',
      minutes: 9,
      body: `> **TL;DR** — The model can only fix what it can *locate*. Vague feedback ("handle edge cases better") gives it nothing to act on; a specific failing input, expected output, actual output, and the rule that was violated lets it fix exactly that.

Iterating on a Claude task is not retraining — you are changing the **information the model conditions on at generation time**. Feedback that names no specific point of failure adds no new information, so the model re-derives the output it produced before. This is the mechanism behind failed "please try harder" loops: nothing in the request actually changed. A diffuse complaint widens the target and provokes diffuse, often regressive edits; a located defect — input, expected, actual, violated rule — narrows it to a single repairable point. The fix is executable in the same way a precise bug report is: the model walks straight to the line instead of guessing.

Concrete, executable feedback contains, at minimum:

- The **specific failing input** (or a minimal reproduction of it).
- The **expected output** and the **actual output**, side by side.
- The **validation error**, or the **failing test name with its assertion message**.
- The **source excerpt** that triggered the failure, paired with the *rule* that was violated ("the source says \"maintenance entries\", the schema key is \`service_visits\` — map them").

### The five-step coding loop

For code-generation tasks, this structure converges faster than anything else:

1. Define behavior with **tests or examples** *before* generating code.
2. Ask for the **smallest useful implementation** — not a full system.
3. **Run the tests** unmodified.
4. Feed back the **exact failures** — test name, assertion, and actual output.
5. **Iterate one failure class at a time** so each change is measurable.

The ordering matters: tests-first means you have a success criterion *before* the model writes a line, and "smallest useful" keeps the surface area small enough that a failure is easy to localize.

### When requirements are unclear

For tasks touching **caching strategy, real-time architecture, auth changes, or data-consistency** requirements, ask Claude to **surface the decisions that need to be made** before implementing. A short requirements "interview" prevents the expensive late rewrite that happens when an unstated assumption turns out wrong.

### Weak vs strong feedback

**❌ Weak — diffuse complaint**

> "The output doesn't look right. Please handle edge cases
>  better and improve error handling."

The model has no failing input, no expected value, no error. It guesses, often rewriting code that already worked.

**✅ Strong — located defect**

> "Test test_parse_empty_payload fails:
>    KeyError: 'order_id' at line 42.
>  Input: {} (empty payload).
>  Expected: return {"order_id": null}, not raise.
>  Fix only this path; leave the populated-payload path alone."

The model walks straight to line 42 and fixes the one path.

### Visual aid: located vs diffuse feedback

\`\`\`mermaid
flowchart LR
    A["Diffuse feedback<br/>make it better"] --> B["Model re-derives<br/>same output"]
    B --> C["OR rewrites<br/>working code"]
    C --> D["Regression"]
    E["Located feedback<br/>this input → expected value<br/>got wrong value, rule broken<br/>violated at line 42"] --> F["Model edits<br/>exactly one point"]
    F --> G["Fix"]
\`\`\`

> ❓ **Check yourself:** You tell Claude "the dates are wrong, fix the parsing," and three retries later they are still wrong. The model is capable of the task. What single property is your feedback missing, and what is the minimum you must add to make the next retry behave differently?
>
> *(A located defect. With no failing input, no expected-vs-actual date, and no source excerpt, every retry conditions on the same request and re-derives the same output. Add one concrete case — the source text, the wrong value produced, and the correct value — so the model has a new point to fix.)*

### Key takeaways
- The model fixes what it can **locate** — supply failing input, expected, actual, and the violated rule.
- Use the **five-step loop**: define behavior with tests, smallest implementation, run, feed back exact failures, one class at a time.
- For ambiguous requirements (caching, auth, consistency), have Claude **surface decisions first**.`,
      principles: [
        "Give the model a specific failing input, expected output, and actual output — vague feedback re-derives it.",
        "Iterate one failure class at a time; simultaneous fixes hide which change caused a new regression.",
        "For ambiguous requirements (caching, auth, consistency), have Claude surface decisions before coding.",
      ],
      pitfalls: [
        "\"Handle edge cases better\" is unlocatable — name the specific input, actual output, and expected output.",
        "Requesting a full rewrite after a narrow failure breaks passing paths; give the exact failing test instead.",
        "Fixing multiple failure classes at once hides regression sources — address one class, verify, then proceed.",
      ],
    },
    {
      id: 'eval-sets',
      title: 'Building Evaluation Sets That Actually Measure What Matters',
      minutes: 9,
      body: `> **TL;DR** — An eval set is a curated collection of (input, expected-output, machine-checkable success-criterion) cases you run repeatedly. It is the single most valuable asset for maintaining a Claude system over time — but only if it covers edge cases and you read it *by segment*, not just as one aggregate number.

An eval set is a regression test suite for **non-deterministic behavior**: each case is an (input, expected-output, criterion) tuple the system must keep passing as you tweak prompts, schemas, and models. Eyeballing a few outputs feels productive but fails on three counts that a frozen set fixes by construction — it is **not repeatable** (you sample different examples each time), it has **no pass/fail line** (so "looks fine" drifts), and it **cannot detect regressions** (there is no recorded baseline to diff against). Without that baseline, a prompt change that fixes invoices can silently break contracts and you will not know until a customer reports it.

### What makes a *good* eval set

A strong set deliberately covers:

- **Representative cases** drawn from real production data (anonymized as needed).
- **Edge and adversarial inputs** — unusual formatting, missing fields, conflicting signals.
- **Past failure cases** — every bug that reaches production becomes a permanent eval case.
- **High-impact fields** that drive business decisions, not just the fields that are easy to extract.

A *weak* set only covers happy-path inputs and asserts the code "does not throw." That buys you coverage width with no depth — green checks that catch nothing.

### Segmented evaluation: aggregate accuracy lies

A pipeline that is **97% accurate overall** can still fail catastrophically on one high-impact field or document type. Always slice the metric:

| Dimension | Why it matters |
|---|---|
| Document type | Contract vs invoice vs email — different field density |
| Field name | \`total_amount\` may be 99% right while \`discount_applied\` is 60% |
| Prompt version | Did the latest prompt change help or regress? |
| Model | Larger vs smaller model — cost/accuracy tradeoff |
| Source quality | Scanned PDF vs clean HTML — different noise profiles |
| Confidence band | High-confidence outputs *should* be more accurate |
| Reviewer correction category | Systematic error or one-off? |

### Machine-checkable success criteria

For each case, write a criterion a script can evaluate — not a narrative:

\`\`\`python
# Exact-match criterion
assert result["order_id"] == expected["order_id"]

# Type + range criterion
assert isinstance(result["amount"], float) and result["amount"] >= 0

# Enum membership criterion
assert result["category"] in {"billing", "shipping", "product", "other"}

# Presence criterion for a nullable field (key must exist, value may be null)
assert "reviewer_notes" in result
\`\`\`

Human-rater rubrics are appropriate when machine checks cannot capture quality (tone, reasoning quality), but machine checks should be your **first** tool — they are cheap and repeatable.

### Weak vs strong eval design

**❌ Weak — eyeball one output**

> Run the pipeline on a fresh invoice, glance at the JSON,
> say "looks right", ship the prompt change.

No baseline, no pass line, no segmentation. A regression on contracts ships undetected.

**✅ Strong — held-out set with explicit pass criteria**

> 40 cases: 20 invoices, 12 contracts, 8 emails — incl. 6 past
> production bugs and 4 adversarial inputs.
> Each case has an assert-style criterion.
> Pass bar: 100% on regression cases, >=95% per segment.
> Run on EVERY prompt/schema change; diff against baseline.

### Visual aid: eval-set design table

| Case | Segment | Input trait | Success criterion |
|---|---|---|---|
| case-01 | invoice / happy | clean, all fields | exact-match all fields |
| case-07 | invoice / edge | missing total | total field is null |
| case-12 | contract / adversarial | 2 conflicting terms | schedule in enum; flagged |
| case-18 | email / quality | noisy scanned text | high-impact fields exact |
| **case-23** | **regression** | past production bug #441 | MUST pass (locked baseline) |

> ❓ **Check yourself:** A dashboard reads 97% aggregate accuracy, and the team wants to raise the auto-approval threshold on that basis. The number is real. Why can it still be the wrong basis for the decision, and what would you compute before agreeing?
>
> *(Failures cluster, so the 97% can average over a high-impact field or document type sitting at ~60% — exactly the cases auto-approval would now wave through. Slice accuracy by field, document type, and source quality and gate the threshold on the worst relevant segment, not the mean.)*

### Key takeaways
- An eval set is a **repeatable, pass/fail, regression-aware** suite for non-deterministic behavior — far better than eyeballing.
- Cover **edge, adversarial, and past-failure** cases; every production bug becomes a permanent case.
- **Segment** your metrics and prefer **machine-checkable** criteria over narrative rubrics.`,
      principles: [
        "Every production bug becomes a permanent eval case — the set grows with real signal and guards regressions.",
        "Segment accuracy by field, doc type, and prompt version — aggregates hide the failures that matter most.",
        "Machine-checkable (assert-style) criteria beat narrative rubrics — cheap, repeatable, unambiguous pass/fail.",
      ],
      pitfalls: [
        "Happy-path-only sets skip edge and adversarial inputs — add unusual formatting, missing fields, and past bugs.",
        "Aggregate accuracy can hide a 60%-correct high-impact field — always segment before changing any threshold.",
        "Stale eval sets give false confidence — prune obsolete cases quarterly and add one per production bug.",
      ],
    },
    {
      id: 'agent-testing',
      title: 'Testing Agent Behavior and Tool Use',
      minutes: 9,
      body: `> **TL;DR** — Testing a tool-calling agent is not the same as testing text generation. The agent decides *whether* to call a tool, *which* tool, and *what inputs* to pass — and all three fail independently. Assert on the tool-call trace, not just the final answer.

A tool-calling agent makes three decisions that fail independently — *whether* to call a tool, *which* one, and *what inputs* to pass — and the final text answer collapses all three into a single observation. Asserting only on that answer cannot distinguish a correct result from a lucky one that skipped a required tool, and it discards the exact signal you need to localize the fault. The tool-call trace is the agent's working: assert on it, and a failure points you at a specific layer instead of leaving you to guess.

### What can go wrong (and they are independent)

For each agent eval case, check:

1. **Tool selection** — did it choose the right tool, or hallucinate a tool name, skip one, or call an unnecessary one?
2. **Input parameters** — type-correct, within valid ranges, and semantically sensible for the input?
3. **Multi-step sequencing** — did steps occur in the right order, and did it feed one tool's output into the next correctly?
4. **Refusal behavior** — when the input is out of scope, did it decline rather than fabricate a plausible-but-wrong answer?

### Isolating failures by tracing the call

When the final answer is wrong, walk back through the trace. *Where* it breaks tells you *what* to fix:

\`\`\`mermaid
flowchart TD
    In["Input"] --> TA{"Tool A<br/>called?"}
    TA -->|"skipped → fix routing<br/>(prompt or tool_choice)"| Skip["Routing<br/>failure"]
    TA -->|called| PA{"Correct<br/>params?"}
    PA -->|"wrong → fix tool schema<br/>or when-to-use description"| WP["Schema<br/>failure"]
    PA -->|correct| TB["Tool B"]
    TB --> Ans{"Final answer<br/>correct?"}
    Ans -->|"wrong → fix result-merge<br/>synthesis logic"| WS["Synthesis<br/>failure"]
    Ans -->|correct| OK["Success"]
\`\`\`

- Tool A **skipped** → routing prompt or \`tool_choice\` (the *whether*).
- Tool A called with **wrong params** → the tool schema or its when-to-use description (the *what inputs*).
- Tool A correct but **final answer wrong** → how the agent synthesizes results.

Diagnose *before* you change anything — otherwise you fix a layer that was never broken.

### Code review agents need explicit criteria

A review agent is only useful with a clear report contract:

- **What findings matter:** bugs, security, correctness, data loss, missing tests, incompatible API changes.
- **What to skip:** minor style preferences, already-accepted conventions, speculative performance advice.
- **Few-shot beats vague rules:** to cut false positives, *show* acceptable code next to genuinely problematic code. "Be conservative" underperforms badly.
- **Capture dismissals:** when a developer dismisses a finding, record *why* via structured fields like \`detected_pattern\`, \`rule_id\`, \`evidence\` — that is calibration data, not noise.

### Test-generation quality

Claude-generated tests are low value when they only assert code "does not throw," duplicate existing coverage, ignore project fixtures in favor of invented mocks, test implementation details instead of behavior, or miss error paths. Fix this by documenting test standards in a project memory or testing guide — with examples of valuable behavioral tests vs. trivial ones, and the fixture names and their intended use.

### Weak vs strong agent test

**❌ Weak — final answer only**
\`\`\`python
assert agent_response_text == "Your order ships Tuesday."
\`\`\`
Passes even if the agent guessed without calling \`lookup_shipping\`. When it later breaks, you have no idea which layer failed.

**✅ Strong — assert the trace**
\`\`\`python
assert "lookup_shipping" in tools_called
assert tools_called["lookup_shipping"].input == {"order_id": "8842"}
assert tools_called.index("lookup_shipping") < tools_called.index("format_reply")
assert "Tuesday" in final_text
\`\`\`

> ❓ **Check yourself:** An agent returns a wrong answer. The trace shows Tool A was never called, though it clearly should have been. Name the failing layer, and state the trace signature that would instead point to the schema layer or the synthesis layer.
>
> *(Routing / \`tool_choice\`: the agent never decided to invoke the tool, so the *whether* failed. A schema fault has a different signature — the tool *was* called but with wrong or out-of-range parameters. A synthesis fault has yet another — every tool ran correctly, yet the final answer is still wrong. The trace position of the break names the layer.)*

### Key takeaways
- Assert on **tool selection, parameters, and sequencing** — not just the final answer.
- **Trace** the failure to a specific layer before changing anything.
- Review agents need **explicit report criteria** and **few-shot examples**; capture dismissals as calibration data.`,
      principles: [
        "Assert tool selection, params, and order — each fails independently; only the trace reveals which layer broke.",
        "Trace agent failures to the specific layer (routing, schema, synthesis) before changing anything.",
        "Few-shot examples of acceptable vs. problematic code cut review-agent false positives better than vague rules.",
      ],
      pitfalls: [
        "Asserting only the final answer discards the tool-call trace — also assert tool name, inputs, and call order.",
        "Tests that only assert \"does not throw\" give width with no depth — document behavioral standards and fixtures.",
        "Ignoring review-agent dismissals loses calibration signal — log them with structured fields for few-shots.",
      ],
    },
    {
      id: 'structural-fixes',
      title: 'When to Iterate on Prompts, Schemas, and Tools',
      minutes: 9,
      body: `> **TL;DR** — A failure that recurs across many different inputs is *structural* — fix the prompt, schema, or tool. A rare one-off is a coverage gap — add it to the eval set. Retrying the same prompt on a recurring defect cannot work: the same prompt has no reason to produce a different result.

The first diagnostic question on any failure is whether it recurs across many different inputs or happened on one unusual case — and that answer determines the fix. A defect that appears input after input is not the model "forgetting"; it is the model applying a **consistent interpretation of the current prompt**. A retry resends that same prompt, so it re-derives the same interpretation — there is no mechanism for a different result. Only a change to the base behavior shifts the output: a few-shot example, a sharper field description, a tool split, a newly surfaced field. **Prompt-level fixes generalize; per-instance retries do not.** A rare one-off, by contrast, is a coverage gap — record it in the eval set and decide whether special-casing earns its keep.

### Matching the fix to the pattern

| Pattern | Appropriate response |
|---|---|
| Same defect on many different inputs | Structural fix: prompt rewrite, schema change, few-shot example, tool split |
| Rare one-off on a very unusual input | Add it to the eval set; decide if special-casing is worth it |
| Failure correlated with a specific document type | Segment the eval; consider a sub-prompt or routing step |
| Failure on a specific field+value combination | Refine the field description or replace a free string with an enum |

### When to split a tool

Split a tool when it has large optional sections irrelevant to most inputs, when **two very different schema shapes compete inside one tool**, or when routing between variants forces the model to reason about which fields apply — that reasoning is error-prone and belongs in your application logic, encoded by the schema itself.

### When to add a few-shot example

Add one when a specific output pattern keeps being produced wrong despite a clear description, when the expected format is unusual enough that a description alone is ambiguous, or when you have a real, representative input/output pair from production to show.

### Confidence and calibration

If your pipeline emits a confidence score, **calibrate it against labeled eval data** before using it to route. An uncalibrated "0.95" that is actually right only 60% of the time causes worse decisions than having no score at all — it lends false certainty to bad outputs.

### Infrastructure vs. examples

A common trap is reaching for infrastructure (routing layers, fallback chains, re-rankers) *before* exhausting prompt and schema improvements. Prompt/schema changes are cheaper to build, easier to version, and faster to test. Add infrastructure only after confirming prompt-level fixes cannot solve the recurring pattern.

### Weak vs strong response to a recurring defect

**❌ Weak — retry the same prompt**

> payment_terms wrong on 38 of 200 invoices (always "NET30").
> Fix attempt: re-run those 38 with the identical prompt,
> then wrap them in a retry loop with backoff.

Same prompt, same interpretation — the 38 stay wrong.

**✅ Strong — structural fix**

> 38/200 is a consistent misinterpretation, not noise.
> Add few-shot examples for "NET60" and "Due on receipt";
> sharpen the payment_terms description; re-run the eval set
> and confirm no regression on the other segments.

### Visual aid: the build → measure → iterate loop

\`\`\`mermaid
flowchart TD
    BUILD["BUILD<br/>prompt / schema / tool"] --> MEASURE["MEASURE<br/>run eval set by segment"]
    MEASURE --> DIAGNOSE{"DIAGNOSE<br/>recurring failure?"}
    DIAGNOSE -->|yes| STRUCT["Structural fix<br/>prompt / schema / tool"]
    DIAGNOSE -->|no| COVERAGE["Add to eval set<br/>coverage gap"]
    STRUCT --> ITERATE["ITERATE<br/>targeted change<br/>confirm fix + no regression"]
    COVERAGE --> ITERATE
    ITERATE --> BUILD
\`\`\`

> ❓ **Check yourself:** A field is extracted incorrectly on 38 of 200 production inputs, always the *same* wrong value. Why is a retry loop with backoff structurally unable to fix this, and what class of change can?
>
> *(A retry resends the identical prompt, which has no mechanism to produce a different interpretation — backoff only delays the same wrong value. The "always the same value" pattern marks a consistent misinterpretation, i.e. a structural defect. Only a change to the base behavior moves it: a few-shot example, a sharper field description, or replacing a free string with an enum — and it generalizes to inputs you have not seen.)*

### Key takeaways
- **Recurring** failure → structural fix (prompt/schema/tool); **one-off** → eval coverage. Retries cannot fix recurring defects.
- **Calibrate** confidence scores against labeled data before routing on them.
- **Exhaust prompt/schema fixes before adding infrastructure** — they are cheaper, versionable, and generalize.`,
      principles: [
        "Recurring failures need a structural fix (few-shot, schema, split) — retrying the same prompt changes nothing.",
        "Calibrate confidence scores against labeled data before routing — an uncalibrated score can mislead badly.",
        "Exhaust prompt/schema fixes before adding infrastructure — they are cheaper, versionable, and generalize.",
      ],
      pitfalls: [
        "Retrying a recurring defect with the same prompt changes nothing — fix few-shots or the schema instead.",
        "Routing on uncalibrated confidence scores causes systematic misrouting — compare to labeled eval data first.",
        "Adding infrastructure before fixing prompts/schema bakes in the defect — exhaust prompt fixes first.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-feedback-quality',
      type: 'mcq',
      scenario: "Your extraction pipeline keeps returning `null` for the `discount_applied` field even though several invoices in your test set clearly contain discount lines. You want to give feedback that will let Claude fix this.",
      question: "Which feedback will be most effective?",
      options: [
        "\"The discount field is not working correctly.\"",
        "\"Please handle edge cases better when parsing invoice fields.\"",
        "\"For invoice INV-2041, `discount_applied` returned null. The source contains 'DISC 10%' in line 7. Expected: `{ \\\"discount_applied\\\": 0.10 }`.\"",
        "\"Rewrite the extraction logic from scratch.\"",
      ],
      answer: 2,
      explanation: "Effective feedback provides the specific failing input, the actual output, the source excerpt, and the expected result. Options A and B are too vague to locate the failure. Option D triggers a full rewrite rather than a targeted fix.",
    },
    {
      id: 'ex-eval-match',
      type: 'mcq',
      scenario: "Your pipeline shows 97% overall accuracy across 500 invoices and contracts. A teammate says the number is strong enough to raise the automation threshold without further investigation.",
      question: "Why is aggregate accuracy alone an insufficient basis for raising the automation threshold?",
      options: [
        "Accuracy metrics are only valid when computed on a training set, not a held-out eval set.",
        "A 97% aggregate can hide a specific high-impact field or document type that is far less accurate — for example 60% on `discount_applied` — because failures cluster in segments.",
        "Aggregate accuracy requires human raters to be meaningful, so machine-checked numbers cannot be trusted.",
        "The threshold should always be raised gradually regardless of any accuracy metric.",
      ],
      answer: 1,
      explanation: "Aggregate accuracy hides clustered failures. A field that drives financial decisions could be 60% correct while the overall number looks healthy. Segmenting by field name, document type, source quality, and prompt version is required before drawing any conclusions or changing thresholds.",
    },
    {
      id: 'ex-fix-type',
      type: 'mcq',
      scenario: "You have run your invoice extraction pipeline on 200 production invoices. The field `payment_terms` is extracted incorrectly on 38 of them — always producing \"NET30\" regardless of what the document says.",
      question: "What is the most appropriate next step?",
      options: [
        "Retry those 38 invoices with the same prompt and hope the model produces a different result.",
        "Add a retry loop with exponential backoff.",
        "Treat this as a structural problem — add a few-shot example showing the correct extraction for a \"NET60\" and \"Due on receipt\" invoice, or refine the field description.",
        "Switch to a different model version immediately.",
      ],
      answer: 2,
      explanation: "A defect that recurs across 38 of 200 inputs is not a one-off — the prompt is producing a consistent wrong interpretation. A structural fix (few-shot example or improved description) changes the base behavior. Retrying with the same prompt has no mechanism to produce a different result.",
    },
    {
      id: 'ex-agent-order',
      type: 'mcq',
      scenario: "An agent returns a wrong final answer. You pull the tool-call trace and discover that Tool A — which should have been the first step — was never invoked. Tool B ran and produced output, but the final answer is still wrong.",
      question: "Which layer does the failure most likely live in, and what should you fix?",
      options: [
        "Answer-synthesis layer — the agent called the right tools but merged results incorrectly; fix the synthesis logic.",
        "Tool B's schema — the wrong parameters were passed to Tool B; fix the schema description.",
        "Routing layer — the agent never decided to invoke Tool A; fix the routing prompt or tool_choice configuration.",
        "Eval harness — the trace is mislabeled; no fix is needed in the agent itself.",
      ],
      answer: 2,
      explanation: "A tool that was never called points to the routing layer: the routing prompt or tool_choice configuration governs whether a tool is invoked. A schema failure shows up as wrong parameters on a tool that was called. A synthesis failure appears when all tools ran correctly but the final answer is still wrong. The eval harness detected the problem — it did not cause it.",
    },
    {
      id: 'lab-eval-design',
      type: 'lab',
      title: 'Design an eval set and success criteria for an extraction agent',
      brief: `You are building an agent that extracts structured data from **freelance contract documents**. The agent uses a tool called \`extract_contract\` and must return:

- \`client_name\` (string)
- \`project_description\` (string, max 200 chars)
- \`total_value\` (number, USD, nullable if not stated)
- \`payment_schedule\` (enum: \`"upfront"\`, \`"milestone"\`, \`"net30"\`, \`"net60"\`, \`"other"\`)
- \`requires_nda\` (boolean)

**Your task:** Design an eval set for this agent. Your submission should include:

1. **At least 4 eval cases** — at minimum one happy-path case, one case with a missing \`total_value\`, one case with an unusual payment schedule, and one adversarial case (e.g., a document that mentions multiple contradictory payment terms).
2. **A machine-checkable success criterion** for each case (Python assert-style or written assertion).
3. **A list of the segmentation dimensions** you would track in production.

Paste your eval set design below.`,
      placeholder: '# Eval Set: Freelance Contract Extraction\n\n## Case 1 — Happy path\nInput: ...\nExpected output: { ... }\nSuccess criteria: assert result["client_name"] == "...", assert result["payment_schedule"] in {...}\n\n## Case 2 — Missing total_value\n...',
      system: 'You are a strict reviewer for the Claude Certified Architect exam, evaluating eval set designs for extraction agents. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is strong about the design, (3) specific gaps or improvements. Evaluate against: coverage of edge cases and adversarial inputs, machine-checkable criteria (not just narrative), correct use of enum membership checks and nullable field assertions, and whether the segmentation dimensions are operationally meaningful. If the submission does not include multiple distinct cases or success criteria, say so explicitly and give a corrected minimal example for one case.',
      evalTemplate: 'A learner submitted this eval set design for a freelance contract extraction agent:\n\n{{input}}\n\nReview it per your rubric. Focus on case diversity, machine-checkable success criteria, and segmentation strategy. If any case lacks an explicit success criterion, flag it and show what a correct criterion looks like.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: "A teammate reviews an extraction output and tells Claude \"the output doesn't look right, please handle edge cases better.\" Several iterations later the same field is still wrong. What is the root problem with this feedback?",
      options: [
        "The feedback should have been sent as a system prompt rather than a user message.",
        "The feedback is too vague for the model to locate the specific failure, so it has nothing concrete to fix.",
        "Edge-case handling can only be fixed by switching to a larger model.",
        "The feedback asked for too small a change instead of a full rewrite.",
      ],
      answer: 1,
      explanation: "Correct: the model can only fix what it can locate; \"handle edge cases better\" names no failing input, expected output, or actual output, so each retry re-derives the same result. \"System vs user message\" is wrong because the delivery channel is not the issue — the content is. \"Switch to a larger model\" is wrong because a feedback-quality problem is not a capability problem. \"Too small a change / full rewrite\" is backwards: a narrow failure calls for a targeted fix, and broad rewrites tend to introduce new regressions.",
    },
    {
      id: 'q2',
      question: "You are about to ask Claude to generate code for a feature that involves a new caching strategy and some data-consistency requirements that have not been fully pinned down. What is the recommended first step?",
      options: [
        "Ask Claude to surface the decisions that need to be made before it starts implementing.",
        "Ask Claude for the full production-ready system in one pass to save iterations.",
        "Generate the code first and add tests only after it runs without errors.",
        "Set a lower temperature so the implementation is more deterministic.",
      ],
      answer: 0,
      explanation: "Correct: for genuinely ambiguous requirements (caching, real-time architecture, auth, data consistency), having Claude surface the decisions first prevents costly late rewrites from assumption mismatches. \"Full system in one pass\" is wrong because it invites exactly those mismatches; the loop favors the smallest useful implementation first. \"Tests only after it runs\" is wrong because behavior should be defined with tests before generating. \"Lower temperature\" is wrong: temperature controls variability, not requirement clarity.",
    },
    {
      id: 'q3',
      question: "A developer reports a production bug: one customer's invoice was extracted with the wrong total. After fixing the immediate issue, what should you also do to strengthen your evaluation?",
      options: [
        "Increase aggregate accuracy reporting frequency to weekly.",
        "Remove the failing invoice from production data so it cannot recur.",
        "Add the failing case to the eval set so the same bug is caught on future runs.",
        "Raise the model's temperature to add output diversity.",
      ],
      answer: 2,
      explanation: "Correct: every bug that reaches production should become a permanent eval case, so the set grows with real signal and guards against regressions. \"Report aggregate accuracy weekly\" is wrong because more frequent aggregate reporting does not capture the specific failure. \"Remove the failing invoice\" is wrong because it deletes the exact signal you want to retain. \"Raise temperature\" is wrong: it adds variability without addressing the defect.",
    },
    {
      id: 'q4',
      question: "A new eval set was assembled entirely from clean, well-formatted documents and asserts only that the extraction code \"does not throw.\" What is the main weakness of this set?",
      options: [
        "It gives coverage width without depth and will not catch edge-case or adversarial failures.",
        "It will run too slowly because clean documents are large.",
        "It cannot be versioned alongside the prompt.",
        "It requires human raters for every case.",
      ],
      answer: 0,
      explanation: "Correct: a happy-path-only set that just checks \"does not throw\" provides width without depth and misses the edge, adversarial, and past-failure cases that actually break pipelines. \"Too slow\" is wrong because speed is not the concern here. \"Cannot be versioned\" is wrong because any eval set can be versioned. \"Requires human raters\" is wrong: machine-checkable criteria are preferred — the real problem is that the assertions are too shallow to detect wrong values.",
    },
    {
      id: 'q5',
      question: "For an eval case checking a field that may legitimately be absent in some sources (value can be null but the key must always be present), which success criterion best expresses the requirement?",
      options: [
        "assert result[\"reviewer_notes\"] is not None",
        "assert result[\"reviewer_notes\"] == expected[\"reviewer_notes\"]",
        "assert \"reviewer_notes\" in result",
        "assert len(result[\"reviewer_notes\"]) > 0",
      ],
      answer: 2,
      explanation: "Correct: a presence criterion checks the key exists without requiring a non-null value — exactly right for a nullable field. \"is not None\" is wrong because it contradicts a field that may legitimately be null. The exact-match assertion is wrong because the legitimate value may be null and vary per source. \"len > 0\" is wrong because it forces a non-empty value, which a nullable field does not guarantee.",
    },
    {
      id: 'q6',
      question: "Your pipeline reports 97% overall accuracy and the team wants to raise the automation threshold. Why is the aggregate number an insufficient basis for that decision?",
      options: [
        "Accuracy is only valid when measured at exactly 100% of cases.",
        "97% means 3% of outputs are hallucinated tool calls.",
        "Aggregate accuracy is only meaningful when computed on the training data.",
        "A 97% aggregate can hide a high-impact field or document type that is far less accurate, such as 60%.",
      ],
      answer: 3,
      explanation: "Correct: failures cluster in segments, so a field that drives key decisions could be 60% correct while the overall number looks healthy. \"Only valid at 100% coverage\" is wrong because accuracy does not require full coverage to be valid. \"3% are hallucinated tool calls\" is wrong because it invents a meaning the number does not carry. \"Only meaningful on training data\" is wrong: the issue is segmentation, not the data split.",
    },
    {
      id: 'q7',
      question: "You want to evaluate quality dimensions like tone and reasoning quality that a simple equality check cannot capture. What is the appropriate role of human-rater rubrics here?",
      options: [
        "Use human rubrics for everything, since machine checks are unreliable.",
        "Avoid human rubrics entirely and approximate tone with a regex.",
        "Use human rubrics where machine checks cannot capture the quality, but make machine-checkable criteria your first tool.",
        "Replace all eval cases with human review once tone matters.",
      ],
      answer: 2,
      explanation: "Correct: human rubrics fit cases machine checks cannot capture (tone, reasoning), but machine checks should be the first tool because they are cheap and repeatable. \"Human rubrics for everything\" is wrong because it wastes effort on cases machine checks handle well. \"Approximate tone with a regex\" is wrong because a regex cannot meaningfully judge tone. \"Replace all cases with human review\" is wrong: it discards the machine-checkable backbone you still want for the other fields.",
    },
    {
      id: 'q8',
      question: "An agent gives a wrong final answer. Tracing the run shows Tool A was never called when it clearly should have been. Where does this failure most likely live?",
      options: [
        "In how the agent synthesizes tool results into the final answer.",
        "In the eval harness assertions.",
        "In the downstream database schema.",
        "In the routing prompt or tool_choice configuration that governs whether the tool is invoked.",
      ],
      answer: 3,
      explanation: "Correct: a tool skipped entirely points to the routing prompt or tool_choice that decides whether to invoke it. \"Synthesis\" is wrong because that is the culprit only when the tool was called correctly but the answer is still wrong. \"Eval harness assertions\" is wrong because the harness detected the problem rather than caused it. \"Database schema\" is wrong because it is unrelated to whether the agent decided to call the tool.",
    },
    {
      id: 'q9',
      question: "An agent eval suite asserts only that the agent's final text answer matches the expected answer. What important signal is this design giving up?",
      options: [
        "It loses the intermediate tool-call signal — tool selection, parameter correctness, and sequencing — needed to fix the right thing.",
        "It cannot measure token cost per run.",
        "It cannot be run more than once on the same input.",
        "It prevents the use of enum membership criteria.",
      ],
      answer: 0,
      explanation: "Correct: asserting only the final output discards the tool-call trace — whether the right tool was chosen, with correct parameters, in the correct order — which is what you need to localize a failure. \"Cannot measure token cost\" is wrong because that is a separate operational metric, not the lost signal. \"Cannot rerun\" is wrong because final-answer assertions do not stop reruns. \"Prevents enum criteria\" is wrong: enum checks apply to field assertions regardless.",
    },
    {
      id: 'q10',
      question: "A code-review agent keeps flagging acceptable code, generating many false positives. Which intervention is most effective for reducing them?",
      options: [
        "Add a vague instruction telling the agent to \"be conservative.\"",
        "Increase the agent's output token limit so it can explain more findings.",
        "Provide few-shot examples showing acceptable code next to genuinely problematic code.",
        "Disable the agent on files that produce false positives.",
      ],
      answer: 2,
      explanation: "Correct: few-shot examples contrasting acceptable code with genuinely problematic code reduce false positives far better than vague guidance. \"Be conservative\" is exactly the vague instruction that underperforms. \"Larger output limit\" is wrong because it lets the agent explain more but does not change which findings it raises. \"Disable on certain files\" is wrong: it removes coverage rather than calibrating judgment.",
    },
    {
      id: 'q11',
      question: "Claude generated a batch of unit tests, but they mostly assert that functions \"do not throw\" and reuse invented mocks instead of the project's fixtures. What is the best way to raise test quality going forward?",
      options: [
        "Accept the tests since higher coverage numbers are always better.",
        "Ask for more tests of the same kind until coverage reaches 100%.",
        "Lower the temperature so the tests become more deterministic.",
        "Document your test standards in a project memory or testing guide, with examples of valuable behavioral tests vs. trivial ones and the fixture names to use.",
      ],
      answer: 3,
      explanation: "Correct: documenting test standards — examples of behavioral vs. trivial tests, and the project fixtures with their intended use — addresses both the \"does not throw\" pattern and the invented mocks. \"Accept the tests\" is wrong because trivial tests inflate coverage without catching bugs. \"More of the same\" is wrong because it compounds the problem. \"Lower temperature\" is wrong: it does not change whether a test asserts meaningful behavior.",
    },
    {
      id: 'q12',
      question: "You have a tool whose schema has grown to include two very different shapes, and the model must reason about which fields apply to each input — and it often gets this wrong. What is the recommended structural fix?",
      options: [
        "Split the tool into more specific tools so the schema itself encodes the distinction instead of relying on the model to route.",
        "Add a retry loop so the model gets multiple attempts at choosing fields.",
        "Add the failing inputs to the eval set and take no further action.",
        "Lower the confidence threshold for that tool.",
      ],
      answer: 0,
      explanation: "Correct: when two very different shapes compete in one tool and routing requires error-prone model reasoning, splitting into more specific tools moves the distinction into the schema and out of fragile judgment. \"Add a retry loop\" is wrong because it gives more attempts at the same error-prone reasoning. \"Add to eval set only\" is wrong because it documents but does not fix the recurring structural problem. \"Lower the confidence threshold\" is wrong: it does not change the schema ambiguity driving the errors.",
    },
    {
      id: 'q13',
      question: "Your pipeline emits a confidence score, and the team wants to route low-confidence outputs to human review. The score has never been compared against labeled data. What should happen before relying on it?",
      options: [
        "Trust the score as-is, since the model reports it directly.",
        "Use the score only for outputs above 0.99 to be safe.",
        "Calibrate the score against labeled eval data; an uncalibrated \"0.95\" that is right only 60% of the time causes worse decisions than no score at all.",
        "Replace the score with the model's token log-probabilities.",
      ],
      answer: 2,
      explanation: "Correct: a confidence score must be calibrated against labeled eval data before driving routing, because an uncalibrated \"0.95\" that is right only 60% of the time leads to worse decisions than no score. \"Trust as-is\" is exactly the pitfall. \"Only above 0.99\" is wrong because it still assumes the uncalibrated number is meaningful. \"Use log-probabilities\" is wrong: it swaps in a different uncalibrated signal rather than validating the one you have.",
    },
    {
      id: 'q14',
      question: "You are fixing several distinct formatting and structural defects in a generated output at once, and you notice that previously-working areas keep breaking. What practice would prevent this?",
      options: [
        "Make all the fixes in a single broad rewrite to save time.",
        "Stop verifying intermediate results and only check the final output.",
        "Disable the failing tests until all fixes are complete.",
        "Address one visible defect class at a time and verify before moving on.",
      ],
      answer: 3,
      explanation: "Correct: addressing one defect class at a time and verifying first lets you measure progress and avoid the regressions broad simultaneous changes introduce. \"Single broad rewrite\" is precisely what causes new regressions in working areas. \"Stop verifying intermediate results\" is wrong because it removes the signal needed to catch a regression early. \"Disable the failing tests\" is wrong: it hides the evidence of regressions rather than preventing them.",
    },
    {
      id: 'q15',
      question: "During quarterly maintenance you find several eval cases that reflect launch-era requirements that no longer apply, and you have not added new cases in months. What does this indicate about the eval set?",
      options: [
        "The eval set is decaying in value; it should grow with production bugs and have outdated cases pruned so it reflects current requirements.",
        "The eval set is healthy as long as all cases still pass.",
        "Eval sets should never be modified once created, to keep results comparable.",
        "The eval set should be replaced entirely with aggregate accuracy monitoring.",
      ],
      answer: 0,
      explanation: "Correct: an eval set decays when it only reflects launch-era requirements; keeping it alive means adding a case per production bug and pruning cases that no longer match current requirements. \"Healthy as long as cases pass\" is wrong because passing stale tests is not proof of health. \"Never modify\" is wrong because freezing the set gives false confidence as requirements change. \"Replace with aggregate accuracy monitoring\" is wrong: it abandons segmented, case-level signal — the opposite of the segmentation guidance.",
    },
  ],
}
