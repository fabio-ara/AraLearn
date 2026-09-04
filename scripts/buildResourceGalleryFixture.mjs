import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "../tests/fixtures/package/project-resources-gallery.json");
const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const responseContent = (manifest) => {
  if (manifest.id === "aralearn.response.gap") {
    return [paragraph("body-1", "Um protocolo define regras compartilhadas.")];
  }
  if (manifest.id === "aralearn.response.ordering") {
    return [paragraph("step-1", "Preparar"), paragraph("step-2", "Executar")];
  }
  return [paragraph(`context-${manifest.id}`, manifest.purpose)];
};

const studyUnits = RESOURCE_PACKAGE_REGISTRY.listCatalog().map((manifest, index) => {
  const slot = manifest.slots.includes("content") ? "content" : "response";
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
  const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: `instance-${index + 1}`,
    package: manifest.id,
    version: manifest.version,
    data: contract.contract.example
  }, slot);
  return {
    id: `gallery-${index + 1}`,
    position: index + 1,
    title: manifest.label,
    role: slot === "content" ? "theory" : "practice",
    content: slot === "content" ? [instance] : responseContent(manifest),
    response: slot === "response" ? instance : null,
    feedback: [paragraph(`feedback-${index + 1}`, manifest.accessibility)],
    topics: [],
  };
});

const project = {
  contract: "aralearn.course.v1",
  scope: "course",
  courses: [{
    id: "course-resources-gallery",
    title: "Galeria de packages",
    goal: "Demonstrar os packages instalados em Unidades de estudo válidas.",
    modules: [{
      id: "module-resources-gallery",
      title: "Representações canônicas",
      guide: { goal: "Comparar representações e interações disponíveis.", include: ["packages instalados"], exclude: [], notation: [], avoid: [] },
      lessons: [{
        id: "lesson-resources-gallery",
        title: "Uma Unidade de estudo por package",
        guide: { goal: "Inspecionar cada package em uma operação concreta.", include: ["catálogo de packages"], exclude: [], notation: [], avoid: [] },
        topics: [],
        microsequences: [{ id: "micro-resources-gallery", title: "Galeria completa", goal: "Percorrer os packages instalados.", role: "practice", dependsOn: [], covers: [], checks: ["renderização", "interação", "responsividade"], errors: [], studyUnits }]
      }]
    }]
  }]
};

const validation = validateProjectDocument(project);
if (!validation.ok) throw new Error(`Fixture de galeria inválida:\n${JSON.stringify(validation.errors, null, 2)}`);
const serialized = `${JSON.stringify(validation.value, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = fs.readFileSync(outputPath, "utf8").replace(/\r\n?/gu, "\n");
  if (current !== serialized) {
    throw new Error("Fixture da galeria desatualizada. Execute npm run resources:gallery:fixture.");
  }
  console.log(`Fixture da galeria está atualizada (${studyUnits.length} Unidades de estudo).`);
} else {
  fs.writeFileSync(outputPath, serialized, "utf8");
  console.log(`Galeria de packages gerada em ${outputPath} (${studyUnits.length} Unidades de estudo).`);
}
