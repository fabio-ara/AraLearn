import { renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import {
  accessibleRichParagraph, hydrateRichParagraph, PARAGRAPH_LANGUAGE_PROPERTIES,
  renderRichParagraph, richParagraphTextTargets, RICH_PARAGRAPH_SCHEMA, validateRichParagraph
} from "./richText.js";

function validateProse(text) {
  const errors = [];
  const backticks = [...text].filter((character) => character === "`").length;
  if (backticks % 2 !== 0) errors.push("Texto contém crase sem par.");
  const literalSegments = text.split("`").filter((_, index) => index % 2 === 1);
  if (literalSegments.some((segment) => !segment || segment !== segment.trim())) {
    errors.push("Literal não pode ter espaço junto à crase delimitadora.");
  }
  return errors;
}

export const paragraphPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.paragraph",
    version: "1.0.0",
    label: "Texto explicado",
    purpose: "Desenvolver uma explicação progressiva em prosa, listas, literais, escrita anotada e matemática integrada.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["situate", "explain", "exemplify", "summarize-locally", "give-feedback"]),
    academic: academicProfile({ domains: ["transversal"], knowledgeObjects: ["conceito", "explicação", "exemplo narrado"], conventions: ["prosa acadêmica contínua", "termo apresentado antes do uso"], appropriateWhen: ["a relação espacial não acrescenta significado"], avoidWhen: ["a estrutura do objeto exige notação própria"], technologies: ["HTML semântico"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.ordering"]),
    limitations: Object.freeze([
      "Não representa relações espaciais ou tabulares.",
      "Não deve condensar conceitos independentes para reduzir Unidades de estudo."
    ]),
    accessibility: "O próprio texto constitui a alternativa não visual."
  }),
  authoringContract: Object.freeze({
    intent: "Escreva a unidade de explicação que cabe neste momento da progressão.",
    required: Object.freeze([]),
    optional: Object.freeze(["text", "format", "blocks", "languageTag", "textDirection"]),
    rules: Object.freeze([
      "Situe termos novos antes de depender deles.",
      "Use crases somente para a unidade literal completa intencionada.",
      "Declare text para prosa usual; ou format rich e blocks para prosa com matemática e ruby. Nunca combine text e blocks.",
      "Em rich, cada bloco é paragraph com inlines ou math. Cada trecho é text, ruby (base e reading) ou math (notation, accessibleText e expression).",
      "Matemática usa a AST semântica do contrato de fórmula; não envie LaTeX, HTML ou MathML. A mesma AST pode aparecer inline ou em bloco.",
      "Informe languageTag BCP 47 e textDirection quando necessários; trechos herdam idioma e direção. Ruby associa a escrita a uma leitura, sem inferir pronúncia.",
      "Edição manual altera somente folhas textuais; fórmulas e a organização dos blocos continuam estruturais.",
      "Separe conceitos independentes em outras instâncias ou Unidades de estudo."
    ]),
    example: Object.freeze({
      text: "O protocolo define regras para que duas partes troquem mensagens de forma previsível.",
      languageTag: "pt-BR",
      textDirection: "auto"
    })
  }),
  schema: Object.freeze({
    oneOf: [{
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1, maxLength: 12000 },
      format: { const: "plain" },
      ...PARAGRAPH_LANGUAGE_PROPERTIES
    }
    }, RICH_PARAGRAPH_SCHEMA]
  }),
  normalize(data) {
    if (data?.format === "rich") return structuredClone(data);
    return {
      text: String(data?.text || "").replace(/\r\n?/g, "\n").trim(),
      ...(data?.format !== undefined ? { format: data.format } : {}),
      ...(data?.blocks !== undefined ? { blocks: structuredClone(data.blocks) } : {}),
      ...(String(data?.languageTag || "").trim() ? { languageTag: String(data.languageTag).trim() } : {}),
      ...(String(data?.textDirection || "").trim() ? { textDirection: String(data.textDirection).trim() } : {})
    };
  },
  validate(data) {
    return data?.format === "rich" ? validateRichParagraph(data, validateProse) : validateProse(String(data?.text || ""));
  },
  render(data) {
    return `<div class="runtime-block runtime-paragraph-block">${data.format === "rich" ? renderRichParagraph(data) : renderPackageProse(data.text, data)}</div>`;
  },
  hydrate(instanceRoot) { hydrateRichParagraph(instanceRoot); },
  accessibleText(data) {
    if (data?.format === "rich") return accessibleRichParagraph(data);
    return String(data?.text || "").replace(/`/g, "").replace(/\s+/g, " ").trim();
  },
  editableTargets(data) {
    if (data?.format === "rich") return richParagraphTextTargets(data);
    return [{ path: "text", label: "Editar explicação", preserveMarkup: true }];
  },
  practiceTargets(data) {
    if (data?.format === "rich") return richParagraphTextTargets(data).map(({ path, label }) => ({
      path, label: label.replace(/^Editar/u, "Trecho em"), modes: ["gap", "typing", "ordering"]
    }));
    return [{ path: "text", label: "Trecho na explicação", modes: ["gap", "typing", "ordering"] }];
  }
});
