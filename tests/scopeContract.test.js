import test from "node:test";
import assert from "node:assert/strict";

import { validateScopeContractDocument } from "../src/domain/scopeContract.js";

test("valida contrato de escopo mínimo", () => {
  const result = validateScopeContractDocument({
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Matemática para Informática",
      evidencePriority: ["exercise_list"]
    },
    modules: [
      {
        title: "Lógica",
        include: ["conectivos", "tabela-verdade"],
        exclude: ["lógica de predicados"],
        assessmentStyle: "mixed"
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.course.evidencePriority, ["exercise_list"]);
});

test("rejeita contrato sem módulo", () => {
  const result = validateScopeContractDocument({
    schemaVersion: "aralearn.scope.v1",
    course: { title: "Curso", evidencePriority: ["none"] },
    modules: []
  });

  assert.equal(result.ok, false);
});

test("rejeita módulo sem include e conflito entre include e exclude", () => {
  const result = validateScopeContractDocument({
    schemaVersion: "aralearn.scope.v1",
    course: { title: "Curso", evidencePriority: ["none"] },
    modules: [
      {
        title: "Módulo",
        include: [],
        exclude: ["vetores"],
        assessmentStyle: "mixed"
      },
      {
        title: "Outro",
        include: ["matriz inversa"],
        exclude: ["Matriz Inversa"],
        assessmentStyle: "mixed"
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.message.includes("O mesmo termo não pode entrar")));
});

