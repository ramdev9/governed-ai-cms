const express = require("express");
const router = express.Router();

const { generate } = require("../services/generatorService");
const { critique } = require("../services/criticService");
const { refine } = require("../services/refinerService");
const { agentRuntime } = require("../services/jaisService");
const {
    logAgenticGeneration,
    getAgenticGeneration,
    finalizeAgentic
} = require("../services/logger");

function parseStoredJson(value) {
    if (!value) {
        return null;
    }

    return JSON.parse(value);
}

router.post("/generate-agentic", async (req, res) => {
    const input = typeof req.body.input === "string" ? req.body.input.trim() : "";

    if (!input) {
        return res.status(400).json({ error: "Arabic input required" });
    }

    if (input.length > 2000) {
        return res.status(400).json({ error: "Input exceeds 2000 character limit" });
    }

    const startTime = Date.now();
    const timings = {};

    try {
        console.log("Agent 1: Generating draft...");
        const genStart = Date.now();
        const draftV1 = await generate(input);
        timings.generation = Date.now() - genStart;
        console.log(`Draft generated in ${timings.generation}ms`);

        console.log("Agent 2: Critiquing draft...");
        const critiqueStart = Date.now();
        const critiqueResult = await critique(draftV1);
        timings.critique = Date.now() - critiqueStart;
        console.log(`Critique complete in ${timings.critique}ms (Score: ${critiqueResult.overall_score}/10)`);

        console.log("Agent 3: Refining draft...");
        const refineStart = Date.now();
        const draftV2 = await refine(draftV1, critiqueResult);
        timings.refinement = Date.now() - refineStart;
        console.log(`Refinement complete in ${timings.refinement}ms`);

        timings.total = Date.now() - startTime;

        const id = await logAgenticGeneration({
            input,
            draftV1,
            critique: critiqueResult,
            draftV2,
            genTimeMs: timings.generation,
            critiqueTimeMs: timings.critique,
            refineTimeMs: timings.refinement,
            totalTimeMs: timings.total
        });

        res.json({
            success: true,
            id,
            draft_v1: draftV1,
            critique: critiqueResult,
            draft_v2: draftV2,
            metadata: {
                model: agentRuntime().model,
                provider: agentRuntime().provider,
                timings: {
                    generation_ms: timings.generation,
                    critique_ms: timings.critique,
                    refinement_ms: timings.refinement,
                    total_ms: timings.total
                }
            }
        });
    } catch (error) {
        console.error("Agentic generation failed:", error.message);
        res.status(500).json({
            success: false,
            error: "Generation failed",
            details: error.message
        });
    }
});

router.get("/generation/:id", async (req, res) => {
    try {
        const row = await getAgenticGeneration(req.params.id);

        if (!row) {
            return res.status(404).json({ error: "Generation not found" });
        }

        res.json({
            id: row.id,
            input: row.input,
            draft_v1: parseStoredJson(row.draft_v1),
            critique: parseStoredJson(row.critique),
            draft_v2: parseStoredJson(row.draft_v2),
            selected_version: row.selected_version,
            final_body: row.final_body,
            created_at: row.created_at,
            finalized_at: row.finalized_at,
            timings: {
                generation_ms: row.gen_time_ms,
                critique_ms: row.critique_time_ms,
                refinement_ms: row.refine_time_ms,
                total_ms: row.total_time_ms
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/finalize/:id", async (req, res) => {
    const version = Number(req.body.version);
    const editedBody = typeof req.body.edited_body === "string" ? req.body.edited_body : null;

    if (![1, 2].includes(version)) {
        return res.status(400).json({ error: "Version must be 1 or 2" });
    }

    try {
        const result = await finalizeAgentic(req.params.id, version, editedBody);

        if (!result) {
            return res.status(404).json({ error: "Generation not found" });
        }

        res.json({
            success: true,
            message: `Version ${version} finalized`,
            id: result.id,
            overridePercentage: result.overridePercentage
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
