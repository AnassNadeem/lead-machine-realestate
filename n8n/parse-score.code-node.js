// n8n Code node — "Parse Claude score"
// Mode: "Run Once for All Items"
// Reads the Anthropic API response, strips ```json fences, parses the JSON,
// and returns the lead-score fields. On any error, defaults score to 'warm'
// and flags the item for manual review instead of dropping the lead.

const raw = $input.first().json?.content?.[0]?.text ?? '';

// Remove ```json ... ``` or ``` ... ``` fences if the model added them.
function stripFences(s) {
  return String(s)
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

let parsed;
let parseError = null;

try {
  parsed = JSON.parse(stripFences(raw));
} catch (err) {
  // Fallback: try to grab the first {...} block in case of stray prose.
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch (err2) {
      parseError = err2.message;
    }
  } else {
    parseError = err.message;
  }
}

if (parseError || !parsed || typeof parsed !== 'object') {
  return [
    {
      json: {
        score: 'warm',
        score_number: 50,
        summary: 'Could not parse model output — defaulted to warm for manual review.',
        reasons: ['LLM response was not valid JSON', parseError || 'unknown parse error'],
        suggested_action: 'Manual review: re-run scoring or qualify by hand.',
        followup_message: '',
        parse_ok: false,
        raw_text: raw,
      },
    },
  ];
}

const allowed = ['hot', 'warm', 'cold'];
const score = allowed.includes(parsed.score) ? parsed.score : 'warm';

return [
  {
    json: {
      score,
      score_number: typeof parsed.score_number === 'number' ? parsed.score_number : 50,
      summary: parsed.summary ?? '',
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      suggested_action: parsed.suggested_action ?? '',
      followup_message: parsed.followup_message ?? '',
      parse_ok: true,
    },
  },
];
