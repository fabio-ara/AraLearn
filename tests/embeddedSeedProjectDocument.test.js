import test from "node:test";
import assert from "node:assert/strict";

import { validateContractDocument } from "../src/contract/validateContract.js";
import { buildLessonDomainCoverageReport } from "../src/generation/domain/lessonDomainModel.js";
import {
  createEmbeddedSeedProjectDocument,
  createOrganizacaoArquiteturaComputadoresCourse,
  createOrganizacaoArquiteturaComputadoresProjectDocument
} from "../src/ui/embeddedSeedProjectDocument.js";

test("o curso embarcado de organizacao e arquitetura valida no contrato atual", () => {
  const result = validateContractDocument(createOrganizacaoArquiteturaComputadoresProjectDocument());
  assert.equal(result.ok, true);

  const course = result.value.courses[0];
  assert.equal(course.key, "course-organizacao-arquitetura-computadores");
  assert.equal(course.title, "Organização e Arquitetura de Computadores");
  assert.equal(course.modules.length, 1);
  assert.deepEqual(
    course.modules[0].lessons.map((lesson) => lesson.title),
    [
      "Evolução dos computadores: do transistor ao SoC",
      "Lei de Moore",
      "Dispositivos de entrada, saída, armazenamento, processamento e alimentação",
      "Dispositivos de E/S, DMA e barramentos internos e externos",
      "Memórias: hierarquia, localidade, RAM, ROM, buffer e mídias",
      "Arquitetura de Von Neumann"
    ]
  );
});

test("o seed embarcado do bootstrap preserva multiplos cursos", () => {
  const result = validateContractDocument(createEmbeddedSeedProjectDocument());
  assert.equal(result.ok, true);

  const document = result.value;
  assert.equal(document.courses.length, 2);
  assert.deepEqual(document.courses.map((course) => course.title), [
    "Organização e Arquitetura de Computadores",
    "Matemática para Informática"
  ]);
});

test("a licao de lei de moore nasce sem lacunas declarativas no domainMap", () => {
  const course = createOrganizacaoArquiteturaComputadoresCourse();
  const lesson = course.modules[0].lessons.find((item) => item.key === "lesson-lei-de-moore");
  const coverage = buildLessonDomainCoverageReport(lesson);

  assert.equal(coverage.uncoveredItems.length, 0);
  assert.equal(coverage.explainedWithoutPractice.length, 0);
  assert.equal(coverage.examMissing.length, 0);
  assert.equal(coverage.domainMap.items.every((item) => item.status === "ready"), true);
});

test("todas as licoes do curso embarcado nascem com cobertura declarativa fechada", () => {
  const course = createOrganizacaoArquiteturaComputadoresCourse();
  const reports = course.modules[0].lessons.map((lesson) => ({
    key: lesson.key,
    coverage: buildLessonDomainCoverageReport(lesson)
  }));

  for (const report of reports) {
    assert.equal(report.coverage.uncoveredItems.length, 0, report.key);
    assert.equal(report.coverage.explainedWithoutPractice.length, 0, report.key);
    assert.equal(report.coverage.examMissing.length, 0, report.key);
  }
});

test("o curso embarcado reforca pontos de apoio das aulas e nao so o gabarito da prova", () => {
  const course = createOrganizacaoArquiteturaComputadoresCourse();
  const lessons = course.modules[0].lessons;
  const devicesLesson = lessons.find((lesson) => lesson.key === "lesson-dispositivos-basicos");
  const ioLesson = lessons.find((lesson) => lesson.key === "lesson-io-e-barramentos");
  const memoriesLesson = lessons.find((lesson) => lesson.key === "lesson-memorias");
  const architectureLesson = lessons.find((lesson) => lesson.key === "lesson-von-neumann");

  assert.ok(JSON.stringify(devicesLesson).includes("CPU e GPU"));
  assert.ok(JSON.stringify(ioLesson).includes("registros de controle, status e buffer de dados"));
  assert.ok(JSON.stringify(memoriesLesson).includes("`L1` tende a ser a mais rápida e menor"));
  assert.ok(JSON.stringify(architectureLesson).includes("`PC`"));
  assert.ok(JSON.stringify(architectureLesson).includes("reconfiguração física"));
});

test("o texto publico do curso embarcado evita referencias de bastidor", () => {
  const course = createOrganizacaoArquiteturaComputadoresCourse();
  const learnerFacingText = JSON.stringify(
    course.modules.flatMap((module) =>
      module.lessons.flatMap((lesson) =>
        lesson.microsequences.flatMap((microsequence) =>
          microsequence.cards.map((card) => ({
            title: card.title,
            say: card.say,
            ask: card.ask,
            after: card.after
          }))
        )
      )
    )
  );

  assert.doesNotMatch(learnerFacingText, /como no material|na aula acima|no slide|no texto acima|como vimos acima/);
});
