export default {
  id: 'system-prompts',
  num: 6,
  title: 'System Prompt Engineering and Conversational Behavior',
  summary: 'How to write system prompts that hold up across long conversations: when to use principles vs conditionals, how few-shot examples outperform prose rules, why attention weakens over time, and how to control response format without fragile instruction lists.',
  estMinutes: 32,
  tags: ['Prompting', 'Architecture', 'Behavior'],

  lessons: [
    {
      id: 'system-prompt-basics',
      title: 'What the System Prompt Actually Is',
      minutes: 6,
      body: `> **TL;DR** — The system prompt is not a one-time setup message; it defines role, tone, constraints, and priorities, and it must be resent in **every** request because Claude has no memory between calls.

The system prompt is a request parameter, not stored state. Because the Messages API is stateless (Module 1), the model conditions only on the bytes in the current request — there is no server-side session holding your persona. So the system prompt is re-handed every single request, not "loaded once and remembered." Omit it on turn 3 and the model on turn 3 has no role, no constraints, no persona: behavior diverges *immediately*, not gradually, because that turn is evaluated as if no persona were ever defined.

### Why this trips so many teams up

The single most common production bug here comes from the persistent-memory misconception:

> "I send the system prompt on the first turn to set things up, then Claude remembers it."

This is wrong. The system prompt bytes must appear in **every request body**, alongside the full prior message history in \`messages\`. There is no "initialization" turn that persists.

### Good structural conventions: XML-style section tags

XML-style tags are not magic, but they improve salience and organization. The model notices labeled boundaries, and the tags help you reason about the prompt as you edit it. They are especially useful when the same word means different things in different sections — a \`<role>\` block stays clearly distinct from a \`<style>\` block even though both might reference "tone."

\`\`\`xml
<role>
You are a careful financial education assistant.
</role>

<style>
Use plain language for beginners. Match the user's demonstrated sophistication.
</style>

<safety>
If the user asks for personalized investment, legal, or medical decisions,
explain your limits and recommend a qualified professional.
</safety>

<examples>
<!-- few-shot demonstrations go here -->
</examples>
\`\`\`

### Weak vs strong: where does "the order just shipped" go?

A webhook fires mid-session: the customer's order has shipped. Where do you surface that?

**❌ Weak — bury it in a fake tool result the agent never asked for**
> user (injected): [tool_result] {"order_status":"shipped"}

The model didn't call a tool, so a dangling \`tool_result\` is confusing and easy to overlook. State that changed *without the agent asking* does not belong in tool results.

**✅ Strong — update the system prompt for the next call**
\`\`\`xml
<current_state>
Order 8842 status: SHIPPED (updated 2 min ago). Tracking: 1Z99...
</current_state>
\`\`\`
The system prompt is the natural home for "what is currently true about this user, account, or environment." Tool results belong only when the agent itself requested the information.

### Visual aid: system prompt vs message history

\`\`\`mermaid
flowchart TD
    REQ["Every Request — Turn N"]
    SYS["system: role + style + safety +<br/>what is true NOW<br/>re-handed every turn"]
    MSG["messages: user turn 1, assistant turn 1 ... user turn N<br/>full history resent"]
    WARN["Omit system on any turn<br/>blank persona THAT turn"]
    REQ --> SYS
    REQ --> MSG
    SYS -. omit .-> WARN
\`\`\`

> ❓ **Check yourself:** You send the system prompt on turn 1, then omit it on turns 2–3 but the persona holds, so you assume it is cached. On turn 4 the persona vanishes. What actually explains turns 2–3?
>
> *(Nothing was cached. Turns 2–3 still carried persona-consistent assistant outputs in the resent \`messages\` history, so the model imitated that pattern. Turn 4 drifted once the accumulated history no longer pinned the behavior. Resend the system block every request — never rely on history to substitute for it.)*

### Key takeaways
- The system prompt must be in **every** request — there is no server-side session memory.
- Omitting it does not cause gradual fade; it causes an **immediate** blank-persona turn.
- Use XML-style section tags for salience and clean separation of overlapping concepts.
- When external state changes mid-session, update the **system prompt**, not a buried tool result.`,
      principles: [
        "Omit the system prompt on any turn and that turn has no persona — include it in every request, no exceptions.",
        "Use XML tags (`<role>`, `<style>`, `<safety>`) to separate overlapping concepts and improve salience.",
        "When state changes mid-session, update the system prompt — don't bury it in an unrequested tool result.",
      ],
      pitfalls: [
        "Sending the system prompt only on turn 1 — the stateless API gives every omitted turn a blank persona.",
        "Mixing role, style, safety, and examples into one paragraph makes overlapping concepts ambiguous.",
      ],
    },
    {
      id: 'principles-vs-conditionals',
      title: 'Principles vs Conditionals',
      minutes: 7,
      body: `> **TL;DR** — Use general **principles** for judgment-heavy behavior and explicit **conditionals** only for safety bright lines; if a rule must hold 100% of the time, move it into code, not prompt wording.

Principles and conditionals differ in how they generalize. A **principle** ("increase detail when the user shows expertise") gives the model an objective and lets it weigh whatever signals the input actually contains, so it covers cases you never enumerated. A **conditional** ("if the input contains *jargon*, switch to expert mode") fires only on the specific surface pattern you wrote and breaks the moment the input is phrased differently — it collapses judgment into a keyword match. Use principles wherever behavior depends on judgment, and reserve conditionals for the few inputs where one specific response is mandatory and the trigger is unambiguous (safety bright lines).

### General principles for judgment-heavy behavior

Principles let the model integrate dozens of implicit signals at once — vocabulary, framing, follow-up specificity, the size of errors in a user's guesses. They scale to situations you never anticipated.

Good principle examples:

- \`"Adapt explanation depth to the user's demonstrated expertise."\`
- \`"Prefer one clarifying question at a time."\`
- \`"State reasonable assumptions when moving forward under ambiguity."\`

### Explicit conditionals for safety-critical triggers

Conditionals are for behavior that must fire on **specific, identifiable inputs** with near-deterministic response:

- \`"If the user describes an immediate medical emergency, direct them to emergency services."\`
- \`"If the request requires a regulated financial decision, do not provide personalized advice."\`

### Weak vs strong: adapting explanation depth

**❌ Weak — conditional-heavy (one rule per surface pattern)**
> If the user mentions they are a beginner, use simple language.
> If the user uses technical jargon, assume advanced level.
> If the user asks about basics, treat them as a novice.
> If the user asks a follow-up without defining terms, assume intermediate.

A user who is an expert but asks a simple confirming question gets misclassified as a novice. The list forces a shallow **keyword match** and breaks on anyone who phrases things atypically.

**✅ Strong — principle-based (one objective, many signals)**
> Adapt explanation depth to the user's demonstrated proficiency.
> Increase detail when their questions show domain familiarity.
> Use accessible language when their framing suggests they are newer to the topic.

Now the model weighs vocabulary, framing, specificity, and error patterns together — far more signals than any enumerable list could encode.

### Visual aid: which tool for which job

\`\`\`mermaid
flowchart LR
    subgraph P["PRINCIPLE — compass / judgment"]
        P1["Signals: integrates many implicit ones"]
        P2["Coverage: scales to unseen cases"]
        P3["Failure: degrades gracefully"]
        P4["Best for: tone, depth, ambiguity, style"]
        P5["100% rule: never guaranteed — use CODE"]
    end
    subgraph C["CONDITIONAL — map / bright line"]
        C1["Signals: matches a few explicit keywords"]
        C2["Coverage: only the cases you enumerated"]
        C3["Failure: misfires on atypical phrasing"]
        C4["Best for: emergencies, regulated refusals"]
        C5["100% rule: still never guaranteed — use CODE"]
    end
\`\`\`

### The bright-line rule

If a rule **must hold 100% of the time**, move it out of the prompt and into code. No wording — not even "ALWAYS" or "NEVER" — makes a behavior truly invariant. Capitalized words improve *salience*, not *guarantees*. Enforcement belongs in your application layer or a tool implementation.

> ❓ **Check yourself:** A reviewer says your "NEVER give personalized investment advice" prompt rule passed 10,000 test conversations with zero violations, so it is safe to treat as a hard compliance control. Is that reasoning sound?
>
> *(No. Passing 10,000 cases is evidence, not a guarantee — the next phrasing you never tested can still trip it, and prompt wording offers no invariance. A true compliance control must be enforced in application code or a tool layer that can refuse to emit the advice regardless of how the request is worded.)*

### Key takeaways
- Use **principles** for judgment-heavy behaviors — they scale to unanticipated situations.
- Use **conditionals** for safety triggers and policy bright lines — predictable, identifiable inputs.
- "ALWAYS"/"NEVER" boost salience but never guarantee behavior.
- A rule that must hold 100% of the time belongs in **code**, not prompt wording.`,
      principles: [
        "Use principles for judgment-heavy behaviors — they integrate many signals instead of brittle keyword matching.",
        "Use conditionals only for safety triggers with an explicit signal and a fixed required response.",
        "Rules that must hold 100% belong in code — `ALWAYS`/`NEVER` improve salience but provide no invariance.",
      ],
      pitfalls: [
        "Encoding every nuanced behavior as a conditional bloats the prompt and reduces judgment to keyword matching.",
        "`ALWAYS`/`NEVER` are salience nudges, not invariance — true enforcement belongs in application code.",
        "Adding conditionals to fix edge cases compounds misfires; reframe as a principle with an example instead.",
      ],
    },
    {
      id: 'few-shot-examples',
      title: 'Few-Shot Examples and Prompt Dilution',
      minutes: 7,
      body: `> **TL;DR** — Examples *show* behavior far more densely than prose *describes* it; and even a perfectly-resent system prompt loses attention as a conversation grows, so reinforce key constraints at natural breakpoints.

This lesson covers two related effects. First, **few-shot examples are a denser specification than prose**: a contrasting pair of input/output samples pins down format, tone, and the boundary between two behaviors in tokens the model pattern-matches directly, where an equivalent prose description leaves the model to infer that mapping. Second, **prompt dilution**: the system prompt's influence is a function of how the model distributes attention across the request, and as the conversation grows, the accumulating recent turns — especially the model's own prior outputs — compete for that attention. The prompt is not dropped or down-weighted on disk; it is sent at full length every turn, but it commands a smaller share of attention as context grows, so behavior can drift well before the window is full.

### Why examples often outperform prose

Long prose tells the model *about* a behavior. Examples *demonstrate* it. Use examples when you need the model to learn distinctions such as: beginner vs expert explanations, acceptable vs reportable code-review findings, correct extraction from unusual layouts, good vs bad clarifying-question behavior, and handling missing information without fabrication.

### Weak vs strong: teaching beginner-vs-expert depth

**❌ Weak — prose description**
> When the user is a beginner, summarize briefly in plain language.
> When the user is an expert, include technical depth and tradeoff analysis.

**✅ Strong — two contrasting examples**
> \<examples\>
>
> User (beginner): What is a database index?
> Assistant: An index is like a book's table of contents — it lets the database
> jump straight to the rows you need instead of reading every row. Reads get
> faster, but the index itself takes up space.
>
> User (expert): What are the tradeoffs of partial indexes on write-heavy tables?
> Assistant: Partial indexes cut index size and maintenance overhead by covering
> only qualifying rows, lowering write amplification. The risk is predicate
> staleness as query patterns evolve — a rarely-matching predicate degrades into
> a full scan. On write-heavy tables, benchmark with realistic throughput first.
>
> \</examples\>

Keep examples realistic and compact. Show the exact behavior you want, not an idealized version.

### Prompt dilution and its mitigations

Even when the system prompt is included on every call, attention to it weakens as the conversation grows — before the context window is full. Recent assistant outputs become a behavioral pattern that competes for attention. Mitigations:

1. **Concise, well-structured prompts** — a tight 300-word prompt holds up better than 1,200 words of rambling rules.
2. **Critical instructions in salient sections** — first or last, inside tagged blocks.
3. **Behavioral examples** — they anchor behavior more durably than prose.
4. **User-role reminders at phase changes** — a brief user-role message restating constraints integrates with the flow the model is already attending to.
5. **System-prompt versioning across sessions** — update the prompt between turns to reflect current truth.
6. **Enforce hard requirements in code** — anything that must not drift lives outside the model.

### Visual aid: attention dilution over turns

\`\`\`mermaid
flowchart LR
    SP["System prompt sent<br/>EVERY turn — volume unchanged"]
    T1["Early turns<br/>high attention to system prompt"]
    T2["Mid turns<br/>recent context competes"]
    T3["Later turns<br/>drift begins — window NOT full"]
    REM["Reminder at phase change<br/>nudges attention back up"]
    SP --> T1 --> T2 --> T3
    REM -->|reinforce| T3
\`\`\`

> ❓ **Check yourself:** Tone drifts around turn 40 even though the system prompt is resent every turn and the context window is far from full. A teammate wants to fix it by adding ten more rules to the prompt. Why will that likely make it worse?
>
> *(The drift is prompt dilution — the unchanged prompt commands a shrinking share of attention as recent turns accumulate. Adding rules lengthens the prompt, which dilutes faster, not slower. Tighten the prompt, anchor behavior with contrasting examples, and restate key constraints in a brief user-role reminder at the phase boundary.)*

### Key takeaways
- Examples are **denser** than prose for behaviors the model must learn, not recite.
- Prompt dilution is real: attention to the system prompt weakens as length grows even when it is resent each turn.
- Reinforce constraints at **natural breakpoints** via brief user-role messages, not by re-sending the whole prompt every turn.`,
      principles: [
        "Examples outperform prose for behaviors to learn — two contrasting demos teach a distinction more directly.",
        "Prompt dilution is real: attention to the system prompt weakens as the conversation grows, even when resent.",
        "Reinforce constraints at phase boundaries with a brief user-role message — not by re-sending the whole prompt.",
      ],
      pitfalls: [
        "Adding more rules to a drifting, already-long prompt — bloated prompts dilute faster, not slower.",
        "Re-sending giant instructions every turn instead of one concise user-role reminder at each phase boundary.",
      ],
    },
    {
      id: 'clarifying-questions',
      title: 'Clarifying Questions and Assumptions',
      minutes: 6,
      body: `> **TL;DR** — Match clarifying behavior to **risk and reversibility**: proceed with a stated assumption on low-risk tasks, ask one focused question when interpretations truly diverge, and ask-first only for irreversible/costly/regulated actions.

Whether to ask or to act is a cost calculation, not a politeness default. The variable is the cost of being wrong: when an action is cheap to reverse, proceeding on the most likely interpretation (and stating it) is almost always cheaper than the friction of preflight questions, because the user can redirect at low cost. When an action is irreversible, costly, or regulated, the expected cost of a wrong guess dominates, so confirmation up front is worth the friction. Most mistakes here come from applying one default everywhere — interrogating the user before trivial edits, or silently acting on a guess before an irreversible action.

### When to ask vs when to proceed

**Ask a clarifying question when:**
- Multiple interpretations lead to substantially different actions.
- The action is irreversible or costly.
- The user has expressed conflicting goals.
- Required information is truly missing and cannot be reasonably assumed.

**Proceed with stated assumptions when:**
- The action is low risk and easily redirected.
- Context strongly suggests the likely intent.
- The user can correct course after seeing an attempt.

### Weak vs strong: "Can you clean up my essay?"

**❌ Weak — the interrogation**
> Before I start: Do you want grammar fixes? Flow improvements?
> Structural changes? Tone adjustments? Formatting too?

Multiple simultaneous questions feel like an interrogation, and users frequently answer only the first.

**✅ Strong — commit to a direction, state the assumption**
> I'll assume you want the essay edited for clarity rather than rebuilt from
> scratch. I'll focus on grammar and flow first — redirect me if you meant
> structural restructuring or a tone change.

This commits to a direction, makes the assumption explicit, and keeps the cost of correction tiny.

### One question at a time, and surfacing conflicts

For genuinely ambiguous requests, prefer **one focused clarifying question** — pick the disambiguation that most changes your next action. And when goals conflict, never average them into a vague compromise; name the tension:

> You want both the cheapest fare and a nonstop arriving by Friday 9 AM.
> On this route those may not both be satisfiable — which should I prioritize
> if a cheap nonstop by Friday doesn't exist?

Hidden compromises satisfy neither stated goal and usually require rework.

### Visual aid: the risk decision flow

\`\`\`mermaid
flowchart TD
    A{"Irreversible, costly,<br/>or regulated domain?"} -->|yes| ASK["ASK FIRST<br/>act only after explicit confirmation"]
    A -->|no| B{"Interpretations lead to<br/>substantially different actions?"}
    B -->|no| PROCEED["PROCEED with a stated assumption<br/>let user redirect"]
    B -->|yes| C{"User goals<br/>conflict?"}
    C -->|yes| NAME["NAME the tension<br/>ask which constraint governs"]
    C -->|no| ONE["ASK ONE focused question<br/>the most decision-changing one"]
\`\`\`

> ❓ **Check yourself:** Two requests look similar: "tidy up this 300-word memo" and "tidy up the wording in this signed contract before I send it to the counterparty." Same verb — should both proceed on a stated assumption?
>
> *(No. The variable is cost of being wrong, not surface wording. The memo is low-risk and reversible, so proceed with one stated assumption. The contract edit is costly and effectively irreversible once sent, so ask first and act only after explicit confirmation of exactly what to change.)*

### Key takeaways
- Prefer **proceeding with an explicit assumption** on low-risk, reversible work.
- Ask only **one** focused clarifying question — the one that most changes your next action.
- When goals conflict, **name the tension**; never silently average.
- Reverse the default only for irreversible/costly/regulated actions: ask first, then confirm.`,
      principles: [
        "On low-risk reversible work, proceed with a stated assumption — a cheap redirect beats asking questions up front.",
        "Ask only one clarifying question — the one that most changes your next action; lists get only partial answers.",
        "When goals conflict, name the tension and ask which governs — a silent compromise satisfies neither.",
      ],
      pitfalls: [
        "Asking three or four questions at once — users answer only the first, adding friction that outweighs the risk.",
        "Demanding full specs before low-risk tasks — the cost of a wrong assumption is tiny versus stalling the user.",
        "Silently averaging conflicting goals instead of surfacing the trade-off and asking which constraint governs.",
      ],
    },
    {
      id: 'response-format-control',
      title: 'Response Format Control',
      minutes: 6,
      body: `> **TL;DR** — To fix repetitive or messy output, prefer **showing** the desired format (examples, style guide, prefill) and **enforcing** machine-readable output with schemas — not piling up "never say X" prohibition lists.

A prohibition list is the wrong shape for the problem. "Never open with *Great question!*, never use exclamation marks, never add a preamble..." enumerates the space of wrong outputs, which is unbounded — the model can always emit an opener you never banned — and every rule you add competes for attention with everything else in the prompt. Specifying the *target* instead is bounded and direct: a couple of examples demonstrate the format you want, and a prefill writes the opener into the assistant turn so the boilerplate is skipped by construction rather than discouraged after the fact.

### Better options than prohibition lists

**1. Better examples in the system prompt** — if the model opens every reply with "Great question!", show two replies that don't. Demonstrations are more durable than a single prohibition.

**2. A concise style guide section**
\`\`\`xml
<style>
- Begin responses with the answer, not an affirmation.
- Use plain declarative sentences.
- Format code as fenced blocks; lists as bullets, not inline commas.
- Match length to complexity — short for lookups, longer for analysis.
</style>
\`\`\`

**3. Partial assistant prefill** — prefilling the start of the assistant turn skips boilerplate entirely. Keep it to one phrase, and never prefill content the model needs to reason about (it can suppress important caveats).
\`\`\`json
{ "role": "assistant", "content": "Here is the analysis:" }
\`\`\`

**4. Structured outputs or tool use for machine-readable formats** — for JSON/CSV/strict shapes, use an output schema or tool-use \`input_schema\`. Schema-backed output is far more reliable than "respond only with valid JSON."

**5. Post-processing for cosmetic cleanup** — for purely cosmetic issues (stray blank lines, inconsistent punctuation), a deterministic step in your application layer is simpler and more reliable than any prompt change.

### Weak vs strong: killing a repetitive opener

**❌ Weak — prohibition list**
> Never begin with "I'd be happy to help". Never say "Great question".
> Never start with "Sure thing". Never open with an affirmation. ...

The list grows forever and still offers no guarantee — the model can produce an opener you never banned.

**✅ Strong — short prefill (paint the target)**
\`\`\`json
{ "role": "assistant", "content": "Here is the analysis:" }
\`\`\`
The boilerplate is skipped by construction, with one phrase and zero prompt bloat.

### Visual aid: the priority ordering

\`\`\`mermaid
flowchart TD
    MOST["MOST reliable — most enforced"]
    SO["Structured outputs<br/>machine-readable — schema-enforced"]
    TU["Tool use input_schema<br/>machine-readable — schema-enforced"]
    PP["Partial prefill<br/>one phrase — format and opener"]
    EX["Style-guide examples<br/>show the target behavior"]
    PL["Prohibition lists<br/>guide only — never guarantee"]
    POST["Post-processing<br/>cosmetic cleanup ONLY — in code"]
    LEAST["LEAST reliable as a behavior mechanism"]
    MOST --> SO --> TU --> PP --> EX --> PL --> POST --> LEAST
\`\`\`

> ❓ **Check yourself:** You kill the "I'd be happy to help!" opener with a partial assistant prefill, and it works on report-generation calls. A colleague wants to reuse the same prefill on the open-ended question-answering endpoint. Why is that a mistake?
>
> *(A prefill writes fixed text into the assistant turn, so it suits a predictable format like a report opener. On open-ended question answering the prefilled phrase can fight the actual answer or suppress a needed caveat. There, kill the boilerplate with style-guide examples instead, and reserve prefill for calls whose opening is genuinely predictable.)*

### Key takeaways
- Examples and a concise style section are more **durable** than prohibition lists.
- For strict machine-readable output, use **structured outputs or tool use**, not text formatting rules.
- **Partial prefill** is ideal for repetitive openers — one phrase, never content needing reasoning.
- Reserve **post-processing** for purely cosmetic cleanup, handled deterministically in code.`,
      principles: [
        "A concise style section with examples outlasts prohibition lists — show the target, don't fence the field.",
        "For machine-readable output, use a structured output schema — far more reliable than text formatting rules.",
        "Partial prefill skips repetitive openers; one short phrase only — don't prefill content needing reasoning.",
      ],
      pitfalls: [
        "Piling \"never say X\" rules onto a long prompt — they guide but don't guarantee and they accelerate dilution.",
        "Text instructions for JSON output drift; when schemas are available, use `input_schema` to enforce the shape.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-system-prompt-included',
      type: 'mcq',
      scenario: 'An application sends the system prompt only on the first API call, then sends subsequent turns with only the messages array. The developer expects Claude to remember the persona defined in the system prompt.',
      question: 'What actually happens on turn 3 when the system prompt is omitted?',
      options: [
        'Claude retrieves the system prompt from its session cache.',
        'Claude behaves without any defined persona or constraints, because the model only sees what is in the current request.',
        'The API automatically re-injects the system prompt from the previous call.',
        'Behavior drifts gradually over many turns, not immediately.',
      ],
      answer: 1,
      explanation: 'The Messages API is stateless. Claude sees only what is in the current request. Omitting the system prompt on turn 3 means turn 3 has no persona, role, or constraints — behavior diverges immediately, not gradually.',
    },
    {
      id: 'ex-principles-vs-conditionals',
      type: 'mcq',
      scenario: 'You are designing a customer-service assistant that should adapt its explanation depth to the user\'s demonstrated expertise level.',
      question: 'Which approach is most appropriate?',
      options: [
        'Write a long list of conditionals: "If the user uses technical terms, assume expert. If they ask basic questions, assume novice..."',
        'Write a principle: "Adapt explanation depth to the user\'s demonstrated proficiency, increasing detail when their questions show domain familiarity."',
        'Default to beginner level always to avoid misclassifying experts as novices.',
        'Ask users to self-report their expertise level at the start of every conversation.',
      ],
      answer: 1,
      explanation: 'A principle lets the model integrate many implicit signals — vocabulary, framing, follow-up specificity. A long conditional list forces shallow keyword matching and misclassifies atypical users. The principle approach scales better and produces more accurate behavior.',
    },
    {
      id: 'ex-behavior-match',
      type: 'mcq',
      scenario: 'A team is designing a coding assistant system prompt. They debate whether to use principles, conditionals, few-shot examples, or application-layer enforcement for several different behaviors.',
      question: 'Which design decision is correctly matched to its rationale?',
      options: [
        'Use an explicit conditional for adapting explanation depth — it lets the model integrate vocabulary and framing signals.',
        'Move a hard compliance rule into the system prompt as "NEVER do X" — this guarantees invariant behavior.',
        'Use a general principle for emergency detection — principles scale to unanticipated inputs including emergencies.',
        'Use a general principle for adapting explanation depth — it lets the model integrate many implicit signals rather than keyword-matching.',
      ],
      answer: 3,
      explanation: 'A general principle for explanation depth is correct because it allows the model to weigh vocabulary, framing, specificity, and error patterns together. A conditional forces shallow keyword matching and misfires on atypical users. Hard compliance rules belong in application code, not prompt wording — "NEVER" improves salience but provides no invariance guarantee. Emergency detection is a safety trigger with a specific identifiable input, so it warrants an explicit conditional, not a principle.',
    },
    {
      id: 'ex-clarifying-questions',
      type: 'mcq',
      scenario: 'A user asks: "Can you clean up my essay?" The essay is 400 words, attached. The task could mean fixing grammar, improving flow, restructuring paragraphs, or changing tone.',
      question: 'What is the best response?',
      options: [
        'Ask four questions: "Do you want grammar fixes? Flow improvements? Structural changes? Tone adjustments?"',
        'Refuse to proceed until the user provides a full specification.',
        'State one focused assumption and proceed: "I\'ll focus on grammar and flow — redirect me if you meant structural restructuring or a different tone."',
        'Ask no questions and make all possible changes simultaneously.',
      ],
      answer: 2,
      explanation: 'One focused assumption is better than a list of questions (users answer only the first) and better than a full refusal. The cost of a small redirect is lower than the friction of asking questions up front for a low-risk, reversible task.',
    },
    {
      id: 'lab-rewrite-prompt',
      type: 'lab',
      title: 'Rewrite a Conditional-Heavy System Prompt into Principle-Based Form',
      brief: `Below is a **conditional-heavy system prompt** for a coding assistant. Your task is to rewrite it using **principles and examples** instead of explicit conditionals, while keeping all the intended behaviors.

**Original prompt to rewrite:**

\`\`\`
You are a coding assistant.
If the user is a beginner, explain everything step by step.
If the user is an expert, skip basic explanations.
If the user asks about Python, use Python examples.
If the user asks about JavaScript, use JavaScript examples.
If the user seems frustrated, be extra encouraging.
If the user asks for a code review, list all problems you find.
If the user asks for a code review and says they are in a hurry, list only the top 3 problems.
If the user pastes broken code without asking a question, assume they want it fixed.
If the user asks a question without pasting code, answer conceptually first.
NEVER write code that is not directly relevant to the user's question.
ALWAYS add comments to every line of code you write.
\`\`\`

Write a rewritten system prompt (in the textarea below) that:
1. Replaces the conditional chains with 2–3 clear principles.
2. Includes at least one \`<examples>\` block demonstrating a key behavioral distinction.
3. Keeps the safety/policy items (relevance, comments) as explicit rules where appropriate.
4. Is no longer than ~200 words.`,
      placeholder: '<role>\nYou are a coding assistant.\n</role>\n\n<style>\n...\n</style>\n\n<examples>\n...\n</examples>',
      system: 'You are a strict, encouraging reviewer for the Claude Certified Architect exam. You evaluate system prompt quality. Be concise (under 300 words). Score out of 10. Evaluate: (1) whether conditional chains are replaced by genuine principles rather than just shortened conditionals, (2) whether the examples block demonstrates a real behavioral distinction, (3) whether hard rules that should be explicit are preserved, (4) whether the rewrite is tighter and more maintainable than the original. Penalize rewrites that merely combine conditionals into one sentence without adding principle-level abstraction.',
      evalTemplate: 'A learner was asked to rewrite a conditional-heavy coding assistant system prompt into principle-based form. Here is their rewrite:\n\n{{input}}\n\nEvaluate it per your rubric. Highlight the strongest part of the rewrite and the one change that would most improve it.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'A developer builds a chat app that sends the system prompt on turn 1, then on later turns sends only the messages array to save tokens. On turn 4, the assistant abandons its configured persona. What is the root cause?',
      options: [
        'The conversation exceeded the context window, so the system prompt was truncated.',
        'The Messages API is stateless, so turn 4 has no persona at all — the system prompt bytes must be in every request.',
        'The persona faded gradually as the model accumulated more recent turns to attend to.',
        'A session cache expired between turn 1 and turn 4, dropping the cached system prompt.',
      ],
      answer: 1,
      explanation: 'Correct: the Messages API is stateless, so each request must include the full system prompt; omitting it means turn 4 sees no role or constraints, and divergence is immediate. Context-window truncation is wrong because the cause here is an omitted prompt, not a full window. Gradual fading describes prompt dilution, a separate effect that occurs when the prompt IS sent every turn. There is no server-side session cache to expire — the persistent-memory mental model is exactly the misconception that causes this bug.',
    },
    {
      id: 'q2',
      question: 'A team wants an assistant to adapt explanation depth to each user\'s expertise. One engineer proposes a list of rules like "if the user uses jargon assume expert; if they ask about basics assume novice." Why is a single principle usually the better design?',
      options: [
        'A principle is shorter, so it consumes fewer input tokens per request.',
        'Conditionals are non-deterministic, whereas a principle produces identical output every time.',
        'A principle lets the model integrate many implicit signals, while the conditional list forces a shallow keyword match that misclassifies atypical users.',
        'Principles fire only on specific identifiable inputs, which is what expertise detection needs.',
      ],
      answer: 2,
      explanation: 'Correct: a principle lets the model weigh vocabulary, framing, follow-up specificity, and error patterns together, while a conditional chain reduces this to brittle keyword matching that mislabels an expert who asks a simple confirming question. The token-savings answer is not the point — the design issue is judgment quality, not length. Claiming a principle always yields identical output is false; principles produce judgment, not determinism. Firing on specific identifiable inputs describes when to use conditionals (safety triggers), which is the opposite of this judgment-heavy case.',
    },
    {
      id: 'q3',
      question: 'A compliance rule states that the assistant must never provide personalized investment advice — it must hold 100% of the time. Where should this guarantee live?',
      options: [
        'In the system prompt, written in capitals as "NEVER give personalized investment advice."',
        'As a general principle so the model can adapt to nuanced situations.',
        'Enforced in application code, because no prompt wording makes a behavior truly invariant.',
        'As a few-shot example showing the assistant declining one investment request.',
      ],
      answer: 2,
      explanation: 'Correct: if a rule must hold 100% of the time, enforcement belongs in the application layer — no prompt wording guarantees invariance. Writing "NEVER" in capitals only improves salience; it does not make the behavior reliable. A general principle is for judgment-heavy behavior, not for a non-negotiable bright line. A single few-shot example demonstrates a pattern but cannot guarantee the rule fires on every future request.',
    },
    {
      id: 'q4',
      question: 'A system prompt is correctly included on every API call, but after roughly 40 turns the assistant\'s tone and formatting drift even though the context window is far from full. What is happening?',
      options: [
        'The model intentionally stops following the system prompt once a conversation is long enough.',
        'Prompt dilution: recent assistant outputs and user turns increasingly compete with the system prompt for attention.',
        'The system prompt is silently dropped from the request once the message history grows.',
        'The temperature automatically rises over a long session, increasing randomness.',
      ],
      answer: 1,
      explanation: 'Correct: this is prompt dilution — attention to the unchanged system prompt weakens as growing recent context competes for it, even before the window fills. The model does not "decide" to ignore the prompt; the effect is about attention distribution, not intent. The prompt is not dropped — it is still present in every request, which is precisely why the drift surprises people. Temperature does not change on its own over a session; that is not a real mechanism.',
    },
    {
      id: 'q5',
      question: 'A long-running assistant\'s adherence has started to drift. Its system prompt is already 1,200 words of bulleted rules. What is the most effective fix?',
      options: [
        'Add more explicit rules covering the specific cases where it drifted.',
        'Tighten the prompt and replace chunks of rules with two or three contrasting behavioral examples.',
        'Re-send the entire system prompt as a user message on every turn.',
        'Raise the model temperature so it explores more varied responses.',
      ],
      answer: 1,
      explanation: 'Correct: a tight, well-structured prompt with a few contrasting examples anchors behavior more durably than long prose, and examples are denser than rule lists for behavior the model must learn. Adding more rules to an already-bloated prompt accelerates dilution rather than fixing it. Re-sending the whole prompt every turn clutters context instead of using targeted reminders. Raising temperature increases randomness, which works against adherence.',
    },
    {
      id: 'q6',
      question: 'You want a coding assistant to reliably produce beginner-level vs expert-level explanations of the same concept. Which technique most directly teaches this distinction?',
      options: [
        'A longer prose paragraph describing how beginner and expert answers differ.',
        'A conditional that switches on whether the user typed the word "beginner."',
        'Two contrasting few-shot examples: one beginner answer and one expert answer.',
        'A prohibition list forbidding overly technical or overly simple language.',
      ],
      answer: 2,
      explanation: 'Correct: examples show the exact behavior rather than describing it, and two contrasting demonstrations teach a distinction the model needs to learn more densely than prose. A longer prose description still only tells the model about the behavior. A conditional on the literal word "beginner" is a shallow keyword match that fails for users who never use that word. A prohibition list states what to avoid but never demonstrates the target behavior, so it is weaker for teaching a distinction.',
    },
    {
      id: 'q7',
      question: 'A user says: "Tidy up this 300-word memo." The request could mean fixing grammar, restructuring, or changing tone. The task is low-risk and easily redone. What is the best response?',
      options: [
        'Ask four questions covering grammar, structure, tone, and formatting before editing.',
        'Refuse to start until the user writes a complete specification.',
        'Edit for the most likely intent while stating the assumption: "I\'ll focus on grammar and flow — redirect me if you meant restructuring."',
        'Silently apply every possible kind of edit at once.',
      ],
      answer: 2,
      explanation: 'Correct: for a low-risk, easily redirected task, committing to a direction with an explicit, stated assumption lowers the cost of correction and avoids preflight friction. Asking four questions at once feels like an interrogation, and users typically answer only the first. Refusing until a full spec exists adds friction far exceeding the cost of a small redirect. Applying every edit silently makes a hidden, sweeping change the user cannot easily evaluate or steer.',
    },
    {
      id: 'q8',
      question: 'A travel assistant gets a request for "the cheapest fare AND a nonstop arriving by 9 AM Friday," but on this route those constraints cannot both be met. What should it do?',
      options: [
        'Quietly book the cheapest flight, which arrives Saturday, and mention the time in a footnote.',
        'Average the two goals and book a moderately priced flight arriving midday Friday.',
        'Book the nonstop and assume the user values convenience over price.',
        'Name the conflict explicitly and ask which constraint should take priority.',
      ],
      answer: 3,
      explanation: 'Correct: when stated goals conflict, surface the tension and ask which should govern rather than guessing — hidden compromises satisfy neither goal and usually require rework. Quietly booking the cheapest option buries the unmet arrival constraint and is a silent compromise. Averaging the goals produces a vague middle that fits neither stated preference. Booking the nonstop assumes a priority the user never expressed, which is just a different hidden compromise.',
    },
    {
      id: 'q9',
      question: 'An assistant is about to perform an irreversible, costly action in a regulated domain, and the request is genuinely ambiguous. How does this change the usual "prefer proceeding with assumptions" guidance?',
      options: [
        'It does not change anything — proceeding with a stated assumption is always preferred to reduce friction.',
        'Here you should ask first and proceed only after explicit confirmation, because the action is irreversible, costly, and regulated.',
        'You should ask three or four clarifying questions at once to fully de-risk the action.',
        'You should refuse the request outright since regulated domains are off-limits.',
      ],
      answer: 1,
      explanation: 'Correct: the default of proceeding-with-assumptions applies to low-risk, reversible work; when the action is irreversible, costly, or touches a regulated domain, the exception applies — ask first and act only after explicit confirmation. Saying nothing changes ignores that very exception. Firing off three or four questions at once still triggers the interrogation problem where users answer only the first; ask the single most decision-changing question. Refusing outright is an overreaction — confirmation, not refusal, is the right step.',
    },
    {
      id: 'q10',
      question: 'A pipeline must return strictly valid JSON matching a fixed schema for a downstream database. Which approach gives the strongest format guarantee?',
      options: [
        'A system prompt instruction: "Respond only with valid JSON and nothing else."',
        'A prohibition list forbidding prose, markdown, and code fences around the JSON.',
        'Structured outputs or tool-use input_schema that constrain the output to the schema.',
        'A partial assistant prefill that starts the reply with an opening brace.',
      ],
      answer: 2,
      explanation: 'Correct: schema-backed structured outputs or tool-use input schemas enforce the shape and are more reliable than any text instruction for machine-readable formats. "Respond only with valid JSON" is a text instruction that can still drift. A prohibition list around the JSON has the same weakness — it guides but does not guarantee. A prefilled opening brace nudges the format but does not enforce schema validity for the rest of the output.',
    },
    {
      id: 'q11',
      question: 'Every reply from an assistant opens with "I\'d be happy to help!" before getting to the answer. The team wants to skip this boilerplate on a specific set of API calls with minimal prompt changes. What is the most targeted fix?',
      options: [
        'Add "Never begin with I\'d be happy to help" to the system prompt.',
        'Use a short partial assistant prefill, such as "Here is the analysis:", to skip the boilerplate.',
        'Append a long style section listing dozens of banned opening phrases.',
        'Lower the temperature so the model stops repeating the same opener.',
      ],
      answer: 1,
      explanation: 'Correct: a short partial prefill of the assistant turn skips the repetitive opener directly and is well suited to repetitive greetings — kept to one phrase. A single "never" instruction helps salience but does not reliably suppress the opener. A long list of banned phrases bloats the prompt and still offers no guarantee. Lowering temperature reduces variability but does not specifically remove a learned boilerplate opening.',
    },
    {
      id: 'q12',
      question: 'A developer wants to neaten purely cosmetic issues in model output — stray double blank lines and inconsistent trailing punctuation — with maximum reliability. What is the recommended approach?',
      options: [
        'Add detailed formatting rules to the system prompt describing exact spacing and punctuation.',
        'Prefill the assistant turn with a formatting template for every response.',
        'Apply a deterministic post-processing step in the application layer.',
        'Switch the response to a JSON structured output schema.',
      ],
      answer: 2,
      explanation: 'Correct: for purely cosmetic cleanup, a deterministic post-processing step in your application is simpler and more reliable than prompt engineering. Adding spacing and punctuation rules to the prompt is fragile and sits at the bottom of the priority ordering for such issues. Prefilling a template every response is heavy-handed and does not fix output the model generates after the prefill. A JSON schema is for machine-readable data structures, not for cosmetic whitespace in prose.',
    },
    {
      id: 'q13',
      question: 'In a system prompt, a designer puts the persona under <role> and the tone guidance under <style>, even though both mention "tone." Why are XML-style section tags helpful here?',
      options: [
        'The tags are parsed by the API as special directives that hard-enforce each section.',
        'They improve salience and organization, and cleanly separate sections even when the same word appears in more than one.',
        'They guarantee the model weights each section equally throughout a long conversation.',
        'They replace the need to send the system prompt on every request.',
      ],
      answer: 1,
      explanation: 'Correct: XML-style tags are not magic but they improve salience and organization, and they let a <role> block stay distinct from a <style> block even when both reference "tone." They are not special API directives and do not hard-enforce anything. They do not guarantee equal weighting over a long session — prompt dilution still occurs. And they have nothing to do with whether the prompt is sent each turn; the stateless API still requires it on every request.',
    },
    {
      id: 'q14',
      question: 'A multi-day assistant session needs the prompt to reflect the user\'s current plan and completed steps over time. Which practice fits the "system prompt as living configuration" idea?',
      options: [
        'Keep the day-one system prompt frozen and rely on the message history to carry all updated state.',
        'Update the system prompt between turns to reflect what is now true, while still sending full history in messages.',
        'Send the original system prompt only once and let later tool results carry the new state.',
        'Move the entire plan and step history into a single tool result each turn.',
      ],
      answer: 1,
      explanation: 'Correct: treat the system prompt as living configuration — update it between turns to carry "what currently holds" (current plan, completed steps), while the full conversation still goes in messages. Freezing the day-one prompt and leaning on history alone misses the point that the prompt should reflect current truth. Sending the prompt only once breaks the stateless requirement to include it every turn. Burying state in tool results is wrong — tool results are for information the agent itself requested, not for externally changed state.',
    },
    {
      id: 'q15',
      question: 'A session is transitioning from finishing one task to starting an unrelated one, and the team worries key constraints will drift across the boundary. What is the recommended reinforcement technique?',
      options: [
        'Re-send the entire system prompt verbatim on every subsequent turn.',
        'Append a brief user-role message at the phase change restating the current operating constraints.',
        'Increase the sliding window so more of the original system prompt stays in context.',
        'Add several new conditionals to the system prompt covering the new task.',
      ],
      answer: 1,
      explanation: 'Correct: appending a short user-role reminder at a natural breakpoint restates current constraints and integrates with the conversational flow the model is already attending to, which is more effective than re-sending the whole prompt. Re-sending the full system prompt every turn clutters context and is exactly what the targeted-reminder approach avoids. The system prompt is not part of the message sliding window, so enlarging the window does not address dilution of it. Piling on new conditionals bloats the prompt and tends to reduce adherence rather than reinforce it.',
    },
  ],
}
