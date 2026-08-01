const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
const TIMEOUT_MS = 8000;

/**
 * Optional AI moderation layer, gated entirely behind OPENAI_API_KEY. When a
 * key is present, every scan is additionally run through OpenAI's Moderations
 * API — the free, purpose-built content-classification endpoint — to catch
 * content the user's keyword rules don't literally spell out.
 *
 * Design guarantee: this is an *enhancement* on top of the keyword engine, so
 * it must never be able to break a scan. moderate() NEVER throws and NEVER
 * blocks indefinitely — a missing key, an unfunded account (HTTP 429), a
 * provider outage, or a slow response all resolve to null, and the caller
 * treats null as "no AI signal" and uses the keyword verdict alone.
 */

function isEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Maps OpenAI's moderation categories onto this app's FilterCategory enum
// (hate_speech | harassment | explicit | spam | misinformation | custom).
const CATEGORY_MAP = {
  hate: "hate_speech",
  "hate/threatening": "hate_speech",
  harassment: "harassment",
  "harassment/threatening": "harassment",
  sexual: "explicit",
  "sexual/minors": "explicit",
  violence: "harassment",
  "violence/graphic": "harassment",
  "self-harm": "harassment",
  "self-harm/intent": "harassment",
  "self-harm/instructions": "harassment",
  illicit: "custom",
  "illicit/violent": "custom",
};

/**
 * Classifies one piece of content. Resolves to:
 *   { flagged: true,  category, openaiCategory, score }  — content was flagged
 *   { flagged: false, category: null, score: 0 }          — content was clean
 *   null                                                  — disabled / errored /
 *                                                           timed out / unfunded
 */
async function moderate(content) {
  if (!isEnabled()) return null;
  if (!content || !content.trim()) return { flagged: false, category: null, score: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_MODERATION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      // Cap length so a huge message can't blow the request up; the moderation
      // signal is well-established within the first few thousand characters.
      body: JSON.stringify({ model: "omni-moderation-latest", input: content.slice(0, 4000) }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 429 is the common case on an unfunded/rate-limited account. Log one
      // concise line (not a stack trace) and degrade to keyword-only.
      const body = await res.text().catch(() => "");
      console.warn(
        `[ai-moderation] OpenAI HTTP ${res.status} — falling back to keyword rules only. ${body.slice(0, 140)}`
      );
      return null;
    }

    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    if (!result.flagged) return { flagged: false, category: null, score: 0 };

    // Highest-scoring category among the ones actually flagged.
    const scores = result.category_scores || {};
    const [openaiCategory, score] =
      Object.entries(scores)
        .filter(([cat]) => result.categories?.[cat])
        .sort((a, b) => b[1] - a[1])[0] || [null, 0];

    return {
      flagged: true,
      category: CATEGORY_MAP[openaiCategory] || "custom",
      openaiCategory,
      score,
    };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : err.message;
    console.warn(`[ai-moderation] call failed (${reason}) — falling back to keyword rules only.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isEnabled, moderate, CATEGORY_MAP };
