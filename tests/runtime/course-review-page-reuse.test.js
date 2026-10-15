// Contrato do repositório de reuso do recorte de preparar_revisao: o que acontece quando a
// entrada some, muda ou excede o teto enquanto a chamada aguarda leitura. Helper puro, sem
// adapter hospedado e sem fragmentos: o interleaving e a contabilização são locais.
import test from "node:test";
import assert from "node:assert/strict";
import { reusedReviewPage, rememberReviewPage, forgetReviewPage } from
  "../../supabase/functions/_shared/aralearn-authoring/courseReviewPageReuse.js";

const ADAPTER = {};
const identity = page => ({ actorId: "2a000000-0000-4000-8000-000000000001",
  courseId: "1a000000-0000-4000-8000-000000000001", revision: 41, queryHash: "consulta", page });
const claim = async () => ({ annotationSetVersion: 1 });
const claimEcho = async entry => ({ annotationSetVersion: 1, tag: entry.record.tag });
const store = (page, record) => rememberReviewPage(ADAPTER, identity(page), { annotationSetVersion: 1,
  characters: JSON.stringify(record).length, digest: "d".repeat(64), planDigest: "p".repeat(64),
  unitPageDigest: "u".repeat(64), record });

test("claim que aguarda leitura não ressuscita entrada descartada nem substituída", async () => {
  const gatilho = () => { let liberar; const espera = new Promise(resolve => { liberar = resolve; });
    return { espera, liberar }; };

  store(null, { tag: "antiga" });
  const remocao = gatilho();
  const pendenteRemocao = reusedReviewPage(ADAPTER, identity(null), async () => { await remocao.espera;
    return { annotationSetVersion: 1, record: { tag: "antiga" } }; });
  forgetReviewPage(ADAPTER, identity(null));
  remocao.liberar();
  assert.equal(await pendenteRemocao, null, "entrada descartada durante o claim não volta ao repositório");
  assert.equal(await reusedReviewPage(ADAPTER, identity(null), claim), null, "e continua ausente depois");

  store(null, { tag: "antiga" });
  const substituicao = gatilho();
  const pendenteSubstituicao = reusedReviewPage(ADAPTER, identity(null), async () => { await substituicao.espera;
    return { annotationSetVersion: 1, record: { tag: "antiga" } }; });
  store(null, { tag: "corrente" });
  substituicao.liberar();
  assert.equal(await pendenteSubstituicao, null, "entrada substituída durante o claim não é servida nem reposicionada");
  const corrente = await reusedReviewPage(ADAPTER, identity(null), claimEcho);
  assert.equal(corrente.tag, "corrente", "a entrada corrente segue servível");

  // O descarte e a substituição não desalinham o repositório: o teto de entradas continua
  // despejando do início, e a entrada mais recente continua servível.
  store(null, { tag: "corrente" });
  for (let index = 1; index <= 6; index += 1) store(`pagina-${index}`, { tag: `pagina-${index}` });
  assert.equal(await reusedReviewPage(ADAPTER, identity(null), claim), null, "a mais antiga foi despejada");
  assert.ok(await reusedReviewPage(ADAPTER, identity("pagina-6"), claim), "a mais recente segue servível");
});

test("entrada acima do teto serializado não é servível e não desloca as vizinhas", async () => {
  store("antes", { tag: "antes" });
  store("gigante", { tag: "gigante", bloco: "x".repeat(12 * 1024 * 1024 + 1024) });
  assert.equal(await reusedReviewPage(ADAPTER, identity("gigante"), claim), null,
    "entrada acima do teto serializado não é guardada nem servível");
  assert.ok(await reusedReviewPage(ADAPTER, identity("antes"), claim),
    "a vizinha anterior continua servível");
  store("depois", { tag: "depois" });
  assert.ok(await reusedReviewPage(ADAPTER, identity("depois"), claim),
    "a vizinha seguinte continua servível");

  // Contabilização real da representação serializada: seis entradas de ~2,2M caracteres
  // excedem o teto e despejam as mais antigas, sem deixar o repositório inconsistente.
  for (let index = 1; index <= 6; index += 1) store(`grande-${index}`, { tag: `grande-${index}`,
    bloco: "y".repeat(2_200_000) });
  assert.equal(await reusedReviewPage(ADAPTER, identity("antes"), claim), null,
    "o teto serializado despeja as entradas mais antigas");
  assert.ok(await reusedReviewPage(ADAPTER, identity("grande-6"), claim),
    "a entrada recente segue servível depois do despejo por tamanho");
});

