import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Prova focal da issue #470: distribuicao de largura nas tabelas com rotulos
// curtos. Cada caso captura a imagem antes de julgar, para que a mesma prova
// produza pixels e medidas iguais antes e depois da correcao. A classificacao
// fits/scrolls dos consumidores compartilhados segue em
// runtime-table-frame-responsive.spec.js.

const U5_ROWS = [
  ["W1", "SSID visivel e perfil correspondente", "Cliente encontra LAB-RE-DES-A; conferir AP/BSSID previsto, se exibido"],
  ["W2", "Conexao com credencial correta", "Estado confirma conexao/autenticacao; conferir cliente no estado ou registro do AP quando disponivel"],
  ["W3", "IPv4 do CLIENTE-W", "192.168.5.0.20/24 aplicado a interface sem fio; sem outro caminho ativo"],
  ["W4", "CLIENTE-W -> HOST-C", "ping 192.168.5.0.10 recebe resposta; comparar com teste cabeado positivo"],
  ["W5", "Credencial incorreta em perfil limpo", "Apagar/esquecer perfil salvo, usar Rede-Estudo-2026; nao obter conexao protegida utilizavel"],
  ["W6", "Retomar", "Esquecer perfil incorreto e repetir a associacao"]
];

const U5 = { title: "Acesso WLAN", columns: ["Teste", "Acao", "Resultado esperado"], rows: U5_ROWS };

const WIDE8 = {
  columns: Array.from({ length: 8 }, (_, index) => "Coluna " + (index + 1)),
  rows: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, column) => "Valor " + (row + 1) + "." + (column + 1)))
};

const FLOOR_REM = 5.5;
const PROOF_DIR = path.resolve(process.env.ARALEARN_TABLE_PROOF_DIR || "test-results/table-reading-470");

async function mount(page, { width, data, scale = 100 }) {
  await page.setViewportSize({ width, height: 740 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route("**/tests/" + file, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL("../" + file, import.meta.url), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ data, scale }) => {
    if (scale !== 100) document.documentElement.style.fontSize = scale + "%";
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), { unit: "theory",
      resourceContent: [{ id: "representation", package: "aralearn.resource.table", version: "1.0.0", data }] });
  }, { data, scale });
}

async function openExplanation(page) {
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  await expect(page.locator(".study-explanation-body .runtime-table-wrap")).toHaveCount(1);
}

// Le geometria real: largura de cada coluna, moldura/wrapper, rolagem propria,
// transbordo da pagina, piso vigente (5.5rem no rem corrente) e o pior numero de
// caracteres por linha de cada coluna.
function readGeometry(scope) {
  return scope.locator(".runtime-table-wrap").evaluate((node, floorRem) => {
    const table = node.querySelector("table.runtime-table");
    const columns = [...table.querySelectorAll("thead th")].map(th => Math.round(th.getBoundingClientRect().width * 10) / 10);
    const minChars = columns.map(() => Infinity);
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, index) => {
        const target = cell.querySelector("p, li") || cell;
        const range = document.createRange(); range.selectNodeContents(target);
        const text = target.textContent.trim();
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

async function lastColumnReachable(scope) {
  return scope.locator(".runtime-table-wrap").evaluate(node => {
    node.scrollLeft = node.scrollWidth;
    const last = node.querySelector("tr:last-child > :last-child").getBoundingClientRect();
    return { reachable: last.right <= node.getBoundingClientRect().right + 1, scroll: node.scrollWidth - node.clientWidth };
  });
}

// Invariantes comuns ao rotulo curto e as colunas de dados, proporcionais ao rem.
function expectDistribution(geometry, label) {
  expect(geometry.overflowX, label + ": rolagem propria disponivel").toBe("auto");
  expect(geometry.pageOverflow, label + ": a pagina nao estoura").toBeLessThanOrEqual(1);
  expect(geometry.columns[0], label + ": coluna de rotulo abaixo do piso").toBeLessThan(geometry.floor);
  for (const index of [1, 2]) {
    expect(geometry.columns[index], label + ": coluna de dados preserva o piso").toBeGreaterThanOrEqual(geometry.floor - 1);
  }
  expect(geometry.columns[1] - geometry.columns[0], label + ": rotulo liberou espaco").toBeGreaterThanOrEqual(20);
  // A prosa deixa de fragmentar em poucas letras por linha.
  expect(geometry.minimumCharsPerColumn[1], label + ": caracteres por linha na prosa").toBeGreaterThanOrEqual(5);
  expect(geometry.minimumCharsPerColumn[2], label + ": caracteres por linha na prosa").toBeGreaterThanOrEqual(6.5);
}

const HOSTS = [["unidade", ".card-sheet-content"], ["explicacao", ".study-explanation-body"]];

for (const [hostName, hostSelector] of HOSTS) {
  test("rotulo curto libera espaco para a prosa na " + hostName + " em 360px", async ({ page }) => {
    await mount(page, { width: 360, data: U5 });
    if (hostName === "explicacao") await openExplanation(page);
    const scope = page.locator(hostSelector);
    const geometry = await readGeometry(scope);
    console.log("geometria u5/" + hostName + "/360: " + JSON.stringify(geometry));
    const controls = await controlBoxes(page);
    await page.screenshot({ path: path.join(PROOF_DIR, hostName + "-360.png") });
    expectDistribution(geometry, "u5/" + hostName + "/360");
    // Cabendo na largura de leitura, a tabela continua sem rolagem artificial e
    // ocupando a coluna inteira: a geometria externa nao muda.
    expect(geometry.wrapScroll - geometry.wrapClient).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.table - (geometry.wrapClient - 12))).toBeLessThanOrEqual(2);
    for (const control of controls) {
      expect(control.width, "controle " + control.label).toBe(44);
      expect(control.height, "controle " + control.label).toBe(44);
    }
  });
}

test("rotulo curto libera espaco para a prosa em 1280px e com texto ampliado", async ({ page }) => {
  for (const scale of [100, 200]) {
    await mount(page, { width: 1280, data: U5, scale });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    const reach = await lastColumnReachable(scope);
    console.log("geometria u5/unidade/1280/" + scale + "%: " + JSON.stringify(geometry) + " alcance: " + JSON.stringify(reach));
    await page.screenshot({ path: path.join(PROOF_DIR, "unidade-1280-" + scale + ".png") });
    expectDistribution(geometry, "u5/1280/" + scale + "%");
    if (scale === 100) {
      expect(geometry.wrapScroll - geometry.wrapClient).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.table - (geometry.wrapClient - 12))).toBeLessThanOrEqual(2);
      continue;
    }
    // Com o texto ampliado o conteudo minimo excede a largura de leitura (ja era
    // assim antes da correcao): vale o contrato de tabela larga.
    expect(reach.reachable, "texto ampliado: ultima coluna alcancavel").toBe(true);
  }
});

test("explicacao em 1280px preserva a distribuicao", async ({ page }) => {
  await mount(page, { width: 1280, data: U5 });
  await openExplanation(page);
  const geometry = await readGeometry(page.locator(".study-explanation-body"));
  console.log("geometria u5/explicacao/1280: " + JSON.stringify(geometry));
  await page.screenshot({ path: path.join(PROOF_DIR, "explicacao-1280.png") });
  expectDistribution(geometry, "u5/explicacao/1280");
});

test("tabela larga de 8 colunas mantem o piso e a rolagem propria", async ({ page }) => {
  for (const width of [360, 1280]) {
    await mount(page, { width, data: WIDE8 });
    const scope = page.locator(".card-sheet-content");
    const geometry = await readGeometry(scope);
    const reach = await lastColumnReachable(scope);
    console.log("geometria larga8/unidade/" + width + ": " + JSON.stringify(geometry) + " alcance: " + JSON.stringify(reach));
    if (width === 360) await page.screenshot({ path: path.join(PROOF_DIR, "larga8-360.png") });
    expect(geometry.pageOverflow, "larga8/" + width).toBeLessThanOrEqual(1);
    expect(geometry.wrapScroll, "larga8/" + width + ": conteudo excede a coluna").toBeGreaterThan(geometry.wrapClient + 1);
    expect(geometry.columns.length).toBe(8);
    for (const [index, columnWidth] of geometry.columns.entries()) {
      expect(columnWidth, "larga8/" + width + ": coluna " + (index + 1) + " preserva o piso")
        .toBeGreaterThanOrEqual(geometry.floor - 1);
    }
    expect(reach.reachable, "larga8/" + width + ": ultima coluna alcancavel").toBe(true);
  }
});

test("celulas com contrato proprio de largura seguem com o piso", async ({ page }) => {
  await mount(page, { width: 360, data: U5 });
  // O produto ainda nao emite estas classes (nao ha consumidor); a prova fixa o
  // contrato de CSS aplicando-as a celula real do rotulo e lendo o valor computado.
  const cell = page.locator(".card-sheet-content .runtime-table tbody tr:first-child > :first-child");
  const computed = await cell.evaluate(node => {
    const values = {};
    for (const name of ["is-nowrap", "is-align-numeric"]) {
      node.classList.add(name);
      values[name] = getComputedStyle(node).minWidth;
      node.classList.remove(name);
    }
    values.base = getComputedStyle(node).minWidth;
    return values;
  });
  console.log("contrato de largura: " + JSON.stringify(computed));
  expect(computed.base).toBe("0px");
  expect(computed["is-nowrap"]).toBe("88px");
  expect(computed["is-align-numeric"]).toBe("88px");
});

