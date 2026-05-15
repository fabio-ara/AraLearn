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
  assert.equal(result.generationDepth, "structure_only");
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
  assert.ok(resolveDeferredCourseForgePhases(fullIntent).includes("build_cards"));
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
      ],
      audit_architecture: [
        {
          approved: true,
          blockingIssues: [],
          warnings: []
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      operation: "create",
      scope: { level: "project" },
      promptText: "Criar curso de lógica."
    },
    projectDocument: createProject(),
    providerRegistry: registry,
    providerId: "fake"
  });

  assert.equal(result.projectDocument.courses[0].title, "Lógica");
  assert.equal(result.patch.operations.length >= 2, true);
  const finalReport = result.artifacts.find((item) => item.name === "final-report");
  assert.equal(finalReport.content.executedGenerationDepth, "structure_only");
  assert.equal(finalReport.content.deferredGenerationDepth, "full_course");
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
      ],
      audit_architecture: [
        {
          approved: true,
          blockingIssues: [],
          warnings: []
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
        intent: { operation: "create", scope: { level: "project" }, promptText: "Curso de redes" },
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
    intent: { operation: "create", scope: { level: "project" }, promptText: "Curso de redes" },
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
        modules: [{ key: "module-1", title: "Módulo 1", lessons: [] }]
      }
    }
  });
  assert.equal(patch.operations[0].op, "add_course");
  assert.equal(patch.operations[1].op, "add_module");
});
