import { chartPackage } from "../../src/resources/packages/chart/index.js";
import { mountStudyExplanationFixture } from "./studyExplanationFixture.js";

/** Suporte sintético do gráfico estatístico desta revisão: sem acervo privado, sem
 * caminho absoluto, sem cliente de conta. Hidrata o caminho real de Unidade e
 * Explicação usado pelo produto. */
export async function mountRevisaoV10ChartFixture(root, { unit = "theory", theme = "light" } = {}) {
  return mountStudyExplanationFixture(root, {
    unit,
    theme,
    resourceContent: [{
      id: "representation",
      package: chartPackage.manifest.id,
      version: chartPackage.manifest.version,
      data: structuredClone(chartPackage.authoringContract.example)
    }]
  });
}
