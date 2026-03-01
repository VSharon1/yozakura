/**
 * ai-quotes.js — AI-powered (and fallback) motivational quote fetcher
 *
 * Supported providers: openai (gpt-4o-mini), anthropic (claude-haiku-4-5),
 * gemini (gemini-2.0-flash). Falls back to hardcoded anime-style quotes
 * when no provider is configured or when a request fails.
 */

// ─── Fallback quotes ─────────────────────────────────────────────────────────
// Ten hardcoded anime-style motivational quotes used when no API key is set
// or when a live fetch fails.

const FALLBACK_QUOTES = [
  "The lotus flower blooms most beautifully from the deepest mud. Your focus is the lotus.",
  "A sword that is never drawn grows dull. Sharpen your mind — return to your task.",
  "Distractions are merely illusions cast by a weaker self. Dispel them.",
  "Every moment you choose focus over noise, you become a little harder to defeat.",
  "The master is not one who never stumbles — they are the one who stands again, swiftly.",
  "Your future self is watching. Do not give them reason for regret.",
  "The path of discipline is lonely, but the view from the summit belongs only to those who walked it.",
  "One step forward on your true path is worth a thousand idle scrolls.",
  "Even the sakura falls — but it falls having bloomed fully. Bloom in your work.",
  "Strength is not the absence of distraction. It is choosing your purpose over your impulse."
];

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Builds the prompt string sent to AI providers.
 * @param {string} character  e.g. "Rock Lee from Naruto" (may be empty)
 * @param {string} tone       "motivational"|"philosophical"|"stern"|"funny"
 * @returns {string}
 */
function buildPrompt(character, tone) {
  const characterPart = character
    ? `in the style of ${character}`
    : "in the style of a wise anime sensei";
  const tonePart = {
    motivational: "energising and motivational",
    philosophical: "thoughtful and philosophical",
    stern: "strict and no-nonsense",
    funny: "light-hearted and slightly humorous but still meaningful"
  }[tone] ?? "motivational";

  return (
    `Generate a single short quote ${characterPart} about focus, ` +
    `discipline, and resisting distraction. ` +
    `The tone should be ${tonePart}. ` +
    `Maximum 2 sentences. Return only the quote — no attribution, no quotation marks, no explanation.`
  );
}

// ─── Provider implementations ─────────────────────────────────────────────────

/** Fetch a quote via OpenAI Chat Completions (gpt-4o-mini). */
async function fetchFromOpenAI(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: "You are a master of focus and productivity. Speak with wisdom and purpose."
        },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

/** Fetch a quote via Anthropic Messages API (claude-haiku-4-5). */
async function fetchFromAnthropic(apiKey, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: "You are a master of focus and productivity. Speak with wisdom and purpose.",
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

/** Fetch a quote via Google Gemini (gemini-2.0-flash). */
async function fetchFromGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "You are a master of focus and productivity. Speak with wisdom and purpose.\n\n" +
                prompt
            }
          ]
        }
      ],
      generationConfig: { maxOutputTokens: 120 }
    })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches a motivational quote using the configured AI provider.
 * Falls back to a random hardcoded quote on any error or if provider is "none".
 *
 * @param {object} settings  The aiQuotes sub-object from Yozakura settings
 * @param {string} settings.provider   "none"|"openai"|"anthropic"|"gemini"
 * @param {string} settings.apiKey     Provider API key
 * @param {string} settings.character  Anime character preference (may be empty)
 * @param {string} settings.tone       "motivational"|"philosophical"|"stern"|"funny"
 * @returns {Promise<string>}          The quote string
 */
export async function fetchQuote(settings = {}) {
  const { provider = "none", apiKey = "", character = "", tone = "motivational" } = settings;

  // If no provider selected or no key provided, return a fallback immediately
  if (provider === "none" || !apiKey) {
    return randomFallback();
  }

  const prompt = buildPrompt(character, tone);

  try {
    switch (provider) {
      case "openai":
        return await fetchFromOpenAI(apiKey, prompt);
      case "anthropic":
        return await fetchFromAnthropic(apiKey, prompt);
      case "gemini":
        return await fetchFromGemini(apiKey, prompt);
      default:
        return randomFallback();
    }
  } catch (err) {
    console.warn("[Yozakura] AI quote fetch failed, using fallback:", err.message);
    return randomFallback();
  }
}

/**
 * Returns a random quote from the hardcoded fallback list.
 * @returns {string}
 */
export function randomFallback() {
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}
