import test from "node:test";
import assert from "node:assert/strict";

import { resolveCourseForgeIntent } from "../src/generation/courseForge/courseForgeIntent.js";
import { resolveCourseForgeScope } from "../src/generation/courseForge/courseForgeScope.js";
import { resolveCourseForgePhases, resolveDeferredCourseForgePhases } from "../src/generation/courseForge/courseForgePhases.js";
import { buildLessonDomainMap } from "../src/generation/domain/lessonDomainModel.js";
import { createProviderRegistry } from "../src/generation/providers/providerRegistry.js";
import { PHASE_PROFILES, resolvePhaseProfile } from "../src/generation/modelProfiles/phaseProfiles.js";
import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { listCourseForgeSourceClaims, listCourseForgeSourceSpans, validateCourseForgeSourceLedger } from "../src/generation/courseForge/courseForgeSourceLedger.js";
import { validateCourseForgeCardSourceRefs } from "../src/generation/courseForge/courseForgeSourceRefs.js";
import { auditCourseForgeBackstageVocabulary } from "../src/generation/courseForge/courseForgeBackstageAudit.js";
import {
  auditCourseForgeSourceAdherence,
  auditCourseForgeAssessmentAlignment,
  buildCourseForgeMicrosequenceRepairDirectives,
  auditCourseForgeInterventionDidacticCoherence,
  auditCourseForgePrerequisiteCoverage
} from "../src/generation/courseForge/courseForgeCards.js";
import { compileCourseStructureToPatch, validateCourseForgePatch } from "../src/generation/courseForge/courseForgePatch.js";
import { createCourseForgeArtifactsStore } from "../src/generation/courseForge/courseForgeArtifacts.js";
import { canResumeCourseForgeRun, createCourseForgeRunState } from "../src/generation/courseForge/courseForgeRunState.js";
import { runCourseForgeQueue } from "../src/generation/courseForge/courseForgeQueue.js";
import { runCourseForge } from "../src/generation/courseForge/courseForgeRunner.js";
import { applyCourseForgePatch } from "../src/generation/courseForge/courseForgeApply.js";
import { buildCourseGraphArtifact } from "../src/generation/courseForge/courseForgeIr.js";
import {
  mergeCourseForgeArchitectureAudits,
  validateCourseForgeArchitectureDraft,
  validateCourseForgeCourseGraph
} from "../src/generation/courseForge/courseForgeValidation.js";
import { getModelCapabilities } from "../src/generation/providers/modelCapabilities.js";
import { buildCourseForgePolicyPack, buildCourseForgePrompt } from "../src/generation/courseForge/courseForgePrompts.js";

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

test("resolveCourseForgeIntent entende pedido local de completar lacunas como reinforce_only", () => {
  const result = resolveCourseForgeIntent({
    scope: {
      level: "lesson",
      courseKey: "course-logica",
      moduleKey: "module-base",
      lessonKey: "lesson-1"
    },
    promptText: "Completar lacunas desta lição.",
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
              lessons: [{ key: "lesson-1", title: "Lição 1", microsequences: [] }]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.operation, "reinforce");
  assert.equal(result.requestedGenerationDepth, "reinforce_only");
  assert.equal(result.generationDepth, "reinforce_only");
});

test("resolveCourseForgeIntent classifica intervenção local sobre microssequências existentes", () => {
  const result = resolveCourseForgeIntent({
    scope: {
      level: "lesson",
      courseKey: "course-logica",
      moduleKey: "module-base",
      lessonKey: "lesson-1"
    },
    promptText: "Revise esta lição sem replanejar tudo.",
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
                  microsequences: [
                    { key: "micro-1", title: "Explicação", coverageRole: "explain", status: "ready", included: true, cards: [] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.intervention.mode, "targeted_existing_microsequences");
  assert.equal(result.intervention.selectionStrategy, "one_existing_per_lesson");
  assert.equal(result.intervention.actors.lead, "editor");
  assert.equal(result.intervention.actors.audit, "auditor");
  assert.equal(result.contextSummary.reusableMicrosequenceCount, 1);
});

test("resolveCourseForgeIntent classifica dúvida local como tutor_only", () => {
  const result = resolveCourseForgeIntent({
    scope: {
      level: "microsequence",
      courseKey: "course-logica",
      moduleKey: "module-base",
      lessonKey: "lesson-1",
      microsequenceKey: "micro-1"
    },
    promptText: "Não entendi esta microssequência. O que é proposição?",
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
                  microsequences: [{ key: "micro-1", title: "Explicação", coverageRole: "explain", status: "ready", included: true, cards: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.operation, "reinforce");
  assert.equal(result.generationDepth, "tutor_only");
  assert.equal(result.intervention.mode, "tutor_response_only");
  assert.equal(result.intervention.actors.lead, "tutor");
});

test("resolveCourseForgeIntent consome InterventionRequest pronto como entrada canônica do Editor", () => {
  const result = resolveCourseForgeIntent({
    interventionRequest: {
      status: "ready",
      recommendedAction: "suggest_editor_patch",
      studentPrompt: "Ainda não entendi como distinguir proposição de pergunta.",
      rationale: "Falta contraste guiado na microssequência atual.",
      target: {
        level: "microsequence",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes",
        microsequenceKey: "microsequence-revisao"
      },
      editorIntent: {
        operation: "reinforce",
        generationDepthHint: "reinforce_only",
        interventionModeHint: "targeted_single_microsequence",
        requestedBy: "tutor"
      },
      requestedChanges: [
        {
          type: "patch_existing_material",
          patchStrategy: "patch_existing_microsequence",
          didacticInterventionType: "contrast_reinforcement",
          reason: "Adicionar contraste guiado."
        }
      ]
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
                  microsequences: [{ key: "microsequence-revisao", title: "Revisão", status: "ready", included: true, cards: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.operation, "reinforce");
  assert.equal(result.scope.level, "microsequence");
  assert.equal(result.scope.microsequenceKey, "microsequence-revisao");
  assert.equal(result.requestedGenerationDepth, "reinforce_only");
  assert.equal(result.generationDepth, "reinforce_only");
  assert.equal(result.intervention.mode, "targeted_single_microsequence");
  assert.equal(result.contextSummary.cameFromInterventionRequest, true);
  assert.equal(result.interventionRequest.recommendedAction, "suggest_editor_patch");
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
  assert.equal(resolvePhaseProfile("build_assessment_profile").temperature, 0);
  assert.equal(resolvePhaseProfile("audit_course_graph").temperature, 0);
  assert.equal(resolvePhaseProfile("audit_prerequisites").temperature, 0);
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
    "build_assessment_profile",
    "plan_architecture",
    "audit_architecture",
    "repair_architecture",
    "compile_patch",
    "validate_patch",
    "apply_patch",
    "final_report"
  ]);
  assert.ok(resolveCourseForgePhases(fullIntent).includes("plan_microsequences"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("build_course_graph"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("audit_course_graph"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("repair_course_graph"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("build_lesson_governance"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("compile_card_plans"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("repair_microsequences"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("repair_card_adherence"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("audit_prerequisites"));
  assert.ok(resolveCourseForgePhases(fullIntent).includes("audit_assessment_alignment"));
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
  const targetedLessonIntent = resolveCourseForgeIntent({
    scope: { level: "lesson", courseKey: "c1", moduleKey: "m1", lessonKey: "l1" },
    promptText: "Revise esta lição.",
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "c1",
          title: "Curso",
          modules: [
            {
              key: "m1",
              title: "Módulo",
              lessons: [
                {
                  key: "l1",
                  title: "Lição",
                  microsequences: [{ key: "ms1", title: "Micro", coverageRole: "explain", status: "ready", included: true, cards: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  });
  const repairMicrosequenceIntent = resolveCourseForgeIntent({
    scope: { level: "microsequence", courseKey: "c1", moduleKey: "m1", lessonKey: "l1", microsequenceKey: "ms1" },
    promptText: "Revise esta microssequência."
  });
  const reinforceLessonIntent = resolveCourseForgeIntent({
    scope: { level: "lesson", courseKey: "c1", moduleKey: "m1", lessonKey: "l1" },
    promptText: "Completar lacunas desta lição."
  });
  assert.ok(resolveCourseForgePhases(repairLessonIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(repairLessonIntent).includes("plan_architecture"));
  assert.ok(resolveCourseForgePhases(targetedLessonIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(targetedLessonIntent).includes("build_course_graph"));
  assert.ok(!resolveCourseForgePhases(targetedLessonIntent).includes("build_lesson_governance"));
  const tutorIntent = resolveCourseForgeIntent({
    scope: { level: "microsequence", courseKey: "c1", moduleKey: "m1", lessonKey: "l1", microsequenceKey: "ms1" },
    promptText: "Não entendi esta microssequência. O que é isso?",
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "c1",
          title: "Curso",
          modules: [
            {
              key: "m1",
              title: "Módulo",
              lessons: [
                {
                  key: "l1",
                  title: "Lição",
                  microsequences: [{ key: "ms1", title: "Micro", coverageRole: "explain", status: "ready", included: true, cards: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  });
  assert.ok(resolveCourseForgePhases(tutorIntent).includes("answer_locally"));
  assert.ok(resolveCourseForgePhases(tutorIntent).includes("audit_intervention"));
  assert.ok(resolveCourseForgePhases(tutorIntent).includes("compile_intervention_request"));
  assert.ok(!resolveCourseForgePhases(tutorIntent).includes("compile_patch"));
  const interventionRequestIntent = resolveCourseForgeIntent({
    interventionRequest: {
      status: "ready",
      recommendedAction: "needs_new_microsequence",
      studentPrompt: "Ainda não entendi esta parte.",
      rationale: "Falta ponte didática.",
      target: {
        level: "lesson",
        courseKey: "c1",
        moduleKey: "m1",
        lessonKey: "l1"
      },
      editorIntent: {
        operation: "extend",
        generationDepthHint: "reinforce_only",
        interventionModeHint: "targeted_scope_expansion",
        requestedBy: "tutor"
      },
      requestedChanges: [
        {
          type: "add_new_microsequence",
          patchStrategy: "add_microsequence",
          didacticInterventionType: "explanatory_bridge",
          reason: "Inserir ponte didática."
        }
      ]
    },
    projectDocument: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "c1",
          title: "Curso",
          modules: [
            {
              key: "m1",
              title: "Módulo",
              lessons: [
                {
                  key: "l1",
                  title: "Lição",
                  microsequences: [{ key: "ms1", title: "Micro", coverageRole: "explain", status: "ready", included: true, cards: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  });
  assert.equal(interventionRequestIntent.intervention.mode, "targeted_scope_expansion");
  assert.ok(resolveCourseForgePhases(interventionRequestIntent).includes("build_course_graph"));
  assert.ok(resolveCourseForgePhases(interventionRequestIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(interventionRequestIntent).includes("answer_locally"));
  assert.ok(!resolveCourseForgePhases(interventionRequestIntent).includes("plan_architecture"));
  assert.ok(resolveCourseForgePhases(repairMicrosequenceIntent).includes("build_microsequence_contract"));
  assert.ok(!resolveCourseForgePhases(repairMicrosequenceIntent).includes("plan_architecture"));
  assert.ok(resolveCourseForgePhases(reinforceLessonIntent).includes("plan_microsequences"));
  assert.ok(!resolveCourseForgePhases(reinforceLessonIntent).includes("plan_architecture"));
  assert.equal(resolveDeferredCourseForgePhases(fullIntent).length, 0);
});

test("modelCapabilities expõe campos antigos e novos", () => {
  const model = getModelCapabilities("gemini-2.5-flash");
  assert.equal(model.supportsJsonMode, true);
  assert.equal(model.supportsResponseJsonSchema, true);
  assert.equal(model.family, "gemini");
});

test("CourseForge usa policy pack didático compatível com Planner Builder Auditor", () => {
  const policy = buildCourseForgePolicyPack();
  const prompt = buildCourseForgePrompt({
    role: "Você planeja microssequências.",
    sourcePack: "ementa e exercícios",
    task: "Planeje a lição.",
    output: "JSON"
  });

  assert.match(policy, /microssequência/);
  assert.match(policy, /sourceGuideStructured/);
  assert.match(policy, /Perfil-alvo obrigatório/);
  assert.match(policy, /planner_builder_auditor_internalizado/);
  assert.match(policy, /Explique siglas/);
  assert.match(policy, /reconecte explicitamente à trilha/);
  assert.match(prompt, /POLICY PACK/);
  assert.match(prompt, /domainRefs e practiceVariantRefs/);
  assert.match(prompt, /artefatos anexos da fase/);
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

test("sourceLedger sintetiza spans e resume quantidade", () => {
  const result = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Ementa",
      locator: "attachment:1"
    }
  ]);
  assert.equal(result.ok, true);
  assert.equal(listCourseForgeSourceSpans(result.sourceLedger).length, 1);
  assert.equal(result.sourceLedger.summary.spanCount, 1);
  assert.equal(result.sourceLedger.sources[0].spans[0].text, "Ementa");
});

test("sourceLedger sintetiza claims quando o span tem texto rico", () => {
  const result = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [
        {
          text: "A conjunção exige duas proposições verdadeiras. A disjunção aceita pelo menos uma proposição verdadeira."
        }
      ]
    }
  ]);
  assert.equal(result.ok, true);
  assert.equal(listCourseForgeSourceClaims(result.sourceLedger).length, 2);
  assert.equal(result.sourceLedger.summary.claimCount, 2);
  assert.equal(result.sourceLedger.sources[0].spans[0].claims[0].claimId, "src_1:span:1:claim:1");
});

test("card sourceRefs bloqueia sourceId inexistente", () => {
  const result = validateCourseForgeCardSourceRefs(
    [{ sourceId: "src_2", confidence: "high" }],
    [{ id: "src_1", title: "Fonte 1" }]
  );
  assert.equal(result.ok, false);
});

test("card sourceRefs infere spanId e aceita enriquecimento externo justificado", () => {
  const ledgerResult = validateCourseForgeSourceLedger([{ id: "src_1", title: "Fonte 1" }]);
  const result = validateCourseForgeCardSourceRefs(
    [
      { sourceId: "src_1", confidence: "high", transformationState: "paraphrase" },
      { transformationState: "external_enrichment", note: "Exemplo adicional do motor." }
    ],
    ledgerResult.sourceLedger
  );
  assert.equal(result.ok, true);
  assert.equal(result.normalized[0].spanId, "src_1:span:1");
  assert.equal(result.normalized[1].transformationState, "external_enrichment");
});

test("card sourceRefs infere claimId quando o span tem claims sintetizadas", () => {
  const ledgerResult = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [{ text: "A conjunção exige duas proposições verdadeiras." }]
    }
  ]);
  const result = validateCourseForgeCardSourceRefs(
    [{ sourceId: "src_1", confidence: "high", transformationState: "paraphrase" }],
    ledgerResult.sourceLedger
  );
  assert.equal(result.ok, true);
  assert.equal(result.normalized[0].claimId, "src_1:span:1:claim:1");
});

test("audit_source_adherence usa claims sintetizadas para bloquear grounding fraco em fonte rica", () => {
  const ledgerResult = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [{ text: "A conjunção exige duas proposições verdadeiras." }]
    }
  ]);
  const result = auditCourseForgeSourceAdherence({
    sourceLedger: ledgerResult.sourceLedger,
    cardDrafts: [
      {
        contractId: "contract-1",
        courseKey: "course-1",
        moduleKey: "module-1",
        lessonKey: "lesson-1",
        microsequenceKey: "micro-1",
        cards: [
          {
            title: "Árvore de diretórios",
            text: "Use mkdir para criar uma pasta nova."
          }
        ],
        sourceSupport: [
          [{ sourceId: "src_1", spanId: "src_1:span:1", claimId: "src_1:span:1:claim:1", transformationState: "paraphrase", confidence: "high" }]
        ]
      }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.type === "weak_claim_grounding"));
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

test("course graph local detecta referencias quebradas e licoes sem cobertura", () => {
  const result = validateCourseForgeCourseGraph({
    courseGraph: {
      graphId: "graph-1",
      concepts: [{ conceptId: "concept-1", label: "Conceito 1", lessonKey: "lesson-ok", sourceRefs: ["src_1"] }],
      objectives: [{ objectiveId: "obj-1", lessonKey: "lesson-ok", description: "Objetivo." }],
      prerequisiteEdges: [{ from: "concept-1", to: "concept-inexistente", lessonKey: "lesson-ok" }],
      assessmentTargets: [],
      practiceVariants: [{ practiceVariantId: "variant-1", domainItemRef: "concept-ausente", lessonKey: "lesson-ok" }]
    },
    lessonPlans: [
      { lessonKey: "lesson-ok", sourceGuideStructured: { lessonGoal: "Objetivo." } },
      { lessonKey: "lesson-sem-cobertura", sourceGuideStructured: { lessonGoal: "Outro objetivo." } }
    ],
    assessmentProfile: { questionTypes: ["multiple_choice"] },
    sourceLedger: [{ id: "src_1", title: "Fonte 1" }]
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockingIssues.some((item) => item.type === "dangling_edge"));
  assert.ok(result.blockingIssues.some((item) => item.type === "dangling_variant"));
  assert.ok(result.blockingIssues.some((item) => item.type === "missing_lesson_concepts"));
});

test("course graph enriquece conceitos e objetivos com sourceClaimRefs inferidas", () => {
  const sourceLedgerResult = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [
        {
          text: "A conjunção exige duas proposições verdadeiras. O objetivo da lição é comparar conjunção e disjunção."
        }
      ]
    }
  ]);
  const courseGraph = buildCourseGraphArtifact({
    lessonPlans: [
      {
        lessonKey: "lesson-1",
        sourceGuideStructured: {
          lessonGoal: "Comparar conjunção e disjunção."
        },
        domainMap: {
          items: [
            {
              id: "concept-and",
              label: "Conjunção",
              expectedEvidence: ["duas proposições verdadeiras"]
            }
          ],
          practiceVariants: []
        }
      }
    ],
    sourceLedger: sourceLedgerResult.sourceLedger
  });
  assert.deepEqual(courseGraph.concepts[0].sourceClaimRefs, ["src_1:span:1:claim:1"]);
  assert.deepEqual(courseGraph.objectives[0].sourceClaimRefs, ["src_1:span:1:claim:2"]);
});

test("course graph infere conceitos adicionais a partir de claims quando o domainMap e pobre", () => {
  const sourceLedgerResult = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [
        {
          text: "A conjunção exige duas proposições verdadeiras. A disjunção aceita pelo menos uma proposição verdadeira."
        }
      ]
    }
  ]);
  const courseGraph = buildCourseGraphArtifact({
    lessonPlans: [
      {
        lessonKey: "lesson-1",
        lessonTitle: "Conectivos",
        lessonDescription: "Ler conectivos.",
        sourceGuideStructured: {
          lessonGoal: "Comparar conjunção e disjunção."
        },
        domainMap: {
          items: [{ id: "lesson-goal", label: "Comparar conjunção e disjunção." }],
          practiceVariants: []
        }
      }
    ],
    sourceLedger: sourceLedgerResult.sourceLedger
  });
  const labels = courseGraph.concepts.map((item) => item.label);
  assert.ok(labels.includes("Conjunção"));
  assert.ok(labels.includes("Disjunção"));
});

test("course graph materializa comparacao explicita a partir do objetivo e das claims", () => {
  const sourceLedgerResult = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [
        {
          text: "A conjunção exige duas proposições verdadeiras. A disjunção aceita pelo menos uma proposição verdadeira."
        }
      ]
    }
  ]);
  const courseGraph = buildCourseGraphArtifact({
    lessonPlans: [
      {
        lessonKey: "lesson-1",
        lessonTitle: "Conectivos",
        sourceGuideStructured: {
          lessonGoal: "Comparar conjunção e disjunção."
        },
        domainMap: {
          items: [
            { id: "concept-and", label: "Conjunção" },
            { id: "concept-or", label: "Disjunção" }
          ],
          practiceVariants: []
        }
      }
    ],
    sourceLedger: sourceLedgerResult.sourceLedger
  });

  const comparisonConcept = courseGraph.concepts.find((item) => item.kind === "comparison");
  assert.equal(comparisonConcept?.label, "Diferença entre Conjunção e Disjunção");
  assert.deepEqual(comparisonConcept?.relatedConceptRefs, ["concept-and", "concept-or"]);
  assert.ok(Array.isArray(comparisonConcept?.sourceClaimRefs) && comparisonConcept.sourceClaimRefs.length >= 2);

  const comparisonTarget = courseGraph.assessmentTargets.find((item) => item.targetKind === "comparison");
  assert.equal(comparisonTarget?.conceptRef, comparisonConcept?.conceptId);
  assert.deepEqual(comparisonTarget?.relatedConceptRefs, ["concept-and", "concept-or"]);
  assert.ok(courseGraph.prerequisiteEdges.some((edge) => edge.from === "concept-and" && edge.to === comparisonConcept?.conceptId));
  assert.ok(courseGraph.prerequisiteEdges.some((edge) => edge.from === "concept-or" && edge.to === comparisonConcept?.conceptId));
});

test("course graph materializa misconception de discriminacao a partir de common error", () => {
  const sourceLedgerResult = validateCourseForgeSourceLedger([
    {
      id: "src_1",
      title: "Lógica",
      spans: [
        {
          text: "Erro comum: confundir conjunção com disjunção."
        }
      ]
    }
  ]);
  const courseGraph = buildCourseGraphArtifact({
    lessonPlans: [
      {
        lessonKey: "lesson-1",
        lessonTitle: "Conectivos",
        sourceGuideStructured: {
          lessonGoal: "Comparar conjunção e disjunção.",
          commonErrors: "Confundir conjunção com disjunção."
        },
        domainMap: {
          items: [
            { id: "concept-and", label: "Conjunção" },
            { id: "concept-or", label: "Disjunção" }
          ],
          practiceVariants: []
        }
      }
    ],
    sourceLedger: sourceLedgerResult.sourceLedger
  });

  const misconception = courseGraph.misconceptions.find((item) => item.misconceptionKind === "contrast_confusion");
  assert.equal(misconception?.conceptRef, "concept-and");
  assert.deepEqual(misconception?.relatedConceptRefs, ["concept-and", "concept-or"]);
  assert.ok(Array.isArray(misconception?.sourceClaimRefs) && misconception.sourceClaimRefs.length >= 1);
});

test("lesson domain map cria practiceVariants de fallback quando a lição só tem governança mínima", () => {
  const domainMap = buildLessonDomainMap({
    sourceGuideStructured: {
      lessonGoal: "Distinguir conjunção e disjunção.",
      notationRules: "Usar `∧` e `∨`.",
      commonErrors: "Confundir conjunção com disjunção."
    },
    microsequences: []
  });
  assert.ok(domainMap.items.length >= 3);
  assert.ok(domainMap.practiceVariants.some((item) => item.variantKind === "explanation" && item.domainItemRef === "lesson-goal"));
  assert.ok(domainMap.practiceVariants.some((item) => item.variantKind === "fluency" && item.domainItemRef === "notation-1"));
  assert.ok(domainMap.practiceVariants.some((item) => item.variantKind === "common_error" && item.domainItemRef === "error-1"));
});

test("course graph validation bloqueia sourceClaimRef inexistente", () => {
  const result = validateCourseForgeCourseGraph({
    courseGraph: {
      graphId: "graph-1",
      concepts: [
        {
          conceptId: "concept-1",
          label: "Conjunção",
          lessonKey: "lesson-1",
          sourceClaimRefs: ["claim-ausente"]
        }
      ],
      objectives: [],
      prerequisiteEdges: [],
      assessmentTargets: [],
      practiceVariants: []
    },
    lessonPlans: [{ lessonKey: "lesson-1", sourceGuideStructured: { lessonGoal: "Objetivo." } }],
    sourceLedger: [{ id: "src_1", title: "Fonte 1", spans: [{ text: "A conjunção exige duas proposições verdadeiras." }] }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockingIssues.some((item) => item.type === "invalid_claim_ref"));
});

test("course graph validation avisa quando a lição pede comparacao sem alvo avaliativo explicito", () => {
  const result = validateCourseForgeCourseGraph({
    courseGraph: {
      graphId: "graph-1",
      concepts: [
        { conceptId: "concept-and", label: "Conjunção", lessonKey: "lesson-1" },
        { conceptId: "concept-or", label: "Disjunção", lessonKey: "lesson-1" }
      ],
      objectives: [{ objectiveId: "obj-1", lessonKey: "lesson-1", description: "Comparar conjunção e disjunção." }],
      prerequisiteEdges: [],
      assessmentTargets: [],
      practiceVariants: []
    },
    lessonPlans: [
      {
        lessonKey: "lesson-1",
        sourceGuideStructured: { lessonGoal: "Comparar conjunção e disjunção." }
      }
    ],
    sourceLedger: [
      {
        id: "src_1",
        title: "Fonte 1",
        spans: [{ text: "A conjunção exige duas proposições verdadeiras. A disjunção aceita pelo menos uma proposição verdadeira." }]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((item) => item.type === "missing_comparison_target"));
});

test("course graph validation avisa quando conceito comparativo perde prerequisitos dos conceitos-base", () => {
  const result = validateCourseForgeCourseGraph({
    courseGraph: {
      graphId: "graph-1",
      concepts: [
        { conceptId: "concept-and", label: "Conjunção", lessonKey: "lesson-1" },
        { conceptId: "concept-or", label: "Disjunção", lessonKey: "lesson-1" },
        {
          conceptId: "comparison-and-or",
          label: "Diferença entre Conjunção e Disjunção",
          kind: "comparison",
          lessonKey: "lesson-1",
          relatedConceptRefs: ["concept-and", "concept-or"]
        }
      ],
      objectives: [{ objectiveId: "obj-1", lessonKey: "lesson-1", description: "Comparar conjunção e disjunção." }],
      prerequisiteEdges: [{ from: "concept-and", to: "comparison-and-or", lessonKey: "lesson-1" }],
      misconceptions: [],
      assessmentTargets: [{ targetId: "target-1", lessonKey: "lesson-1", conceptRef: "comparison-and-or", targetKind: "comparison" }],
      practiceVariants: []
    },
    lessonPlans: [
      {
        lessonKey: "lesson-1",
        sourceGuideStructured: { lessonGoal: "Comparar conjunção e disjunção." }
      }
    ],
    sourceLedger: [
      {
        id: "src_1",
        title: "Fonte 1",
        spans: [{ text: "A conjunção exige duas proposições verdadeiras. A disjunção aceita pelo menos uma proposição verdadeira." }]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((item) => item.type === "missing_comparison_prerequisites"));
});

test("auditoria de prerequisitos bloqueia pratica antes da preparacao", () => {
  const result = auditCourseForgePrerequisiteCoverage({
    courseGraph: {
      prerequisiteEdges: [{ from: "concept-base", to: "concept-avancado", lessonKey: "lesson-1" }]
    },
    microsequencePlans: [
      {
        lessonKey: "lesson-1",
        microsequences: [
          {
            key: "micro-1",
            title: "Aplicação direta",
            coverageRole: "practice",
            domainRefs: ["concept-avancado"]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.type === "missing_prerequisite_preparation"));
  assert.ok(result.issues.some((item) => item.type === "practice_before_explanation"));
});

test("auditoria de intervencao cobra contraste explicito em reforco local", () => {
  const result = auditCourseForgeInterventionDidacticCoherence({
    interventionPlan: {
      actions: [
        {
          requestedChangeId: "requested_change_1",
          didacticInterventionType: "contrast_reinforcement",
          expectsNewMicrosequence: false,
          existingMicrosequenceKey: "micro-1",
          target: {
            courseKey: "course-1",
            moduleKey: "module-1",
            lessonKey: "lesson-1"
          }
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
            title: "Revisão curta",
            didacticPurpose: "Retomar o conceito.",
            coverageRole: "explain",
            tags: ["revisao"]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.type === "intervention_type_mismatch"));
});

test("auditoria de intervencao cobra pratica guiada em ponte de pratica", () => {
  const result = auditCourseForgeInterventionDidacticCoherence({
    interventionPlan: {
      actions: [
        {
          requestedChangeId: "requested_change_1",
          didacticInterventionType: "guided_practice_bridge",
          expectsNewMicrosequence: true,
          target: {
            courseKey: "course-1",
            moduleKey: "module-1",
            lessonKey: "lesson-1"
          }
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
            key: "micro-bridge",
            title: "Ponte conceitual",
            didacticPurpose: "Explicar a base antes da aplicação.",
            coverageRole: "explain",
            tags: ["ponte"]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.type === "intervention_type_mismatch"));
});

test("auditoria de intervencao aceita fechamento explicito de pre-requisito", () => {
  const result = auditCourseForgeInterventionDidacticCoherence({
    interventionPlan: {
      actions: [
        {
          requestedChangeId: "requested_change_1",
          didacticInterventionType: "prerequisite_tightening",
          expectsNewMicrosequence: true,
          target: {
            courseKey: "course-1",
            moduleKey: "module-1",
            lessonKey: "lesson-1"
          }
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
            key: "micro-base",
            title: "Ponte de base",
            didacticPurpose: "Preparar a base antes da prática principal.",
            coverageRole: "explain",
            tags: ["ponte", "base"]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("compila diretivas de reparo especificas a partir da auditoria de intervencao", () => {
  const result = buildCourseForgeMicrosequenceRepairDirectives({
    adherenceAudit: {
      issues: [
        {
          type: "missing_domain_refs",
          lessonKey: "lesson-1",
          microsequenceKey: "micro-1",
          evidence: "A microssequência ficou sem domainRefs.",
          requiredFix: "Vincular a microssequência a pelo menos um domainRef."
        }
      ]
    },
    interventionDidacticAudit: {
      issues: [
        {
          type: "intervention_type_mismatch",
          requestedChangeId: "requested_change_1",
          didacticInterventionType: "contrast_reinforcement",
          lessonKey: "lesson-1",
          microsequenceKey: "micro-1",
          evidence: "A ação pediu contraste, mas a microssequência ficou só expositiva."
        }
      ]
    },
    interventionPlan: {
      actions: [
        {
          requestedChangeId: "requested_change_1",
          didacticInterventionType: "contrast_reinforcement",
          target: {
            courseKey: "course-1",
            moduleKey: "module-1",
            lessonKey: "lesson-1"
          },
          existingMicrosequenceKey: "micro-1"
        }
      ]
    }
  });

  assert.equal(result.kind, "microsequence_repair_directives");
  assert.ok(result.directives.some((directive) => directive.directiveType === "rewrite_for_didactic_intervention_type"));
  assert.ok(result.directives.some((directive) => directive.directiveType === "repair_domain_coverage"));
});

test("auditoria de alinhamento avaliativo cobra formato pedido explicitamente", () => {
  const result = auditCourseForgeAssessmentAlignment({
    cardsFinal: [
      {
        publicCards: [{ title: "Resumo", say: "Texto expositivo." }]
      }
    ],
    assessmentProfile: {
      questionTypes: ["multiple_choice", "gap_fill"],
      examTypes: ["exam"],
      expectedPrecision: "high"
    },
    lessonPlans: [{ resourceTags: ["paragraph", "multiple_choice", "block_gap_fill"] }],
    courseGraph: {
      assessmentTargets: []
    }
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.type === "missing_multiple_choice"));
  assert.ok(result.issues.some((item) => item.type === "missing_gap_fill"));
  assert.ok(result.warnings.some((item) => item.type === "missing_assessment_targets"));
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

test("artifact store registra tipo e schema de artefato conhecido", () => {
  const store = createCourseForgeArtifactsStore();
  const artifact = store.saveArtifact("run-1", "course-intent", { operation: "create" });
  assert.equal(artifact.artifactType, "CourseIntent");
  assert.equal(artifact.schemaVersion, "aralearn.course_intent.v2");
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

  const planArchitecturePhase = result.runState.phases.find((phase) => phase.phaseId === "plan_architecture");
  const buildCardsPhase = result.runState.phases.find((phase) => phase.phaseId === "build_cards");
  const finalReportPhase = result.runState.phases.find((phase) => phase.phaseId === "final_report");
  assert.equal(planArchitecturePhase.modelId, "codex-cli-local");
  assert.deepEqual(planArchitecturePhase.target, {
    level: "project",
    courseKey: "",
    moduleKey: "",
    lessonKey: "",
    microsequenceKey: ""
  });
  assert.ok(planArchitecturePhase.artifactIds.some((artifactId) => artifactId.endsWith(":architecture-draft")));
  assert.equal(buildCardsPhase.modelId, "codex-cli-local");
  assert.ok(buildCardsPhase.artifactIds.some((artifactId) => artifactId.endsWith(":card-drafts")));
  assert.equal(finalReportPhase.modelId, "");
  assert.ok(finalReportPhase.artifactIds.some((artifactId) => artifactId.endsWith(":final-report")));
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
    ["update_course", "update_module", "update_lesson", "update_microsequence", "add_card"]
  );
  const addOperation = patch.operations.find((item) => item.op === "add_card");
  assert.equal(addOperation.card.title, "Card novo");
  assert.equal(patch.events[0].eventType, "sync_microsequence_cards");
});

test("compileCourseStructureToPatch remove cards excedentes com diff semântico", () => {
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
                      status: "ready",
                      included: true,
                      cards: [
                        { key: "card-1", title: "Card 1", say: "Texto 1." },
                        { key: "card-2", title: "Card 2", say: "Texto 2." }
                      ]
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
              publicCards: [{ title: "Card 1", say: "Texto 1 revisado." }]
            }
          ]
        }
      ]
    }
  });

  assert.ok(patch.operations.some((item) => item.op === "update_card"));
  assert.ok(patch.operations.some((item) => item.op === "delete_card"));
  assert.equal(patch.events[0].stats.deleteCount, 1);
});

test("compileCourseStructureToPatch materializa requestedChange como evento semântico auditável", () => {
  const intent = resolveCourseForgeIntent({
    operation: "repair",
    scope: {
      level: "microsequence",
      courseKey: "course-1",
      moduleKey: "module-1",
      lessonKey: "lesson-1",
      microsequenceKey: "micro-1"
    }
  });
  const interventionPlan = {
    actions: [
        {
          actionId: "intervention_action_1",
          requestedChangeId: "requested_change_1",
          patchStrategy: "patch_existing_microsequence",
          didacticInterventionType: "contrast_reinforcement",
          semanticOperation: "reinforce_existing_microsequence",
          reason: "Reforçar este trecho localmente.",
          evidence: {
            studentPrompt: "Ainda não entendi a diferença.",
            rationale: "A trilha atual ainda salta do conceito para a prática."
        },
        lessonTargets: [
          {
            courseKey: "course-1",
            moduleKey: "module-1",
            lessonKey: "lesson-1"
          }
        ],
        existingMicrosequenceKey: "micro-1",
        expectsNewMicrosequence: false
      }
    ]
  };
  const patch = compileCourseStructureToPatch({
    intent,
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
                  presetId: "default",
                  resourceTags: ["paragraph"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: [
                    {
                      key: "micro-1",
                      title: "Microssequência antiga",
                      status: "ready",
                      included: true,
                      cards: [{ key: "card-1", title: "Card 1", say: "Texto 1." }]
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
              publicCards: [{ title: "Card 1", say: "Texto 1 revisado." }]
            }
          ]
        }
      ]
    },
    interventionPlan
  });

  const applyEvent = patch.events.find((item) => item.eventType === "apply_requested_change");
  assert.equal(applyEvent.requestedChangeId, "requested_change_1");
  assert.equal(applyEvent.didacticInterventionType, "contrast_reinforcement");
  assert.equal(applyEvent.semanticOperation, "reinforce_existing_microsequence");
  assert.equal(applyEvent.reason, "Reforçar este trecho localmente.");
  assert.equal(applyEvent.appliedAs, "replace_microsequence_with_contrast");
  assert.ok(patch.operations.some((item) => item.op === "replace_microsequence_with_contrast"));
  assert.ok(!patch.operations.some((item) => item.op === "update_card"));
  assert.equal(
    validateCourseForgePatch(patch, {
      intent,
      interventionPlan
    }).ok,
    true
  );
});

test("compileCourseStructureToPatch evita update_microsequence quando só os cards mudam", () => {
  const patch = compileCourseStructureToPatch({
    intent: resolveCourseForgeIntent({
      operation: "repair",
      scope: {
        level: "microsequence",
        courseKey: "course-1",
        moduleKey: "module-1",
        lessonKey: "lesson-1",
        microsequenceKey: "micro-1"
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
                  presetId: "default",
                  resourceTags: ["paragraph"],
                  contentTypeTags: ["theory"],
                  learningActionTags: ["read"],
                  supportLevel: "guided",
                  microsequences: [
                    {
                      key: "micro-1",
                      title: "Revisão",
                      description: "Resumo inicial.",
                      didacticPurpose: "Revisar conceito.",
                      coverageRole: "explain",
                      status: "ready",
                      included: true,
                      tags: ["base"],
                      cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
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
              title: "Revisão",
              description: "Resumo inicial.",
              didacticPurpose: "Revisar conceito.",
              coverageRole: "explain",
              tags: ["base"],
              publicCards: [{ title: "Card 1", say: "Texto revisado." }]
            }
          ]
        }
      ]
    }
  });

  assert.ok(!patch.operations.some((item) => item.op === "update_microsequence"));
  assert.ok(patch.operations.some((item) => item.op === "update_card"));
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
  assert.ok(result.patch.operations.some((item) => item.op === "add_card"));
  assert.ok(result.patch.events.some((item) => item.eventType === "sync_microsequence_cards"));
  const buildContractPhase = result.runState.phases.find((phase) => phase.phaseId === "build_microsequence_contract");
  const buildCardsPhase = result.runState.phases.find((phase) => phase.phaseId === "build_cards");
  assert.deepEqual(buildContractPhase.target, {
    level: "microsequence",
    courseKey: "course-logica",
    moduleKey: "module-base",
    lessonKey: "lesson-proposicoes",
    microsequenceKey: "microsequence-revisao"
  });
  assert.deepEqual(buildCardsPhase.target, {
    level: "microsequence",
    courseKey: "course-logica",
    moduleKey: "module-base",
    lessonKey: "lesson-proposicoes",
    microsequenceKey: "microsequence-revisao"
  });
  assert.equal(buildCardsPhase.modelId, "codex-cli-local");
  assert.ok(buildContractPhase.artifactIds.some((artifactId) => artifactId.endsWith(":microsequence-contracts")));
  assert.ok(buildCardsPhase.artifactIds.some((artifactId) => artifactId.endsWith(":card-drafts")));
});

test("tutor_only responde duvida local sem gerar patch", async () => {
  const provider = createFakeProvider({
    script: {
      answer_locally: [
        {
          responseText: "Uma proposição é um enunciado que pode ser verdadeiro ou falso.",
          studyTrackConnection: "Depois disso, volte para a microssequência atual e use esse critério para revisar os exemplos.",
          recommendedAction: "answer_only",
          rationale: "A dúvida pode ser resolvida sem editar o material."
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const projectDocument = {
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
                    status: "ready",
                    included: true,
                    cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const result = await runCourseForge({
    intent: {
      scope: {
        level: "microsequence",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes",
        microsequenceKey: "microsequence-revisao"
      },
      promptText: "Não entendi esta microssequência. O que é uma proposição?",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument,
    providerRegistry: registry,
    providerId: "fake"
  });

  assert.equal(result.runState.intent.generationDepth, "tutor_only");
  assert.equal(result.interventionResponse.recommendedAction, "answer_only");
  assert.equal(result.interventionRequest.status, "not_needed");
  assert.equal(result.interventionRequest.editorIntent, null);
  assert.equal(result.patch, null);
  assert.deepEqual(result.projectDocument, projectDocument);
  assert.ok(result.artifacts.some((artifact) => artifact.name === "intervention-response"));
  assert.ok(result.artifacts.some((artifact) => artifact.name === "intervention-request"));
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "compile_patch"));
});

test("tutor_only compila pedido estruturado quando recomenda patch no material atual", async () => {
  const provider = createFakeProvider({
    script: {
      answer_locally: [
        {
          responseText: "O texto atual resolve parte da dúvida, mas ainda falta um exemplo guiado para fixar o critério.",
          studyTrackConnection: "Volte para esta microssequência depois da correção e compare exemplo, não exemplo e contraexemplo.",
          recommendedAction: "suggest_editor_patch",
          rationale: "A explicação existente está curta e não ancora o contraste necessário."
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      scope: {
        level: "microsequence",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes",
        microsequenceKey: "microsequence-revisao"
      },
      promptText: "Ainda não entendi como distinguir proposição de pergunta.",
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
                      status: "ready",
                      included: true,
                      cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
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

  assert.equal(result.patch, null);
  assert.equal(result.interventionRequest.status, "ready");
  assert.equal(result.interventionRequest.editorIntent.operation, "reinforce");
  assert.equal(result.interventionRequest.editorIntent.interventionModeHint, "targeted_single_microsequence");
  assert.deepEqual(result.interventionRequest.target, {
    level: "microsequence",
    courseKey: "course-logica",
    moduleKey: "module-base",
    lessonKey: "lesson-proposicoes",
    microsequenceKey: "microsequence-revisao"
  });
  assert.ok(result.interventionRequest.requestedChanges.some((change) => change.patchStrategy === "patch_existing_microsequence"));
  assert.ok(result.interventionRequest.requestedChanges.some((change) => change.didacticInterventionType === "contrast_reinforcement"));
  assert.ok(result.artifacts.some((artifact) => artifact.name === "intervention-request-audit"));
});

test("editor consome InterventionRequest pronto sem voltar ao subfluxo do Tutor", async () => {
  const tutorProvider = createFakeProvider({
    script: {
      answer_locally: [
        {
          responseText: "O texto atual resolve parte da dúvida, mas ainda falta um exemplo guiado para fixar o critério.",
          studyTrackConnection: "Volte para esta microssequência depois da correção e compare exemplo, não exemplo e contraexemplo.",
          recommendedAction: "suggest_editor_patch",
          rationale: "A explicação existente está curta e não ancora o contraste necessário."
        }
      ]
    }
  });
  const tutorRegistry = createProviderRegistry({ providers: [tutorProvider] });
  const projectDocument = {
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
                    status: "ready",
                    included: true,
                    cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const tutorResult = await runCourseForge({
    intent: {
      scope: {
        level: "microsequence",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes",
        microsequenceKey: "microsequence-revisao"
      },
      promptText: "Ainda não entendi como distinguir proposição de pergunta.",
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument,
    providerRegistry: tutorRegistry,
    providerId: "fake"
  });

  const editorProvider = createFakeProvider({
    script: {
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Critério central",
              text: "Uma proposição é um enunciado que admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Contraste guiado",
              text: "Perguntas e ordens não são proposições porque não podem ser classificadas como verdadeiras ou falsas.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Checagem rápida",
              question: "Qual item é proposição?",
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
  const editorRegistry = createProviderRegistry({ providers: [editorProvider] });
  const result = await runCourseForge({
    intent: {
      interventionRequest: tutorResult.interventionRequest,
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument,
    providerRegistry: editorRegistry,
    providerId: "fake"
  });

  assert.equal(result.runState.intent.contextSummary.cameFromInterventionRequest, true);
  assert.equal(result.runState.intent.operation, "reinforce");
  assert.equal(result.runState.intent.scope.microsequenceKey, "microsequence-revisao");
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "answer_locally"));
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "audit_intervention"));
  assert.ok(result.patch.operations.some((item) => item.op === "replace_microsequence_with_contrast"));
  assert.ok(!result.patch.operations.some((item) => item.op === "update_card"));
  assert.ok(
    result.patch.events.some(
      (item) =>
        item.eventType === "apply_requested_change"
        && item.requestedChangeId === "requested_change_1"
        && item.didacticInterventionType === "contrast_reinforcement"
        && item.semanticOperation === "reinforce_existing_microsequence"
        && item.appliedAs === "replace_microsequence_with_contrast"
    )
  );
  assert.equal(result.projectDocument.courses[0].modules[0].lessons[0].microsequences[0].cards.length, 3);
  assert.equal(result.interventionPlan.planningMode, "existing_only");
  assert.equal(result.interventionPlan.actions[0].didacticInterventionType, "contrast_reinforcement");
  assert.ok(result.artifacts.some((artifact) => artifact.name === "intervention-plan"));
});

test("tutor_only eleva alvo para lição quando conclui que falta nova microssequência", async () => {
  const provider = createFakeProvider({
    script: {
      answer_locally: [
        {
          responseText: "A trilha atual precisa de uma microssequência intermediária antes desta prática.",
          studyTrackConnection: "Depois da inserção dessa ponte, retome esta prática com os novos exemplos.",
          recommendedAction: "needs_new_microsequence",
          rationale: "Falta uma ponte didática entre definição e aplicação."
        }
      ]
    }
  });
  const registry = createProviderRegistry({ providers: [provider] });
  const result = await runCourseForge({
    intent: {
      scope: {
        level: "microsequence",
        courseKey: "course-logica",
        moduleKey: "module-base",
        lessonKey: "lesson-proposicoes",
        microsequenceKey: "microsequence-revisao"
      },
      promptText: "Não entendi esta microssequência. Ainda está dando um salto grande demais para mim.",
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
                      status: "ready",
                      included: true,
                      cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
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

  assert.equal(result.patch, null);
  assert.equal(result.interventionRequest.status, "ready");
  assert.equal(result.interventionRequest.editorIntent.operation, "extend");
  assert.equal(result.interventionRequest.editorIntent.interventionModeHint, "targeted_scope_expansion");
  assert.deepEqual(result.interventionRequest.target, {
    level: "lesson",
    courseKey: "course-logica",
    moduleKey: "module-base",
    lessonKey: "lesson-proposicoes",
    microsequenceKey: ""
  });
  assert.ok(result.interventionRequest.requestedChanges.some((change) => change.type === "add_new_microsequence"));
  assert.ok(result.interventionRequest.requestedChanges.some((change) => change.didacticInterventionType === "prerequisite_tightening"));
});

test("editor usa requestedChanges para limitar expansao a nova microssequencia pedida", async () => {
  const provider = createFakeProvider({
    script: {
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              courseKey: "course-logica",
              moduleKey: "module-base",
              lessonKey: "lesson-proposicoes",
              microsequences: [
                {
                  key: "microsequence-extra",
                  title: "Expansão indevida",
                  description: "Não deveria entrar.",
                  objective: "Escopo indevido.",
                  domainRefs: ["domain-proposicao"],
                  didacticPurpose: "Expandir além do pedido.",
                  coverageRole: "practice",
                  tags: ["extra"]
                },
                {
                  key: "microsequence-ponte",
                  title: "Ponte entre definição e aplicação",
                  description: "Cria a transição necessária.",
                  objective: "Reduzir o salto cognitivo.",
                  domainRefs: ["domain-proposicao"],
                  didacticPurpose: "Criar ponte didática.",
                  coverageRole: "explain",
                  tags: ["ponte"]
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
              title: "Critério",
              text: "Uma proposição admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Ponte",
              text: "Antes de aplicar, compare enunciados, perguntas e ordens.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Checagem",
              question: "Qual item é proposição?",
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
  const projectDocument = {
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
                domainMap: {
                  items: [
                    {
                      id: "domain-proposicao",
                      label: "Proposição",
                      priority: "core"
                    }
                  ],
                  practiceVariants: []
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
                    status: "ready",
                    included: true,
                    domainRefs: ["domain-proposicao"],
                    cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
                  },
                  {
                    key: "microsequence-pratica",
                    title: "Prática inicial",
                    description: "Exercícios básicos.",
                    didacticPurpose: "Praticar o conceito.",
                    coverageRole: "practice",
                    status: "ready",
                    included: true,
                    domainRefs: ["domain-proposicao"],
                    practiceVariantRefs: [],
                    cards: [
                      {
                        key: "card-2",
                        title: "Card 2",
                        ask: "Qual item é proposição?",
                        answer: "2 + 2 = 4.",
                        wrong: ["Feche a porta.", "Que horas são?"]
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
  const result = await runCourseForge({
    intent: {
      interventionRequest: {
        status: "ready",
        recommendedAction: "needs_new_microsequence",
        studentPrompt: "Ainda está dando um salto grande demais para mim.",
        rationale: "Falta uma ponte didática entre definição e aplicação.",
        target: {
          level: "lesson",
          courseKey: "course-logica",
          moduleKey: "module-base",
          lessonKey: "lesson-proposicoes",
          microsequenceKey: ""
        },
        editorIntent: {
          operation: "extend",
          generationDepthHint: "reinforce_only",
          interventionModeHint: "targeted_scope_expansion",
          requestedBy: "tutor"
        },
        requestedChanges: [
          {
            type: "add_new_microsequence",
            operation: "extend",
            patchStrategy: "add_microsequence",
            didacticInterventionType: "explanatory_bridge",
            target: {
              level: "lesson",
              courseKey: "course-logica",
              moduleKey: "module-base",
              lessonKey: "lesson-proposicoes",
              microsequenceKey: ""
            },
            reason: "Inserir uma ponte didática local."
          }
        ],
        contextSnapshot: {
          lessonKeys: ["lesson-proposicoes"],
          microsequenceKeys: ["microsequence-revisao"],
          reusableMicrosequenceCount: 1
        }
      },
      attachments: [{ id: "src_1", name: "ementa.pdf", type: "application/pdf" }]
    },
    projectDocument,
    providerRegistry: registry,
    providerId: "fake"
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(result.interventionPlan.planningMode, "new_only");
  assert.equal(result.interventionPlan.actions[0].didacticInterventionType, "explanatory_bridge");
  assert.ok(result.artifacts.some((artifact) => artifact.name === "intervention-didactic-audit"));
  assert.equal(result.interventionPlan.actions[0].insertionPolicy.placement, "after_anchor");
  assert.equal(result.interventionPlan.actions[0].insertionPolicy.anchorMicrosequenceKey, "microsequence-revisao");
  assert.ok(result.patch.operations.some((item) => item.op === "insert_explanatory_bridge_after"));
  assert.ok(!result.patch.operations.some((item) => item.op === "reorder_children" && item.childType === "microsequence"));
  assert.ok(
    result.patch.events.some(
      (item) =>
        item.eventType === "apply_requested_change"
        && item.requestedChangeId === "requested_change_1"
        && item.didacticInterventionType === "explanatory_bridge"
        && item.semanticOperation === "add_new_microsequence"
        && item.appliedAs === "insert_explanatory_bridge_after"
        && item.anchorMicrosequenceKey === "microsequence-revisao"
    )
  );
  assert.ok(!result.patch.operations.some((item) => item.op === "update_microsequence" && item.microsequenceKey === "microsequence-revisao"));
  assert.equal(lesson.microsequences.length, 3);
  assert.deepEqual(
    lesson.microsequences.map((microsequence) => microsequence.key),
    ["microsequence-revisao", "microsequence-ponte", "microsequence-pratica"]
  );
  assert.ok(lesson.microsequences.some((microsequence) => microsequence.key === "microsequence-ponte"));
  assert.ok(!lesson.microsequences.some((microsequence) => microsequence.key === "microsequence-extra"));
});

test("editor especializa ponte local de pratica em operacao semantica propria", async () => {
  const provider = createFakeProvider({
    script: {
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      plan_microsequences: [
        {
          microsequencePlans: [
            {
              courseKey: "course-logica",
              moduleKey: "module-base",
              lessonKey: "lesson-proposicoes",
              microsequences: [
                {
                  key: "microsequence-pratica-guiada",
                  title: "Prática guiada intermediária",
                  description: "Exercício ponte antes da prática principal.",
                  objective: "Fixar o critério com ajuda.",
                  domainRefs: ["domain-proposicao"],
                  didacticPurpose: "Guiar a primeira prática local.",
                  coverageRole: "practice",
                  tags: ["ponte", "pratica"]
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
              title: "Critério retomado",
              text: "Uma proposição admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo guiado",
              text: "A frase `2 + 2 = 4` é proposição porque pode ser julgada como verdadeira ou falsa.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Treino guiado",
              question: "Qual item é proposição?",
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
      interventionRequest: {
        status: "ready",
        recommendedAction: "needs_new_microsequence",
        studentPrompt: "Ainda preciso de um treino guiado antes desta prática.",
        rationale: "Falta um degrau de prática guiada antes da aplicação atual.",
        target: {
          level: "lesson",
          courseKey: "course-logica",
          moduleKey: "module-base",
          lessonKey: "lesson-proposicoes",
          microsequenceKey: ""
        },
        editorIntent: {
          operation: "extend",
          generationDepthHint: "reinforce_only",
          interventionModeHint: "targeted_scope_expansion",
          requestedBy: "tutor"
        },
        requestedChanges: [
          {
            type: "add_new_microsequence",
            operation: "extend",
            patchStrategy: "add_microsequence",
            didacticInterventionType: "guided_practice_bridge",
            target: {
              level: "lesson",
              courseKey: "course-logica",
              moduleKey: "module-base",
              lessonKey: "lesson-proposicoes",
              microsequenceKey: ""
            },
            reason: "Inserir prática guiada local antes da prática existente."
          }
        ],
        contextSnapshot: {
          lessonKeys: ["lesson-proposicoes"],
          microsequenceKeys: ["microsequence-revisao"],
          reusableMicrosequenceCount: 1
        }
      },
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
                  domainMap: {
                    items: [
                      {
                        id: "domain-proposicao",
                        label: "Proposição",
                        priority: "core"
                      }
                    ],
                    practiceVariants: []
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
                      status: "ready",
                      included: true,
                      domainRefs: ["domain-proposicao"],
                      cards: [{ key: "card-1", title: "Card 1", say: "Texto antigo." }]
                    },
                    {
                      key: "microsequence-pratica",
                      title: "Prática inicial",
                      description: "Exercícios básicos.",
                      didacticPurpose: "Praticar o conceito.",
                      coverageRole: "practice",
                      status: "ready",
                      included: true,
                      domainRefs: ["domain-proposicao"],
                      cards: [
                        {
                          key: "card-2",
                          title: "Card 2",
                          ask: "Qual item é proposição?",
                          answer: "2 + 2 = 4.",
                          wrong: ["Feche a porta.", "Que horas são?"]
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
    },
    providerRegistry: registry,
    providerId: "fake"
  });

  assert.ok(result.patch.operations.some((item) => item.op === "insert_practice_bridge_after"));
  assert.ok(
    result.patch.events.some(
      (item) =>
        item.eventType === "apply_requested_change"
        && item.didacticInterventionType === "guided_practice_bridge"
        && item.appliedAs === "insert_practice_bridge_after"
        && item.anchorMicrosequenceKey === "microsequence-revisao"
    )
  );
  assert.equal(result.interventionPlan.actions[0].didacticInterventionType, "guided_practice_bridge");
  assert.deepEqual(
    result.projectDocument.courses[0].modules[0].lessons[0].microsequences.map((microsequence) => microsequence.key),
    ["microsequence-revisao", "microsequence-pratica-guiada", "microsequence-pratica"]
  );
});

test("repair_only em lição com microssequências existentes reaproveita alvo local mínimo", async () => {
  const provider = createFakeProvider({
    script: {
      audit_microsequences: [{ approved: true, issues: [], warnings: [] }],
      build_cards: [
        {
          cards: [
            {
              position: 1,
              resourceType: "paragraph",
              title: "Definição revisada",
              text: "Uma proposição admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo revisado",
              text: "`2 + 2 = 4` é proposição porque pode ser verdadeiro ou falso.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Checagem rápida",
              question: "Qual item é proposição?",
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
                  microsequences: [
                    {
                      key: "microsequence-explicacao",
                      title: "Explicação",
                      description: "Resumo inicial.",
                      didacticPurpose: "Explicar proposições.",
                      coverageRole: "explain",
                      status: "ready",
                      included: true,
                      cards: [{ key: "card-antigo", title: "Card antigo", say: "Texto antigo." }]
                    },
                    {
                      key: "microsequence-pratica",
                      title: "Prática",
                      description: "Prática inicial.",
                      didacticPurpose: "Praticar proposições.",
                      coverageRole: "practice",
                      status: "ready",
                      included: true,
                      cards: [{ key: "card-pratica", title: "Prática antiga", ask: "Pergunta?", answer: "Resp", wrong: ["A"] }]
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

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(result.runState.intent.intervention.mode, "targeted_existing_microsequences");
  assert.ok(!result.runState.phases.some((phase) => phase.phaseId === "build_course_graph"));
  assert.equal(lesson.microsequences[0].cards.length, 3);
  assert.equal(lesson.microsequences[1].cards.length, 1);
  assert.ok(
    result.patch.operations.every(
      (item) => item.microsequenceKey !== "microsequence-pratica" || !["add_card", "update_card", "delete_card"].includes(item.op)
    )
  );
  assert.ok(result.patch.operations.some((item) => item.microsequenceKey === "microsequence-explicacao"));
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

test("reinforce_only em escopo de lição reaproveita o subfluxo local sem arquitetura ampla", async () => {
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
                  key: "microsequence-reforco",
                  title: "Reforço rápido",
                  objective: "Praticar reconhecimento de proposições.",
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
              title: "Critério",
              text: "Uma proposição admite valor de verdade.",
              sourceRefs: ["src_1"]
            },
            {
              position: 2,
              resourceType: "paragraph",
              title: "Exemplo rápido",
              text: "`5 > 3` é proposição.",
              sourceRefs: ["src_1"]
            },
            {
              position: 3,
              resourceType: "multiple_choice",
              title: "Prática",
              question: "Qual opção é uma proposição?",
              options: [
                { optionId: "a", label: "Feche a janela." },
                { optionId: "b", label: "5 > 3." },
                { optionId: "c", label: "Quem chegou?" }
              ],
              correctOptionId: "b",
              feedback: "`5 > 3` pode ser classificada como verdadeira ou falsa.",
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
      promptText: "Completar lacunas desta lição.",
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

  assert.equal(result.runState.intent.operation, "reinforce");
  assert.equal(result.runState.intent.generationDepth, "reinforce_only");
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
  const courseIntentArtifact = result.artifacts.find((item) => item.name === "course-intent");
  const assessmentProfileArtifact = result.artifacts.find((item) => item.name === "assessment-profile");
  const courseGraphArtifact = result.artifacts.find((item) => item.name === "course-graph");
  const lessonGovernanceArtifact = result.artifacts.find((item) => item.name === "lesson-governance");
  const cardPlansArtifact = result.artifacts.find((item) => item.name === "card-plans");
  const courseGraphAuditArtifact = result.artifacts.find((item) => item.name === "course-graph-audit");
  assert.equal(lesson.domainMap.items[0].id, "domain-lan");
  assert.deepEqual(microsequence.domainRefs, ["domain-lan"]);
  assert.deepEqual(microsequence.practiceVariantRefs, ["variant-lan-discriminacao"]);
  assert.equal(courseIntentArtifact.artifactType, "CourseIntent");
  assert.equal(assessmentProfileArtifact.artifactType, "AssessmentProfile");
  assert.equal(courseGraphArtifact.artifactType, "CourseGraph");
  assert.equal(courseGraphAuditArtifact.artifactType, "CourseGraphAudit");
  assert.equal(lessonGovernanceArtifact.artifactType, "LessonGovernanceSet");
  assert.equal(cardPlansArtifact.artifactType, "CardPlanSet");
  assert.equal(courseGraphAuditArtifact.content.approved, true);
  assert.equal(courseGraphArtifact.content.concepts[0].conceptId, "domain-lan");
  assert.equal(lessonGovernanceArtifact.content[0].lessonKey, "lesson-rede-local");
  assert.equal(cardPlansArtifact.content[0].cards[0].role, "anchor");
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
        ({ artifacts = [], prompt = "" }) => {
          const directivesArtifact = artifacts.find((item) => item.name === "microsequence-repair-directives");
          assert.ok(directivesArtifact);
          const directives = JSON.parse(directivesArtifact.content);
          assert.ok(Array.isArray(directives.directives));
          assert.ok(directives.directives.some((directive) => directive.directiveType === "repair_domain_coverage"));
          assert.match(prompt, /diretivas prioritarias|diretivas prioritárias/i);
          return {
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
          };
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
