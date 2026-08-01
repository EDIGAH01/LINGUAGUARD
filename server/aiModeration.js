const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
// "…-latest" tracks Google's current Flash model; verified to have available
// free-tier quota where the pinned 2.0/2.5 model ids returned 429/404.
const GEMINI_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 8000;

/**
 * Optional AI moderation layer, gated behind OPENAI_API_KEY and/or
 * GEMINI_API_KEY. When enabled, every scan is additionally classified by AI on
 * top of the keyword rules, catching content the rules don't literally spell
 * out.
 *
 * Two providers, tried in order — OpenAI's purpose-built (and free) Moderations
 * endpoint first, then Gemini via a structured-output classification. Because
 * every provider call is fail-safe (returns null on disabled/errored/timed-out/
 * unfunded), an unfunded OpenAI transparently falls through to Gemini, and if
 * both come back empty the scanner simply uses its keyword verdict. moderate()
 * NEVER throws and NEVER blocks past the 8s timeout — a broken AI provider must
 * never break a scan.
 */

const APP_CATEGORIES = ["hate_speech", "harassment", "explicit", "spam", "misinformation"];

function isEnabled() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

// OpenAI moderation categories → this app's FilterCategory enum.
const OPENAI_CATEGORY_MAP = {
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

async function moderateOpenAI(content) {
  if (!process.env.OPENAI_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_MODERATION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: content.slice(0, 4000) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[ai-moderation] OpenAI HTTP ${res.status} — trying next provider / keyword rules. ${body.slice(0, 120)}`);
      return null;
    }
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    if (!result.flagged) return { flagged: false, category: null, provider: "openai" };
    const scores = result.category_scores || {};
    const [openaiCategory] =
      Object.entries(scores)
        .filter(([cat]) => result.categories?.[cat])
        .sort((a, b) => b[1] - a[1])[0] || [null];
    return {
      flagged: true,
      category: OPENAI_CATEGORY_MAP[openaiCategory] || "custom",
      detail: openaiCategory,
      provider: "openai",
    };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : err.message;
    console.warn(`[ai-moderation] OpenAI call failed (${reason}) — trying next provider / keyword rules.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    flagged: { type: "boolean" },
    category: { type: "string", enum: [...APP_CATEGORIES, "none"] },
  },
  required: ["flagged", "category"],
};

const GEMINI_SYSTEM =
  "You are a strict content-moderation classifier for a service that filters " +
  "social and messaging content. Decide whether the message violates a policy: " +
  "hate_speech, harassment (threats or bullying), explicit (sexual content), " +
  "spam (scams or unsolicited promotion), or misinformation. If the message is " +
  "acceptable, return flagged=false and category=none. Respond only via the schema.";

async function moderateGemini(content) {
  if (!process.env.GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
        contents: [{ parts: [{ text: content.slice(0, 4000) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA, temperature: 0 },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[ai-moderation] Gemini HTTP ${res.status} — falling back to keyword rules only. ${body.slice(0, 140)}`);
      return null;
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    let verdict;
    try {
      verdict = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!verdict.flagged || verdict.category === "none") {
      return { flagged: false, category: null, provider: "gemini" };
    }
    return {
      flagged: true,
      category: APP_CATEGORIES.includes(verdict.category) ? verdict.category : "custom",
      detail: verdict.category,
      provider: "gemini",
    };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : err.message;
    console.warn(`[ai-moderation] Gemini call failed (${reason}) — falling back to keyword rules only.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classifies one piece of content. Resolves to:
 *   { flagged: true,  category, detail, provider }  — flagged
 *   { flagged: false, category: null, provider }     — clean
 *   null                                             — no provider produced a
 *                                                      signal (all disabled /
 *                                                      errored / unfunded)
 * A definitive result (flagged true OR false) from a provider is returned as-is;
 * only a null (no signal) falls through to the next provider.
 */
async function moderate(content) {
  if (!isEnabled()) return null;
  if (!content || !content.trim()) return { flagged: false, category: null };

  if (process.env.OPENAI_API_KEY) {
    const r = await moderateOpenAI(content);
    if (r) return r;
  }
  if (process.env.GEMINI_API_KEY) {
    const r = await moderateGemini(content);
    if (r) return r;
  }
  return null;
}

module.exports = { isEnabled, moderate, moderateOpenAI, moderateGemini };
