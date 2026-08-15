import { expect, test } from "@playwright/test";

function fixture() {
  const card = {
    id: "card-a",
    position: 1,
    title: "Conjunção",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "P e Q precisam ser verdadeiras." }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
  const microsequence = {
    id: "micro-a",
    title: "Regra",
    status: "generated",
    dependsOn: [],
    cards: [card]
  };
  const lesson = {
    id: "lesson-a",
    title: "Conjunção",
    microsequences: [microsequence]
  };
  const moduleValue = {
    id: "module-a",
    title: "Operadores",
    lessons: [lesson]
  };
  const course = {
    id: "course-a",
    title: "AraLearn: Catálogo de lógica proposicional e matemática discreta",
    modules: [moduleValue]
  };
  return { course, moduleValue, lesson, microsequence, card };
}

async function renderLevel(page, {
  level = "lesson",
  canEdit = true,
  canAi = true,
  canComment = true
} = {}) {
  return page.evaluate(async ({ fixtureValue, levelValue, canEditValue, canAiValue, canCommentValue }) => {
    const { renderLessonScreen } = await import("/src/ui/renderLessonScreen.js");
    const permissions = {
      canAuthorContent: canEditValue || canAiValue,
      canEdit: canEditValue,
      canDelete: canEditValue,
      canEditMetadata: canEditValue,
      canEditCards: canEditValue,
      canUseBottomUpAi: canAiValue,
      canUseCardAi: canAiValue,
      canComment: canCommentValue
    };
    const editorSupport = {
      progress: { version: 1, lessons: {} },
      coursePermissions: permissions,
      entityModes: { [levelValue]: "view" }
    };
    const args = {
      project: {
        contract: "aralearn.contract",
        version: 4,
        kind: "project",
        courses: [fixtureValue.course]
      },
      ...fixtureValue,
      cards: fixtureValue.microsequence.cards,
      selection: {
        courseKey: fixtureValue.course.id,
        moduleKey: fixtureValue.moduleValue.id,
        lessonKey: fixtureValue.lesson.id,
        microsequenceKey: fixtureValue.microsequence.id,
        cardKey: fixtureValue.card.id,
        cardIndex: 0
      },
      view: levelValue,
      microsequenceMode: levelValue === "microsequence" ? "overview" : "play",
      editorSupport
    };
    document.body.innerHTML = '<div id="app-root"><div class="app-shell">' +
      renderLessonScreen(args) + "</div></div>";

    const header = document.querySelector(".navigation-topbar");
    const headerRect = header.getBoundingClientRect();
    const back = header.querySelector('[data-action="go-back"]');
    const panel = header.querySelector('[data-action="open-central"]');
    const modeSlot = header.querySelector(".topbar-mode-slot");
    const observation = document.querySelector('[data-action="open-context-observation"]');
    const modeButtons = [...header.querySelectorAll('[data-action="select-entity-mode"]')];
    const cardSheet = document.querySelector(".runtime-card-sheet");
    const cardContent = document.querySelector(".card-sheet-content");
    const cardRectBefore = cardSheet?.getBoundingClientRect();
    if (cardContent) {
      const overflowProbe = document.createElement("div");
      overflowProbe.style.height = "1600px";
      overflowProbe.setAttribute("aria-hidden", "true");
      cardContent.append(overflowProbe);
    }
    const cardRectAfter = cardSheet?.getBoundingClientRect();
    modeButtons.at(-1)?.focus();
    const modeRect = modeSlot?.getBoundingClientRect();
    return {
      screenClientWidth: document.querySelector(".screen").clientWidth,
      screenScrollWidth: document.querySelector(".screen").scrollWidth,
      headerClientWidth: header.clientWidth,
      headerScrollWidth: header.scrollWidth,
      inlineGaps: [
        back.getBoundingClientRect().left - headerRect.left,
        headerRect.right - panel.getBoundingClientRect().right
      ],
      modeCenterDelta: modeRect
        ? Math.abs((modeRect.left + modeRect.width / 2) - (headerRect.left + headerRect.width / 2))
        : null,
      modeCount: modeButtons.length,
      modeLabels: modeButtons.map((button) => button.getAttribute("aria-label")),
      modeFocused: modeButtons.at(-1) === document.activeElement,
      panelLabel: panel.getAttribute("aria-label"),
      panelCount: header.querySelectorAll('[data-action="open-central"]').length,
      headerObservationCount: header.querySelectorAll('[data-action="open-context-observation"]').length,
      observationInSummary: Boolean(observation?.closest(".entity-summary-wrap")),
      contextTitle: document.querySelector(".entity-context-title")?.textContent.trim() || "",
      topbarTitle: header.querySelector(".topbar-title")?.textContent.trim() || "",
      workbenchGutter: document.querySelector(".microsequence-workbench-screen > .screen-content")
        ? getComputedStyle(document.querySelector(".microsequence-workbench-screen > .screen-content")).scrollbarGutter
        : "",
      cardGutter: cardContent ? getComputedStyle(cardContent).scrollbarGutter : "",
      workbenchFooterPaddingRight: document.querySelector(".microsequence-workbench-screen .study-reader-footer")
        ? getComputedStyle(document.querySelector(".microsequence-workbench-screen .study-reader-footer")).paddingRight
        : "",
      cardRectStable: cardRectBefore && cardRectAfter
        ? Math.abs(cardRectBefore.left - cardRectAfter.left) <= 0.5 &&
          Math.abs(cardRectBefore.width - cardRectAfter.width) <= 0.5
        : null
    };
  }, {
    fixtureValue: fixture(),
    levelValue: level,
    canEditValue: canEdit,
    canAiValue: canAi,
    canCommentValue: canComment
  });
}

test("cabeçalho de autoria permanece simétrico de 320 a 430 px", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 760 });
    const result = await renderLevel(page);
    expect(result.screenScrollWidth, `tela em ${width}px`).toBeLessThanOrEqual(result.screenClientWidth);
    expect(result.headerScrollWidth, `cabeçalho em ${width}px`).toBeLessThanOrEqual(result.headerClientWidth);
    expect(Math.abs(result.inlineGaps[0] - result.inlineGaps[1]), `simetria em ${width}px`)
      .toBeLessThanOrEqual(0.5);
    expect(result.modeCenterDelta, `eixo dos modos em ${width}px`).toBeLessThanOrEqual(0.5);
    expect(result.modeCount).toBe(3);
    expect(result.modeLabels).toEqual(["Visualizar", "Editar", "Assistência por IA"]);
    expect(result.modeFocused).toBe(true);
    expect(result.panelLabel).toBe("Abrir painel AraLearn");
    expect(result.panelCount).toBe(1);
    expect(result.headerObservationCount).toBe(0);
    expect(result.observationInSummary).toBe(true);
    expect(result.contextTitle).toBe("Lições");
    expect(result.topbarTitle).toBe("");
  }
});

test("dois modos usam a app bar e somente leitura conserva o título nela", async ({ page }) => {
  await page.goto("/");
  const twoModes = await renderLevel(page, { level: "course", canAi: false });
  expect(twoModes.modeCount).toBe(2);
  expect(twoModes.modeLabels).toEqual(["Visualizar", "Editar"]);
  expect(twoModes.contextTitle).toBe("Curso");
  expect(twoModes.topbarTitle).toBe("");

  const readonly = await renderLevel(page, {
    level: "lesson",
    canEdit: false,
    canAi: false,
    canComment: true
  });
  expect(readonly.modeCount).toBe(0);
  expect(readonly.contextTitle).toBe("");
  expect(readonly.topbarTitle).toBe("Lições");
  expect(readonly.panelCount).toBe(1);
  expect(readonly.headerObservationCount).toBe(0);
  expect(readonly.observationInSummary).toBe(true);
});

test("o card delega a rolagem sem reservar uma coluna externa", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 320, height: 760 });
  const result = await renderLevel(page, { level: "card", canComment: false });
  expect(result.workbenchGutter).toBe("auto");
  expect(result.cardGutter).toBe("stable both-edges");
  expect(result.workbenchFooterPaddingRight).toBe("0px");
  expect(result.cardRectStable).toBe(true);
  expect(result.modeCount).toBe(3);
  expect(result.contextTitle).toBe("AraLearn: Catálogo de lógica proposicional e matemática discreta");
});
