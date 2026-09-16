import test from 'node:test';
import assert from 'node:assert/strict';
import { CourseApiClient } from '../../src/supabase/CourseApiClient.js';
import { CourseSupabaseAdapter } from '../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js';
import { createCourseApiHandler } from '../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js';
import { validateCourseEntityContent } from '../../src/domain/aralearnProject.js';
import { largeObservationComparison } from '../helpers/largeObservationComparisonFixture.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const courseId = '20000000-0000-4000-8000-000000000001';
const annotationId = '30000000-0000-4000-8000-000000000001';
const origin = 'https://app.example';
const request = {annotationId, targetKind: 'study_unit', targetId: 'unit-a', expectedAnnotationVersion: 2, expectedTargetSetVersion: 1};
const response = () => ({contract: 'aralearn.course-observation-comparison.v1', courseId, courseRevision: 4, annotationId,
  annotationVersion: 2, targetSetVersion: 1, target: {kind: 'study_unit', id: 'unit-a'},
  basis: {hash: 'a'.repeat(64), content: {text: 'Antes'}, sourceLinks: [], sources: []},
  current: {hash: 'b'.repeat(64), content: {text: 'Vigente'}, sourceLinks: [], sources: []}});

function harness(respond = () => response()) {
  const calls = [];
  const adapter = new CourseSupabaseAdapter({supabaseUrl: 'https://database.example', publicAppUrl: origin,
    serverApiKey: 'synthetic-service', publishableKey: 'synthetic-public', fetchImpl: async (url, init) => {
      calls.push({rpc: new URL(url).pathname.split('/').at(-1), input: JSON.parse(init.body)});
      return new Response(JSON.stringify(respond()), {status: 200, headers: {'Content-Type': 'application/json'}});
    }});
  adapter.resolveApplicationPrincipal = async () => ({actorId, authenticationKind: 'application', scopes: ['authoring:read', 'authoring:write']});
  const handler = createCourseApiHandler({adapter, allowedOrigins: new Set([origin])});
  const client = new CourseApiClient({projectUrl: 'https://database.example', publishableKey: 'synthetic-public',
    authClient: {getAccessToken: async () => 'synthetic-owner'}, fetchImpl: (url, init) => {
      const headers = new Headers(init.headers); headers.set('Origin', origin);
      return handler(new Request(url, {...init, headers}));
    }});
  return {client, calls};
}

test('comparação passa cliente, rota e adapter com alvo/versões explícitos e ator do principal', async () => {
  const {client, calls} = harness();
  assert.deepEqual(await client.getCourseObservationComparison(courseId, request), response());
  assert.deepEqual(calls, [{rpc: 'get_course_observation_comparison_for_actor_v1', input: {p_actor_id: actorId, p_course_id: courseId,
    p_annotation_id: annotationId, p_target_kind: 'study_unit', p_target_id: 'unit-a', p_expected_annotation_version: 2, p_expected_target_set_version: 1}}]);
});

test('comparação rejeita resposta de outra incidência ou versão em vez de aprovar por coincidência de objeto', async () => {
  for (const delta of [{annotationVersion: 3}, {targetSetVersion: 2}, {target: {kind: 'study_unit', id: 'unit-b'}}, {courseId: actorId}]) {
    const {client} = harness(() => ({...response(), ...delta}));
    await assert.rejects(client.getCourseObservationComparison(courseId, request), error => error.status === 503);
  }
});

test('cliente do app e adapter transportam duas bases válidas próximas do limite individual sem truncar', async () => {
  const comparison = largeObservationComparison({ courseId, annotationId });
  for (const snapshot of [comparison.basis, comparison.current]) {
    assert.equal(validateCourseEntityContent('study_unit', { id: 'unit-a', position: 1, ...snapshot.content }).valid, true);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot.content)) < 1048576);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(comparison)) > 1048576);
  const { client } = harness(() => comparison);
  assert.deepEqual(await client.getCourseObservationComparison(courseId, request), comparison);
});
