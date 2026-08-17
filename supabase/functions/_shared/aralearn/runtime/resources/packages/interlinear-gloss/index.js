import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

function boundaryCount(value, boundary) {
  return String(value).split(boundary).length - 1;
}

export const interlinearGlossPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.interlinear_gloss", version: "1.0.0", label: "Glosa interlinear",
    purpose: "Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações.", slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["align-form-gloss", "analyze-morphemes", "compare-language-forms", "interpret-grammatical-category"]),
    academic: academicProfile({ domains: ["linguística", "morfologia", "sintaxe", "ensino de línguas"], knowledgeObjects: ["forma segmentada", "morfema", "glosa", "tradução livre", "abreviação gramatical"], conventions: ["alinhamento interlinear por unidade", "mesmas fronteiras na forma e na glosa", "tradução livre separada", "abreviações gramaticais em versal"], appropriateWhen: ["a análise depende da correspondência entre formas e propriedades gramaticais"], avoidWhen: ["uma citação ou tradução simples é suficiente", "a tarefa não é linguística"], technologies: ["HTML semântico", "atributos de idioma e direção"], practiceModes: ["exposition", "gap", "typing", "selection"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["Não substitui uma análise morfológica explicada.", "As abreviações precisam ser introduzidas ao estudante antes ou junto do primeiro uso."]),
    accessibility: "Cada unidade anuncia forma e glosa; a tradução livre e a legenda de abreviações são lidas separadamente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare uma glosa interlinear segundo as correspondências das Leipzig Glossing Rules, sem simular alinhamento com espaços.",
    required: Object.freeze(["languageTag", "units", "translation"]), optional: Object.freeze(["prompt", "textDirection", "abbreviations"]),
    rules: Object.freeze(["Cada unidade alinha uma forma a uma glosa.", "Fronteiras com hífen ou sinal de igual aparecem na mesma quantidade na forma e na glosa.", "A tradução é livre e pertence ao exemplo inteiro.", "Toda abreviação gramatical não explicada anteriormente deve constar em abbreviations."]),
    example: Object.freeze({
      prompt: "Compare cada palavra do lezguiano com sua glosa morfema a morfema.", languageTag: "lez", textDirection: "ltr",
      units: [
        { id: "word-1", form: "Gila", gloss: "now" },
        { id: "word-2", form: "abur-u-n", gloss: "they-OBL-GEN" },
        { id: "word-3", form: "ferma", gloss: "farm" },
        { id: "word-4", form: "hamišaluǧ", gloss: "forever" },
        { id: "word-5", form: "güǧüna", gloss: "behind" },
        { id: "word-6", form: "amuq’-da-č.", gloss: "stay-FUT-NEG" }
      ],
      translation: "Agora, a fazenda deles não ficará para trás para sempre.",
      abbreviations: [
        { code: "OBL", meaning: "oblíquo" },
        { code: "GEN", meaning: "genitivo" },
        { code: "FUT", meaning: "futuro" },
        { code: "NEG", meaning: "negação" }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["languageTag", "units", "translation"], properties: {
      prompt: { type: "string", maxLength: 2000 }, languageTag: { type: "string", minLength: 2 }, textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] },
      units: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "form", "gloss"], properties: { id: { type: "string", minLength: 1 }, form: { type: "string", minLength: 1 }, gloss: { type: "string", minLength: 1 } } } },
      translation: { type: "string", minLength: 1 },
      abbreviations: { type: "array", uniqueItems: true, items: { type: "object", additionalProperties: false, required: ["code", "meaning"], properties: { code: { type: "string", minLength: 1, maxLength: 30 }, meaning: { type: "string", minLength: 1, maxLength: 300 } } } }
    }
  }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), languageTag: String(data?.languageTag || "").trim(), textDirection: String(data?.textDirection || "auto").trim(), units: (data?.units || []).map((item) => ({ id: String(item?.id || "").trim(), form: String(item?.form || "").trim(), gloss: String(item?.gloss || "").trim() })), translation: String(data?.translation || "").trim(), abbreviations: (data?.abbreviations || []).map((item) => ({ code: String(item?.code || "").trim(), meaning: String(item?.meaning || "").trim() })) }; },
  validate(data) {
    const errors = [];
    if (new Set(data.units.map(({ id }) => id)).size !== data.units.length) errors.push("Unidades precisam de ids únicos.");
    if (new Set(data.abbreviations.map(({ code }) => code)).size !== data.abbreviations.length) errors.push("Abreviações precisam de códigos únicos.");
    data.units.forEach((unit, index) => {
      for (const boundary of ["-", "="]) {
        if (boundaryCount(unit.form, boundary) !== boundaryCount(unit.gloss, boundary)) errors.push(`A unidade ${index + 1} precisa preservar na glosa as fronteiras ${boundary} da forma.`);
      }
    });
    return errors;
  },
  render(data) {
    const direction = escapePackageAttribute(data.textDirection || "auto");
    const units = data.units.map((unit) => `<span class="runtime-interlinear-unit" data-unit-id="${escapePackageAttribute(unit.id)}"><span class="runtime-interlinear-form">${renderPackageInline(unit.form)}</span><span class="runtime-interlinear-unit-gloss">${renderPackageInline(unit.gloss)}</span></span>`).join("");
    const abbreviations = data.abbreviations.length ? `<dl class="runtime-interlinear-abbreviations" aria-label="Abreviações da glosa">${data.abbreviations.map(({ code, meaning }) => `<div><dt>${renderPackageInline(code)}</dt><dd>${renderPackageInline(meaning)}</dd></div>`).join("")}</dl>` : "";
    return `<div class="runtime-block runtime-interlinear-gloss-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure class="runtime-interlinear-gloss" lang="${escapePackageAttribute(data.languageTag)}" dir="${direction}"><div class="runtime-interlinear-units">${units}</div><figcaption class="runtime-interlinear-translation" lang="pt-BR">“${renderPackageInline(data.translation)}”</figcaption></figure>${abbreviations}</div>`;
  },
  accessibleText(data) { return `${data.units.map((unit) => `${unit.form}; glosa ${unit.gloss}`).join(". ")}. Tradução livre: ${data.translation}. ${data.abbreviations.map(({ code, meaning }) => `${code} significa ${meaning}`).join(". ")}`.trim(); },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.units.flatMap((_, index) => [{ path: `units[${index}].form`, label: `Editar forma da unidade ${index + 1}` }, { path: `units[${index}].gloss`, label: `Editar glosa da unidade ${index + 1}` }]), { path: "translation", label: "Editar tradução livre" }, ...data.abbreviations.flatMap((_, index) => [{ path: `abbreviations[${index}].code`, label: `Editar abreviação ${index + 1}` }, { path: `abbreviations[${index}].meaning`, label: `Editar significado ${index + 1}` }])]; },
  practiceTargets(data) { return [...data.units.flatMap((_, index) => [{ path: `units[${index}].form`, label: `Lacuna na forma ${index + 1}`, modes: ["gap", "typing"] }, { path: `units[${index}].gloss`, label: `Lacuna na glosa ${index + 1}`, modes: ["gap", "typing"] }]), { path: "translation", label: "Lacuna na tradução livre", modes: ["gap", "typing"] }]; }
});
