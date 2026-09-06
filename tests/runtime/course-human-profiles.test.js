import assert from "node:assert/strict";
import test from "node:test";
import { executeHumanCourseTask, COURSE_HUMAN_TASKS } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "20000000-0000-4000-8000-000000000001";
const principal = { actorId: "30000000-0000-4000-8000-000000000001", scopes: ["authoring:read", "authoring:write"] };
const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS[0];
function fixture() {
  const state = { revision: 3, calls: [], profile: { profileId: PROFILE, revision: 1, name: "Estudo focal",
    preferences: [{ parameterId: definition.id, mode: "fixed", value: 3 }] },
    exceptions: [{ parameterId: definition.id, scope: { kind: "lesson", ref: "lesson-a" }, scopeLabel: "Lição A",
      assignment: { mode: "fixed", value: 2, origin: "author", reason: "Exceção local deliberada." } }] };
  const adapter = {
    listCourses: async () => ({ items: [{ courseId: COURSE, title: "Curso sintético" }], hasMore: false, nextCursor: null }),
    getCourse: async () => ({ courseId: COURSE, title: "Curso sintético", revision: state.revision }),
    listAuthoringProfiles: async () => ({ profiles: state.profile ? [structuredClone(state.profile)] : [] }),
    saveAuthoringProfile: async (request) => {
      state.calls.push(structuredClone(request));
      state.profile = { profileId: request.profileId, revision: request.expectedRevision + 1,
        name: request.name, preferences: structuredClone(request.preferences) };
      return { profile: state.profile };
    },
    deleteAuthoringProfile: async (request) => { state.calls.push(request); state.profile = null; return { changed: true }; },
    previewCourseAuthoringProfile: async () => ({ contract: "aralearn.course-authoring-profile-preview.v1",
      courseId: COURSE, courseRevision: state.revision, profile: structuredClone(state.profile),
      assignments: state.profile.preferences.map((preference) => ({ ...preference, origin: "author", reason: "Preferências copiadas do perfil." })),
      exceptions: structuredClone(state.exceptions), conflicts: [] }),
    applyCourseAuthoringProfile: async (request) => {
      state.calls.push(structuredClone(request));
      if (state.loseResponse && state.calls.length === 1) throw Object.assign(new Error("Resposta perdida"), { code: "NETWORK_ERROR" });
      return { changed: true };
    }
  };
  const run = (name, args = {}, actor = principal) => executeHumanCourseTask({ adapter, principal: actor, name, rawArguments: args });
  return { state, run };
}

test("perfil humano usa campos do catálogo, copia preferências e não escreve no curso ao editar/excluir", async () => {
  const { state, run } = fixture();
  const initialCourseRevision = state.revision;
  await run("salvar_perfil", { perfil: "Estudo focal", nome: "Discussão", parametros: { [definition.humanField]: 4 } });
  assert.equal(state.profile.preferences[0].value, 4);
  assert.equal(state.revision, initialCourseRevision);
  const profiles = await run("consultar_perfis");
  assert.equal(profiles.context.perfis[0].preferencias[0].campo, definition.humanField);
  await run("excluir_perfil", { perfil: "Discussão" });
  assert.equal(state.profile, null);
  assert.equal(state.revision, initialCourseRevision);
  await assert.rejects(() => run("salvar_perfil", { nome: "Indevido", apiKey: "synthetic", parametros: { [definition.humanField]: 2 } }));
  await assert.rejects(() => run("salvar_perfil", { nome: "Indevido", parametros: { [definition.humanField]: 2 } },
    { ...principal, scopes: ["authoring:read"] }), (error) => error.status === 403);
});

test("aplicação exige mesma prévia, preserva exceções e repete intenção após resposta perdida", async () => {
  const { state, run } = fixture();
  const args = { curso: "Curso sintético", perfil: "Estudo focal" };
  const preview = await run("prever_aplicacao_perfil", args);
  state.revision += 1;
  await assert.rejects(() => run("aplicar_perfil", { ...args, previa: preview.context.previa }),
    (error) => error.code === "authoring_profile_preview_changed");
  assert.equal(state.calls.length, 0);
  const current = await run("prever_aplicacao_perfil", args);
  state.loseResponse = true;
  await run("aplicar_perfil", { ...args, previa: current.context.previa });
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.calls[0], state.calls[1]);
  assert.deepEqual(state.calls[0].exceptionPolicy, { mode: "preserve", exceptions: [] });
});

test("remoção selecionada vincula exceção da prévia e nunca remove condição de pesquisa", async () => {
  const { state, run } = fixture();
  const args = { curso: "Curso sintético", perfil: "Estudo focal" };
  const preview = await run("prever_aplicacao_perfil", args);
  await run("aplicar_perfil", { ...args, previa: preview.context.previa, excecoesRemover: [1] });
  assert.deepEqual(state.calls[0].exceptionPolicy, { mode: "remove_selected", exceptions: [{
    parameterId: definition.id, scope: { kind: "lesson", ref: "lesson-a" }
  }] });
  state.exceptions[0].assignment.origin = "research_condition";
  const fixed = await run("prever_aplicacao_perfil", args);
  await assert.rejects(() => run("aplicar_perfil", { ...args, previa: fixed.context.previa, excecoesRemover: [1] }),
    (error) => error.code === "course_design_research_condition_protected");
  assert.equal(state.calls.length, 1);
  assert.deepEqual(Object.keys(COURSE_HUMAN_TASKS.find(({ name }) => name === "salvar_perfil")
    .inputSchema.properties.parametros.properties), COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField }) => humanField));
});
