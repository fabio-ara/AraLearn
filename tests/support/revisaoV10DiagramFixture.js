import { mountStudyExplanationFixture } from "./studyExplanationFixture.js";
import { revisaoV10DiagramCase } from "./revisaoV10DiagramCases.js";

/** Suporte sintético dos diagramas desta revisão: sem acervo privado, sem caminho
 * absoluto, sem cliente de conta ou escrita remota. Hidrata o mesmo caminho real de
 * Unidade de estudo e Explicação usado pelo produto. */
export async function mountRevisaoV10DiagramFixture(root, { unit = "theory", theme = "light", diagram = "container" } = {}) {
  const { packageId, version, data } = revisaoV10DiagramCase(diagram);
  return mountStudyExplanationFixture(root, {
    unit,
    theme,
    resourceContent: [{ id: "representation", package: packageId, version, data }]
  });
}
