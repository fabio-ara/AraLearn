import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";

let chromium = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  chromium = null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const exampleProject = createExampleProjectDocument();

async function waitForServerReady(server, port) {
  const deadline = Date.now() + 15000;
  let output = "";

  const onData = (chunk) => {
    output += String(chunk || "");
  };

  server.stdout?.on("data", onData);
  server.stderr?.on("data", onData);

  try {
    while (Date.now() < deadline) {
      if (output.includes(`http://127.0.0.1:${port}/`)) {
        return;
      }
      if (server.exitCode !== null) {
        throw new Error(`Servidor finalizou cedo: ${output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout aguardando servidor: ${output}`);
  } finally {
    server.stdout?.off("data", onData);
    server.stderr?.off("data", onData);
  }
}

async function readGenerationScope(page) {
  return {
    fixedLevels: await page
      .locator(".generate-scope-button[aria-pressed='true']")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-level"))),
    course: await page.locator("[data-field='generate-course-input']").inputValue(),
    module: await page.locator("[data-field='generate-module-input']").inputValue(),
    lesson: await page.locator("[data-field='generate-lesson-input']").inputValue()
  };
}

async function expectVisibleGenerationPanel(page) {
  const panel = page.locator(".generation-overlay-panel");
  assert.equal(await panel.count(), 1);
  assert.equal(await panel.isVisible(), true);
  const box = await panel.boundingBox();
  const shellBox = await page.locator(".app-shell").boundingBox();
  assert.ok(box);
  assert.ok(shellBox);
  assert.ok(box.width > 100);
  assert.ok(box.height > 100);
  assert.ok(box.x >= shellBox.x);
  assert.ok(box.y >= shellBox.y);
  assert.ok(box.x + box.width <= shellBox.x + shellBox.width + 2);
  assert.ok(box.y + box.height <= shellBox.y + shellBox.height + 2);
}

async function expectMobileGenerationPanel(page) {
  const panel = page.locator(".generation-overlay-panel");
  assert.equal(await panel.count(), 1);
  assert.equal(await panel.isVisible(), true);
  const box = await panel.boundingBox();
  const shellBox = await page.locator(".app-shell").boundingBox();
  assert.ok(box);
  assert.ok(shellBox);
  assert.ok(box.width >= shellBox.width - 20);
  assert.ok(box.x <= shellBox.x + 10);
  assert.ok(box.x + box.width <= shellBox.x + shellBox.width + 2);
  assert.ok(box.y + box.height <= shellBox.y + shellBox.height + 2);
}

async function expectActionMenuWithinShell(page, placement) {
  const panel = page.locator("[data-action-menu-sheet='true']");
  assert.equal(await panel.count(), 1);
  assert.equal(await panel.isVisible(), true);
  const box = await panel.boundingBox();
  const shellBox = await page.locator(".app-shell").boundingBox();
  assert.ok(box);
  assert.ok(shellBox);
  assert.ok(box.x >= shellBox.x);
  assert.ok(box.y >= shellBox.y);
  assert.ok(box.x + box.width <= shellBox.x + shellBox.width + 2);
  assert.ok(box.y + box.height <= shellBox.y + shellBox.height + 2);

  if (placement === "side") {
    assert.ok(box.x >= shellBox.x + shellBox.width - box.width - 20);
  }

  if (placement === "bottom") {
    assert.ok(box.width >= Math.min(shellBox.width - 20, 240));
    assert.ok(box.y >= shellBox.y + shellBox.height - box.height - 20);
  }
}

async function seedExampleProject(page) {
  await page.addInitScript((project) => {
    globalThis.localStorage.setItem("aralearn.project", JSON.stringify(project));
  }, exampleProject);
}

test("rotas visiveis de IA funcionam no navegador real", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4196;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='open-generation-panel-course']").first().click();
  await page.waitForSelector("[data-action='close-generation-panel']");
  await expectVisibleGenerationPanel(page);
  assert.deepEqual(await readGenerationScope(page), {
    fixedLevels: ["course"],
    course: "Curso de teste",
    module: "",
    lesson: ""
  });
  await page.locator("[data-action='close-generation-panel']").click();

  await page.locator("[data-action='open-generation-panel-module']").last().click();
  await page.waitForSelector("[data-action='close-generation-panel']");
  await expectVisibleGenerationPanel(page);
  assert.deepEqual(await readGenerationScope(page), {
    fixedLevels: ["course", "module"],
    course: "Curso de teste",
    module: "Módulo de teste",
    lesson: ""
  });
  await page.locator("[data-action='close-generation-panel']").click();

  await page.locator("[data-action='open-module']").first().click();
  await page.locator("[data-action='open-generation-panel-module']").first().click();
  await page.waitForSelector("[data-action='close-generation-panel']");
  await expectVisibleGenerationPanel(page);
  assert.deepEqual(await readGenerationScope(page), {
    fixedLevels: ["course", "module"],
    course: "Curso de teste",
    module: "Módulo de teste",
    lesson: ""
  });
  await page.locator("[data-action='close-generation-panel']").click();

  await page.locator("[data-action='open-generation-panel-lesson']").first().click();
  await page.waitForSelector("[data-action='close-generation-panel']");
  await expectVisibleGenerationPanel(page);
  assert.deepEqual(await readGenerationScope(page), {
    fixedLevels: ["course", "module", "lesson"],
    course: "Curso de teste",
    module: "Módulo de teste",
    lesson: "Fundamentos de Linux, terminal e árvore de diretórios"
  });
  await page.locator("[data-action='close-generation-panel']").click();

  await page.locator("[data-action='open-lesson']").first().click();
  await page.locator("[data-action='open-generation-panel-lesson']").first().click();
  await page.waitForSelector("[data-action='close-generation-panel']");
  await expectVisibleGenerationPanel(page);
  assert.deepEqual(await readGenerationScope(page), {
    fixedLevels: ["course", "module", "lesson"],
    course: "Curso de teste",
    module: "Módulo de teste",
    lesson: "Fundamentos de Linux, terminal e árvore de diretórios"
  });
  await page.locator("[data-action='close-generation-panel']").click();

  const overlaysBefore = await page.locator("[data-action='close-generation-panel']").count();
  await page.locator("[data-action='open-microsequence-assist']").first().click();
  await page.waitForTimeout(300);
  const overlaysAfter = await page.locator("[data-action='close-generation-panel']").count();
  assert.equal(overlaysBefore, 0);
  assert.equal(overlaysAfter, 0);
  assert.equal(await page.locator(".topbar-title").first().textContent(), "Continuar microssequência");
});

test("assistencia da microssequencia mostra quatro acoes e desabilita a proxima quando nao existe", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4204;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='open-module']").first().click();
  await page.locator("[data-action='open-lesson']").first().click();
  await page.locator("[data-action='open-microsequence-assist']").first().click();
  await page.waitForSelector("[data-field='assist-action-intent']");

  const metrics = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("[data-field='assist-action-intent']"));
    const nextPlanned = inputs.find((node) => node.getAttribute("value") === "next_planned");
    const option = nextPlanned?.closest(".assist-action-option");
    return {
      count: inputs.length,
      nextPlannedDisabled: !!nextPlanned?.disabled,
      nextPlannedCopy: option?.textContent?.replace(/\s+/g, " ").trim() || ""
    };
  });

  assert.equal(metrics.count, 4);
  assert.equal(metrics.nextPlannedDisabled, true);
  assert.match(metrics.nextPlannedCopy, /Sem próxima etapa planejada\./);
});

test("painel contextual de geracao usa largura compativel com celular", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4197;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='open-generation-panel-course']").first().click();
  await page.waitForSelector("[data-action='close-generation-panel']");
  await expectMobileGenerationPanel(page);
  assert.deepEqual(await readGenerationScope(page), {
    fixedLevels: ["course"],
    course: "Curso de teste",
    module: "",
    lesson: ""
  });
});

test("sequencia de matriz mantem opcoes no dock do card no celular", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4202;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='open-course']").nth(1).click();
  await page.locator("[data-action='open-module']").nth(1).click();
  await page.locator("[data-action='open-lesson']").nth(2).click();
  await page.locator("[data-action='play-microsequence']").first().click();
  await page.locator("[data-action='next-card']").click();
  await page.locator("[data-action='next-card']").click();
  await page.locator("[data-action='text-gap-open-choice']").first().click();
  await page.waitForSelector(".card-answer-dock [data-action='text-gap-set-choice']");

  const metrics = await page.evaluate(() => {
    const article = document.querySelector(".card-portrait-body");
    const dock = document.querySelector(".card-answer-dock");
    const footer = document.querySelector(".study-reader-footer");
    const wrap = document.querySelector(".runtime-matrix-wrap");
    return {
      prefixes: Array.from(document.querySelectorAll(".runtime-matrix-sequence-prefix")).map((node) => node.textContent.trim()),
      operators: Array.from(document.querySelectorAll(".runtime-matrix-sequence-operator")).map((node) => node.textContent.trim()),
      options: Array.from(document.querySelectorAll(".card-answer-dock [data-action='text-gap-set-choice']")).map((node) => node.textContent.trim()),
      articleContainsDock: !!(article && dock && article.contains(dock)),
      dockAboveFooter: !!(dock && footer && dock.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1),
      wrapOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : 0,
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  assert.deepEqual(metrics.prefixes, ["A + B ="]);
  assert.deepEqual(metrics.operators, ["+", "=", "="]);
  assert.deepEqual(new Set(metrics.options), new Set(["5", "6", "7"]));
  assert.equal(metrics.articleContainsDock, true);
  assert.equal(metrics.dockAboveFooter, true);
  assert.ok(metrics.wrapOverflow <= 1);
  assert.ok(metrics.bodyOverflow <= 1);
});

test("editor de cards no celular mantém o textarea estável e o rodapé dentro da shell", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4203;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='open-module']").first().click();
  await page.locator("[data-action='open-lesson']").first().click();
  await page.locator("[data-action='open-microsequence-assist']").first().click();
  await page.locator("[data-action='select-workbench-pane'][data-workbench-pane='edit']").click();
  await page.waitForSelector("[data-field='assist-prompt']");

  await page.evaluate(() => {
    globalThis.__assistPromptRef = document.querySelector("[data-field='assist-prompt']");
  });
  await page.locator("[data-field='assist-prompt']").fill("Eu não sei o que são PC e IR.");

  const metrics = await page.evaluate(() => {
    const prompt = document.querySelector("[data-field='assist-prompt']");
    const actionRow = document.querySelector(".generate-action-row.assist-actions.assist-actions-wide");
    const shell = document.querySelector(".app-shell");
    return {
      samePromptNode: globalThis.__assistPromptRef === prompt,
      promptValue: prompt?.value || "",
      footerInsideShell:
        !!(actionRow && shell) &&
        actionRow.getBoundingClientRect().bottom <= shell.getBoundingClientRect().bottom + 1
    };
  });

  assert.equal(metrics.samePromptNode, true);
  assert.equal(metrics.promptValue, "Eu não sei o que são PC e IR.");
  assert.equal(metrics.footerInsideShell, true);
});

test("menus de acoes respeitam a moldura da shell no navegador real", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4199;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='open-home-actions']").click();
  await page.waitForSelector("[data-action-menu-sheet='true']");
  await expectActionMenuWithinShell(page, "side");
  await page.locator("[data-action='dismiss-action-menu']").click();

  await page.locator("[data-action='open-course-actions']").first().click();
  await page.waitForSelector("[data-action-menu-sheet='true']");
  await expectActionMenuWithinShell(page, "bottom");
});

test("overlays fecham ao clicar fora do popup", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4200;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await seedExampleProject(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='open-generation-panel-global']").click();
  await page.waitForSelector(".generation-overlay-panel");
  await page.locator(".overlay-shell").click({ position: { x: 6, y: 6 } });
  await page.waitForFunction(() => !document.querySelector(".generation-overlay-panel"));

  await page.locator("[data-action='open-home-actions']").click();
  await page.waitForSelector("[data-action-menu-sheet='true']");
  await page.locator(".action-menu-overlay").click({ position: { x: 6, y: 6 } });
  await page.waitForFunction(() => !document.querySelector("[data-action-menu-sheet='true']"));

  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='open-course-screen-actions']").click();
  await page.waitForSelector("[data-action-menu-sheet='true']");
  await page.locator(".action-menu-overlay").click({ position: { x: 6, y: 6 } });
  await page.waitForFunction(() => !document.querySelector("[data-action-menu-sheet='true']"));
});

test.skip("geracao estrutural da licao precisa de cenario browser dedicado para o fluxo CourseForge", () => {});

test.skip("projeto vazio cria cursos com ids públicos globais crescentes", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4212;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='quick-create-course']").click();
  const courseButtons = page.locator("[data-action='open-course']");
  await courseButtons.nth((await courseButtons.count()) - 1).click();

  assert.equal(await page.locator(".topbar-title").first().textContent(), "C2 → C3");
  const structureVersions = await page.evaluate(() =>
    JSON.parse(globalThis.localStorage.getItem("aralearn.structure-versions.v1") || "{}")
  );
  const project = await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem("aralearn.project") || "{}"));
  const createdCourse = project.courses.at(-1);
  assert.equal(structureVersions[`course::${createdCourse.key}`]?.versions?.[0]?.publicNumber, 2);
  assert.equal(structureVersions.project?.versions?.at(-1)?.publicNumber, 3);
});

test.skip("curso vazio não herda abas de módulos de outros cursos", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4213;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='quick-create-module']").click();
  await page.locator("[data-action='go-back']").click();
  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='open-course']").nth(1).click();

  assert.equal(await page.locator(".topbar-title").first().textContent(), "C3 → C4");
  assert.equal(await page.locator(".structure-version-tab").count(), 0);
  assert.equal(await page.locator("text=Sem módulos.").count() > 0, true);
});

test.skip("módulos novos em cursos diferentes recebem ids públicos globais crescentes", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4216;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='quick-create-module']").click();
  assert.equal(await page.locator(".structure-version-tab").count(), 1);
  assert.equal(await page.locator(".structure-version-tab").first().getAttribute("title"), "M1");

  await page.locator("[data-action='go-back']").click();
  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='open-course']").nth(1).click();
  await page.locator("[data-action='quick-create-module']").click();
  assert.equal(await page.locator(".structure-version-tab").count(), 1);
  assert.equal(await page.locator(".structure-version-tab").first().getAttribute("title"), "M2");

  const structureVersions = await page.evaluate(() =>
    JSON.parse(globalThis.localStorage.getItem("aralearn.structure-versions.v1") || "{}")
  );
  const moduleEntries = Object.fromEntries(
    Object.entries(structureVersions)
      .filter(([key]) => key.startsWith("module::"))
      .map(([key, entry]) => [
        key,
        (entry?.versions || []).map((version) => version?.publicNumber)
      ])
  );
  assert.deepEqual(moduleEntries, {
    "module::course-novo-curso::module-novo-modulo": [1],
    "module::course-novo-curso-2::module-novo-modulo": [2]
  });
});

test.skip("selecionar aba estrutural já visível recentraliza a aba escolhida", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4218;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  for (let index = 0; index < 7; index += 1) {
    await page.locator("[data-action='quick-create-course']").click();
  }

  const strip = page.locator("[data-structure-version-strip='true']");
  await page.waitForFunction(() => {
    const shell = document.querySelector("[data-structure-version-strip-shell='true']");
    return shell?.getAttribute("data-structure-version-overflowing") === "true";
  });
  await strip.evaluate((node) => {
    node.scrollLeft = 492;
  });
  await page.waitForTimeout(50);
  const beforeScrollLeft = await strip.evaluate((node) => node.scrollLeft);
  const stripBox = await strip.boundingBox();
  const tabBox = await page.locator(".structure-version-tab[title='C4 → C5']").boundingBox();
  assert.ok(stripBox);
  assert.ok(tabBox);
  await page.mouse.click(Math.max(stripBox.x + 16, tabBox.x + 16), tabBox.y + tabBox.height / 2);
  await page.waitForTimeout(300);
  const after = await strip.evaluate((node) => {
    const activeTab = node.querySelector(".structure-version-tab.active");
    if (!activeTab) {
      return null;
    }
    const tabCenter = activeTab.offsetLeft + activeTab.offsetWidth / 2;
    const stripCenter = node.scrollLeft + node.clientWidth / 2;
    return {
      scrollLeft: node.scrollLeft,
      centerDistance: Math.abs(tabCenter - stripCenter)
    };
  });
  assert.ok(after);
  assert.notEqual(after.scrollLeft, beforeScrollLeft);
  assert.ok(after.centerDistance <= 2);
});

test.skip("criar módulo em curso anterior a partir da home histórica mantém ids globais", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4219;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  for (let index = 0; index < 6; index += 1) {
    await page.locator("[data-action='quick-create-course']").click();
  }
  await page.locator("[data-action='open-course']").nth(5).click();
  await page.locator("[data-action='quick-create-module']").click();
  await page.locator("[data-action='go-back']").click();
  await page.locator(".structure-version-tab[title='C6 → C7']").click();
  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='quick-create-module']").click();

  assert.equal(await page.locator(".topbar-title").first().textContent(), "C7 → C9");
  assert.deepEqual(await page.locator(".structure-version-tab").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title"))), ["M2"]);

  const structureVersions = await page.evaluate(() =>
    JSON.parse(globalThis.localStorage.getItem("aralearn.structure-versions.v1") || "{}")
  );
  const moduleEntries = Object.fromEntries(
    Object.entries(structureVersions)
      .filter(([key]) => key.startsWith("module::"))
      .map(([key, entry]) => [key, (entry?.versions || []).map((version) => version?.publicNumber)])
  );
  assert.deepEqual(moduleEntries, {
    "module::course-novo-curso-6::module-novo-modulo": [1],
    "module::course-novo-curso::module-novo-modulo": [2]
  });
});

test.skip("criar após navegar para versão antiga continua a partir do head atual", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4217;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='open-course']").first().click();
  await page.locator("[data-action='quick-create-module']").click();
  await page.locator("[data-action='go-back']").click();
  await page.locator("[data-action='quick-create-course']").click();
  await page.locator("[data-action='open-course']").nth(1).click();
  await page.locator("[data-action='quick-create-module']").click();
  await page.locator("[data-action='go-back']").click();

  await page.locator(".structure-version-tab[title='C3 → C4']").click();
  await page.locator("[data-action='open-course']").first().click();
  assert.equal(await page.locator(".topbar-title").first().textContent(), "C3 → C4");

  await page.locator("[data-action='quick-create-module']").click();
  assert.equal(await page.locator(".topbar-title").first().textContent(), "C4 → C6");
  assert.deepEqual(await page.locator(".structure-version-tab").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title"))), [
    "M1",
    "M3"
  ]);

  const structureVersions = await page.evaluate(() =>
    JSON.parse(globalThis.localStorage.getItem("aralearn.structure-versions.v1") || "{}")
  );
  assert.deepEqual(
    structureVersions.project.versions.map((version) => ({ id: version.id, parentVersionId: version.parentVersionId || "" })),
    [
      { id: "v1", parentVersionId: "" },
      { id: "v2", parentVersionId: "v1" },
      { id: "v3", parentVersionId: "v2" },
      { id: "v4", parentVersionId: "v3" },
      { id: "v5", parentVersionId: "v4" },
      { id: "v6", parentVersionId: "v4" }
    ]
  );
});

test.skip("navegação estrutural mantém ids estáveis para a mesma entidade entre versões", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4215;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const projectV1 = {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-a",
        title: "Curso A v1",
        modules: [
          {
            key: "module-a",
            title: "Módulo A v1",
            lessons: [
              {
                key: "lesson-a",
                title: "Lição A v1",
                microsequences: [
                  {
                    key: "micro-a",
                    title: "Mic A",
                    status: "ready",
                    cards: [{ key: "card-a", title: "Card A", say: "Conteúdo" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const project = {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-a",
        title: "Curso A v2",
        modules: [
          {
            key: "module-a",
            title: "Módulo A v2",
            lessons: [
              {
                key: "lesson-a",
                title: "Lição A v2",
                microsequences: [
                  {
                    key: "micro-a",
                    title: "Mic A",
                    status: "ready",
                    cards: [{ key: "card-a", title: "Card A", say: "Conteúdo" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const courseV1 = projectV1.courses[0];
  const moduleV1 = courseV1.modules[0];
  const lessonV1 = moduleV1.lessons[0];
  const structureVersions = {
    project: {
      level: "project",
      entityKey: "project",
      activeVersionId: "v2",
      versions: [
        {
          id: "v1",
          versionNumber: 1,
          label: "Versão 1",
          operationType: "seed",
          publicNumber: 1,
          level: "project",
          entityKey: "project",
          snapshot: structuredClone(projectV1),
          createdAt: "2026-05-10T10:00:00.000Z",
          updatedAt: "2026-05-10T10:00:00.000Z"
        },
        {
          id: "v2",
          versionNumber: 2,
          label: "Versão 2",
          operationType: "update",
          parentVersionId: "v1",
          publicNumber: 2,
          level: "project",
          entityKey: "project",
          snapshot: {
            courses: structuredClone(project.courses)
          },
          createdAt: "2026-05-10T11:00:00.000Z",
          updatedAt: "2026-05-10T11:00:00.000Z"
        }
      ]
    },
    "course::course-a": {
      level: "course",
      entityKey: "course-a",
      activeVersionId: "v2",
      versions: [
        {
          id: "v1",
          versionNumber: 1,
          label: "Versão 1",
          operationType: "seed",
          parentVersionId: "",
          publicNumber: 1,
          level: "course",
          entityKey: "course-a",
          snapshot: structuredClone(courseV1),
          createdAt: "2026-05-10T10:00:00.000Z",
          updatedAt: "2026-05-10T10:00:00.000Z"
        },
        {
          id: "v2",
          versionNumber: 2,
          label: "Versão 2",
          operationType: "update",
          parentVersionId: "v1",
          publicNumber: 2,
          level: "course",
          entityKey: "course-a",
          snapshot: structuredClone(project.courses[0]),
          createdAt: "2026-05-10T11:00:00.000Z",
          updatedAt: "2026-05-10T11:00:00.000Z"
        }
      ]
    },
    "module::course-a::module-a": {
      level: "module",
      entityKey: "module-a",
      activeVersionId: "v2",
      versions: [
        {
          id: "v1",
          versionNumber: 1,
          label: "Versão 1",
          operationType: "seed",
          publicNumber: 1,
          level: "module",
          entityKey: "module-a",
          snapshot: structuredClone(moduleV1),
          createdAt: "2026-05-10T10:00:00.000Z",
          updatedAt: "2026-05-10T10:00:00.000Z"
        },
        {
          id: "v2",
          versionNumber: 2,
          label: "Versão 2",
          operationType: "update",
          parentVersionId: "v1",
          publicNumber: 2,
          level: "module",
          entityKey: "module-a",
          snapshot: structuredClone(project.courses[0].modules[0]),
          createdAt: "2026-05-10T11:00:00.000Z",
          updatedAt: "2026-05-10T11:00:00.000Z"
        }
      ]
    },
    "lesson::course-a::module-a::lesson-a": {
      level: "lesson",
      entityKey: "lesson-a",
      activeVersionId: "v2",
      versions: [
        {
          id: "v1",
          versionNumber: 1,
          label: "Versão 1",
          operationType: "seed",
          publicNumber: 1,
          level: "lesson",
          entityKey: "lesson-a",
          snapshot: structuredClone(lessonV1),
          createdAt: "2026-05-10T10:00:00.000Z",
          updatedAt: "2026-05-10T10:00:00.000Z"
        },
        {
          id: "v2",
          versionNumber: 2,
          label: "Versão 2",
          operationType: "update",
          parentVersionId: "v1",
          publicNumber: 2,
          level: "lesson",
          entityKey: "lesson-a",
          snapshot: structuredClone(project.courses[0].modules[0].lessons[0]),
          createdAt: "2026-05-10T11:00:00.000Z",
          updatedAt: "2026-05-10T11:00:00.000Z"
        }
      ]
    }
  };

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.addInitScript(
    ({ seededProject, seededVersions }) => {
      globalThis.localStorage.setItem("aralearn.project", JSON.stringify(seededProject));
      globalThis.localStorage.setItem("aralearn.structure-versions.v1", JSON.stringify(seededVersions));
    },
    { seededProject: project, seededVersions: structureVersions }
  );
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='open-course']").first().click();
  assert.equal(await page.locator(".topbar-title").first().textContent(), "C1 → C2");
  assert.equal(await page.locator(".structure-version-tab").count(), 1);
  assert.equal(await page.locator(".structure-version-tab").first().getAttribute("title"), "M1");

  await page.locator("[data-action='open-module']").first().click();
  assert.equal(await page.locator(".topbar-title").first().textContent(), "C1 → C2 · M1");
  assert.equal(await page.locator(".structure-version-tab").count(), 1);
  assert.equal(await page.locator(".structure-version-tab").first().getAttribute("title"), "L1");

  await page.locator("[data-action='open-lesson']").first().click();
  assert.equal(await page.locator(".topbar-title").first().textContent(), "C1 → C2 · M1 · L1");
  assert.equal(await page.locator(".structure-version-tab").count(), 2);
  assert.equal(await page.locator(".structure-version-tab").first().getAttribute("title"), "V1");
  assert.equal(await page.locator(".structure-version-tab").nth(1).getAttribute("title"), "V1 → V2");
});

test.skip("selecionar aba estrutural recentraliza a aba ativa sem setas laterais", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4214;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  for (let index = 0; index < 7; index += 1) {
    await page.locator("[data-action='quick-create-course']").click();
  }

  const strip = page.locator("[data-structure-version-strip='true']");
  await page.waitForFunction(() => {
    const shell = document.querySelector("[data-structure-version-strip-shell='true']");
    return shell?.getAttribute("data-structure-version-overflowing") === "true";
  });
  const beforeScrollLeft = await strip.evaluate((node) => node.scrollLeft);
  assert.equal(await page.locator("[data-action='scroll-structure-version-prev']").count(), 0);
  assert.equal(await page.locator("[data-action='scroll-structure-version-next']").count(), 0);
  await page.locator(".structure-version-tab[title='C4 → C5']").click();
  await page.waitForTimeout(300);
  const after = await strip.evaluate((node) => {
    const activeTab = node.querySelector(".structure-version-tab.active");
    if (!activeTab) {
      return null;
    }
    const tabCenter = activeTab.offsetLeft + activeTab.offsetWidth / 2;
    const stripCenter = node.scrollLeft + node.clientWidth / 2;
    return {
      scrollLeft: node.scrollLeft,
      centerDistance: Math.abs(tabCenter - stripCenter)
    };
  });
  assert.ok(after);
  assert.notEqual(after.scrollLeft, beforeScrollLeft);
  assert.ok(after.centerDistance <= 2);
});

test.skip("selecionar aba estrutural não colapsa a faixa de volta para o início", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4220;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  for (let index = 0; index < 7; index += 1) {
    await page.locator("[data-action='quick-create-course']").click();
  }

  await page.waitForFunction(() => {
    const shell = document.querySelector("[data-structure-version-strip-shell='true']");
    return shell?.getAttribute("data-structure-version-overflowing") === "true";
  });

  const strip = page.locator("[data-structure-version-strip='true']");
  await strip.evaluate((node) => {
    node.scrollLeft = 492;
  });
  await page.waitForTimeout(50);
  await page.locator(".structure-version-tab[title='C4 → C5']").click();
  await page.waitForTimeout(300);

  const finalScrollLeft = await strip.evaluate((node) => node.scrollLeft);
  assert.ok(finalScrollLeft > 120);
});

test.skip("abas estruturais usam largura proporcional ao conteúdo", async (t) => {
  if (!chromium) {
    t.skip("Playwright indisponivel neste ambiente.");
    return;
  }

  const port = 4221;
  const server = spawn(process.execPath, ["./scripts/servePublic.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      try {
        await once(server, "exit");
      } catch {
        // noop
      }
    }
  });

  await waitForServerReady(server, port);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip("Chromium do Playwright nao esta instalado.");
    return;
  }
  t.after(async () => {
    await browser?.close();
  });

  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

  await page.locator("[data-action='quick-create-course']").click();

  const tabWidths = await page.locator(".structure-version-tab").evaluateAll((nodes) =>
    nodes.map((node) => ({
      title: node.getAttribute("title"),
      width: node.getBoundingClientRect().width,
      minWidth: globalThis.getComputedStyle(node).minWidth,
      paddingLeft: Number.parseFloat(globalThis.getComputedStyle(node).paddingLeft || "0"),
      paddingRight: Number.parseFloat(globalThis.getComputedStyle(node).paddingRight || "0"),
      borderLeft: Number.parseFloat(globalThis.getComputedStyle(node).borderLeftWidth || "0"),
      borderRight: Number.parseFloat(globalThis.getComputedStyle(node).borderRightWidth || "0"),
      contentWidth: Math.max(
        node.querySelector(".editor-version-tab-main")?.scrollWidth || 0,
        node.querySelector(".editor-version-tab-meta")?.scrollWidth || 0
      )
    }))
  );

  assert.equal(tabWidths.length, 2);
  assert.equal(tabWidths[0].title, "C1");
  assert.equal(tabWidths[1].title, "C1 → C2");
  assert.equal(tabWidths[0].minWidth, "0px");
  assert.equal(tabWidths[1].minWidth, "0px");
  for (const tab of tabWidths) {
    const frameWidth = tab.paddingLeft + tab.paddingRight + tab.borderLeft + tab.borderRight;
    assert.ok(tab.width - tab.contentWidth - frameWidth <= 4);
  }
});
