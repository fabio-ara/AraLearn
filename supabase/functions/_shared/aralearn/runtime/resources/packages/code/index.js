import { escapePackageHtml, renderPackageCode, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

export const codePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.code", version: "1.0.0", label: "Código",
    purpose: "Apresentar código cuja sintaxe, indentação e execução mental são relevantes.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["inspect-code", "trace", "compare-implementations", "explain-syntax"]),
    academic: academicProfile({ domains: ["programação", "engenharia de software", "bancos de dados"], knowledgeObjects: ["trecho de programa", "consulta", "configuração textual"], conventions: ["fonte monoespaçada", "indentação preservada", "linguagem identificada"], appropriateWhen: ["a sintaxe e a execução mental fazem parte da aprendizagem"], avoidWhen: ["pseudocódigo ou prosa expressam melhor a ideia"], technologies: ["HTML semântico", "texto pré-formatado"], practiceModes: ["exposition", "gap", "typing", "selection"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Não executa o programa.", "Não substitui a explicação do contexto e do efeito do código."]),
    accessibility: "Prompt, linguagem e código são expostos como texto selecionável."
  }),
  authoringContract: Object.freeze({
    intent: "Mostre apenas o trecho necessário e explique o que o estudante deve observar.",
    required: Object.freeze(["prompt", "language", "code"]),
    optional: Object.freeze(["languageTag", "textDirection"]),
    rules: Object.freeze(["Preserve indentação.", "Não use código como decoração."]),
    example: Object.freeze({ prompt: "Observe a condição antes do envio.", language: "javascript", code: "if (online) {\n  enviar();\n}" })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["prompt", "language", "code"],
    properties: {
      prompt: { type: "string", minLength: 1, maxLength: 2000 },
      language: { type: "string", minLength: 1, maxLength: 40 },
      code: { type: "string", minLength: 1, maxLength: 20000 },
      languageTag: { type: "string", minLength: 2, maxLength: 63 },
      textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] }
    }
  }),
  normalize(data) {
    return {
      prompt: String(data?.prompt || "").trim(), language: String(data?.language || "text").trim().toLowerCase(),
      code: String(data?.code || "").replace(/\r\n?/g, "\n"),
      ...(data?.languageTag ? { languageTag: String(data.languageTag).trim() } : {}),
      ...(data?.textDirection ? { textDirection: String(data.textDirection).trim() } : {})
    };
  },
  validate() { return []; },
  render(data) {
    return `<div class="runtime-block runtime-code-block">${renderPackageProse(data.prompt, data)}<pre><code class="language-${escapePackageHtml(data.language)}">${renderPackageCode(data.code)}</code></pre></div>`;
  },
  accessibleText(data) { return `${data.prompt} Código ${data.language}: ${data.code}`; },
  editableTargets() { return [{ path: "prompt", label: "Editar orientação" }, { path: "code", label: "Editar código", preserveWhitespace: true }]; },
  practiceTargets() { return [{ path: "code", label: "Lacuna no código", modes: ["gap", "typing"] }]; }
});
