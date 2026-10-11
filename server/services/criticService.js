const { callJaisForJSON } = require("./jaisService");

async function critique(draft) {
    const prompt = `أنت ناقد تحريري محترف في غرفة أخبار عربية. حلل المسودة التالية وقدم ملاحظات منظمة.

## المسودة:
${JSON.stringify(draft, null, 2)}

## المطلوب:
حلل المسودة وأعد JSON بالبنية التالية:

{
  "overall_score": <رقم من 1 إلى 10>,
  "headline_feedback": "<ملاحظات محددة على العناوين الثلاثة>",
  "body_feedback": "<ملاحظات على المتن: الأسلوب، الاكتمال، الموضوعية>",
  "seo_feedback": "<ملاحظات على عنوان SEO والوصف التعريفي>",
  "tags_feedback": "<ملاحظات على الوسوم: الملاءمة والتنوع>",
  "language_feedback": "<ملاحظات على جودة اللغة العربية الفصحى>",
  "suggested_improvements": [
    "<تحسين محدد 1>",
    "<تحسين محدد 2>",
    "<تحسين محدد 3>"
  ]
}

## معايير التقييم:
- العناوين: جاذبة، دقيقة، متنوعة الأسلوب
- المتن: 400-500 كلمة، موضوعي، مكتمل المعلومات
- اللغة: عربية فصحى حديثة خالية من العامية
- SEO: عنوان ووصف مناسبان للبحث
- الوسوم: ذات صلة ومتنوعة

كن محددًا وعمليًا في ملاحظاتك. أعد JSON فقط:`;

    const critiqueResult = await callJaisForJSON(prompt, { maxTokens: 700, temperature: 0.5 });

    const score = Number(critiqueResult.overall_score);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
        critiqueResult.overall_score = 5;
    } else {
        critiqueResult.overall_score = score;
    }

    if (!Array.isArray(critiqueResult.suggested_improvements)) {
        critiqueResult.suggested_improvements = [];
    }

    return critiqueResult;
}

module.exports = { critique };
