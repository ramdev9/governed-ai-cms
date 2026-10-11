const axios = require("axios");

const API_KEY = process.env.GEMINI_API_KEY;

module.exports = async function critiqueContent(content) {

    const critiquePrompt = `
You are a senior Arabic newsroom editor.

Evaluate the following article based on:

1. Clarity
2. SEO effectiveness
3. Redundancy
4. Readability
5. Informational value

Return ONLY valid JSON:

{
  "score": number between 1 and 10,
  "critique": "short professional feedback in Arabic"
}

Article:
${content.body}
`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${API_KEY}`,
            {
                contents: [
                    {
                        parts: [{ text: critiquePrompt }]
                    }
                ],
                generationConfig: {
                    response_mime_type: "application/json"
                }
            }
        );

        const text = response.data.candidates[0].content.parts[0].text;
        return JSON.parse(text);

    } catch (error) {
        console.error("Critique error:", error.message);
        return { score: 5, critique: "تعذر التقييم الآلي." };
    }
};