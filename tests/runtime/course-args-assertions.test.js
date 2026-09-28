import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { COURSE_HUMAN_TASKS } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";

const ajv = new Ajv2020({ strict: false });
const schemaOf = name => COURSE_HUMAN_TASKS.find(({ name: value }) => value === name).inputSchema;
const compile = schema => ajv.compile(structuredClone(schema));
const ORIGINAL = Object.freeze({
  ajustar_configuracao: { anyOf: [{ required: ["parametros"] }, { required: ["automaticos"] }, { required: ["direcaoEditorial"] }] },
  aplicar_correcoes: { anyOf: [{ required: ["correcoes"] }, { required: ["explicacoes"] }] },
  registrar_observacao: { anyOf: [{ required: ["unidades"] }, { required: ["microssequencia"] }] },
  incorporar_pdf_como_fonte: { oneOf: [{ required: ["fonte"] }, { required: ["titulo", "papeisSugeridos"] }] },
  retomar_correcao: { oneOf: [
    { required: ["curso", "tentativa"], not: { required: ["recuperacao"] } },
    { required: ["recuperacao"], not: { anyOf: [{ required: ["curso"] }, { required: ["tentativa"] }] } }] },
  manter_fonte: { anyOf: [{ required: ["metadados"] }, { required: ["ancoras"] }, { required: ["vinculos"] },
    { required: ["retirar"] }, { required: ["estilo"] }],
    allOf: [{ if: { required: ["retirar"] }, then: { required: ["fonte"],
      not: { anyOf: [{ required: ["metadados"] }, { required: ["ancoras"] }, { required: ["vinculos"] }, { required: ["estilo"] }] } } }] }
});
function referenceSchema(name) {
  const current = structuredClone(schemaOf(name));
  delete current.allOf;
  const original = ORIGINAL[name];
  if (original.anyOf) current.anyOf = structuredClone(original.anyOf);
  if (original.oneOf) current.oneOf = structuredClone(original.oneOf);
  if (original.allOf) current.allOf = structuredClone(original.allOf);
  return current;
}
const curso = "Curso";
const base = Object.freeze({
  ajustar_configuracao: { curso, condicao: "automatica" },
  aplicar_correcoes: { curso },
  registrar_observacao: { curso, texto: "Observação sintética." },
  incorporar_pdf_como_fonte: { curso, intencao: "Sustentar a explicação.",
    pdf: { download_url: "https://example.test/a.pdf", file_id: "file-1" } },
  retomar_correcao: {},
  manter_fonte: { curso }
});
const values = Object.freeze({
  ajustar_configuracao: { parametros: { maximo_ideias_novas_por_unidade: 2 }, automaticos: ["maximo_ideias_novas_por_unidade"],
    direcaoEditorial: "Relacione com o percurso." },
  aplicar_correcoes: { correcoes: [{ unidade: 1, conteudo: null }], explicacoes: [] },
  registrar_observacao: { unidades: [1], microssequencia: "Quadros" },
  incorporar_pdf_como_fonte: { fonte: "Fonte sintética", titulo: "Rede local", papeisSugeridos: ["recommended_reading"] },
  retomar_correcao: { curso, tentativa: "tentativa-1234", recuperacao: { courseId: "10000000-0000-4000-8000-000000000001",
    requestId: "tentativa-1234", operation: "course_observation_correction" } },
  manter_fonte: { metadados: {}, ancoras: [], vinculos: [], retirar: "fonte", estilo: "abnt",
    fonte: "Fonte sintética" }
});
const FIELDS = Object.freeze({
  ajustar_configuracao: ["parametros", "automaticos", "direcaoEditorial"],
  aplicar_correcoes: ["correcoes", "explicacoes"],
  registrar_observacao: ["unidades", "microssequencia"],
  incorporar_pdf_como_fonte: ["fonte", "titulo", "papeisSugeridos"],
  retomar_correcao: ["curso", "tentativa", "recuperacao"],
  manter_fonte: ["metadados", "ancoras", "vinculos", "retirar", "estilo"]
});
function* subsets(fields) {
  for (let mask = 0; mask < 2 ** fields.length; mask += 1) {
    yield fields.filter((field, index) => (mask & (2 ** index)) !== 0);
  }
}

test("asserções de args saem da união de raiz sem mudar a validação", () => {
  for (const name of Object.keys(ORIGINAL)) {
    const current = schemaOf(name);
    assert.equal(current.anyOf, undefined, name + " não pode manter anyOf na raiz");
    assert.equal(current.oneOf, undefined, name + " não pode manter oneOf na raiz");
    assert.ok(Array.isArray(current.allOf), name + " precisa expor a asserção em allOf");
    assert.equal(typeof current.properties, "object", name + " precisa manter as propriedades na raiz");
    const validate = compile(current);
    const validateReference = compile(referenceSchema(name));
    for (const present of subsets(FIELDS[name])) {
      const payload = { ...base[name] };
      for (const field of present) payload[field] = structuredClone(values[name][field]);
      assert.equal(validate(payload), validateReference(payload),
        name + " divergiu em " + JSON.stringify(present) + ": " + JSON.stringify(validate.errors));
    }
    const invalidType = { ...base[name], [FIELDS[name][0]]: 42 };
    assert.equal(validate(invalidType), validateReference(invalidType), name + " divergiu no tipo inválido");
    const unknown = { ...base[name], campoDesconhecido: true };
    assert.equal(validate(unknown), false, name + " precisa recusar campo desconhecido");
    assert.equal(validateReference(unknown), false, name + " referência precisa recusar campo desconhecido");
  }
});

test("união fechada de duas ramificações mantém exatamente uma presença", () => {
  for (const [name, fields] of [["incorporar_pdf_como_fonte", ["fonte", "titulo+papeis"]],
    ["retomar_correcao", ["curso+tentativa", "recuperacao"]]]) {
    const validate = compile(schemaOf(name));
    const validateReference = compile(referenceSchema(name));
    for (const only of fields) {
      const payload = { ...base[name] };
      if (only === "fonte") payload.fonte = values[name].fonte;
      if (only === "titulo+papeis") { payload.titulo = values[name].titulo; payload.papeisSugeridos = values[name].papeisSugeridos; }
      if (only === "curso+tentativa") { payload.curso = values[name].curso; payload.tentativa = values[name].tentativa; }
      if (only === "recuperacao") payload.recuperacao = structuredClone(values[name].recuperacao);
      assert.equal(validate(payload), validateReference(payload),
        name + " divergiu na ramificação " + only + ": " + JSON.stringify(validate.errors));
    }
    const both = { ...base[name] };
    for (const field of ["fonte", "titulo", "papeisSugeridos"]) if (values[name][field] !== undefined) both[field] = structuredClone(values[name][field]);
    for (const field of ["curso", "tentativa"]) if (values[name][field] !== undefined) both[field] = structuredClone(values[name][field]);
    if (values[name].recuperacao !== undefined) both.recuperacao = structuredClone(values[name].recuperacao);
    assert.equal(validate(both), false, name + " precisa recusar as duas ramificações juntas");
    assert.equal(validateReference(both), false, name + " referência precisa recusar as duas juntas");
  }
});

test("fonte com retirada proíbe composição e preserva as demais condições", () => {
  const validate = compile(schemaOf("manter_fonte"));
  const validateReference = compile(referenceSchema("manter_fonte"));
  const cases = [
    [{ curso, retirar: "fonte" }, false],
    [{ curso, retirar: "fonte", fonte: "Fonte" }, true],
    [{ curso, retirar: "fonte", fonte: "Fonte", ancoras: [] }, false],
    [{ curso, fonte: "Fonte" }, false]
  ];
  for (const [payload, expected] of cases) {
    assert.equal(validate(payload), expected, "atual: " + JSON.stringify(payload));
    assert.equal(validateReference(payload), expected, "referência: " + JSON.stringify(payload));
  }
  // Composições sem retirada continuam decididas pelos mesmos limites de valor:
  // o confronto exige equivalência, sem fixar expectativa própria.
  for (const payload of [{ curso, metadados: {}, ancoras: [], vinculos: [], estilo: "abnt" },
    { curso, metadados: {}, fonte: "Fonte" }, { curso, ancoras: [], estilo: "abnt" }]) {
    assert.equal(validate(payload), validateReference(payload), "equivalência: " + JSON.stringify(payload));
  }
});

test("quatro variantes do seletor seguem declaradas na raiz e implicadas por tipo", () => {
  const selector = schemaOf("manter_fonte").properties.ancoras.items.properties.seletor;
  assert.equal(selector.oneOf, undefined);
  assert.equal(selector.anyOf, undefined);
  assert.ok(Array.isArray(selector.allOf));
  assert.equal(selector.additionalProperties, false);
  const validate = ajv.compile({ type: "object", properties: { seletor: structuredClone(selector) },
    required: ["seletor"], additionalProperties: false });
  const accepted = [{ tipo: "paginas", paginaInicial: 1, paginaFinal: 2 },
    { tipo: "tempo", inicioEmMilissegundos: 0, fimEmMilissegundos: 1000 },
    { tipo: "fragmento", fragmento: "definicao" },
    { tipo: "trecho", trechoExato: "Passagem", prefixo: null, sufixo: null }];
  const rejected = [{ tipo: "paginas", paginaInicial: 1 }, { tipo: "tempo", fimEmMilissegundos: 1000 },
    { tipo: "fragmento" }, { tipo: "trecho" }, { tipo: "desconhecido" },
    { tipo: "trecho", trechoExato: "Passagem", extra: 1 }];
  for (const value of accepted) assert.equal(validate({ seletor: value }), true, JSON.stringify(value) + " " + JSON.stringify(validate.errors));
  for (const value of rejected) assert.equal(validate({ seletor: value }), false, JSON.stringify(value) + " deveria ser recusado");
});

