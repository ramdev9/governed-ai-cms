const { callJaisForJSON, normalizeTags, normalizeSlug } = require("./jaisService");

async function generate(arabicInput) {
    const prompt = `أنت مساعد تحرير أخبار عربي. أنشئ مسودة خبر منظمة من المدخل التالي.

## المدخل:
${arabicInput}

## المطلوب:
أعد JSON بالبنية التالية بالضبط:

{
  "headlines": ["عنوان 1", "عنوان 2", "عنوان 3"],
  "seo_title": "عنوان SEO (60 حرف كحد أقصى)",
  "slug": "slug-بالعربية-مفصول-بشرطات",
  "meta_description": "وصف تعريفي (160 حرف كحد أقصى)",
  "body": "متن الخبر بالعربية الفصحى الحديثة (400-500 كلمة)",
  "tags": ["وسم1", "وسم2", "وسم3", "وسم4", "وسم5"],
  "summary": "ملخص في 2-3 جمل"
}

## القواعد:
- استخدم اللغة العربية الفصحى الحديثة فقط
- العناوين: 3 عناوين فريدة ومختلفة الأسلوب
- المتن: 400-500 كلمة، موضوعي ومهني
- الوسوم: 5 وسوم فريدة ذات صلة
- لا تضف أي نص خارج JSON

أعد JSON فقط:`;

    const draft = await callJaisForJSON(prompt, { maxTokens: 1024, temperature: 0.7 });

    const required = ["headlines", "seo_title", "slug", "meta_description", "body", "tags", "summary"];
    for (const field of required) {
        if (!draft[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    if (!Array.isArray(draft.headlines) || draft.headlines.length < 3) {
        throw new Error("Must have at least 3 headlines");
    }

    draft.headlines = draft.headlines.slice(0, 3).map((headline) => String(headline).trim());
    draft.tags = normalizeTags(draft.tags);
    draft.slug = normalizeSlug(draft.slug);

    return draft;
}

module.exports = { generate };
