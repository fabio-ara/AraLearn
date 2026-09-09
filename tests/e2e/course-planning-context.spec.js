import { test, expect } from "@playwright/test";
import { coursePlanningContextFixture } from "../helpers/coursePlanningContextFixture.js";
import { microsequenceReviewExport, REVIEW_COURSE_ID, REVIEW_MS_ID } from "../helpers/courseMicrosequenceReviewFixture.js";

async function mount(page, options = {}) {
  const fixture = coursePlanningContextFixture(options);
  const identities = new Map([[REVIEW_COURSE_ID, fixture.courseId], [REVIEW_MS_ID, "micro-context"],
    ["module-review", "module-context"], ["lesson-review", "lesson-context"], ["Curso sintético", fixture.course.title]]);
  const replaceIdentities = value => Array.isArray(value) ? value.map(replaceIdentities) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceIdentities(item)])) : identities.get(value) || value;
  fixture.exported = replaceIdentities(microsequenceReviewExport({ revision: 1, withUnits: false }));
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async (fixture) => {
    document.body.innerHTML = '<div id="app-root"><main id="course-authoring-root" class="course-authoring-root"></main></div>';
    const { createCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    const h = window.planningHarness = { data: fixture, requests: [], pending: null, entityReads: [], exportReads: [], deferEntity: false };
    const clone = value => structuredClone(value);
    h.advance = () => {
      const d = h.data;
      d.course.revision += 1; d.plan.courseRevision = d.course.revision; d.plan.plan.version += 1;
      d.plan.plan.curriculumMapStatus = "approved";
      d.read.courseRevision = d.course.revision; d.read.planVersion = d.plan.plan.version;
      d.read.mapApprovalReference = `subsequent_map_${d.read.courseRevision}`;
      for (const design of Object.values(d.designs)) design.courseRevision = d.course.revision;
    };
    h.controller = {
      listCourses: async () => ({ contract: "aralearn.course-list.v2", items: [], hasMore: false, nextCursor: null }),
      getCourse: async () => clone(h.data.course), loadAuthoringPlan: async () => clone(h.data.plan),
      getCurricularMap: async () => clone(h.data.read), getPendingCurricularMapChange: async () => clone(h.pending),
      approveCurricularMap: (courseId, reference) => new Promise((resolve, reject) => {
        h.pending = { operation: "approval", command: { courseId, reference }, uncertain: true };
        h.requests.push({ courseId, reference, resolve: ({ lost = false, advance = true } = {}) => {
          if (advance) h.advance();
          if (lost) { reject(new TypeError("Resposta perdida")); return; }
          h.pending = null;
          resolve({ contract: "aralearn.course-curricular-map-change.v1", courseId, courseRevision: h.data.course.revision,
            planVersion: h.data.plan.plan.version, approval: "approved", changed: true, idempotent: !advance });
        } });
      }),
      loadCourseDesign: async (_id, { scope }) => clone(h.data.designs[scope.kind]),
      getMicrosequenceForExplanation: async (_id, microsequenceId) => {
        h.entityReads.push(microsequenceId);
        if (h.deferEntity) return new Promise(resolve => { h.resolveEntity = () => resolve(clone(h.data.entity)); });
        return clone(h.data.entity);
      },
      getContentReview: async () => clone(h.data.review), loadCourseAuthoringAnalytics: async () => clone(h.data.analytics),
      exportCourseAuthoring: async selection => { h.exportReads.push(clone(selection)); return clone(h.data.exported); },
      loadAuthoringOutline: async () => { throw new Error("Leitura de unidades não deve ocorrer no mapa."); },
      loadAuthoringStudyUnits: async () => { throw new Error("Leitura de unidades não deve ocorrer no mapa."); },
      loadAuthoringInspectionPosition: async () => null, saveAuthoringInspectionPosition: async () => {},
      createCourse: async () => {}, mutateCourseDesign: async () => {}
    };
    history.replaceState(null, "", `/#/authoring/courses/${fixture.courseId}?section=planning`);
    h.surface = createCourseAuthoringSurface({ root: document.querySelector("main"), controller: h.controller, onOpenSettings: () => {} });
    await h.surface.open();
    await document.fonts.ready;
  }, fixture);
  await expect(page.getByRole("region", { name: "Mapa curricular", exact: true })).toBeVisible();
  return errors;
}

const microAction = (page, action) => page.locator(`[data-curriculum-context="${action}"][data-target-id="micro-context"]`);
async function expand(page) {
  await page.locator('[data-curriculum-expansion="module:module-context"] > summary').click();
  await page.locator('[data-curriculum-expansion="lesson:lesson-context"] > summary').click();
}

test("Explicação salva abre diretamente pelo mapa sem unidades e retorna ao mesmo ramo", async ({ page }, testInfo) => {
  const errors = await mount(page);
  await expand(page);
  await microAction(page, "explanation").click();
  const dialog = page.locator('[data-review-close]').locator('..').locator('..');
  await expect(dialog.locator('.runtime-markdown-paragraph').filter({ hasText: /^Um socket é a interface local usada pelo processo\.$/u })).toBeVisible();
  await expect(page.locator('[data-review-unit]')).toHaveCount(0);
  expect(await page.evaluate(() => window.planningHarness.exportReads)).toEqual([{
    courseId: "10000000-0000-4000-8000-000000000001", expectedRevision: 1, scope: { kind: "didactic_microsequence", ref: "micro-context" }
  }]);
  expect(new URL(page.url()).hash).toContain("section=planning");
  await page.screenshot({ path: testInfo.outputPath("planning-base-first.png") });
  await page.locator('[data-review-close]').click();
  await expect(microAction(page, "explanation")).toBeFocused();
  expect(errors).toEqual([]);
});

test("mapa rascunho encontra pendência, mantém expansões e abre ajustes sem etapa de Conteúdo", async ({ page }, testInfo) => {
  const errors = await mount(page, { incomplete: true });
  await expect(page.getByRole("checkbox", { name: "Inspecionei esta versão do mapa completo." })).toBeDisabled();
  const query = page.getByRole("searchbox", { name: "Buscar no mapa" });
  await query.fill("base antes");
  await expect(microAction(page, "parameters")).toBeVisible();
  await page.getByRole("button", { name: /Mostrar somente pendências do mapa/u }).click();
  await expect(microAction(page, "parameters")).toBeVisible();
  await query.fill("sem correspondência");
  await expect(page.getByText("Nenhum ramo ou item corresponde aos filtros.")).toBeVisible();
  await query.fill("");
  await page.getByRole("button", { name: /Mostrar somente pendências do mapa/u }).click();
  await expect(page.locator('[data-curriculum-expansion="module:module-context"]')).not.toHaveAttribute("open", "");
  await expand(page);
  await microAction(page, "instruction").click();
  const panel = page.locator('[data-course-design-context-dialog]');
  await expect(panel.getByText("Há uma base explicativa salva.")).toBeVisible();
  await expect(panel.getByText("Previsto na intenção corrente desta microssequência.")).toBeVisible();
  await expect(panel.getByText("Ainda não há unidades neste recorte para consultar declarações de aplicação.")).toBeVisible();
  expect(new URL(page.url()).hash).toContain("section=planning");
  await page.screenshot({ path: testInfo.outputPath("planning-base-context-393.png") });
  await panel.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await expect(microAction(page, "instruction")).toBeFocused();
  await microAction(page, "guidance").click();
  await panel.locator('.course-design-local-editor > summary').click();
  await panel.getByRole("textbox", { name: "Direção editorial", exact: true }).fill("Rascunho contextual preservado.");
  await panel.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await microAction(page, "guidance").click();
  await expect(panel.locator('.course-design-local-editor')).toHaveAttribute("open", "");
  await expect(panel.getByRole("textbox", { name: "Direção editorial", exact: true })).toHaveValue("Rascunho contextual preservado.");
  expect(errors).toEqual([]);
});

test("aprovação usa referência inspecionada e resposta tardia conserva painel, objeto e rascunho", async ({ page }, testInfo) => {
  const errors = await mount(page);
  await expand(page);
  const approve = page.getByRole("button", { name: "Aprovar mapa inspecionado", exact: true });
  await expect(approve).toBeDisabled();
  await page.getByRole("checkbox", { name: "Inspecionei esta versão do mapa completo." }).check();
  await approve.click();
  await expect.poll(() => page.evaluate(() => window.planningHarness.requests.length)).toBe(1);
  expect(await page.evaluate(() => window.planningHarness.requests[0].reference)).toBe("inspected_map_1_1");
  await microAction(page, "guidance").click();
  const panel = page.locator('[data-course-design-context-dialog]');
  const draft = panel.getByRole("textbox", { name: "Direção editorial", exact: true });
  await panel.locator('.course-design-local-editor > summary').click();
  await draft.fill("Edição posterior ao envio da aprovação.");
  await page.evaluate(() => window.planningHarness.requests[0].resolve());
  await expect(panel).toBeVisible();
  await expect(draft).toHaveValue("Edição posterior ao envio da aprovação.");
  await expect(draft).toBeFocused();
  await panel.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await expect(page.getByText("Mapa salvo · versão 2 · revisão do curso 2.")).toBeVisible();
  await expect(microAction(page, "guidance")).toBeFocused();
  await expect(approve).toBeDisabled();
  await page.evaluate(() => { document.querySelector("main").scrollTop = 0; document.documentElement.dataset.colorMode = "dark"; });
  await page.screenshot({ path: testInfo.outputPath("planning-context-dark-393.png") });
  expect(errors).toEqual([]);
});

test("resposta perdida retoma referência original mesmo depois de o servidor avançar", async ({ page }) => {
  const errors = await mount(page);
  await page.getByRole("checkbox", { name: "Inspecionei esta versão do mapa completo." }).check();
  await page.getByRole("button", { name: "Aprovar mapa inspecionado", exact: true }).click();
  await page.evaluate(() => window.planningHarness.requests[0].resolve({ lost: true }));
  await page.getByRole("button", { name: "Confirmar aprovação pendente", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.planningHarness.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.planningHarness.requests.map(item => item.reference))).toEqual(["inspected_map_1_1", "inspected_map_1_1"]);
  await page.evaluate(() => window.planningHarness.requests[1].resolve({ advance: false }));
  await expect(page.getByText("Mapa salvo · versão 2 · revisão do curso 2.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprovar mapa inspecionado", exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("leitura tardia de fontes não substitui outro contexto e ações mantêm área de toque sem transbordamento", async ({ page }, testInfo) => {
  const errors = await mount(page);
  await expand(page);
  await page.evaluate(() => { window.planningHarness.deferEntity = true; });
  await microAction(page, "sources").click();
  await microAction(page, "guidance").click();
  const panel = page.locator('[data-course-design-context-dialog]');
  const draft = panel.getByRole("textbox", { name: "Direção editorial", exact: true });
  await panel.locator('.course-design-local-editor > summary').click();
  await draft.fill("Outro contexto permanece ativo.");
  await page.evaluate(() => window.planningHarness.resolveEntity());
  await expect(draft).toHaveValue("Outro contexto permanece ativo.");
  await expect(draft).toBeFocused();
  await panel.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      targets: [...document.querySelectorAll('[data-curriculum-context]')].filter(node => node.getClientRects().length)
        .map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
    }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    for (const rect of geometry.targets) { expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44); }
    await page.evaluate(() => { document.querySelector("main").scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`planning-context-${width}.png`) });
  }
  expect(errors).toEqual([]);
});
