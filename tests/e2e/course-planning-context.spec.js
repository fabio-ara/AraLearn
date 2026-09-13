import { test, expect } from "@playwright/test";
import { coursePlanningContextFixture } from "../helpers/coursePlanningContextFixture.js";
import { microsequenceReviewExport, REVIEW_COURSE_ID, REVIEW_MS_ID } from "../helpers/courseMicrosequenceReviewFixture.js";

async function mount(page, options = {}) {
  const fixture = coursePlanningContextFixture(options);
  if (options.longObjectives) {
    const objective = "Compreender as relações entre mecanismos e evidências, comparar explicações e aplicar esse conhecimento em situações novas com autonomia.";
    fixture.course.goal = fixture.plan.plan.objective = objective;
    for (const curriculum of [fixture.read.map, fixture.plan.plan.curriculum]) {
      const module = curriculum.modules[0];
      module.objective = module.lessons[0].objective = module.lessons[0].microsequences[0].objective = objective;
    }
  }
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

for (const width of [390, 430, 1280]) test(`hierarquia e ações do planejamento em ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const errors = await mount(page, { longObjectives: true });
  await page.evaluate(width => { document.documentElement.dataset.colorMode = width === 1280 ? "light" : "dark"; }, width);
  await expect(page.locator('.course-authoring-parts')).toHaveCount(0);
  await expect(page.locator('[data-course-authoring-action="reorganize-parts"]')).toHaveCount(0);
  await expand(page);
  for (const summary of await page.locator('.course-curriculum-map-objective > summary').all()) await summary.click();
  const geometry = await page.evaluate(() => {
    const style = node => ({ size: parseFloat(getComputedStyle(node).fontSize), weight: Number(getComputedStyle(node).fontWeight) });
    const card = document.querySelector('.is-objective .course-authoring-planning-card');
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      disclosureIndents: [...document.querySelectorAll('.course-curriculum-map-details[open]')].map(node => {
        const label = document.createRange();
        label.selectNodeContents(node.querySelector(':scope > summary').firstChild);
        const body = node.querySelector(':scope > .course-curriculum-map-body');
        return body.getBoundingClientRect().left + parseFloat(getComputedStyle(body).paddingLeft) - label.getBoundingClientRect().left;
      }),
      objectives: [{ label: style(card.querySelector('h3')), body: style(card.querySelector('p')) },
        ...[...document.querySelectorAll('.course-curriculum-map-objective')].map(node => ({ label: style(node.querySelector('summary')), body: style(node.querySelector('p')) }))],
      groups: [...document.querySelectorAll('.course-curriculum-context-actions')].map(node => ({
        gap: node.getBoundingClientRect().right - node.lastElementChild.getBoundingClientRect().right,
        targets: [...node.children].map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, text: button.textContent.trim() }))
      }))
    };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  for (const indent of geometry.disclosureIndents) expect(Math.abs(indent)).toBeLessThanOrEqual(1);
  for (const { label, body } of geometry.objectives) { expect(body.size).toBeLessThan(label.size); expect(body.weight).toBeLessThan(label.weight); }
  for (const group of geometry.groups) {
    expect(Math.abs(group.gap)).toBeLessThanOrEqual(1);
    for (const target of group.targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); expect(target.text).toBe(""); }
  }
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath(`planning-objectives-${width}.png`) });
  await microAction(page, 'parameters').click();
  await page.locator('[data-course-design-context-dialog]').getByRole('button', { name: 'Fechar parâmetros', exact: true }).click();
  await expect(microAction(page, 'parameters')).toBeFocused();
  await microAction(page, 'guidance').click();
  await page.locator('[data-course-design-context-dialog]').getByRole('button', { name: 'Fechar parâmetros', exact: true }).click();
  await expect(microAction(page, 'guidance')).toBeFocused();
  const approval = page.getByRole('region', { name: 'Aprovação do mapa', exact: true });
  await expect(approval).not.toContainText(/Mapa salvo|revisão do curso|ramos recolhidos|resultados fora da busca/u);
  await expect(approval.getByRole('heading')).toHaveCount(0);
  const approve = approval.getByRole('button', { name: 'Aprovar mapa inspecionado' });
  const approvalGeometry = await approval.evaluate(node => {
    const label = node.querySelector('label').getBoundingClientRect();
    const button = node.querySelector('button').getBoundingClientRect();
    return { weight: getComputedStyle(node.querySelector('label')).fontWeight,
      rightGap: node.getBoundingClientRect().right - button.right,
      centerDifference: label.top + label.height / 2 - button.top - button.height / 2,
      separation: button.left - label.right };
  });
  expect(Math.abs(approvalGeometry.rightGap)).toBeLessThanOrEqual(1);
  expect(approvalGeometry.weight).toBe('400');
  expect(Math.abs(approvalGeometry.centerDifference)).toBeLessThanOrEqual(1);
  expect(approvalGeometry.separation).toBeGreaterThanOrEqual(12);
  await expect(approve).toBeDisabled();
  await approval.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await expect(approve).toBeEnabled();
  await approval.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`planning-approval-${width}.png`) });
  await approve.click();
  expect(await page.evaluate(() => window.planningHarness.requests[0].reference)).toBe('inspected_map_1_1');
  await page.evaluate(() => window.planningHarness.requests[0].resolve());
  await expect(approve).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Explicação salva abre diretamente pelo mapa sem unidades e retorna ao mesmo ramo", async ({ page }, testInfo) => {
  const errors = await mount(page);
  await expand(page);
  await microAction(page, "explanation").click();
  const dialog = page.locator('[data-review-close]').locator('..').locator('..');
  const paragraph = dialog.locator('.runtime-markdown-paragraph').filter({ hasText: /^Um socket é a interface local usada pelo processo\.\u20601$/u });
  await expect(paragraph).toBeVisible();
  await expect(paragraph.getByRole("button", { name: "Referência 1", exact: true })).toBeVisible();
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
  await expect(page.getByRole("checkbox", { name: "Revisei o mapa completo" })).toBeDisabled();
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
  await page.getByRole("checkbox", { name: "Revisei o mapa completo" }).check();
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
  await expect(page.getByText("Mapa inspecionado aprovado.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => [window.planningHarness.data.read.planVersion, window.planningHarness.data.read.courseRevision])).toEqual([2, 2]);
  await expect(microAction(page, "guidance")).toBeFocused();
  await expect(approve).toBeDisabled();
  await page.evaluate(() => { document.querySelector("main").scrollTop = 0; document.documentElement.dataset.colorMode = "dark"; });
  await page.screenshot({ path: testInfo.outputPath("planning-context-dark-393.png") });
  expect(errors).toEqual([]);
});

test("resposta perdida retoma referência original mesmo depois de o servidor avançar", async ({ page }) => {
  const errors = await mount(page);
  await page.getByRole("checkbox", { name: "Revisei o mapa completo" }).check();
  await page.getByRole("button", { name: "Aprovar mapa inspecionado", exact: true }).click();
  await page.evaluate(() => window.planningHarness.requests[0].resolve({ lost: true }));
  await page.getByRole("button", { name: "Confirmar aprovação pendente", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.planningHarness.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.planningHarness.requests.map(item => item.reference))).toEqual(["inspected_map_1_1", "inspected_map_1_1"]);
  await page.evaluate(() => window.planningHarness.requests[1].resolve({ advance: false }));
  await expect(page.getByText("Mapa inspecionado aprovado.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => [window.planningHarness.data.read.planVersion, window.planningHarness.data.read.courseRevision])).toEqual([2, 2]);
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
