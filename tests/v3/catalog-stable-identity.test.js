import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { createIdentityAllocator, UUID_PATTERN } from "../../src/persistence/relationalSchema.js";
import { catalogIdentityUuidFactory } from "../../scripts/publishCatalogFixtures.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function readMinimalProject() {
  const filePath = path.resolve(testDirectory, "../fixtures/v3/project-minimal.json");
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function identitiesByCollection(rows) {
  return Object.fromEntries(Object.entries(rows).map(([collection, entries]) => [
    collection,
    (entries || []).map(({ identityKey, id }) => [identityKey, id])
  ]));
}

test("o alocador fornece a identityKey à fábrica de UUID", () => {
  const received = [];
  const factory = catalogIdentityUuidFactory();
  const allocator = createIdentityAllocator({
    uuidFactory(identityKey) {
      received.push(identityKey);
      return factory(identityKey);
    }
  });

  const first = allocator.row("course:curso-a", { title: "Antes" });
  const second = allocator.row("course:curso-a", { title: "Depois" });

  assert.deepEqual(received, ["course:curso-a"]);
  assert.equal(first.id, second.id);
  assert.match(first.id, UUID_PATTERN);
});

test("a identidade oficial depende da identityKey, não da ordem de geração", () => {
  const firstFactory = catalogIdentityUuidFactory();
  const secondFactory = catalogIdentityUuidFactory();

  const courseId = firstFactory("course:curso-a");
  const cardId = firstFactory("course:curso-a/module:modulo-a/card:card-a");

  assert.equal(secondFactory("course:curso-a/module:modulo-a/card:card-a"), cardId);
  assert.equal(secondFactory("course:curso-a"), courseId);
  assert.notEqual(courseId, cardId);
});

test("alterar conteúdo oficial preserva todos os UUIDs das mesmas identityKeys", async () => {
  const beforeDocument = await readMinimalProject();
  const afterDocument = structuredClone(beforeDocument);
  afterDocument.courses[0].title += " — edição editorial";
  afterDocument.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text += " Texto revisto.";

  const before = contractToRelationalRows(beforeDocument, {
    uuidFactory: catalogIdentityUuidFactory()
  });
  const after = contractToRelationalRows(afterDocument, {
    uuidFactory: catalogIdentityUuidFactory()
  });

  assert.deepEqual(identitiesByCollection(after), identitiesByCollection(before));
  assert.notEqual(after.courses[0].title, before.courses[0].title);
  assert.notEqual(after.blocks[0].value, before.blocks[0].value);
});
