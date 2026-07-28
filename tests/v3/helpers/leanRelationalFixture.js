import fs from "node:fs";

import { contractToRelationalRows } from "../../../src/persistence/contractToRelationalRows.js";
import { IndexedDbRelationalStore } from "../../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../../src/persistence/RelationalProjectRepository.js";

export const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const minimalProjectFixture = JSON.parse(fs.readFileSync(
  new URL("../../fixtures/v3/project-minimal.json", import.meta.url),
  "utf8"
));

export function officialGraphFromDocument(document = minimalProjectFixture, options = {}) {
  const rows = contractToRelationalRows(document, options);
  delete rows.projectMeta;
  return rows;
}

export async function seedSelectedOfficialCourse(store, {
  document = minimalProjectFixture,
  userId = TEST_USER_ID,
  publicationSeq = 1,
  contentHash = "a".repeat(64),
  uuidFactory
} = {}) {
  const graph = officialGraphFromDocument(document, uuidFactory ? { uuidFactory } : {});
  const course = graph.courses[0];
  await store.replaceOfficialCourseReplica(course.id, graph, { publicationSeq, contentHash });
  const selection = {
    id: globalThis.crypto.randomUUID(),
    userId,
    courseId: course.id,
    position: 0,
    publicationSeq,
    contentHash,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    deletedAt: null
  };
  await store.put("courseSelections", selection);
  return { graph, course, selection };
}

export async function openSelectedCourseRepository(indexedDb, {
  userId = TEST_USER_ID,
  document = minimalProjectFixture,
  mutationService,
  clock,
  onLocalCommit
} = {}) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId });
  const seeded = await seedSelectedOfficialCourse(store, { document, userId });
  const repository = new RelationalProjectRepository({
    store,
    userId,
    ...(mutationService ? { mutationService } : {}),
    ...(clock ? { clock } : {}),
    ...(onLocalCommit ? { onLocalCommit } : {})
  });
  await repository.initialize();
  return { store, repository, ...seeded };
}
