# Module content schema

Each file in `src/data/modules/NN-slug.js` does `export default { ... }` with this shape.

```js
export default {
  id: 'kebab-slug',          // unique, stable; used as key in progress store
  num: 1,                     // display order / number
  title: 'Human Title',
  summary: 'One–two sentence overview shown on dashboard + module header.',
  estMinutes: 25,             // rough total time
  tags: ['API', 'Output'],    // 1–3 short tags

  lessons: [
    {
      id: 'kebab-slug',       // unique within module
      title: 'Lesson Title',
      minutes: 6,
      // Markdown string. GitHub-flavored markdown supported (tables, code fences, lists).
      // Use ```lang fences for code. Keep it teaching-oriented and expanded from the guide.
      body: `markdown...`,
      // Optional highlighted boxes rendered after the body:
      principles: ['Short principle statement', ...],   // accent callouts
      pitfalls: ['Short pitfall statement', ...],        // red callouts
    },
  ],

  exercises: [
    // type: 'mcq' — scenario multiple choice
    {
      id, type: 'mcq',
      scenario: 'optional context paragraph',
      question: 'The question?',
      options: ['A', 'B', 'C', 'D'],
      answer: 2,                 // index into options
      explanation: 'Why the answer is right and others wrong.',
    },
    // type: 'match' — match terms to definitions
    {
      id, type: 'match',
      instructions: 'Match each setting to its meaning.',
      pairs: [ { term: 'auto', def: 'Claude may call a tool or answer.' }, ... ],
    },
    // type: 'order' — put steps in correct order (stored already-correct; UI shuffles)
    {
      id, type: 'order',
      instructions: 'Order the extraction pipeline steps.',
      items: ['First step', 'Second step', ...],   // CORRECT order
    },
    // type: 'lab' — hands-on prompt against the user's configured LLM
    {
      id, type: 'lab',
      title: 'Design a tool schema',
      brief: 'Markdown task description shown to the learner.',
      // What we send: system + a user message built from `buildUser(userInput)`.
      // The learner types into a textarea (their attempt); we send it and an
      // evaluator instruction so the model critiques against the rubric.
      placeholder: 'Write your tool definition JSON here...',
      system: 'You are a strict reviewer for the Claude Architect exam...',
      // Function as string is not serializable; instead provide a template with {{input}}.
      evalTemplate: 'Here is the learner attempt:\n{{input}}\n\nEvaluate against: ...',
    },
  ],

  quiz: [
    { id, question, options: ['...'], answer: 0, explanation: '...' },
  ],
}
```

Authoring rules:
- Content is original teaching material adapted from the source guide (CC BY 4.0). Do not copy exam questions.
- Lessons should EXPAND on the guide with clear explanations, concrete examples, and code where helpful — not just paraphrase headings.
- Every module: 3–6 lessons, 3–5 exercises using ONLY `mcq` and `lab` types (include at least one `lab`; no `match`/`order`), and exactly 15 exam-style quiz questions.
- Quiz questions emulate the real Claude Certified Architect exam: short scenario stems, single best answer, exactly 4 plausible options (distractors drawn from the lesson `pitfalls`), with the correct index varied across positions.
- Each quiz `explanation` MUST state why the correct option is right AND why each of the other three options is wrong (reference distractors by content). It renders as plain text in the quiz review.
- Keep `id`s unique and kebab-case.
