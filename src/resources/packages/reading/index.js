import { academicProfile } from "../../sdk/academic.js";
import { auxiliaryLinksSchema, normalizeAuxiliaryLinks, validateAuxiliaryLinks, renderAuxiliaryLinks,
  auxiliaryLinksInteraction, auxiliaryLinksAccessibleText, auxiliaryLinksEditableTargets } from "../auxiliary-links/shared.js";

export const readingPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.reading", version: "1.0.0", label: "Leitura complementar",
    purpose: "Oferecer leituras selecionadas com orientação para ampliar, contrastar ou aplicar o conteúdo da tarefa e depois retomar o estudo.",
    slots: Object.freeze(["content"]), tool: Object.freeze({ label: "Leitura complementar", icon: "book-text" }),
    taskOperations: Object.freeze(["read-complement", "compare-explanations", "apply-reading"]),
    academic: academicProfile({ domains: ["transversal"], knowledgeObjects: ["leitura orientada", "explicação complementar", "contraste de perspectivas"],
      conventions: ["finalidade da leitura explícita", "recurso identificado", "retorno à tarefa"],
      appropriateWhen: ["outra leitura acrescenta uma perspectiva ou explicação necessária ao percurso"],
      avoidWhen: ["o conteúdo necessário só foi deslocado para fora da unidade sem orientação", "o vínculo tem apenas função de evidência"],
      technologies: ["HTML semântico", "links HTTP/HTTPS e PDFs autorizados"], practiceModes: ["exposition"],
      taxonomy: { primaryFamilyId: "family.text_language", familyIds: ["family.text_language"], structureIds: ["structure.prose"], specificity: "versatile" } }),
    responseCompatibility: Object.freeze([]), limitations: Object.freeze(["Não resume nem verifica automaticamente o material indicado.", "Leitura instrucional e vínculo de evidência são decisões distintas, mesmo para o mesmo documento."]),
    accessibility: "Leituras têm identificação e orientação próprias; cada botão anuncia o recurso e o resultado da abertura."
  }),
  authoringContract: Object.freeze({ intent: "Ofereça recursos de leitura com uma orientação que os conecte à tarefa.", required: Object.freeze(["title", "items"]), optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["O texto essencial do percurso continua explicado; indique o que examinar na leitura adicional.", "Um PDF do curso usa somente a identidade lógica, revisão da fonte e hash; o host verifica a permissão ao abrir.", "Não transforme a indicação de leitura em confirmação factual da fonte."]),
    example: Object.freeze({ title: "Amplie a comparação", prompt: "Leia a perspectiva adicional e volte para comparar os argumentos.",
      items: [{ id: "reading", label: "Perspectiva complementar", description: "Compare a explicação deste texto com o mecanismo estudado.",
        target: { kind: "url", url: "https://example.org/leitura/comparacao" } }] })
  }),
  schema: auxiliaryLinksSchema, normalize: normalizeAuxiliaryLinks, validate: validateAuxiliaryLinks,
  render: renderAuxiliaryLinks, toolInteraction: auxiliaryLinksInteraction, accessibleText: auxiliaryLinksAccessibleText,
  editableTargets: auxiliaryLinksEditableTargets, practiceTargets() { return []; }
});
