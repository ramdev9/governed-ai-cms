const axios = require("axios");

const MODEL = process.env.JAIS_MODEL || "inceptionai/jais-family-13b-chat";
const GEMINI_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.JAIS_FALLBACK_MODEL || "inceptionai/jais-family-6p7b-chat";

// jais-family-13b-chat context is 2048 tokens. The prompt template plus a
// 400–500 word article cannot also request 2048 new tokens.
const MAX_NEW_TOKENS = 1024;

const ARABIC_PREAMBLE = `### Instruction:اسمك "جيس" وسميت على اسم جبل جيس اعلى جبل في الامارات. تم بنائك بواسطة Inception في الإمارات. أنت مساعد مفيد ومحترم وصادق. أجب دائمًا بأكبر قدر ممكن من المساعدة، مع الحفاظ على البقاء أمناً. أكمل المحادثة بين [|Human|] و[|AI|] :
### Input:[|Human|] `;

function endpointFor(model) {
    if (process.env.HF_API_URL) {
        return process.env.HF_API_URL.replaceAll("inceptionai/jais-family-13b-chat", model);
    }

    return `https://router.huggingface.co/hf-inference/models/${model}`;
}

function wrapJaisPrompt(prompt) {
    return `${ARABIC_PREAMBLE}${prompt}\n[|AI|]\n### Response :`;
}

function formatErrorBody(status, body) {
    const trimmed = String(body || "").replace(/\s+/g, " ").trim();

    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
        return `Jais API error: ${status}`;
    }

    return `Jais API error: ${status} - ${trimmed.slice(0, 500)}`;
}

function shouldFallback(error) {
    if (error.status === 401 || error.status === 403) {
        return false;
    }

    return /not supported|does not exist|is not available|No such model|model not found|unknown model/i.test(error.message);
}

async function requestModel(model, wrappedPrompt, maxTokens, temperature, attempt = 0) {
    const response = await fetch(endpointFor(model), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            inputs: wrappedPrompt,
            parameters: {
                max_new_tokens: maxTokens,
                temperature,
                return_full_text: false,
                top_p: 0.9,
                repetition_penalty: 1.2
            }
        }),
        signal: AbortSignal.timeout(180000)
    });

    if (response.status === 503 && attempt < 2) {
        let waitMs = 10000;

        try {
            const body = await response.json();
            if (body.estimated_time) {
                waitMs = Math.min(body.estimated_time * 1000, 60000);
            }
        } catch {
            // Keep the default wait when the loading response is not JSON.
        }

        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return requestModel(model, wrappedPrompt, maxTokens, temperature, attempt + 1);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(formatErrorBody(response.status, errorBody));
        error.status = response.status;
        throw error;
    }

    const data = await response.json();

    if (data.error) {
        const error = new Error(`Jais API error: ${data.error}`);
        error.status = response.status;
        throw error;
    }

    const text = Array.isArray(data)
        ? data[0]?.generated_text
        : data.generated_text || data.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Jais API returned an empty response");
    }

    return text;
}

async function callJais(prompt, options = {}) {
    if (!process.env.HF_TOKEN) {
        throw new Error("HF_TOKEN is not set");
    }

    const maxTokens = Math.min(options.maxTokens ?? MAX_NEW_TOKENS, MAX_NEW_TOKENS);
    const temperature = options.temperature ?? 0.7;
    const wrapped = wrapJaisPrompt(prompt);

    try {
        return await requestModel(MODEL, wrapped, maxTokens, temperature);
    } catch (primaryError) {
        if (!shouldFallback(primaryError) || FALLBACK_MODEL === MODEL) {
            throw primaryError;
        }

        console.warn(`Primary Jais model failed (${primaryError.message}). Falling back to ${FALLBACK_MODEL}.`);

        try {
            return await requestModel(FALLBACK_MODEL, wrapped, maxTokens, temperature);
        } catch (fallbackError) {
            throw new Error(
                `${primaryError.message}. Fallback ${FALLBACK_MODEL} also failed: ${fallbackError.message}`
            );
        }
    }
}

function extractJSON(text) {
    const cleaned = String(text || "").split("### Response :").pop().trim();

    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
    }

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("No valid JSON found in response");
}

function useJais() {
    return process.env.AGENT_PROVIDER === "jais";
}

function agentRuntime() {
    if (useJais()) {
        return {
            model: MODEL,
            provider: "Hugging Face / G42 Inception"
        };
    }

    return {
        model: GEMINI_MODEL,
        provider: "Google Gemini"
    };
}

async function callGemini(prompt, options = {}) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set");
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    response_mime_type: "application/json",
                    temperature: options.temperature ?? 0.7
                }
            }
        );

        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("Gemini returned an empty response");
        }

        return text;
    } catch (error) {
        if (error.message === "Gemini returned an empty response") {
            throw error;
        }

        const message = error.response?.data?.error?.message || error.message;
        throw new Error(`Gemini API error: ${message}`);
    }
}

async function callJaisForJSON(prompt, options) {
    let lastError;

    for (let attempt = 0; attempt < 2; attempt++) {
        const promptForAttempt = attempt === 0
            ? prompt
            : `${prompt}\n\nأعد JSON صالحًا فقط بدون أي نص إضافي.`;

        const response = useJais()
            ? await callJais(promptForAttempt, options)
            : await callGemini(promptForAttempt, options);

        try {
            return extractJSON(response);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
}

function normalizeTags(tags) {
    if (!Array.isArray(tags)) {
        return [];
    }

    return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 5);
}

function normalizeSlug(slug) {
    return String(slug || "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\u0600-\u06FF\-]/g, "");
}

module.exports = {
    callJais,
    extractJSON,
    callJaisForJSON,
    normalizeTags,
    normalizeSlug,
    agentRuntime,
    MODEL
};
