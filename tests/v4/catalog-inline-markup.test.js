import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureRoot = new URL("../../supabase/fixtures/catalog/", import.meta.url);
const tick = "`";

function inspectInlineMarkup(value, pointer, issues) {
  if (typeof value === "string") {
    const segments = value.split(tick);
    if ((segments.length - 1) % 2 !== 0) {
      issues.push(`${pointer}: crase sem par`);
      return;
    }
    for (let index = 1; index < segments.length; index += 2) {
      const before = segments[index - 1];
      const literal = segments[index];
      if (/^\s|\s$/u.test(literal)) {
        issues.push(`${pointer}: espaço na borda do literal`);
      }
      if (
        /(?:[A-ZÀ-Ý][\p{L}-]+\s+){1,8}$/u.test(before) &&
        /\([A-Z][A-Z0-9+./-]{1,15}\)/u.test(literal)
      ) {
        issues.push(`${pointer}: nome expandido e sigla fragmentados`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectInlineMarkup(item, `${pointer}/${index}`, issues));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      inspectInlineMarkup(item, `${pointer}/${key}`, issues)
    );
  }
}

test("fixtures publicáveis mantêm crases completas e nomes com sigla indivisíveis", async () => {
  const manifest = JSON.parse(await readFile(new URL("catalog-fixtures.json", fixtureRoot), "utf8"));
  const issues = [];

  for (const fileName of manifest.courseFiles) {
    const course = JSON.parse(await readFile(new URL(fileName, fixtureRoot), "utf8"));
    inspectInlineMarkup(course, fileName, issues);
  }

  assert.deepEqual(issues, []);
});
