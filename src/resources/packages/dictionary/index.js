import { academicProfile } from "../../sdk/academic.js";
import { auxiliaryLinksSchema, normalizeAuxiliaryLinks, validateAuxiliaryLinks, renderAuxiliaryLinks,
  auxiliaryLinksInteraction, auxiliaryLinksAccessibleText, auxiliaryLinksEditableTargets } from "../auxiliary-links/shared.js";

export const dictionaryPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.dictionary", version: "1.0.0", label: "Dicionário",
    purpose: "Abrir um ou mais dicionários configurados pela autoria para consultar sentidos, pronúncia e exemplos adequados ao contexto.",
    slots: Object.freeze(["content"]), tool: Object.freeze({ label: "Dicionário", icon: "languages" }),
    taskOperations: Object.freeze(["consult-dictionary", "compare-meanings", "interpret-context"]),
    academic: academicProfile({ domains: ["linguística", "idiomas", "transversal"], knowledgeObjects: ["sentido lexical", "uso contextual", "verbete"],
      conventions: ["idioma identificado", "obra de consulta explícita", "sentido interpretado no contexto"],
      appropriateWhen: ["a consulta lexical ajuda a compreender uma passagem ou escolher um uso"],
      avoidWhen: ["o exercício exige recuperar o sentido sem consulta", "é necessário fornecer uma tradução automática"],
      technologies: ["HTML semântico", "links HTTP/HTTPS e PDFs autorizados"], practiceModes: ["exposition"],
      taxonomy: { primaryFamilyId: "family.text_language", familyIds: ["family.text_language"], structureIds: ["structure.prose"], specificity: "versatile" } }),
    responseCompatibility: Object.freeze([]), limitations: Object.freeze(["Abre a consulta configurada; não escolhe um sentido nem transmite automaticamente o texto da unidade.", "A disponibilidade depende do recurso e da conexão."]),
    accessibility: "Dicionários têm rótulos distintos e orientação textual; falhas de abertura são anunciadas."
  }),
  authoringContract: Object.freeze({ intent: "Escolha as obras de consulta necessárias, com rótulos que distingam idioma e finalidade.", required: Object.freeze(["title", "items"]), optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Não há fornecedor padrão ou consulta enviada automaticamente.", "Para vários dicionários, use vários items; uma URL pode abrir um verbete específico ou a página de consulta.", "URLs são HTTP/HTTPS; PDF do curso usa referência lógica, sem URL temporária de Storage."]),
    example: Object.freeze({ title: "Compare os usos da palavra", prompt: "Consulte os exemplos e escolha o sentido compatível com a passagem.",
      items: [{ id: "lexicon", label: "Dicionário escolhido para a unidade", languageTag: "pt-BR", target: { kind: "url", url: "https://example.org/dicionario" } }] })
  }),
  schema: auxiliaryLinksSchema, normalize: normalizeAuxiliaryLinks, validate: validateAuxiliaryLinks,
  render: renderAuxiliaryLinks, toolInteraction: auxiliaryLinksInteraction, accessibleText: auxiliaryLinksAccessibleText,
  editableTargets: auxiliaryLinksEditableTargets, practiceTargets() { return []; }
});
