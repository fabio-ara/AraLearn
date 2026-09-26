#!/usr/bin/env node
/**
 * Pré-triagem mecânica, somente leitura, de uma exportação completa de curso.
 *
 * Uso:
 *   node ./scripts/auditRevisaoV10Course.mjs <export.json> [--out <relatorio.json>] [--quiet]
 *
 * A entrada é um arquivo externo ao repositório ou sob `.tmp/agent/`; nada é gravado
 * no curso, no backend ou em arquivo versionado.
 *
 * Entrada aceita (qualquer uma):
 *   1. { authoringExport: { contract, course, scope, analytics, artifact } }
 *   2. { context: { authoringExport: {...} } } ou { result: { authoringExport: {...} } }
 *   3. { contract, course, scope, analytics, artifact }
 * Respostas paginadas (fragmento, temMais, continuacao) são recusadas: reconstitua a
 * exportação completa antes de auditar. O mecanismo de continuação pertence ao canal.
 *
 * Reutiliza normalizeCourseAuthoringExport, inspectPedagogicalEvidence,
 * PEDAGOGICAL_AUDIT_DIMENSIONS, validateStudyUnitEnvelope e RESOURCE_PACKAGE_REGISTRY.
 * Sem unidade de estudo materializada a análise é vazia: envelopes válidos e ausência de
 * códigos não significam aprovação. Semântica e pixels permanecem NAO_VERIFICADO.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARREGAR = (relativo) => import(pathToFileURL(path.join(RAIZ, relativo)).href);
const CATALOGO_ESPERADO = 34;
const LIMITE_ISSUES_NO_RELATORIO = 2000;
const NAO_VERIFICADO = "NAO_VERIFICADO";

const USO = [
  "Uso: node ./scripts/auditRevisaoV10Course.mjs <export.json> [--out <relatorio.json>] [--quiet]",
  "",
  "Entrada: exportação completa em arquivo externo (isolada ou dentro do contexto de leitura).",
  "Saída: relatório JSON (default: <export>.audit-report.json) e resumo no stdout."
].join("\n");

function encerrarComErro(mensagem) {
  console.error(`[auditoria] ${mensagem}`);
  process.exit(2);
}

function lerArgumentos(argumentos) {
  const opcoes = { entrada: null, saida: null, quieto: false, ajuda: false };
  for (let indice = 0; indice < argumentos.length; indice += 1) {
    const valor = argumentos[indice];
    if (valor === "--help" || valor === "-h") opcoes.ajuda = true;
    else if (valor === "--quiet") opcoes.quieto = true;
    else if (valor === "--out") {
      indice += 1;
      opcoes.saida = argumentos[indice] ?? null;
      if (!opcoes.saida) encerrarComErro("--out exige um caminho.");
    } else if (valor.startsWith("--")) encerrarComErro(`Opção desconhecida: ${valor}`);
    else if (!opcoes.entrada) opcoes.entrada = valor;
    else encerrarComErro(`Argumento extra: ${valor}`);
  }
  return opcoes;
}

const opcoes = lerArgumentos(process.argv.slice(2));
if (opcoes.ajuda) {
  console.log(USO);
  process.exit(0);
}
if (!opcoes.entrada) encerrarComErro(USO);

const arquivoEntrada = path.resolve(process.cwd(), opcoes.entrada);
if (!fs.existsSync(arquivoEntrada)) encerrarComErro(`Exportação não encontrada: ${arquivoEntrada}`);
if (!fs.existsSync(path.join(RAIZ, "src/domain/coursePedagogicalAudit.js"))) {
  encerrarComErro(`Raiz do repositório não localizada a partir de ${RAIZ}.`);
}

const { normalizeCourseAuthoringExport } = await CARREGAR("src/domain/courseAuthoringComparison.js");
const { inspectPedagogicalEvidence, PEDAGOGICAL_AUDIT_DIMENSIONS } = await CARREGAR("src/domain/coursePedagogicalAudit.js");
const { validateStudyUnitEnvelope } = await CARREGAR("src/resources/kernel/studyUnitEnvelope.js");
const { RESOURCE_PACKAGE_REGISTRY } = await CARREGAR("src/resources/packages/index.js");

// As 8 dimensões do mandato de revisão. As 5 do código são pré-triagem mecânica.
const DIMENSOES_8 = Object.freeze([
  { id: "objetivo", rotulo: "1 objetivo", natureza: "semantico" },
  { id: "explicacao", rotulo: "2 explicação", natureza: "semantico" },
  { id: "operacao_cognitiva", rotulo: "3 operação-alvo da tarefa coerente", natureza: "semantico" },
  { id: "evidencia", rotulo: "4 evidência", natureza: "semantico" },
  { id: "pratica", rotulo: "5 prática adequada", natureza: "semantico" },
  { id: "feedback", rotulo: "6 feedback", natureza: "semantico" },
  { id: "representacao", rotulo: "7 adequação de representação", natureza: "semantico" },
  { id: "carga_visual", rotulo: "8 carga e hierarquia visual", natureza: "visual" }
]);

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function desembrulharExportacao(dado) {
  if (!dado || typeof dado !== "object" || Array.isArray(dado)) {
    throw new Error("O arquivo não contém um objeto JSON.");
  }
  if (dado.fragmento || dado.temMais !== undefined || dado.continuacao) {
    throw new Error("O arquivo é uma resposta paginada em fragmentos. Reconstitua a exportação completa antes de auditar.");
  }
  const candidatos = [dado.authoringExport, dado.context?.authoringExport, dado.result?.authoringExport, dado];
  for (const candidato of candidatos) {
    if (candidato && typeof candidato === "object" && candidato.analytics && candidato.artifact) return candidato;
  }
  throw new Error("Forma não reconhecida: faltam analytics e artifact. Aceita-se a exportação isolada ou dentro de authoringExport/context/result.");
}

// Os packages ocupam os slots content, response e feedback; a explicação também é content.
// A união de slots declarados pelo catálogo é exatamente { content, response, feedback }.
function coletarPacotes(microssequencia) {
  const pacotes = new Set();
  const adicionar = (instancia) => {
    const id = texto(instancia?.package);
    if (id) pacotes.add(id);
  };
  (microssequencia?.explanation?.content ?? []).forEach(adicionar);
  for (const unidade of microssequencia?.studyUnits ?? []) {
    (unidade?.content ?? []).forEach(adicionar);
    adicionar(unidade?.response);
    (unidade?.feedback ?? []).forEach(adicionar);
  }
  return [...pacotes].sort();
}

function dimensoesDaMicrossequencia({ microssequencia, unidades, requisitos, aplicacoesPorUnidade, issues, provenienciaExplicacao }) {
  const codigos = (prefixo) => issues.filter((item) => item.code.startsWith(prefixo)).map((item) => item.code);
  const aplicacoes = Object.values(aplicacoesPorUnidade).flat();
  const operacoes = [...new Set(aplicacoes.map((entrada) => texto(entrada.invariantTaskOperation)).filter(Boolean))];
  const instanciasFeedback = unidades.reduce((total, unidade) => total + (unidade?.feedback?.length ?? 0), 0);
  const requisitosCasados = new Set(aplicacoes
    .map((entrada) => texto(entrada.evidenceRequirementId))
    .filter((id) => requisitos.some((requisito) => requisito.id === id))).size;
  const papeis = unidades.map((unidade) => texto(unidade?.role));
  return [
    { id: "objetivo", veredito: NAO_VERIFICADO, motivo: "Julgamento semântico do enunciado não é observado pelo script.",
      sinaisMecanicos: { goal: texto(microssequencia?.goal) ? "presente" : "ausente", role: texto(microssequencia?.role) || null,
        papeisDeclarados: papeis, unidadesSemPapel: papeis.filter((papel) => !papel).length } },
    { id: "explicacao", veredito: NAO_VERIFICADO, motivo: "Suficiência da explicação é semântica; o script só confere presença e proveniência.",
      sinaisMecanicos: { explicacaoPresente: Boolean(microssequencia?.explanation), instancias: microssequencia?.explanation?.content?.length ?? 0,
        provenienciaDeclarada: Boolean(provenienciaExplicacao) } },
    { id: "operacao_cognitiva", veredito: NAO_VERIFICADO, motivo: "Coerência entre a ação exigida e o objetivo é semântica.",
      sinaisMecanicos: { operacoesDeclaradas: operacoes, unidadesTeoria: papeis.filter((papel) => papel === "theory").length,
        unidadesPratica: papeis.filter((papel) => papel === "practice").length } },
    { id: "evidencia", veredito: NAO_VERIFICADO, motivo: "A resposta provar o objetivo é semântico; a pré-triagem só detecta contradições observáveis.",
      sinaisMecanicos: { requisitosCasados, aplicacoesDeclaradas: aplicacoes.length,
        contradicoesObservadas: codigos("pedagogical_evidence").concat(codigos("pedagogical_requirement")) } },
    { id: "pratica", veredito: NAO_VERIFICADO, motivo: "Adequação da tarefa ao objetivo é semântica; a distribuição é apenas mecânica.",
      sinaisMecanicos: { unidadesPratica: papeis.filter((papel) => papel === "practice").length, aplicacoesDeclaradas: aplicacoes.length } },
    { id: "feedback", veredito: NAO_VERIFICADO, motivo: "Explicar o erro específico é semântico; o script só aplica o piso mecânico.",
      sinaisMecanicos: { instanciasFeedback, contradicoesObservadas: codigos("pedagogical_feedback").concat(codigos("pedagogical_editorial")) } },
    { id: "representacao", veredito: NAO_VERIFICADO, motivo: "Escolher a representação certa para a tarefa é semântico; o script confere instalação, slot e envelope.",
      sinaisMecanicos: { pacotes: coletarPacotes(microssequencia), errosEnvelope: issues.filter((item) => item.origem === "envelope").length } },
    { id: "carga_visual", veredito: NAO_VERIFICADO, motivo: "Hierarquia, densidade e foco exigem pixels do Estudo; o JSON não os observa.",
      sinaisMecanicos: { observavelSemPixels: false, unidades: unidades.length } }
  ];
}

let exportacaoBruta;
try {
  exportacaoBruta = desembrulharExportacao(JSON.parse(fs.readFileSync(arquivoEntrada, "utf8")));
} catch (erro) {
  encerrarComErro(`${arquivoEntrada}: ${erro?.message ?? erro}`);
}

const integridade = { ok: true, erro: null };
let exportacao = exportacaoBruta;
try {
  exportacao = normalizeCourseAuthoringExport(exportacaoBruta);
} catch (erro) {
  integridade.ok = false;
  integridade.erro = String(erro?.message ?? erro);
}

const documento = exportacao.artifact?.document ?? {};
const curso = (documento.courses ?? []).find((item) => item?.id === exportacao.course?.id) ?? (documento.courses ?? [])[0] ?? null;
if (!curso) encerrarComErro("O documento exportado não contém curso.");

const requisitos = ((exportacao.analytics?.basis?.evidenceRequirements) ?? [])
  .map((item) => ({ id: texto(item.ref), position: item.position, statement: texto(item.statement), description: texto(item.description) }))
  .filter((item) => item.id);
const basePorUnidade = new Map(((exportacao.analytics?.basis?.studyUnits) ?? []).map((item) => [texto(item.studyUnitRef), item]));
const provenienciaPorAlvo = new Set((exportacao.artifact?.explanationSources ?? [])
  .map((fonte) => texto(fonte?.query?.targetId)).filter(Boolean));

const catalogo = RESOURCE_PACKAGE_REGISTRY.listCatalog();
const idsCatalogo = catalogo.map((pacote) => texto(pacote.id)).filter(Boolean).sort();

const linhas = [];
const microssequencias = [];
let totalUnidades = 0;
let totalEnvelopesInvalidos = 0;
let totalAplicacoes = 0;
const contagemCodigos = {};
const issuesRelatorio = [];

for (const [indiceModulo, modulo] of (curso.modules ?? []).entries()) {
  for (const [indiceLicao, licao] of (modulo.lessons ?? []).entries()) {
    for (const [indiceMs, microssequencia] of (licao.microsequences ?? []).entries()) {
      const caminho = `${indiceModulo + 1}.${indiceLicao + 1}.${indiceMs + 1}`;
      const unidades = microssequencia.studyUnits ?? [];
      const aplicacoesPorUnidade = {};
      const issuesDaMs = [];
      for (const [indiceUnidade, unidade] of unidades.entries()) {
        totalUnidades += 1;
        const declaracao = basePorUnidade.get(texto(unidade.id))?.declaration ?? null;
        const praticas = declaracao?.practiceApplications ?? [];
        aplicacoesPorUnidade[texto(unidade.id) || `#${indiceUnidade + 1}`] = praticas;
        totalAplicacoes += praticas.length;
        const envelope = validateStudyUnitEnvelope(unidade, RESOURCE_PACKAGE_REGISTRY);
        if (!envelope.valid) {
          totalEnvelopesInvalidos += 1;
          envelope.errors.slice(0, 10).forEach((mensagem) => issuesDaMs.push({ origem: "envelope", unit: unidade.id, code: "estudo_unidade_envelope", path: mensagem, message: "" }));
        }
        try {
          const auditoria = inspectPedagogicalEvidence({ content: unidade, objective: texto(microssequencia.goal), requirements: requisitos, practices: praticas });
          auditoria.issues.forEach((item) => issuesDaMs.push({ origem: "pre_triagem", unit: unidade.id, code: item.code, path: item.path, message: item.message }));
        } catch (erro) {
          issuesDaMs.push({ origem: "pre_triagem", unit: unidade.id, code: "pedagogical_inspection_failed", path: "content", message: String(erro?.message ?? erro) });
        }
      }
      for (const item of issuesDaMs) contagemCodigos[item.code] = (contagemCodigos[item.code] ?? 0) + 1;
      issuesRelatorio.push(...issuesDaMs);
      const pacotes = coletarPacotes(microssequencia);
      const dimensoes = dimensoesDaMicrossequencia({ microssequencia, unidades, requisitos, aplicacoesPorUnidade, issues: issuesDaMs,
        provenienciaExplicacao: provenienciaPorAlvo.has(texto(microssequencia.id)) });
      microssequencias.push({ id: texto(microssequencia.id), caminho, titulo: texto(microssequencia.title), goal: texto(microssequencia.goal),
        role: texto(microssequencia.role) || null, unidades: unidades.length, pacotes,
        issues: [...new Set(issuesDaMs.map((item) => item.code))].sort(),
        dimensoes: dimensoes.map((dimensao) => ({ ...dimensao,
          rotulo: DIMENSOES_8.find((item) => item.id === dimensao.id).rotulo,
          natureza: DIMENSOES_8.find((item) => item.id === dimensao.id).natureza })) });
      linhas.push({ caminho, ms: texto(microssequencia.id), unidades: unidades.length, pacotes });
    }
  }
}

const analiseVazia = totalUnidades === 0;
const pacotesUsados = [...new Set(linhas.flatMap((linha) => linha.pacotes))].sort();
const pacotesAusentes = idsCatalogo.filter((id) => !pacotesUsados.includes(id));
const pacotesDesconhecidos = pacotesUsados.filter((id) => !idsCatalogo.includes(id));

const relatorio = {
  auditoria: "pré-triagem mecânica de exportação de curso (revisão v10)",
  arquivo: arquivoEntrada,
  geradoEm: new Date().toISOString(),
  curso: { id: exportacao.course?.id ?? null, titulo: texto(exportacao.course?.title), revisao: exportacao.course?.revision ?? exportacao.analytics?.course?.revision ?? null },
  integridadeExportacao: integridade,
  analiseVazia,
  limitesObservados: { semantica: NAO_VERIFICADO, pixels: NAO_VERIFICADO,
    nota: analiseVazia
      ? "Sem unidade de estudo materializada a análise mecânica é vazia: envelopes válidos e zero códigos não significam aprovação. Cada microssequência sai com as 8 dimensões em NAO_VERIFICADO e apenas sinais mecânicos anexados."
      : "O script não julga significado nem pixels. Cada microssequência sai com as 8 dimensões em NAO_VERIFICADO e apenas sinais mecânicos anexados; a leitura semântica e as capturas do Estudo continuam obrigatórias." },
  preTriagem: { dimensoesDoCodigo: [...PEDAGOGICAL_AUDIT_DIMENSIONS], microssequencias: microssequencias.length, unidades: totalUnidades,
    requisitos: requisitos.length, aplicacoesDeclaradas: totalAplicacoes, envelopesInvalidos: totalEnvelopesInvalidos,
    unidadesComIssue: new Set(issuesRelatorio.map((item) => item.unit)).size,
    codigos: Object.fromEntries(Object.entries(contagemCodigos).sort()) },
  inventario: { catalogoRegistrado: idsCatalogo.length, catalogoEsperado: CATALOGO_ESPERADO,
    divergenciaCatalogo: idsCatalogo.length - CATALOGO_ESPERADO, pacotesUsados, pacotesAusentes,
    cobertura: idsCatalogo.length ? Number(((pacotesUsados.filter((id) => idsCatalogo.includes(id)).length / idsCatalogo.length) * 100).toFixed(1)) : 0,
    pacotesDesconhecidos, porMicrossequencia: linhas },
  microssequencias,
  issues: issuesRelatorio.slice(0, LIMITE_ISSUES_NO_RELATORIO),
  issuesTruncadas: Math.max(0, issuesRelatorio.length - LIMITE_ISSUES_NO_RELATORIO)
};

const arquivoSaida = opcoes.saida
  ? path.resolve(process.cwd(), opcoes.saida)
  : path.join(path.dirname(arquivoEntrada), `${path.basename(arquivoEntrada, path.extname(arquivoEntrada))}.audit-report.json`);
fs.mkdirSync(path.dirname(arquivoSaida), { recursive: true });
fs.writeFileSync(arquivoSaida, `${JSON.stringify(relatorio, null, 2)}\n`, "utf8");

const resumo = {
  arquivo: arquivoEntrada,
  relatorio: arquivoSaida,
  integridadeExportacao: integridade.ok ? "ok" : `falhou: ${integridade.erro}`,
  analiseVazia,
  curso: relatorio.curso,
  microssequencias: microssequencias.length,
  unidades: totalUnidades,
  requisitos: requisitos.length,
  aplicacoesDeclaradas: totalAplicacoes,
  envelopesInvalidos: totalEnvelopesInvalidos,
  unidadesComIssue: relatorio.preTriagem.unidadesComIssue,
  codigos: relatorio.preTriagem.codigos,
  inventario: { catalogo: idsCatalogo.length, usados: pacotesUsados.length, cobertura: relatorio.inventario.cobertura,
    ausentes: pacotesAusentes.length, desconhecidos: pacotesDesconhecidos },
  dimensoes: DIMENSOES_8.map((dimensao) => `${dimensao.rotulo}=${NAO_VERIFICADO}`)
};
if (!opcoes.quieto) console.log(JSON.stringify(resumo, null, 2));
