import { academicProfile } from "../../sdk/academic.js";
import { auxiliaryLinksSchema, normalizeAuxiliaryLinks, validateAuxiliaryLinks, renderAuxiliaryLinks,
  auxiliaryLinksInteraction, auxiliaryLinksAccessibleText, auxiliaryLinksEditableTargets } from "../auxiliary-links/shared.js";

export const grammarPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.grammar", version: "1.0.0", label: "Gramática",
    purpose: "Abrir explicações gramaticais escolhidas para apoiar a análise de formas, construções e usos no contexto da tarefa.",
    slots: Object.freeze(["content"]), tool: Object.freeze({ label: "Gramática", icon: "book-open" }),
    taskOperations: Object.freeze(["consult-grammar", "analyze-language", "compare-language-forms"]),
    academic: academicProfile({ domains: ["linguística", "idiomas"], knowledgeObjects: ["construção gramatical", "forma e uso"],
      conventions: ["idioma identificado", "recurso com propósito explícito", "consulta ligada à tarefa"],
      appropriateWhen: ["o estudante precisa consultar uma regra, construção ou contraste enquanto estuda"],
      avoidWhen: ["o texto da unidade já oferece toda a orientação necessária", "o link apenas comprova um enunciado"],
      technologies: ["HTML semântico", "links HTTP/HTTPS e PDFs autorizados"], practiceModes: ["exposition"],
      taxonomy: { primaryFamilyId: "family.text_language", familyIds: ["family.text_language"], structureIds: ["structure.prose"], specificity: "disciplinary" } }),
    responseCompatibility: Object.freeze([]), limitations: Object.freeze(["Não analisa a frase nem corrige a produção automaticamente.", "Referência de evidência é registrada separadamente do recurso para estudar."]),
    accessibility: "Cada recurso tem botão com rótulo próprio, idioma quando informado e aviso de abertura ou falha."
  }),
  authoringContract: Object.freeze({ intent: "Selecione explicações gramaticais e diga como elas ajudam na tarefa.", required: Object.freeze(["title", "items"]), optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Use vários itens quando o contraste exigir mais de uma consulta.", "Indique idioma e orientação, sem inferir que abrir o link verifica a fonte.", "URLs são HTTP/HTTPS; PDFs guardados no curso usam sourceId, sourceRevision e contentHash. Nunca persista URL temporária de Storage."]),
    example: Object.freeze({ title: "Consulte a construção antes de responder", prompt: "Compare a posição dos constituintes nos exemplos do texto.",
      items: [{ id: "construction", label: "Explicação da construção", description: "Leia a seção indicada e volte para justificar sua análise.", languageTag: "pt-BR",
        target: { kind: "url", url: "https://example.org/gramatica/construcao" } }] })
  }),
  schema: auxiliaryLinksSchema, normalize: normalizeAuxiliaryLinks, validate: validateAuxiliaryLinks,
  render: renderAuxiliaryLinks, toolInteraction: auxiliaryLinksInteraction, accessibleText: auxiliaryLinksAccessibleText,
  editableTargets: auxiliaryLinksEditableTargets, practiceTargets() { return []; }
});
