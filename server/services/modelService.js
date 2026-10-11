const axios = require("axios");

const API_KEY = process.env.GEMINI_API_KEY;

module.exports = async function callModel(prompt) {
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${API_KEY}`,
            {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    response_mime_type: "application/json"
                }
            }
        );

        const text = response.data.candidates[0].content.parts[0].text;
        console.log("RAW MODEL RESPONSE:", text);
        return text;

    } catch (error) {
        console.error("Model API error:", error.response?.data || error.message);
        throw new Error("Model call failed");
    }
};