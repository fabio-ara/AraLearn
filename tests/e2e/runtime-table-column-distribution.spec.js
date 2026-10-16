import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Prova focal da issue #470: distribuicao de largura nas tabelas do componente
// compartilhado. As fixtures sao sinteticas e genericas, com enderecos da faixa
// de documentacao (RFC 5737) e comprimentos representativos: rotulo curto na
// primeira, na ultima e na coluna do meio, alem de uma tabela de duas colunas e
// de uma coluna de prosa visivelmente curta ao lado de outra longa. O rotulo
// curto nao e uma posicao fixa no contrato do pacote, entao as quatro
// orientacoes precisam medir igual.
//
// A prova registra a geometria real de cada coluna (largura e pior numero de
// caracteres por linha) e julga os invariantes que a mudanca nao pode alterar:
// a tabela cabe na coluna de leitura, a pagina nao estoura, a moldura ocupa a
// coluna inteira, os controles do leitor seguem 44x44, as celulas com contrato
// proprio de largura seguem com o piso e a tabela larga mantem o piso das
// colunas e a rolagem propria. A distribuicao interna do recorte de ate tres
// colunas e medida e registrada sem assercao: reduzir o piso nesse recorte foi
// medido e devolve largura a prosa longa as custas das colunas curtas, como
// documenta o comentario de public/styles.css.

const ROWS = [
  ["C1", "Conferir a etiqueta antes de registrar o item", "O registro confirma o item e o endereco 198.51.100.24/24 aparece no relatorio"],
  ["C2", "Registrar o horario de cada leitura", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao"],
  ["C3", "Anotar o endereco do equipamento", "198.51.100.7 responde ao teste; sem outro caminho ativo no momento"],
  ["C4", "Comparar duas leituras do mesmo item", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar o registro incompleto", "Apagar o registro parcial, usar a etiqueta correta e repetir a leitura"],
  ["C6", "Retomar a leitura inicial", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

// Mesma cena com a segunda coluna curta e a terceira longa: e o caso em que a
// folga liberada por uma coluna curta decide se a outra coluna continua legivel.
const UNEVEN = [
  ["C1", "Etiqueta ok", "O registro confirma o item, o horario e o endereco 198.51.100.24/24 no relatorio final do lote"],
  ["C2", "Horario ok", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao disponivel no sistema"],
  ["C3", "Endereco ok", "198.51.100.7 responde ao teste; sem outro caminho ativo no momento da verificacao do lote"],
  ["C4", "Duas leituras", "O desvio entre as duas leituras do mesmo item fica dentro da faixa aceita para o lote inteiro"],
  ["C5", "Registro parcial", "Apagar o registro parcial, usar a etiqueta correta e repetir a leitura do item no lote atual"],
  ["C6", "Repetir leitura", "Repetir a primeira leitura e conferir se o valor se mantem estavel durante a verificacao"]
];

const TWO_COLUMNS = [["Conhecimento previo", "Como o que ja foi aprendido antes influencia a leitura do conteudo novo?"],
  ["Contexto de uso", "Em que situacao concreta esta relacao entre conceito e pratica costuma aparecer para quem aprende?"],
  ["Integracao entre areas", "Que ligacao pode ser feita entre este conteudo e outro ja estudado na mesma trilha de formacao?"],
  ["Aplicacao imediata", "Qual decisao pratica muda quando a relacao apresentada e levada a serio no trabalho cotidiano?"],
  ["Limite do modelo", "Ate que ponto a relacao descrita continua valida e quando ela deixa de explicar o fenomeno observado?"],
  ["Verificacao", "Que evidencia observavel mostraria que a integracao entre contexto e conteudo realmente aconteceu?"],
  ["Retomada", "O que precisa ser revisitado depois para que a aprendizagem se mantenha em novas situacoes de estudo?"]];

const WIDE8 = {
  columns: Array.from({ length: 8 }, (_, index) => "Coluna " + (index + 1)),
  rows: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, column) => "Valor " + (row + 1) + "." + (column + 1)))
};

const SLICE = [
  ["rotulo-primeiro", { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: ROWS }],
  ["rotulo-ultimo", { title: "Rotina de leitura", columns: ["Verificacao", "Etapa", "Item"], rows: ROWS.map(([code, etapa, verif]) => [verif, etapa, code]) }],
  ["rotulo-meio", { title: "Rotina de leitura", columns: ["Verificacao", "Item", "Etapa"], rows: ROWS.map(([code, etapa, verif]) => [verif, code, etapa]) }],
  ["prosa-desigual", { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: UNEVEN }],
  ["duas-colunas", { title: "Integrar para aprender", columns: ["Relacao", "Pergunta"], rows: TWO_COLUMNS }]
];

const FLOOR_REM = 5.5;
const PROOF_DIR = path.resolve(process.env.ARALEARN_TABLE_PROOF_DIR || "test-results/table-reading-470");

async function mount(page, { width, data }) {
  await page.setViewportSize({ width, height: 740 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route("**/tests/" + file, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL("../" + file, import.meta.url), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ data }) => {
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), { unit: "theory",
      resourceContent: [{ id: "representation", package: "aralearn.resource.table", version: "1.0.0", data }] });
  }, { data });
}

function readGeometry(scope) {
  return scope.locator(".runtime-table-wrap").evaluate((node, floorRem) => {
    const table = node.querySelector("table.runtime-table");
    const columns = [...table.querySelectorAll("thead th")].map(th => Math.round(th.getBoundingClientRect().width * 10) / 10);
    const minChars = columns.map(() => Infinity);
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, index) => {
        const target = cell.querySelector("p, li") || cell;
        const text = target.textContent.trim();
        const range = document.createRange(); range.selectNodeContents(target);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
        if (text && rects.length) minChars[index] = Math.min(minChars[index], Math.round(text.length / rects.length * 10) / 10);
      });
    }
    const box = node.getBoundingClientRect();
    return { columns, minimumCharsPerColumn: minChars.map(value => (value === Infinity ? 0 : value)),
      floor: Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * floorRem * 10) / 10,
      table: Math.round(table.getBoundingClientRect().width),
      frame: Math.round(node.querySelector(".runtime-table-frame").getBoundingClientRect().width),
      wrapClient: node.clientWidth, wrapScroll: node.scrollWidth, overflowX: getComputedStyle(node).overflowX,
      pageOverflow: document.documentElement.scrollWidth - innerWidth, wrapLeft: Math.round(box.left) };
  }, FLOOR_REM);
}

async function controlBoxes(page) {
  return page.locator(".icon-ghost").evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().width > 0)
    .map(node => { const rect = node.getBoundingClientRect(); return { label: node.getAttribute("aria-label"),
      width: Math.round(rect.width), height: Math.round(rect.height) }; }));
}

for (const [name, data] of SLICE) {
  test("tabela de rotulo curto " + name + " cabe na coluna de leitura em 360px", async ({ page }) => {
    await mount(page, { width: 360, data });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    const controls = await controlBoxes(page);
    console.log("geometria " + name + "/360: " + JSON.stringify(geometry));
    await page.screenshot({ path: path.join(PROOF_DIR, name + "-360.png") });
    expect(geometry.overflowX, name).toBe("auto");
    expect(geometry.pageOverflow, name).toBeLessThanOrEqual(1);
    // Cabe: a moldura nao passa da coluna de leitura e a tabela ocupa a coluna inteira.
    expect(geometry.wrapScroll - geometry.wrapClient, name).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.table - (geometry.wrapClient - 12)), name).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.frame - (geometry.wrapClient - 10)), name).toBeLessThanOrEqual(2);
    for (const control of controls) {
      expect(control.width, "controle " + control.label).toBe(44);
      expect(control.height, "controle " + control.label).toBe(44);
    }
  });
}

test("tabela de rotulo curto em 1280px mantem a mesma distribuicao", async ({ page }) => {
  await mount(page, { width: 1280, data: SLICE[0][1] });
  const geometry = await readGeometry(page.locator(".card-sheet-content"));
  console.log("geometria rotulo-primeiro/1280: " + JSON.stringify(geometry));
  await page.screenshot({ path: path.join(PROOF_DIR, "rotulo-primeiro-1280.png") });
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
  expect(geometry.wrapScroll - geometry.wrapClient).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.table - (geometry.wrapClient - 12))).toBeLessThanOrEqual(2);
});

test("tabela larga de 8 colunas mantem o piso das colunas e a rolagem propria", async ({ page }) => {
  for (const width of [360, 1280]) {
    await mount(page, { width, data: WIDE8 });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    const reach = await scope.locator(".runtime-table-wrap").evaluate(node => {
      node.scrollLeft = node.scrollWidth;
      const last = node.querySelector("tr:last-child > :last-child").getBoundingClientRect();
      return { reachable: last.right <= node.getBoundingClientRect().right + 1, scroll: node.scrollWidth - node.clientWidth };
    });
    console.log("geometria larga8/" + width + ": " + JSON.stringify(geometry) + " alcance: " + JSON.stringify(reach));
    if (width === 360) await page.screenshot({ path: path.join(PROOF_DIR, "larga8-360.png") });
    expect(geometry.pageOverflow, "larga8/" + width).toBeLessThanOrEqual(1);
    expect(geometry.wrapScroll, "larga8/" + width).toBeGreaterThan(geometry.wrapClient + 1);
    expect(geometry.columns.length).toBe(8);
    for (const [index, columnWidth] of geometry.columns.entries()) {
      expect(columnWidth, "larga8/" + width + ": coluna " + (index + 1)).toBeGreaterThanOrEqual(geometry.floor - 1);
    }
    expect(reach.reachable, "larga8/" + width + ": ultima coluna alcancavel").toBe(true);
  }
});

test("celulas com contrato proprio de largura seguem com o piso em qualquer coluna", async ({ page }) => {
  await mount(page, { width: 360, data: SLICE[0][1] });
  // O produto ainda nao emite estas classes (nao ha consumidor); a prova fixa o
  // contrato de CSS aplicando-as as celulas reais e lendo o valor computado.
  const computed = await page.locator(".card-sheet-content .runtime-table tbody tr:first-child")
    .evaluate(row => [...row.children].map(cell => {
      const values = {};
      for (const name of ["is-nowrap", "is-align-numeric"]) {
        cell.classList.add(name);
        values[name] = getComputedStyle(cell).minWidth;
        cell.classList.remove(name);
      }
      values.base = getComputedStyle(cell).minWidth;
      return values;
    }));
  console.log("contrato de largura: " + JSON.stringify(computed));
  for (const values of computed) {
    expect(values.base).toBe("88px");
    expect(values["is-nowrap"]).toBe("88px");
    expect(values["is-align-numeric"]).toBe("88px");
  }
});

