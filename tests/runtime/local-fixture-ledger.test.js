import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLocalFixtureClient, trackLocalFixtureCreation, trackLocalFixtureUserCreation,
  trackLocalFixtureUserRemoval, localFixtureLedgerSummary, recordLocalFixtureFiles,
  verifyLocalFixtureFilesAbsent } from "../support/localFixtureLedger.js";

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-fixture-ledger-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const config = { projectUrl: "http://127.0.0.1:54321", publishableKey: "public-fixture", adminKey: "admin-never-persist",
    fixtureLedgerDirectory: directory };
  const rows = () => fs.readdirSync(directory).flatMap(subdirectory => fs.readdirSync(path.join(directory, subdirectory))
    .filter(file => file.endsWith(".json")).map(file => JSON.parse(fs.readFileSync(path.join(directory, subdirectory, file), "utf8"))));
  const ownerId = randomUUID();
  await trackLocalFixtureUserCreation(config, { marker: "synthetic", email: "synthetic@example.test", create: async () => {
    assert.equal(rows()[0].state, "creating", "a tentativa precede a escrita de Auth");
    return { response: { ok: true, status: 200 }, payload: { id: ownerId } };
  } });
  const calls = [], courses = new Map(), receipts = new Map();
  const client = {
    async createCourse(request) {
      calls.push({ method: "create", ...request });
      assert.ok(rows().some(row => row.requestId === request.requestId), "a tentativa precede a criação");
      if (receipts.has(request.requestId)) return receipts.get(request.requestId);
      const receipt = { courseId: randomUUID(), revision: 1 }; courses.set(receipt.courseId, receipt); receipts.set(request.requestId, receipt);
      return receipt;
    },
    async copyCourse(request) { return this.createCourse(request).then(result => ({ targetCourseId: result.courseId })); },
    async listCourses() { calls.push({ method: "list" }); return [...courses.values()]; },
    async getCourse(courseId) {
      calls.push({ method: "read", courseId });
      if (!courses.has(courseId)) throw Object.assign(new Error("ausente"), { status: 404 });
      return courses.get(courseId);
    },
    async maintainCourse(request) {
      calls.push({ method: "delete", ...request }); courses.delete(request.courseId);
      return { courseId: request.courseId, requestId: request.requestId, status: "completed", fileCleanupPending: false };
    }
  };
  const api = await createLocalFixtureClient(config, { ownerId, accessToken: "owner-secret-never-persist", client });
  const remove = courseId => api.maintainCourse({ courseId, operation: "delete_owned_course", confirmed: true });
  const removeUser = () => trackLocalFixtureUserRemoval(config, ownerId, {
    remove: async () => ({ response: { status: 200, ok: true }, payload: {} }), read: async () => ({ absent: true }) });
  return { config, rows, ownerId, client, api, calls, courses, remove, removeUser };
}

test("uma prova mínima autenticada precede o lote e contas/IDs alheios nunca são limpos", async t => {
  const f = await fixture(t);
  const a = await f.api.createCourse({ title: "primeira" });
  const b = await f.api.createCourse({ title: "segunda" });
  assert.deepEqual(f.calls.map(call => call.method), ["create", "delete", "read", "create", "create"]);
  assert.equal(f.rows().filter(row => row.kind === "cleanup_probe").length, 1);
  await assert.rejects(() => f.remove(randomUUID()), /não é uma fixture/u);
  await assert.rejects(f.removeUser, /pendentes/u);
  await f.remove(a.courseId); await f.remove(b.courseId); await f.removeUser();
  assert.equal(localFixtureLedgerSummary(f.config).completed, true);
  const serialized = JSON.stringify(f.rows());
  assert.ok(!serialized.includes("secret") && !serialized.includes("admin-never") && !serialized.includes("@example"));
});

test("resposta perdida de criação relê e recupera somente o mesmo requestId", async t => {
  const f = await fixture(t);
  await f.api.createCourse({ title: "prepara" });
  const original = f.client.createCourse; let lost = false;
  f.client.createCourse = async request => {
    const result = await original.call(f.client, request);
    if (!lost) { lost = true; throw new Error("resposta perdida"); }
    return result;
  };
  const created = await f.api.createCourse({ title: "incerta", requestId: randomUUID() });
  const tail = f.calls.slice(-3);
  assert.deepEqual(tail.map(call => call.method), ["create", "list", "create"]);
  assert.equal(tail[0].requestId, tail[2].requestId);
  assert.ok(f.rows().some(row => row.id === created.courseId && row.reconciledAt));
});

test("criação por canal sem recibo conserva incerteza e impede o próximo lote", async t => {
  const f = await fixture(t); const requestId = randomUUID(); let attempted = 0;
  await assert.rejects(() => trackLocalFixtureCreation(f.config, { ownerId: f.ownerId, requestId,
    create: async () => { attempted++; throw new Error("canal perdeu resposta"); } }), /perdeu/u);
  await assert.rejects(() => f.api.createCourse({ title: "outro" }), /incerta/u);
  assert.equal(attempted, 1);
  assert.equal(f.rows().find(row => row.requestId === requestId).state, "uncertain");
  await assert.rejects(f.removeUser, /pendentes/u);
  const receipt = { courseId: randomUUID() };
  f.courses.set(receipt.courseId, receipt);
  await trackLocalFixtureCreation(f.config, { ownerId: f.ownerId, requestId,
    create: async () => receipt }); // explicit original-attempt reconciliation, no new identity
  await f.remove(receipt.courseId); await f.removeUser();
  assert.equal(localFixtureLedgerSummary(f.config).completed, true);
});

test("exclusão perdida exige releitura e replay do mesmo recibo, inclusive arquivos", async t => {
  const f = await fixture(t); const created = await f.api.createCourse({ title: "arquivos" });
  recordLocalFixtureFiles(f.config, { ownerId: f.ownerId, courseId: created.courseId,
    files: [{ kind: "pdf", contentHash: "a".repeat(64) }] });
  const original = f.client.maintainCourse; let lost = false;
  f.client.maintainCourse = async request => {
    const result = await original.call(f.client, request);
    if (!lost) { lost = true; throw new Error("perdeu confirmação"); }
    return result;
  };
  await f.remove(created.courseId);
  const calls = f.calls.slice(-4);
  assert.deepEqual(calls.map(call => call.method), ["delete", "read", "delete", "read"]);
  assert.equal(calls[0].requestId, calls[2].requestId);
  assert.equal(f.rows().find(row => row.id === created.courseId).files[0].state, "absent");
  await f.removeUser();
});

test("403 não comprova ausência e cleanup de arquivo pendente não vira PASS", async t => {
  for (const failure of ["read", "files"]) {
    const f = await fixture(t); const created = await f.api.createCourse({ title: "pendente" });
    if (failure === "read") f.client.getCourse = async () => { throw Object.assign(new Error("negado"), { status: 403 }); };
    else f.client.maintainCourse = async request => ({ ...request, status: "completed", fileCleanupPending: true });
    await assert.rejects(() => f.remove(created.courseId));
    assert.equal(localFixtureLedgerSummary(f.config).completed, false);
    await assert.rejects(f.removeUser, /pendentes/u);
  }
});

test("avatar avulso exige ID registrado e releitura antes de apagar a conta", async t => {
  const f = await fixture(t); const file = { kind: "avatar", storagePath: `${f.ownerId}/synthetic.png` };
  recordLocalFixtureFiles(f.config, { ownerId: f.ownerId, files: [file] });
  await assert.rejects(f.removeUser, /pendentes/u);
  await assert.rejects(() => verifyLocalFixtureFilesAbsent(f.config, { ownerId: f.ownerId, files: [file], verifyAbsent: async () => false }));
  await verifyLocalFixtureFilesAbsent(f.config, { ownerId: f.ownerId, files: [file], verifyAbsent: async () => true });
  await f.removeUser(); assert.equal(localFixtureLedgerSummary(f.config).completed, true);
});

test("falha na prova mínima impede o lote e conserva seu ID para retomada", async t => {
  const f = await fixture(t);
  const original = f.client.maintainCourse;
  f.client.maintainCourse = async () => { throw Object.assign(new Error("sem permissão"), { status: 403 }); };
  await assert.rejects(() => f.api.createCourse({ title: "lote" }), /permissão/u);
  assert.equal(f.calls.filter(call => call.method === "create").length, 1);
  await assert.rejects(() => f.api.createCourse({ title: "lote" }), /permissão/u);
  assert.equal(f.calls.filter(call => call.method === "create").length, 1);
  assert.ok(f.rows().find(row => row.kind === "cleanup_probe").id);
  f.client.maintainCourse = original;
  await f.api.createCourse({ title: "lote" });
  assert.equal(f.calls.filter(call => call.method === "create").length, 2, "a retomada reaproveitou a prova mínima existente");
  assert.equal(f.rows().filter(row => row.kind === "cleanup_probe").length, 1);
});

test("rename transitório do ledger repete os mesmos bytes sem repetir DELETE ou releitura remota", async t => {
  const f = await fixture(t); const created = await f.api.createCourse({ title: "rename transitório" });
  recordLocalFixtureFiles(f.config, { ownerId: f.ownerId, courseId: created.courseId,
    files: [{ kind: "pdf", contentHash: "b".repeat(64) }] });
  const rename = fs.renameSync, attempts = [], offset = f.calls.length;
  t.mock.method(fs, "renameSync", (source, target) => {
    const bytes = fs.readFileSync(source), row = JSON.parse(bytes);
    if (row.id === created.courseId && row.state === "absent") {
      attempts.push({ source, target, bytes });
      if (attempts.length <= 2) throw Object.assign(new Error("bloqueio transitório"), { code: attempts.length === 1 ? "EPERM" : "EBUSY" });
    }
    return rename(source, target);
  });
  await f.remove(created.courseId);
  assert.equal(attempts.length, 3);
  for (const attempt of attempts) {
    assert.equal(attempt.source, attempts[0].source);
    assert.equal(attempt.target, attempts[0].target);
    assert.deepEqual(attempt.bytes, attempts[0].bytes);
  }
  assert.deepEqual(f.calls.slice(offset).map(call => call.method), ["delete", "read"]);
  const saved = f.rows().find(row => row.id === created.courseId);
  assert.equal(saved.state, "absent");
  assert.equal(saved.verification, "owner-get-course-404");
  assert.equal(saved.cleanupResult.fileCleanupPending, false);
  assert.equal(saved.files[0].state, "absent");
  assert.equal(fs.existsSync(attempts[0].source), false);
  await f.removeUser();
  assert.equal(localFixtureLedgerSummary(f.config).completed, true);
});

test("rename confirmado pelos bytes do destino reconcilia a exceção sem repetir a operação", async t => {
  const f = await fixture(t); const created = await f.api.createCourse({ title: "rename reconciliado" });
  const rename = fs.renameSync, offset = f.calls.length; let attempts = 0;
  t.mock.method(fs, "renameSync", (source, target) => {
    const row = JSON.parse(fs.readFileSync(source, "utf8"));
    const result = rename(source, target);
    if (row.id === created.courseId && row.state === "absent") {
      attempts++;
      throw Object.assign(new Error("confirmação local perdida"), { code: "EPERM" });
    }
    return result;
  });
  await f.remove(created.courseId);
  assert.equal(attempts, 1);
  assert.deepEqual(f.calls.slice(offset).map(call => call.method), ["delete", "read"]);
  assert.equal(f.rows().find(row => row.id === created.courseId).state, "absent");
  await f.removeUser();
  assert.equal(localFixtureLedgerSummary(f.config).completed, true);
});

test("rename persistente conserva destino anterior e temporário confirmado sem promover cleanup a PASS", async t => {
  for (const code of ["EPERM", "EBUSY", "EIO"]) await t.test(code, async child => {
    const f = await fixture(child); const created = await f.api.createCourse({ title: "rename bloqueado" });
    const rename = fs.renameSync, attempts = [], offset = f.calls.length;
    child.mock.method(fs, "renameSync", (source, target) => {
      const bytes = fs.readFileSync(source), row = JSON.parse(bytes);
      if (row.id === created.courseId && row.state === "absent") {
        attempts.push({ source, target, bytes });
        throw Object.assign(new Error("gravação local bloqueada"), { code });
      }
      return rename(source, target);
    });
    await assert.rejects(() => f.remove(created.courseId), error => error.code === code);
    assert.equal(attempts.length, code === "EIO" ? 1 : 5);
    for (const attempt of attempts) {
      assert.equal(attempt.source, attempts[0].source);
      assert.equal(attempt.target, attempts[0].target);
      assert.deepEqual(attempt.bytes, attempts[0].bytes);
    }
    assert.deepEqual(f.calls.slice(offset).map(call => call.method), ["delete", "read"]);
    assert.equal(f.courses.has(created.courseId), false);
    const previous = f.rows().find(row => row.id === created.courseId);
    assert.equal(previous.state, "deleting");
    const pendingBytes = fs.readFileSync(attempts[0].source);
    assert.deepEqual(pendingBytes, attempts[0].bytes);
    const pending = JSON.parse(pendingBytes);
    assert.equal(pending.attemptId, previous.attemptId);
    assert.equal(pending.cleanupRequestId, previous.cleanupRequestId);
    assert.equal(pending.state, "absent");
    assert.equal(pending.verification, "owner-get-course-404");
    assert.equal(pending.cleanupResult.fileCleanupPending, false);
    assert.equal(localFixtureLedgerSummary(f.config).completed, false);
    await assert.rejects(f.removeUser, /pendentes/u);
  });
});
