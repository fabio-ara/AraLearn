import { expect, test } from "@playwright/test";

const ENROLLMENT_REF = "60000000-0000-4000-8000-000000000107";
const COURSE_ID = "80000000-0000-4000-8000-000000000107";

async function mountEnrollment(page) {
  await page.goto("/#experiment=ESTUDO_2026-A");
  await page.evaluate(async ({ enrollmentRef, courseId }) => {
    document.body.replaceChildren();
    const study = document.createElement("main");
    study.id = "study-content";
    study.innerHTML = '<button type="button">Conteúdo de Estudo</button>';
    const root = document.createElement("div");
    root.id = "experiment-enrollment-root";
    root.className = "experiment-enrollment-root";
    document.body.append(study, root);
    const selection = {
      selectionId: "70000000-0000-4000-8000-000000000107",
      courseId,
      contentHash: "a".repeat(64),
      readerTarget: { courseId, access: "private", contentHash: "a".repeat(64) }
    };
    const probe = {
      calls: [],
      opened: [],
      handles: [],
      fragmentDuringPolicyRead: null,
      openSucceeds: true
    };
    const controller = {
      async listInstructionalExperimentEnrollments() {
        return structuredClone(probe.handles);
      },
      async loadInstructionalExperimentEnrollmentPolicy(args) {
        probe.calls.push({ operation: "read_policy", args: structuredClone(args) });
        probe.fragmentDuringPolicyRead = location.hash;
        return {
          title: "Estudo de representações",
          policy: {
            ref: { id: "consent-a", version: "1.0.0" },
            label: "Consentimento do estudo",
            publicText: "Participação voluntária. Você pode sair quando quiser."
          }
        };
      },
      async enrollInInstructionalExperiment(args) {
        probe.calls.push({ operation: "enroll", args: structuredClone(args) });
        const value = { enrollmentRef, status: "enrolled", selection: null };
        probe.handles = [value];
        return structuredClone(value);
      },
      async loadInstructionalExperimentEnrollmentStatus(args) {
        probe.calls.push({ operation: "status", args: structuredClone(args) });
        const value = { enrollmentRef, status: "assigned", selection };
        probe.handles = [value];
        return structuredClone(value);
      },
      async withdrawAuthoringExperimentEnrollment(args) {
        probe.calls.push({ operation: "withdraw", args: structuredClone(args) });
        const value = { enrollmentRef, status: "withdrawn", selection: null };
        probe.handles = [value];
        return structuredClone(value);
      }
    };
    const { createExperimentEnrollmentSurface } = await import("/src/ui/ExperimentEnrollmentSurface.js");
    const surface = createExperimentEnrollmentSurface({
      root,
      controller,
      async onOpenSelection(target, value) {
        probe.opened.push({ target: structuredClone(target), selection: structuredClone(value) });
        return probe.openSucceeds;
      }
    });
    window.experimentEnrollmentProbe = probe;
    window.experimentEnrollmentSurface = surface;
    await surface.consumeFragment();
  }, { enrollmentRef: ENROLLMENT_REF, courseId: COURSE_ID });
}

test("fragmento abre consentimento, atribuição privada funciona offline e retirada usa handle opaco", async ({
  page,
  context
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountEnrollment(page);

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("dialog", { name: "Estudo de representações" })).toBeVisible();
  expect(await page.evaluate(() => window.experimentEnrollmentProbe.fragmentDuringPolicyRead)).toBe("");
  expect(await page.locator("#study-content").evaluate((node) => ({
    inert: node.inert,
    ariaHidden: node.getAttribute("aria-hidden")
  }))).toEqual({ inert: true, ariaHidden: "true" });

  const consent = page.getByRole("checkbox", { name: /Li as informações/u });
  await expect(consent).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null)).toBe(true);
  await consent.check();
  await page.getByRole("button", { name: "Confirmar ingresso" }).click();
  await expect(page.getByRole("heading", { name: "Aguardando atribuição" })).toBeVisible();
  await page.getByRole("button", { name: "Atualizar situação" }).click();
  await expect(page.getByRole("heading", { name: "Variante disponível" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir variante atribuída" }).click();
  expect(await page.evaluate(() => window.experimentEnrollmentProbe.opened.at(-1).selection.courseId)).toBe(COURSE_ID);

  await expect(page.getByRole("button", { name: "Participar de estudo" })).toBeVisible();
  expect(await page.locator("#study-content").evaluate((node) => node.inert)).toBe(false);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Participar de estudo" }).click();
  await page.getByRole("button", { name: "Variante disponível" }).click();
  await expect(page.getByRole("button", { name: "Retirar participação" })).toBeDisabled();
  await page.getByRole("button", { name: "Abrir variante atribuída" }).click();
  expect(await page.evaluate(() => window.experimentEnrollmentProbe.calls.map(({ operation }) => operation))).toEqual([
    "read_policy", "enroll", "status"
  ]);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Participar de estudo" }).click();
  await page.getByRole("button", { name: "Variante disponível" }).click();
  await page.evaluate(() => { window.experimentEnrollmentProbe.openSucceeds = false; });
  await page.getByRole("button", { name: "Abrir variante atribuída" }).click();
  await expect(page.getByRole("alert")).toContainText("ainda não está disponível");
  await page.getByRole("button", { name: "Retirar participação" }).click();
  await page.getByRole("button", { name: "Retirar participação" }).click();
  await expect(page.getByRole("heading", { name: "Participação encerrada" })).toBeVisible();
  const withdrawal = await page.evaluate(() => window.experimentEnrollmentProbe.calls.at(-1));
  expect(withdrawal.operation).toBe("withdraw");
  expect(withdrawal.args.enrollmentRef).toBe(ENROLLMENT_REF);
  expect(withdrawal.args.enrollmentCode).toBeUndefined();
});

test("acionador de estudo é um ícone dentro do mesmo enquadramento móvel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const root = document.createElement("div");
    root.id = "experiment-enrollment-root";
    root.className = "experiment-enrollment-root";
    document.body.append(root);
    const { createExperimentEnrollmentSurface } = await import("/src/ui/ExperimentEnrollmentSurface.js");
    createExperimentEnrollmentSurface({ root, controller: {} });
  });

  const launcher = page.getByRole("button", { name: "Participar de estudo" });
  await expect(launcher).toBeVisible();
  expect(await launcher.locator("span").count()).toBe(0);
  const geometry = await page.evaluate(() => {
    const root = document.querySelector(".experiment-enrollment-root").getBoundingClientRect();
    const button = document.querySelector(".experiment-enrollment-launcher").getBoundingClientRect();
    return { root: { left: root.left, width: root.width }, button: { left: button.left, right: button.right, width: button.width, height: button.height } };
  });
  expect(geometry.root.width).toBe(430);
  expect(geometry.root.left).toBe(425);
  expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.root.left);
  expect(geometry.button.right).toBeLessThanOrEqual(geometry.root.left + geometry.root.width);
  expect(geometry.button.width).toBe(44);
  expect(geometry.button.height).toBe(44);
});
