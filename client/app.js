let currentGenerationId = null;

const inputField = document.getElementById("inputText");
const generateBtn = document.getElementById("generateBtn");
const outputDiv = document.getElementById("output");
const metricsPanel = document.getElementById("metricsPanel");
const loadingDiv = document.getElementById("loading");
const errorDiv = document.getElementById("errorMessage");
const charCount = document.getElementById("charCount");

inputField.addEventListener("input", () => {
    charCount.textContent = inputField.value.length + " characters";
});

function getMode() {
    return document.querySelector('input[name="mode"]:checked').value;
}

generateBtn.addEventListener("click", async () => {
    const input = inputField.value.trim();

    if (!input) {
        errorDiv.textContent = "Input required.";
        return;
    }

    errorDiv.textContent = "";
    generateBtn.disabled = true;

    try {
        if (getMode() === "agentic") {
            await generateAgentic(input);
        } else {
            await generateSimple(input);
        }
    } finally {
        generateBtn.disabled = false;
    }
});

async function generateSimple(input) {
    loadingDiv.classList.remove("hidden");
    metricsPanel.classList.add("hidden");
    document.getElementById("comparison-view").classList.add("hidden");
    document.getElementById("agent-progress").classList.add("hidden");
    outputDiv.innerHTML = "";

    try {
        const response = await fetch("/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ input })
        });

        const result = await response.json();

        currentGenerationId = result.generationId || (result.meta && result.meta.generationId) || null;

        if (result.error) {
            throw new Error(result.error + (result.details ? " - " + result.details : ""));
        }

        renderContent(result.content);
        renderMetrics(result.meta);

    } catch (err) {
        errorDiv.textContent = err.message;
    } finally {
        loadingDiv.classList.add("hidden");
    }
}

function renderContent(content) {
    outputDiv.innerHTML = "";

    renderSection("Headlines", content.headlines.join("\n"));
    renderSection("Slug", content.slug);
    renderSection("SEO Title", content.seo_title);
    renderParagraphSection(content.seo_description, "SEO Description");
    renderArticleBody(content.body);
    renderTags(content.tags);
    renderParagraphSection(content.summary, "Summary");
}

function renderSection(title, value) {
    const div = document.createElement("div");
    div.className = "section";
    div.innerHTML = `
  <div class="section-header">
    <h3>${title}</h3>
    <button class="copy-btn">Copy</button>
  </div>
  <pre>${value}</pre>
`;

    div.querySelector(".copy-btn").addEventListener("click", () => {
        navigator.clipboard.writeText(value);
    });

    outputDiv.appendChild(div);
}

function renderTags(tags) {
    const div = document.createElement("div");
    div.className = "section tags";
    div.innerHTML = "<h3>Tags</h3>";

    tags.forEach(tag => {
        const span = document.createElement("span");
        span.textContent = tag;
        div.appendChild(span);
    });

    outputDiv.appendChild(div);
}

function renderMetrics(meta) {
    metricsPanel.classList.remove("hidden");

    let qualityLabel = "";
    let qualityClass = "";

    if (meta.deterministicScore >= 8) {
        qualityLabel = "Excellent";
        qualityClass = "quality-good";
    } else if (meta.deterministicScore >= 6) {
        qualityLabel = "Good";
        qualityClass = "quality-medium";
    } else {
        qualityLabel = "Needs Review";
        qualityClass = "quality-bad";
    }

    metricsPanel.innerHTML = `
    <div class="metrics-row">
      <strong>Quality:</strong>
      <span class="quality-badge ${qualityClass}">
        ${meta.deterministicScore}/10 - ${qualityLabel}
      </span>
    </div>

    <div class="metrics-row">
      <strong>Word Count:</strong> ${meta.bodyWordCount}
    </div>

    <div class="metrics-row">
      <strong>Generation Time:</strong> ${meta.generationTimeMs} ms
    </div>

    ${meta.retryTriggered
            ? `<div class="retry-note">Regenerated due to constraint adjustment.</div>`
            : ""
        }
  `;
}

function renderParagraphSection(text, title = "Section") {
    const div = document.createElement("div");
    div.className = "section";

    const paragraphs = text.split("\n").filter(p => p.trim() !== "");

    div.innerHTML = `
    <div class="section-header">
      <h3>${title}</h3>
      <button class="copy-btn">Copy</button>
    </div>
  `;

    paragraphs.forEach(p => {
        const para = document.createElement("p");
        para.textContent = p;
        div.appendChild(para);
    });

    div.querySelector(".copy-btn").addEventListener("click", () => {
        navigator.clipboard.writeText(text);
    });

    outputDiv.appendChild(div);
}

function renderArticleBody(text) {
    const div = document.createElement("div");
    div.className = "section";

    div.innerHTML = `
    <div class="section-header">
      <h3>Article Body</h3>
      <button class="copy-btn">Copy</button>
    </div>
    <textarea id="editableBody" class="editable-body">${text}</textarea>
    <button id="finalizeBtn" class="finalize-btn">Finalize & Save</button>
    <div id="overrideInfo"></div>
  `;

    div.querySelector(".copy-btn").addEventListener("click", () => {
        navigator.clipboard.writeText(document.getElementById("editableBody").value);
    });

    outputDiv.appendChild(div);

    document.getElementById("finalizeBtn").addEventListener("click", finalizeArticle);
}

async function finalizeArticle() {
    if (!currentGenerationId) return;

    const editedBody = document.getElementById("editableBody").value;

    try {
        const response = await fetch(`/api/generate/finalize/${currentGenerationId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                editedContent: {
                    body: editedBody
                }
            })
        });

        const result = await response.json();

        document.getElementById("overrideInfo").innerHTML = `
      <div class="override-badge">
        Edit Delta: ${result.overridePercentage}%
      </div>
    `;

    } catch (err) {
        console.error("Finalize error:", err.message);
    }
}

function resetAgentSteps() {
    ["generator", "critic", "refiner"].forEach((agent) => {
        const el = document.getElementById(`step-${agent}`);
        el.classList.remove("active", "done");
        el.querySelector(".agent-status").textContent = "⏳";
    });
}

function markAgentDone(agent) {
    const el = document.getElementById(`step-${agent}`);
    el.classList.remove("active");
    el.classList.add("done");
    el.querySelector(".agent-status").textContent = "✅";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function generateAgentic(input) {
    const progress = document.getElementById("agent-progress");
    const comparison = document.getElementById("comparison-view");

    progress.classList.remove("hidden");
    comparison.classList.add("hidden");
    loadingDiv.classList.add("hidden");
    metricsPanel.classList.add("hidden");
    outputDiv.innerHTML = "";
    document.getElementById("finalizeStatus").textContent = "";
    resetAgentSteps();
    document.getElementById("step-generator").classList.add("active");

    try {
        const response = await fetch("/api/generate-agentic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.details || data.error || "Generation failed");
        }

        currentGenerationId = data.id;

        ["generator", "critic", "refiner"].forEach(markAgentDone);

        document.getElementById("critique-score").textContent = data.critique.overall_score;
        document.getElementById("v1-score").textContent = `${data.critique.overall_score}/10`;
        document.getElementById("v2-score").textContent = data.critique_v2
            ? `${data.critique_v2.overall_score}/10`
            : "-";
        document.getElementById("critique-headlines").textContent = data.critique.headline_feedback || "-";
        document.getElementById("critique-body").textContent = data.critique.body_feedback || "-";
        document.getElementById("critique-seo").textContent = data.critique.seo_feedback || "-";
        document.getElementById("critique-tags").textContent = data.critique.tags_feedback || "-";
        document.getElementById("critique-language").textContent = data.critique.language_feedback || "-";

        const improvementsList = document.getElementById("improvements-list");
        improvementsList.innerHTML = "";
        (data.critique.suggested_improvements || []).forEach((item) => {
            const li = document.createElement("li");
            li.textContent = item;
            improvementsList.appendChild(li);
        });

        renderDraft("draft-v1-content", data.draft_v1);
        renderDraft("draft-v2-content", data.draft_v2);

        document.getElementById("changes-summary").textContent =
            "📝 " + (data.draft_v2.changes_summary || "تم تحسين المسودة");

        document.getElementById("time-gen").textContent = data.metadata.timings.generation_ms;
        document.getElementById("time-critique").textContent = data.metadata.timings.critique_ms;
        document.getElementById("time-refine").textContent = data.metadata.timings.refinement_ms;
        document.getElementById("time-critique2").textContent = data.metadata.timings.critique_v2_ms;
        document.getElementById("time-total").textContent = data.metadata.timings.total_ms;

        comparison.classList.remove("hidden");
    } catch (error) {
        errorDiv.textContent = "فشل التوليد: " + error.message;
        resetAgentSteps();
    }
}

function renderDraft(containerId, draft) {
    const container = document.getElementById(containerId);
    const headlines = (draft.headlines || [])
        .map((headline) => `<li>${escapeHtml(headline)}</li>`)
        .join("");

    container.innerHTML = `
    <div class="draft-section">
      <strong>العناوين:</strong>
      <ol>${headlines}</ol>
    </div>
    <div class="draft-section">
      <strong>عنوان SEO:</strong> ${escapeHtml(draft.seo_title || "-")}
    </div>
    <div class="draft-section">
      <strong>الرابط:</strong> ${escapeHtml(draft.slug || "-")}
    </div>
    <div class="draft-section">
      <strong>الوصف:</strong> ${escapeHtml(draft.meta_description || "-")}
    </div>
    <div class="draft-section">
      <strong>المتن:</strong>
      <p>${escapeHtml(draft.body || "-")}</p>
    </div>
    <div class="draft-section">
      <strong>الوسوم:</strong> ${escapeHtml((draft.tags || []).join(" | "))}
    </div>
    <div class="draft-section">
      <strong>الملخص:</strong> ${escapeHtml(draft.summary || "-")}
    </div>
  `;
}

async function selectVersion(version) {
    const status = document.getElementById("finalizeStatus");

    if (!currentGenerationId) {
        status.textContent = "لا يوجد توليد حالي";
        return;
    }

    try {
        const response = await fetch(`/api/finalize/${currentGenerationId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Finalize failed");
        }

        status.textContent = `تم اختيار النسخة ${version}`;
    } catch (error) {
        status.textContent = "فشل الحفظ: " + error.message;
    }
}

document.querySelectorAll("[data-version]").forEach((button) => {
    button.addEventListener("click", () => {
        selectVersion(Number(button.dataset.version));
    });
});