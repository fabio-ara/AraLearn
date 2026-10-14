import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Prova focal de layout da moldura compartilhada das tabelas do runtime.
// Mede geometria real em vez de comparar texto de CSS, para separar as duas
// obrigações do componente: uma tabela textual estreita precisa caber na coluna
// de leitura sem rolagem horizontal artificial; uma tabela larga conserva a
// rolagem própria e não estoura a página. Consumidores: table, truth_table e
// state_transition_table, na Unidade de estudo e na Explicação.

const PROSE_ROWS = [
  ["Conhecimento prévio", "Como o que já foi aprendido antes desta unidade influencia a leitura do conteúdo novo?"],
  ["Contexto de uso", "Em que situação concreta esta relação entre conceito e prática costuma aparecer para quem aprende?"],
  ["Integração entre áreas", "Que ligação pode ser feita entre este conteúdo e outro já estudado na mesma trilha de formação?"],
  ["Aplicação imediata", "Qual decisão prática muda quando a relação apresentada é levada a sério no trabalho cotidiano?"],
  ["Limite do modelo", "Até que ponto a relação descrita continua válida e quando ela deixa de explicar o fenômeno observado?"],
  ["Verificação", "Que evidência observável mostraria que a integração entre contexto e conteúdo realmente aconteceu?"],
  ["Retomada", "O que precisa ser revisitado depois para que a aprendizagem se mantenha em novas situações de estudo?"]
];

const truthTableWide = {
  prompt: "Compare a implicação P → Q com sua forma equivalente ¬P ∨ Q e observe que elas coincidem em todas as valorações.",
  variables: ["P", "Q"],
  derivedColumns: ["P → Q", "¬P", "¬P ∨ Q", "(P → Q) ↔ (¬P ∨ Q)"],
  rows: [
    { values: ["true", "true"], results: ["true", "false", "true", "true"] },
    { values: ["true", "false"], results: ["false", "false", "false", "true"] },
    { values: ["false", "true"], results: ["true", "true", "true", "true"] },
    { values: ["false", "false"], results: ["true", "true", "true", "true"] }
  ]
};

const stateTransitionFits = {
  prompt: "Compare a função de transição do autômato que reconhece cadeias binárias terminadas em 01.",
  stateColumnLabel: "Estado",
  legend: "→ inicial · ◎ final ou aceitação",
  states: [
    { id: "q0", label: "q₀", initial: true, accepting: false },
    { id: "q1", label: "q₁", initial: false, accepting: false },
    { id: "q2", label: "q₂", initial: false, accepting: true }
  ],
  events: [{ id: "zero", label: "0" }, { id: "one", label: "1" }],
  transitions: [
    { id: "t1", from: "q0", event: "zero", to: "q1" }, { id: "t2", from: "q0", event: "one", to: "q0" },
    { id: "t3", from: "q1", event: "zero", to: "q1" }, { id: "t4", from: "q1", event: "one", to: "q2" },
    { id: "t5", from: "q2", event: "zero", to: "q1" }, { id: "t6", from: "q2", event: "one", to: "q0" }
  ]
};

const wideEvents = ["0", "1", "2", "3", "4", "5"].map((label, index) => ({ id: `e${index}`, label }));
const stateTransitionWide = {
  stateColumnLabel: "Estado",
  legend: "→ inicial · ◎ final ou aceitação",
  states: stateTransitionFits.states,
  events: wideEvents,
  transitions: wideEvents.map((event, index) => ({ id: `w${index}`, from: "q0", event: event.id, to: "q1" }))
};

const CASES = [
  { name: "textual de 2 colunas", expectation: "fits", package: "table", version: "1.0.0",
    data: { title: "Integrar para aprender em contexto", columns: ["Relação", "Pergunta"], rows: PROSE_ROWS } },
  { name: "larga de 8 colunas", expectation: "scrolls", package: "table", version: "1.0.0",
    data: { columns: Array.from({ length: 8 }, (_, index) => `Coluna ${index + 1}`),
      rows: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, column) => `Valor ${row + 1}.${column + 1}`)) } },
  { name: "tabela-verdade de 3 colunas", expectation: "fits", package: "truth_table", version: "1.0.0",
    data: { variables: ["P", "Q"], derivedColumns: ["P → Q"],
      rows: [{ values: ["true", "true"], results: ["true"] }, { values: ["true", "false"], results: ["false"] },
        { values: ["false", "true"], results: ["true"] }, { values: ["false", "false"], results: ["true"] }] } },
  { name: "tabela-verdade de 6 colunas", expectation: "scrolls", package: "truth_table", version: "1.0.0", data: truthTableWide },
  { name: "transição de 3 colunas", expectation: "fits", package: "state_transition_table", version: "1.0.0", data: stateTransitionFits },
  { name: "transição de 7 colunas", expectation: "scrolls", package: "state_transition_table", version: "1.0.0", data: stateTransitionWide }
];

async function mount(page, width, { package: packageName, version, data }) {
  await page.setViewportSize({ width, height: 740 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route(`**/tests/${file}`, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ packageName, version, data }) => {
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), { unit: "theory",
      resourceContent: [{ id: "representation", package: `aralearn.resource.${packageName}`, version, data }] });
  }, { packageName, version, data });
}

function readGeometry(scope) {
  return scope.locator(".runtime-table-wrap").evaluate(node => {
    const cells = [...node.querySelectorAll("th, td")].map(cell => cell.getBoundingClientRect());
    const box = node.getBoundingClientRect();
    return { wrapClient: node.clientWidth, wrapScroll: node.scrollWidth,
      frame: node.querySelector(".runtime-table-frame").getBoundingClientRect().width,
      table: node.querySelector("table.runtime-table").getBoundingClientRect().width,
      overflowX: getComputedStyle(node).overflowX,
      cellsLeft: Math.min(...cells.map(rect => rect.left)), cellsRight: Math.max(...cells.map(rect => rect.right)),
      wrapLeft: box.left, wrapRight: box.right, pageOverflow: document.documentElement.scrollWidth - innerWidth };
  });
}

async function measure(page, scope, expectation, label) {
  const geometry = await readGeometry(scope);
  console.log(`geometria ${label}: ${JSON.stringify(geometry)}`);
  expect(geometry.overflowX, `${label}: rolagem própria disponível`).toBe("auto");
  expect(geometry.pageOverflow, `${label}: a página não estoura`).toBeLessThanOrEqual(1);
  if (expectation === "fits") {
    // A tabela cabe: a moldura não pode ser mais larga que a coluna de leitura.
    expect(geometry.wrapScroll - geometry.wrapClient, `${label}: sem rolagem horizontal artificial`).toBeLessThanOrEqual(1);
    expect(geometry.frame, `${label}: moldura dentro da coluna`).toBeLessThanOrEqual(geometry.wrapClient + 1);
    expect(geometry.table, `${label}: tabela dentro da coluna`).toBeLessThanOrEqual(geometry.wrapClient + 1);
    expect(geometry.cellsLeft, `${label}: primeira coluna visível`).toBeGreaterThanOrEqual(geometry.wrapLeft - 1);
    expect(geometry.cellsRight, `${label}: última coluna visível sem rolar`).toBeLessThanOrEqual(geometry.wrapRight + 1);
    return geometry;
  }
  // Tabela larga: a rolagem do próprio componente permanece e alcança o fim.
  expect(geometry.wrapScroll, `${label}: conteúdo excede a coluna`).toBeGreaterThan(geometry.wrapClient + 1);
  const lastColumn = await scope.locator(".runtime-table-wrap").evaluate(node => {
    node.scrollLeft = node.scrollWidth;
    const last = node.querySelector("tr:last-child > :last-child").getBoundingClientRect();
    return { right: last.right, wrapRight: node.getBoundingClientRect().right };
  });
  expect(lastColumn.right, `${label}: última coluna alcançável pela rolagem`).toBeLessThanOrEqual(lastColumn.wrapRight + 1);
  return geometry;
}

for (const width of [360, 1280]) for (const item of CASES) {
  test(`${item.name} na Unidade e na Explicação em ${width}px`, async ({ page }, info) => {
    await mount(page, width, item);
    const unit = page.locator(".card-sheet-content");
    await expect(unit.locator(".runtime-table-wrap")).toHaveCount(1);
    await measure(page, unit, item.expectation, `${item.name}/${width}/unidade`);
    if (item.expectation === "fits" && width === 360) {
      await page.screenshot({ path: info.outputPath(`table-${item.package}-${width}.png`) });
    }
    await page.getByRole("button", { name: "Explicação", exact: true }).click();
    const explanation = page.locator(".study-explanation-body");
    await expect(explanation.locator(".runtime-table-wrap")).toHaveCount(1);
    await measure(page, explanation, item.expectation, `${item.name}/${width}/explicação`);
  });
}
