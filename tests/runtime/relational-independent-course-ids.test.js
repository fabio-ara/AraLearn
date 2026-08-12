import assert from "node:assert/strict";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  minimalProjectFixture,
  seedSelectedOfficialCourse,
  TEST_USER_ID
} from "./helpers/leanRelationalFixture.js";

test("repositório combina cursos independentes com ids internos iguais", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), {
    userId: TEST_USER_ID
  });
  context.after(() => store.close());
  const first = structuredClone(minimalProjectFixture);
  const second = structuredClone(minimalProjectFixture);
  second.courses[0].id = "course-independent-with-shared-internal-ids";
  second.courses[0].title = "Curso independente";

  await seedSelectedOfficialCourse(store, { document: first, userId: TEST_USER_ID });
  await seedSelectedOfficialCourse(store, { document: second, userId: TEST_USER_ID });
  const repository = new RelationalProjectRepository({ store, userId: TEST_USER_ID });
  await repository.initialize();

  const project = repository.loadProject();
  assert.deepEqual(
    project.courses.map((course) => course.id).sort(),
    [first.courses[0].id, second.courses[0].id].sort()
  );
  const firstCourse = project.courses.find((course) => course.id === first.courses[0].id);
  const secondCourse = project.courses.find((course) => course.id === second.courses[0].id);
  assert.equal(
    firstCourse.modules[0].id,
    secondCourse.modules[0].id
  );
  assert.equal(
    firstCourse.modules[0].lessons[0].microsequences[0].cards[0].id,
    secondCourse.modules[0].lessons[0].microsequences[0].cards[0].id
  );
});
