import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Prova focal da issue #470: nas tabelas de ate tres colunas a largura segue o
// conteudo real de cada coluna, em vez de reservar o piso fixo para o rotulo
// curto. As fixtures sao sinteticas e genericas, com enderecos da faixa de
// documentacao (RFC 5737). O rotulo curto aparece na primeira, na ultima e na
// coluna do meio, porque nao existe posicao fixa de rotulo no contrato do pacote;
// ha tambem a tabela desigual, a de duas colunas, a que leva codigo em linha com
// endereco e URL longa, a URL e o link de markdown em texto puro, o token textual
// longo e a tabela larga de oito colunas.
//
// O recorte nao promete caber: quando o conteudo pede mais do que a coluna de
// leitura, a moldura cresce dentro do wrapper e rola, como na tabela larga. A
// prova julga o que a mudanca nao pode alterar: cada coluna comporta a propria
// palavra (a quebra entre duas letras de uma palavra, fora do codigo em linha,
// continua sendo defeito), o crescimento da moldura fica limitado ao que as
// palavras pedem, a pagina nao estoura, a rolagem fica dentro do controle e a
// geometria externa (card, coluna de leitura, rodape e controle Explicacao de
// 44x44) não se move. O piso permanece nas celulas com contrato proprio de
// largura e a tabela de mais de tres colunas nao muda.

const ROWS = [
  ["C1", "Conferir a etiqueta antes de registrar o item", "O registro confirma o item e o endereco 198.51.100.24/24 aparece no relatorio"],
  ["C2", "Registrar o horario de cada leitura", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao"],
  ["C3", "Anotar o endereco do equipamento", "198.51.100.7 responde ao teste; sem outro caminho ativo no momento"],
  ["C4", "Comparar duas leituras do mesmo item", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar o registro incompleto", "Apagar o registro parcial, usar a etiqueta correta e repetir a leitura"],
  ["C6", "Retomar a leitura inicial", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

// Segunda coluna curta e terceira longa: e o caso em que a folga liberada pela
// coluna curta decide se a outra coluna continua legivel.
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

// Codigo em linha com endereco de documentacao e URL longa: o token do codigo
// quebra em qualquer ponto e nao deve alargar a tabela nem espremer a prosa.
const CODE_INLINE = [
  ["C1", "Conferir o host", "O host `198.51.100.24/24` responde; o token `https://exemplo.invalid/relatorio/198.51.100.24/24/lote/leitura` segue registrado"],
  ["C2", "Registrar o horario", "Cada leitura recebe horario e `198.51.100.24/24` confirma o caminho ativo"],
  ["C3", "Anotar o endereco", "`198.51.100.7` responde ao teste; sem outro caminho ativo no momento"],
  ["C4", "Comparar leituras", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar registro", "Apagar o registro parcial e repetir a leitura com `198.51.100.24/24`"],
  ["C6", "Retomar leitura", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

// Os tres casos abaixo tem token sem ponto de quebra: a coluna assume a largura
// da palavra e a moldura cresce com rolagem propria, em vez de partir a prosa.
const URL_PLAIN = [
  ["C1", "Abrir o relatorio", "O relatorio do lote fica em https://exemplo.invalid/relatorio/198.51.100.24/24/lote/leitura e reune as leituras"],
  ["C2", "Registrar o horario", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao"],
  ["C3", "Conferir o endereco", "https://exemplo.invalid/198.51.100.7 responde ao teste; sem outro caminho ativo"],
  ["C4", "Comparar leituras", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar registro", "Apagar o registro parcial e repetir a leitura do item no lote atual"],
  ["C6", "Retomar leitura", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

// Link de markdown em texto puro: o renderizador do recurso nao emite ancora, o
// leitor ve o texto literal.
const LINK_MARKDOWN = [
  ["C1", "Abrir o relatorio", "[relatorio do lote](https://exemplo.invalid/relatorio/198.51.100.24/24/lote/leitura) reune as leituras"],
  ["C2", "Registrar o horario", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao"],
  ["C3", "Conferir o endereco", "Veja [a verificacao](https://exemplo.invalid/198.51.100.7/verificacao/lote/leitura) antes de concluir"],
  ["C4", "Comparar leituras", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar registro", "Apagar o registro parcial e repetir a leitura do item no lote atual"],
  ["C6", "Retomar leitura", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

const TOKEN_LONG = [
  ["C1", "Registrar a responsabilizacao", "A responsabilizacao pela conferencia do lote fica com quem registrou as leituras"],
  ["C2", "Registrar o horario", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao"],
  ["C3", "Anotar a incompatibilidade", "A incompatibilidade entre as leituras do lote exige uma nova conferencia do registro"],
  ["C4", "Comparar leituras", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar registro", "Apagar o registro parcial e repetir a leitura do item no lote atual"],
  ["C6", "Retomar leitura", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

// Uma coluna e uma coluna de prosa dominante entre duas curtas: sao os casos em que
// a coluna fica mais larga que o limite de celula e o conteudo precisa preencher o
// espaco utilizavel, sem sobra.
const ONE_COLUMN = Array.from({ length: 6 }, (_, index) =>
  ["C" + (index + 1) + " O registro confirma o item e o endereco 198.51.100.24/24 aparece no relatorio final do lote"]);

const DOMINANT = [
  ["1", "Nota", "O registro confirma o item, o horario e o endereco 198.51.100.24/24 no relatorio final do lote"],
  ["2", "Nota", "Cada leitura recebe horario e identificacao; comparar com a primeira medicao disponivel"],
  ["3", "Nota", "O desvio entre as duas leituras do mesmo item fica dentro da faixa aceita para o lote"],
  ["4", "Nota", "Apagar o registro parcial, usar a etiqueta correta e repetir a leitura do item atual"],
  ["5", "Nota", "Repetir a primeira leitura e conferir se o valor se mantem estavel na verificacao"],
  ["6", "Nota", "Comparar as leituras do lote com a primeira medicao e registrar o desvio final"]
];

const WIDE8 = {
  columns: Array.from({ length: 8 }, (_, index) => "Coluna " + (index + 1)),
  rows: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, column) => "Valor " + (row + 1) + "." + (column + 1)))
};

// Nenhum caso promete caber: a prova confere que a tabela mede exatamente o que o
// conteudo pede, seja a coluna de leitura, seja o min-content real das palavras.
const SLICE = [
  ["rotulo-primeiro", { data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: ROWS } }],
  ["rotulo-ultimo", { data: { title: "Rotina de leitura", columns: ["Verificacao", "Etapa", "Item"], rows: ROWS.map((row) => [row[2], row[1], row[0]]) } }],
  ["rotulo-meio", { data: { title: "Rotina de leitura", columns: ["Verificacao", "Item", "Etapa"], rows: ROWS.map((row) => [row[2], row[0], row[1]]) } }],
  ["prosa-desigual", { data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: UNEVEN } }],
  ["duas-colunas", { data: { title: "Integrar para aprender", columns: ["Relacao", "Pergunta"], rows: TWO_COLUMNS } }],
  ["codigo-em-linha", { data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: CODE_INLINE } }],
  ["url-em-texto", { data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: URL_PLAIN } }],
  ["link-markdown", { data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: LINK_MARKDOWN } }],
  ["token-longo", { data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: TOKEN_LONG } }],
  ["uma-coluna", { data: { title: "Rotina de leitura", columns: ["Verificacao"], rows: ONE_COLUMN } }],
  ["coluna-dominante", { data: { title: "Rotina de leitura", columns: ["N", "Tipo", "Verificacao"], rows: DOMINANT } }]
];

const FLOOR_REM = 5.5;
const CELL_PADDING = 22;
const PROOF_DIR = path.resolve(process.env.ARALEARN_TABLE_PROOF_DIR || "test-results/table-reading-470");

async function mount(page, { width, data, zoom }) {
  await page.setViewportSize({ width, height: 740 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route("**/tests/" + file, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL("../" + file, import.meta.url), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ data, zoom }) => {
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    // 200% de texto: unidade relativa do leitor, nao zoom de pagina.
    if (zoom) document.documentElement.style.fontSize = Math.round(16 * zoom) + "px";
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), { unit: "theory",
      resourceContent: [{ id: "representation", package: "aralearn.resource.table", version: "1.0.0", data }] });
  }, { data, zoom });
  await page.waitForTimeout(120);
}

function readGeometry(scope) {
  return scope.locator(".runtime-table-wrap").evaluate((node, { floorRem, cellPadding }) => {
    const round = (value) => Math.round(value * 10) / 10;
    const table = node.querySelector("table.runtime-table");
    const headers = [...table.querySelectorAll("thead th")];
    const headerFillGap = (header) => {
      const block = header.querySelector(".runtime-table-cell-content");
      return block ? round(header.getBoundingClientRect().width - cellPadding - block.getBoundingClientRect().width) : 0;
    };
    const textTarget = (cell) => cell.querySelector("p, li") || cell.querySelector(".runtime-table-cell-content") || cell;
    // Min-content do conteudo da celula: a largura que o layout automatico exige
    // para a coluna. Palavra e token sem ponto de quebra contam inteiros.
    const minContent = (cell) => {
      const target = textTarget(cell);
      const clone = target.cloneNode(true);
      // min-width neutralizado: a medida e do conteudo, nao do preenchimento da coluna.
      clone.setAttribute("style", "position:absolute;left:0;top:0;visibility:hidden;width:min-content;min-width:0");
      cell.appendChild(clone);
      const width = round(clone.getBoundingClientRect().width);
      clone.remove();
      return width;
    };
    // Quebra entre duas letras da mesma palavra, fora do codigo em linha. Uma
    // quebra depois de pontuacao (fim de link, por exemplo) nao conta.
    const brokenWords = (cell) => {
      const element = textTarget(cell);
      const range = document.createRange();
      const found = [];
      const letters = /[0-9A-Za-z\u00C0-\u017F]/;
      const walk = (parent, inCode) => {
        for (const child of parent.childNodes) {
          if (child.nodeType === 3) {
            const text = child.nodeValue;
            if (inCode || !/[^\s]/.test(text)) continue;
            const tops = [];
            for (let index = 0; index < text.length; index += 1) {
              range.setStart(child, index);
              range.setEnd(child, index + 1);
              tops.push(Math.round(range.getBoundingClientRect().top));
            }
            for (let index = 1; index < text.length; index += 1) {
              if (tops[index] === tops[index - 1]) continue;
              if (!letters.test(text[index - 1]) || !letters.test(text[index])) continue;
              found.push(text.slice(Math.max(0, index - 12), index + 12));
            }
          } else if (child.nodeType === 1) {
            walk(child, inCode || child.tagName === "CODE");
          }
        }
      };
      walk(element, false);
      return found;
    };
    const cellsInfo = [];
    [...table.querySelectorAll("tbody tr")].forEach((row) => {
      [...row.children].forEach((cell, column) => {
        const target = textTarget(cell);
        const range = document.createRange();
        range.selectNodeContents(target);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
        const lines = new Set(rects.map(rect => Math.round(rect.top))).size;
        const text = target.textContent.trim();
        const block = cell.querySelector(".runtime-table-cell-content");
        // Sobra entre a celula e o bloco de conteudo: a coluna mais larga que o
        // limite precisa continuar preenchendo o espaco utilizavel.
        const fillGap = block ? round(cell.getBoundingClientRect().width - cellPadding - block.getBoundingClientRect().width) : 0;
        cellsInfo.push({ column, minContent: minContent(cell), fillGap, broken: brokenWords(cell),
          minimumCharsPerLine: lines ? round(text.length / lines) : 0 });
      });
    });
    const columns = headers.map((header, index) => {
      const own = cellsInfo.filter(cell => cell.column === index);
      return { width: round(header.getBoundingClientRect().width),
        minContent: round(Math.max(minContent(header), ...own.map(cell => cell.minContent))),
        fillGap: round(Math.max(headerFillGap(header), ...own.map(cell => cell.fillGap))),
        minimumCharsPerLine: Math.min(...own.map(cell => cell.minimumCharsPerLine)) };
    });
    const external = (selector) => {
      const found = document.querySelector(selector);
      if (!found) return null;
      const rect = found.getBoundingClientRect();
      return { x: round(rect.x), width: round(rect.width), height: round(rect.height),
        clientWidth: found.clientWidth, scrollWidth: found.scrollWidth };
    };
    const explanation = document.querySelector(".study-explanation-btn");
    const explanationRect = explanation?.getBoundingClientRect();
    const footer = document.querySelector(".study-reader-footer")?.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return { columns, floor: round(parseFloat(getComputedStyle(document.documentElement).fontSize) * floorRem),
      cells: cellsInfo, rem8: round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 8),
      minContentSum: round(columns.reduce((total, column) => total + column.minContent + cellPadding, 0)),
      broken: cellsInfo.flatMap(cell => cell.broken), padding: cellPadding,
      table: Math.round(table.getBoundingClientRect().width),
      frame: Math.round(node.querySelector(".runtime-table-frame").getBoundingClientRect().width),
      wrapClient: node.clientWidth, wrapScroll: node.scrollWidth, overflowX: getComputedStyle(node).overflowX,
      pageOverflow: document.documentElement.scrollWidth - innerWidth, wrapLeft: Math.round(box.left),
      reading: external(".card-sheet-content"), sheet: external(".runtime-card-sheet"), footer: external(".study-reader-footer"),
      explanation: explanation ? { x: round(explanationRect.x), width: Math.round(explanationRect.width),
        height: Math.round(explanationRect.height), label: explanation.getAttribute("aria-label"),
        text: explanation.textContent.trim(), insideFooter: explanationRect.top >= footer.top - 1 && explanationRect.bottom <= footer.bottom + 1 } : null };
  }, { floorRem: FLOOR_REM, cellPadding: CELL_PADDING });
}

async function lastColumnReachable(scope) {
  return scope.locator(".runtime-table-wrap").evaluate(node => {
    node.scrollLeft = node.scrollWidth;
    const last = node.querySelector("tr:last-child > :last-child").getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return { reachable: last.right <= box.right + 1, scroll: node.scrollWidth - node.clientWidth };
  });
}

// Limite da celula: uma coluna de tabela de ate tres colunas nao precisa de mais
// que metade da coluna de leitura (ou 8rem, quando o texto do leitor esta
// ampliado), porque uma sequencia sem ponto de quebra quebra dentro da celula.
function cellLimit(geometry) {
  return Math.max(geometry.wrapClient / 2, geometry.rem8);
}

function expectContentDriven(geometry, name) {
  const limit = cellLimit(geometry);
  for (const [index, column] of geometry.columns.entries()) {
    const content = column.width - CELL_PADDING;
    // A coluna nunca fica mais estreita do que o proprio conteudo pede...
    expect(content + 4, name + ": coluna " + (index + 1) + " comporta o proprio conteudo")
      .toBeGreaterThanOrEqual(Math.min(column.minContent, limit) - 4);
    // ...e a celula preenche o espaco utilizavel, sem sobra para o bloco de conteudo.
    expect(column.fillGap, name + ": coluna " + (index + 1) + " preenche o espaco utilizavel").toBeLessThanOrEqual(2);
  }
  // Quebra so onde a sequencia nao cabe: onde ela cabe, a palavra fica inteira.
  for (const cell of geometry.cells) {
    const content = geometry.columns[cell.column].width - CELL_PADDING;
    if (cell.minContent <= content + 2) expect(cell.broken, name + ": palavra inteira na celula").toEqual([]);
  }
}

// A tabela mede o que o conteudo pede: a coluna de leitura ou, quando as palavras
// nao cabem nela, o min-content real do texto limitado pelo limite da celula. A
// prosa longa nao decide a largura nem uma sequencia sem ponto de quebra a infla.
function expectContentSizedFrame(geometry, name) {
  const limit = cellLimit(geometry);
  const needed = Math.max(geometry.wrapClient - 12,
    geometry.columns.reduce((total, column) => total + Math.min(column.minContent, limit) + CELL_PADDING, 0) + 2);
  expect(Math.abs(geometry.table - needed), name + ": largura igual ao que o conteudo pede").toBeLessThanOrEqual(6);
}

function expectExternalFramesStable(geometry, name, reference) {
  expect(geometry.reading.scrollWidth - geometry.reading.clientWidth, name + ": a coluna de leitura nao estoura").toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.sheet.width - geometry.reading.width - 22), name + ": moldura externa do card").toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.sheet.x + 11 - geometry.reading.x), name + ": posicao da coluna de leitura").toBeLessThanOrEqual(1);
  expect(geometry.explanation.width, name + ": controle Explicacao").toBe(44);
  expect(geometry.explanation.height, name + ": altura do controle Explicacao").toBe(44);
  expect(geometry.explanation.text, name + ": controle Explicacao e so icone").toBe("");
  expect(geometry.explanation.label, name + ": rotulo do controle Explicacao").toBe("Explicação");
  expect(geometry.explanation.insideFooter, name + ": controle Explicacao no rodape").toBe(true);
  if (reference) {
    expect(Math.abs(geometry.sheet.x - reference.sheet.x), name + ": card na mesma posicao").toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.reading.x - reference.reading.x), name + ": leitura na mesma posicao").toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.footer.x - reference.footer.x), name + ": rodape na mesma posicao").toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.explanation.x - reference.explanation.x), name + ": Explicacao na mesma posicao").toBeLessThanOrEqual(1);
  }
}

for (const [name, { data }] of SLICE) {
  for (const width of [360, 320, 1280]) {
    test("tabela de rotulo curto " + name + " respeita o conteudo em " + width + "px", async ({ page }) => {
      await mount(page, { width, data });
      const scope = page.locator(".card-sheet-content");
      const geometry = await readGeometry(scope);
      // Captura do inicio antes de deslocar a rolagem: a leitura comeca na
      // primeira coluna. O deslocamento vem depois, para a captura do fim.
      await page.screenshot({ path: path.join(PROOF_DIR, name + "-" + width + "-inicio.png") });
      const reach = await lastColumnReachable(scope);
      console.log("geometria " + name + "/" + width + ": " + JSON.stringify({ columns: geometry.columns,
        broken: geometry.broken, minContentSum: geometry.minContentSum, table: geometry.table, frame: geometry.frame,
        wrap: [geometry.wrapClient, geometry.wrapScroll], pageOverflow: geometry.pageOverflow,
        reading: geometry.reading.width, sheet: geometry.sheet.width, explanation: geometry.explanation }) + " alcance: " + JSON.stringify(reach));
      if (reach.scroll > 0) await page.screenshot({ path: path.join(PROOF_DIR, name + "-" + width + "-fim.png") });
      expect(geometry.overflowX, name).toBe("auto");
      expect(geometry.pageOverflow, name + ": a pagina nao estoura").toBeLessThanOrEqual(1);
      expectContentDriven(geometry, name + "/" + width);
      expectContentSizedFrame(geometry, name + "/" + width);
      expectExternalFramesStable(geometry, name + "/" + width);
      expect(geometry.table, name + ": tabela ocupa a coluna de leitura").toBeGreaterThanOrEqual(geometry.wrapClient - 14);
      expect(geometry.frame, name + ": moldura acompanha a tabela").toBeLessThanOrEqual(geometry.table + 4);
      expect(reach.reachable, name + ": ultima coluna alcancavel").toBe(true);
    });
  }
}

test("texto ampliado a 200% mantem a distribuicao por conteudo", async ({ page }) => {
  for (const width of [360, 1280]) {
    await mount(page, { width, data: SLICE[0][1].data, zoom: 2 });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    const reach = await lastColumnReachable(scope);
    console.log("geometria rotulo-primeiro-200%/" + width + ": " + JSON.stringify({ columns: geometry.columns,
      floor: geometry.floor, broken: geometry.broken, minContentSum: geometry.minContentSum, table: geometry.table,
      wrap: [geometry.wrapClient, geometry.wrapScroll], pageOverflow: geometry.pageOverflow }) + " alcance: " + JSON.stringify(reach));
    await page.screenshot({ path: path.join(PROOF_DIR, "rotulo-primeiro-200%-" + width + "-inicio.png") });
    expect(geometry.pageOverflow, "200%/" + width + ": a pagina nao estoura").toBeLessThanOrEqual(1);
    expectContentDriven(geometry, "200%/" + width);
    expectContentSizedFrame(geometry, "200%/" + width);
    expect(reach.reachable, "200%/" + width + ": ultima coluna alcancavel").toBe(true);
  }
});

test("tabela larga de 8 colunas mantem o piso das colunas e a rolagem propria", async ({ page }) => {
  for (const width of [360, 1280]) {
    await mount(page, { width, data: WIDE8 });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    const reach = await lastColumnReachable(scope);
    console.log("geometria larga8/" + width + ": " + JSON.stringify(geometry.columns.map(column => column.width)) + " alcance: " + JSON.stringify(reach));
    if (width === 360) await page.screenshot({ path: path.join(PROOF_DIR, "larga8-360.png") });
    expect(geometry.pageOverflow, "larga8/" + width).toBeLessThanOrEqual(1);
    expect(geometry.wrapScroll, "larga8/" + width).toBeGreaterThan(geometry.wrapClient + 1);
    expect(geometry.columns.length, "larga8/" + width).toBe(8);
    for (const [index, column] of geometry.columns.entries()) {
      expect(column.width, "larga8/" + width + ": coluna " + (index + 1)).toBeGreaterThanOrEqual(geometry.floor - 1);
    }
    expect(reach.reachable, "larga8/" + width + ": ultima coluna alcancavel").toBe(true);
  }
});

test("celulas com contrato proprio de largura seguem com o piso", async ({ page }) => {
  // Contrato de CSS: no recorte que segue o conteudo o piso nao se aplica; as
  // celulas que declaram a propria largura (sem quebra ou numerico) o mantem, em
  // qualquer tabela.
  await mount(page, { width: 360, data: SLICE[0][1].data });
  const slice = await page.locator(".card-sheet-content .runtime-table tbody tr:first-child")
    .evaluate(row => [...row.children].map(cell => {
      const values = {};
      for (const label of ["is-nowrap", "is-align-numeric"]) {
        cell.classList.add(label);
        values[label] = getComputedStyle(cell).minWidth;
        cell.classList.remove(label);
      }
      values.content = getComputedStyle(cell).minWidth;
      return values;
    }));
  console.log("contrato no recorte de ate tres colunas: " + JSON.stringify(slice));
  for (const values of slice) {
    expect(values.content).toBe("0px");
    expect(values["is-nowrap"]).toBe("88px");
    expect(values["is-align-numeric"]).toBe("88px");
  }
  await mount(page, { width: 360, data: WIDE8 });
  const wide = await page.locator(".card-sheet-content .runtime-table tbody tr:first-child")
    .evaluate(row => [...row.children].map(cell => getComputedStyle(cell).minWidth));
  console.log("contrato na tabela larga: " + JSON.stringify(wide));
  for (const value of wide) expect(value).toBe("88px");
});