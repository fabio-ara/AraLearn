import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { publicErrorMessage } from "../../src/ui/publicErrorMessage.js";

const USER = "92000000-0000-4000-8000-000000000001";
const OTHER = "92000000-0000-4000-8000-000000000002";
const PROFILE = { contract: "aralearn.person-profile.v2", userId: USER,
  handle: "pessoa-escolheu", avatarObjectKey: null, updatedAt: "2026-09-05T12:00:00Z" };

test("perfil escolhido reabre offline só na própria conta e erro de acesso invalida a cópia local", async () => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER });
  let failure = null;
  const api = { listCourses() {}, getCourse() {},
    authClient: { getSession: () => ({ user: { id: USER } }) },
    async getPersonProfile() { if (failure) throw failure; return PROFILE; },
    async updatePersonProfile(patch) { return { ...PROFILE, ...patch, previousAvatarObjectKey: null }; }
  };
  const controller = new CourseController({ api, store });
  assert.equal((await controller.getPersonProfile()).handle, PROFILE.handle);
  const updated = await controller.updatePersonProfile({ handle: "outro-escolhido" });
  assert.equal(updated.previousAvatarObjectKey, null);
  failure = Object.assign(new TypeError("Failed to fetch"), { status: 0 });
  const offline = await controller.getPersonProfile();
  assert.equal(offline.offline, true);
  assert.equal(offline.handle, "outro-escolhido");
  await assert.rejects(() => controller.getPersonProfile({ allowOffline: false }), /Failed to fetch/u,
    "Confirmar vínculo de avatar exige leitura remota, sem usar perfil antigo como prova.");

  const otherStore = await CourseLocalStore.open(indexedDb, { userId: OTHER });
  const other = new CourseController({ api, store: otherStore });
  await assert.rejects(() => other.getPersonProfile(), /Failed to fetch/u);
  failure = Object.assign(new Error("Unauthorized"), { status: 401 });
  await assert.rejects(() => controller.getPersonProfile(), /Unauthorized/u);
  failure = Object.assign(new TypeError("Failed to fetch"), { status: 0 });
  await assert.rejects(() => controller.getPersonProfile(), /Failed to fetch/u);
  store.close(); otherStore.close();
});

test("perfil anterior, identificador inválido ou identidade divergente não substituem onboarding", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: USER });
  let value;
  const api = { listCourses() {}, getCourse() {},
    authClient: { getSession: () => ({ user: { id: USER } }) },
    async getPersonProfile() { return value; }
  };
  const controller = new CourseController({ api, store });
  for (value of [{ ...PROFILE, contract: "aralearn.person-profile.v1", displayName: "Nome antigo" },
    { ...PROFILE, handle: "Nome Público" }, { ...PROFILE, userId: OTHER }]) {
    await assert.rejects(() => controller.getPersonProfile(), /Perfil público inválido/u);
  }
  value = { ...PROFILE, handle: null };
  assert.equal((await controller.getPersonProfile()).handle, null);
  store.close();
});

test("colisão de identificador orienta nova escolha, sem confundir com revisão de conteúdo", () => {
  assert.equal(publicErrorMessage({ code: "person_handle_unavailable", status: 409 }, "Falha"),
    "Este identificador já está em uso. Escolha outro.");
});
