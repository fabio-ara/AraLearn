import { expect, test } from "@playwright/test";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const ITEM_ID = "20000000-0000-4000-8000-000000000002";

const LONG_TITLE = "Redes Locais: Base Prática para Administração de Servidores Linux";
const LONG_ERROR = "A composição corrente viola a biblioteca em " +
  "$.courses[0].modules[0].lessons[0].microsequences[0].cards[0].position: " +
  "position deve ser inteiro positivo.";

async function renderConstrainedHome(page, viewportWidth) {
  await page.setViewportSize({ width: viewportWidth, height: 760 });
  await page.goto("/");
  return page.evaluate(async ({ groupId, itemId, longTitle, longError }) => {
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    const { createExperimentEnrollmentSurface } = await import("/src/ui/ExperimentEnrollmentSurface.js");
    const snapshot = {
      space: "trails",
      groups: [{ id: groupId, title: "Outros estudos profissionais" }],
      items: [{
        trailItemId: itemId,
        workspaceId: "30000000-0000-4000-8000-000000000003",
        courseKey: "course-redes-locais",
        courseId: null,
        selectionId: null,
        kind: "course",
        source: "workspace",
        origin: "workspace",
        title: longTitle,
        description: "Construir domínio operacional dos fundamentos de redes locais necessários para configurar, testar e diagnosticar conectividade de hosts.",
        moduleCount: 5,
        lessonCount: 9,
        microsequenceCount: 9,
        cardCount: 37,
        completedCardCount: 0,
        contentHash: null,
        revision: 1,
        canEdit: true,
        canDelete: true,
        canRemove: false,
        pathId: groupId,
        pathTitle: "Outros estudos profissionais",
        updatedAt: "2026-08-09T12:00:00Z"
      }],
      hasMore: false,
      nextCursor: null,
      capabilities: { organize: true, catalogManage: false, catalogReview: false }
    };
    document.body.innerHTML = '<div id="app-root"><div class="app-shell">' +
      renderHomeScreen({
        project: { contract: "aralearn.library.v1", scope: "course", courses: [] },
        progress: { version: 1, lessons: {} },
        editorSupport: {
          trailSnapshot: snapshot,
          selectedHomeTrailItemId: itemId,
          homeOrganization: { selectedGroupId: groupId, error: longError }
        }
      }) + '</div></div><div class="experiment-enrollment-root"></div>';

    const screen = document.querySelector(".screen");
    const screenContent = document.querySelector(".screen-content");
    const scrollbarGutter = Math.max(0, screenContent.offsetWidth - screenContent.clientWidth);
    screen.style.setProperty("--screen-content-scrollbar-gutter", `${scrollbarGutter}px`);
    const enrollmentRoot = document.querySelector(".experiment-enrollment-root");
    enrollmentRoot.style.setProperty("--navigation-scrollbar-gutter", `${scrollbarGutter}px`);
    createExperimentEnrollmentSurface({ root: enrollmentRoot, controller: {} });

    const selectors = [
      ".app-shell",
      ".screen-content",
      ".home-product-switch",
      ".home-course-selector-card",
      ".home-library-controls",
      ".home-group-select-row",
      "#home-group-select",
      ".home-group-context-menu > summary",
      "#home-course-select",
      ".home-trails-error",
      ".home-course-selector-preview",
      ".home-course-selector-heading h2",
      ".home-course-selector-actions"
    ];
    const card = document.querySelector(".home-course-selector-card");
    const cardRect = card.getBoundingClientRect();
    const productSwitch = document.querySelector(".home-product-switch");
    const productSwitchRect = productSwitch.getBoundingClientRect();
    const globalActionCenters = [
      '[data-action="open-settings"]',
      ".experiment-enrollment-launcher"
    ].map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        selector,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        right: rect.right
      };
    });
    const openCourseRect = document.querySelector('[data-action="open-course"]').getBoundingClientRect();
    const menuGeometry = [
      ["grupo", document.querySelector(".home-group-context-menu")],
      ["curso", document.querySelector(".home-course-selector-actions > .home-course-context-menu")]
    ].map(([name, details]) => {
      details.open = true;
      const menu = details.querySelector(".home-course-context-actions");
      const rect = menu.getBoundingClientRect();
      const result = {
        name,
        left: rect.left,
        right: rect.right,
        withinCard: rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5,
        cardClientWidth: card.clientWidth,
        cardScrollWidth: card.scrollWidth,
        labels: [...menu.querySelectorAll(".learning-spaces-context-menu-item > span")]
          .map((element) => element.textContent.trim())
      };
      details.open = false;
      return result;
    });
    return {
      cardClientWidth: card.clientWidth,
      cardScrollWidth: card.scrollWidth,
      productSwitch: {
        left: productSwitchRect.left,
        width: productSwitchRect.width,
        buttonWidths: [...productSwitch.querySelectorAll("button")].map((button) =>
          button.getBoundingClientRect().width
        )
      },
      card: { left: cardRect.left, width: cardRect.width },
      contentClientWidth: document.querySelector(".screen-content").clientWidth,
      contentScrollWidth: document.querySelector(".screen-content").scrollWidth,
      errorOverflowWrap: getComputedStyle(document.querySelector(".home-trails-error")).overflowWrap,
      globalActionCenters,
      openCourse: {
        width: openCourseRect.width,
        height: openCourseRect.height,
        rightInset: cardRect.right - openCourseRect.right,
        bottomInset: cardRect.bottom - openCourseRect.bottom
      },
      menuGeometry,
      geometry: selectors.map((selector) => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        return {
          selector,
          left: rect.left,
          right: rect.right,
          withinCard: selector === ".app-shell" || selector === ".screen-content" ||
            (rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5)
        };
      })
    };
  }, { groupId: GROUP_ID, itemId: ITEM_ID, longTitle: LONG_TITLE, longError: LONG_ERROR });
}

async function renderInternalSettings(page, viewportWidth) {
  await page.setViewportSize({ width: viewportWidth, height: 760 });
  return page.evaluate(async () => {
    const { renderLessonScreen } = await import("/src/ui/renderLessonScreen.js");
    const card = {
      id: "card-a",
      position: 1,
      title: "Estado",
      role: "theory",
      content: [{
        id: "paragraph-a",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Conteúdo." }
      }],
      response: null,
      feedback: [],
      topics: [],
      sources: []
    };
    const microsequence = { id: "micro-a", title: "Estados", dependsOn: [], cards: [card] };
    const lesson = { id: "lesson-a", title: "Transições", microsequences: [microsequence] };
    const moduleValue = { id: "module-a", title: "Processos", lessons: [lesson] };
    const course = { id: "course-a", title: "Curso", modules: [moduleValue] };
    document.body.innerHTML = '<div id="app-root"><div class="app-shell">' +
      renderLessonScreen({
        project: { contract: "aralearn.library.v1", scope: "course", courses: [course] },
        view: "course",
        selection: {
          courseKey: course.id,
          moduleKey: moduleValue.id,
          lessonKey: lesson.id,
          microsequenceKey: microsequence.id,
          cardKey: card.id,
          cardIndex: 0
        },
        course,
        moduleValue,
        lesson,
        microsequence,
        cards: [card],
        card,
        editorSupport: {
          progress: { version: 1, lessons: {} },
          entityModes: { course: "view" },
          coursePermissions: {
            canAuthorContent: true,
            canEdit: true,
            canEditMetadata: true,
            canEditCards: true,
            canUseBottomUpAi: true,
            canUseCardAi: true,
            canComment: true
          }
        }
      }) + "</div></div>";
    const screen = document.querySelector(".screen");
    const content = document.querySelector(".screen-content");
    screen.style.setProperty(
      "--screen-content-scrollbar-gutter",
      `${Math.max(0, content.offsetWidth - content.clientWidth)}px`
    );
    const settingsRect = document.querySelector('[data-action="open-settings"]').getBoundingClientRect();
    const navigationCardRect = document.querySelector(".navigation-list-card").getBoundingClientRect();
    const navigationOpenRect = document.querySelector(".navigation-list-card .open-mini").getBoundingClientRect();
    return {
      settings: {
        centerX: settingsRect.left + settingsRect.width / 2,
        centerY: settingsRect.top + settingsRect.height / 2,
        right: settingsRect.right
      },
      openCard: {
        width: navigationOpenRect.width,
        height: navigationOpenRect.height,
        rightInset: navigationCardRect.right - navigationOpenRect.right,
        bottomInset: navigationCardRect.bottom - navigationOpenRect.bottom
      }
    };
  });
}

test("Home contém erros e títulos longos sem distorcer ou recortar controles", async ({ page }) => {
  for (const viewportWidth of [1440, 430, 320]) {
    const result = await renderConstrainedHome(page, viewportWidth);
    const internalSettings = await renderInternalSettings(page, viewportWidth);
    expect(result.cardScrollWidth, `card em ${viewportWidth}px`).toBeLessThanOrEqual(result.cardClientWidth);
    expect(result.contentScrollWidth, `conteúdo em ${viewportWidth}px`).toBeLessThanOrEqual(result.contentClientWidth);
    expect(Math.abs(result.productSwitch.left - result.card.left), `alinhamento em ${viewportWidth}px`)
      .toBeLessThanOrEqual(1);
    expect(Math.abs(result.productSwitch.width - result.card.width), `largura em ${viewportWidth}px`)
      .toBeLessThanOrEqual(1);
    expect(Math.abs(result.productSwitch.buttonWidths[0] - result.productSwitch.buttonWidths[1]),
      `opções simétricas em ${viewportWidth}px`).toBeLessThanOrEqual(1);
    expect(result.errorOverflowWrap).toBe("anywhere");
    expect(Math.max(...result.globalActionCenters.map((item) => item.centerX)) -
      Math.min(...result.globalActionCenters.map((item) => item.centerX)),
    `eixo das ações globais em ${viewportWidth}px: ${JSON.stringify(result.globalActionCenters)}`)
      .toBeLessThanOrEqual(0.5);
    expect(Math.abs(internalSettings.settings.centerX - result.globalActionCenters[0].centerX),
      `eixo horizontal de Conta e aparência em ${viewportWidth}px`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(internalSettings.settings.centerY - result.globalActionCenters[0].centerY),
      `eixo vertical de Conta e aparência em ${viewportWidth}px: ${JSON.stringify({ home: result.globalActionCenters[0], internal: internalSettings.settings })}`)
      .toBeLessThanOrEqual(0.5);
    expect(result.openCourse, `Abrir curso em ${viewportWidth}px`).toEqual(internalSettings.openCard);
    expect(result.geometry.filter((item) => !item.withinCard), `geometria em ${viewportWidth}px`).toEqual([]);
    expect(result.menuGeometry.filter((item) => !item.withinCard), `menus em ${viewportWidth}px`).toEqual([]);
    for (const menu of result.menuGeometry) {
      expect(menu.cardScrollWidth, `${menu.name} aberto em ${viewportWidth}px`)
        .toBeLessThanOrEqual(menu.cardClientWidth);
    }
    expect(result.menuGeometry.find((item) => item.name === "curso")?.labels)
      .toContain("Mover para outro grupo");
  }
});
