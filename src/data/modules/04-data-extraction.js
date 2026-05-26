export default {
  id: 'data-extraction',
  num: 4,
  title: 'Structured Data Extraction and Validation',
  summary: 'Schema compliance does not prove source truth. This module covers the full extraction architecture: schema design that reduces fabrication, provenance fields, semantic validation, staged extraction for long documents, calibrated confidence routing, feedback loops, and batch processing.',
  estMinutes: 42,
  tags: ['Extraction', 'Validation', 'Schema'],

  lessons: [
    {
      id: 'schema-design',
      title: 'Schema Design: Shaping Output Without Forcing Fabrication',
      minutes: 8,
      body: `> **TL;DR** — A schema constrains *shape*, never *truth*. Schema compliance does not prove the source supported the value, so a required field with no source content quietly pressures the model to invent one. Design absence into the schema deliberately.

A constrained decoder only samples tokens that satisfy the grammar. If a field is required and non-nullable, the grammar leaves no path to "not stated" — when the source provides nothing, the decoder still emits *some* value of the right type, typically the most plausible-looking one. That is structural fabrication pressure baked into the schema: the output validates cleanly precisely because the constraint was satisfied. **Schema compliance does not prove source truth** — it guarantees that every field holds the right *type*, not that the *source* ever supplied a value. The fix is to make absence representable, so the model has a legal token sequence for "the source did not say."

### Why schema-backed output is still the baseline

For production pipelines that feed databases, workflow engines, or audits, you need schema-backed output — either \`output_config.format\` (JSON structured outputs for direct responses) or tool use / strict tool use when the extraction is represented as a function call. Prompt-only JSON ("respond with valid JSON matching this shape") works for quick prototypes but is not production-grade: a stray sentence, a markdown fence, or a missing comma breaks your parser.

But getting valid JSON is only the *first* layer. A schema can verify that \`attendee_count\` is an integer; it cannot verify that the article ever stated an attendee count. When the grammar demands an integer and the source has none, the decoder still emits one — the most plausible-looking value, not a true one.

The fix is deliberate **absence semantics**. Use nullable or optional fields for information the source may not provide:

| Situation | Schema Pattern |
|---|---|
| Field may not appear in source | Optional field or nullable value |
| List may be explicitly empty | Empty array allowed |
| List item unknown but field exists | Item with \`value: null\` and \`reason\` |
| Ambiguous classification | Add enum value such as \`unclear\` |
| Open-ended category set | Enum plus \`other_detail\`, or string plus normalization |

### Escape hatches for evolving domains

Closed enums are ideal when the domain is stable. But if new categories appear regularly, a strict enum without an escape hatch turns every new category into a validation failure. The production pattern pairs a catch-all value with a detail field:

\`\`\`json
{
  "equipment_type": {
    "type": "string",
    "enum": ["laptop", "monitor", "printer", "network_device", "other"]
  },
  "equipment_type_detail": {
    "type": ["string", "null"],
    "description": "Original source wording when equipment_type is 'other'."
  }
}
\`\`\`

When \`equipment_type\` is \`"other"\`, the raw phrase from the source goes into \`equipment_type_detail\`. You get a valid extraction now and can normalize it to a new enum value later — without an emergency schema change.

### Weak vs strong: an attendance field on meeting notes

**❌ Weak — required field with no escape**
\`\`\`json
{
  "attendee_count": { "type": "integer" },
  "required": ["attendee_count"]
}
\`\`\`
Meeting notes rarely state attendance. The decoder must emit *some* integer, so it fabricates a plausible one. Validation passes; the data is wrong.

**✅ Strong — nullable, with provenance to prove the claim**
\`\`\`json
{
  "attendee_count": {
    "type": ["integer", "null"],
    "description": "Number of attendees ONLY if explicitly stated; otherwise null."
  },
  "attendee_count_source_quote": { "type": ["string", "null"] }
}
\`\`\`
Now the model has an honest place to signal absence (\`null\`) and a place to *prove* a non-null value with the source quote. The first call tells the truth directly.

### Visual aid: how fabrication pressure flows

\`\`\`mermaid
flowchart TD
    A{"Source has the value?"}
    A -->|yes| B["Model extracts it (good)"]
    A -->|no| C{"Field is REQUIRED<br/>non-null?"}
    C -->|yes| D["Decoder MUST emit a value<br/>FABRICATION — passes schema!"]
    C -->|no| E{"Field allows null<br/>or optional?"}
    E -->|yes| F["Model returns null<br/>honest absence"]
\`\`\`

### null vs empty array — it matters

These two are not the same semantic claim:

- \`"pros": []\` — "The reviewer mentioned no pros." (A real claim about the review.)
- \`"pros": null\` — "The document did not address pros." (Closer to the truth for a very short review.)

Choose the right absence representation for each field or you silently misrepresent source content.

> ❓ **Check yourself:** Every response passes strict schema validation, yet an audit finds 12% of values appear nowhere in the source. A teammate wants to rebuild the schema to stop it. What is actually wrong, and what is the fix?
>
> *(Nothing is wrong with the schema's well-formedness — that is precisely why the invented data validates. Compliance constrains shape, not source truth. The non-nullable required fields leave the decoder no legal token for "not stated," so it emits a plausible value. Make those fields nullable or optional so absence has a legal encoding.)*

### Key takeaways
- Schema compliance guarantees **shape, not source truth** — valid JSON can still be invented data.
- Required fields with absent source data structurally pressure the model to fabricate; make them nullable or optional.
- Design absence semantics explicitly: \`null\`, empty array, or an \`unclear\` enum value — and know which means what.
- Always pair a catch-all enum value (\`other\`) with a detail field for the source's raw wording.`,
      principles: [
        "Schema compliance guarantees shape, not source truth — valid JSON can still be invented data.",
        "Required fields with absent source data pressure fabrication; make them nullable to allow honest absence.",
        "`null` means the source never addressed the field; `[]` claims it did and found nothing — choose deliberately.",
        "Pair every `\"other\"` enum value with a detail field for raw source wording so new categories stay valid.",
      ],
      pitfalls: [
        "Valid JSON is not proof of correct data — schema checks shape only; spot-check extractions against the source.",
        "Required fields with rare source data silently fabricate on every omission; make the field nullable.",
        "Strict closed enums cause new categories to fail or mismatch silently; add `\"other\"` and a detail field.",
        "Conflating `[]` (source found nothing) with `null` (source never raised it) misrepresents the document.",
      ],
    },
    {
      id: 'reducing-fabrication',
      title: 'Reducing Fabrication: Instructions, Examples, and Schema Fixes',
      minutes: 7,
      body: `> **TL;DR** — Fabrication has two roots: instructions that blur extraction with inference, and schemas that demand values the source lacks. Fix the schema first; a "verification" second call treats the symptom, not the cause.

Fabrication is rarely a capability gap; it is the model answering because nothing in the instructions or the schema makes "not stated" a legal answer. You suppress it on two fronts at once: (1) instruct the model to report only what the source states and never infer missing values, and (2) give the schema a place to record absence (a nullable field, an \`unclear\` enum, an informal-value string). Omit either and the model falls back to producing a plausible value — like a witness who, lacking permission to say "I didn't see the plate," supplies a plausible one anyway. And note: **schema compliance does not prove source truth**, so a confident guess still validates cleanly.

### Instruction patterns that help

Include these directives explicitly — do not assume the model infers them from context:

- "Extract only values stated in the source."
- "Use \`null\` when the source does not provide the information."
- "Do not infer missing values from typical examples or common sense."
- "Preserve informal measurements verbatim when no precise value is given."

The last one matters for real-world data. A recipe might say "a handful of flour." If your schema requires a \`quantity_grams\` float, the model will invent a number. If your schema also allows a \`quantity_informal\` string, the model has somewhere honest to put the actual source wording.

### Few-shot examples beat verbose rules for format subtleties

Narrative instructions explain *what* to do. Few-shot examples demonstrate exactly *how*. For subtle distinctions — "cotton blend" vs. "Cotton/Polyester mix", date formats, unit normalization — 2-3 concrete input/output pairs teach the pattern more reliably than a paragraph of written rules. The "why": a paragraph describes a target; an example *is* the target, and the model is far better at imitation than at compiling prose into behavior.

Show edge-case pairs that cover:

- Missing or null values
- Ambiguous sentiment (sarcasm, mixed reviews)
- Informal or non-standard units
- Compound phrases that must be split or kept together
- Multiple values in one sentence
- Facts buried in non-standard document sections

### Weak vs strong: stopping invented gram values

**❌ Weak — a verification call bolted on**
\`\`\`mermaid
sequenceDiagram
    participant P as Pipeline
    participant M as Model
    P->>M: Call 1 — extract quantity_grams
    M-->>P: quantity_grams: 50 (invented from "a handful")
    P->>M: Call 2 — verify quantity_grams against source
    M-->>P: "Yes, 50g looks right."
\`\`\`
The verifier *rationalizes* the original guess, doubles cost and latency, and never touches the cause: the schema demanded a number.

**✅ Strong — fix the schema so absence is expressible**
\`\`\`json
{
  "quantity_grams": { "type": ["number", "null"] },
  "quantity_informal": { "type": ["string", "null"] }
}
\`\`\`
Plus the instruction "preserve informal measurements verbatim." Now \`"a handful"\` lands in \`quantity_informal\` and \`quantity_grams\` is \`null\`. The first call is honest. No second call needed.

### Visual aid: matching the fix to the root cause

\`\`\`mermaid
flowchart TD
    F["Fabrication detected"] --> A{"Is not-stated an<br/>ALLOWED answer?"}
    A -->|no| B["Make field nullable<br/>+ add extract-only instruction"]
    A -->|yes| C{"Format or<br/>pattern wrong?"}
    C -->|yes| D["Add 2-3 few-shot pairs<br/>NOT a verification call"]
    C -->|no| E["Review source content<br/>and schema together"]
\`\`\`

A verification pass is legitimate as a *sampling-based audit* on already-good extractions — not as the primary defense against schema-forced fabrication.

### Calibrated confidence fields

Add self-reported confidence to fields the model is uncertain about. But treat raw confidence scores as uncalibrated estimates until you measure them:

\`\`\`json
{
  "sentiment": {
    "value": "mixed",
    "confidence": 0.71,
    "requires_review": true,
    "review_reasons": ["sarcasm_detected", "conflicting_sentences"]
  }
}
\`\`\`

This pattern works for routing to human review, but \`confidence: 0.71\` does not mean 71% accurate until you validate it against labeled examples (covered later).

> ❓ **Check yourself:** A schema forces \`attendee_count\` even when notes omit it, producing invented counts. A teammate proposes a second model call to verify each count. Why is that the wrong layer to fix, and what is the right one?
>
> *(The verification call treats the symptom: it pays for an extra call, can rationalize the original guess, and leaves the forcing schema intact. The fault is in schema design, not extraction skill. Make \`attendee_count\` nullable so the very first call can encode "not stated" instead of inventing a number.)*

### Key takeaways
- Fix the schema first; verification calls are expensive and treat the symptom, not the cause.
- Few-shot examples are more effective than narrative rules for teaching format consistency.
- Preserve informal source values verbatim rather than forcing a numeric conversion.
- A verification pass belongs as an audit on good extractions, not as a fabrication fix.`,
      principles: [
        "Fix the schema first — a verification second call rationalizes the invented value without fixing the cause.",
        "2-3 few-shot input/output pairs teach subtle format distinctions better than a paragraph of rules.",
        "Preserve informal source values verbatim in a `quantity_informal` field; never force a numeric conversion.",
      ],
      pitfalls: [
        "A verification second call rationalizes the fabricated value; the fix is making the schema field nullable.",
        "Instructions alone handle edge cases inconsistently; add 2-3 examples covering sarcasm and informal units.",
        "`confidence: 0.91` is a model prediction, not a measured rate; validate against a labeled set before routing.",
      ],
    },
    {
      id: 'provenance-validation',
      title: 'Source Grounding, Provenance, and Semantic Validation',
      minutes: 8,
      body: `> **TL;DR** — Schema validation checks structure; semantic validation checks meaning. Neither alone is enough. Provenance fields bridge them, and when validation fails you send a *correction request* (source + failed output + exact errors), not a blind retry.

Schema validation and semantic validation catch disjoint error classes: the schema enforces type, presence, enum, and shape; only application-code checks catch domain violations like line items that do not sum or a date outside its valid range. Provenance fields are how you make the gap auditable — by carrying \`source_location\` and \`source_quote\` in the schema, you turn each extracted value from a bare assertion ("notice period is 45 days") into a checkable citation, the practical answer to **schema compliance does not prove source truth**. When a value fails validation, the high-leverage move is a correction request that hands the model the exact defect rather than re-running the identical prompt and getting the identical mismatch.

### Provenance fields

For contracts, legal documents, financial records, and any extraction subject to audit, include provenance information directly in the schema:

\`\`\`json
{
  "termination_notice_days": {
    "value": 45,
    "source_location": "Amendment 2, Section 4",
    "source_quote": "The notice period is amended to forty-five days.",
    "effective_date": "2026-01-01"
  }
}
\`\`\`

This is critical when:

- Source documents contain amendments that override earlier values.
- Multiple sections conflict and a reviewer must audit the model's precedence decision.
- Final reports need citations traceable to specific paragraphs.
- Human reviewers must spot-check without re-reading the entire document.

**Important API note:** The Citations API feature and JSON structured outputs are often incompatible, because citations require interleaved citation blocks while JSON schemas require constrained JSON. When you need both structured extraction and provenance, represent source locations explicitly in your schema instead of assuming the citation feature works for every JSON field.

### Amendments and precedence

A single scalar field is often the wrong design for contracts with amendments. Consider:

\`\`\`json
{
  "termination_notice_days": {
    "original_value": 30,
    "original_location": "Section 12.1",
    "amended_value": 45,
    "amended_location": "Amendment 2, Section 4",
    "effective_date": "2026-01-01",
    "controlling_value": 45
  }
}
\`\`\`

For known precedence rules ("use the detailed specifications table over marketing summary text"), state the rule in the extraction instructions and keep the schema simple. Only expose multiple value variants when reviewers must audit the precedence decision itself.

### Semantic validation layer

JSON Schema, structured outputs, strict tool use, and Pydantic validators catch type, presence, enum, and shape errors. They do **not** catch semantic errors. Add domain validation in your application code:

- Line items sum to the stated total.
- Dates fall within allowed ranges (for example, effective dates after contract execution).
- IDs match known formats or known records.
- Required citations appear in the source document.
- A duration was not placed into an ingredient quantity field.

### Weak vs strong: an invoice whose line items do not sum

**❌ Weak — trust the schema, blind-retry on trouble**
\`\`\`mermaid
flowchart LR
    A["Extract invoice"] --> B["Totals look off"]
    B --> C["Please try again<br/>same input, no guidance"]
    C --> A
\`\`\`
Strict tool use validated the *types*, so nothing flagged the arithmetic. The blind retry sees the same input and reproduces the same mismatch.

**✅ Strong — reconciliation fields + a correction request**
\`\`\`json
{
  "line_items": [ { "description": "Widget A", "subtotal": 1280.50 } ],
  "calculated_total": 1280.50,
  "stated_total": 1295.00,
  "totals_match": false
}
\`\`\`
Application code flags \`totals_match: false\` and sends a *correction request*:

> The extraction below failed validation.
> Source document: [original document here]
> Previous extraction: [the failed structured output]
> Validation errors:
> - line_items_total (1280.50) does not equal stated_total (1295.00)
> - vendor_id "ACME-42" does not match expected pattern "V-[0-9]{6}"
> Return a corrected call to extract_invoice.
> Do not change fields that are not related to the listed errors.

This far outperforms "try again" and beats setting \`temperature: 0\`, which only removes variability without addressing the schema-vs-source mismatch.

### Visual aid: the validation and correction loop

\`\`\`mermaid
flowchart TD
    A["Extract"] --> B{"Schema valid?"}
    B -->|no| C["Shape error<br/>fix schema or prompt"]
    B -->|yes| D{"Semantic valid?<br/>totals, ranges, IDs, citations"}
    D -->|yes| E["Accept"]
    D -->|no| F{"External doc<br/>missing?"}
    F -->|yes| G["Retrieve source<br/>or human review"]
    F -->|no| H["Correction request<br/>source + failed output + EXACT errors"]
    H --> A
\`\`\`

### When retries are unproductive

| Failure type | Retry helps? |
|---|---|
| Information is in an external document not provided | No — retries produce hallucinated values |
| Schema requires different format than source provides | Yes — correct with feedback |
| Locale-formatted number needs to become integer | Yes — trivially fixed with feedback |
| ISO 8601 datetime needs to be date-only | Yes — easily fixed with feedback |

The first case is the only one where additional retries are unproductive. Retrieve the missing source or route to human review instead.

> ❓ **Check yourself:** Your invoice extractions pass strict tool-use validation, but line items still do not sum to the stated total. Which error class slipped through, and how do you catch it next time?
>
> *(A semantic error. Strict tool use enforces type, presence, enum, and shape — never arithmetic consistency, which is domain logic. Add reconciliation fields such as \`calculated_total\`, \`stated_total\`, and \`totals_match\`, then verify the sum in application code and route mismatches into a correction request.)*

### Key takeaways
- Represent provenance explicitly in your schema when citations and structured outputs are both required.
- Semantic validation must run in application code — schemas cannot catch domain logic errors.
- The correction-request pattern (source + failed output + exact errors) beats blind retries and \`temperature: 0\`.
- Add reconciliation fields for known inconsistency-prone field pairs; only external-source gaps are unfixable by retry.`,
      principles: [
        "Encode provenance in the schema — Citations API interleaved blocks and constrained JSON are incompatible.",
        "Schemas cannot catch domain errors like arithmetic totals; run semantic validation in application code.",
        "On validation failure send source + failed output + exact errors — blind retries reproduce the same mismatch.",
        "Add `totals_match` reconciliation fields to surface arithmetic mismatches as structured correction requests.",
      ],
      pitfalls: [
        "Citations API blocks conflict with constrained JSON; put `source_location` and `source_quote` in the schema.",
        "Blind retries on invalid extractions reproduce the same mismatch; send a correction request with exact errors.",
        "`temperature: 0` hardens the wrong answer; send an error-specific correction request instead.",
        "A scalar for an amendable field drops the amendment trail; use a sub-object with original and amended values.",
      ],
    },
    {
      id: 'staged-extraction',
      title: 'Long and Scattered Documents: Staged Extraction',
      minutes: 6,
      body: `> **TL;DR** — A document can fit in context and still extract poorly when facts are scattered or amended. Map first (surface the relevant bits with locations), then extract against that focused intermediate — chunking alone breaks cross-section relationships.

Fitting in the context window is necessary but not sufficient: a single call must attend to the whole document *and* populate every field at once, so facts buried in noise get missed, conflated with nearby phrasing, or silently overridden by a later mention. Staged extraction splits that load into two passes. A **mapping pass** surfaces the relevant sections, dates, entities, and amounts — each with its source location — into a compact intermediate; an **extraction pass** then runs against that curated intermediate instead of the raw document, so the model reasons over signal rather than searching for it. It is the difference between answering from a one-read skim of a 200-page contract and answering from a stack of tagged, cross-referenced excerpts.

### Why more few-shot examples don't fix this

The instinct on a sprawling 200-page contract, meeting transcript, or incident report is to add few-shot examples. That helps when the extraction *pattern itself* is unusual, but it does not help the model find a needle in a haystack. The model already knows how to extract — it just has too much noise to attend to. (And remember: even a clean-looking single-pass result proves nothing — **schema compliance does not prove source truth**.)

### The staged extraction pattern

**Stage 1 — Mapping pass.** Ask the model to surface relevant sections, decisions, dates, entities, amounts, and clauses into a structured intermediate, *with source locations*:

\`\`\`json
{
  "relevant_sections": [
    {
      "section_id": "12.1",
      "heading": "Termination Notice",
      "key_content": "Original notice period of 30 days.",
      "amended_by": "Amendment 2, Section 4"
    },
    {
      "section_id": "Amend-2.4",
      "heading": "Amendment 2 — Notice Period",
      "key_content": "Notice period amended to 45 days effective 2026-01-01."
    }
  ]
}
\`\`\`

**Stage 2 — Extraction pass.** Run structured extraction against the *intermediate*, not the full document. The model now operates on a focused, curated summary of what matters.

### Weak vs strong: an amended termination clause

**❌ Weak — independent chunking**
\`\`\`mermaid
flowchart LR
    C3["chunk 3, Section 12<br/>notice = 30 days"] --> A["extraction A → 30"]
    C7["chunk 7, Appendix<br/>notice amended 45"] --> B["extraction B → 45"]
\`\`\`
Two contradictory results, and neither call ever *saw* the other. Chunking spreads the haystack across requests but loses the cross-section relationship.

**✅ Strong — map then extract**
\`\`\`mermaid
flowchart LR
    M["mapping pass<br/>tags BOTH Section 12.1 = 30<br/>and Amendment 2.4 = 45, with locations"] --> E["extraction pass sees both<br/>controlling_value = 45, original = 30"]
\`\`\`

### Visual aid: choosing an approach

\`\`\`mermaid
flowchart LR
    subgraph approaches["Approach comparison"]
        A["Single extraction call<br/>Handles large docs: yes<br/>Cross-section relations: yes<br/>Scattered facts: POOR"]
        B["Chunking<br/>Handles large docs: yes<br/>Cross-section relations: POOR<br/>Scattered facts: partial"]
        C["Staged — map then extract<br/>Handles large docs: yes<br/>Cross-section relations: yes<br/>Scattered facts: GOOD"]
        D["Staged + chunking<br/>Handles large docs: yes<br/>Cross-section relations: yes<br/>Scattered facts: GOOD"]
    end
\`\`\`

Use a mapping pass when the document fits but facts are distributed. For documents that *exceed* context, chunk the **mapping** pass, then run a final extraction against the merged intermediate that resolves cross-chunk conflicts.

### Preserve source locations

Regardless of approach, the intermediate must carry source locations (section IDs, page numbers, paragraph indices) so the final extraction is auditable against the original. Without locations you have structured data but no provenance:

\`\`\`json
{
  "payment_terms_days": {
    "value": 30,
    "source_section": "Section 8.2",
    "source_quote": "Payment is due within thirty (30) calendar days of invoice receipt."
  }
}
\`\`\`

> ❓ **Check yourself:** A 200-page contract fits in context, but the single call keeps returning the stale termination value that an appendix amended. More few-shot examples have not helped. Why don't they, and what does?
>
> *(Few-shot examples teach an extraction pattern; this is a needle-finding problem — the model already knows the pattern but cannot reliably attend to a scattered, overridden fact buried in noise. Use staged extraction: a mapping pass surfaces both the original clause and the amendment with their source locations, then the extraction pass reasons over that focused intermediate and resolves precedence.)*

### Key takeaways
- A pre-extraction mapping pass reduces noise and conflation better than more few-shot examples alone.
- Chunking splits the haystack but breaks cross-chunk relationships — use staged extraction for cross-section facts.
- For documents exceeding context, chunk the mapping pass, then extract against a merged, conflict-resolved intermediate.
- Always carry source locations through staged extraction so results remain auditable.`,
      principles: [
        "A mapping pass reduces scattered-fact misses better than more examples — the problem is noise, not skill.",
        "Chunking breaks cross-chunk relationships; a mapping pass keeps clause and amendment visible together.",
        "Carry `section_id` and page numbers through the mapping intermediate so every extracted value stays auditable.",
      ],
      pitfalls: [
        "A single call on a long scattered document misses facts even when the model is capable; use a mapping pass.",
        "Chunking without a merge step yields contradictions when a clause and its amendment land in separate chunks.",
        "Discarding source locations in the mapping intermediate makes the extraction result an unverifiable claim.",
      ],
    },
    {
      id: 'confidence-human-review',
      title: 'Confidence Scoring, Human Review, and Validating Automation',
      minutes: 7,
      body: `> **TL;DR** — A self-reported \`confidence: 0.92\` is an unverified claim until you calibrate it against labeled data, segmented by document type, field, and source quality. A 97% aggregate can hide an 80% segment, so segment before you automate.

\`confidence: 0.92\` is the model's *prediction about its own accuracy*, generated by the same process that can produce a confident wrong answer — and like every field, **schema compliance does not prove source truth**, so the number itself proves nothing. Calibration is the empirical check: a "0.92" band is only trustworthy if outputs in that band are actually correct about 92% of the time, measured against labeled data, the same way a weather forecaster's "90% rain" is only meaningful if it rains on roughly 90% of the days they say it. The catch is that calibration is not uniform — it varies sharply by document type, field, and source quality, so a single aggregate accuracy number hides exactly the segments that fail.

### What calibrated confidence looks like

Build a labeled validation set that covers:

- Different document types (invoices, contracts, transcripts, forms)
- Different source quality levels (clean PDFs, scanned images, handwritten notes)
- Different fields (dates, amounts, entity names, enum classifications)
- Different confidence bands (low: < 0.70, medium: 0.70-0.90, high: > 0.90)

Measure accuracy within each cell. You will often find that high-confidence extractions on one document type are only 80% accurate on another. That asymmetry is the whole point of calibration.

### A richer confidence field

Replace a bare float with a structured object so you can route precisely:

\`\`\`json
{
  "amount_due": {
    "value": 1280.50,
    "confidence": 0.88,
    "requires_review": true,
    "review_reasons": ["total_mismatch", "low_ocr_quality"]
  }
}
\`\`\`

Route to human review based on:

- Low *calibrated* confidence (not raw confidence).
- Ambiguous or contradictory source content (flagged in \`review_reasons\`).
- High-impact fields where error cost is asymmetric.
- Failed semantic validation (the extraction triggered a reconciliation mismatch).
- New document types or historically error-prone document classes.

### Weak vs strong: deciding what to automate

**❌ Weak — automate on the aggregate**
\`\`\`mermaid
flowchart LR
    A["Pipeline accuracy = 97% overall"] --> B["Remove human review<br/>for all high-confidence outputs"]
    B --> C["Hidden: scanned handwritten invoices<br/>in this band are only 80% accurate"]
\`\`\`
The aggregate masks a dangerous segment, which now flows to no-review automation.

**✅ Strong — segment, then set per-segment thresholds**

| Doc type | Field | Band | Accuracy | Decision |
|---|---|---|---|---|
| clean PDF | amount | high | 99.1% | automate |
| scanned | amount | high | 80.2% | KEEP human review |
| contract | date | medium | 92.0% | sample heavily |

Only the segments that actually clear the bar get automated.

### Visual aid: confidence routing and automation gate

\`\`\`mermaid
flowchart TD
    A["Extraction result"] --> B["Calibrated confidence<br/>+ review_reasons<br/>+ validation result"]
    B --> C{"Low confidence<br/>flagged or<br/>high-impact field?"}
    B --> D{"Failed semantic<br/>validation?"}
    B --> E{"High confidence<br/>and clean?"}
    C -->|yes| HR1["Human review"]
    D -->|yes| CR["Correction request"]
    E -->|yes| SEG{"Segment-level accuracy<br/>meets threshold for<br/>this type, field, source?"}
    SEG -->|yes| AUTO["Automate"]
    SEG -->|no| HR2["Human review"]
\`\`\`

### Validating automation readiness

Before you automate high-confidence extractions (removing human review from the loop):

1. Break accuracy down by document type, field name, and source quality.
2. Identify segments below your threshold.
3. Set the automation threshold **per segment**, not globally.
4. Only after segment-level analysis is stable, consider raising overall thresholds.

Lowering the threshold or comparing thresholds before this segment-level work is premature — it can expose high-error segments to no-review automation.

### Continuous sampling after automation

Even after automation begins, sample high-confidence outputs on a **stratified random** basis (a fixed percentage of each segment). This catches hidden error patterns that look plausible downstream, systematic errors in a new document variant, and prompt or model drift over time. Relying only on downstream complaints misses systematic errors that downstream systems do not detect until they cause visible failures.

> ❓ **Check yourself:** A pipeline is 97% accurate overall and leadership wants to drop human review for high-confidence outputs. Why is the aggregate the wrong number to gate on, and what must precede automation?
>
> *(A single aggregate averages over segments with very different accuracy, so a 97% headline can conceal an 80%-accurate slice — for example, scanned handwritten invoices. Measure accuracy per segment by document type, field, and source quality, then set the automation threshold per segment so only segments that actually clear the bar lose human review.)*

### Key takeaways
- Treat self-reported confidence as uncalibrated until validated against labeled data.
- Segment accuracy by document type, field, and source quality before setting automation thresholds.
- A high aggregate can hide a low-accuracy segment; set thresholds per segment, not globally.
- Continuous stratified sampling after automation catches drift and hidden error patterns.`,
      principles: [
        "Self-reported confidence is uncalibrated until measured against labeled data by doc type and source quality.",
        "A 97% aggregate can hide an 80% segment — segment accuracy before setting automation thresholds.",
        "Keep stratified sampling after automation; downstream systems miss wrong values until visible failures appear.",
      ],
      pitfalls: [
        "Raw `confidence: 0.91` is a model prediction, not a measured rate; validate against a labeled set first.",
        "Aggregate accuracy hides low-performing segments; set per-segment thresholds before removing human review.",
        "Downstream complaints surface systematic errors only after visible failures; keep stratified sampling instead.",
      ],
    },
    {
      id: 'feedback-loops-batch',
      title: 'Feedback Loops, Prompt Iteration, and Batch Extraction',
      minutes: 6,
      body: `> **TL;DR** — Human corrections are structured training signal: analyze them by pattern, fix with the lightest effective intervention (usually a few-shot example), and add diagnostic fields so you can aggregate failures. For high volume, use the Batch API but always join by \`custom_id\` and route urgent work real-time.

A single human correction is an anecdote; the leverage is in aggregating corrections by pattern to see which prompt or schema change fixes the most failures at once — the same reason an airline logs every incident with structured fields and mines the set rather than reacting to one near-miss. This is also the only way to catch the failure mode this whole module is about: because **schema compliance does not prove source truth**, systematically wrong-but-valid outputs surface nowhere except in what humans correct, so corrections must be captured as structured, taggable records, not free text.

### What to collect from corrections

Route human corrections back through an analysis step. Look for recurring patterns:

- Informal units being converted incorrectly ("a handful" becoming 50g without basis).
- Compound phrases split inconsistently ("project manager / business analyst" split into two roles sometimes, kept as one other times).
- Fields missing in nonstandard document sections (a termination clause buried in an appendix).
- False positives in code-review findings (a pattern flagged repeatedly that reviewers dismiss).
- Repeated validation failures by field name across different documents.

### Targeted improvements

When a clear recurring failure mode appears, match the fix to the failure — lightest effective intervention first:

| Failure mode | Most effective fix |
|---|---|
| Model misses informal values | Add few-shot example showing verbatim preservation |
| Enum category mismatch | Add \`other\` + detail field, or add the new category |
| Field missing in nonstandard section | Add example with that section structure |
| Format inconsistency | Add input/output example for that format |
| Systematic over-reporting of a code pattern | Add \`rule_id\` + \`evidence\` fields; suppress by pattern |

Fine-tuning, regex post-processing, or new schema fields are heavier interventions. Reach for them only if focused prompt and schema changes do not move the metric.

### Weak vs strong: a noisy code-review extractor

**❌ Weak — aggregate dismiss rate, then fine-tune**
\`\`\`mermaid
flowchart LR
    O["Observed: 35% of findings dismissed"] --> X["Jump to conclusion:<br/>fine-tune the model"]
\`\`\`
You cannot tell *which* constructs over-report, and fine-tuning is a heavy, slow intervention aimed at an undiagnosed cause.

**✅ Strong — diagnostic fields, then a targeted prompt change**
\`\`\`json
{
  "finding_id": "F-0042",
  "severity": "warning",
  "detected_pattern": "raw_sql_string_concat",
  "rule_id": "SQLI-01",
  "evidence": "Line 47: query = 'SELECT * FROM users WHERE id=' + user_input",
  "dismissed": false
}
\`\`\`
Now you can observe "82% of SQLI-01 findings on queries built through an object-relational mapper are dismissed" and revise the prompt criteria for *that* pattern. The feedback loop needs structured data at the finding level, not just aggregate rates.

### Visual aid: the correction feedback loop

\`\`\`mermaid
flowchart LR
    A["Extraction"] --> B["Human correction"]
    B --> C["Tag by pattern<br/>rule_id, field, section"]
    C --> D["Aggregate by pattern<br/>find highest-leverage"]
    D --> E["Pick lightest fix<br/>few-shot then schema field<br/>then regex then fine-tune"]
    E --> F["Prompt or schema update"]
    F --> A
\`\`\`

### Batch extraction with the Message Batches API

For high-volume, latency-tolerant extraction, the Message Batches API reduces cost. Use it when the workflow can tolerate delayed results (hours, not seconds).

Key operational rules:

1. **Always join by \`custom_id\`.** Results may not arrive in submission order. A \`custom_id\` per document is mandatory.
2. **Resubmit only failures.** If 3% of documents fail due to context length or validation errors, fix the cause (chunk long inputs, fix the prompt) and resubmit only those documents — not the full batch.
3. **Route by urgency, not batch.** For mixed-urgency queues, route standard documents to the Batch API and time-critical ones to the real-time Messages API. Batching everything and then trying to expedite urgent items inside a batch defeats the latency benefit — batch processing latency is exactly why urgent items cannot use it.

### Bulk one-shot extraction strategy

For a deadline-driven bulk run (50,000 documents in two weeks):

1. Submit all documents to the Batch API for the bulk discount.
2. Simultaneously, sample a small subset via the real-time Messages API to characterize failure modes quickly.
3. When batch results arrive, resubmit failures in successive batches with refined prompts.

Sequential batches of small subsets (10 × 5,000) cost more in calendar time and do not buy meaningful learning over the sample-then-bulk strategy. The real-time sample gives early signal; the full batch gives coverage and cost efficiency.

> ❓ **Check yourself:** A queue is mostly standard documents plus a few time-critical urgent ones bound by a service-level agreement. An engineer wants to submit everything to the Batch API and expedite the urgent ones inside the batch. Why can't that work, and what is the right routing?
>
> *(There is no "expedite inside a batch": batch processing latency is uniform and is exactly the property the urgent items cannot tolerate, and results may not even return in submission order, so reading the first result is no guarantee. Route per document — standard work to the Batch API for the discount, urgent work to the real-time Messages API.)*

### Key takeaways
- Human corrections are structured training signal — analyze them by pattern, not ad hoc.
- Add diagnostic fields (\`rule_id\`, \`detected_pattern\`, \`evidence\`) to enable pattern-level feedback analysis.
- Always join Batch API results by \`custom_id\`; results may not arrive in submission order.
- Route by urgency: Batch API for standard throughput, real-time API for time-critical documents.`,
      principles: [
        "Human corrections are training signal — tag by field and rule ID so patterns reveal the highest-leverage fix.",
        "Add `rule_id`, `detected_pattern`, `evidence` fields; a 35% dismiss rate is useless without a pattern target.",
        "Always join Batch API results by `custom_id` — results arrive in any order; positional matching misroutes.",
        "Route by urgency: Batch API for standard throughput, real-time API for time-critical items.",
      ],
      pitfalls: [
        "Untagged corrections are noise; tag each correction with field name, detected pattern, and section type.",
        "Reaching for fine-tuning before prompt fixes wastes time; a few-shot example often resolves the same failure.",
        "Batch API results do not arrive in submission order; assign a unique `custom_id` per document and join on it.",
        "Urgent items cannot be expedited inside a batch — latency is uniform; use the real-time Messages API instead.",
      ],
    },
  ],

  exercises: [
    {
      id: 'ex-schema-compliance',
      type: 'mcq',
      scenario: 'Your extraction pipeline uses strict JSON structured outputs. Every response passes schema validation. A downstream audit finds that 12% of extracted contract values do not appear anywhere in the source documents.',
      question: 'What is the most accurate diagnosis?',
      options: [
        'The JSON schema is incorrect and needs to be rewritten.',
        'Schema compliance guarantees shape, not source truth — the model is fabricating values for fields the source did not provide.',
        'The model is hallucinating because the temperature is too high.',
        'Structured outputs are unreliable and should be replaced with free-form text.',
      ],
      answer: 1,
      explanation: 'Schema compliance is a format guarantee, not a source-truth guarantee. A constrained decoder ensures the output matches the required shape. It cannot verify that the source document supported the extracted value. The root cause here is likely required fields that the source rarely provides, creating fabrication pressure.',
    },
    {
      id: 'ex-fabrication-fix',
      type: 'mcq',
      scenario: 'An extraction schema has a required field `attendee_count` (integer). Source documents are meeting notes that often do not mention attendance numbers. The pipeline produces plausible-sounding but invented counts for about 30% of documents.',
      question: 'What is the most effective fix?',
      options: [
        'Add a second LLM "verification" call to check each extracted count against the source.',
        'Set temperature to 0 to reduce variability.',
        'Make `attendee_count` nullable (or optional) so the model can return null when the source does not state a count.',
        'Add more few-shot examples with exact attendance numbers.',
      ],
      answer: 2,
      explanation: 'The schema requires a value the source often does not contain. That is structural fabrication pressure. Making the field nullable removes the pressure — the model can return null honestly, which is cheaper and more accurate than a verification second call. Temperature: 0 only removes variability; it does not fix a schema design problem. More few-shot examples with counts do not help when the source genuinely has no count to extract.',
    },
    {
      id: 'ex-staged-pipeline-order',
      type: 'mcq',
      scenario: 'A 200-page contract fits in context but a single extraction call keeps returning the stale termination value, missing the amendment buried in the appendix. Adding more few-shot examples has not helped.',
      question: 'Which staged extraction sequence correctly resolves cross-section facts in a long scattered document?',
      options: [
        'Chunk the document into 10-page segments, extract each independently, then pick the most common value.',
        'Run a mapping pass (surface relevant sections and amendments with source locations into a structured intermediate), then run the extraction pass against that intermediate.',
        'Run extraction first, then run a separate verification call to check each value against the full document.',
        'Increase the context window limit and run the single extraction call again with more few-shot examples.',
      ],
      answer: 1,
      explanation: "The mapping pass collects both the original clause and the amendment with their source locations into a focused intermediate; the extraction pass then sees both and resolves precedence. Independent chunking is the worst choice here because the clause and its amendment land in different chunks and never see each other, yielding contradictory results. A verification call doesn't help the model find scattered facts — it just adds cost. More few-shot examples teach extraction patterns, not needle-finding in a haystack.",
    },
    {
      id: 'ex-confidence-match',
      type: 'mcq',
      scenario: 'A pipeline reports `confidence: 0.92` on extracted invoice amounts. Leadership wants to use this as the automation gate, assuming outputs at or above 0.92 are 92% accurate and can skip human review.',
      question: 'What is the critical flaw in this approach?',
      options: [
        'Raw confidence scores are always exactly accurate, so 0.92 means 92% correct by definition.',
        'Confidence scores above 0.90 are never reliable and should be ignored entirely.',
        'Self-reported confidence is an uncalibrated model prediction; high-confidence extractions on one document type can be far less accurate on another until validated against a labeled set segmented by document type, field, and source quality.',
        'The automation threshold should be set to 0.99 to ensure high accuracy before removing human review.',
      ],
      answer: 2,
      explanation: "Self-reported confidence is a model prediction, not a measured accuracy rate. Until you validate confidence scores against a labeled set broken down by document type, field, and source quality, you have no idea whether 0.92 extractions are actually 92% correct — they may be 80% accurate on scanned invoices but 99% accurate on clean PDFs. 'Always exactly accurate' inverts the lesson entirely. 'Never reliable' overstates it — confidence is useful once calibrated. Setting a higher threshold doesn't fix the calibration gap; you must segment accuracy first.",
    },
    {
      id: 'lab-contract-schema',
      type: 'lab',
      title: 'Design an extraction schema with confidence and provenance fields for a long contract',
      brief: `Design a **JSON Schema** (or tool \`input_schema\`) for extracting key terms from a long commercial contract that may contain amendments. Your schema must:

1. Include at least three contract fields of your choice (e.g., \`payment_terms_days\`, \`termination_notice_days\`, \`governing_law\`).
2. For each field, include a **provenance sub-object** with \`source_location\`, \`source_quote\`, and \`effective_date\`.
3. For each field, include a **confidence sub-object** with \`value\`, \`confidence\` (float 0-1), \`requires_review\` (boolean), and \`review_reasons\` (array of strings).
4. Handle the case where a field may be absent from the source document (nullable or optional).
5. Handle the case where a field may be overridden by an amendment (original value vs. amended value).

Paste your schema (JSON) below. The reviewer will evaluate: provenance coverage, nullable/optional design, confidence routing, amendment handling, and whether the schema could pressure the model to fabricate.`,
      placeholder: '{\n  "type": "object",\n  "properties": {\n    "payment_terms_days": {\n      ...\n    }\n  }\n}',
      system: 'You are a strict reviewer for the Claude Certified Architect exam, specializing in extraction schema design. Be concise (under 300 words). Give: (1) a score out of 10, (2) what is well-designed, (3) concrete required fixes. Evaluate on: provenance fields per extractable value, nullable/optional fields for absent source data, confidence + review_reasons routing, amendment handling (original vs. amended value with effective date), and whether any required fields could pressure fabrication. If the submission is not valid JSON or is not a schema, say so and provide a minimal correct example.',
      evalTemplate: 'A learner submitted this extraction schema for a long commercial contract with amendments:\n\n{{input}}\n\nReview it per your rubric. Focus on: provenance sub-objects, nullable/optional design, confidence routing fields, amendment handling, and fabrication pressure from required fields.',
    },
  ],

  quiz: [
    {
      id: 'q1',
      question: 'A team ships an extraction pipeline using strict JSON structured outputs. Every response passes schema validation, yet an audit finds that 12% of extracted contract figures appear nowhere in the source documents. What does this tell you?',
      options: [
        'The JSON Schema is malformed and must be rebuilt to stop the fabrication.',
        'Schema compliance guarantees output shape, not source truth, so the model is inventing values for fields the source did not support.',
        'Structured outputs are unreliable and should be replaced with prompt-only JSON.',
        'The decoder is broken because a constrained decoder should make hallucination impossible.',
      ],
      answer: 1,
      explanation: 'Correct: a constrained decoder guarantees the output matches the required shape (types, enums, required fields); it cannot verify the source ever stated the value, so fabrication can still pass validation. "Malformed schema" is wrong because the schema is well-formed — that is exactly why the bad data validates. "Replace with prompt-only JSON" is wrong: prompt-only is strictly weaker for production and would make this worse. "Decoder is broken" is wrong: the decoder is working as designed; shape is not truth.',
    },
    {
      id: 'q2',
      question: 'Meeting-note documents rarely mention how many people attended, but the extraction schema makes `attendee_count` a required integer. About 30% of extractions contain plausible but invented counts. What is the most effective fix?',
      options: [
        'Add a second LLM call to verify each extracted count against the source.',
        'Set temperature to 0 to make the output deterministic.',
        'Make `attendee_count` nullable or optional so the model can return null when no count is stated.',
        'Add more few-shot examples that show documents with exact attendance numbers.',
      ],
      answer: 2,
      explanation: 'Correct: a required field with no source data structurally pressures the model to invent a value; making it nullable removes that pressure and lets the first call signal absence honestly. The "verification second call" adds cost and latency, can rationalize the wrong answer, and does not fix the root cause. "Temperature 0" only removes variability, not the fabrication pressure. "More examples with real counts" do not help when the source genuinely contains none.',
    },
    {
      id: 'q3',
      question: 'An IT-asset extractor must classify equipment, but new device categories appear every few weeks. A strict closed enum keeps producing validation failures on novel categories. Which design best fits an evolving domain?',
      options: [
        'Force the model to pick the closest existing enum value.',
        'Reject and route to human review any document whose category is not in the enum.',
        'Add an `other` enum value paired with an `equipment_type_detail` string capturing the raw source wording.',
        'Add each new category directly to the enum before every extraction run.',
      ],
      answer: 2,
      explanation: 'Correct: an `other` value plus a detail field preserves the original wording, yields a valid extraction now, and lets you normalize to a new enum value later without an emergency schema change. "Force the closest value" silently misclassifies the asset. "Reject every novel category" turns normal growth into a flood of failures. "Edit the enum before each run" is operationally fragile and defeats the point of an escape hatch.',
    },
    {
      id: 'q4',
      question: 'A reviewer is debating whether to set `"pros": []` or `"pros": null` for a one-sentence review that never discusses upsides at all. Which reasoning is correct?',
      options: [
        'Use `null` because the reviewer explicitly listed no pros.',
        'Either is fine since an empty array and null are semantically equivalent.',
        'Use `[]` here because `[]` means the document did not address pros.',
        'Prefer `null` because `[]` asserts the reviewer mentioned no pros, while `null` means the document never addressed pros — closer to the truth for this review.',
      ],
      answer: 3,
      explanation: 'Correct: an empty array is an active claim ("the reviewer mentioned no pros"), while null means the dimension was never addressed; for a review that simply never raises pros, null is the more honest representation. The option using null but reasoning "explicitly listed no pros" describes the empty-array case, not null. "Either is fine / equivalent" silently misrepresents source content. "Use `[]` because it means not addressed" inverts the two meanings entirely.',
    },
    {
      id: 'q5',
      question: 'A recipe extraction schema requires `quantity_grams` as a float, but many recipes say things like "a handful of flour." The model keeps inventing gram values. Besides allowing null, what change most directly preserves source fidelity?',
      options: [
        'Add a `quantity_informal` string field and instruct the model to preserve informal measurements verbatim.',
        'Instruct the model to convert informal measurements to grams using common cooking conversions.',
        'Lower the temperature so the invented gram values are more consistent.',
        'Add a post-extraction verification call to confirm each gram value.',
      ],
      answer: 0,
      explanation: 'Correct: giving the model an honest place to put "a handful" verbatim, via a `quantity_informal` string, stops it from inventing a precise number it cannot derive. "Convert to grams using common conversions" is exactly the inference-from-common-sense the lessons warn against and produces baseless numbers. "Lower temperature" only makes the fabrication more consistent. A "verification call" treats the symptom and cannot conjure a gram value the source never stated.',
    },
    {
      id: 'q6',
      question: 'A team wants the extractor to reliably distinguish subtle format conventions such as "cotton blend" versus "Cotton/Polyester mix" and consistent date formatting. They keep adding longer written rules with little improvement. What is the recommended approach?',
      options: [
        'Move all the rules into a single IMPORTANT-prefixed paragraph at the top of the prompt.',
        'Provide 2-3 concrete input/output example pairs that demonstrate the exact format distinctions.',
        'Run a verification call that reformats the output afterward.',
        'Increase the schema strictness so only the correct format validates.',
      ],
      answer: 1,
      explanation: 'Correct: for subtle format distinctions, a few concrete input/output pairs teach the pattern more reliably than paragraphs of narrative rules. "Reformat the rules into one emphatic paragraph" is still prose and does not demonstrate the distinction. A "verification reformatting call" adds cost and can itself err. "Tighten schema strictness" can reject bad shapes but cannot teach when "cotton blend" should map one way versus another.',
    },
    {
      id: 'q7',
      question: 'A senior engineer proposes adding a second LLM call to verify every extracted value against the source as the primary defense against fabrication. Why is this generally the wrong fix?',
      options: [
        'Verification calls cannot read the same source document twice.',
        'A verification pass is never useful in any extraction pipeline.',
        'It adds cost and latency, can itself hallucinate or rationalize the wrong answer, and does not address the schema that forced a value in the first place.',
        'It would require disabling structured outputs entirely.',
      ],
      answer: 2,
      explanation: 'Correct: the verification call is expensive on every extraction, can rationalize the original error, and leaves the root cause (a schema demanding a value) untouched; allowing null is the superior fix. "Cannot read the source twice" is false — it can re-read it. "Never useful" overstates it: a verification pass works as a sampling-based audit on already-good extractions, just not as the primary fix. It also does not require "disabling structured outputs."',
    },
    {
      id: 'q8',
      question: 'A contract extraction must let human reviewers audit which clause a value came from and reconcile amendments that override earlier sections. The team also wants to use the Citations API with strict JSON structured outputs. What should they do?',
      options: [
        'Assume the Citations API attaches cleanly to every JSON field and rely on it for provenance.',
        'Represent provenance explicitly in the schema with fields like `source_location` and `source_quote`, since citations and constrained JSON are often incompatible.',
        'Drop structured outputs and return free-form cited prose instead.',
        'Skip provenance entirely and re-read the full contract whenever an audit is needed.',
      ],
      answer: 1,
      explanation: 'Correct: citations require interleaved citation blocks while JSON schemas require constrained JSON, so the two are often incompatible; encoding `source_location` and `source_quote` directly in the schema gives auditable provenance. "Assume citations attach to every JSON field" is exactly the pitfall to avoid. "Drop structured outputs" sacrifices the validated extraction the pipeline depends on. "Skip provenance" forces reviewers to re-read the whole document, which the provenance design exists to prevent.',
    },
    {
      id: 'q9',
      question: 'An invoice schema validates types and shapes correctly, but extractions still pass through with line items that do not sum to the stated grand total. What is the right architecture?',
      options: [
        'Rely on the JSON Schema and strict tool use to catch the total mismatch.',
        'Ask the model to reconcile and silently correct the total before returning it.',
        'Add reconciliation fields (calculated_total, stated_total, totals_match) and run domain validation in application code to flag mismatches.',
        'Raise the model temperature so it explores more arithmetic paths.',
      ],
      answer: 2,
      explanation: 'Correct: schemas catch type, presence, enum, and shape errors but not domain logic like arithmetic consistency, so reconciliation fields plus application-code validation are required to flag mismatches for review. "Rely on JSON Schema and strict tool use" is wrong because they cannot verify that numbers sum correctly. "Silently correct the total" hides discrepancies the model cannot actually verify and may mask OCR errors. "Raise temperature" has nothing to do with arithmetic correctness.',
    },
    {
      id: 'q10',
      question: 'A 200-page contract fits in the context window, but the termination clause in Section 12 is overridden by an amendment in an appendix, and a single extraction call keeps returning the stale value. Which approach best resolves cross-section facts?',
      options: [
        'Chunk the document into independent 10-page segments and extract each separately.',
        'Add many more few-shot examples of termination clauses to the prompt.',
        'Use staged extraction: a mapping pass that surfaces relevant sections and amendments with source locations, then an extraction pass over that intermediate.',
        'Increase the max token limit and run the single extraction again.',
      ],
      answer: 2,
      explanation: 'Correct: a mapping pass collects the clause and its amendment (with locations) into a focused intermediate, then extraction runs over that curated summary, preserving the cross-section relationship. "Independent chunking" is the worst choice here because an amendment in one chunk and the clause in another become invisible to each other, yielding contradictory results. "More few-shot examples" teach unusual patterns but do not help find a scattered, overridden fact. "Higher token limit" just re-runs the same noisy single-pass extraction.',
    },
    {
      id: 'q11',
      question: 'A document exceeds the context window and key facts are scattered across it. The team already uses chunking but gets contradictory extractions for facts that span chunks. What is the best refinement?',
      options: [
        'Stop chunking and force the entire document into a single call regardless of limits.',
        'Combine chunking for the mapping pass with a final extraction against the merged intermediate that resolves cross-chunk conflicts.',
        'Keep chunking but discard the source locations to save tokens.',
        'Replace chunking with additional few-shot examples per chunk.',
      ],
      answer: 1,
      explanation: 'Correct: for inputs that exceed context, chunking the mapping pass and then extracting once against the merged intermediate preserves both coverage and cross-chunk relationships, with a merge step that resolves conflicts. "Force the whole document into one call" is impossible when it exceeds the window. "Discard source locations" destroys provenance and makes audits impossible. "Add examples per chunk" does not address facts that span chunks, which is the actual failure mode.',
    },
    {
      id: 'q12',
      question: 'A pipeline reports raw `confidence: 0.92` on extracted amounts and the team wants to treat that as 92% accuracy to decide automation. What is the correct stance?',
      options: [
        'Raw 0.92 means 92% accurate, so it is safe to automate that band.',
        'Treat raw confidence as an uncalibrated estimate until validated against a labeled set broken down by document type, field, source quality, and confidence band.',
        'Raw confidence is meaningless and should be removed from the schema.',
        'Average confidence across all fields to get the true pipeline accuracy.',
      ],
      answer: 1,
      explanation: 'Correct: self-reported confidence is uncalibrated until measured against labeled data segmented by document type, field, source quality, and band; high-confidence extractions on one document type can be far less accurate on another. "0.92 means 92% accurate" is precisely the miscalibration to avoid. "Meaningless / remove it" is wrong: confidence is a useful routing signal once calibrated. "Average confidence across fields" produces a number that does not correspond to measured accuracy.',
    },
    {
      id: 'q13',
      question: 'A pipeline is 97% accurate in aggregate and leadership wants to remove human review for high-confidence outputs. What must happen before automating?',
      options: [
        'Compare this month\'s aggregate accuracy to last month\'s and automate if it improved.',
        'Lower the confidence threshold so more outputs qualify for automation.',
        'Segment accuracy by document type, field, and source quality, set thresholds per segment, and only then consider raising overall thresholds.',
        'Automate everything now and rely on downstream teams to report any errors.',
      ],
      answer: 2,
      explanation: 'Correct: a 97% aggregate can hide an 80%-accurate segment, so you must break accuracy down by document type, field, and source quality and set per-segment thresholds before automating. "Compare month-over-month aggregates" still hides bad segments. "Lower the threshold" before segment analysis is premature and exposes high-error segments to no-review automation. "Automate now and rely on downstream complaints" misses systematic errors that look plausible until they cause visible failures.',
    },
    {
      id: 'q14',
      question: 'A code-review extraction reports "35% of findings are dismissed" but the team cannot tell which patterns to suppress. They have already calibrated confidence. What change unlocks targeted prompt improvement?',
      options: [
        'Add structured diagnostic fields such as `detected_pattern`, `rule_id`, and `evidence` so dismiss rates can be aggregated by pattern.',
        'Immediately fine-tune the model on the dismissed findings.',
        'Add a free-text `reviewer_comment` field and read the comments manually.',
        'Raise the confidence threshold until the dismissal rate drops.',
      ],
      answer: 0,
      explanation: 'Correct: pattern-level fields let you observe something like "82% of SQLI-01 findings on ORM-wrapped queries are dismissed" and revise prompt criteria for that specific pattern; the feedback loop needs structured data at the finding level. "Immediately fine-tune" is a heavier intervention to reach for only after focused prompt and schema fixes fail. A "free-text comment field" is not aggregable across thousands of findings. "Raise the threshold" hides findings rather than diagnosing which constructs over-report.',
    },
    {
      id: 'q15',
      question: 'A queue contains mostly standard documents plus a few SLA-sensitive urgent ones. An engineer plans to submit everything to the Message Batches API and then expedite the urgent items inside the batch. Why is this wrong, and what should they do?',
      options: [
        'It is fine because Batch API results return in submission order, so urgent items can be read first.',
        'Batch processing latency is the main reason urgent items cannot use it, so route standard documents to the Batch API and urgent ones to the real-time Messages API.',
        'Send everything to the real-time Messages API so all documents meet the SLA.',
        'Split the work into ten sequential batches so urgent items land in the earliest batch.',
      ],
      answer: 1,
      explanation: 'Correct: Batch API latency is exactly why urgent items cannot tolerate it, so you route per document: standard work to the Batch API for cost savings, urgent work to the real-time Messages API. "Results return in submission order" is false — they may not, so reading the first result does not guarantee the urgent one. "Send everything real-time" throws away the bulk discount the standard volume should capture. "Ten sequential batches" still impose batch latency and do not meet a tight SLA.',
    },
  ],
}
