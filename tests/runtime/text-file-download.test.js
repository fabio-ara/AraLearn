import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadTextFile,
  normalizeTextFileDownload
} from "../../src/ui/downloadTextFile.js";

test("exportação textual restringe formato, nome e tamanho", () => {
  assert.deepEqual(normalizeTextFileDownload({
    name: "aralearn-analytics-curso-r7.csv",
    type: "text/csv;charset=utf-8",
    content: "rótulo\nAção\n"
  }), {
    name: "aralearn-analytics-curso-r7.csv",
    type: "text/csv",
    content: "rótulo\nAção\n",
    byteSize: 15
  });

  assert.throws(() => normalizeTextFileDownload({
    name: "dados.json",
    type: "text/csv",
    content: "a,b\n"
  }), /nome de arquivo válido/u);
  assert.throws(() => normalizeTextFileDownload({
    name: "../dados.json",
    type: "application/json",
    content: "{}\n"
  }), /nome de arquivo válido/u);
  assert.throws(() => normalizeTextFileDownload({
    name: `${"a".repeat(156)}.json`,
    type: "application/json",
    content: "{}\n"
  }), /nome de arquivo válido/u);
  assert.throws(() => normalizeTextFileDownload({
    name: "dados.txt",
    type: "text/plain",
    content: "texto"
  }), /CSV ou JSON/u);
  assert.throws(() => normalizeTextFileDownload({
    name: "dados.json",
    type: "application/json",
    content: "x".repeat(8 * 1024 * 1024 + 1)
  }), /excede 8 MiB.*Restrinja o período, o conjunto ou o canal/u);
});

test("exportação textual usa o seletor Android quando a ponte está disponível", () => {
  const calls = [];
  const result = downloadTextFile({
    name: "aralearn-proveniencia-curso-study_unit.json",
    type: "application/json;charset=utf-8",
    content: "{\"contract\":\"fixture\"}\n"
  }, {
    androidHost: {
      saveTextFile(...values) {
        calls.push(values);
        return true;
      }
    },
    documentValue: {
      createElement() {
        throw new Error("O caminho web não deveria ser usado.");
      }
    }
  });

  assert.deepEqual(calls, [[
    "{\"contract\":\"fixture\"}\n",
    "aralearn-proveniencia-curso-study_unit.json",
    "application/json"
  ]]);
  assert.equal(result.platform, "android");
});

test("exportação textual mantém o download web sem a ponte Android", async () => {
  const calls = [];
  const anchor = {
    click() { calls.push("click"); },
    remove() { calls.push("remove"); }
  };
  let blob;
  const result = downloadTextFile({
    name: "aralearn-analytics-curso-r7.csv",
    type: "text/csv",
    content: "coluna\nvalor\n"
  }, {
    androidHost: null,
    documentValue: {
      body: { append(value) { calls.push(["append", value]); } },
      createElement(tagName) {
        calls.push(["create", tagName]);
        return anchor;
      }
    },
    urlValue: {
      createObjectURL(value) {
        blob = value;
        calls.push("create-url");
        return "blob:fixture";
      },
      revokeObjectURL(value) { calls.push(["revoke", value]); }
    },
    schedule(callback, delay) {
      calls.push(["schedule", delay]);
      callback();
    }
  });

  assert.equal(anchor.download, "aralearn-analytics-curso-r7.csv");
  assert.equal(anchor.href, "blob:fixture");
  assert.equal(anchor.hidden, true);
  assert.equal(blob.type, "text/csv;charset=utf-8");
  assert.equal(await blob.text(), "coluna\nvalor\n");
  assert.deepEqual(calls, [
    ["create", "a"],
    "create-url",
    ["append", anchor],
    "click",
    "remove",
    ["schedule", 0],
    ["revoke", "blob:fixture"]
  ]);
  assert.equal(result.platform, "web");
});
