/**
 * Runs the 20-item eval set in eval-set.json against a live server (simple mode,
 * POST /api/generate) and checks each response against the same structural rules
 * postProcessor.js and evaluator.js enforce.
 *
 * Usage: node server/evals/run-evals.js [baseUrl]
 * Default baseUrl: http://localhost:5001
 */

const axios = require("axios");
const { cases, schemaRules } = require("./eval-set.json");

const baseUrl = process.argv[2] || "http://localhost:5001";
const slugRegex = new RegExp(schemaRules.slugPattern, "u");

function checkCase(input, result) {
    const failures = [];

    if (result.error) {
        failures.push(`request failed: ${result.error}`);
        return failures;
    }

    const content = result.content || {};

    if (!Array.isArray(content.headlines) || content.headlines.length !== schemaRules.headlinesCount) {
        failures.push(`headlines count !== ${schemaRules.headlinesCount}`);
    }

    if (!Array.isArray(content.tags) || content.tags.length !== schemaRules.tagsCount) {
        failures.push(`tags count !== ${schemaRules.tagsCount}`);
    }

    const bodyWordCount = (content.body || "").split(/\s+/).filter(Boolean).length;
    const [min, max] = schemaRules.bodyWordRange;
    if (bodyWordCount < min || bodyWordCount > max) {
        failures.push(`body word count ${bodyWordCount} outside [${min}, ${max}]`);
    }

    if (!content.slug || !slugRegex.test(content.slug)) {
        failures.push(`slug "${content.slug}" does not match Arabic-hyphen pattern`);
    }

    if (!content.seo_description || content.seo_description.length > schemaRules.seoDescriptionMaxChars) {
        failures.push(`seo_description missing or over ${schemaRules.seoDescriptionMaxChars} chars`);
    }

    return failures;
}

async function runCase(testCase) {
    try {
        const { data } = await axios.post(`${baseUrl}/api/generate`, { input: testCase.input });
        const failures = checkCase(testCase.input, data);
        return {
            id: testCase.id,
            category: testCase.category,
            pass: failures.length === 0,
            failures,
            retryTriggered: data.meta?.retryTriggered,
            deterministicScore: data.meta?.deterministicScore
        };
    } catch (error) {
        return {
            id: testCase.id,
            category: testCase.category,
            pass: false,
            failures: [`HTTP error: ${error.response?.data?.details || error.message}`]
        };
    }
}

async function main() {
    console.log(`Running ${cases.length} eval cases against ${baseUrl} ...\n`);

    const results = [];
    for (const testCase of cases) {
        const result = await runCase(testCase);
        results.push(result);
        const status = result.pass ? "PASS" : "FAIL";
        console.log(
            `[${status}] #${result.id} (${result.category})` +
            (result.deterministicScore !== undefined ? ` score=${result.deterministicScore}/10` : "") +
            (result.retryTriggered ? " (retried)" : "")
        );
        if (!result.pass) {
            result.failures.forEach((f) => console.log(`        - ${f}`));
        }
    }

    const passed = results.filter((r) => r.pass).length;
    const rate = ((passed / results.length) * 100).toFixed(1);
    console.log(`\n${passed}/${results.length} passed (${rate}%)`);

    process.exit(passed === results.length ? 0 : 1);
}

main();
