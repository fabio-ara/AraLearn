import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateIntentV1Document } from "../src/contract/validateIntentV1.js";
import {
  DRAFT_COURSE_KEY,
  DRAFT_LESSON_KEY,
  DRAFT_MODULE_KEY,
  createCardInMicrosequence,
  createEditorSession,
  createMicrosequence,
  deleteCardInMicrosequence,
  ensureDraftCourse,
  isDraftPlaceholderMicrosequence,
  moveCardWithinMicrosequence,
  moveMicrosequence,
  replaceMicrosequenceCards,
  updateCourse,
  updateCardInMicrosequence,
  updateLesson,
  updateModule,
  updateMicrosequence
} from "../src/editor/microsequenceEditor.js";
import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readNormalizedProject(path) {
  const result = validateIntentV1Document(readJson(path));
  assert.equal(result.ok, true);
  return result.value;
}

test("cria microssequência nova dentro da lição sem gerar card solto", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = createMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    title: "Nova microssequência",
    objective: "Organizar um novo bloco didático"
  });

  const lesson = nextDocument.courses[0].modules[0].lessons[0];
  assert.equal(lesson.microsequences.length, 2);
  assert.equal(lesson.microsequences[1].title, "Nova microssequência");
  assert.equal(lesson.microsequences[1].cards.length, 1);
  assert.equal(lesson.microsequences[1].cards[0].intent, "text");
  assert.equal(lesson.microsequences[1].cards[0].title, "Novo card");
  assert.equal(lesson.microsequences[1].cards[0].data.blocks[0].kind, "heading");
  assert.equal(lesson.microsequences[1].cards[0].data.blocks[1].kind, "popup");
});

test("edita título e objetivo da microssequência", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");
  document.courses[0].modules[0].lessons[0].microsequences.push({
    key: "microsequence-segunda",
    title: "Microssequência revisada",
    objective: "Outra sequência",
    cards: [{ key: "card-segundo", title: "Card", intent: "text", data: { text: "ok" } }]
  });

  const nextDocument = updateMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Microssequência revisada",
    objective: "Apresentar o conceito com outro foco"
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.title, "Microssequência revisada (2)");
  assert.equal(microsequence.objective, "Apresentar o conceito com outro foco");
});

test("edita curso, módulo e lição sem quebrar o contrato", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextCourse = updateCourse(document, {
    courseKey: "course-curso-de-exemplo",
    title: "Curso revisado",
    description: "Descrição revisada"
  });
  assert.equal(nextCourse.courses[0].title, "Curso revisado");
  assert.equal(nextCourse.courses[0].description, "Descrição revisada");

  const nextModule = updateModule(nextCourse, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    title: "Módulo revisado",
    description: "Descrição do módulo"
  });
  assert.equal(nextModule.courses[0].modules[0].title, "Módulo revisado");
  assert.equal(nextModule.courses[0].modules[0].description, "Descrição do módulo");

  const nextLesson = updateLesson(nextModule, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    title: "Lição revisada"
  });
  assert.equal(nextLesson.courses[0].modules[0].lessons[0].title, "Lição revisada");
});

test("cria card apenas dentro de microssequência existente", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = createCardInMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Novo card",
    intent: "ask",
    data: {
      prompt: "Pergunta de teste"
    }
  });

  const cards = nextDocument.courses[0].modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards.length, 2);
  assert.equal(cards[1].intent, "ask");
  assert.equal(cards[1].data.prompt, "Pergunta de teste");
  assert.equal(cards[1].data.blocks[0].kind, "heading");
  assert.equal(cards[1].data.blocks[1].kind, "popup");
});

test("move card dentro da mesma microssequência", () => {
  const document = createCardInMicrosequence(readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json"), {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Segundo card",
    intent: "text",
    data: {
      text: "Outro texto"
    }
  });

  const movedDocument = moveCardWithinMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    cardKey: "card-segundo-card",
    toIndex: 0
  });

  const cards = movedDocument.courses[0].modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards[0].key, "card-segundo-card");
});

test("atualiza card existente sem quebrar o contrato", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = updateCardInMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    cardKey: "card-conceito-inicial",
    title: "Card revisado",
    data: {
      text: "Texto revisto"
    }
  });

  const card = nextDocument.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  assert.equal(card.title, "Card revisado");
  assert.equal(card.data.text, "Texto revisto");
});

test("remove card e preserva card inicial quando a microssequência ficaria vazia", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = deleteCardInMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    cardKey: "card-conceito-inicial"
  });

  const cards = nextDocument.courses[0].modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, "Novo card");
  assert.equal(cards[0].intent, "text");
  assert.equal(cards[0].data.blocks[0].kind, "heading");
  assert.equal(cards[0].data.blocks[1].kind, "popup");
});

test("substitui os cards da microssequência por resultado estruturado da API", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = replaceMicrosequenceCards(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Vetores",
    objective: "Introduzir vetores em passos curtos",
    tags: ["Álgebra linear", "Vetores"],
    cards: [
      {
        title: "Intuição",
        text: "Vetores representam direção e intensidade."
      },
      {
        title: "Operações",
        text: "Soma e multiplicação por escalar transformam vetores."
      }
    ]
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.title, "Vetores");
  assert.equal(microsequence.objective, "Introduzir vetores em passos curtos");
  assert.deepEqual(microsequence.tags, ["Álgebra linear", "Vetores"]);
  assert.equal(microsequence.cards.length, 2);
  assert.equal(microsequence.cards[0].title, "Intuição");
  assert.equal(microsequence.cards[0].data.text, "Vetores representam direção e intensidade.");
  assert.equal(microsequence.cards[1].data.blocks[0].kind, "heading");
});

test("move microssequência para outra lição sem invalidar a origem", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");
  document.courses[0].modules[0].lessons.push({
    key: "lesson-segunda-licao",
    title: "Segunda lição",
    microsequences: [
      {
        key: "microsequence-destino",
        title: "Destino",
        objective: "Receber novas microssequências",
        cards: [{ key: "card-destino", title: "Card destino", intent: "text", data: { text: "ok" } }]
      }
    ]
  });

  const nextDocument = moveMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    targetCourseKey: "course-curso-de-exemplo",
    targetModuleKey: "module-fundamentos",
    targetLessonKey: "lesson-segunda-licao"
  });

  const sourceLesson = nextDocument.courses[0].modules[0].lessons[0];
  const targetLesson = nextDocument.courses[0].modules[0].lessons[1];
  assert.equal(sourceLesson.microsequences.length, 1);
  assert.equal(targetLesson.microsequences.length, 2);
  assert.equal(targetLesson.microsequences[1].key, "microsequence-apresentar-o-primeiro-conceito");
});

test("aplica renomeações com fallback determinístico durante reposicionamento", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");
  document.courses[0].modules[0].lessons.push({
    key: "lesson-segunda-licao",
    title: "Segunda lição",
    microsequences: [
      {
        key: "microsequence-cascata",
        title: "Modelo cascata",
        objective: "Base",
        cards: [{ key: "card-a", title: "A", intent: "text", data: { text: "ok" } }]
      },
      {
        key: "microsequence-modelo-v",
        title: "Modelo em V",
        objective: "Base",
        cards: [{ key: "card-b", title: "B", intent: "text", data: { text: "ok" } }]
      }
    ]
  });

  const nextDocument = moveMicrosequence(document, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    targetCourseKey: "course-curso-de-exemplo",
    targetModuleKey: "module-fundamentos",
    targetLessonKey: "lesson-segunda-licao",
    targetPosition: 1,
    renames: [
      {
        microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
        title: "Modelo cascata"
      }
    ]
  });

  const targetLesson = nextDocument.courses[0].modules[0].lessons[1];
  assert.equal(targetLesson.microsequences[1].title, "Modelo cascata (2)");
});

test("garante curso especial de rascunhos para geração por API", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");
  const nextDocument = ensureDraftCourse(document);

  const draftCourse = nextDocument.courses.find((item) => item.key === DRAFT_COURSE_KEY);
  assert.ok(draftCourse);
  assert.equal(draftCourse.modules[0].key, DRAFT_MODULE_KEY);
  assert.equal(draftCourse.modules[0].lessons[0].key, DRAFT_LESSON_KEY);
  assert.equal(draftCourse.modules[0].lessons[0].microsequences.length, 3);
  assert.match(draftCourse.modules[0].lessons[0].microsequences[0].title, /Rascunho LLM/);
  assert.deepEqual(draftCourse.modules[0].lessons[0].microsequences[0].tags, ["Conjuntos", "Funções", "Tabela"]);
});

test("migra metadados do curso especial para o texto atual", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");
  document.courses.push({
    key: DRAFT_COURSE_KEY,
    title: "Novas microssequências",
    description: "Texto antigo",
    modules: [
      {
        key: DRAFT_MODULE_KEY,
        title: "Outro título",
        description: "Outra descrição",
        lessons: [
          {
            key: DRAFT_LESSON_KEY,
            title: "Outro nome",
            description: "Outra fila",
            microsequences: [
              {
                key: "microsequence-real",
                title: "Rascunho real",
                objective: "Objetivo",
                cards: [{ key: "card-1", title: "Card 1", intent: "text", data: { text: "ok" } }]
              }
            ]
          }
        ]
      }
    ]
  });

  const nextDocument = ensureDraftCourse(document);
  const draftCourse = nextDocument.courses.find((item) => item.key === DRAFT_COURSE_KEY);
  assert.equal(draftCourse.description, "Rascunhos gerados por LLM via API pendente de consolidação em cursos definitivos.");
  assert.equal(draftCourse.modules[0].title, "Fila de geração");
  assert.equal(draftCourse.modules[0].lessons[0].title, "Rascunhos por API");
});

test("identifica placeholder de geração mas não oculta microssequência já materializada", () => {
  assert.equal(
    isDraftPlaceholderMicrosequence({
      objective: "Organizar o próximo bloco didático"
    }),
    true
  );

  assert.equal(
    isDraftPlaceholderMicrosequence({
      title: "Nova microssequência",
      objective: "Organizar o próximo bloco didático"
    }),
    true
  );

  assert.equal(
    isDraftPlaceholderMicrosequence({
      title: "Rascunho LLM · Matrizes",
      objective: "Introduzir matrizes em passos curtos"
    }),
    false
  );
});

test("sessão de edição persiste alterações simples no storage do projeto", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  projectStorage.saveProject(readJson("./docs/examples/aralearn-intent-v1.valid.json"));

  const session = createEditorSession(projectStorage);
  session.createCard({
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Card persistido",
    intent: "text",
    data: {
      text: "Persistido"
    }
  });

  const loadedProject = projectStorage.loadProject();
  const cards = loadedProject.courses[0].modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards.length, 2);
  assert.equal(cards[1].title, "Card persistido");
});
