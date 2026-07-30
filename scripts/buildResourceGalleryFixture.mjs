import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileAuthoringCardGaps } from "../src/core/authoringGaps.js";
import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import {
  getAuthoringResourceContract,
  listResourceIds
} from "../src/resources/registry/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(
  scriptDirectory,
  "../tests/fixtures/v4/project-resources-gallery.json"
);

const cards = listResourceIds().map((resource, index) => {
  const example = getAuthoringResourceContract(resource)?.example;
  if (!example) {
    throw new Error(`O recurso ${resource} não possui exemplo autoral canônico.`);
  }
  return compileAuthoringCardGaps({
    ...structuredClone(example),
    id: `gallery-${resource.replaceAll("_", "-")}`,
    position: index + 1,
    after: example.after || "Observe como a representação sustenta a operação didática."
  });
});

const project = {
  contract: "aralearn.contract",
  version: 4,
  kind: "project",
  courses: [{
    id: "course-resources-gallery",
    title: "Galeria de resources v4",
    goal: "Demonstrar os dezoito recursos canônicos em cards válidos.",
    modules: [{
      id: "module-resources-gallery",
      title: "Representações canônicas",
      guide: {
        goal: "Comparar representações e interações disponíveis.",
        include: ["resources v4"],
        exclude: [],
        notation: [],
        avoid: []
      },
      lessons: [{
        id: "lesson-resources-gallery",
        title: "Um card por resource",
        guide: {
          goal: "Inspecionar cada resource em uma operação didática concreta.",
          include: ["dezoito recursos"],
          exclude: [],
          notation: [],
          avoid: []
        },
        topics: [],
        microsequences: [{
          id: "micro-resources-gallery",
          title: "Galeria completa",
          goal: "Percorrer todos os recursos do contrato v4.",
          role: "practice",
          status: "generated",
          dependsOn: [],
          covers: listResourceIds(),
          checks: ["renderização", "interação", "responsividade"],
          cards
        }]
      }]
    }]
  }]
};

const validation = validateProjectDocument(project);
if (!validation.ok) {
  throw new Error(`Fixture de galeria inválida:\n${JSON.stringify(validation.errors, null, 2)}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
console.log(`Galeria v4 gerada em ${outputPath} (${cards.length} cards).`);
