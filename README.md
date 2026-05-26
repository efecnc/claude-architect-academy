# Claude Architect Academy

An interactive web course for the **Claude Certified Architect – Foundations** certification. It turns a written study guide into 12 visual, self-paced modules — lessons with diagrams, hands-on practice, and exam-style quizzes — all running in the browser with progress tracking.

🔗 **Live demo:** https://claude-architect-academy.vercel.app

---

## Built from the study guide

The entire course is **adapted from the excellent [Claude Architect Exam Guide](https://github.com/daronyondem/claude-architect-exam-guide) by [Daron Yöndem](https://github.com/daronyondem)**, used under the **[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)** license. That guide is the source of truth for every concept here; this project restructures, rewrites, and visualizes it as an interactive app, and adds original diagrams, exercises, and quiz questions. If you prefer to read rather than click, **start with the original guide** — it's outstanding.

## Who is this for?

Developers and solution architects preparing for the certification who learn better by *doing* than by reading straight through. If you're new to building with LLMs, the modules build a foundation step by step; if you're experienced, the quizzes and "weak vs strong" examples make a fast, active review of the nuances the exam emphasizes.

## What it covers

Twelve modules, each a self-contained knowledge area:

1. **API fundamentals & output control** — stateless requests, `tool_choice`, structured outputs, prefill
2. **Designing tool interfaces** — parameter design, structured results, composition, confirmation flows
3. **Error handling in agent tools** — transient vs permanent, structured errors, uncertain state, MCP tiers
4. **Structured data extraction & validation** — schemas, nullability, semantic checks, provenance, review
5. **Conversation context management** — summarization, state objects, retrieval, stale data
6. **System prompt engineering** — structure, principles vs conditionals, dilution, few-shot
7. **Model Context Protocol (MCP)** — tools, resources, prompts, the trust model, config scopes
8. **Agentic patterns & multi-agent workflows** — chaining, routing, orchestrator-workers, provenance
9. **Customer-service workflow design** — escalation, compliance enforcement, graceful degradation
10. **Claude Code & Agent SDK workflows** — built-in tools, plan mode, sessions, memory, hooks
11. **Evaluation & feedback loops** — eval sets, success criteria, regression testing, iteration
12. **Batch processing, cost & latency** — Message Batches, prompt caching, model selection, trade-offs

## How you learn it

Each lesson is built to make concepts *stick*, not just be read:

- **Visual first** — every key idea has a rendered diagram (sequence diagrams, decision flows, architectures), plus syntax-highlighted code.
- **Weak vs strong examples** — concrete ❌ "don't" / ✅ "do" comparisons drawn from real design decisions.
- **Check-yourself prompts & key takeaways** in every lesson.
- **Exam-style quizzes** — 15 scenario multiple-choice questions per module (180 total), each with a full explanation of why every option is right or wrong; options shuffle each attempt, and 70%+ marks a module complete.
- **Hands-on practice** — scenario exercises plus a challenge where you draft an answer, then reveal a review checklist to self-assess.
- **Progress tracking** in the browser, an accordion sidebar (modules → lessons), and **dark / light themes**. No sign-in, no backend.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
```

Built with React + Vite (plus react-markdown, rehype-highlight, and Mermaid). It's a static single-page app — no server, no API keys.

## Deploy

Any static host works. On **Vercel**, importing the repo needs zero configuration — `vercel.json` sets the Vite framework, the `dist` output, and SPA rewrites so deep links resolve on refresh.

## Editing the content

All course material lives in `src/data/modules/NN-*.js` (one file per module). The shape of a module — lessons, exercises, quiz — is documented in `src/data/SCHEMA.md`. `scripts/check-mermaid.mjs` validates every diagram.

## Disclaimer

This is an independent, community-built study aid. It is **not affiliated with, endorsed by, or sponsored by Anthropic**. It contains no actual exam questions — it teaches the underlying knowledge domains only. Course content was adapted with assistance from Claude.

## License & attribution

This project adapts content from:

- **Title:** [Claude Architect Exam Guide](https://github.com/daronyondem/claude-architect-exam-guide)
- **Author:** [Daron Yöndem](https://github.com/daronyondem) © 2026
- **License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **Changes:** the guide's written material was restructured, rewritten, and reimagined as an interactive web app, with original diagrams, practice exercises, and quiz questions added.

In keeping with CC BY 4.0, this adaptation is shared under the **same license** — see [`LICENSE`](./LICENSE). If you fork or reuse it, you must keep this attribution and indicate any changes you make.
