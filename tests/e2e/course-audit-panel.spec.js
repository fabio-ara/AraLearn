import { expect, test } from "@playwright/test";

const IDS = Object.freeze({
  course: "10000000-0000-4000-8000-000000000001",
  finding: "20000000-0000-4000-8000-000000000002",
  correction: "30000000-0000-4000-8000-000000000003",
  run: "40000000-0000-4000-8000-000000000004",
  check: "50000000-0000-4000-8000-000000000005",
  plan: "60000000-0000-4000-8000-000000000006",
  cleanRun: "80000000-0000-4000-8000-000000000008",
  runChecks: [
    "81000000-0000-4000-8000-000000000001",
    "82000000-0000-4000-8000-000000000002",
    "83000000-0000-4000-8000-000000000003",
    "84000000-0000-4000-8000-000000000004"
  ]
});

function captureClientErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectCompactAuditSurface(page, viewportWidth) {
  const geometry = await page.locator(".course-authoring-surface").evaluate((surface) => {
    const frame = surface.querySelector(".course-authoring-frame");
    const panel = surface.querySelector(".course-audit-panel");
    const surfaceRect = surface.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const macroSelectors = [
      ".course-audit-panel",
      ".course-audit-view:not([hidden])",
      ".course-audit-detail",
      ".course-audit-run-detail",
      ".course-audit-run-checks",
      ".course-audit-preview-grid",
      ".course-audit-summary",
      ".course-audit-checkpoint-sources"
    ].join(",");
    const macroColumns = [...surface.querySelectorAll(macroSelectors)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display === "grid" && style.visibility !== "hidden" &&
          rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        className: element.className,
        columns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/u).length
      }));
    return {
      surfaceWidth: surfaceRect.width,
      frameWidth: frameRect.width,
      panelWidth: panelRect.width,
      leftSpace: surfaceRect.left,
      rightSpace: innerWidth - surfaceRect.right,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      macroColumns
    };
  });

  expect(geometry.surfaceWidth).toBeLessThanOrEqual(430);
  expect(geometry.frameWidth).toBeLessThanOrEqual(430);
  expect(geometry.panelWidth).toBeLessThanOrEqual(430);
  expect(geometry.horizontalOverflow).toBe(false);
  expect(geometry.macroColumns.length).toBeGreaterThan(0);
  expect(geometry.macroColumns.filter(({ columns }) => columns !== 1)).toEqual([]);
  if (viewportWidth > 430) {
    expect(Math.abs(geometry.leftSpace - geometry.rightSpace)).toBeLessThanOrEqual(1);
  }
}

function auditSeed() {
  const sourceId = " Fonte literal ";
  const anchorId = "anchor-literal";
  const hashes = {
    before: "a".repeat(64),
    after: "b".repeat(64),
    context: "c".repeat(64),
    source: "d".repeat(64),
    anchor: "e".repeat(64),
    links: "f".repeat(64)
  };
  const content = (text) => ({
    title: "Unidade auditada",
    role: "theory",
    content: [{
      id: "explicacao",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text }
    }],
    response: null,
    feedback: [],
    topics: ["conceito-central", "evidência"]
  });
  return {
    ids: IDS,
    hashes,
    sourceId,
    anchorId,
    beforeContent: content("Texto anterior sustentado pela Fonte."),
    afterContent: content("Texto corrigido sustentado pela Fonte."),
    path: [
      { kind: "course", id: IDS.course, label: "Curso auditado", version: 7 },
      { kind: "module", id: "module-a", label: "Módulo", version: 1 },
      { kind: "lesson", id: "lesson-a", label: "Lição", version: 1 },
      {
        kind: "didactic_microsequence",
        id: "micro-a",
        label: "Microssequência",
        version: 1
      },
      { kind: "study_unit", id: "unit-a", label: "Unidade auditada", version: 2 }
    ]
  };
}

async function mountAuditPanel(page, {
  target = "finding",
  reconciliationFailure = false
} = {}) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async ({ seed, target, requestedReconciliationFailure }) => {
    document.body.replaceChildren();
    const surface = document.createElement("main");
    surface.className = "course-authoring-surface";
    surface.dataset.section = "observations";
    surface.innerHTML = '<div class="course-authoring-frame">' +
      '<div id="course-audit-e2e-root" class="course-audit-host"></div></div>';
    document.body.append(surface);

    const clone = (value) => structuredClone(value);
    const sourceLink = {
      sourceId: seed.sourceId,
      sourceRevision: 2,
      relation: "supported_by",
      anchors: [{ anchorId: seed.anchorId, anchorRevision: 3 }]
    };
    const state = {
      courseRevision: 7,
      auditSetVersion: 1,
      findingVersion: 1,
      correctionVersion: 1,
      findingStatus: "open",
      correctionStatus: "proposed",
      currentVersion: 2,
      currentHash: seed.hashes.before,
      currentContent: clone(seed.beforeContent),
      afterContent: clone(seed.afterContent),
      application: null,
      verification: null,
      rollback: null,
      findingHistory: [{
        findingVersion: 1,
        status: "open",
        decision: "recorded",
        correctionId: null,
        verificationAuditRunId: null,
        createdAt: "2026-08-17T12:00:00Z"
      }],
      correctionHistory: [{
        correctionId: seed.ids.correction,
        correctionVersion: 1,
        status: "proposed",
        rationale: "Corrigir a afirmação sem alterar a estrutura.",
        createdAt: "2026-08-17T12:10:00Z"
      }]
    };
    const reads = [];
    const writes = [];
    const revisionChanges = [];
    let mutationConfirmed = false;
    let reconciliationFailureDelivered = false;

    const summary = () => ({
      matchingTotal: 1,
      byState: {
        open: state.findingStatus === "open" ? 1 : 0,
        awaiting_verification: state.findingStatus === "awaiting_verification" ? 1 : 0,
        resolved: state.findingStatus === "resolved" ? 1 : 0,
        dismissed: state.findingStatus === "dismissed" ? 1 : 0
      },
      byDimension: {
        structural_conformance: 0,
        pedagogical_quality: 0,
        factual_quality: 1,
        editorial_quality: 0
      },
      bySeverity: { low: 0, medium: 0, high: 1, critical: 0 }
    });
    const auditCheck = () => ({
      checkId: seed.ids.check,
      dimension: "factual_quality",
      criterion: {
        code: "mcp.review.factual_traceability",
        version: "2026.08",
        statement: "O conceito focal mantém rastreabilidade literal até a evidência indicada."
      },
      result: "failed",
      publicEvidence: "A edição citada diverge do texto da Unidade.",
      adequacy: "insufficient",
      planItemRefs: [],
      parameterRefs: [],
      sourceLinks: [clone(sourceLink)]
    });
    const runChecks = () => [
      "structural_conformance", "pedagogical_quality", "factual_quality", "editorial_quality"
    ].map((dimension, index) => ({
      checkId: seed.ids.runChecks[index],
      dimension,
      criterion: {
        code: `automatic.${dimension}`,
        version: "1",
        statement: `Critério preservado de ${dimension}.`
      },
      result: "passed",
      publicEvidence: `Evidência pública preservada de ${dimension}.`,
      adequacy: "sufficient",
      planItemRefs: [],
      parameterRefs: [],
      sourceLinks: dimension === "factual_quality" ? [clone(sourceLink)] : []
    }));
    const runSummary = () => ({
      auditRunId: seed.ids.cleanRun,
      runKind: "audit",
      origin: "automatic_audit",
      method: { id: "aralearn.automatic-course-audit", version: "1" },
      courseRevision: 7,
      target: { studyUnitId: "unit-a", version: 2, hash: seed.hashes.before },
      resultCounts: {
        passed: 4,
        failed: 0,
        uncertain: 0,
        not_applicable: 0,
        not_checked: 0
      },
      findingsCreated: 0,
      createdAt: "2026-08-17T13:00:00Z",
      deepLink: `#/authoring/courses/${seed.ids.course}?section=observations&auditRunId=${seed.ids.cleanRun}`
    });
    const runDetail = () => ({
      contract: "aralearn.course-instructional-audit-run.v1",
      auditRunId: seed.ids.cleanRun,
      runKind: "audit",
      origin: "automatic_audit",
      method: { id: "aralearn.automatic-course-audit", version: "1" },
      courseRevision: 7,
      contextHash: seed.hashes.context,
      target: {
        studyUnitId: "unit-a",
        version: 2,
        hash: seed.hashes.before,
        path: clone(seed.path)
      },
      checks: runChecks(),
      metrics: {
        checksTotal: 4,
        byResult: {
          passed: 4,
          failed: 0,
          uncertain: 0,
          not_applicable: 0,
          not_checked: 0
        },
        findingsCreated: 0
      },
      createdAt: "2026-08-17T13:00:00Z"
    });
    const findingCapabilities = () => ({
      canDismiss: state.findingStatus === "open",
      canReopen: ["resolved", "dismissed"].includes(state.findingStatus),
      canProposeCorrection: state.findingStatus === "open" &&
        ["proposed", "rejected", "rolled_back"].includes(state.correctionStatus),
      canVerify: state.correctionStatus === "applied"
    });
    const correctionCapabilities = () => ({
      canAdjust: state.correctionStatus === "proposed",
      canReject: state.correctionStatus === "proposed",
      canApply: state.correctionStatus === "proposed",
      canVerify: state.correctionStatus === "applied",
      canRollback: ["applied", "verified"].includes(state.correctionStatus)
    });
    const finding = () => ({
      contract: "aralearn.course-audit-finding.v1",
      findingId: seed.ids.finding,
      findingVersion: state.findingVersion,
      courseId: seed.ids.course,
      status: state.findingStatus,
      origin: "human_audit",
      code: "mcp.review.factual_traceability",
      severity: "high",
      target: {
        studyUnitId: "unit-a",
        observedVersion: 2,
        observedHash: seed.hashes.before,
        currentAvailable: true,
        currentVersion: state.currentVersion,
        currentHash: state.currentHash,
        path: clone(seed.path)
      },
      auditRun: {
        auditRunId: seed.ids.run,
        runKind: "audit",
        courseRevision: 7,
        createdAt: "2026-08-17T12:00:00Z"
      },
      check: auditCheck(),
      annotationRefs: [],
      correctionRef: {
        correctionId: seed.ids.correction,
        correctionVersion: state.correctionVersion,
        status: state.correctionStatus
      },
      timestamps: {
        createdAt: "2026-08-17T12:00:00Z",
        updatedAt: "2026-08-17T12:10:00Z",
        resolvedAt: state.findingStatus === "resolved" ? "2026-08-17T12:30:00Z" : null,
        dismissedAt: state.findingStatus === "dismissed" ? "2026-08-17T12:30:00Z" : null
      },
      capabilities: findingCapabilities(),
      deepLinks: {
        detail: `#/authoring/courses/${seed.ids.course}?section=observations&findingId=${seed.ids.finding}`,
        target: `#/authoring/courses/${seed.ids.course}?section=inspection&studyUnitId=unit-a`
      }
    });
    const rationale = () => state.correctionHistory.at(-1).rationale;
    const correction = () => ({
      contract: "aralearn.course-authoring-correction.v1",
      correctionId: seed.ids.correction,
      correctionVersion: state.correctionVersion,
      courseId: seed.ids.course,
      findingId: seed.ids.finding,
      status: state.correctionStatus,
      target: {
        studyUnitId: "unit-a",
        baseVersion: 2,
        baseHash: seed.hashes.before
      },
      checkpoint: {
        before: {
          content: clone(seed.beforeContent),
          sourceLinks: [clone(sourceLink)],
          hash: seed.hashes.before
        },
        after: {
          content: clone(state.afterContent),
          sourceLinks: [clone(sourceLink)],
          hash: seed.hashes.after
        }
      },
      rationale: rationale(),
      application: clone(state.application),
      verification: clone(state.verification),
      rollback: clone(state.rollback),
      timestamps: {
        createdAt: "2026-08-17T12:10:00Z",
        updatedAt: "2026-08-17T12:10:00Z"
      },
      capabilities: correctionCapabilities(),
      deepLink: `#/authoring/courses/${seed.ids.course}?section=observations&findingId=${seed.ids.finding}&correctionId=${seed.ids.correction}`
    });
    const context = () => ({
      contract: "aralearn.course-audit-context.v1",
      contextHash: seed.hashes.context,
      target: {
        studyUnitId: "unit-a",
        version: state.currentVersion,
        hash: state.currentHash,
        position: 1,
        path: clone(seed.path),
        content: clone(state.currentContent),
        sourceLinks: [clone(sourceLink)]
      },
      didacticMicrosequence: {
        id: "micro-a",
        version: 1,
        hash: seed.hashes.before,
        content: { title: "Microssequência" }
      },
      plan: {
        planId: seed.ids.plan,
        version: 2,
        audience: "Pessoas iniciantes.",
        instructionalScope: "Explicar o conceito central.",
        authoringGuidance: "Use evidência verificável.",
        items: []
      },
      design: {
        parameters: [{
          parameterId: "scaffolding",
          value: "progressive",
          origin: "course",
          reason: "Apoio gradual.",
          sourceScope: null,
          inherited: true
        }],
        guidance: [],
        componentPolicy: {
          changeId: null,
          policy: {
            availability: "all",
            allowedRefs: [],
            excludedRefs: [],
            preferredRefs: ["aralearn.resource.paragraph"]
          },
          origin: "course",
          reason: "Catálogo padrão.",
          sourceScope: null,
          inherited: true
        }
      },
      intent: {
        query: "Explicação factual",
        slot: "content",
        studyUnitRole: "theory",
        disciplineIds: [],
        structureIds: [],
        taskOperationIds: ["explain"],
        practiceModeIds: [],
        knowledgeObjects: ["conceito"],
        mustPreserve: ["Fonte exata"],
        notationIsLearningObject: false
      },
      sources: [{
        sourceId: seed.sourceId,
        sourceRevision: 2,
        status: "active",
        kind: "book",
        title: "Fonte literal preservada",
        authorship: "Autoria",
        publicationDate: "2026",
        identifier: null,
        language: "pt-BR",
        citationText: "Autoria. Fonte verificável. 2026.",
        url: "https://example.test/fonte",
        editionOrVersion: "2ª edição",
        origin: "external",
        availability: "open_access",
        verificationStatus: "author_verified",
        studyVisibility: "citation",
        relation: "supported_by",
        sourceHash: seed.hashes.source,
        anchors: [{
          anchorId: seed.anchorId,
          anchorRevision: 3,
          status: "active",
          selector: { kind: "page_range", startPage: 4, endPage: 4 },
          verificationExcerpt: "Trecho verificável.",
          anchorHash: seed.hashes.anchor,
          deepLink: `#/authoring/courses/${seed.ids.course}?section=sources&sourceId=%20Fonte%20literal%20&anchorId=anchor-literal`
        }],
        deepLink: `#/authoring/courses/${seed.ids.course}?section=sources&sourceId=%20Fonte%20literal%20`
      }],
      annotations: [],
      facts: {
        courseRevision: state.courseRevision,
        targetVersion: state.currentVersion,
        targetHash: state.currentHash,
        sourceLinksHash: seed.hashes.links,
        planVersion: 2
      }
    });
    const pageEnvelope = (options) => {
      const base = {
        contract: "aralearn.course-audit-cycle-page.v1",
        courseId: seed.ids.course,
        courseRevision: state.courseRevision,
        auditSetVersion: state.auditSetVersion,
        query: clone(options.query),
        summary: summary(),
        context: null,
        items: [],
        runs: [],
        detail: null,
        runDetail: null,
        hasMore: false,
        nextCursor: null
      };
      if (options.query.mode === "context") {
        base.context = context();
      } else if (options.query.mode === "findings") {
        base.items = [finding()];
      } else if (options.query.mode === "runs") {
        base.runs = [runSummary()];
      } else if (options.query.auditRunId) {
        base.runDetail = runDetail();
      } else {
        const selected = correction();
        base.detail = {
          finding: finding(),
          findingHistory: clone(state.findingHistory),
          auditRuns: [],
          corrections: [{
            correctionId: seed.ids.correction,
            correctionVersion: state.correctionVersion,
            status: state.correctionStatus,
            rationale: rationale(),
            updatedAt: "2026-08-17T12:10:00Z",
            deepLink: selected.deepLink
          }],
          selectedCorrection: selected,
          selectedCorrectionHistory: clone(state.correctionHistory)
        };
      }
      return base;
    };

    const controller = {
      async loadCourseAuditCycle(courseId, options) {
        reads.push({ courseId, options: clone(options) });
        if (requestedReconciliationFailure && mutationConfirmed &&
            !reconciliationFailureDelivered) {
          reconciliationFailureDelivered = true;
          const error = new Error("A conexão caiu durante a atualização do detalhe.");
          error.code = "network_error";
          throw error;
        }
        return pageEnvelope(options);
      },
      async mutateCourseAuditCycle(input) {
        writes.push(clone(input));
        const command = input.command;
        state.auditSetVersion += 1;
        state.findingVersion += 1;
        state.correctionVersion += 1;
        if (command.type === "propose_authoring_correction") {
          state.afterContent = clone(command.afterContent);
          state.correctionStatus = "proposed";
          state.correctionHistory.push({
            correctionId: command.correctionId,
            correctionVersion: state.correctionVersion,
            status: "proposed",
            rationale: command.rationale,
            createdAt: "2026-08-17T12:15:00Z"
          });
        } else if (command.type === "apply_authoring_correction") {
          state.courseRevision += 1;
          state.currentVersion += 1;
          state.currentHash = seed.hashes.after;
          state.currentContent = clone(state.afterContent);
          state.findingStatus = "awaiting_verification";
          state.correctionStatus = "applied";
          state.application = {
            courseRevision: state.courseRevision,
            targetVersion: state.currentVersion,
            targetHash: state.currentHash,
            appliedAt: "2026-08-17T12:20:00Z"
          };
          state.findingHistory.push({
            findingVersion: state.findingVersion,
            status: state.findingStatus,
            decision: "correction_applied",
            correctionId: seed.ids.correction,
            verificationAuditRunId: null,
            createdAt: "2026-08-17T12:20:00Z"
          });
        } else if (command.type === "verify_finding") {
          state.findingStatus = command.outcome === "resolved" ? "resolved" : "open";
          state.correctionStatus = "verified";
          state.verification = {
            auditRunId: command.auditRunId,
            outcome: command.outcome,
            verifiedAt: "2026-08-17T12:30:00Z"
          };
          state.findingHistory.push({
            findingVersion: state.findingVersion,
            status: state.findingStatus,
            decision: command.outcome,
            correctionId: seed.ids.correction,
            verificationAuditRunId: command.auditRunId,
            createdAt: "2026-08-17T12:30:00Z"
          });
        } else if (command.type === "rollback_authoring_correction") {
          state.courseRevision += 1;
          state.currentVersion += 1;
          state.currentHash = seed.hashes.before;
          state.currentContent = clone(seed.beforeContent);
          state.findingStatus = "open";
          state.correctionStatus = "rolled_back";
          state.rollback = {
            courseRevision: state.courseRevision,
            targetVersion: state.currentVersion,
            targetHash: state.currentHash,
            rolledBackAt: "2026-08-17T12:40:00Z"
          };
          state.findingHistory.push({
            findingVersion: state.findingVersion,
            status: state.findingStatus,
            decision: "rolled_back",
            correctionId: seed.ids.correction,
            verificationAuditRunId: null,
            createdAt: "2026-08-17T12:40:00Z"
          });
        } else {
          throw new TypeError(`Comando não coberto pela fixture: ${command.type}`);
        }
        state.correctionHistory.push({
          correctionId: seed.ids.correction,
          correctionVersion: state.correctionVersion,
          status: state.correctionStatus,
          rationale: rationale(),
          createdAt: "2026-08-17T12:40:00Z"
        });
        mutationConfirmed = true;
        return {
          contract: "aralearn.course-audit-cycle-change.v1",
          courseId: seed.ids.course,
          courseRevision: state.courseRevision,
          auditSetVersion: state.auditSetVersion,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: command.type,
            auditRunId: command.auditRunId || null,
            findingRefs: [{
              findingId: seed.ids.finding,
              findingVersion: state.findingVersion
            }],
            correctionRef: {
              correctionId: seed.ids.correction,
              correctionVersion: state.correctionVersion
            }
          },
          finding: null,
          correction: null,
          suggestedAnnotationActions: []
        };
      }
    };

    const { createCourseAuditPanel } = await import("/src/ui/CourseAuditPanel.js");
    const panel = createCourseAuditPanel({
      root: document.querySelector("#course-audit-e2e-root"),
      controller,
      course: { courseId: seed.ids.course, revision: state.courseRevision },
      routeTarget: target === "run"
        ? { kind: "audit_run", id: seed.ids.cleanRun }
        : {
            kind: "audit_finding",
            id: seed.ids.finding,
            correctionId: seed.ids.correction
          },
      onNavigate(hash) { window.location.hash = hash; },
      onCourseRevisionChange(revision) { revisionChanges.push(revision); },
      navigatorValue: { onLine: true },
      windowValue: window
    });
    globalThis.__courseAuditHarness = {
      panel,
      state,
      reads,
      writes,
      revisionChanges
    };
    await panel.open();
  }, {
    seed: auditSeed(),
    target,
    requestedReconciliationFailure: reconciliationFailure
  });
  await expect(page.locator(target === "run" ? "[data-audit-run-detail-id]" : "[data-audit-detail-id]"))
    .toBeVisible();
}

for (const width of [360, 390, 430, 1280]) {
  test(`Auditoria preserva Before/After e referências em ${width} px`, async ({
    page
  }, testInfo) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 860 : 900 });
    await mountAuditPanel(page);
    await expectCompactAuditSurface(page, width);

    await expect(page.getByRole("heading", { name: "Auditoria e correções" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Achados" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByText("Texto anterior sustentado pela Fonte.", { exact: true }))
      .toBeVisible();
    await expect(page.getByText("Texto corrigido sustentado pela Fonte.", { exact: true }))
      .toBeVisible();
    await expect(page.getByRole("link", { name: "Fonte literal preservada" }).first())
      .toHaveAttribute("href", new RegExp("sourceId=%20Fonte%20literal%20$"));
    await expect(page.getByRole("link", { name: "Abrir Âncora 1" }).first())
      .toHaveAttribute("href", /anchorId=anchor-literal$/u);

    const cards = page.locator("[data-audit-preview-grid] .course-audit-preview-card");
    await expect(cards).toHaveCount(2);
    const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    }));
    expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThanOrEqual(1);
    expect(boxes[1].y).toBeGreaterThan(boxes[0].bottom);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const undersized = await page.locator(
      ".course-audit-panel :is(button, select, summary, a)"
    ).evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && rect.width > 0 && rect.height > 0 && rect.height < 43;
    }).map((node) => ({ text: node.textContent.trim(), height: node.getBoundingClientRect().height })));
    expect(undersized).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`course-audit-${width}.png`),
      fullPage: true,
      animations: "disabled"
    });
    expect(clientErrors).toEqual([]);
  });
}

for (const width of [360, 390, 430, 1280]) {
  test(`Rodada limpa preserva checks e navegação responsiva em ${width} px`, async ({
    page
  }, testInfo) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 860 : 900 });
    await mountAuditPanel(page, { target: "run" });
    await expectCompactAuditSurface(page, width);

    await expect(page.getByRole("heading", { name: /Auditoria ·/u })).toBeVisible();
    await expect(page.locator(".course-audit-run-checks .course-audit-check")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Link da rodada" })).toHaveAttribute(
      "href",
      `#/authoring/courses/${IDS.course}?section=review&auditRunId=${IDS.cleanRun}`
    );
    await expect(page.getByRole("link", { name: "Inspecionar Unidade" })).toHaveAttribute(
      "href",
      `#/authoring/courses/${IDS.course}?section=content&studyUnitId=unit-a`
    );
    const resultColumns = await page.locator(".course-audit-result-counts").first().evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(resultColumns).toBe(2);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.screenshot({
      path: testInfo.outputPath(`course-audit-run-detail-${width}.png`),
      fullPage: true,
      animations: "disabled"
    });

    await page.getByRole("button", { name: "Voltar às rodadas" }).click();
    await expect(page.getByRole("heading", { name: "Rodadas", exact: true })).toBeVisible();
    await expect(page.getByText("Nenhum achado criado", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir rodada" })).toHaveAttribute(
      "href",
      `#/authoring/courses/${IDS.course}?section=observations&auditRunId=${IDS.cleanRun}`
    );

    await page.getByRole("button", { name: "Achados", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Achados", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Rodadas", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Rodadas", exact: true })).toBeVisible();

    const undersized = await page.locator(
      ".course-audit-panel :is(button, select, summary, a)"
    ).evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && rect.width > 0 && rect.height > 0 && rect.height < 43;
    }).map((node) => ({ text: node.textContent.trim(), height: node.getBoundingClientRect().height })));
    expect(undersized).toEqual([]);
    expect(await page.evaluate(() =>
      globalThis.__courseAuditHarness.reads.map(({ options }) => options.query.mode)))
      .toEqual(["detail", "runs", "findings", "runs"]);

    await page.screenshot({
      path: testInfo.outputPath(`course-audit-runs-${width}.png`),
      fullPage: true,
      animations: "disabled"
    });
    expect(clientErrors).toEqual([]);
  });
}

test("Auditoria confirma a escrita uma vez quando a atualização do detalhe falha", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await mountAuditPanel(page, { reconciliationFailure: true });

  await page.getByRole("button", { name: "Ajustar correção" }).click();
  const editor = page.getByRole("dialog", { name: "Editar título e folhas da Unidade" });
  await editor.locator("[data-audit-edit-field]").nth(1)
    .fill("Texto confirmado antes da falha de leitura.");
  await editor.getByRole("button", { name: "Salvar proposta" }).click();

  await expect(page.getByRole("status").filter({
    hasText: "O detalhe será atualizado na próxima sincronização."
  })).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "A conexão caiu" })).toHaveCount(0);
  await expect(page.getByText(/confirmar exatamente a mesma operação/u)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuditHarness.writes.length)).toBe(1);

  await page.evaluate(() => globalThis.__courseAuditHarness.panel.refresh(7));
  await expect(page.getByText(
    "Texto confirmado antes da falha de leitura.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByText(/será atualizado na próxima sincronização/u)).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__courseAuditHarness.writes.length)).toBe(1);
  expect(clientErrors).toEqual([]);
});

test("Auditoria ajusta, aplica, verifica e reverte sem perder topics ou Fontes", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await mountAuditPanel(page);

  await page.getByRole("button", { name: "Ajustar correção" }).click();
  await expect(page.getByRole("dialog", { name: "Editar título e folhas da Unidade" }))
    .toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Editar título e folhas da Unidade" }))
    .toHaveCount(0);

  await page.getByRole("button", { name: "Ajustar correção" }).click();
  const editable = page.locator("[data-audit-edit-field]");
  await expect(editable).toHaveCount(2);
  await editable.nth(1).fill("Texto ajustado no renderer real.");
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuditHarness.writes.length)).toBe(1);
  await expect(page.getByText("Texto ajustado no renderer real.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  let confirmation = page.getByRole("alertdialog", { name: "Aplicar correção?" });
  await expect(confirmation).toHaveAttribute("data-confirmation-tone", "primary");
  await confirmation.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuditHarness.writes.length)).toBe(2);
  await expect(page.getByRole("button", { name: "Verificar", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verificar correção" })).toBeVisible();
  const focalCriterion = page.locator('[data-audit-check-dimension="factual_quality"]');
  await expect(focalCriterion.locator('[name="criterion-code:factual_quality"]'))
    .toHaveValue("mcp.review.factual_traceability");
  await expect(focalCriterion.locator('[name="criterion-code:factual_quality"]'))
    .toHaveAttribute("type", "hidden");
  await expect(focalCriterion.locator('[name="criterion-version:factual_quality"]'))
    .toHaveValue("2026.08");
  await expect(focalCriterion.getByLabel("Critério público"))
    .toHaveValue("O conceito focal mantém rastreabilidade literal até a evidência indicada.");
  await expect(focalCriterion.getByLabel("Critério público")).toHaveJSProperty("readOnly", true);
  await focalCriterion.getByLabel("Evidência desta verificação")
    .fill("O estado corrigido agora coincide com a Âncora preservada.");
  await page.getByLabel("Conclusão da verificação").selectOption("resolved");
  await page.getByRole("button", { name: "Registrar verificação" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuditHarness.writes.length)).toBe(3);
  await expect(page.getByText("Verificação resolveu o achado", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reverter aplicação" }).click();
  confirmation = page.getByRole("alertdialog", { name: "Reverter aplicação?" });
  await expect(confirmation).toHaveAttribute("data-confirmation-tone", "secondary");
  await confirmation.getByRole("button", { name: "Reverter", exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuditHarness.writes.length)).toBe(4);
  await expect(page.getByText("Correção revertida", { exact: true }).first()).toBeVisible();

  const result = await page.evaluate(() => ({
    commands: globalThis.__courseAuditHarness.writes.map(({ command }) => command),
    revisionChanges: globalThis.__courseAuditHarness.revisionChanges
  }));
  expect(result.commands.map(({ type }) => type)).toEqual([
    "propose_authoring_correction",
    "apply_authoring_correction",
    "verify_finding",
    "rollback_authoring_correction"
  ]);
  expect(result.commands[0].afterContent.topics).toEqual(["conceito-central", "evidência"]);
  expect(result.commands[0].afterContent).not.toHaveProperty("id");
  expect(result.commands[0].afterContent).not.toHaveProperty("position");
  expect(result.commands[0].afterSourceLinks).toEqual([{
    sourceId: " Fonte literal ",
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-literal", anchorRevision: 3 }]
  }]);
  expect(result.commands[2].checks.find(({ dimension }) => dimension === "factual_quality"))
    .toMatchObject({
      criterion: {
        code: "mcp.review.factual_traceability",
        version: "2026.08",
        statement: "O conceito focal mantém rastreabilidade literal até a evidência indicada."
      },
      publicEvidence: "O estado corrigido agora coincide com a Âncora preservada."
    });
  expect(result.revisionChanges).toEqual([8, 9]);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(clientErrors).toEqual([]);
});
