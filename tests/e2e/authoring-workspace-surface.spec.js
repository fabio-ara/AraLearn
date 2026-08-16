import { expect, test } from "@playwright/test";
import fs from "node:fs";

const WORKSPACE_ID = "20000000-0000-4000-8000-000000000105";
const FIRST_PATH = ["course-a", "module-a", "lesson-a", "micro-a"];
const SECOND_PATH = ["course-a", "module-a", "lesson-a", "micro-b"];
const CAPTURE_AUTHORING_SCREENSHOTS = process.env.ARALEARN_CAPTURE_AUTHORING === "1";

async function mountAuthoring(page, {
  extraDestination = false,
  conflict = false,
  deepFindingPages = 0
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({
    workspaceId,
    firstPath,
    secondPath,
    withExtraDestination,
    withConflict,
    requestedDeepFindingPages
  }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    let revision = 7;
    let value = 2;
    let source = "manual";
    let conflict = withConflict;
    const probe = {
      setCalls: [],
      restoreCalls: [],
      retryCalls: [],
      discardCalls: [],
      findingReads: [],
      resourceReads: [],
      resourceSaves: [],
      openTargets: [],
      returnContexts: [],
      settingsOpens: 0
    };
    const overview = () => ({
      workspaceId,
      title: "Curso de sinais",
      revision,
      state: "building",
      stateLabel: "Em construção",
      pending: conflict,
      conflict,
      parts: [{
        partId: "part-a",
        title: "Fundamentos",
        state: "materialized",
        stateLabel: "Com conteúdo",
        microsequences: [{
          key: "micro-a",
          title: "Sinais no cotidiano",
          entityPath: firstPath,
          state: conflict ? "audit_pending" : "materialized",
          stateLabel: conflict ? "Com conflito" : "Com conteúdo",
          pending: conflict,
          conflict,
          readerTarget: { entityPath: firstPath }
        }, {
          key: "micro-b",
          title: "Sinais em sistemas",
          entityPath: secondPath,
          state: "planned",
          stateLabel: "Planejada",
          readerTarget: { entityPath: secondPath }
        }]
      }],
      findings: [{
        findingId: "finding-course",
        summary: "Objetivo do curso precisa de desenvolvimento",
        severity: "medium",
        targetAvailable: true,
        readerTarget: { entityPath: ["course-a"] }
      }, {
        findingId: "finding-a",
        summary: "Exemplo comprimido demais",
        severity: "high",
        targetAvailable: true,
        readerTarget: { entityPath: [...firstPath, "card-a"], resourceTargetId: "content:diagram-a" }
      }, {
        findingId: "finding-b",
        summary: "Prática ainda não materializada",
        severity: "low",
        targetAvailable: true,
        readerTarget: { entityPath: secondPath }
      }, {
        findingId: "finding-missing",
        summary: "Conteúdo original retirado",
        severity: "medium",
        targetAvailable: false,
        readerTarget: null
      }],
      findingsTotal: requestedDeepFindingPages > 0 ? 4 + requestedDeepFindingPages : 54,
      findingsTruncated: true,
      findingsNextCursor: requestedDeepFindingPages > 0 ? "deep-1" : "50",
      capabilities: { design: true, audit: true, editContent: true }
    });
    const design = () => ({
      workspaceId,
      revision,
      scopeTitle: "Sinais no cotidiano",
      microsequencePath: firstPath,
      pending: conflict,
      conflict,
      parameters: [{
        key: "novelty_level",
        parameterKey: "novelty_level",
        definitionRef: { id: "novelty_level", version: "1.2.0" },
        assignmentRef: source === "manual" ? { id: "assignment-a", version: "2.0.0" } : null,
        label: "Novidade",
        value: { kind: "integer", value },
        valueLabel: String(value),
        source,
        sourceLabel: source === "manual" ? "Definido pelo autor" : "Automático",
        editable: !conflict,
        pending: conflict,
        pendingStatus: conflict ? "conflict" : "",
        pendingRequestId: conflict ? "request-conflict-a" : "",
        conflictMessage: conflict ? "Outra versão foi salva." : "",
        control: { kind: "integer", min: 1, max: 5, step: 1 }
      }, {
        key: "research_factor",
        definitionRef: { id: "research_factor", version: "1.0.0" },
        label: "Condição de pesquisa",
        value: { kind: "enum", value: "condition_a" },
        valueLabel: "Condição A",
        source: "research_locked",
        sourceLabel: "Bloqueado por pesquisa",
        locked: true,
        editable: false,
        control: { kind: "enum", options: [{ value: "condition_a", label: "Condição A" }] }
      }],
      resources: {
        summary: "2 conjuntos disponíveis",
        setCount: 2,
        editable: !conflict
      }
    });
    const extraTargets = Array.from({ length: 54 }, (_, index) => ({
      key: `target-large-${index + 1}`,
      label: `Curso de sinais › Lição ${Math.floor(index / 6) + 1} › Microssequência extensa ${index + 1}`,
      entityPath: ["course-a", `module-large-${Math.floor(index / 12) + 1}`,
        `lesson-large-${Math.floor(index / 6) + 1}`, `micro-large-${index + 1}`],
      selected: false
    }));
    const resourceFacets = {
      families: [{ id: "relations", label: "Relações", count: 3 }],
      disciplines: [{ id: "signals", label: "Sinais", count: 2 }],
      structures: [{ id: "process", label: "Processos", count: 2 }],
      operations: [{ id: "compare", label: "Comparar", count: 1 }],
      practiceModes: [{ id: "guided", label: "Guiada", count: 1 }]
    };
    const resourcePage = ({ resourceSetRef }) => {
      if (!resourceSetRef) {
        return {
          summary: "2 conjuntos disponíveis",
          items: [],
          selectedKeys: [],
          selectionComplete: false,
          setChoices: [{
            key: "set-diagrams",
            label: "Diagramas e relações",
            ref: { id: "set-diagrams", version: "1.0.0" },
            selected: false
          }, {
            key: "set-text",
            label: "Texto essencial",
            ref: { id: "set-text", version: "1.0.0" },
            selected: false
          }],
          requiresSetChoice: true,
          selectedSetKey: "",
          facets: resourceFacets,
          resourceScopes: [],
          editable: true,
          limitation: "Representações animadas não estão disponíveis nesta condição."
        };
      }
      if (resourceSetRef.id === "set-text") {
        return {
          summary: "Texto essencial",
          items: [{ key: "short-text", label: "Texto curto", familyLabel: "Texto", selected: true }],
          selectedKeys: ["short-text"],
          selectedCount: 1,
          selectionComplete: true,
          total: 1,
          nextCursor: null,
          facets: resourceFacets,
          setChoices: [{
            key: "set-diagrams",
            label: "Diagramas e relações",
            ref: { id: "set-diagrams", version: "1.0.0" },
            selected: false
          }, {
            key: "set-text",
            label: "Texto essencial",
            ref: { id: "set-text", version: "1.0.0" },
            selected: true
          }],
          requiresSetChoice: false,
          selectedSetKey: "set-text",
          resourceScopes: [{ key: "microsequence", label: "Esta microssequência", available: true }],
          editable: true,
          limitation: ""
        };
      }
      return {
        summary: "Diagramas e relações",
        items: [{ key: "diagram", label: "Diagrama", familyLabel: "Relações", selected: true }],
        selectedKeys: ["diagram", "resource-not-on-this-page"],
        selectedCount: 2,
        selectionComplete: true,
        total: 41,
        nextCursor: null,
        facets: resourceFacets,
        setChoices: [{
          key: "set-diagrams",
          label: "Diagramas e relações",
          ref: { id: "set-diagrams", version: "1.0.0" },
          selected: true
        }, {
          key: "set-text",
          label: "Texto essencial",
          ref: { id: "set-text", version: "1.0.0" },
          selected: false
        }],
        requiresSetChoice: false,
        selectedSetKey: "set-diagrams",
        resourceScopes: [{ key: "microsequence", label: "Esta microssequência", available: true }, {
          key: "lesson", label: "Esta lição", available: true }, {
          key: "course", label: "Este curso", available: true }, {
          key: "microsequence_set",
          label: "Microssequências escolhidas",
          available: true,
          targets: [{ key: "target-a", label: "Curso de sinais › Fundamentos › Sinais no cotidiano", entityPath: firstPath, selected: true }, {
            key: "target-b", label: "Curso de sinais › Fundamentos › Sinais em sistemas", entityPath: secondPath, selected: false },
          ...extraTargets]
        }],
        editable: true,
        limitation: "Representações animadas não estão disponíveis nesta condição."
      };
    };
    const controller = {
      async listAuthoringWorkspaces() {
        return { items: [{ workspaceId, title: "Curso de sinais", state: "building", stateLabel: "Em construção" }] };
      },
      async loadAuthoringWorkspaceOverview() {
        return overview();
      },
      async loadAuthoringDesign() {
        return design();
      },
      async loadAuthoringFindingsPage(argumentsValue) {
        probe.findingReads.push(structuredClone(argumentsValue));
        if (requestedDeepFindingPages > 0) {
          const pageNumber = Number(String(argumentsValue.cursor).replace("deep-", ""));
          const nextPage = pageNumber < requestedDeepFindingPages ? pageNumber + 1 : null;
          return {
            items: [{
              findingId: `finding-deep-${pageNumber}`,
              summary: `Achado profundo ${pageNumber}`,
              severity: "medium",
              targetAvailable: true,
              readerTarget: { entityPath: ["course-a"] }
            }],
            total: 4 + requestedDeepFindingPages,
            nextCursor: nextPage == null ? null : `deep-${nextPage}`,
            truncated: nextPage != null,
            stale: false,
            scopeTotalKnown: true
          };
        }
        if (argumentsValue.cursor === "50") {
          return {
            items: Array.from({ length: 4 }, (_, index) => ({
              findingId: `finding-page-${51 + index}`,
              summary: index === 3 ? "Achado final 54" : `Achado adicional ${51 + index}`,
              severity: "medium",
              targetAvailable: true,
              readerTarget: { entityPath: ["course-a"] }
            })),
            total: 54,
            nextCursor: null,
            truncated: false,
            stale: false,
            scopeTotalKnown: true
          };
        }
        return { items: overview().findings, total: 54, nextCursor: "50", truncated: true, stale: false };
      },
      async setAuthoringParameter(argumentsValue) {
        probe.setCalls.push(structuredClone(argumentsValue));
        value = Number(argumentsValue.value);
        source = "manual";
        revision += 1;
        return { pending: navigator.onLine === false };
      },
      async restoreAuthoringParameterAuto(argumentsValue) {
        probe.restoreCalls.push(structuredClone(argumentsValue));
        source = "auto";
        value = 2;
        revision += 1;
        return { pending: navigator.onLine === false };
      },
      async retryAuthoringParameterChange(argumentsValue) {
        probe.retryCalls.push(structuredClone(argumentsValue));
        conflict = false;
        revision += 1;
        return design();
      },
      async discardAuthoringParameterChange(argumentsValue) {
        probe.discardCalls.push(structuredClone(argumentsValue));
        conflict = false;
        revision += 1;
        return design();
      },
      async loadAuthoringResourceSetPage(argumentsValue) {
        probe.resourceReads.push(structuredClone(argumentsValue));
        return resourcePage(argumentsValue);
      },
      async saveAuthoringResourceSetSelection(argumentsValue) {
        probe.resourceSaves.push(structuredClone(argumentsValue));
        return argumentsValue.requestId
          ? { succeeded: 2, conflicts: 0, failed: 0, partial: false }
          : {
              succeeded: 1,
              conflicts: 1,
              failed: 0,
              partial: true,
              recovery: {
                action: "retry_same_request",
                requestId: "resource-retry-a",
                message: "Tente concluir os destinos restantes."
              }
            };
      }
    };
    const { createAuthoringWorkspaceSurface } = await import("/src/ui/AuthoringWorkspaceSurface.js");
    const surface = createAuthoringWorkspaceSurface({
      root,
      controller,
      additionalDestinations: withExtraDestination
        ? [{ key: "results", label: "Resultados", icon: "review", available: true }]
        : [],
      onOpenSettings() {
        probe.settingsOpens += 1;
      },
      async onOpenContent(target, returnContext) {
        probe.openTargets.push(structuredClone(target));
        probe.returnContexts.push(structuredClone(returnContext));
        return true;
      }
    });
    window.authoringSurface = surface;
    window.authoringProbe = probe;
    await surface.open();
  }, {
    workspaceId: WORKSPACE_ID,
    firstPath: FIRST_PATH,
    secondPath: SECOND_PATH,
    withExtraDestination: extraDestination,
    withConflict: conflict,
    requestedDeepFindingPages: deepFindingPages
  });
}

async function openFirstMicrosequence(page) {
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await page.getByRole("button", { name: /Sinais no cotidiano/u }).click();
}

test("autodidata encontra Estudo, Autoria, mapa, conteúdo e auditoria sem jargão", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page);

  await expect(page.getByRole("button", { name: "Estudo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Autoria" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Coleções" })).toBeVisible();
  await page.getByRole("button", { name: "Conta e aparência" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.settingsOpens)).toBe(1);
  await expect(page.getByText(/Chatbot|InstructionalAnalysis|MCP|schema|packageId|JSON/u)).toHaveCount(0);
  await page.getByRole("button", { name: /Curso de sinais/u }).click();
  await expect(page.getByRole("tab", { name: "Mapa" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Desenho" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Conteúdo" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Auditoria" })).toBeVisible();

  await page.getByRole("tab", { name: "Auditoria" }).click();
  await expect(page.getByText("Objetivo do curso precisa de desenvolvimento")).toBeVisible();
  await expect(page.getByText("Prática ainda não materializada")).toBeVisible();
  await expect(page.getByText("Conteúdo original retirado")).toBeVisible();
  await expect(page.getByText(/54\+ achados/u)).toBeVisible();
  await expect(page.getByText(/outros achados podem existir/u)).toBeVisible();
  await expect(page.getByRole("button", { name: /Conteúdo original retirado/u })).toBeDisabled();
  await page.getByRole("button", { name: "Carregar mais achados" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.findingReads.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.findingReads[0].cursor)).toBe("50");
  await expect(page.getByText("Achado final 54")).toBeVisible();
  await expect(page.getByText(/^54 achados$/u)).toBeVisible();
  await expect(page.getByRole("button", { name: /Carregar.*achados/u })).toHaveCount(0);

  await page.getByRole("tab", { name: "Mapa" }).click();
  await page.getByRole("button", { name: /Sinais no cotidiano/u }).click();
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await expect(page.getByText("Exemplo comprimido demais")).toBeVisible();
  await expect(page.getByText("Objetivo do curso precisa de desenvolvimento")).toBeVisible();
  await expect(page.getByText("Prática ainda não materializada")).toHaveCount(0);
  await expect(page.locator(".authoring-audit-heading").getByText("Auditoria pendente")).toBeVisible();
  await page.getByRole("button", { name: "Ver todos os achados" }).click();
  await expect(page.getByText("Prática ainda não materializada")).toBeVisible();
});

test("instrutor ajusta valor efetivo, restaura Auto e aplica ResourceSet sem perder invisíveis", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await mountAuthoring(page);
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Desenho" }).click();

  const parameter = page.getByRole("button", { name: /Novidade/u });
  await expect(parameter).toContainText("2");
  await parameter.click();
  const dialog = page.getByRole("dialog", { name: "Novidade" });
  await expect(dialog.locator("output")).toHaveText("2");
  await dialog.getByRole("button", { name: "Aumentar" }).click();
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.setCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.setCalls[0])).toMatchObject({
    parameterKey: "novelty_level",
    value: 3,
    expectedRevision: 7
  });
  expect(await page.evaluate(() => window.authoringProbe.setCalls[0].definitionRef)).toBeUndefined();

  await page.getByRole("button", { name: /Novidade/u }).click();
  await page.getByRole("dialog", { name: "Novidade" }).getByRole("button", { name: /^Auto/u }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.restoreCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.restoreCalls[0].parameterKey)).toBe("novelty_level");
  await expect(page.getByRole("button", { name: /Condição de pesquisa/u })).toBeDisabled();

  await page.getByRole("button", { name: /Resources/u }).click();
  const resources = page.getByRole("dialog", { name: "Resources" });
  await expect(resources.getByText(/Nenhum conjunto foi combinado automaticamente/u)).toBeVisible();
  await resources.getByRole("radio", { name: "Texto essencial" }).click();
  const shortText = resources.getByRole("checkbox", { name: "Texto curto" });
  await shortText.uncheck();
  await expect(resources.getByText("Escolha ao menos um Resource.")).toBeVisible();
  await expect(resources.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await shortText.check();
  await resources.getByRole("radio", { name: "Diagramas e relações" }).click();
  await expect(resources.getByText("Representações animadas não estão disponíveis nesta condição.")).toBeVisible();
  await expect(resources.getByText("2 selecionados")).toBeVisible();
  await resources.getByRole("button", { name: /Famílias e facetas/u }).click();
  await resources.locator("summary").filter({ hasText: "Famílias" }).click();
  await resources.getByRole("checkbox", { name: "Relações (3)" }).check();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceReads.at(-1)?.facets?.families?.[0])).toBe("relations");
  const diagram = resources.getByRole("checkbox", { name: "Diagrama" });
  await diagram.uncheck();
  await resources.getByRole("searchbox", { name: "Pesquisar Resources" }).fill("diagrama");
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceReads.length)).toBeGreaterThan(2);
  await expect(diagram).not.toBeChecked();
  await diagram.check();
  await resources.getByRole("button", { name: /Aplicar em/u }).click();
  await resources.getByRole("radio", { name: "Microssequências escolhidas" }).click();
  await expect(resources.locator("[data-resource-target-index]")).toHaveCount(24);
  await resources.getByRole("searchbox", { name: "Localizar microssequência" }).fill("extensa 54");
  await expect(resources.getByRole("checkbox", { name: /Microssequência extensa 54/u })).toBeVisible();
  await resources.getByRole("searchbox", { name: "Localizar microssequência" }).fill("Sinais em sistemas");
  await resources.getByRole("checkbox", { name: /Sinais em sistemas/u }).check();
  const applyResources = resources.getByRole("button", { name: "Aplicar", exact: true });
  await applyResources.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceSaves.length)).toBe(1);
  const saved = await page.evaluate(() => window.authoringProbe.resourceSaves[0]);
  expect(saved.scope.kind).toBe("microsequence_set");
  expect(saved.scope.microsequencePaths).toEqual([FIRST_PATH, SECOND_PATH]);
  expect(saved.selectedKeys).toEqual(["diagram", "resource-not-on-this-page"]);
  expect(saved.selectionComplete).toBe(true);
  await expect(resources.getByText(/1 concluída.*1 com conflito/u)).toBeVisible();
  await expect(resources.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await expect(resources.getByRole("checkbox", { name: "Diagrama" })).toBeDisabled();
  const retryResources = resources.getByRole("button", { name: "Tentar concluir" });
  await retryResources.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.authoringProbe.resourceSaves.length)).toBe(2);
  const retried = await page.evaluate(() => window.authoringProbe.resourceSaves[1]);
  expect(retried.requestId).toBe("resource-retry-a");
  expect(retried.scope).toEqual(saved.scope);
  expect(retried.selectedKeys).toEqual(saved.selectedKeys);
  expect(retried.resourceSetRef).toEqual(saved.resourceSetRef);
  expect(retried.expectedRevision).toBeUndefined();
});

test("pesquisador vê lock e resolve conflito sem novo override silencioso", async ({ page }) => {
  await mountAuthoring(page, { conflict: true });
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Desenho" }).click();

  await expect(page.getByRole("button", { name: /Novidade/u })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Condição de pesquisa/u })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Resources/u })).toBeDisabled();
  await expect(page.getByText(/conflito.*Resolva-a/u)).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.retryCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.retryCalls[0].requestId)).toBe("request-conflict-a");
  await expect(page.getByRole("button", { name: /Novidade/u })).toBeEnabled();
});

test("finding abre alvo exato e retorna à Auditoria e à mesma microssequência", async ({ page }) => {
  await mountAuthoring(page);
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await page.getByRole("button", { name: /Exemplo comprimido demais/u }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.openTargets.length)).toBe(1);
  expect(await page.evaluate(() => window.authoringProbe.openTargets[0])).toMatchObject({
    workspaceId: WORKSPACE_ID,
    entityPath: [...FIRST_PATH, "card-a"],
    resourceTargetId: "content:diagram-a"
  });
  expect(await page.evaluate(() => window.authoringProbe.returnContexts[0])).toMatchObject({
    workspaceId: WORKSPACE_ID,
    destination: "audit",
    microsequencePath: FIRST_PATH,
    findingId: "finding-a"
  });
  await page.evaluate(() => window.authoringSurface.resume(window.authoringProbe.returnContexts[0]));
  await expect(page.getByRole("tab", { name: "Auditoria" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Exemplo comprimido demais")).toBeVisible();
  await expect(page.getByRole("button", { name: /Exemplo comprimido demais/u })).toBeFocused();
  await expect(page.getByRole("button", { name: "Ver todos os achados" })).toBeVisible();

  await page.getByRole("button", { name: "Carregar mais achados" }).click();
  await page.getByRole("button", { name: /Achado final 54/u }).click();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.openTargets.length)).toBe(2);
  expect(await page.evaluate(() => window.authoringProbe.returnContexts[1])).toMatchObject({
    destination: "audit",
    microsequencePath: FIRST_PATH,
    findingId: "finding-page-54"
  });
  await page.evaluate(() => window.authoringSurface.resume(window.authoringProbe.returnContexts[1]));
  await expect(page.getByRole("button", { name: /Achado final 54/u })).toBeFocused();
});

test("retorno encontra o achado por cursor mesmo depois de mais de oito páginas", async ({ page }) => {
  await mountAuthoring(page, { deepFindingPages: 9 });
  await openFirstMicrosequence(page);

  await page.evaluate(({ workspaceId, firstPath }) => window.authoringSurface.resume({
    workspaceId,
    destination: "audit",
    microsequencePath: firstPath,
    findingId: "finding-deep-9"
  }), { workspaceId: WORKSPACE_ID, firstPath: FIRST_PATH });

  await expect(page.getByRole("button", { name: "Achado profundo 9" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.authoringProbe.findingReads.length)).toBe(9);
});

test("shell mantém uma superfície e navegação acessível em 360, 390, 412 e 1280", async ({ page }) => {
  for (const width of [360, 390, 412, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 780 });
    await mountAuthoring(page, { extraDestination: true });
    await page.getByRole("button", { name: /Curso de sinais/u }).click();
    const geometry = await page.evaluate(() => {
      const root = document.querySelector(".authoring-app-root");
      const tabs = [...document.querySelectorAll("[data-authoring-destination]")]
        .map((node) => node.getBoundingClientRect());
      return {
        rootWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        tabs: tabs.map(({ left, right, top, bottom }) => ({ left, right, top, bottom })),
        viewport: document.documentElement.clientWidth
      };
    });
    expect(geometry.rootScrollWidth).toBeLessThanOrEqual(geometry.rootWidth);
    for (const tab of geometry.tabs) {
      expect(tab.left).toBeGreaterThanOrEqual(0);
      expect(tab.right).toBeLessThanOrEqual(geometry.viewport);
    }
    if (width < 800) {
      expect(new Set(geometry.tabs.map((tab) => Math.round(tab.top))).size).toBe(1);
    } else {
      expect(geometry.tabs[1].top).toBeGreaterThan(geometry.tabs[0].top);
    }
    const map = page.getByRole("tab", { name: "Mapa" });
    await map.focus();
    await map.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Desenho" })).toHaveAttribute("aria-selected", "true");
  }
});

test("tema claro/escuro, zoom de 200% e fila offline preservam operação", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountAuthoring(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-color-mode", "dark"));
  await openFirstMicrosequence(page);
  await page.getByRole("tab", { name: "Desenho" }).click();
  await expect(page.locator(".authoring-screen")).toHaveCSS("color", /rgb/u);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-color-mode", "light");
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: /Novidade/u }).click();
  await page.getByRole("dialog", { name: "Novidade" }).getByRole("button", { name: "Aumentar" }).click();
  await page.getByRole("dialog", { name: "Novidade" }).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText(/aguardando sincronização/u)).toBeVisible();
  await context.setOffline(false);
});

test("gera capturas canônicas de Mapa, Desenho e Auditoria", async ({ page }) => {
  test.skip(!CAPTURE_AUTHORING_SCREENSHOTS, "Captura opt-in para não alterar artefatos em cada regressão.");
  fs.mkdirSync("docs/screenshots/authoring", { recursive: true });
  for (const fixture of [
    { width: 390, height: 844, theme: "light" },
    { width: 1280, height: 800, theme: "dark" }
  ]) {
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await mountAuthoring(page);
    await page.evaluate((theme) => document.documentElement.setAttribute("data-color-mode", theme), fixture.theme);
    await page.getByRole("button", { name: /Curso de sinais/u }).click();
    const suffix = `${fixture.width}-${fixture.theme}`;
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-map-${suffix}.png`,
      animations: "disabled"
    });
    await page.getByRole("button", { name: /Sinais no cotidiano/u }).click();
    await page.getByRole("tab", { name: "Desenho" }).click();
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-design-${suffix}.png`,
      animations: "disabled"
    });
    await page.getByRole("tab", { name: "Auditoria" }).click();
    await page.screenshot({
      path: `docs/screenshots/authoring/authoring-audit-${suffix}.png`,
      animations: "disabled"
    });
  }
});
