# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this project is

A **real-estate lead-qualification + booking automation demo**. A prospect fills
out a landing-page form → the lead is scored by an LLM → qualified leads are
routed to a booking flow, all leads are logged, and the prospect receives a
tailored follow-up email.

The **automation spine is n8n**, built by hand in the n8n UI (not in this repo).
This repo holds only the **code-shaped parts** that n8n and the human operator
consume:

| Path                      | Purpose                                                             | Status   |
| ------------------------- | ------------------------------------------------------------------ | -------- |
| `qualification-prompt.md` | The lead-scoring prompt sent to the Claude API                     | done     |
| `landing/index.html`      | Polished real-estate lead-capture form (posts to the n8n webhook)  | later    |
| `scripts/seed-leads.mjs`  | Fake-lead seeder for testing the pipeline end-to-end               | later    |
| `README.md`               | Running checklist of the manual n8n steps the operator performs    | done     |

> Claude's job is the code-shaped parts **only**. The n8n workflow itself is
> built manually in the n8n UI by the operator. Do not try to generate n8n
> workflow JSON unless explicitly asked.

## Architecture

```
                          landing/index.html
                          (lead form, browser)
                                   │  HTTP POST (JSON)
                                   ▼
                       ┌───────────────────────┐
                       │   n8n  (the spine)     │
                       │                        │
   Webhook  ───────────►  1. Webhook trigger    │
                       │  2. Claude API call ───┼──► Claude  (claude-haiku-4-5-20251001)
                       │     (qualification     │    returns ONLY JSON
                       │      prompt)           │    {score, score_number, summary,
                       │  3. Parse JSON         │     reasons[], suggested_action,
                       │  4. Write to Airtable ─┼──► Airtable (Leads table)
                       │  5. Switch on score    │
                       │       hot ─┐           │
                       │      warm ─┤           │
                       │      cold ─┘           │
                       │  6. Send email  ───────┼──► Gmail SMTP
                       │     (followup_message, │    (hot leads include the
                       │      + Cal.com link)   │     Cal.com booking link)
                       └───────────────────────┘
                                   │
                                   ▼
                            Cal.com booking
                       (15-min discovery call)
```

### Data flow, step by step

1. **Capture** — `landing/index.html` collects name, email, phone, intent
   (buy/sell), budget, timeline, and notes, then `POST`s JSON to the n8n
   production webhook URL.
2. **Qualify** — n8n sends the lead payload to the Claude API using the system
   prompt in `qualification-prompt.md`. Claude returns **only** a JSON object
   (see schema below). Model: **`claude-haiku-4-5-20251001`** (fast + cheap,
   right tier for short structured classification).
3. **Persist** — n8n writes the raw lead plus the parsed score fields into the
   Airtable **Leads** table.
4. **Route** — an n8n Switch node branches on `score`:
   - **hot** → send booking email containing the Cal.com link; flag for
     immediate operator follow-up.
   - **warm** → send a nurture email; tag for a follow-up sequence.
   - **cold** → log only / low-touch email; no booking push.
5. **Notify** — n8n sends the email via Gmail SMTP, using `followup_message`
   from the LLM response as the body and `suggested_action` to decide tone.

## Stack

| Component       | Choice                                   | Role                                          |
| --------------- | ---------------------------------------- | --------------------------------------------- |
| Orchestration   | **n8n** (self-hosted or cloud, UI-built) | The automation spine; owns the whole flow.    |
| LLM scoring     | **Claude API** `claude-haiku-4-5-20251001` | Lead qualification → structured JSON.        |
| Data store      | **Airtable**                             | Leads table (lead fields + score fields).     |
| Booking         | **Cal.com**                              | 15-min discovery call scheduling.             |
| Email           | **Gmail SMTP** (app password)            | Outbound follow-up / booking emails.          |
| Lead capture    | **Static HTML** (`landing/index.html`)   | Browser form posting to the n8n webhook.      |

## Lead-score JSON contract

The qualification prompt must return **only** this JSON object — no prose, no
markdown fences:

```json
{
  "score": "hot | warm | cold",
  "score_number": 0,
  "summary": "one-line summary of the lead",
  "reasons": ["why this score", "..."],
  "suggested_action": "what the operator/automation should do next",
  "followup_message": "ready-to-send email body for this lead"
}
```

Scoring rubric (the source of truth lives in `qualification-prompt.md`):

- **hot** — wants to buy/sell within **3 months**, has a budget, and is
  reachable.
- **warm** — **3–6 months** horizon, or exploring / not fully committed.
- **cold** — just browsing, no budget, or **6+ months** out.

`score_number` is a 0–100 confidence/priority number that should track the
band (roughly cold 0–39, warm 40–74, hot 75–100).

> If you change this contract, update **all three** of: `qualification-prompt.md`,
> the n8n "Parse JSON" / Airtable mapping (README checklist), and the table
> above.

## Conventions & guardrails

- **Secrets never get committed.** `.env.txt` currently holds a live Airtable
  PAT and a Gmail app password. Keep them out of git (see `.gitignore`). Tracked
  files reference credentials as named placeholders only, never literal values.
- Credentials live in **n8n's credential store**, not in this repo. The repo's
  `.env.txt` is only a convenience scratchpad for the operator.
- The landing page posts to the **n8n production webhook URL**, which is
  environment-specific — keep it configurable, not hard-coded in committed code.
- Node scripts use **ESM** (`.mjs`). Target a modern Node (18+), no transpile.
- Keep the prompt model-agnostic in wording but pinned to
  `claude-haiku-4-5-20251001` in the n8n node config.
