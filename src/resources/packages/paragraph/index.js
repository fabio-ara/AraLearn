import { renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

export const paragraphPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.paragraph",
    version: "1.0.0",
    label: "Texto explicado",
    purpose: "Desenvolver uma explicação progressiva em prosa, listas curtas e literais inequívocos.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["situate", "explain", "exemplify", "summarize-locally", "give-feedback"]),
    academic: academicProfile({ domains: ["transversal"], knowledgeObjects: ["conceito", "explicação", "exemplo narrado"], conventions: ["prosa acadêmica contínua", "termo apresentado antes do uso"], appropriateWhen: ["a relação espacial não acrescenta significado"], avoidWhen: ["a estrutura do objeto exige notação própria"], technologies: ["HTML semântico"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.ordering"]),
    limitations: Object.freeze([
      "Não representa relações espaciais ou tabulares.",
      "Não deve condensar conceitos independentes para reduzir cards."
    ]),
    accessibility: "O próprio texto constitui a alternativa não visual."
  }),
  authoringContract: Object.freeze({
    intent: "Escreva a unidade de explicação que cabe neste momento da progressão.",
    required: Object.freeze(["text"]),
    optional: Object.freeze(["languageTag", "textDirection"]),
    rules: Object.freeze([
      "Situe termos novos antes de depender deles.",
      "Use crases somente para a unidade literal completa intencionada.",
      "Separe conceitos independentes em outras instâncias ou cards."
    ]),
    example: Object.freeze({
      text: "O protocolo define regras para que duas partes troquem mensagens de forma previsível.",
      languageTag: "pt-BR",
      textDirection: "auto"
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1, maxLength: 12000 },
      languageTag: { type: "string", minLength: 2, maxLength: 63 },
      textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] }
    }
  }),
  normalize(data) {
    return {
      text: String(data?.text || "").replace(/\r\n?/g, "\n").trim(),
      ...(String(data?.languageTag || "").trim() ? { languageTag: String(data.languageTag).trim() } : {}),
      ...(String(data?.textDirection || "").trim() ? { textDirection: String(data.textDirection).trim() } : {})
    };
  },
  validate(data) {
    const errors = [];
    const text = String(data?.text || "");
    const backticks = [...text].filter((character) => character === "`").length;
    if (backticks % 2 !== 0) errors.push("Texto contém crase sem par.");
    const literalSegments = text.split("`").filter((_, index) => index % 2 === 1);
    if (literalSegments.some((segment) => !segment || segment !== segment.trim())) {
      errors.push("Literal não pode ter espaço junto à crase delimitadora.");
    }
    return errors;
  },
  render(data) {
    return `<div class="runtime-block runtime-paragraph-block">${renderPackageProse(data.text, data)}</div>`;
  },
  accessibleText(data) {
    return String(data?.text || "").replace(/`/g, "").replace(/\s+/g, " ").trim();
  },
  editableTargets() {
    return [{ path: "text", label: "Editar explicação", preserveMarkup: true }];
  },
  practiceTargets() {
    return [{ path: "text", label: "Trecho na explicação", modes: ["gap", "typing", "ordering"] }];
  }
});
