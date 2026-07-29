import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("smoke estruturado DeepSeek tem script e usa variável de ambiente", () => {
  const filePath = path.join(process.cwd(), "scripts", "runDeepSeekStructuredEngineSmoke.js");
  assert.equal(fs.existsSync(filePath), true);
  const source = fs.readFileSync(filePath, "utf8");
  assert.match(source, /DEEPSEEK_API_KEY/);
  assert.match(source, /deepseek-v4-flash/);
  assert.match(source, /structured-engine/);
  assert.match(source, /planCourseFromScope/);
  assert.match(source, /runStructuredBottomUp/);
  assert.match(source, /validateCard/);
  assert.match(source, /appliedTopDownPatches/);
  assert.doesNotMatch(source, /slotParser|templateCatalog|cardCompilers/);
  assert.match(source, /deepseek-v4-flash-structured-engine\.json/);
});
