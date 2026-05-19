import test from "node:test";
import assert from "node:assert/strict";

import { renderGenerationPanelOverlay, renderHomeScreen } from "../src/ui/renderHomeScreen.js";

test("renderiza a home como lista única de cursos com ações globais e geração contextual", () => {
  const html = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-teste",
          title: "Curso de teste",
          description: "Descrição",
          modules: [
            {
              key: "module-teste",
              title: "Módulo",
              lessons: [
                {
                  key: "lesson-teste",
                  title: "Lição",
                  microsequences: [
                    {
                      key: "microsequence-teste",
                      title: "Microssequência",
                      cards: [{ key: "card-teste", title: "Card", say: "Conteúdo" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    progress: {
      version: 1,
      lessons: {
        "course-teste::module-teste::lesson-teste": {
          cursor: 0,
          completedCardKeys: ["card-teste"]
        }
      }
    },
    editorSupport: {
      activeStructureVersionId: "v2",
      structureVersionTabs: [
        { versionId: "v1", lineage: "C1", displayId: "C1", updatedAt: "2026-05-10T18:40:00.000Z" },
        { versionId: "v2", lineage: "C1 → C2", displayId: "C2", updatedAt: "2026-05-10T18:55:00.000Z" }
      ]
    }
  });

  assert.match(html, /data-action="open-generation-panel-global"/);
  assert.match(html, /data-action="quick-create-course"/);
  assert.match(html, /data-action="open-home-actions"/);
  assert.match(html, /class="topbar home-topbar navigation-topbar"/);
  assert.doesNotMatch(html, /data-action="select-structure-version"/);
  assert.doesNotMatch(html, /C1 → C2/);
  assert.doesNotMatch(html, /10\/05 18:55/);
  assert.match(html, /class="courses-home-list navigation-list"/);
  assert.match(html, /class="course-copy navigation-main"/);
  assert.match(html, /data-action="open-course-actions"/);
  assert.match(html, /data-action="open-generation-panel-course" data-course-key="course-teste"/);
  assert.match(html, /data-action="open-course" data-course-key="course-teste"/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="course" data-course-key="course-teste"/);
  assert.match(html, /class="course-actions navigation-actions"/);
  assert.ok(html.indexOf('data-action="open-generation-panel-global"') < html.indexOf('data-action="quick-create-course"'));
  assert.ok(html.indexOf('data-action="quick-create-course"') < html.indexOf('data-action="open-home-actions"'));
  assert.ok(html.indexOf('data-action="open-course-actions"') < html.indexOf('data-action="open-generation-panel-course"'));
  assert.doesNotMatch(html, /Organizar/);
  assert.match(html, /progress-meta-item-value">1\/1<\/span>/);
  assert.match(html, /card-progress-fill" style="width:100%"/);
  assert.match(html, /aria-label="1 módulo" title="1 módulo"/);
  assert.match(html, /aria-label="1 lição" title="1 lição"/);
  assert.doesNotMatch(html, /data-action="switch-home-tab"/);
  assert.doesNotMatch(html, /data-field="generate-course-input"/);
});

test("mantém description visível no card e não vaza sourceGuide na home", () => {
  const html = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-source-guide",
          title: "Curso com fonte-guia",
          description: "Resumo breve visível no card.",
          sourceGuide: "Texto longo de fonte-guia que não deve aparecer na superfície do card.",
          modules: []
        }
      ]
    },
    progress: { version: 1, lessons: {} }
  });

  assert.match(html, /Resumo breve visível no card\./);
  assert.doesNotMatch(html, /Texto longo de fonte-guia que não deve aparecer na superfície do card\./);
});

test("renderiza o painel contextual de geração com escopo top-down fixável", () => {
  const html = renderGenerationPanelOverlay({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-algebra",
          title: "Álgebra Linear",
          modules: [
            {
              key: "module-matrizes",
              title: "Matrizes",
              lessons: [
                {
                  key: "lesson-operacoes",
                  title: "Operações com matrizes",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    editorSupport: {
      generationDraft: {
        courseFixed: true,
        moduleFixed: true,
        lessonFixed: false,
        courseInput: "Álgebra Linear",
        courseKey: "course-algebra",
        moduleInput: "Matrizes",
        moduleKey: "module-matrizes",
        lessonInput: "",
        lessonKey: "",
        promptText: "Monte a base do curso.",
        attachments: []
      },
      generationUiState: {
        modules: [{ key: "module-matrizes", title: "Matrizes", lessons: [{ key: "lesson-operacoes", title: "Operações com matrizes" }] }],
        lessons: [{ key: "lesson-operacoes", title: "Operações com matrizes" }],
        moduleToggleEnabled: true,
        moduleInputEnabled: true,
        lessonToggleEnabled: true,
        lessonInputEnabled: false,
        canSubmit: true,
        actionLabel: "complementar este módulo",
        actionSummary: "Módulo existente + novas lições",
        actionIconName: "lesson"
      },
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      apiKey: "",
      localProviderStatus: { ok: false, checking: false, error: "" }
    }
  });

  assert.match(html, /data-action="close-generation-panel"/);
  assert.match(html, /data-action="clear-generation-scope"/);
  assert.match(html, /data-field="generate-course-input"/);
  assert.match(html, /data-field="generate-module-input"/);
  assert.match(html, /data-field="generate-lesson-input"/);
  assert.match(html, /data-field="generate-include-topic"/);
  assert.match(html, /data-field="generate-exclude-topic"/);
  assert.match(html, /aria-label="Pedido, conteúdo ou orientação" title="Pedido, conteúdo ou orientação"/);
  assert.match(html, /Álgebra Linear/);
  assert.match(html, /Módulo existente \+ novas lições/);
  assert.match(html, /data-action="generate-structure"/);
  assert.match(html, /aria-label="Gerar estrutura" title="Gerar estrutura"/);
  assert.match(html, /data-action="open-generation-attachment-picker" title="Anexar documento" aria-label="Anexar documento"/);
  assert.match(html, /data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt"/);
  assert.match(html, />Destino da árvore</);
  assert.match(html, />Escopo do módulo</);
  assert.match(html, /data-action="open-provider-config" title="Configurar IA" aria-label="Configurar IA"/);
  assert.doesNotMatch(html, /data-field="assist-api-key"/);
  assert.doesNotMatch(html, /Abrir planejamento didático/);
});

test("renderiza o painel contextual sem escopo fixado para geração global", () => {
  const html = renderGenerationPanelOverlay({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: []
    },
    editorSupport: {
      generationDraft: {
        courseFixed: false,
        moduleFixed: false,
        lessonFixed: false,
        courseInput: "",
        moduleInput: "",
        lessonInput: "",
        promptText: "",
        attachments: []
      },
      generationUiState: {
        modules: [],
        lessons: [],
        moduleToggleEnabled: false,
        moduleInputEnabled: false,
        lessonToggleEnabled: false,
        lessonInputEnabled: false,
        canSubmit: false,
        actionLabel: "criar este curso e planejar o primeiro módulo",
        actionSummary: "Curso novo + módulo planejado",
        actionIconName: "folder"
      },
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      apiKey: "",
      localProviderStatus: { ok: false, checking: false, error: "" }
    }
  });

  assert.match(html, /Curso novo \+ módulo planejado/);
  assert.match(html, /data-action="clear-generation-scope"[^>]+disabled aria-disabled="true"/);
  assert.match(html, /data-field="generate-module-input"[^>]+disabled aria-disabled="true"/);
});

test("renderiza popup de progresso top-down com chamadas ao modelo", () => {
  const html = renderGenerationPanelOverlay({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: []
    },
    editorSupport: {
      generationDraft: {
        promptText: "Gerar curso",
        attachments: [],
        isSubmitting: true,
        progress: {
          visible: true,
          status: "running",
          phaseId: "plan_architecture",
          phaseLabel: "Planejando arquitetura do curso",
          message: "Chamada ao modelo: Planejando arquitetura do curso (codex-cli-local).",
          modelId: "codex-cli-local",
          phaseIndex: 4,
          phaseCount: 19,
          history: [
            { type: "phase_started", message: "Lendo anexos e fontes. Etapa local do motor." },
            { type: "provider_call_started", message: "Chamada ao modelo: Planejando arquitetura do curso (codex-cli-local)." }
          ]
        }
      },
      generationUiState: {
        modules: [],
        lessons: [],
        canSubmit: true,
        actionSummary: "Curso, módulos e lições"
      },
      modelOptions: [{ value: "codex-cli-local", label: "Codex local" }],
      selectedModel: "codex-cli-local",
      apiKey: ""
    }
  });

  assert.match(html, /generation-progress-popup/);
  assert.match(html, /Planejando arquitetura do curso/);
  assert.match(html, /Aguardando resposta do modelo codex-cli-local/);
  assert.match(html, /4\/19/);
  assert.match(html, /generation-progress-phase-item is-current/);
  assert.doesNotMatch(html, /Lendo anexos e fontes\. Etapa local do motor\./);
});

test("renderiza o painel contextual com curso fixado para geração estrutural dentro do curso", () => {
  const html = renderGenerationPanelOverlay({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [{ key: "course-logic", title: "Lógica", modules: [] }]
    },
    editorSupport: {
      generationDraft: {
        courseFixed: true,
        moduleFixed: false,
        lessonFixed: false,
        courseInput: "Lógica",
        courseKey: "course-logic",
        moduleInput: "",
        lessonInput: "",
        promptText: "",
        attachments: []
      },
      generationUiState: {
        modules: [],
        lessons: [],
        moduleToggleEnabled: true,
        moduleInputEnabled: false,
        lessonToggleEnabled: false,
        lessonInputEnabled: false,
        canSubmit: false,
        actionLabel: "complementar este curso com um módulo novo ou existente",
        actionSummary: "Curso existente",
        actionIconName: "module"
      },
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      apiKey: "",
      localProviderStatus: { ok: false, checking: false, error: "" }
    }
  });

  assert.match(html, /Curso existente/);
  assert.match(html, /data-field="generate-course-input"[^>]+value="Lógica"/);
});

test("renderiza o painel contextual com lição fixada no fluxo único do CourseForge", () => {
  const html = renderGenerationPanelOverlay({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logic",
          title: "Lógica",
          modules: [
            {
              key: "module-intro",
              title: "Introdução",
              lessons: [{ key: "lesson-prop", title: "Proposições", microsequences: [] }]
            }
          ]
        }
      ]
    },
    editorSupport: {
      generationDraft: {
        courseFixed: true,
        moduleFixed: true,
        lessonFixed: true,
        courseInput: "Lógica",
        courseKey: "course-logic",
        moduleInput: "Introdução",
        moduleKey: "module-intro",
        lessonInput: "Proposições",
        lessonKey: "lesson-prop",
        promptText: "",
        attachments: []
      },
      generationUiState: {
        modules: [{ key: "module-intro", title: "Introdução", lessons: [{ key: "lesson-prop", title: "Proposições" }] }],
        lessons: [{ key: "lesson-prop", title: "Proposições" }],
        moduleToggleEnabled: true,
        moduleInputEnabled: true,
        lessonToggleEnabled: true,
        lessonInputEnabled: true,
        canSubmit: false,
        actionLabel: "complementar esta lição e planejar suas microssequências",
        actionHelpText: "",
        actionSummary: "Lição existente + microssequências planejadas",
        actionIconName: "lesson",
        generationMode: "generate-top-down-structure",
        panelTitle: "Gerar estrutura",
        panelSubtitle: "",
        submitLabel: "Gerar estrutura"
      },
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      apiKey: "",
      localProviderStatus: { ok: false, checking: false, error: "" }
    }
  });

  assert.match(html, /Gerar estrutura/);
  assert.match(html, /Lição existente \+ microssequências planejadas/);
  assert.doesNotMatch(html, /A materialização dos cards acontece depois/);
  assert.match(html, /generate-action-summary-icon/);
  assert.match(html, /placeholder="Descreva o que você quer gerar neste escopo\."/);
  assert.match(html, /data-action="generate-structure"/);
  assert.match(html, /aria-label="Gerar estrutura" title="Gerar estrutura"/);
  assert.doesNotMatch(html, /data-action="apply-assist"/);
});

test("renderiza chips de contexto para complementar curso e módulo existentes", () => {
  const html = renderGenerationPanelOverlay({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-logic",
          title: "Lógica",
          modules: [
            {
              key: "module-intro",
              title: "Introdução",
              lessons: [
                {
                  key: "lesson-prop",
                  title: "Proposições",
                  microsequences: [{ key: "micro-a", title: "Base proposicional" }]
                }
              ]
            }
          ]
        }
      ]
    },
    editorSupport: {
      generationDraft: {
        courseFixed: true,
        moduleFixed: true,
        lessonFixed: true,
        courseInput: "Lógica",
        courseKey: "course-logic",
        moduleInput: "Introdução",
        moduleKey: "module-intro",
        lessonInput: "Proposições",
        lessonKey: "lesson-prop",
        includeTopics: ["conectivos"],
        excludeTopics: ["predicados"],
        promptText: "",
        attachments: []
      },
      generationUiState: {
        course: {
          key: "course-logic",
          title: "Lógica",
          modules: [{ key: "module-intro", title: "Introdução" }]
        },
        moduleValue: {
          key: "module-intro",
          title: "Introdução",
          lessons: [{ key: "lesson-prop", title: "Proposições" }]
        },
        lesson: {
          key: "lesson-prop",
          title: "Proposições",
          microsequences: [{ key: "micro-a", title: "Base proposicional" }]
        },
        modules: [{ key: "module-intro", title: "Introdução" }],
        lessons: [{ key: "lesson-prop", title: "Proposições" }],
        moduleToggleEnabled: true,
        moduleInputEnabled: true,
        lessonToggleEnabled: true,
        lessonInputEnabled: true,
        canSubmit: false,
        actionLabel: "complementar este módulo",
        actionSummary: "Módulo existente + novas lições",
        actionIconName: "module"
      },
      selectedModel: "gemini-2.5-flash",
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      apiKey: "segredo",
      localProviderStatus: { ok: false, checking: false, error: "" }
    }
  });

  assert.match(html, />Destino da árvore</);
  assert.match(html, />Escopo do módulo</);
  assert.match(html, /conectivos/);
  assert.match(html, /predicados/);
  assert.match(html, /data-action="open-provider-config" title="Configurar IA" aria-label="Configurar IA"/);
  assert.doesNotMatch(html, /data-field="assist-api-key"/);
  assert.doesNotMatch(html, /Já existe neste curso/);
  assert.doesNotMatch(html, /Já existe neste módulo/);
  assert.doesNotMatch(html, /Micros já planejadas nesta lição/);
  assert.doesNotMatch(html, /Planejamento didático/);
});
