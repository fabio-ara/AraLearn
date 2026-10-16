import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Prova focal da issue #470: a largura das colunas numa tabela que cabe na coluna
// de leitura segue o conteudo real. As fixtures sao sinteticas e genericas, com
// enderecos da faixa de documentacao (RFC 5737). O rotulo curto aparece na
// primeira, na ultima e na coluna do meio, porque nao existe posicao fixa de
// rotulo no contrato do pacote; ha ainda a tabela desigual, a de duas colunas, a
// que leva codigo em linha com um endereco e uma URL longa, e a tabela larga.
//
// A prova mede, por coluna, a maior palavra fora do codigo em linha, o pior numero
// de caracteres por linha e a geometria externa; e mede, por celula, se alguma
// palavra foi partida entre duas linhas. Julga o que a mudanca nao pode alterar:
// a palavra inteira caber na coluna, a pagina nao estourar, a moldura ocupar a
// coluna de leitura quando o conteudo cabe, os controles do leitor seguirem
// 44x44, o piso permanecer nas celulas com contrato proprio de largura e a tabela
// larga conservar o piso e a rolagem propria.

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

// Codigo em linha com endereco de documentacao e uma URL longa: o token pode
// quebrar em qualquer ponto e nao deve alargar a tabela nem espremer a prosa.
const CODE_INLINE = [
  ["C1", "Conferir o host", "O host `198.51.100.24/24` responde; o token `https://exemplo.invalid/relatorio/198.51.100.24/24/lote/leitura` segue registrado"],
  ["C2", "Registrar o horario", "Cada leitura recebe horario e `198.51.100.24/24` confirma o caminho ativo"],
  ["C3", "Anotar o endereco", "`198.51.100.7` responde ao teste; sem outro caminho ativo no momento"],
  ["C4", "Comparar leituras", "O desvio entre as leituras fica dentro da faixa aceita para o lote"],
  ["C5", "Descartar registro", "Apagar o registro parcial e repetir a leitura com `198.51.100.24/24`"],
  ["C6", "Retomar leitura", "Repetir a primeira leitura e conferir se o valor se mantem estavel"]
];

const WIDE8 = {
  columns: Array.from({ length: 8 }, (_, index) => "Coluna " + (index + 1)),
  rows: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, column) => "Valor " + (row + 1) + "." + (column + 1)))
};

// "cabe" marca os casos cujo conteudo caberia na coluna de leitura quebrando so
// nos limites de palavra; nos demais o token de largura real exige a rolagem da
// propria moldura, que precisa ficar contida e alcancar a ultima coluna.
const SLICE = [
  ["rotulo-primeiro", { cuts: false, data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: ROWS } }],
  ["rotulo-ultimo", { cuts: false, data: { title: "Rotina de leitura", columns: ["Verificacao", "Etapa", "Item"], rows: ROWS.map((row) => [row[2], row[1], row[0]]) } }],
  ["rotulo-meio", { cuts: false, data: { title: "Rotina de leitura", columns: ["Verificacao", "Item", "Etapa"], rows: ROWS.map((row) => [row[2], row[0], row[1]]) } }],
  ["prosa-desigual", { cuts: true, data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: UNEVEN } }],
  ["duas-colunas", { cuts: true, data: { title: "Integrar para aprender", columns: ["Relacao", "Pergunta"], rows: TWO_COLUMNS } }],
  ["codigo-em-linha", { cuts: true, data: { title: "Rotina de leitura", columns: ["Item", "Etapa", "Verificacao"], rows: CODE_INLINE } }]
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
    const textTarget = (cell) => cell.querySelector("p, li") || cell.querySelector(".runtime-table-cell-content") || cell;
    // Maior palavra do texto que nao esta em codigo em linha: o token de codigo
    // tem contrato proprio e pode quebrar em qualquer ponto.
    const longestWord = (cell) => {
      const target = textTarget(cell);
      const clone = target.cloneNode(true);
      for (const code of clone.querySelectorAll("code")) code.remove();
      const style = getComputedStyle(target);
      const probe = document.createElement("span");
      probe.setAttribute("style", "position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden");
      for (const name of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariantCaps", "letterSpacing", "wordSpacing"]) probe.style[name] = style[name];
      cell.appendChild(probe);
      let longest = 0;
      for (const word of clone.textContent.trim().split(/\s+/).filter(Boolean)) {
        probe.textContent = word;
        longest = Math.max(longest, probe.getBoundingClientRect().width);
      }
      probe.remove();
      return round(longest);
    };
    // Quebra dentro de palavra: dois caracteres vizinhos sem espaco entre eles em
    // linhas diferentes. Texto em codigo em linha fica fora do contrato.
    const brokenWords = (cell) => {
      const target = textTarget(cell);
      const range = document.createRange();
      const found = [];
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
              if (/\s/.test(text[index - 1]) || /\s/.test(text[index])) continue;
              if (tops[index] !== tops[index - 1]) found.push(text.slice(Math.max(0, index - 12), index + 12));
            }
          } else if (child.nodeType === 1) {
            walk(child, inCode || child.tagName === "CODE");
          }
        }
      };
      walk(target, false);
      return found;
    };
    const cellsInfo = [];
    const rows = [...table.querySelectorAll("tbody tr")];
    rows.forEach((row) => {
      [...row.children].forEach((cell, column) => {
        const target = textTarget(cell);
        const range = document.createRange();
        range.selectNodeContents(target);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
        const lines = new Set(rects.map(rect => Math.round(rect.top))).size;
        const text = target.textContent.trim();
        cellsInfo.push({ column, longestWord: longestWord(cell), broken: brokenWords(cell),
          minimumCharsPerLine: lines ? round(text.length / lines) : 0 });
      });
    });
    const columns = headers.map((header, index) => {
      const own = cellsInfo.filter(cell => cell.column === index);
      return { width: round(header.getBoundingClientRect().width),
        longestWord: round(Math.max(longestWord(header), ...own.map(cell => cell.longestWord))),
        minimumCharsPerLine: Math.min(...own.map(cell => cell.minimumCharsPerLine)) };
    });
    const box = node.getBoundingClientRect();
    return { columns, floor: round(parseFloat(getComputedStyle(document.documentElement).fontSize) * floorRem),
      broken: cellsInfo.flatMap(cell => cell.broken), brokenCells: cellsInfo.filter(cell => cell.broken.length).length,
      padding: cellPadding, table: Math.round(table.getBoundingClientRect().width),
      frame: Math.round(node.querySelector(".runtime-table-frame").getBoundingClientRect().width),
      wrapClient: node.clientWidth, wrapScroll: node.scrollWidth, overflowX: getComputedStyle(node).overflowX,
      pageOverflow: document.documentElement.scrollWidth - innerWidth, wrapLeft: Math.round(box.left) };
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

async function controlBoxes(page) {
  return page.locator(".icon-ghost").evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().width > 0)
    .map(node => { const rect = node.getBoundingClientRect(); return { label: node.getAttribute("aria-label"),
      width: Math.round(rect.width), height: Math.round(rect.height) }; }));
}

function expectContentDriven(geometry, name) {
  // Cada coluna comporta a propria palavra mais longa: sem folga reservada e sem
  // palavra partida entre linhas.
  for (const [index, column] of geometry.columns.entries()) {
    expect(column.width + 2, name + ": coluna " + (index + 1) + " comporta a maior palavra").toBeGreaterThanOrEqual(column.longestWord + CELL_PADDING);
  }
  expect(geometry.broken, name + ": nenhuma palavra partida").toEqual([]);
}

async function expectReaderIntact(page, name) {
  const controls = await controlBoxes(page);
  for (const control of controls) {
    expect(control.width, "controle " + control.label + " em " + name).toBe(44);
    expect(control.height, "controle " + control.label + " em " + name).toBe(44);
  }
}

for (const [name, { cuts, data }] of SLICE) {
  for (const width of [360, 1280]) {
    test("tabela de rotulo curto " + name + " respeita o conteudo em " + width + "px", async ({ page }) => {
      await mount(page, { width, data });
      const scope = page.locator(".card-sheet-content");
      const geometry = await readGeometry(scope);
      const reach = await lastColumnReachable(scope);
      console.log("geometria " + name + "/" + width + ": " + JSON.stringify({ columns: geometry.columns,
        broken: geometry.broken, table: geometry.table, frame: geometry.frame, wrap: [geometry.wrapClient, geometry.wrapScroll],
        pageOverflow: geometry.pageOverflow }) + " alcance: " + JSON.stringify(reach));
      await page.screenshot({ path: path.join(PROOF_DIR, name + "-" + width + ".png") });
      expect(geometry.overflowX, name).toBe("auto");
      expect(geometry.pageOverflow, name + ": a pagina nao estoura").toBeLessThanOrEqual(1);
      expectContentDriven(geometry, name + "/" + width);
      await expectReaderIntact(page, name + "/" + width);
      // A tabela ocupa a coluna de leitura; se o conteudo pedir mais do que cabe,
      // a moldura cresce dentro do wrapper e a ultima coluna continua alcancavel.
      expect(geometry.table, name + ": tabela ocupa a coluna de leitura").toBeGreaterThanOrEqual(geometry.wrapClient - 12);
      if (cuts) {
        expect(geometry.wrapScroll - geometry.wrapClient, name + ": sem rolagem artificial").toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.table - (geometry.wrapClient - 12)), name).toBeLessThanOrEqual(2);
        expect(Math.abs(geometry.frame - (geometry.wrapClient - 10)), name).toBeLessThanOrEqual(2);
      } else {
        expect(geometry.wrapScroll, name + ": rolagem contida no wrapper").toBeGreaterThanOrEqual(geometry.wrapClient - 1);
        expect(reach.scroll, name + ": rolagem limitada ao que o conteudo pede").toBeLessThanOrEqual(24);
        expect(reach.reachable, name + ": ultima coluna alcancavel").toBe(true);
        expect(Math.abs(geometry.table - (geometry.wrapClient - 12)) - reach.scroll, name).toBeLessThanOrEqual(3);
      }
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
      floor: geometry.floor, broken: geometry.broken, table: geometry.table, wrap: [geometry.wrapClient, geometry.wrapScroll],
      pageOverflow: geometry.pageOverflow }) + " alcance: " + JSON.stringify(reach));
    await page.screenshot({ path: path.join(PROOF_DIR, "rotulo-primeiro-200%-" + width + ".png") });
    expect(geometry.pageOverflow, "200%/" + width + ": a pagina nao estoura").toBeLessThanOrEqual(1);
    expectContentDriven(geometry, "200%/" + width);
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
      for (const name of ["is-nowrap", "is-align-numeric"]) {
        cell.classList.add(name);
        values[name] = getComputedStyle(cell).minWidth;
        cell.classList.remove(name);
      }
      values.content = getComputedStyle(cell).minWidth;
      values.hyphens = getComputedStyle(cell).hyphens;
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