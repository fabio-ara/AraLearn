import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderCourseStudyScreen } from "../../src/study/CourseStudyScreen.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

const fixtureUrl = new URL("../fixtures/package/project-minimal.json", import.meta.url);

function visibleText(html) {
  return html
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

test("oferece zeragem de progresso nos quatro escopos didáticos", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const progress = {
    version: 1,
    lessons: {
      [`${course.id}::${moduleValue.id}::${lesson.id}`]: {
        cursorStudyUnitId: studyUnit.id,
        completedStudyUnitIds: [studyUnit.id]
      }
    }
  };
  const common = {
    project,
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    progress,
    coursePermissionsById: {}
  };

  const courseHtml = renderCourseStudyScreen({ ...common, view: "course" });
  const moduleHtml = renderCourseStudyScreen({ ...common, view: "module" });
  const lessonHtml = renderCourseStudyScreen({ ...common, view: "lesson" });
  const unitListHtml = renderCourseStudyScreen({
    ...common,
    view: "microsequence",
    microsequenceMode: "overview"
  });

  assert.match(courseHtml, /data-reset-level="module"[^>]+Zerar progresso deste módulo/u);
  assert.match(moduleHtml, /data-reset-level="lesson"[^>]+Zerar progresso desta lição/u);
  assert.match(lessonHtml, /data-reset-level="microsequence"[^>]+Zerar progresso desta microssequência didática/u);
  assert.match(unitListHtml, /data-reset-level="study-unit"[^>]+Zerar progresso a partir desta unidade de estudo/u);
  for (const [html, label] of [
    [courseHtml, "Curso"],
    [moduleHtml, "Módulo"],
    [lessonHtml, "Lição"],
    [unitListHtml, "Microssequência"]
  ]) {
    const heading = `<h1 class="section-heading entity-level-heading">${label}</h1>`;
    const headingIndex = html.indexOf(heading);
    const parentCardIndex = html.indexOf('<section class="clean-card entity-summary-card">');
    const parentCardEndIndex = html.indexOf("</section>", parentCardIndex);
    assert.ok(headingIndex >= 0, `Rótulo de ${label} ausente antes do card-pai.`);
    assert.ok(parentCardIndex > headingIndex, `Card-pai de ${label} precedeu seu rótulo.`);
    assert.ok(parentCardEndIndex > parentCardIndex, `Card-pai de ${label} não foi encerrado.`);
    const parentCard = html.slice(parentCardIndex, parentCardEndIndex + "</section>".length);
    assert.match(
      parentCard,
      /<h2 class="card-title" data-study-destination-heading tabindex="-1">[^<]+<\/h2>/u
    );
    assert.doesNotMatch(parentCard, /<\/h1>/u);
  }

  const homeHtml = renderCourseStudyScreen({
    ...common,
    view: "courses",
    reviewHasMore: true,
    reviewQueueOpen: true,
    runtimeStatus: { offline: true, stale: true, readOnly: true },
    reviewItems: [{
      title: "Unidade marcada",
      context: "Curso · Módulo · Lição · Microssequência",
      entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }]
  });
  assert.match(homeHtml, /data-action="load-more-review-items"[^>]*>.*Mostrar mais/su);
  assert.match(homeHtml, /<details class="study-review-queue clean-card" open>/u);
  assert.match(homeHtml, /<strong>Rever<\/strong><span class="muted tiny">1<\/span>/u);
  assert.match(homeHtml, /aria-label="Sem conexão"/u);
  assert.match(homeHtml, /Sem conexão\. Conecte-se para abrir este curso\./u);
  assert.doesNotMatch(homeHtml, /study-runtime-notice/u);

  const synchronizingHtml = renderCourseStudyScreen({
    ...common,
    view: "courses",
    runtimeStatus: { offline: false, stale: true, readOnly: true }
  });
  assert.match(
    synchronizingHtml,
    /Versão salva em uso enquanto o AraLearn atualiza este curso\./u
  );
  assert.doesNotMatch(synchronizingHtml, /Sem conexão/u);

  const moreOnlyHtml = renderCourseStudyScreen({
    ...common,
    view: "courses",
    reviewHasMore: true,
    reviewItems: []
  });
  assert.match(moreOnlyHtml, /<strong>Rever<\/strong><span class="muted tiny">mais<\/span>/u);
  assert.match(moreOnlyHtml, /data-runtime-state="synced"[^>]+aria-label="Sincronizado"/u);
  assert.match(moreOnlyHtml, /Sincronizado com a nuvem\./u);
});

test("a descrição da Unidade preserva toda a explicação sem antecipar resposta ou feedback", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const finalMarker = "MARCADOR_FINAL_DA_DESCRIÇÃO";
  const longDescription = `${"Descrição extensa da Unidade. ".repeat(8)}${finalMarker}`;
  assert.ok(longDescription.length > 140);
  studyUnit.content[0].data.text = longDescription;
  studyUnit.response = {
    id: "resposta-que-nao-deve-aparecer",
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question: "PERGUNTA_QUE_NAO_DEVE_APARECER",
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        {
          id: "correta",
          kind: "text",
          text: "RESPOSTA_QUE_NAO_DEVE_APARECER",
          feedback: "FEEDBACK_DA_OPCAO_QUE_NAO_DEVE_APARECER"
        },
        {
          id: "distrator",
          kind: "text",
          text: "DISTRATOR_QUE_NAO_DEVE_APARECER"
        }
      ],
      answerIds: ["correta"]
    }
  };
  studyUnit.feedback = [{
    id: "feedback-que-nao-deve-aparecer",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "FEEDBACK_AVALIATIVO_QUE_NAO_DEVE_APARECER" }
  }];

  const html = renderCourseStudyScreen({
    project,
    view: "microsequence",
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    microsequenceMode: "overview",
    progress: { version: 1, lessons: {} },
    coursePermissionsById: {}
  });

  assert.ok(html.includes(longDescription));
  assert.match(html, new RegExp(`${finalMarker}</p>`, "u"));
  assert.doesNotMatch(
    visibleText(html),
    /PERGUNTA_QUE_NAO_DEVE_APARECER|RESPOSTA_QUE_NAO_DEVE_APARECER|DISTRATOR_QUE_NAO_DEVE_APARECER|FEEDBACK_DA_OPCAO_QUE_NAO_DEVE_APARECER|FEEDBACK_AVALIATIVO_QUE_NAO_DEVE_APARECER/u
  );
  assert.match(visibleText(html), /A conjunção é verdadeira quando \[…\]/u);
  assert.doesNotMatch(visibleText(html), /as duas são verdadeiras/u);
});

test("os modos contextuais ficam no topbar com nome acessível e ordem estável", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    progress: { version: 1, lessons: {} },
    coursePermissionsById: {},
    assistance: { enabled: true, activeScope: "", draft: null, saving: false, error: "" },
    structuralEditor: { enabled: true, editing: false, saving: false }
  };
  for (const [view, action] of [
    ["lesson", "open-lesson-assistance"],
    ["microsequence", "open-microsequence-assistance"]
  ]) {
    const html = renderCourseStudyScreen({
      ...common,
      view,
      microsequenceMode: view === "microsequence" ? "overview" : "play"
    });
    assert.match(html, /<header[\s\S]*role="group" aria-label="Modo de (?:lição|microssequência didática)"/u);
    assert.ok(html.indexOf('aria-label="Visualizar"') < html.indexOf(`data-action="${action}"`));
    assert.match(html, new RegExp(`data-action="${action}"[\\s\\S]*?aria-label="Assistência por IA"`, "u"));
    assert.match(html, /data-action="study-level-edit"/u);
  }

  const draftHtml = renderCourseStudyScreen({
    ...common,
    view: "lesson",
    assistance: {
      enabled: true,
      activeScope: "",
      draft: { scope: "lesson", summary: "Reordenar e acrescentar prática." },
      saving: false,
      error: ""
    }
  });
  assert.match(draftHtml, /aria-label="Rascunho da assistência por IA"/u);
  assert.match(draftHtml, /data-action="save-assistance-draft"/u);
  assert.match(draftHtml, /data-action="discard-assistance-draft"/u);
});

test("a ação da Unidade é icon-only, estável e anuncia a mudança de estado", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    view: "microsequence",
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    microsequenceMode: "play",
    progress: { version: 1, lessons: {} },
    runtimeStatus: { pending: true }
  };
  const ready = renderCourseStudyScreen(common);
  const readyButton = ready.match(/<button class="open-mini study-continue-btn"[\s\S]*?<\/button>/u)?.[0] || "";
  assert.match(readyButton, /aria-label="(?:Ver explicação|Próxima unidade de estudo)"/u);
  assert.doesNotMatch(readyButton, /<span>/u);
  assert.match(ready, /aria-label="Sincronização pendente"/u);
  assert.doesNotMatch(ready, /study-runtime-notice/u);

  const saving = renderCourseStudyScreen({ ...common, advancePending: true });
  const savingButton = saving.match(/<button class="open-mini study-continue-btn"[\s\S]*?<\/button>/u)?.[0] || "";
  assert.match(savingButton, /title="Guardando progresso"/u);
  assert.match(savingButton, /aria-label="Guardando progresso"/u);
  assert.match(savingButton, /disabled aria-disabled="true"/u);
  assert.doesNotMatch(savingButton, /Guardando…|<span>/u);
});

test("seleção da assistência acontece nos objetos renderizados e resume o alcance sem IDs", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const originalMicrosequence = lesson.microsequences[0];
  const secondMicrosequence = structuredClone(originalMicrosequence);
  secondMicrosequence.id = "micro-contexto-secundario";
  secondMicrosequence.title = "Contexto secundário";
  lesson.microsequences.push(secondMicrosequence);
  const studyUnit = originalMicrosequence.studyUnits[0];
  const common = {
    project,
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: originalMicrosequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence: originalMicrosequence,
    studyUnit,
    progress: { version: 1, lessons: {} },
    coursePermissionsById: {}
  };
  const lessonHtml = renderCourseStudyScreen({
    ...common,
    view: "lesson",
    assistance: {
      enabled: true,
      activeScope: "lesson",
      selection: { scope: "lesson", ids: lesson.microsequences.map(({ id }) => id) }
    }
  });
  assert.equal((lessonHtml.match(/data-action="toggle-assistance-target"/gu) || []).length, 2);
  assert.match(lessonHtml, /class="visually-hidden">2 microssequências/u);
  assert.doesNotMatch(lessonHtml, />Alterar</u);
  assert.doesNotMatch(visibleText(lessonHtml), /micro-contexto-secundario/u);

  const microHtml = renderCourseStudyScreen({
    ...common,
    view: "microsequence",
    microsequenceMode: "overview",
    assistance: {
      enabled: true,
      activeScope: "didactic_microsequence",
      selection: {
        scope: "didactic_microsequence",
        ids: originalMicrosequence.studyUnits.map(({ id }) => id)
      }
    }
  });
  assert.equal((microHtml.match(/data-action="toggle-assistance-target"/gu) || []).length,
    originalMicrosequence.studyUnits.length);
  assert.match(microHtml, /class="visually-hidden">2 unidades de estudo/u);
  assert.doesNotMatch(microHtml, />Alterar</u);

  const unitHtml = renderCourseStudyScreen({
    ...common,
    view: "microsequence",
    microsequenceMode: "play",
    manualEditor: {
      enabled: true,
      editing: false,
      mode: "assist",
      targetId: "",
      draft: { pathValues: {} },
      assistance: {
        selection: { scope: "study_unit", ids: [studyUnit.content[0].id] }
      }
    }
  });
  assert.doesNotMatch(unitHtml, /data-assistance-target-id="study_unit"/u);
  assert.match(unitHtml, /study-assistance-selection-footer/u);
  assert.match(unitHtml, /class="visually-hidden">1 componente/u);
  assert.doesNotMatch(unitHtml, />Alterar|>Conversar|>Unidade de estudo inteira/u);
});

test("Editar mantém resumo e filhos situados e mostra organização só no alvo selecionado", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    progress: { version: 1, lessons: {} },
    coursePermissionsById: {},
    assistance: { enabled: false }
  };
  for (const [view, children, selectedChildId] of [
    ["course", course.modules, moduleValue.id],
    ["module", moduleValue.lessons, lesson.id],
    ["lesson", lesson.microsequences, microsequence.id],
    ["microsequence", microsequence.studyUnits, studyUnit.id]
  ]) {
    const html = renderCourseStudyScreen({
      ...common,
      view,
      microsequenceMode: view === "microsequence" ? "overview" : "play",
      structuralEditor: {
        enabled: true,
        editing: true,
        saving: false,
        label: view,
        fields: { title: "Título situado", goal: "Objetivo situado" },
        children: children.map(({ id, title }) => ({ id, title })),
        selectedChildId
      }
    });
    assert.match(html, /class="clean-card entity-summary-card study-structure-editor"/u);
    assert.match(html, /class="navigation-list"/u);
    assert.doesNotMatch(html, /<fieldset>/u);
    assert.equal((html.match(/data-action="move-study-structure-child"/gu) || []).length, 2);
    assert.equal((html.match(/data-action="select-study-structure-child"/gu) || []).length,
      children.length);
  }
});

test("a Home oferece um seletor de Curso, uma prévia rica e uma única entrada", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const base = project.courses[0];
  const courses = [
    { ...structuredClone(base), id: "11111111-1111-4111-8111-111111111111" },
    { ...structuredClone(base), id: "22222222-2222-4222-8222-222222222222" },
    {
      ...structuredClone(base),
      id: "33333333-3333-4333-8333-333333333333",
      title: "Outro Curso"
    }
  ];
  const selected = courses[1];
  const moduleValue = selected.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const permissions = Object.fromEntries(courses.map((course, index) => [course.id, {
    ownership: index === 2 ? "shared" : "owned",
    canEdit: index !== 2,
    availableOffline: index === 1,
    moduleCount: 1,
    lessonCount: 1,
    studyUnitCount: 1,
    completedStudyUnitCount: 0
  }]));
  const html = renderCourseStudyScreen({
    project: { ...project, courses },
    view: "courses",
    selection: {
      courseId: selected.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course: selected,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    progress: { version: 1, lessons: {} },
    coursePermissionsById: permissions,
    selectedCourseId: selected.id,
    runtimeStatus: { offline: false },
    reviewItems: [{
      title: "Pertence ao selecionado",
      entityPath: [selected.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }, {
      title: "Pertence a outro Curso",
      entityPath: [courses[0].id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }]
  });

  assert.equal((html.match(/<select\b/gu) || []).length, 1);
  assert.equal((html.match(/<option\b/gu) || []).length, 3);
  assert.equal((html.match(/class="progress-card home-course-selector-preview"/gu) || []).length, 1);
  const titleRow = html.match(/<div class="home-course-title-row">[\s\S]*?<\/div>/u)?.[0] || "";
  assert.match(titleRow, /<p class="home-course-ownership"[^>]*>[\s\S]*home-course-origin-icon[\s\S]*<\/p>/u);
  assert.ok(titleRow.includes(`<h2 class="card-title">${selected.title}</h2>`));
  assert.match(html, /aria-label="Selecionar curso"/u);
  assert.match(html, /opção 1/u);
  assert.match(html, /opção 2/u);
  assert.doesNotMatch(html, /Disponível neste dispositivo|Disponível com conexão/u);
  assert.match(html, /aria-label="Abrir [^"]+"/u);
  assert.doesNotMatch(html, />Abrir<\/span>/u);
  assert.match(html, /popovertarget="home-course-actions-menu"/u);
  assert.ok(html.indexOf('data-action="course-lifecycle-menu"') <
    html.indexOf('data-action="open-course"'));
  assert.doesNotMatch(html, />Começar<|>Continuar<|>Retomar</u);
  assert.match(html, /Pertence ao selecionado/u);
  assert.doesNotMatch(html, /Pertence a outro Curso/u);
  assert.doesNotMatch(html, /<details[^>]+study-review-queue[^>]+open/u);
  assert.doesNotMatch(html, /navigation-list-card|courses-home-list|Abrir Curso/u);

  const feedbackHtml = renderHomeScreen({
    project: { ...project, courses },
    progress: { version: 1, lessons: {} },
    editorSupport: { coursePermissionsById: permissions },
    selectedCourseId: selected.id,
    homeNotice: "Seu acesso ao Curso selecionado foi encerrado."
  });
  assert.match(
    feedbackHtml,
    /<div class="study-home-feedback-layer"><div class="study-home-feedback is-notice" role="status"><span>Seu acesso ao Curso selecionado foi encerrado\.<\/span><\/div><\/div><section class="clean-card home-course-selector-card"/u
  );

  const lessonPath = `${selected.id}::${moduleValue.id}::${lesson.id}`;
  const completedStates = [
    [],
    [studyUnit.id],
    microsequence.studyUnits.map(({ id }) => id)
  ];
  for (const completedStudyUnitIds of completedStates) {
    const progress = completedStudyUnitIds.length
      ? {
          version: 1,
          lessons: {
            [lessonPath]: {
              cursorStudyUnitId: completedStudyUnitIds.at(-1),
              completedStudyUnitIds
            }
          }
        }
      : { version: 1, lessons: {} };
    const home = renderHomeScreen({
      project: { ...project, courses },
      progress,
      editorSupport: { coursePermissionsById: permissions },
      selectedCourseId: selected.id
    });
    assert.match(home, /aria-label="Abrir [^"]+"/u);
    assert.doesNotMatch(home, />Abrir<\/span>/u);
    assert.doesNotMatch(home, />Começar<|>Continuar<|>Retomar</u);
    if (completedStudyUnitIds.length) {
      assert.match(home, /role="menuitem" data-action="reset-course-progress"/u);
      assert.match(home, />Zerar progresso<\/span>/u);
    } else {
      assert.doesNotMatch(home, /data-action="reset-course-progress"/u);
    }
  }
});

test("a Home distingue propriedade e preserva cursos copiados como cursos próprios", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const base = project.courses[0];
  const owned = {
    ...structuredClone(base),
    id: "11111111-1111-4111-8111-111111111111",
    title: "Curso do autor"
  };
  const shared = {
    ...structuredClone(base),
    id: "22222222-2222-4222-8222-222222222222",
    title: "Curso compartilhado"
  };
  const personalCopy = {
    ...structuredClone(base),
    id: "33333333-3333-4333-8333-333333333333",
    title: "Minha continuidade"
  };
  const technicalHash = "8f3c40a21db746879b8018a67fd2d616c690987f";
  const sourceCourseId = "44444444-4444-4444-8444-444444444444";
  const courses = [owned, shared, personalCopy];
  const permissions = {
    [owned.id]: { ownership: "owned", canEdit: true },
    [shared.id]: {
      ownership: "shared",
      canEdit: false,
      sourceCourseRevision: technicalHash
    },
    [personalCopy.id]: {
      ownership: "owned",
      canEdit: true,
      sourceCourseId,
      sourceCourseRevision: technicalHash
    }
  };

  const html = renderHomeScreen({
    project: { ...project, courses },
    progress: { version: 1, lessons: {} },
    editorSupport: { coursePermissionsById: permissions },
    selectedCourseId: personalCopy.id
  });
  const text = visibleText(html);

  assert.match(html, />Curso do autor/u);
  assert.match(html, />Curso compartilhado/u);
  assert.match(html, />Minha continuidade/u);
  assert.match(html, /home-course-ownership" aria-label="Curso próprio"/u);
  assert.match(html, /<button[^>]+aria-label="Ações deste curso"[^>]+aria-haspopup="menu"/u);
  assert.match(html, /data-action="delete-owned-course"/u);
  assert.match(html, />Excluir este curso<\/span>/u);
  const sharedHtml = renderHomeScreen({
    project: { ...project, courses },
    progress: { version: 1, lessons: {} },
    editorSupport: { coursePermissionsById: permissions },
    selectedCourseId: shared.id
  });
  assert.match(sharedHtml, /data-action="leave-shared-course"/u);
  assert.match(sharedHtml, />Sair deste curso<\/span>/u);
  assert.doesNotMatch(text, /11111111|22222222|33333333|44444444|8f3c40a2/u);
});

test("a edição em Estudo preserva o fluxo direto do proprietário sem criar cópia", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    view: "microsequence",
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    microsequenceMode: "play",
    progress: { version: 1, lessons: {} }
  };
  const manualEditor = {
    enabled: true,
    editing: true,
    targetId: "study_unit",
    draft: { pathValues: {} },
    saving: false,
    canUndo: false,
    canRedo: false,
    error: ""
  };

  const ownedHtml = renderCourseStudyScreen({
    ...common,
    manualEditor
  });
  assert.match(ownedHtml, /Edite diretamente no conteúdo\./u);
  assert.match(ownedHtml, /data-action="study-manual-view"[^>]*aria-label="Visualizar"/u);
  assert.match(ownedHtml, /data-action="study-manual-edit"[^>]*aria-label="Editar"/u);
  assert.match(ownedHtml, /data-action="study-provider-assistance"[^>]*aria-label="Assistência por IA"/u);
  assert.match(ownedHtml, /data-action="go-back"/u);
  assert.match(ownedHtml, /aria-label="Salvar edição"/u);
  assert.doesNotMatch(ownedHtml, /Salvar na minha cópia|Sua cópia/u);


});

test("Study revela citações redigidas somente quando o painel lazy está aberto", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    view: "microsequence",
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    microsequenceMode: "play",
    progress: { version: 1, lessons: {} },
    citationsLoading: false,
    citationsError: "",
    citations: {
      citations: [{
        sourceId: "fonte-citacao",
        sourceRevision: 1,
        attachments: [{ contentHash: "a".repeat(64), byteSize: 1_024, mediaType: "application/pdf" }],
        title: "Fonte somente citada",
        citationText: "Autoria. Fonte somente citada. 2026.",
        url: null,
        editionOrVersion: "2ª edição",
        anchors: [{
          anchorId: "anchor-publica",
          selector: { kind: "page_range", startPage: 8, endPage: 9 },
          humanLocator: "Capítulo 2 · Figura 4"
        }]
      }, {
        sourceId: "fonte-com-link",
        sourceRevision: 2,
        attachments: [],
        title: "Fonte com link público",
        citationText: "Autoria. Fonte com link público. 2026.",
        url: "https://example.test/fonte",
        editionOrVersion: null,
        anchors: []
      }]
    }
  };

  const closed = renderCourseStudyScreen({ ...common, citationsOpen: false });
  assert.match(closed, /data-action="toggle-citations"/u);
  assert.doesNotMatch(closed, /Fonte somente citada|Fonte com link público/u);

  const open = renderCourseStudyScreen({ ...common, citationsOpen: true });
  assert.doesNotMatch(open, /Proveniência desta Unidade/u);
  assert.match(open, /<h2 id="study-citations-title">Fontes<\/h2>/u);
  assert.match(open, /Fonte somente citada/u);
  assert.match(open, /Fonte com link público/u);
  assert.match(open, /pp\. 8–9/u);
  assert.match(open, /Capítulo 2 · Figura 4 · pp\. 8–9/u);
  assert.match(open, /href="https:\/\/example\.test\/fonte"/u);
  assert.equal((open.match(/>Abrir fonte<\/a>/gu) || []).length, 1);
  assert.equal((open.match(/data-action="download-citation-attachment"/gu) || []).length, 1);
  assert.match(open, /aria-label="Baixar PDF 1 de Fonte somente citada"/u);
  assert.doesNotMatch(open, /storagePath|signedUrl|contentHash/u);
  assert.doesNotMatch(open, /Fonte oculta|Legado não resolvido|verificationExcerpt|actorId|studyVisibility/u);
  assert.doesNotMatch(open, /edit-source|retire-source|Revisar fonte|Aposentar fonte/u);

  const empty = renderCourseStudyScreen({
    ...common,
    citationsOpen: true,
    citations: { citations: [] }
  });
  assert.match(empty, /<p class="study-citations-status">Nenhuma fonte\.<\/p>/u);
  assert.doesNotMatch(empty, /não possui fontes públicas|Proveniência desta Unidade/iu);

  const ownedOpen = renderCourseStudyScreen({
    ...common,
    course: { ...course, id: "10000000-0000-4000-8000-000000000001" },
    selection: {
      ...common.selection,
      courseId: "10000000-0000-4000-8000-000000000001"
    },
    citationsOpen: true,
    canAuthorSources: true
  });
  assert.match(ownedOpen, /section=sources&amp;sourceId=fonte-citacao&amp;anchorId=anchor-publica/u);
  assert.match(ownedOpen, /Revisar esta âncora/u);
  assert.match(ownedOpen, /Revisar fonte no curso/u);
});
