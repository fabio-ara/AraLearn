import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sessions = new Map();
const hash = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
function identity(value) {
  if (!UUID.test(value || "")) throw new Error("A fixture precisa de uma identidade UUID registrada.");
  return value;
}
function directory(config) {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(config.projectUrl)) {
    throw new Error("O ledger aceita somente o ambiente Supabase local.");
  }
  const root = config.fixtureLedgerDirectory || process.env.ARALEARN_LOCAL_FIXTURE_LEDGER_DIR ||
    path.resolve(".validation/private/local-fixtures");
  const dir = path.join(root, hash(config.projectUrl).slice(0, 16));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
function records(config) {
  const dir = directory(config);
  return fs.readdirSync(dir).filter(name => name.endsWith(".json")).map(name => {
    const row = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    if (row.contract !== "aralearn.local-fixture.v1" || row.environment !== config.projectUrl) {
      throw new Error("O inventário privado não corresponde ao ambiente local.");
    }
    return row;
  });
}
function save(config, row) {
  const target = path.join(directory(config), `${identity(row.attemptId)}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ ...row, updatedAt: now() }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return row;
}
function begin(config, fields) {
  return save(config, { contract: "aralearn.local-fixture.v1", attemptId: randomUUID(),
    environment: config.projectUrl, origin: config.fixtureOrigin || "local-validation", createdAt: now(),
    state: "creating", files: [], ...fields });
}
function owner(config, ownerId) {
  identity(ownerId);
  const user = records(config).find(row => row.kind === "user" && row.id === ownerId && row.state === "present");
  if (!user) throw new Error("A conta proprietária não é uma fixture sintética registrada e ativa.");
  return user;
}
function sessionKey(config, ownerId) { return `${directory(config)}:${ownerId}`; }
function session(config, ownerId) {
  owner(config, ownerId);
  const value = sessions.get(sessionKey(config, ownerId));
  if (!value) throw new Error("Autentique o proprietário antes de preparar suas fixtures.");
  return value;
}
function pendingCreation(config, ownerId, except) {
  return records(config).some(row => row.ownerId === ownerId && row.attemptId !== except &&
    ["creating", "uncertain"].includes(row.state));
}
function recordRecovery(row, error) {
  const value = error?.recovery || error?.details || {};
  if (/^[A-Za-z0-9:._-]{8,128}$/u.test(value.requestId || "")) row.recoveryRequestId = value.requestId;
  if (/^[A-Za-z0-9_.:-]{1,96}$/u.test(value.operation || "")) row.recoveryOperation = value.operation;
  if (UUID.test(value.courseId || "")) row.recoveryCourseId = value.courseId;
  // Never persist raw exception bodies, URLs, bearer or opaque channel payloads.
}
function courseRecord(config, ownerId, courseId) {
  identity(courseId);
  const row = records(config).find(item => item.ownerId === ownerId && item.id === courseId &&
    ["course", "copy", "cleanup_probe"].includes(item.kind));
  if (!row) throw new Error("Exclusão recusada: o ID não é uma fixture registrada deste proprietário.");
  return row;
}
async function absent(client, courseId) {
  try { await client.getCourse(courseId, { ownerOnly: true }); return false; }
  catch (error) { if (error.status === 404) return true; throw error; }
}

// Auth setup is privileged only for the disposable account. Course lifecycle
// always uses that account's authenticated CourseApiClient below.
export async function trackLocalFixtureUserCreation(config, { marker, email, create, reconcile }) {
  if (!/^[^@\s]+@[^@\s]+\.(?:test|invalid)$/u.test(email || "") || typeof marker !== "string" || !marker.trim()) {
    throw new Error("A conta de fixture exige endereço sintético e marcador explícito.");
  }
  const emailHash = hash(email.toLowerCase());
  if (records(config).some(row => row.kind === "user" && row.emailHash === emailHash && row.state !== "absent")) {
    throw new Error("Reconcilie a tentativa registrada desta conta antes de criar outra.");
  }
  const row = begin(config, { kind: "user", emailHash, markerHash: hash(marker),
    authReference: "local-auth-admin-synthetic-account", requestId: randomUUID(), dependencies: [] });
  try {
    let result;
    try { result = await create(); }
    catch (error) {
      row.state = "uncertain"; recordRecovery(row, error); save(config, row);
      result = await reconcile?.();
      if (!result) throw error;
      row.reconciledAt = now();
    }
    if (result.response.ok && UUID.test(result.payload?.id || "")) {
      row.id = result.payload.id; row.ownerId = row.id; row.state = "present";
    } else row.state = result.response.status >= 500 ? "uncertain" : "rejected";
    save(config, row); return result;
  } catch (error) { row.state = "uncertain"; recordRecovery(row, error); save(config, row); throw error; }
}

export async function trackLocalFixtureUserRemoval(config, userId, { remove, read }) {
  const row = records(config).find(item => item.kind === "user" && item.id === identity(userId));
  if (!row) throw new Error("Exclusão de conta não registrada recusada.");
  const owned = records(config).filter(item => item.ownerId === userId && item.kind !== "user");
  if (owned.some(item => !["absent", "rejected"].includes(item.state) || item.files.some(file => file.state !== "absent"))) {
    throw new Error("A conta conserva fixtures ou arquivos pendentes; reconcilie e limpe seus IDs primeiro.");
  }
  row.cleanupRequestId ||= randomUUID(); row.state = "deleting"; save(config, row);
  let result;
  try { result = await remove(); }
  catch (error) { row.state = "uncertain"; save(config, row); if (!(await read()).absent) throw error; }
  const verification = await read();
  if (!verification.absent) throw new Error("A releitura de Auth não confirmou a ausência da conta sintética.");
  row.state = "absent"; row.verifiedAt = now(); row.verification = "auth-admin-get-404"; save(config, row);
  sessions.delete(sessionKey(config, userId));
  return result || { response: { status: 404, ok: false }, payload: null };
}

export async function trackLocalFixtureCreation(config, { ownerId, requestId = randomUUID(), kind = "course",
  dependencies = [], create, courseIdFromResult = value => value?.courseId || value?.targetCourseId,
  reconcile, probe = false }) {
  const active = session(config, ownerId);
  if (!probe) await ensureProbe(config, ownerId, active);
  if (!["course", "copy", "cleanup_probe"].includes(kind) || !/^[A-Za-z0-9:._-]{8,128}$/u.test(requestId)) {
    throw new Error("Tipo ou referência da tentativa de fixture inválida.");
  }
  dependencies.forEach(identity);
  let row = records(config).find(item => item.ownerId === ownerId && item.requestId === requestId && item.kind === kind);
  if (pendingCreation(config, ownerId, row?.attemptId)) throw new Error("Uma criação incerta deste proprietário precisa ser reconciliada antes do lote.");
  row ||= begin(config, { kind, ownerId, requestId, dependencies, authReference: `owner-session:${ownerId}` });
  try {
    let result;
    try { result = await create(); }
    catch (error) {
      row.state = "uncertain"; recordRecovery(row, error); save(config, row);
      // Only the typed client's idempotent operation may be replayed. A raw
      // browser/channel callback requires its own explicit reconciliation.
      if (!reconcile) throw error;
      result = await reconcile({ requestId }); row.reconciledAt = now();
    }
    const id = identity(courseIdFromResult(result));
    if (row.id && row.id !== id) throw new Error("A retomada alterou o ID da fixture.");
    row.id = id; row.state = "present"; save(config, row);
    return result;
  } catch (error) { row.state = "uncertain"; recordRecovery(row, error); save(config, row); throw error; }
}

async function removeCourse(config, ownerId, active, command) {
  const row = courseRecord(config, ownerId, command.courseId);
  if (command.confirmed !== true) throw new Error("Confirme a limpeza da fixture registrada.");
  row.cleanupRequestId ||= command.requestId || randomUUID();
  row.state = "deleting"; row.cleanupPath = "authenticated-owner:DELETE /v1/courses/:id"; save(config, row);
  const request = { ...command, requestId: row.cleanupRequestId };
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { result = await active.client.maintainCourse(request); break; }
    catch (error) {
      row.state = "uncertain"; row.cleanupAttempts = attempt + 1; save(config, row);
      if (attempt === 1 || error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) throw error;
      // A read establishes current state; even absence needs the same receipt
      // replay to establish file cleanup. It never authorizes a new request.
      row.lastReadAbsent = await absent(active.client, row.id); save(config, row);
    }
  }
  if (!result || result.courseId !== row.id || result.requestId !== row.cleanupRequestId ||
      !["completed", "already_absent"].includes(result.status) || result.fileCleanupPending !== false) {
    throw new Error("A limpeza autenticada não confirmou curso e arquivos; fixture permanece pendente.");
  }
  if (!await absent(active.client, row.id)) throw new Error("A fixture continua presente após a exclusão autenticada.");
  row.state = "absent"; row.verifiedAt = now(); row.verification = "owner-get-course-404";
  row.cleanupResult = { status: result.status, fileCleanupPending: false };
  row.files = row.files.map(file => ({ ...file, state: "absent", verification: "course-lifecycle-references-reconciled" }));
  save(config, row); return result;
}
async function ensureProbe(config, ownerId, active) {
  if (records(config).some(row => row.ownerId === ownerId && row.kind === "cleanup_probe" && row.state === "absent" &&
      row.verification === "owner-get-course-404" && row.cleanupResult?.fileCleanupPending === false)) return;
  if (active.probe) return active.probe;
  active.probe = (async () => {
    const existing = records(config).find(row => row.ownerId === ownerId && row.kind === "cleanup_probe");
    if (existing?.id) {
      await absent(active.client, existing.id);
      await removeCourse(config, ownerId, active, { courseId: existing.id, operation: "delete_owned_course", confirmed: true });
      return;
    }
    const request = { requestId: existing?.requestId || randomUUID(), title: "Fixture mínima de limpeza", objective: "Validar exclusão autenticada e releitura ausente antes do lote sintético." };
    if (existing) await active.client.listCourses();
    const created = await trackLocalFixtureCreation(config, { ownerId, requestId: request.requestId, kind: "cleanup_probe", probe: true,
      create: () => active.client.createCourse(request), reconcile: async () => {
        await active.client.listCourses(); return active.client.createCourse(request);
      } });
    await removeCourse(config, ownerId, active, { courseId: created.courseId, operation: "delete_owned_course", confirmed: true });
  })();
  try { await active.probe; } finally { active.probe = null; }
}

export async function createLocalFixtureClient(config, { ownerId, accessToken, origin = "http://127.0.0.1:4182", client }) {
  owner(config, ownerId);
  if (!accessToken || accessToken === config.adminKey || accessToken === config.publishableKey) {
    throw new Error("O lifecycle da fixture exige sessão do proprietário, nunca bearer administrativo.");
  }
  if (accessToken.split(".").length === 3) {
    let claims;
    try { claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")); } catch { /* rejected below */ }
    if (claims?.sub !== ownerId || claims.role !== "authenticated") throw new Error("A sessão não identifica este proprietário autenticado.");
  } else if (!client) throw new Error("A fixture precisa de uma sessão JWT do proprietário.");
  if (!client) client = new CourseApiClient({ projectUrl: config.projectUrl, publishableKey: config.publishableKey,
    authClient: { getAccessToken: async () => accessToken }, fetchImpl: (url, options) => {
      if (new URL(url).origin !== config.projectUrl) throw new Error("Destino de fixture fora da stack local.");
      const headers = new Headers(options.headers); headers.set("Origin", origin);
      return fetch(url, { ...options, headers, redirect: "manual" });
    } });
  const active = { client, probe: null }; sessions.set(sessionKey(config, ownerId), active);
  return new Proxy(client, { get(target, property) {
    if (property === "createCourse" || property === "copyCourse") return async input => {
      const request = { ...input, requestId: input?.requestId || randomUUID() };
      return trackLocalFixtureCreation(config, { ownerId, requestId: request.requestId,
        kind: property === "copyCourse" ? "copy" : "course", dependencies: property === "copyCourse" ? [request.sourceCourseId] : [],
        create: () => target[property](request), reconcile: async () => {
          await target.listCourses(); return target[property](request);
        } });
    };
    if (property === "maintainCourse") return command => command.operation === "delete_owned_course"
      ? removeCourse(config, ownerId, active, command) : target.maintainCourse(command);
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

export function recordLocalFixtureFiles(config, { ownerId, courseId = null, files }) {
  owner(config, ownerId);
  let row = courseId ? courseRecord(config, ownerId, courseId) : records(config).find(item => item.kind === "owner_files" && item.ownerId === ownerId);
  row ||= begin(config, { kind: "owner_files", ownerId, dependencies: [], state: "present", authReference: `owner-session:${ownerId}` });
  for (const file of files) {
    const { kind, contentHash, storagePath } = file;
    if (!/^[a-z][a-z0-9_-]{0,40}$/u.test(kind || "") ||
        contentHash != null && !/^[a-f0-9]{64}$/u.test(contentHash) ||
        storagePath != null && !/^[A-Za-z0-9/_.-]{1,1024}$/u.test(storagePath) || !contentHash && !storagePath) {
      throw new Error("Registre apenas tipo, hash ou caminho sintético do arquivo, sem URL ou credencial.");
    }
    if (!row.files.some(item => item.kind === kind && item.contentHash === contentHash && item.storagePath === storagePath)) {
      row.files.push({ kind, ...(contentHash ? { contentHash } : {}), ...(storagePath ? { storagePath } : {}), state: "present" });
    }
  }
  save(config, row);
}
export async function verifyLocalFixtureFilesAbsent(config, { ownerId, courseId = null, files, verifyAbsent }) {
  const row = courseId ? courseRecord(config, ownerId, courseId) : records(config).find(item => item.kind === "owner_files" && item.ownerId === ownerId);
  if (!row) throw new Error("Arquivos não registrados não podem ser conciliados pelo ledger.");
  for (const requested of files) {
    const file = row.files.find(item => item.kind === requested.kind && item.contentHash === requested.contentHash && item.storagePath === requested.storagePath);
    if (!file || await verifyAbsent(file) !== true) throw new Error("A releitura não confirmou a ausência do arquivo registrado.");
    file.state = "absent"; file.verifiedAt = now(); save(config, row);
  }
  if (row.kind === "owner_files" && row.files.every(file => file.state === "absent")) row.state = "absent";
  save(config, row);
}
export function localFixtureLedgerSummary(config) {
  const rows = records(config);
  const pending = rows.filter(row => !["absent", "rejected"].includes(row.state) || row.files.some(file => file.state !== "absent"));
  const courseOwners = new Set(rows.filter(row => ["course", "copy"].includes(row.kind)).map(row => row.ownerId));
  const provenOwners = new Set(rows.filter(row => row.kind === "cleanup_probe" && row.state === "absent" &&
    row.verification === "owner-get-course-404" && row.cleanupResult?.fileCleanupPending === false).map(row => row.ownerId));
  return { contract: "aralearn.local-fixture-summary.v1", registered: rows.length,
    owners: rows.filter(row => row.kind === "user").length,
    courseOwners: courseOwners.size,
    courses: rows.filter(row => ["course", "copy"].includes(row.kind)).length,
    cleanupProbes: rows.filter(row => row.kind === "cleanup_probe" && row.state === "absent" && row.verification === "owner-get-course-404").length,
    pending: pending.length, completed: rows.length > 0 && pending.length === 0 && [...courseOwners].every(id => provenOwners.has(id)) };
}
