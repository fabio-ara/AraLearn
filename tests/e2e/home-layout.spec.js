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
      }) + "</div></div>";

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

test("Home contém erros e títulos longos sem distorcer ou recortar controles", async ({ page }) => {
  for (const viewportWidth of [1440, 430, 320]) {
    const result = await renderConstrainedHome(page, viewportWidth);
    expect(result.cardScrollWidth, `card em ${viewportWidth}px`).toBeLessThanOrEqual(result.cardClientWidth);
    expect(result.contentScrollWidth, `conteúdo em ${viewportWidth}px`).toBeLessThanOrEqual(result.contentClientWidth);
    expect(Math.abs(result.productSwitch.left - result.card.left), `alinhamento em ${viewportWidth}px`)
      .toBeLessThanOrEqual(1);
    expect(Math.abs(result.productSwitch.width - result.card.width), `largura em ${viewportWidth}px`)
      .toBeLessThanOrEqual(1);
    expect(Math.abs(result.productSwitch.buttonWidths[0] - result.productSwitch.buttonWidths[1]),
      `opções simétricas em ${viewportWidth}px`).toBeLessThanOrEqual(1);
    expect(result.errorOverflowWrap).toBe("anywhere");
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
