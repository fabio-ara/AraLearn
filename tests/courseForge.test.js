import test from "node:test";
import assert from "node:assert/strict";

import { resolveCourseForgeIntent } from "../src/generation/courseForge/courseForgeIntent.js";
import { resolveCourseForgeScope } from "../src/generation/courseForge/courseForgeScope.js";
import { resolveCourseForgePhases, resolveDeferredCourseForgePhases } from "../src/generation/courseForge/courseForgePhases.js";
import { createProviderRegistry } from "../src/generation/providers/providerRegistry.js";
import { PHASE_PROFILES, resolvePhaseProfile } from "../src/generation/modelProfiles/phaseProfiles.js";
import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { validateCourseForgeSourceLedger } from "../src/generation/courseForge/courseForgeSourceLedger.js";
import { validateCourseForgeCardSourceRefs } from "../src/generation/courseForge/courseForgeSourceRefs.js";
import { auditCourseForgeBackstageVocabulary } from "../src/generation/courseForge/courseForgeBackstageAudit.js";
import { compileCourseStructureToPatch, validateCourseForgePatch } from "../src/generation/courseForge/courseForgePatch.js";
import { createCourseForgeArtifactsStore } from "../src/generation/courseForge/courseForgeArtifacts.js";
import { canResumeCourseForgeRun, createCourseForgeRunState } from "../src/generation/courseForge/courseForgeRunState.js";
import { runCourseForgeQueue } from "../src/generation/courseForge/courseForgeQueue.js";
import { runCourseForge } from "../src/generation/courseForge/courseForgeRunner.js";
import { applyCourseForgePatch } from "../src/generation/courseForge/courseForgeApply.js";
import { mergeCourseForgeArchitectureAudits, validateCourseForgeArchitectureDraft } from "../src/generation/courseForge/courseForgeValidation.js";
import { getModelCapabilities } from "../src/generation/providers/modelCapabilities.js";

function createProject() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: []
  };
}

test("resolveCourseForgeIntent normaliza operação, escopo e anexos", () => {
  const result = resolveCourseForgeIntent({
    operation: "create",
    scope: { level: "course", courseKey: "curso-1" },
    promptText: " Curso de lógica ",
    attachments: [{ name: "ementa.pdf", type: "application/pdf" }]
  });

  assert.equal(result.operation, "create");
  assert.equal(result.scope.courseKey, "curso-1");
  assert.equal(result.attachments[0].name, "ementa.pdf");
  assert.equal(result.requestedGenerationDepth, "full_course");
  assert.equal(result.generationDepth, "full_course");
});

test("resolveCourseForgeIntent entende pedido de só estrutura", () => {
  const result = resolveCourseForgeIntent({
    scope: { level: "project" },
    promptText: "Quero só a estrutura, sem cards e sem atividades."
  });

  assert.equal(result.requestedGenerationDepth, "structure_only");
  assert.equal(result.generationDepth, "structure_only");
  assert.equal(result.operation, "create");
});

test("resolveCourseForgeIntent entende revisão local em conteúdo existente", () => {
  const result = resolveCourseForgeIntent({
    scope: { level: "course", courseKey: "course-logica" },
    promptText: "Revise este curso e corrija a estrutura.",
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [{ key: "course-logica", title: "Lógica", modules: [] }]
    }
  });

  assert.equal(result.operation, "repair");
  assert.equal(result.requestedGenerationDepth, "repair_only");
  assert.equal(result.contextSummary.targetExists, true);
});

test("resolveCourseForgeIntent prioriza geração completa quando o pedido de revisão menciona cards", () => {
  const result = resolveCourseForgeIntent({
    scope: {
      level: "microsequence",
      courseKey: "course-logica",
      moduleKey: "module-base",
      lessonKey: "lesson-1",
      microsequenceKey: "micro-1"
    },
    promptText: "Revise esta microssequência e gere cards prontos para estudar.",
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logica",
          title: "Lógica",
          modules: [
            {
              key: "module-base",
              title: "Base",
              lessons: [
                {
                  key: "lesson-1",
                  title: "Lição 1",
                  microsequences: [{ key: "micro-1", title: "Revisão", status: "draft", included: false, cards: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.operation, "repair");
  assert.equal(result.requestedGenerationDepth, "full_course");
  assert.equal(result.generationDepth, "full_course");
});

test("resolveCourseForgeScope preserva escopo selecionado", () => {
  const result = resolveCourseForgeScope({
    scope: { level: "lesson", courseKey: "c1", moduleKey: "m1", lessonKey: "l1" }
  });
  assert.deepEqual(result, {
    level: "lesson",
    courseKey: "c1",
    moduleKey: "m1",
    lessonKey: "l1",
    microsequenceKey: ""
  });
});

test("providerRegistry registra provider falso", () => {
  const provider = createFakeProvider();
  const registry = createProviderRegistry({ providers: [provider] });
  assert.equal(registry.get("fake").id, "fake");
});

test("phaseProfiles resolve perfis esperados", () => {
  assert.equal(PHASE_PROFILES.architecture_plan.reasoning, "high");
  assert.equal(resolvePhaseProfile("index_sources").temperature, 0);
});

test("phase resolution escolhe subfluxo estrutural e registra fases adiadas", () => {
  const structureIntent = resolveCourseForgeIntent({
    scope: { level: "project" },
    promptText: "Só estrutura."
  });
  const fullIntent = resolveCourseForgeIntent({
    scope: { level: "project" },
    promptText: "Quero o curso completo, pronto para estudar."
  });
  const microsequenceIntent = resolveCourseForgeIntent({
    scope: { level: "microsequence", courseKey: "c1", moduleKey: "m1", lessonKey: "l1", microsequenceKey: "ms1" },
    promptText: "Quero o curso completo, pronto para estudar."
  });

  assert.deepEqual(resolveCourseForgePhases(structureIntent), [
    "normalize_intent",
    "index_sources",
    "plan_architecture",
    "audit_architecture",
    "repair_architecture",
    "compile_patch",
    "validate_patch",
    "apply_patch",
    "final_report"
  ]);
  assert.ok(resolveCourseForgePhases(fullIntent).includes("plan_microsequences"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("repair_microsequences"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("repair_card_adherence"));
  assert.ok(resolveCourseForgePhases(microsequenceIntent).includes("build_microsequence_contract"));
  assert.ok(resolveCourseForgePhases(microsequenceIntent).includes("compile_patch"));
  const lessonIntent = resolveCourseForgeIntent({
    scope: { level: "lesson", courseKey: "c1", moduleKey: "m1", lessonKey: "l1" },
    promptText: "Quero o curso completo, pronto para estudar."
  });
  const moduleIntent = resolveCourseForgeIntent({
    scope: { level: "module", courseKey: "c1", moduleKey: "m1" },
    promptText: "Quero o curso completo, pronto para estudar."
  });
  const courseIntent = resolveCourseForgeIntent({
    scope: { level: "course", courseKey: "c1" },
    promptText: "Quero o curso completo, pronto para estudar."
  });
  assert.ok(resolveCourseForgePhases(lessonIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(lessonIntent).includes("plan_architecture"));
  assert.ok(resolveCourseForgePhases(moduleIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(moduleIntent).includes("plan_architecture"));
  assert.ok(resolveCourseForgePhases(courseIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(courseIntent).includes("plan_architecture"));
  const repairLessonIntent = resolveCourseForgeIntent({
    scope: { level: "lesson", courseKey: "c1", moduleKey: "m1", lessonKey: "l1" },
    promptText: "Revise esta lição."
  });
  const repairMicrosequenceIntent = resolveCourseForgeIntent({
    scope: { level: "microsequence", courseKey: "c1", moduleKey: "m1", lessonKey: "l1", microsequenceKey: "ms1" },
    promptText: "Revise esta microssequência."
  });
  assert.ok(resolveCourseForgePhases(repairLessonIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(repairLessonIntent).includes("plan_architecture"));
  assert.ok(resolveCourseForgePhases(repairMicrosequenceIntent).includes("build_microsequence_contract"));
  assert.ok(!resolveCourseForgePhases(repairMicrosequenceIntent).includes("plan_architecture"));
  assert.equal(resolveDeferredCourseForgePhases(fullIntent).length, 0);
});

test("modelCapabilities expõe campos antigos e novos", () => {
  const model = getModelCapabilities("gemini-2.5-flash");
  assert.equal(model.supportsJsonMode, true);
  assert.equal(model.supportsResponseJsonSchema, true);
  assert.equal(model.family, "gemini");
});

test("fakeProvider devolve resposta roteada por fase", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [{ architectureDraft: { ok: true } }]
    }
  });
  const result = await provider.callJson({ phaseId: "plan_architecture" });
  assert.equal(result.value.architectureDraft.ok, true);
});

test("sourceLedger valida ids duplicados", () => {
  const result = validateCourseForgeSourceLedger([
    { id: "src_1", title: "A" },
    { id: "src_1", title: "B" }
  ]);
  assert.equal(result.ok, false);
});

test("card sourceRefs bloqueia sourceId inexistente", () => {
  const result = validateCourseForgeCardSourceRefs(
    [{ sourceId: "src_2", confidence: "high" }],
    [{ id: "src_1", title: "Fonte 1" }]
  );
  assert.equal(result.ok, false);
});

test("backstage vocabulary auditor detecta jargão visível", () => {
  const result = auditCourseForgeBackstageVocabulary({
    card: { title: "Pipeline", say: "Este pipeline usa JSON." },
    lessonContext: { title: "Lógica proposicional" }
  });
  assert.equal(result.ok, false);
});

test("arquitetura local detecta bastidor e falta de governança mínima", () => {
  const result = validateCourseForgeArchitectureDraft({
    architectureDraft: {
      course: {
        title: "Pipeline do curso",
        modules: [
          {
            title: "Módulo 1",
            lessons: [{ title: "Lição sem guia", description: "Resumo." }]
          }
        ]
      }
    },
    sourceLedger: [{ id: "src_1", title: "Ementa" }],
    scope: { level: "project" }
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockingIssues.some((item) => item.type === "backstage_vocabulary"));
  assert.ok(result.blockingIssues.some((item) => item.type === "source_gap"));
});

test("merge de auditorias preserva reprovação se qualquer auditoria bloquear", () => {
  const result = mergeCourseForgeArchitectureAudits(
    { approved: true, blockingIssues: [], warnings: [] },
    { approved: false, blockingIssues: [{ target: "course", type: "too_broad" }], warnings: [] }
  );

  assert.equal(result.approved, false);
  assert.equal(result.blockingIssues.length, 1);
});

test("patch validation bloqueia operação fora do escopo", () => {
  const patch = {
    patchType: "aralearn.structure.patch.v1",
    target: { courseKey: "curso-a" },
    operations: [{ op: "update_course", courseKey: "curso-b", course: { title: "Novo" } }]
  };
  const result = validateCourseForgePatch(patch, {
    intent: resolveCourseForgeIntent({ operation: "repair", scope: { level: "course", courseKey: "curso-a" } })
  });
  assert.equal(result.ok, false);
});

test("applyCourseForgePatch cria curso e módulo em memória", () => {
  const patch = {
    patchType: "aralearn.structure.patch.v1",
    target: { level: "project" },
    operations: [
      { op: "add_course", course: { key: "course-logica", title: "Lógica" } },
      { op: "add_module", courseKey: "course-logica", module: { key: "module-base", title: "Base" } }
    ]
  };
  const result = applyCourseForgePatch(createProject(), patch, {
    intent: resolveCourseForgeIntent({ operation: "create", scope: { level: "project" } })
  });
  assert.equal(result.courses[0].modules[0].title, "Base");
});

test("run state persiste e permite retomada", () => {
  const store = createCourseForgeArtifactsStore();
  const runState = createCourseForgeRunState({
    intent: resolveCourseForgeIntent({ operation: "create", scope: { level: "project" } }),
    phases: ["normalize_intent", "plan_architecture"]
  });
  runState.phases[1].status = "failed";
  store.saveRun(runState.runId, { runState });
  assert.equal(canResumeCourseForgeRun(store.loadRun(runState.runId).runState), true);
});

test("queue preserva falha parcial sem apagar resultados válidos", async () => {
  const result = await runCourseForgeQueue(
    [
      async () => 1,
      async () => {
        throw new Error("falhou");
      },
      async () => 3
    ],
    { maxConcurrency: 2, stopOnError: false }
  );
  assert.equal(result.ok, false);
  assert.equal(result.results[0].value, 1);
  assert.equal(result.results[2].value, 3);
});

test("top-down com fake provider gera curso completo em memória", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        {
          course: {
            key: "course-logica",
            title: "Lógica",
            description: "Curso.",
            modules: [
              {
                key: "module-proposicoes",
                title: "Proposições",
                description: "Módulo.",
                lessons: [
                  {
                    key: "lesson-introducao",
                    title: "Introdução",
                    description: "Lição.",
                    sourceGuideStructured: {
                      lessonGoal: "Ler proposições.",
                      notationRules: "Usar `p` e `q`.",
                      commonErrors: "Confundir frase e proposição."
                    },
                    presetId: "default",
                    resourceTags: ["paragraph", "multiple_choice"],
                    contentTypeTags: ["theory"],
                    learningActionTags: ["read"],
                    supportLevel: "guided",
                    microsequences: []
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [
        {
          approved: true,
          blockingIssues: [],
          warnings: []
        }
      ],
      plan_lessons: [
        {
          lessonPlans: [
            {
              courseKey: "course-logica",
              moduleKey: "module-proposicoes",
              lessonKey: "lesson-introducao",
              lessonTitle: "Introdução",
              lessonDescription: "Lição.",
              sourceGuideStructured: {
                lessonGoal: "Ler proposições.",
                notationRules: "Usar `p` e `q`.",
                commonErrors: "Confundir frase e proposição."
              },
              presetId: "default",
              resourceTags: ["paragraph", "multiple_choice"],
              contentTypeTags: ["theory"],
              learningActionTags: ["read"],
              supportLevel: "guided"
            }
          ]
        }
      ],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-introducao",
              moduleKey: "module-proposicoes",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-leitura-inicial",
                  title: "Leitura inicial de proposições",
                  objective: "Reconhecer enunciados como proposições.",
                  coverageRole: "core",
                  didacticPurpose: "Preparar a leitura formal básica.",
                  tags: ["Leitura"],
                  domainRefs: ["domain-1"]
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [
        {
          approved: true,
          issues: [],
          warnings: []
        }
      ],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "O que é uma proposição",
              text: "Uma proposição é um enunciado que pode ser classificado como verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo guiado",
              text: "A frase `2 + 2 = 4` é proposição porque admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Reconhecendo proposições",
              question: "Qual enunciado é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "Só `2 + 2 = 4` pode ser classificado como verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Criar curso de lógica.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  assert.equal(result.projectDocument.courses[0].title, "Lógica");
  assert.equal(result.patch.operations.some((item) => item.op === "add_microsequence"), true);
  assert.equal(result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0].status, "ready");
  assert.equal(result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0].included, true);
  assert.equal(result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0].cards.length, 3);
  const finalReport = result.artifacts.find((item) => item.name === "final-report");
  assert.equal(finalReport.content.executedGenerationDepth, "full_course");
  assert.equal(finalReport.content.deferredGenerationDepth, "");
  assert.equal(finalReport.content.deferredPhases.length, 0);
});

test("audit_architecture reprovada aciona repair_architecture e aplica versão corrigida", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        {
          course: {
            key: "course-logica",
            title: "Pipeline de lógica",
            modules: [
              {
                key: "module-base",
                title: "Módulo base",
                lessons: [
                  {
                    key: "lesson-base",
                    title: "Lição sem guia",
                    description: "Resumo"
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [
        {
          approved: false,
          blockingIssues: [
            {
              target: "course",
              type: "backstage_vocabulary",
              severity: "blocking",
              evidence: "Título do curso expõe bastidor.",
              requiredFix: "Reescrever."
            }
          ],
          warnings: []
        }
      ],
      repair_architecture: [
        {
          architectureFinal: {
            course: {
              key: "course-logica",
              title: "Lógica",
              description: "Curso.",
              modules: [
                {
                  key: "module-base",
                  title: "Módulo base",
                  description: "Módulo.",
                  lessons: [
                    {
                      key: "lesson-base",
                      title: "Introdução",
                      description: "Lição.",
                      sourceGuideStructured: {
                        lessonGoal: "Ler proposições.",
                        notationRules: "Usar `p` e `q`.",
                        commonErrors: "Confundir frase e proposição."
                      },
                      presetId: "default",
                      resourceTags: ["paragraph"],
                      contentTypeTags: ["theory"],
                      learningActionTags: ["read"],
                      supportLevel: "guided"
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Quero só a estrutura."
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  assert.equal(result.projectDocument.courses[0].title, "Lógica");
  const auditArtifact = result.artifacts.find((item) => item.name === "architecture-audit");
  const finalArtifact = result.artifacts.find((item) => item.name === "architecture-final");
  assert.equal(auditArtifact.content.approved, false);
  assert.equal(finalArtifact.content.course.title, "Lógica");
});

test("top-down salva run parcial e retoma depois de falha", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        { throw: new Error("falha transitória") },
        {
          course: {
            key: "course-rede",
            title: "Redes",
            description: "Curso.",
            modules: [
              {
                key: "module-intro",
                title: "Introdução",
                description: "Módulo.",
                lessons: [
                  {
                    key: "lesson-base",
                    title: "Conceitos iniciais",
                    description: "Lição.",
                    sourceGuideStructured: {
                      lessonGoal: "Entender noções básicas de redes.",
                      notationRules: "Usar nomes simples para host e rede.",
                      commonErrors: "Confundir internet com rede local."
                    },
                    presetId: "default",
                    resourceTags: ["paragraph", "multiple_choice"],
                    contentTypeTags: ["theory"],
                    learningActionTags: ["read"],
                    supportLevel: "guided"
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [
        {
          approved: true,
          blockingIssues: [],
          warnings: []
        }
      ],
      plan_lessons: [
        {
          lessonPlans: [
            {
              courseKey: "course-rede",
              moduleKey: "module-intro",
              lessonKey: "lesson-base",
              lessonTitle: "Conceitos iniciais",
              lessonDescription: "Lição.",
              sourceGuideStructured: {
                lessonGoal: "Entender noções básicas de redes.",
                notationRules: "Usar nomes simples para host e rede.",
                commonErrors: "Confundir internet com rede local."
              },
              presetId: "default",
              resourceTags: ["paragraph", "multiple_choice"],
              contentTypeTags: ["theory"],
              learningActionTags: ["read"],
              supportLevel: "guided"
            }
          ]
        }
      ],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-base",
              moduleKey: "module-intro",
              courseKey: "course-rede",
              microsequences: [
                {
                  key: "microsequence-visao-geral",
                  title: "Visão geral de redes",
                  objective: "Diferenciar rede local e internet.",
                  coverageRole: "core"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [
        {
          approved: true,
          issues: [],
          warnings: []
        }
      ],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Rede local e internet",
              text: "Rede local conecta dispositivos de um mesmo ambiente; internet interliga redes.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo rápido",
              text: "Os computadores de uma escola podem formar uma rede local.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Classificação",
              question: "Qual opção descreve melhor a internet?",
              options: [
                { optionId: "a", label: "Uma única rede doméstica." },
                { optionId: "b", label: "Um conjunto de redes interligadas." },
                { optionId: "c", label: "Um cabo entre dois computadores." }
              ],
              correctOptionId: "b",
              feedback: "A internet conecta várias redes entre si.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const store = createCourseForgeArtifactsStore();
  let runId = "";

  await assert.rejects(
    async () => {
      await runCourseForge({
        intent: {
          operation: "create",
          scope: { level: "project" },
          promptText: "Quero só a estrutura do curso de redes",
          attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
        },
        projectDocument: createProject(),
        providerRegistry: registry,
        providerId: "fake",
        artifactStore: store
      });
    },
    (error) => {
      runId = error.runId;
      assert.equal(error.runState.status, "partial_failure");
      return true;
    }
  );

  const resumed = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Quero só a estrutura do curso de redes",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake",
    artifactStore: store,
    resumeRunId: runId
  });

  assert.equal(resumed.projectDocument.courses[0].title, "Redes");
});

test("compileCourseStructureToPatch converte arquitetura em operações", () => {
  const patch = compileCourseStructureToPatch({
    intent: resolveCourseForgeIntent({ operation: "create", scope: { level: "project" } }),
    architectureDraft: {
      course: {
        key: "course-1",
        title: "Curso 1",
        modules: [{ key: "module-1", title: "Módulo 1", lessons: [{ key: "lesson-1", title: "Lição 1" }] }],
        microsequencePlans: []
      }
    }
  });
  assert.equal(patch.operations[0].op, "add_course");
  assert.equal(patch.operations[1].op, "add_module");
});

test("compileCourseStructureToPatch inclui microssequências planejadas", () => {
  const patch = compileCourseStructureToPatch({
    intent: resolveCourseForgeIntent({ operation: "create", scope: { level: "project" } }),
    architectureDraft: {
      course: {
        key: "course-1",
        title: "Curso 1",
        modules: [{ key: "module-1", title: "Módulo 1", lessons: [{ key: "lesson-1", title: "Lição 1" }] }]
      },
      microsequencePlans: [
        {
          lessonKey: "lesson-1",
          microsequences: [
            {
              key: "micro-1",
              title: "Introdução",
              objective: "Objetivo.",
              coverageRole: "core"
            }
          ]
        }
      ]
    }
  });

  assert.equal(patch.operations.some((item) => item.op === "add_microsequence"), true);
});

test("compileCourseStructureToPatch inclui cards públicos quando disponíveis", () => {
  const patch = compileCourseStructureToPatch({
    intent: resolveCourseForgeIntent({ operation: "create", scope: { level: "project" } }),
    architectureDraft: {
      course: {
        key: "course-1",
        title: "Curso 1",
        modules: [{ key: "module-1", title: "Módulo 1", lessons: [{ key: "lesson-1", title: "Lição 1" }] }]
      },
      microsequencePlans: [
        {
          courseKey: "course-1",
          moduleKey: "module-1",
          lessonKey: "lesson-1",
          microsequences: [
            {
              key: "micro-1",
              title: "Introdução",
              objective: "Objetivo.",
              coverageRole: "core",
              publicCards: [{ title: "Card", say: "Texto." }]
            }
          ]
        }
      ]
    }
  });

  const operation = patch.operations.find((item) => item.op === "add_microsequence");
  assert.equal(operation.microsequence.status, "ready");
  assert.equal(operation.microsequence.included, true);
  assert.equal(operation.microsequence.cards.length, 1);
});

test("compileCourseStructureToPatch atualiza entidades existentes no escopo local", () => {
  const patch = compileCourseStructureToPatch({
    intent: resolveCourseForgeIntent({
      operation: "repair",
      scope: { level: "course", courseKey: "course-1" }
    }),
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-1",
          title: "Curso antigo",
          description: "Descrição antiga.",
          modules: [
            {
              key: "module-1",
              title: "Módulo antigo",
              lessons: [
                {
                  key: "lesson-1",
                  title: "Lição antiga",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    architectureDraft: {
      course: {
        key: "course-1",
        title: "Curso revisado",
        description: "Descrição nova.",
        modules: [
          {
            key: "module-1",
            title: "Módulo revisado",
            lessons: [
              {
                key: "lesson-1",
                title: "Lição revisada",
                description: "Agora com resumo.",
                sourceGuideStructured: {
                  lessonGoal: "Entender o básico.",
                  notationRules: "Usar notação simples.",
                  commonErrors: "Evitar atalhos."
                },
                presetId: "default",
                resourceTags: ["paragraph"],
                contentTypeTags: ["theory"],
                learningActionTags: ["read"],
                supportLevel: "guided",
                microsequences: []
              }
            ]
          }
        ]
      }
    }
  });

  assert.deepEqual(
    patch.operations.map((item) => item.op),
    ["update_course", "update_module", "update_lesson"]
  );
});

test("compileCourseStructureToPatch atualiza microssequência existente e troca seus cards", () => {
  const patch = compileCourseStructureToPatch({
    intent: resolveCourseForgeIntent({
      operation: "repair",
      scope: {
        level: "lesson",
        courseKey: "course-1",
        moduleKey: "module-1",
        lessonKey: "lesson-1"
      }
    }),
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-1",
          title: "Curso 1",
          modules: [
            {
              key: "module-1",
              title: "Módulo 1",
              lessons: [
                {
                  key: "lesson-1",
                  title: "Lição 1",
                  sourceGuideStructured: {
                    lessonGoal: "Objetivo antigo.",
                    notationRules: "Notação antiga.",
                    commonErrors: "Erro antigo."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: [
                    {
                      key: "micro-1",
                      title: "Microssequência antiga",
                      status: "draft",
                      included: false,
                      cards: []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    architectureDraft: {
      course: {
        key: "course-1",
        title: "Curso 1",
        modules: [
          {
            key: "module-1",
            title: "Módulo 1",
            lessons: [
              {
                key: "lesson-1",
                title: "Lição 1",
                sourceGuideStructured: {
                  lessonGoal: "Objetivo novo.",
                  notationRules: "Notação nova.",
                  commonErrors: "Erro novo."
                },
                presetId: "default",
                resourceTags: ["paragraph"],
                contentTypeTags: ["theory"],
                learningActionTags: ["read"],
                supportLevel: "guided",
                microsequences: []
              }
            ]
          }
        ]
      },
      microsequencePlans: [
        {
          courseKey: "course-1",
          moduleKey: "module-1",
          lessonKey: "lesson-1",
          microsequences: [
            {
              key: "micro-1",
              title: "Microssequência revisada",
              objective: "Objetivo novo.",
              coverageRole: "core",
              publicCards: [{ title: "Card novo", say: "Texto novo." }]
            }
          ]
        }
      ]
    }
  });

  assert.deepEqual(
    patch.operations.map((item) => item.op),
    ["update_course", "update_module", "update_lesson", "update_microsequence", "replace_microsequence_cards"]
  );
  const replaceOperation = patch.operations.find((item) => item.op === "replace_microsequence_cards");
  assert.equal(replaceOperation.microsequence.cards.length, 1);
});

test("top-down em escopo de microssequência recompõe cards na microssequência existente", async () => {
  const provider = createFakeProvider({
    script: {
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Revisão curta",
              text: "Uma proposição admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo curto",
              text: "`2 + 2 = 4` é proposição porque pode ser verdadeira ou falsa.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Checagem",
              question: "Qual frase é proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "repair",
      scope: {
        level: "microsequence",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes",
        microsequenceKey: "microsequence-revisao"
      },
      promptText: "Atualize esta microssequência com cards prontos.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logica",
          title: "Lógica",
          modules: [
            {
              key: "module-base",
              title: "Base",
              lessons: [
                {
                  key: "lesson-proposicoes",
                  title: "Proposições",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Reconhecer proposições.",
                    notationRules: "Usar `p` e `q`.",
                    commonErrors: "Confundir pergunta com proposição."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: [
                    {
                      key: "microsequence-revisao",
                      title: "Revisão",
                      description: "Resumo inicial.",
                      didacticPurpose: "Revisar conceito.",
                      coverageRole: "explain",
                      status: "draft",
                      included: false,
                      cards: []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    providerRegistry: registry,
    providerId: "fake"
  });

  const microsequence = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.cards.length, 3);
  assert.equal(microsequence.status, "ready");
  assert.equal(microsequence.included, true);
  assert.ok(result.patch.operations.some((item) => item.op === "replace_microsequence_cards"));
});

test("top-down em escopo de lição gera microssequências e cards sem depender de arquitetura nova", async () => {
  const provider = createFakeProvider({
    script: {
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-proposicoes",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-reconhecimento",
                  title: "Reconhecimento inicial",
                  objective: "Distinguir proposições de outros enunciados.",
                  coverageRole: "explain"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Definição",
              text: "Uma proposição é um enunciado que pode ser verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo",
              text: "`2 + 2 = 4` é proposição.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Identificação",
              question: "Qual opção é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "repair",
      scope: {
        level: "lesson",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes"
      },
      promptText: "Revise esta lição e gere cards prontos para estudar.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logica",
          title: "Lógica",
          modules: [
            {
              key: "module-base",
              title: "Base",
              lessons: [
                {
                  key: "lesson-proposicoes",
                  title: "Proposições",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Reconhecer proposições.",
                    notationRules: "Usar `p` e `q`.",
                    commonErrors: "Confundir pergunta com proposição."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    providerRegistry: registry,
    providerId: "fake"
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(lesson.microsequences.length, 1);
  assert.equal(lesson.microsequences[0].cards.length, 3);
  assert.equal(lesson.microsequences[0].status, "ready");
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "plan_architecture"));
});

test("top-down em escopo de módulo gera microssequências e cards para as lições do módulo", async () => {
  const provider = createFakeProvider({
    script: {
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-proposicoes",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-reconhecimento",
                  title: "Reconhecimento inicial",
                  objective: "Distinguir proposições de outros enunciados.",
                  coverageRole: "explain"
                }
              ]
            },
            {
              lessonKey: "lesson-conectivos",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-conectivos",
                  title: "Conectivos básicos",
                  objective: "Ler conjunção e disjunção.",
                  coverageRole: "explain"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Definição",
              text: "Uma proposição é um enunciado que pode ser verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo",
              text: "`2 + 2 = 4` é proposição.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Identificação",
              question: "Qual opção é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: ["src_1"]
            }
          ]
        },
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Conjunção",
              text: "`p ∧ q` exige duas proposições verdadeiras.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Disjunção",
              text: "`p ∨ q` aceita pelo menos uma proposição verdadeira.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Comparação",
              question: "Qual conectivo exige duas proposições verdadeiras?",
              options: [
                { optionId: "a", label: "`∧`" },
                { optionId: "b", label: "`∨`" },
                { optionId: "c", label: "Nenhum dos dois" }
              ],
              correctOptionId: "a",
              feedback: "`∧` representa conjunção.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "repair",
      scope: {
        level: "module",
        courseKey: "course-logica",
        moduleKey: "module-base"
      },
      promptText: "Revise este módulo e gere cards prontos para estudar.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logica",
          title: "Lógica",
          modules: [
            {
              key: "module-base",
              title: "Base",
              lessons: [
                {
                  key: "lesson-proposicoes",
                  title: "Proposições",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Reconhecer proposições.",
                    notationRules: "Usar `p` e `q`.",
                    commonErrors: "Confundir pergunta com proposição."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: []
                },
                {
                  key: "lesson-conectivos",
                  title: "Conectivos",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Ler conjunção e disjunção.",
                    notationRules: "Usar `∧` e `∨`.",
                    commonErrors: "Confundir conjunção com disjunção."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    providerRegistry: registry,
    providerId: "fake"
  });

  const lessons = result.projectDocument.courses[0].modules[0].lessons;
  assert.equal(lessons[0].microsequences.length, 1);
  assert.equal(lessons[1].microsequences.length, 1);
  assert.equal(lessons[0].microsequences[0].cards.length, 3);
  assert.equal(lessons[1].microsequences[0].cards.length, 3);
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "plan_architecture"));
});

test("top-down em escopo de curso gera microssequências e cards para os módulos do curso", async () => {
  const provider = createFakeProvider({
    script: {
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-proposicoes",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-reconhecimento",
                  title: "Reconhecimento inicial",
                  objective: "Distinguir proposições de outros enunciados.",
                  coverageRole: "explain"
                }
              ]
            },
            {
              lessonKey: "lesson-conectivos",
              moduleKey: "module-avancado",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-conectivos",
                  title: "Conectivos básicos",
                  objective: "Ler conjunção e disjunção.",
                  coverageRole: "explain"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Definição",
              text: "Uma proposição é um enunciado que pode ser verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo",
              text: "`2 + 2 = 4` é proposição.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Identificação",
              question: "Qual opção é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: ["src_1"]
            }
          ]
        },
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Conjunção",
              text: "`p ∧ q` exige duas proposições verdadeiras.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Disjunção",
              text: "`p ∨ q` aceita pelo menos uma proposição verdadeira.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Comparação",
              question: "Qual conectivo exige duas proposições verdadeiras?",
              options: [
                { optionId: "a", label: "`∧`" },
                { optionId: "b", label: "`∨`" },
                { optionId: "c", label: "Nenhum dos dois" }
              ],
              correctOptionId: "a",
              feedback: "`∧` representa conjunção.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "repair",
      scope: {
        level: "course",
        courseKey: "course-logica"
      },
      promptText: "Revise este curso e gere cards prontos para estudar.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logica",
          title: "Lógica",
          modules: [
            {
              key: "module-base",
              title: "Base",
              lessons: [
                {
                  key: "lesson-proposicoes",
                  title: "Proposições",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Reconhecer proposições.",
                    notationRules: "Usar `p` e `q`.",
                    commonErrors: "Confundir pergunta com proposição."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: []
                }
              ]
            },
            {
              key: "module-avancado",
              title: "Avançado",
              lessons: [
                {
                  key: "lesson-conectivos",
                  title: "Conectivos",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Ler conjunção e disjunção.",
                    notationRules: "Usar `∧` e `∨`.",
                    commonErrors: "Confundir conjunção com disjunção."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    providerRegistry: registry,
    providerId: "fake"
  });

  const modules = result.projectDocument.courses[0].modules;
  assert.equal(modules[0].lessons[0].microsequences.length, 1);
  assert.equal(modules[1].lessons[0].microsequences.length, 1);
  assert.equal(modules[0].lessons[0].microsequences[0].cards.length, 3);
  assert.equal(modules[1].lessons[0].microsequences[0].cards.length, 3);
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "plan_architecture"));
});

test("repair_only em escopo de lição usa subfluxo local sem arquitetura ampla", async () => {
  const provider = createFakeProvider({
    script: {
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-proposicoes",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-revisada",
                  title: "Revisão guiada",
                  objective: "Revisar proposições com prática curta.",
                  coverageRole: "explain"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Definição",
              text: "Uma proposição pode ser verdadeira ou falsa.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo",
              text: "`2 + 2 = 4` é proposição.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Checagem",
              question: "Qual enunciado é proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      scope: {
        level: "lesson",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes"
      },
      promptText: "Revise esta lição.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logica",
          title: "Lógica",
          modules: [
            {
              key: "module-base",
              title: "Base",
              lessons: [
                {
                  key: "lesson-proposicoes",
                  title: "Proposições",
                  description: "Lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Reconhecer proposições.",
                    notationRules: "Usar `p` e `q`.",
                    commonErrors: "Confundir pergunta com proposição."
                  },
                  presetId: "default",
                  resourceTags: ["paragraph", "multiple_choice"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    providerRegistry: registry,
    providerId: "fake"
  });

  assert.equal(result.runState.intent.generationDepth, "repair_only");
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "plan_architecture"));
  assert.equal(result.projectDocument.courses[0].modules[0].lessons[0].microsequences.length, 1);
});

test("repair_cards corrige cards inválidos antes de aplicar ao projeto", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        {
          course: {
            key: "course-logica",
            title: "Lógica",
            description: "Curso.",
            modules: [
              {
                key: "module-proposicoes",
                title: "Proposições",
                description: "Módulo.",
                lessons: [
                  {
                    key: "lesson-introducao",
                    title: "Introdução",
                    description: "Lição.",
                    sourceGuideStructured: {
                      lessonGoal: "Ler proposições.",
                      notationRules: "Usar `p` e `q`.",
                      commonErrors: "Confundir frase e proposição."
                    },
                    presetId: "default",
                    resourceTags: ["paragraph", "multiple_choice"],
                    contentTypeTags: ["theory"],
                    learningActionTags: ["read"],
                    supportLevel: "guided",
                    microsequences: []
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [{ approved: true, blockingIssues: [], warnings: [] }],
      plan_lessons: [
        {
          lessonPlans: [
            {
              courseKey: "course-logica",
              moduleKey: "module-proposicoes",
              lessonKey: "lesson-introducao",
              lessonTitle: "Introdução",
              lessonDescription: "Lição.",
              sourceGuideStructured: {
                lessonGoal: "Ler proposições.",
                notationRules: "Usar `p` e `q`.",
                commonErrors: "Confundir frase e proposição."
              },
              presetId: "default",
              resourceTags: ["paragraph", "multiple_choice"],
              contentTypeTags: ["theory"],
              learningActionTags: ["read"],
              supportLevel: "guided"
            }
          ]
        }
      ],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-introducao",
              moduleKey: "module-proposicoes",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-leitura-inicial",
                  title: "Leitura inicial de proposições",
                  objective: "Reconhecer enunciados como proposições.",
                  coverageRole: "core"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Pipeline",
              text: "Este JSON explica o conceito.",
              sourceRefs: ["src_inexistente"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo guiado",
              text: "A frase `2 + 2 = 4` é proposição.",
              sourceRefs: []
            },
            {
              position: 3,
              resourceType: "paragraph",
              title: "Resumo",
              text: "Toda proposição admite valor de verdade.",
              sourceRefs: []
            }
          ]
        }
      ],
      repair_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "O que é uma proposição",
              text: "Uma proposição é um enunciado que pode ser classificado como verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo guiado",
              text: "A frase `2 + 2 = 4` é proposição porque admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Reconhecendo proposições",
              question: "Qual enunciado é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "Só `2 + 2 = 4` pode ser classificado como verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Criar curso de lógica.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  const microsequence = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.cards.length, 3);
  assert.equal(microsequence.cards[0].title, "O que é uma proposição");
  const sourceAudit = result.artifacts.find((item) => item.name === "source-adherence-audit");
  assert.equal(sourceAudit.content.approved, true);
});

test("audit_source_adherence usa domainMap explícito para fechar cobertura mínima da lição", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        {
          course: {
            key: "course-redes",
            title: "Redes",
            description: "Curso.",
            modules: [
              {
                key: "module-intro",
                title: "Fundamentos",
                description: "Módulo.",
                lessons: [
                  {
                    key: "lesson-rede-local",
                    title: "Rede local",
                    description: "Lição.",
                    sourceGuideStructured: {
                      lessonGoal: "Distinguir rede local e internet.",
                      notationRules: "Usar `LAN` e `internet`.",
                      commonErrors: "Confundir rede local com internet."
                    },
                    domainMap: {
                      items: [
                        {
                          id: "domain-lan",
                          label: "Distinguir rede local e internet",
                          kind: "concept",
                          priority: "core"
                        }
                      ],
                      practiceVariants: [
                        {
                          id: "variant-lan-discriminacao",
                          domainItemRef: "domain-lan",
                          variantKind: "discrimination",
                          purpose: "Separar exemplos de rede local e internet."
                        }
                      ]
                    },
                    presetId: "default",
                    resourceTags: ["paragraph", "multiple_choice"],
                    contentTypeTags: ["theory"],
                    learningActionTags: ["read", "practice"],
                    supportLevel: "guided",
                    microsequences: []
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [{ approved: true, blockingIssues: [], warnings: [] }],
      plan_lessons: [
        {
          lessonPlans: [
            {
              courseKey: "course-redes",
              moduleKey: "module-intro",
              lessonKey: "lesson-rede-local",
              lessonTitle: "Rede local",
              lessonDescription: "Lição.",
              sourceGuideStructured: {
                lessonGoal: "Distinguir rede local e internet.",
                notationRules: "Usar `LAN` e `internet`.",
                commonErrors: "Confundir rede local com internet."
              },
              domainMap: {
                items: [
                  {
                    id: "domain-lan",
                    label: "Distinguir rede local e internet",
                    kind: "concept",
                    priority: "core"
                  }
                ],
                practiceVariants: [
                  {
                    id: "variant-lan-discriminacao",
                    domainItemRef: "domain-lan",
                    variantKind: "discrimination",
                    purpose: "Separar exemplos de rede local e internet."
                  }
                ]
              },
              presetId: "default",
              resourceTags: ["paragraph", "multiple_choice"],
              contentTypeTags: ["theory"],
              learningActionTags: ["read", "practice"],
              supportLevel: "guided"
            }
          ]
        }
      ],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-rede-local",
              moduleKey: "module-intro",
              courseKey: "course-redes",
              microsequences: [
                {
                  key: "microsequence-diferenca-basica",
                  title: "Diferença básica",
                  objective: "Explicar o contraste entre rede local e internet.",
                  coverageRole: "practice"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Rede local e internet",
              text: "Rede local conecta dispositivos de um mesmo ambiente; internet interliga várias redes.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo rápido",
              text: "Os computadores de uma escola podem formar uma rede local.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Classificação",
              question: "Qual situação descreve melhor uma rede local?",
              options: [
                { optionId: "a", label: "Computadores do mesmo laboratório conectados." },
                { optionId: "b", label: "Todas as redes do mundo somadas." },
                { optionId: "c", label: "Um único site na web." }
              ],
              correctOptionId: "a",
              feedback: "Rede local conecta dispositivos de um mesmo ambiente.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Criar curso de redes.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  const microsequence = lesson.microsequences[0];
  assert.equal(lesson.domainMap.items[0].id, "domain-lan");
  assert.deepEqual(microsequence.domainRefs, ["domain-lan"]);
  assert.deepEqual(microsequence.practiceVariantRefs, ["variant-lan-discriminacao"]);
  const sourceAudit = result.artifacts.find((item) => item.name === "source-adherence-audit");
  const diagnostics = result.artifacts.find((item) => item.name === "diagnostics-summary");
  assert.equal(sourceAudit.content.approved, true);
  assert.equal(diagnostics.content.categories.planning.blockingIssues, 0);
  assert.equal(diagnostics.content.categories.adherence.blockingIssues, 0);
});

test("repair_microsequences chama provider quando a cobertura do domainMap nao e inferivel deterministicamente", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        {
          course: {
            key: "course-logica",
            title: "Lógica",
            description: "Curso.",
            modules: [
              {
                key: "module-base",
                title: "Base",
                description: "Módulo.",
                lessons: [
                  {
                    key: "lesson-conectivos",
                    title: "Conectivos",
                    description: "Lição.",
                    sourceGuideStructured: {
                      lessonGoal: "Ler e comparar conectivos.",
                      notationRules: "Usar `∧` e `∨`.",
                      commonErrors: "Confundir conjunção com disjunção."
                    },
                    domainMap: {
                      items: [
                        { id: "domain-and", label: "Reconhecer `∧`", kind: "notation", priority: "core" },
                        { id: "domain-or", label: "Reconhecer `∨`", kind: "notation", priority: "core" }
                      ],
                      practiceVariants: [
                        {
                          id: "variant-and",
                          domainItemRef: "domain-and",
                          variantKind: "fluency",
                          purpose: "Ler expressões com `∧`."
                        },
                        {
                          id: "variant-or",
                          domainItemRef: "domain-or",
                          variantKind: "fluency",
                          purpose: "Ler expressões com `∨`."
                        }
                      ]
                    },
                    presetId: "default",
                    resourceTags: ["paragraph", "multiple_choice"],
                    contentTypeTags: ["theory"],
                    learningActionTags: ["read", "practice"],
                    supportLevel: "guided"
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [{ approved: true, blockingIssues: [], warnings: [] }],
      plan_lessons: [
        {
          lessonPlans: [
            {
              courseKey: "course-logica",
              moduleKey: "module-base",
              lessonKey: "lesson-conectivos",
              lessonTitle: "Conectivos",
              lessonDescription: "Lição.",
              sourceGuideStructured: {
                lessonGoal: "Ler e comparar conectivos.",
                notationRules: "Usar `∧` e `∨`.",
                commonErrors: "Confundir conjunção com disjunção."
              },
              domainMap: {
                items: [
                  { id: "domain-and", label: "Reconhecer `∧`", kind: "notation", priority: "core" },
                  { id: "domain-or", label: "Reconhecer `∨`", kind: "notation", priority: "core" }
                ],
                practiceVariants: [
                  {
                    id: "variant-and",
                    domainItemRef: "domain-and",
                    variantKind: "fluency",
                    purpose: "Ler expressões com `∧`."
                  },
                  {
                    id: "variant-or",
                    domainItemRef: "domain-or",
                    variantKind: "fluency",
                    purpose: "Ler expressões com `∨`."
                  }
                ]
              },
              presetId: "default",
              resourceTags: ["paragraph", "multiple_choice"],
              contentTypeTags: ["theory"],
              learningActionTags: ["read", "practice"],
              supportLevel: "guided"
            }
          ]
        }
      ],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-conectivos",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-comparacao",
                  title: "Comparação inicial",
                  objective: "Comparar `∧` e `∨`.",
                  coverageRole: "practice"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      repair_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-conectivos",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-comparacao",
                  title: "Comparação inicial",
                  objective: "Comparar `∧` e `∨`.",
                  coverageRole: "practice",
                  domainRefs: ["domain-and", "domain-or"],
                  practiceVariantRefs: ["variant-and", "variant-or"]
                }
              ]
            }
          ]
        }
      ],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Lendo conectivos",
              text: "`p ∧ q` exige que as duas proposições sejam verdadeiras.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Contraste",
              text: "`p ∨ q` basta quando pelo menos uma proposição é verdadeira.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Comparação",
              question: "Qual conectivo exige duas proposições verdadeiras?",
              options: [
                { optionId: "a", label: "`∧`" },
                { optionId: "b", label: "`∨`" },
                { optionId: "c", label: "Nenhum dos dois" }
              ],
              correctOptionId: "a",
              feedback: "`∧` representa conjunção: as duas precisam ser verdadeiras.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Criar curso de lógica com conectivos.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  const adherenceAudit = result.artifacts.find((item) => item.name === "microsequence-adherence-audit");
  const finalReport = result.artifacts.find((item) => item.name === "final-report");
  const microsequence = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(adherenceAudit.content.approved, true);
  assert.deepEqual(microsequence.domainRefs, ["domain-and", "domain-or"]);
  assert.deepEqual(microsequence.practiceVariantRefs, ["variant-and", "variant-or"]);
  assert.equal(finalReport.content.metrics.repairCallsByCategory.planning, 1);
  assert.equal(finalReport.content.diagnosticsSummary.categories.planning.repaired, true);
});

test("repair_card_adherence separa grounding tardio de defeito estrutural dos cards", async () => {
  const provider = createFakeProvider({
    script: {
      plan_architecture: [
        {
          course: {
            key: "course-logica",
            title: "Lógica",
            description: "Curso.",
            modules: [
              {
                key: "module-base",
                title: "Base",
                description: "Módulo.",
                lessons: [
                  {
                    key: "lesson-proposicoes",
                    title: "Proposições",
                    description: "Lição.",
                    sourceGuideStructured: {
                      lessonGoal: "Reconhecer proposições.",
                      notationRules: "Usar `p` e `q`.",
                      commonErrors: "Confundir pergunta com proposição."
                    },
                    presetId: "default",
                    resourceTags: ["paragraph", "multiple_choice"],
                    contentTypeTags: ["theory"],
                    learningActionTags: ["read"],
                    supportLevel: "guided"
                  }
                ]
              }
            ]
          }
        }
      ],
      audit_architecture: [{ approved: true, blockingIssues: [], warnings: [] }],
      plan_lessons: [
        {
          lessonPlans: [
            {
              courseKey: "course-logica",
              moduleKey: "module-base",
              lessonKey: "lesson-proposicoes",
              lessonTitle: "Proposições",
              lessonDescription: "Lição.",
              sourceGuideStructured: {
                lessonGoal: "Reconhecer proposições.",
                notationRules: "Usar `p` e `q`.",
                commonErrors: "Confundir pergunta com proposição."
              },
              presetId: "default",
              resourceTags: ["paragraph", "multiple_choice"],
              contentTypeTags: ["theory"],
              learningActionTags: ["read"],
              supportLevel: "guided"
            }
          ]
        }
      ],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              lessonKey: "lesson-proposicoes",
              moduleKey: "module-base",
              courseKey: "course-logica",
              microsequences: [
                {
                  key: "microsequence-reconhecimento",
                  title: "Reconhecimento inicial",
                  objective: "Diferenciar proposições de outros enunciados.",
                  coverageRole: "core"
                }
              ]
            }
          ]
        }
      ],
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "O que é uma proposição",
              text: "Uma proposição é um enunciado que pode ser verdadeiro ou falso.",
              sourceRefs: ["src_inexistente"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo",
              text: "`2 + 2 = 4` é proposição.",
              sourceRefs: []
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Identificação",
              question: "Qual opção é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: []
            }
          ]
        }
      ],
      repair_card_adherence: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "O que é uma proposição",
              text: "Uma proposição é um enunciado que pode ser verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo",
              text: "`2 + 2 = 4` é proposição.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Identificação",
              question: "Qual opção é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a porta." },
                { optionId: "b", label: "2 + 2 = 4." },
                { optionId: "c", label: "Que horas são?" }
              ],
              correctOptionId: "b",
              feedback: "`2 + 2 = 4` admite valor de verdade.",
              sourceRefs: ["src_1"]
            }
          ]
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Criar curso de lógica.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  const cardsAudit = result.artifacts.find((item) => item.name === "cards-audit");
  const sourceAudit = result.artifacts.find((item) => item.name === "source-adherence-audit");
  const finalReport = result.artifacts.find((item) => item.name === "final-report");
  const microsequence = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(cardsAudit.content.approved, true);
  assert.equal(sourceAudit.content.approved, true);
  assert.equal(microsequence.cards[0].sourceRefs[0], "src_1");
  assert.equal(finalReport.content.metrics.repairCallsByCategory.cards, 0);
  assert.equal(finalReport.content.metrics.repairCallsByCategory.adherence, 1);
  assert.equal(finalReport.content.diagnosticsSummary.categories.adherence.repaired, true);
});
