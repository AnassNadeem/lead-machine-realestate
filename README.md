# lead-machine-realestate

A real-estate **lead-qualification + booking automation** demo. A prospect fills
out a form → an LLM scores the lead → hot leads get a booking link, all leads
get logged and emailed a tailored follow-up.

The automation spine is **n8n**, built by hand in the n8n UI. This repo holds the
code-shaped parts that n8n consumes. See [`CLAUDE.md`](./CLAUDE.md) for the full
architecture.

## Stack

- **n8n** — orchestration (UI-built workflow)
- **Claude API** `claude-haiku-4-5-20251001` — lead scoring → JSON
- **Airtable** — leads database
- **Cal.com** — 15-min discovery-call booking
- **Gmail SMTP** — outbound follow-up emails

## Repo contents

| File                       | What it is                                           |
| -------------------------- | ---------------------------------------------------- |
| `CLAUDE.md`                | Architecture + stack reference                       |
| `qualification-prompt.md`  | The lead-scoring prompt for the Claude node          |
| `landing/index.html`       | Lead-capture form _(coming later)_                   |
| `scripts/seed-leads.mjs`   | Fake-lead seeder for testing _(coming later)_        |

---

## ⚠️ Before anything: secrets

`.env.txt` holds a **live Airtable token** and a **Gmail app password**. Keep
them out of git. If you haven't already, add a `.gitignore`:

```
.env
.env.txt
node_modules/
```

Real credentials belong in **n8n's credential store**, not in committed files.

---

## Manual n8n setup checklist

Build this workflow in the n8n UI. Check items off as you go.

### 1. Accounts & credentials

- [ ] **Airtable**: create a base with a **Leads** table (see schema below).
- [ ] **Airtable**: add the Personal Access Token to n8n as an Airtable credential.
- [ ] **Claude / Anthropic**: get an API key; add it to n8n as an HTTP/Anthropic credential.
- [ ] **Cal.com**: confirm the discovery-call booking link is live.
- [ ] **Gmail**: enable 2FA and create an **app password**; add Gmail SMTP credentials to n8n.

### 2. Airtable — Leads table fields

- [ ] `name` (single line text)
- [ ] `email` (email)
- [ ] `phone` (phone)
- [ ] `intent` (single select: buy / sell)
- [ ] `budget` (single line text)
- [ ] `timeline` (single line text)
- [ ] `notes` (long text)
- [ ] `score` (single select: hot / warm / cold)
- [ ] `score_number` (number, 0–100)
- [ ] `summary` (long text)
- [ ] `reasons` (long text)
- [ ] `suggested_action` (long text)
- [ ] `followup_message` (long text)
- [ ] `created_at` (created time)

### 3. n8n workflow nodes

- [ ] **Webhook (trigger)** — `POST`, production URL. This is the URL the landing
      form submits to. Copy it; you'll wire `landing/index.html` to it later.
- [ ] **(Optional) Set/Edit Fields** — normalize the incoming payload into the
      lead fields.
- [ ] **Claude (HTTP Request or Anthropic node)** —
  - model: `claude-haiku-4-5-20251001`
  - system prompt: paste from [`qualification-prompt.md`](./qualification-prompt.md)
  - user message: the lead JSON
  - `max_tokens`: ~600
- [ ] **Parse JSON** — parse the model's response into fields. On parse failure,
      default `score` to `warm` and flag for manual review (don't drop the lead).
- [ ] **Airtable (Create record)** — map lead fields + all score fields into the
      Leads table.
- [ ] **Switch** — branch on `score`:
  - [ ] **hot** → Gmail: send `followup_message` **+ the Cal.com booking link**; mark for immediate follow-up.
  - [ ] **warm** → Gmail: send `followup_message`; tag for nurture sequence.
  - [ ] **cold** → log only (or low-touch email); no booking push.
- [ ] **Gmail (Send)** — use `followup_message` as the body; tone follows
      `suggested_action`.

### 4. Test the pipeline

- [ ] Activate the workflow; confirm the webhook is live.
- [ ] Send a test lead (later: `node scripts/seed-leads.mjs`, or a manual `curl`/Postman POST).
- [ ] Verify: a row lands in Airtable with score fields populated.
- [ ] Verify: a hot test lead receives an email containing the Cal.com link.
- [ ] Verify: warm/cold leads get the right (non-booking) email.

### 5. Go live

- [ ] Wire `landing/index.html` to the production webhook URL.
- [ ] Submit a real form entry end-to-end and confirm the full flow.

---

## Lead-score JSON contract

The Claude node returns **only** this object (full rubric in
[`qualification-prompt.md`](./qualification-prompt.md)):

```json
{
  "score": "hot | warm | cold",
  "score_number": 0,
  "summary": "...",
  "reasons": ["..."],
  "suggested_action": "...",
  "followup_message": "..."
}
```

- **hot** — buy/sell within 3 months + budget + reachable
- **warm** — 3–6 months, or exploring
- **cold** — browsing, no budget, or 6+ months

---

## Coming later

- `landing/index.html` — polished lead-capture form posting to the n8n webhook.
- `scripts/seed-leads.mjs` — generates fake leads to exercise the full pipeline.
