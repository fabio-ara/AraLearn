import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";

function canonicalProject() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Curso A",
        goal: "Ensinar o recorte A.",
        modules: [
          {
            id: "module-a",
            title: "Módulo A",
            guide: {
              goal: "Delimitar o módulo.",
              include: ["conceito A"],
              exclude: [],
              notation: [],
              avoid: []
            },
            lessons: [
              {
                id: "lesson-a",
                title: "Lição A",
                guide: {
                  goal: "Delimitar a lição.",
                  include: ["conceito A"],
                  exclude: [],
                  notation: [],
                  avoid: []
                },
                topics: [
                  {
                    id: "topic-a",
                    label: "Conceito A",
                    kind: "concept",
                    checks: ["reconhecer A"],
                    errors: ["confundir A com B"]
                  }
                ],
                microsequences: [
                  {
                    id: "micro-a",
                    title: "Microssequência A",
                    goal: "Explicar A.",
                    role: "explain",
                    status: "ready",
                    dependsOn: [],
                    covers: ["conceito A"],
                    checks: ["reconhecer A"],
                    errors: ["aplicar B no lugar de A"],
                    cards: [
                      {
                        id: "card-a",
                        position: 1,
                        resource: "paragraph",
                        kind: "theory",
                        exercise: "none",
                        title: "Conceito A",
                        text: "A é apresentado aqui.",
                        after: "A foi apresentado."
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function nested(project) {
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const topic = lesson.topics[0];
  const microsequence = lesson.microsequences[0];
  const card = microsequence.cards[0];
  return { course, moduleValue, lesson, topic, microsequence, card };
}

function errorText(result) {
  return (result.errors || []).map((error) => `${error.path}: ${error.message}`).join("\n");
}

test("a fronteira aceita somente propriedades canônicas", () => {
  const cases = [
    ["campo desconhecido na raiz", (project) => { project.metadata = {}; }, /\$\.metadata: Campo fora do schema/],
    ["campo desconhecido no curso", (project) => { nested(project).course.owner = "Equipe"; }, /\.owner: Campo fora do schema/],
    ["campo desconhecido no módulo", (project) => { nested(project).moduleValue.notes = []; }, /\.notes: Campo fora do schema/],
    ["campo desconhecido na lição", (project) => { nested(project).lesson.metadata = {}; }, /\.metadata: Campo fora do schema/],
    ["campo desconhecido no guide", (project) => { nested(project).lesson.guide.notes = ""; }, /\.notes: Campo fora do schema/],
    ["campo desconhecido no topic", (project) => { nested(project).topic.weight = 1; }, /\.weight: Campo fora do schema/],
    ["campo desconhecido na microssequência", (project) => { nested(project).microsequence.tags = []; }, /\.tags: Campo fora do schema/]
  ];

  cases.forEach(([label, mutate, expected]) => {
    const project = canonicalProject();
    mutate(project);
    const result = validateProjectDocument(project);
    assert.equal(result.ok, false, label);
    assert.match(errorText(result), expected, label);
  });
});

test("a fronteira exige ids explícitos em todos os níveis, inclusive no card", () => {
  const cases = [
    ["course", (project) => delete nested(project).course.id],
    ["module", (project) => delete nested(project).moduleValue.id],
    ["lesson", (project) => delete nested(project).lesson.id],
    ["topic", (project) => delete nested(project).topic.id],
    ["microsequence", (project) => delete nested(project).microsequence.id],
    ["card", (project) => delete nested(project).card.id]
  ];

  cases.forEach(([entityName, mutate]) => {
    const project = canonicalProject();
    mutate(project);
    const result = validateProjectDocument(project);
    assert.equal(result.ok, false, entityName);
    assert.match(errorText(result), new RegExp(`${entityName}\\.id`), entityName);
  });
});

test("a fronteira rejeita ids duplicados entre entidades irmãs", () => {
  const cases = [
    ["course", (project) => project.courses.push(structuredClone(project.courses[0]))],
    ["module", (project) => nested(project).course.modules.push(structuredClone(nested(project).moduleValue))],
    ["lesson", (project) => nested(project).moduleValue.lessons.push(structuredClone(nested(project).lesson))],
    ["topic", (project) => nested(project).lesson.topics.push(structuredClone(nested(project).topic))],
    ["microsequence", (project) => nested(project).lesson.microsequences.push(structuredClone(nested(project).microsequence))],
    ["card", (project) => {
      const duplicateContainer = structuredClone(nested(project).microsequence);
      duplicateContainer.id = "micro-b";
      nested(project).lesson.microsequences.push(duplicateContainer);
    }]
  ];

  cases.forEach(([entityName, mutate]) => {
    const project = canonicalProject();
    mutate(project);
    const result = validateProjectDocument(project);
    assert.equal(result.ok, false, entityName);
    assert.match(errorText(result), /id duplicado/, entityName);
  });
});

test("ids de lição são únicos entre módulos e informam as duas ocorrências", () => {
  const project = canonicalProject();
  const secondModule = structuredClone(nested(project).moduleValue);
  secondModule.id = "module-b";
  secondModule.title = "Módulo B";
  secondModule.lessons[0].topics[0].id = "topic-b";
  secondModule.lessons[0].microsequences[0].id = "micro-b";
  secondModule.lessons[0].microsequences[0].cards[0].id = "card-b";
  project.courses[0].modules.push(secondModule);

  const result = validateProjectDocument(project);
  const duplicate = result.errors.find((error) =>
    error.path === "$.courses[0].modules[1].lessons[0].id"
  );

  assert.equal(result.ok, false);
  assert.match(duplicate?.message || "", /id de lesson duplicado em todo o curso/u);
  assert.match(
    duplicate?.message || "",
    /primeira ocorrência em \$\.courses\[0\]\.modules\[0\]\.lessons\[0\]\.id/u
  );
});

test("ids estruturais podem se repetir entre cursos independentes", () => {
  const project = canonicalProject();
  const secondCourse = structuredClone(project.courses[0]);
  secondCourse.id = "course-b";
  secondCourse.title = "Curso B";
  project.courses.push(secondCourse);

  const result = validateProjectDocument(project);

  assert.equal(result.ok, true, errorText(result));
});

test("topic.kind inválido é rejeitado em vez de virar concept", () => {
  const project = canonicalProject();
  nested(project).topic.kind = "skill";

  const result = validateProjectDocument(project);

  assert.equal(result.ok, false);
  assert.match(errorText(result), /topic\.kind inválido: "skill"/);
});

test("microsequence.errors pertence ao contrato e é preservado", () => {
  const result = validateProjectDocument(canonicalProject());

  assert.equal(result.ok, true, errorText(result));
  assert.deepEqual(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].errors,
    ["aplicar B no lugar de A"]
  );
});

test("dependsOn referencia somente pré-requisitos anteriores da mesma lição e não forma ciclo", () => {
  function appendMicrosequence(project, id, dependsOn = []) {
    const copy = structuredClone(nested(project).microsequence);
    copy.id = id;
    copy.title = id;
    copy.dependsOn = dependsOn;
    copy.cards[0].id = `card-${id}`;
    nested(project).lesson.microsequences.push(copy);
    return copy;
  }

  const valid = canonicalProject();
  appendMicrosequence(valid, "micro-b", ["micro-a"]);
  const validResult = validateProjectDocument(valid);
  assert.equal(validResult.ok, true, errorText(validResult));

  const cases = [
    {
      label: "identidade ausente",
      mutate(project) {
        nested(project).microsequence.dependsOn = ["micro-ausente"];
      },
      expected: /Dependência inexistente na mesma lição/u
    },
    {
      label: "autorreferência",
      mutate(project) {
        nested(project).microsequence.dependsOn = ["micro-a"];
      },
      expected: /não pode depender de si mesma/u
    },
    {
      label: "pré-requisito posterior",
      mutate(project) {
        appendMicrosequence(project, "micro-b");
        nested(project).microsequence.dependsOn = ["micro-b"];
      },
      expected: /microssequência anterior/u
    },
    {
      label: "ciclo",
      mutate(project) {
        appendMicrosequence(project, "micro-b", ["micro-a"]);
        nested(project).microsequence.dependsOn = ["micro-b"];
      },
      expected: /não pode formar ciclo/u
    }
  ];

  cases.forEach(({ label, mutate, expected }) => {
    const project = canonicalProject();
    mutate(project);
    const result = validateProjectDocument(project);
    assert.equal(result.ok, false, label);
    assert.match(errorText(result), expected, label);
  });
});

test("estruturas internas desconhecidas não desaparecem durante a normalização", () => {
  const project = canonicalProject();
  nested(project).microsequence.cards[0] = {
    layout: "auto",
    id: "card-graph",
    position: 1,
    resource: "graph",
    kind: "theory",
    exercise: "none",
    title: "Grafo",
    prompt: "Observe.",
    vertices: [
      { id: "A", label: "A", color: "red" },
      { id: "B", label: "B" }
    ],
    edges: [{ id: "edge-1", from: "A", to: "B" }],
    after: "Os vértices estão ligados."
  };

  const result = validateProjectDocument(project);

  assert.equal(result.ok, false);
  assert.match(errorText(result), /vertices\[0\]\.color: Campo fora do schema/u);
});

test("tree rejeita pai inexistente, autorreferência e ciclo", () => {
  const cases = [
    {
      label: "pai inexistente",
      nodes: [
        { id: "root", label: "Raiz", type: "folder", parentId: null },
        { id: "child", label: "Filho", type: "file", parentId: "missing" }
      ],
      expected: /Nó pai inexistente/u
    },
    {
      label: "autorreferência",
      nodes: [{ id: "root", label: "Raiz", type: "folder", parentId: "root" }],
      expected: /pai de si mesmo/u
    },
    {
      label: "ciclo",
      nodes: [
        { id: "A", label: "A", type: "folder", parentId: "B" },
        { id: "B", label: "B", type: "folder", parentId: "A" }
      ],
      expected: /não pode conter ciclo/u
    }
  ];

  for (const { label, nodes, expected } of cases) {
    const project = canonicalProject();
    nested(project).microsequence.cards[0] = {
      variant: "filesystem",
      id: "card-tree",
      position: 1,
      resource: "tree",
      kind: "theory",
      exercise: "none",
      title: "Árvore",
      prompt: "Observe.",
      nodes,
      after: "Estrutura hierárquica."
    };
    const result = validateProjectDocument(project);
    assert.equal(result.ok, false, label);
    assert.match(errorText(result), expected, label);
  }
});

test("as três fixtures de publicação satisfazem a fronteira estrita", async () => {
  const catalogDirectory = new URL("../../supabase/fixtures/catalog/", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL("catalog-fixtures.json", catalogDirectory), "utf8"));
  assert.equal(manifest.courseFiles.length, 3);

  let preservedMicrosequenceErrors = 0;
  for (const fileName of manifest.courseFiles) {
    const course = JSON.parse(await fs.readFile(new URL(fileName, catalogDirectory), "utf8"));
    const result = validateProjectDocument({
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [course]
    });
    assert.equal(result.ok, true, `${fileName}\n${errorText(result)}`);
    preservedMicrosequenceErrors += result.value.courses[0].modules
      .flatMap((moduleValue) => moduleValue.lessons)
      .flatMap((lesson) => lesson.microsequences)
      .filter((microsequence) => microsequence.errors.length > 0)
      .length;
  }
  assert.equal(preservedMicrosequenceErrors, 42);
});
