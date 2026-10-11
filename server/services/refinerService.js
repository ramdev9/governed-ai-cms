const { callJaisForJSON, normalizeTags, normalizeSlug } = require("./jaisService");

async function refine(draftV1, critique) {
    const prompt = `أنت محرر أخبار عربي متمرس. لديك مسودة خبر وملاحظات تحريرية. أنتج نسخة محسّنة.

## المسودة الأصلية:
${JSON.stringify(draftV1, null, 2)}

## الملاحظات التحريرية:
${JSON.stringify(critique, null, 2)}

## المطلوب:
أنتج نسخة محسّنة تعالج الملاحظات التحريرية. أعد JSON بنفس البنية مع إضافة حقل "changes_summary":

{
  "headlines": ["عنوان محسّن 1", "عنوان محسّن 2", "عنوان محسّن 3"],
  "seo_title": "عنوان SEO محسّن",
  "slug": "slug-محسّن",
  "meta_description": "وصف تعريفي محسّن",
  "body": "متن محسّن (400-500 كلمة)",
  "tags": ["وسم1", "وسم2", "وسم3", "وسم4", "وسم5"],
  "summary": "ملخص محسّن",
  "changes_summary": "شرح التغييرات التي أجريت (2-3 جمل بالعربية)"
}

## القواعد:
- عالج كل ملاحظة من الناقد
- حافظ على اللغة العربية الفصحى الحديثة
- المتن: 400-500 كلمة
- الوسوم: 5 وسوم فريدة
- اشرح التغييرات في changes_summary

أعد JSON فقط:`;

    const refinedDraft = await callJaisForJSON(prompt, { maxTokens: 1024, temperature: 0.6 });

    if (!refinedDraft.changes_summary) {
        refinedDraft.changes_summary = "تم تحسين المسودة بناءً على ملاحظات الناقد";
    }

    if (Array.isArray(refinedDraft.headlines)) {
        refinedDraft.headlines = refinedDraft.headlines.slice(0, 3);
    }

    refinedDraft.tags = normalizeTags(refinedDraft.tags);
    refinedDraft.slug = normalizeSlug(refinedDraft.slug);

    return refinedDraft;
}

module.exports = { refine };
