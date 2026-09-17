import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "espree";
import { parseCourseStudyRoute } from "../../src/ui/courseStudyRoute.js";
import { isCourseAuthoringRouteCandidate } from "../../src/ui/courseAuthoringRoute.js";
import { publicErrorMessage } from "../../src/ui/publicErrorMessage.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const authoringRoute = `#/authoring/courses/${COURSE_ID}?section=content`;
const studyRoute = (unit) => `#/estudo/${COURSE_ID}/module-a/lesson-a/micro-a/${unit}`;
const mainSource = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
const tree = parse(mainSource, { ecmaVersion: "latest", sourceType: "module", range: true });

function mainNode(predicate) {
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (predicate(node)) return mainSource.slice(...node.range);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === "object") pending.push(value);
    }
  }
  assert.fail("Trecho do shell não encontrado.");
}

function mainDeclaration(name) {
  return mainNode((node) => node.type === "VariableDeclaration" &&
    node.declarations.some((entry) => entry.id.name === name));
}

function navigationHarness({ authoring = true } = {}) {
  const started = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const events = [];
  const warnings = [];
  const opened = [];
  const synchronization = {};
  let view = "home";
  let hashchange;
  const globals = {
    location: { hash: authoring ? authoringRoute : "" },
    queueMicrotask,
    addEventListener(name, listener) {
      assert.equal(name, "hashchange");
      hashchange = listener;
    }
  };
  const authoringSurface = {
    opened: authoring,
    destroy() { this.opened = false; }
  };
  const editorApp = {
    setSynchronizationState(next) { Object.assign(synchronization, next); },
    hasPendingManualEdit() { return false; },
    async replaceProject() { events.push("project"); },
    async refreshPersonalState() {
      const previousView = view;
      started.resolve();
      await pending.promise;
      view = previousView;
      events.push("personal");
    },
    async openEntityPath(path) {
      opened.push(path);
      view = path.at(-1);
      events.push(`open:${view}`);
      return true;
    }
  };
  const repository = {
    async flush() {},
    async refreshCourses() { return { courses: [] }; },
    loadProject() { return { courses: [] }; }
  };
  const editorRoot = { hidden: authoring, querySelectorAll: () => [] };
  const build = new Function("globalThis", "console", "repository", "editorApp", "authoringSurface",
    "editorRoot", "parseCourseStudyRoute", "isCourseAuthoringRouteCandidate", "publicErrorMessage", `
      const synchronizationPreference = { get: () => "automatic" };
      const authoringRoot = { hidden: !authoringSurface.opened };
      let authoringReturnFocus = null;
      let authoringHistoryReturn = false;
      const studyAuthoringReturn = null;
      const lifecycleAbortController = { signal: {} };
      const openAuthoring = () => { authoringSurface.opened = true; };
      ${mainDeclaration("studyRefresh")}
      ${mainDeclaration("refreshStudy")}
      ${mainDeclaration("restoreStudyAfterAuthoring")}
      ${mainNode((node) => node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" && node.callee.object.name === "globalThis" &&
        node.callee.property.name === "addEventListener" && node.arguments[0]?.value === "hashchange")};
      return { currentRefresh: () => studyRefresh, detach: () => { editorApp = null; } };
    `);
  // Callbacks reais do shell; somente DOM, repositório e aplicação são fronteiras em memória.
  const shell = build(globals, { warn: (...args) => warnings.push(args) }, repository, editorApp,
    authoringSurface, editorRoot, parseCourseStudyRoute, isCourseAuthoringRouteCandidate, publicErrorMessage);
  return {
    events, warnings, opened, synchronization, authoringSurface, started: started.promise,
    get view() { return view; },
    navigate(hash) {
      const oldURL = `https://app.example/${globals.location.hash}`;
      globals.location.hash = hash;
      return hashchange({ oldURL });
    },
    async finish(error) {
      const refresh = shell.currentRefresh();
      if (error) pending.reject(error);
      else pending.resolve();
      await Promise.allSettled([refresh]);
      await new Promise((resolve) => setImmediate(resolve));
    },
    detach: shell.detach
  };
}

test("deep link de Estudo aguarda a atualização ao sair da Autoria", async () => {
  const app = navigationHarness();
  const navigation = app.navigate(studyRoute("unit-a"));
  await app.started;
  await app.finish();
  await navigation;
  assert.deepEqual(app.events, ["project", "personal", "open:unit-a"]);
  assert.equal(app.view, "unit-a");
});

test("nova rota de Estudo aguarda a mesma atualização e substitui a rota pendente", async () => {
  const app = navigationHarness();
  const first = app.navigate(studyRoute("unit-a"));
  await app.started;
  const latest = app.navigate(studyRoute("unit-b"));
  await app.finish();
  await Promise.all([first, latest]);
  assert.deepEqual(app.opened.map((path) => path.at(-1)), ["unit-b"]);
  assert.equal(app.view, "unit-b");
});

test("retorno à Autoria durante a atualização descarta o deep link de Estudo pendente", async () => {
  const app = navigationHarness();
  const navigation = app.navigate(studyRoute("unit-a"));
  await app.started;
  await app.navigate(authoringRoute);
  await app.finish();
  await navigation;
  assert.equal(app.authoringSurface.opened, true);
  assert.deepEqual(app.opened, []);
});

test("erro da atualização permanece visível e não impede a abertura explícita do Estudo", async () => {
  const app = navigationHarness();
  const navigation = app.navigate(studyRoute("unit-a"));
  await app.started;
  const error = new TypeError("Failed to fetch");
  await app.finish(error);
  await navigation;
  assert.equal(app.view, "unit-a");
  assert.equal(app.synchronization.synchronizing, false);
  assert.ok(app.synchronization.syncError);
  assert.equal(app.warnings.length, 1);
  assert.equal(app.warnings[0][1], error);
});

test("sessão encerrada durante a atualização não reabre o Estudo", async () => {
  const app = navigationHarness();
  const navigation = app.navigate(studyRoute("unit-a"));
  await app.started;
  app.detach();
  await app.finish();
  await navigation;
  assert.deepEqual(app.opened, []);
});

test("deep link sem atualização pendente abre diretamente o Estudo", async () => {
  const app = navigationHarness({ authoring: false });
  await app.navigate(studyRoute("unit-a"));
  assert.deepEqual(app.events, ["open:unit-a"]);
  assert.equal(app.view, "unit-a");
});
