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
const E2E_BASE_URL = `http://127.0.0.1:${Number.parseInt(process.env.ARALEARN_E2E_PORT || "4182", 10)}`;

async function mount(page, { width, data, zoom, clearanceBaseline = false, unit = "theory", practiceKind = "choice",
  practiceFeedback = null }) {
  await page.setViewportSize({ width, height: 740 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route("**/tests/" + file, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL("../" + file, import.meta.url), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ data, zoom, unit, practiceKind, practiceFeedback }) => {
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    // 200% de texto: unidade relativa do leitor, nao zoom de pagina.
    if (zoom) document.documentElement.style.fontSize = Math.round(16 * zoom) + "px";
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), { unit, practiceKind, practiceFeedback,
      resourceContent: [{ id: "representation", package: "aralearn.resource.table", version: "1.0.0", data }] });
  }, { data, zoom, unit, practiceKind, practiceFeedback });
  await page.evaluate(({ clearanceBaseline }) => {
    if (!document.querySelector("#aralearn-editor-root .microsequence-workbench-screen")) {
      throw new Error("A fixture de estudo não montou o escopo real da tela de estudo.");
    }
    if (clearanceBaseline) {
      const style = document.createElement("style");
      style.dataset.clearanceBaseline = "true";
      style.textContent = `
        .microsequence-workbench-screen .runtime-card-rendered-content {
          padding-right: 0;
          margin-right: 0;
        }
        .microsequence-workbench-screen .card-sheet-content {
          width: 100%;
          max-width: 100%;
          padding-right: 0;
        }
        .microsequence-workbench-screen .study-continue-popup-body {
          margin-right: 0;
          padding-right: 0;
        }
      `;
      document.head.append(style);
    }
  }, { clearanceBaseline });
  await page.waitForTimeout(120);
}

async function readClearanceGeometry(page) {
  return page.evaluate(() => {
    const box = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10,
        width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
    };
    const reading = document.querySelector(".card-sheet-content");
    const readingStyle = reading && getComputedStyle(reading);
    const readingRect = reading?.getBoundingClientRect();
    const readingContentWidth = reading && readingRect
      ? Math.round((readingRect.width - parseFloat(readingStyle.borderLeftWidth) - parseFloat(readingStyle.borderRightWidth) -
        parseFloat(readingStyle.paddingLeft) - parseFloat(readingStyle.paddingRight)) * 10) / 10
      : null;
    const footer = document.querySelector(".study-reader-footer");
    const iconButtons = [...(footer?.querySelectorAll(".icon-ghost, .open-mini") ?? [])].map(button => ({
      label: button.getAttribute("aria-label") || button.title || "",
      ...box(button)
    }));
    const oldScrollTop = reading?.scrollTop ?? 0;
    if (reading) reading.scrollTop = Math.min(32, Math.max(0, reading.scrollHeight - reading.clientHeight));
    const nativeScroll = reading ? {
      overflowY: readingStyle.overflowY,
      pseudoDisplay: getComputedStyle(reading, "::-webkit-scrollbar").display,
      pseudoWidth: getComputedStyle(reading, "::-webkit-scrollbar").width,
      clientWidth: reading.clientWidth,
      scrollWidth: reading.scrollWidth,
      clientHeight: reading.clientHeight,
      scrollHeight: reading.scrollHeight,
      moved: reading.scrollHeight <= reading.clientHeight || reading.scrollTop > oldScrollTop
    } : null;
    if (reading) reading.scrollTop = oldScrollTop;
    return {
      title: box(document.querySelector(".runtime-card-title")),
      stack: box(document.querySelector(".runtime-resource-stack")),
      sheet: box(document.querySelector(".runtime-card-sheet")),
      footer: box(footer),
      reading: { box: box(reading), contentWidth: readingContentWidth },
      clearanceStyle: reading ? { workbenchAncestor: Boolean(reading.closest(".microsequence-workbench-screen")),
        paddingRight: readingStyle.paddingRight, width: readingStyle.width,
        renderedPaddingRight: getComputedStyle(reading.parentElement).paddingRight,
        renderedMarginRight: getComputedStyle(reading.parentElement).marginRight } : null,
      iconButtons,
      nativeScroll
    };
  });
}

async function readCommentClearanceGeometry(page) {
  return page.evaluate(() => {
    const box = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10,
        width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
    };
    const popup = document.querySelector(".study-continue-popup");
    const body = popup?.querySelector(".study-continue-popup-body");
    const style = body && getComputedStyle(body);
    const rect = body?.getBoundingClientRect();
    const contentWidth = body && rect ? Math.round((rect.width - parseFloat(style.borderLeftWidth) -
      parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * 10) / 10 : null;
    const contentRight = body && rect ? rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) : null;
    const children = [...(body?.children ?? [])];
    const childBoxes = children.map(box);
    const range = document.createRange();
    const textRights = children.flatMap(child => {
      range.selectNodeContents(child);
      return [...range.getClientRects()].filter(line => line.width > 0 && line.height > 0).map(line => line.right);
    });
    const continueButton = popup?.querySelector(".study-continue-popup-btn");
    const oldScrollTop = body?.scrollTop ?? 0;
    if (body) body.scrollTop = body.scrollHeight;
    const scroll = body ? {
      overflowY: style.overflowY,
      pseudoDisplay: getComputedStyle(body, "::-webkit-scrollbar").display,
      pseudoWidth: getComputedStyle(body, "::-webkit-scrollbar").width,
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      scrollTop: body.scrollTop,
      contentRight: Math.round(contentRight * 10) / 10,
      textRightMax: textRights.length ? Math.round(Math.max(...textRights) * 10) / 10 : null
    } : null;
    if (body) body.scrollTop = oldScrollTop;
    return { popup: box(popup), body: { box: box(body), contentWidth }, children: childBoxes,
      clearanceStyle: body ? { paddingRight: style.paddingRight, marginRight: style.marginRight } : null,
      continueButton: box(continueButton), scroll };
  });
}

async function showLongSuccessComment(page) {
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="restrito"]').click();
  await page.getByRole("button", { name: "Conferir resposta", exact: true }).click();
  await expect(page.locator(".study-continue-popup")).toBeVisible();
  await expect(page.locator(".card-answer-dock")).toContainText("Correto.");
  await expect(page.locator(".study-continue-popup-body .runtime-paragraph-block")).toHaveCount(3);
  await expect.poll(() => page.locator(".study-continue-popup-body").evaluate(body => body.scrollHeight > body.clientHeight))
    .toBe(true);
}

const LONG_SUCCESS_FEEDBACK = Array.from({ length: 3 }, (_, index) => ({
  id: "success-comment-" + (index + 1), package: "aralearn.resource.paragraph", version: "1.0.0",
  data: { text: ("Comentário após o acerto, trecho " + (index + 1) + ": texto de leitura para verificar a rolagem sem cobrir as palavras finais. ").repeat(14) }
}));

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
      // A caixa do token conserva a largura natural ate o limite de celula: e ela que
      // determina o que a coluna precisa, e nao os fragmentos entre delimitadores.
      const boxed = [...cell.querySelectorAll(".runtime-token")].map((box) => round(box.getBoundingClientRect().width));
      return round(Math.max(width, ...boxed));
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
    // Cada grupo tecnico (sequencia entre delimitadores de um endereco, mascara ou
    // caminho) precisa ficar inteiro em uma linha: a oportunidade de quebra so existe
    // no delimitador. Mede a linha real de cada caractere do conteudo.
    const tokenGroupSplits = (cell) => {
      const element = textTarget(cell);
      const range = document.createRange();
      const characters = [];
      const walk = (parent, inCode) => {
        for (const child of parent.childNodes) {
          if (child.nodeType === 3) {
            const value = child.nodeValue;
            for (let index = 0; index < value.length; index += 1) {
              range.setStart(child, index);
              range.setEnd(child, index + 1);
              characters.push({ character: value[index], top: Math.round(range.getBoundingClientRect().top), inCode });
            }
          } else if (child.nodeType === 1) {
            walk(child, inCode || child.tagName === "CODE");
          }
        }
      };
      walk(element, false);
      const flat = characters.map((entry) => entry.character).join("");
      const found = [];
      for (const match of flat.matchAll(/[0-9A-Za-z]+(?:[.:/][0-9A-Za-z]+)+/gu)) {
        if (characters.slice(match.index, match.index + match[0].length).some((entry) => entry.inCode)) continue;
        let cursor = match.index;
        for (const group of match[0].split(/([.:/])/u)) {
          const start = cursor;
          cursor += group.length;
          if (/^[.:/]$/u.test(group)) continue;
          const tops = new Set();
          for (let index = start; index < cursor; index += 1) tops.add(characters[index].top);
          if (tops.size > 1) found.push(group);
        }
      }
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
        cellsInfo.push({ column, minContent: minContent(cell), fillGap, broken: brokenWords(cell), text,
          tokenGroupSplits: tokenGroupSplits(cell), minimumCharsPerLine: lines ? round(text.length / lines) : 0 });
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
      const style = getComputedStyle(found);
      const contentWidth = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) -
        parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { x: round(rect.x), width: round(rect.width), height: round(rect.height),
        clientWidth: found.clientWidth, scrollWidth: found.scrollWidth, contentWidth: round(contentWidth),
        overflowY: style.overflowY, scrollHeight: found.scrollHeight };
    };
    const explanation = document.querySelector(".study-explanation-btn");
    const explanationRect = explanation?.getBoundingClientRect();
    const footer = document.querySelector(".study-reader-footer")?.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return { columns, floor: round(parseFloat(getComputedStyle(document.documentElement).fontSize) * floorRem),
      cells: cellsInfo, rem8: round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 8),
      tokenGroupSplits: cellsInfo.flatMap((cell) => cell.tokenGroupSplits),
      minContentSum: round(columns.reduce((total, column) => total + column.minContent + cellPadding, 0)),
      broken: cellsInfo.flatMap(cell => cell.broken), padding: cellPadding,
      table: Math.round(table.getBoundingClientRect().width),
      frame: Math.round(node.querySelector(".runtime-table-frame").getBoundingClientRect().width),
      wrapClient: node.clientWidth, wrapScroll: node.scrollWidth, overflowX: getComputedStyle(node).overflowX,
      pageOverflow: document.documentElement.scrollWidth - innerWidth, wrapLeft: Math.round(box.left),
      reading: external(".card-sheet-content"), sheet: external(".runtime-card-sheet"),
      title: external(".runtime-card-title"), stack: external(".runtime-resource-stack"),
      footer: external(".study-reader-footer"),
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
  // Nenhum grupo tecnico parte entre duas linhas: a quebra de endereco, mascara ou
  // caminho acontece somente no delimitador.
  expect(geometry.tokenGroupSplits, name + ": grupo tecnico inteiro na linha").toEqual([]);
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
  // O scrollport pode incluir o inset reservado ao thumb; o contrato da coluna
  // compara a caixa útil de texto, descontando bordas e padding.
  expect(Math.abs(geometry.sheet.width - geometry.reading.contentWidth - 22), name + ": moldura externa do card").toBeLessThanOrEqual(2);
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

for (const { width, touch, label } of [
  { width: 320, touch: true, label: "toque-320" },
  { width: 360, touch: true, label: "toque-360" },
  { width: 390, touch: true, label: "toque-390" },
  { width: 1280, touch: false, label: "desktop-1280" }
]) {
  test("folga da barra preserva a geometria A/B em " + label, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: E2E_BASE_URL,
      viewport: { width, height: 740 }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    try {
      const results = {};
      for (const clearanceBaseline of [true, false]) {
        const page = await context.newPage();
        await mount(page, { width, data: SLICE[0][1].data, clearanceBaseline });
        results[clearanceBaseline ? "base" : "candidato"] = await readClearanceGeometry(page);
        await page.close();
      }
      const { base, candidato } = results;
      for (const key of ["title", "stack", "sheet", "footer"]) {
        expect(candidato[key], label + ": caixa " + key + " não mudou").toEqual(base[key]);
      }
      expect(candidato.reading.box.x, label + ": posição horizontal da leitura não mudou")
        .toBe(base.reading.box.x);
      expect(candidato.reading.box.y, label + ": posição vertical da leitura não mudou")
        .toBe(base.reading.box.y);
      expect(candidato.reading.box.height, label + ": altura da leitura não mudou")
        .toBe(base.reading.box.height);
      expect(candidato.reading.contentWidth, label + ": largura útil da leitura não mudou")
        .toBe(base.reading.contentWidth);
      expect(base.clearanceStyle.paddingRight, label + ": base sem padding de clearance").toBe("0px");
      expect(base.clearanceStyle.renderedMarginRight, label + ": base sem compensação lateral").toBe("0px");
      expect(candidato.clearanceStyle.paddingRight, label + ": candidata aplica o clearance").toBe("6px");
      expect(candidato.clearanceStyle.renderedMarginRight, label + ": candidata compensa o inset")
        .toBe("-6px");
      expect(candidato.reading.box.width, label + ": somente a caixa do scroller ganha 6px")
        .toBe(base.reading.box.width + 6);
      expect(candidato.iconButtons, label + ": ícones mantêm posição e geometria")
        .toEqual(base.iconButtons);
      expect(candidato.iconButtons.length, label + ": fixture inclui os seis controles do rodapé").toBe(6);
      for (const [index, button] of candidato.iconButtons.entries()) {
        expect(button.width, label + ": ícone " + (index + 1) + " tem alvo de 44px").toBe(44);
        expect(button.height, label + ": ícone " + (index + 1) + " tem alvo de 44px").toBe(44);
      }
      for (const measurement of [base, candidato]) {
        expect(measurement.nativeScroll.overflowY, label + ": rolagem nativa vertical ativa").toBe("auto");
        expect(measurement.nativeScroll.pseudoDisplay, label + ": barra nativa não está escondida").not.toBe("none");
        expect(measurement.nativeScroll.pseudoWidth, label + ": barra nativa conserva largura")
          .not.toBe("0px");
        expect(measurement.nativeScroll.scrollHeight, label + ": conteúdo continua rolável")
          .toBeGreaterThan(measurement.nativeScroll.clientHeight);
        expect(measurement.nativeScroll.moved, label + ": rolagem vertical responde").toBe(true);
      }
      console.log("folga A/B " + label + ": " + JSON.stringify(results));
    } finally {
      await context.close();
    }
  });
}

for (const { width, touch, label } of [
  { width: 320, touch: true, label: "toque-320" },
  { width: 360, touch: true, label: "toque-360" },
  { width: 390, touch: true, label: "toque-390" },
  { width: 1280, touch: false, label: "desktop-1280" }
]) {
  test("folga da barra preserva comentário após acerto em A/B em " + label, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: E2E_BASE_URL,
      viewport: { width, height: 740 }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    try {
      const results = {};
      for (const clearanceBaseline of [true, false]) {
        const page = await context.newPage();
        await mount(page, { width, data: SLICE[0][1].data, clearanceBaseline,
          unit: "practice", practiceKind: "choice-return", practiceFeedback: LONG_SUCCESS_FEEDBACK });
        await showLongSuccessComment(page);
        results[clearanceBaseline ? "base" : "candidato"] = await readCommentClearanceGeometry(page);
        await page.close();
      }
      const { base, candidato } = results;
      expect(candidato.popup, label + ": painel de comentário preservado").toEqual(base.popup);
      expect(candidato.children, label + ": geometria dos parágrafos preservada").toEqual(base.children);
      expect(candidato.continueButton, label + ": controle de continuação preservado").toEqual(base.continueButton);
      expect(candidato.body.contentWidth, label + ": largura útil do comentário preservada")
        .toBe(base.body.contentWidth);
      expect(candidato.body.box.x, label + ": posição do corpo do comentário preservada").toBe(base.body.box.x);
      expect(candidato.body.box.height, label + ": altura do corpo do comentário preservada")
        .toBe(base.body.box.height);
      expect(candidato.body.box.width, label + ": scroller do comentário ganha só 6px")
        .toBe(base.body.box.width + 6);
      expect(base.clearanceStyle, label + ": base sem compensação do comentário")
        .toEqual({ paddingRight: "0px", marginRight: "0px" });
      expect(candidato.clearanceStyle, label + ": candidata reserva 6px e compensa o inset")
        .toEqual({ paddingRight: "6px", marginRight: "-6px" });
      expect(candidato.continueButton.width, label + ": alvo de continuação mantém 44px").toBe(44);
      expect(candidato.continueButton.height, label + ": alvo de continuação mantém 44px").toBe(44);
      expect(candidato.scroll.contentRight, label + ": área legível termina na borda anterior do scroller")
        .toBe(base.body.box.x + base.body.box.width);
      for (const measurement of [base, candidato]) {
        expect(measurement.scroll.overflowY, label + ": comentário mantém rolagem vertical nativa").toBe("auto");
        expect(measurement.scroll.pseudoDisplay, label + ": barra nativa continua visível")
          .not.toBe("none");
        expect(measurement.scroll.pseudoWidth, label + ": barra nativa não é ocultada")
          .not.toBe("0px");
        expect(measurement.scroll.scrollHeight, label + ": comentário longo excede o painel")
          .toBeGreaterThan(measurement.scroll.clientHeight);
        expect(measurement.scroll.scrollTop, label + ": comentário pode rolar até o fim")
          .toBe(measurement.scroll.scrollHeight - measurement.scroll.clientHeight);
        expect(measurement.scroll.textRightMax, label + ": texto permanece dentro da área útil")
          .toBeLessThanOrEqual(measurement.scroll.contentRight + 1);
      }
      console.log("comentário de acerto A/B " + label + ": " + JSON.stringify(results));
    } finally {
      await context.close();
    }
  });
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

// Defeito A14/U4 — tabela larga de quatro colunas com enderecos e tokens tecnicos.
// O piso de 5,5rem da 88 px a cada coluna e o paragrafo da celula quebra em
// qualquer caractere: 192.168.30.1 saia como 192.168.3 / 0.1 e 255.255.255.0 como
// 255.255.2 / 55.0 na captura nativa 360x740. A tabela larga conserva o piso e a
// rolagem propria; a celula passa a comportar o endereco inteiro ate o limite de
// celula e, acima dele, o token quebra dentro da celula — a mesma politica das
// tabelas de ate tres colunas. As fixtures usam as faixas de documentacao (RFC 5737
// e RFC 3849) e nao dependem do curso nem de um endereco real.
const ADDRESS_PROOF_DIR = path.resolve(
  process.env.ARALEARN_TABLE_ADDRESS_PROOF_DIR || "test-results/table-address-reading");

const ADDRESS4 = Object.freeze({
  title: "Enderecamento do lote",
  columns: ["Interface", "IPv4", "Mascara", "Gateway"],
  rows: [
    ["R1 G0/0", "198.51.100.1", "255.255.255.0", "Nao se aplica"],
    ["R1 G0/1", "198.51.100.9", "255.255.255.0", "198.51.100.1"],
    ["PC-A1", "198.51.100.11", "255.255.255.0", "198.51.100.1"],
    ["PC-A2", "198.51.100.12", "255.255.255.128", "198.51.100.1"],
    ["Servidor", "198.51.100.20", "255.255.255.0", "198.51.100.1"],
    ["Impressora", "198.51.100.30", "255.255.255.0", "198.51.100.1"]
  ]
});

// Endereco IPv6 completo: excede o limite de celula e por isso quebra dentro da
// celula, como nas tabelas de ate tres colunas; a coluna nao pode crescer com o
// tamanho do token.
const ADDRESS_IPV6_4 = Object.freeze({
  title: "Enderecamento IPv6 do lote",
  columns: ["Interface", "Endereco", "Prefixo", "Observacao"],
  rows: [
    ["R1 G0/0", "2001:db8:85a3:0000:0000:8a2e:0370:7334", "/64", "sem link local"],
    ["R1 G0/1", "2001:db8:85a3:0000:0000:8a2e:0370:7335", "/64", "sem link local"],
    ["PC-A1", "2001:db8:85a3:0000:0000:8a2e:0370:7336", "/64", "endereco do lote"],
    ["PC-A2", "2001:db8:85a3:0000:0000:8a2e:0370:7337", "/64", "endereco do lote"],
    ["Servidor", "2001:db8:85a3:0000:0000:8a2e:0370:7338", "/64", "endereco do lote"],
    ["Impressora", "2001:db8:85a3:0000:0000:8a2e:0370:7339", "/64", "endereco do lote"]
  ]
});

// Endereco dentro de uma frase e prosa com palavra longa: a coluna precisa
// comportar a palavra, sem partir nem o endereco nem a palavra.
const ADDRESS_MIXED_4 = Object.freeze({
  title: "Diagnostico do lote",
  columns: ["Interface", "Teste", "Resultado", "Observacao"],
  rows: [
    ["R1 G0/0", "ping 198.51.100.1", "Responde", "O gateway do lote responde ao teste feito na interface do roteador"],
    ["R1 G0/1", "ping 198.51.100.1", "Responde", "A rota padrao aponta para o gateway e o teste confirma o caminho ativo"],
    ["PC-A1", "ping 198.51.100.9", "Responde", "O host responde e o endereco 198.51.100.9 permanece durante a verificacao"],
    ["PC-A2", "ping 198.51.100.9", "Sem resposta", "O host nao responde enquanto a interface fica desativada no switch"],
    ["Servidor", "ping 198.51.100.20", "Responde", "O servico do lote responde no endereco combinado para a verificacao"],
    ["Impressora", "ping 198.51.100.30", "Responde", "O equipamento do lote responde e o endereco confere com o registro"]
  ]
});

// A tabela larga mantem o piso de cada coluna, comporta o proprio conteudo ate o
// limite de celula, nao parte o token dentro da coluna, rola no proprio controle e
// nao move a geometria externa.
function expectWideAddressReading(geometry, name) {
  const limit = cellLimit(geometry);
  expect(geometry.overflowX, name).toBe("auto");
  expect(geometry.pageOverflow, name + ": a pagina nao estoura").toBeLessThanOrEqual(1);
  expect(geometry.broken, name + ": token inteiro na celula").toEqual([]);
  for (const [index, column] of geometry.columns.entries()) {
    expect(column.width, name + ": coluna " + (index + 1) + " conserva o piso da tabela larga")
      .toBeGreaterThanOrEqual(geometry.floor - 1);
    expect(column.width - CELL_PADDING + 4, name + ": coluna " + (index + 1) + " comporta o proprio conteudo")
      .toBeGreaterThanOrEqual(Math.min(column.minContent, limit) - 4);
  }
  expect(geometry.wrapScroll, name + ": o conteudo excede a coluna de leitura")
    .toBeGreaterThan(geometry.wrapClient + 1);
}

for (const [name, data] of [["enderecos-ipv4", ADDRESS4], ["enderecos-mistos", ADDRESS_MIXED_4]]) {
  for (const width of [360, 390]) {
    test("tabela larga de " + name + " conserva o endereco em " + width + "px", async ({ page }) => {
      await mount(page, { width, data });
      const scope = page.locator(".card-sheet-content");
      const geometry = await readGeometry(scope);
      await page.screenshot({ path: path.join(ADDRESS_PROOF_DIR, name + "-" + width + "-inicio.png") });
      const reach = await lastColumnReachable(scope);
      console.log("enderecos " + name + "/" + width + ": " + JSON.stringify({ columns: geometry.columns,
        broken: geometry.broken, table: geometry.table, frame: geometry.frame, floor: geometry.floor,
        wrap: [geometry.wrapClient, geometry.wrapScroll], pageOverflow: geometry.pageOverflow }) +
        " alcance: " + JSON.stringify(reach));
      if (reach.scroll > 0) await page.screenshot({ path: path.join(ADDRESS_PROOF_DIR, name + "-" + width + "-fim.png") });
      expectWideAddressReading(geometry, name + "/" + width);
      expectExternalFramesStable(geometry, name + "/" + width);
      expect(reach.reachable, name + "/" + width + ": ultima coluna alcancavel").toBe(true);
    });
  }
}

test("tabela larga de endereco IPv6 limita a coluna do token sem estourar a pagina", async ({ page }) => {
  for (const width of [360, 390]) {
    await mount(page, { width, data: ADDRESS_IPV6_4 });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    await page.screenshot({ path: path.join(ADDRESS_PROOF_DIR, "enderecos-ipv6-" + width + "-inicio.png") });
    const reach = await lastColumnReachable(scope);
    const limit = cellLimit(geometry);
    const column = geometry.columns[1];
    const address = ADDRESS_IPV6_4.rows[0][1];
    console.log("enderecos ipv6/" + width + ": " + JSON.stringify({ columns: geometry.columns,
      limit: limit, gruposPartidos: geometry.tokenGroupSplits, broken: geometry.broken,
      table: geometry.table, wrap: [geometry.wrapClient, geometry.wrapScroll],
      pageOverflow: geometry.pageOverflow }) + " alcance: " + JSON.stringify(reach));
    if (reach.scroll > 0) await page.screenshot({ path: path.join(ADDRESS_PROOF_DIR, "enderecos-ipv6-" + width + "-fim.png") });
    expect(geometry.overflowX, "ipv6/" + width).toBe("auto");
    expect(geometry.pageOverflow, "ipv6/" + width + ": a pagina nao estoura").toBeLessThanOrEqual(1);
    // O endereco nao parte hexteto e chega inteiro ao conteudo copiavel.
    expect(geometry.tokenGroupSplits, "ipv6/" + width + ": nenhum hexteto partido").toEqual([]);
    expect(geometry.cells.map((cell) => cell.text), "ipv6/" + width + ": texto e copia preservados").toContain(address);
    expect(column.width - CELL_PADDING, "ipv6/" + width + ": coluna do token limitada pela celula")
      .toBeLessThanOrEqual(limit + 4);
    expect(column.width, "ipv6/" + width + ": coluna do token conserva o piso").toBeGreaterThanOrEqual(geometry.floor - 1);
    expect(geometry.wrapScroll, "ipv6/" + width + ": a rolagem fica no controle").toBeGreaterThan(geometry.wrapClient + 1);
    expect(reach.reachable, "ipv6/" + width + ": ultima coluna alcancavel").toBe(true);
    expectExternalFramesStable(geometry, "ipv6/" + width);
  }
});

// A15/U7 — matriz de cinco colunas com comando, endereco e prosa: a mesma protecao do
// token vale aqui. O comando com IP nao parte o octeto, a palavra longa nao e
// hifenizada e a coluna segue o conteudo, com a moldura rolando no proprio controle.
const COMMAND_5COL = Object.freeze({
  title: "Matriz de teste do lote",
  columns: ["ID", "Origem → destino", "Teste", "Esperado", "Observado"],
  rows: [
    ["T1", "R1 G0/0 → PC-A1", "ping 198.51.100.11", "Responde", "O host do lote responde ao teste"],
    ["T2", "PC-A1 → R1 G0/0", "ping 198.51.100.1", "Responde", "O gateway responde ao teste do lote"],
    ["T3", "R1 G0/0 → servidor", "ping 198.51.100.20", "Disponível", "O serviço do lote responde ao teste"],
    ["T4", "PC-A2 → servidor", "ping 198.51.100.20", "Sem resposta", "O host não responde enquanto fica desativado"],
    ["T5", "R1 G0/1 → impressora", "ping 198.51.100.30", "Disponível", "O equipamento responde e confere com o registro"],
    ["T6", "PC-A1 → impressora", "preencher o endereço", "198.51.100.30", "O endereço confere com o registro do lote"]
  ]
});

test("matriz de cinco colunas conserva comando e endereco em 360 e 390 px", async ({ page }) => {
  for (const width of [360, 390]) {
    await mount(page, { width, data: COMMAND_5COL });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    await page.screenshot({ path: path.join(ADDRESS_PROOF_DIR, "matriz-5col-" + width + "-inicio.png") });
    const reach = await lastColumnReachable(scope);
    const texts = geometry.cells.map((cell) => cell.text);
    console.log("matriz 5 colunas/" + width + ": " + JSON.stringify({ columns: geometry.columns,
      gruposPartidos: geometry.tokenGroupSplits, broken: geometry.broken, table: geometry.table,
      wrap: [geometry.wrapClient, geometry.wrapScroll], pageOverflow: geometry.pageOverflow }) +
      " alcance: " + JSON.stringify(reach));
    if (reach.scroll > 0) await page.screenshot({ path: path.join(ADDRESS_PROOF_DIR, "matriz-5col-" + width + "-fim.png") });
    expectWideAddressReading(geometry, "matriz-5col/" + width);
    expect(geometry.tokenGroupSplits, "matriz-5col/" + width + ": nenhum octeto partido").toEqual([]);
    expect(texts, "matriz-5col/" + width + ": texto e copia preservados").toContain("ping 198.51.100.11");
    expect(texts, "matriz-5col/" + width + ": palavra longa inteira").toContain("Disponível");
    expect(texts, "matriz-5col/" + width + ": comando preservado").toContain("preencher o endereço");
    expectExternalFramesStable(geometry, "matriz-5col/" + width);
    expect(reach.reachable, "matriz-5col/" + width + ": ultima coluna alcancavel").toBe(true);
  }
});
