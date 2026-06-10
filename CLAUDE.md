# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this project is

A **real-estate lead-qualification + booking automation**, built and live. A
prospect submits an n8n form → the lead is scored by Claude → leads are written
to Airtable → an n8n Switch routes them → the prospect gets a tailored follow-up
email (hot leads include a Cal.com booking link) → the operator watches it all
land in a deployed **lead-intelligence dashboard**.

**Live dashboard:** https://lead-machine-demo.netlify.app/

The **automation spine is n8n**, built in the n8n UI. This repo holds the
**code-shaped parts** that n8n and the operator consume, plus an exported copy of
the workflow:

| Path                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `dashboard/index.html`        | Single-file lead-intelligence dashboard (vanilla JS + Chart.js)|
| `dashboard/leads.json`        | Lead data the dashboard renders (Airtable export)              |
| `dashboard/Leads-Grid view.csv` | Raw Airtable CSV export the JSON is generated from           |
| `n8n/Leads Automation.json`   | Exported n8n workflow (12 nodes; API key redacted)             |
| `n8n/parse-score.code-node.js`| The Code node that parses Claude's JSON inside n8n             |
| `n8n/parse-score.test.mjs`    | Node test suite for the parse-score logic                      |
| `qualification-prompt.md`     | The lead-scoring system prompt sent to Claude                  |
| `resources/`                  | README preview images (dashboard, n8n, Airtable)               |
| `README.md`                   | End-to-end project guide + n8n setup checklist                 |

> The n8n workflow is authored in the n8n UI. `n8n/Leads Automation.json` is the
> exported snapshot — keep it in sync when the workflow changes, and never let
> real credentials back into it (the Anthropic key is stored as the placeholder
> `YOUR_ANTHROPIC_API_KEY`; the real key lives in n8n's credential store).

## Architecture

```
                    n8n Form Trigger  ("On form submission")
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │   n8n  (the spine)     │
                       │                        │
   Form  ──────────────►  1. On form submission │
                       │  2. Edit Fields        │
                       │  3. HTTP Request ──────┼──► Claude  (claude-haiku-4-5-20251001)
                       │     (qualification     │    returns ONLY JSON
                       │      prompt)           │    {score, score_number, summary,
                       │  4. Code: parse score ─┤     reasons[], suggested_action,
                       │  5. Create record ─────┼──► Airtable (Leads table)
                       │  6. Switch on score    │
                       │       hot ─┐           │
                       │      warm ─┤           │
                       │      cold ─┘           │
                       │  7. Send email ────────┼──► Gmail SMTP
                       │     (followup_message, │    (hot leads include the
                       │      + Cal.com link)   │     Cal.com booking link)
                       └───────────────────────┘
                                   │
                ┌──────────────────┴───────────────────┐
                ▼                                       ▼
         Cal.com booking                 Airtable export ──► dashboard/leads.json
     (15-min discovery call)                              │
                                                          ▼
                                          Lead-intelligence dashboard (Netlify)
```

### Data flow, step by step

1. **Capture** — the n8n **Form Trigger** ("On form submission") collects name,
   email, phone, intent (buy/sell), budget, preferred area, and timeline. (The
   trigger also exposes a webhook URL, so an external landing page could post the
   same JSON.)
2. **Normalize** — an **Edit Fields** node shapes the incoming payload into the
   lead fields.
3. **Qualify** — an **HTTP Request** node calls the Claude API with the system
   prompt in `qualification-prompt.md`. Claude returns **only** a JSON object
   (see schema below). Model: **`claude-haiku-4-5-20251001`** (fast + cheap, the
   right tier for short structured classification).
4. **Parse** — a **Code** node (`n8n/parse-score.code-node.js`) strips any
   ```` ```json ```` fences, parses the object, validates `score`, and on bad
   output defaults `score` to `warm` and flags the lead for manual review instead
   of dropping it.
5. **Persist** — a **Create record** (Airtable) node writes the lead plus the
   parsed score fields into the **Leads** table.
6. **Route** — a **Switch** node branches on `score`:
   - **hot** → send booking email containing the Cal.com link; flag for
     immediate operator follow-up.
   - **warm** → send a nurture email; tag for a follow-up sequence.
   - **cold** → log only / low-touch email; no booking push.
7. **Notify** — **Send Email** (Gmail SMTP) nodes send the message, using
   `followup_message` from the LLM response as the body. A **Wait** node paces
   the warm sequence.
8. **Visualize** — the Airtable Leads table is exported to
   `dashboard/leads.json` and rendered by the deployed dashboard.

## Stack

| Component     | Choice                                       | Role                                       |
| ------------- | -------------------------------------------- | ------------------------------------------ |
| Orchestration | **n8n** (UI-built; exported to repo)         | The automation spine; owns the whole flow. |
| LLM scoring   | **Claude API** `claude-haiku-4-5-20251001`   | Lead qualification → structured JSON.      |
| Data store    | **Airtable**                                 | Leads table (lead fields + score fields).  |
| Booking       | **Cal.com**                                  | 15-min discovery call scheduling.          |
| Email         | **Gmail SMTP** (app password)                | Outbound follow-up / booking emails.       |
| Lead capture  | **n8n Form Trigger** (webhook-backed)        | Collects the lead and starts the flow.     |
| Dashboard     | **Vanilla HTML/CSS/JS + Chart.js (CDN)**     | Lead-intelligence UI, single file.         |
| Hosting       | **Netlify**                                  | Serves the live dashboard.                 |

## Lead-score JSON contract

The qualification prompt returns **only** this JSON object — no prose, no
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

`score_number` is a 0–100 confidence/priority number that tracks the band
(roughly cold 0–39, warm 40–74, hot 75–100).

> If you change this contract, update **all** of: `qualification-prompt.md`, the
> parse-score Code node + its tests (`n8n/parse-score.*`), the Airtable field
> mapping, and the dashboard's column/keys in `dashboard/index.html`.

## The dashboard

`dashboard/index.html` is self-contained: no build step, no framework (Chart.js
via CDN is the only dependency). It `fetch`es `leads.json`, so it must be served
over HTTP (`python -m http.server` in `dashboard/`), not opened via `file://`.

- `leads.json` is an array of lead objects; keys mirror the Airtable columns:
  `Name, Email, Phone, "Buying or Selling", Budget, "Preferred Area", Timeline,
  score, score_number, summary, suggested_action, followup_message`.
- To regenerate it from a fresh Airtable CSV export: map Airtable's
  capitalized / space-padded headers (`Score ` → `score`, `Score Number` →
  `score_number`), skip empty rows and rows whose summary contains `PARSE FAILED`
  or `Could not parse`, and leave `followup_message` blank if the export omits it.
- `budgetMidpoint()` in `index.html` parses `$800k`, `$4.5 Million`, `£450,000`,
  ranges, and free text like `Not sure` (→ 0). The dataset mixes `$`/`£`, so the
  pipeline KPI is an order-of-magnitude estimate, not FX-accurate.

## Tests

`n8n/parse-score.code-node.js` is written so its logic can be exercised outside
n8n: the test wraps the actual node source in a Function with a mocked `$input`,
so it tests the shipped code, not a copy. Run the suite with:

```bash
node --test "n8n/**/*.test.mjs"
```

Tests cover: clean JSON, ```` ```json ```` fenced JSON, prose-wrapped JSON,
non-JSON / empty output (warm fallback with `parse_ok: false`), unknown `score`
coercion, and safe defaults for missing/typed fields. 7 tests, all passing.

## Conventions & guardrails

- **Secrets never get committed.** `.env` (Airtable PAT, Gmail app password,
  Anthropic key, webhook URL) is git-ignored via `.env.*`. Tracked files,
  **including the exported workflow JSON**, reference credentials as named
  placeholders only — never literal values.
- Canonical credentials live in **n8n's credential store**, not in this repo.
  `.env` is only a convenience scratchpad for the operator.
- The form/webhook URL is environment-specific — keep it configurable, not
  hard-coded into committed code.
- The dashboard's data source is configurable: `DATA_URL` at the top of the
  script's commented data-loading section.
- Any Node scripts use **ESM** (`.mjs`), modern Node (18+), no transpile.
- Keep the prompt model-agnostic in wording but pinned to
  `claude-haiku-4-5-20251001` in the n8n node config.
