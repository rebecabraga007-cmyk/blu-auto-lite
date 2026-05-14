const axios = require("axios");

async function callOpenAI(settings, prompt, maxTokens = 700) {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: settings.aiModel || "gpt-4o-mini",
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${settings.aiToken}`,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "";
}

async function callAnthropic(settings, prompt, maxTokens = 700) {
  const preferred = settings.aiModel || "claude-sonnet-4-20250514";
  const fallbackModels = [
    preferred,
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-1-20250805",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307"
  ].filter((model, index, all) => model && all.indexOf(model) === index);
  let lastError = null;

  for (const model of fallbackModels) {
    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }]
        },
        {
          headers: {
            "x-api-key": settings.aiToken,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
          },
          timeout: 60000
        }
      );

      return (response.data?.content || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
    } catch (error) {
      lastError = error;
      if (![400, 404].includes(error.response?.status)) throw error;
    }
  }

  throw lastError;
}

async function callGemini(settings, prompt, maxTokens = 700) {
  const model = settings.aiModel || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.aiToken}`;
  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 }
    },
    { headers: { "Content-Type": "application/json" }, timeout: 60000 }
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function callMistral(settings, prompt, maxTokens = 700) {
  const response = await axios.post(
    "https://api.mistral.ai/v1/chat/completions",
    {
      model: settings.aiModel || "mistral-small-latest",
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${settings.aiToken}`,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "";
}

async function callDeepSeek(settings, prompt, maxTokens = 700) {
  const response = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: settings.aiModel || "deepseek-chat",
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${settings.aiToken}`,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "";
}

async function callAI(settings, prompt, maxTokens = 700) {
  if (!settings.aiToken) {
    throw new Error("Token de IA nao configurado no painel.");
  }

  if (settings.aiProvider === "anthropic") return callAnthropic(settings, prompt, maxTokens);
  if (settings.aiProvider === "gemini") return callGemini(settings, prompt, maxTokens);
  if (settings.aiProvider === "mistral") return callMistral(settings, prompt, maxTokens);
  if (settings.aiProvider === "deepseek") return callDeepSeek(settings, prompt, maxTokens);
  return callOpenAI(settings, prompt, maxTokens);
}

function extractJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

module.exports = { callAI, extractJson };
