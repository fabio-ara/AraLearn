import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Defeito registrado na MS24/MS25: o estado físico do pacote reaction
// ((g)/(s)/(l)) quebrava em três linhas na Explicação, apesar de
// white-space: nowrap. A asserção vigente de "sameLine" não detecta a quebra,
// porque o mtext alto ainda sobrepõe verticalmente a fórmula. Esta prova mede as
// caixas de linha reais de cada mtext.package-reaction-state.
const REACTIONS = [
  {
    id: 'combustion',
    data: {
      prompt: 'Observe a combustão do metano.',
      reactionType: 'forward',
      reactants: [
        { id: 'ch4', formula: 'CH₄', name: 'metano', state: 'g' },
        { id: 'o2', formula: 'O₂', name: 'oxigênio', coefficient: 2, state: 'g' }
      ],
      products: [
        { id: 'co2', formula: 'CO₂', name: 'dióxido de carbono', state: 'g' },
        { id: 'h2o', formula: 'H₂O', name: 'água', coefficient: 2, state: 'l' }
      ],
      conditions: ['ignição']
    }
  },
  {
    id: 'reduction',
    data: {
      prompt: 'Observe a redução do óxido de ferro.',
      reactionType: 'forward',
      reactants: [
        { id: 'fe2o3', formula: 'Fe₂O₃', name: 'óxido de ferro(III)', state: 's' },
        { id: 'co', formula: 'CO', name: 'monóxido de carbono', coefficient: 3, state: 'g' }
      ],
      products: [
        { id: 'fe', formula: 'Fe', name: 'ferro', coefficient: 2, state: 's' },
        { id: 'co2b', formula: 'CO₂', name: 'dióxido de carbono', coefficient: 3, state: 'g' }
      ],
      conditions: ['aquecimento']
    }
  }
];

async function mountReactions(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/main.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  for (const file of ['support/studyExplanationFixture.js', 'fixtures/package/project-minimal.json']) {
    await page.route(`**/tests/${file}`, route => route.fulfill({
      contentType: file.endsWith('.js') ? 'text/javascript' : 'application/json',
      body: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    }));
  }
  await page.goto('/');
  await page.evaluate(async ({ reactions }) => {
    const { mountStudyExplanationFixture } = await import('/tests/support/studyExplanationFixture.js');
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    await mountStudyExplanationFixture(document.querySelector('#aralearn-editor-root'), {
      unit: 'theory',
      resourceContent: reactions.map(({ id, data }) => ({
        id, package: 'aralearn.resource.reaction', version: '1.0.0', data
      }))
    });
  }, { reactions: REACTIONS });
}

function measureStates(root) {
  return root.locator('[data-reaction-species]').evaluateAll(nodes => nodes.map(node => {
    const state = node.querySelector('.package-reaction-state');
    const formula = node.querySelector('.package-reaction-formula');
    const range = document.createRange();
    range.selectNodeContents(state);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 || rect.height > 0);
    const box = state.getBoundingClientRect();
    const formulaBox = formula.getBoundingClientRect();
    const style = getComputedStyle(state);
    return {
      species: node.dataset.reactionSpecies,
      text: state.textContent,
      lineBoxes: new Set(rects.map(rect => Math.round(rect.y))).size,
      stateHeight: Math.round(box.height),
      stateWidth: Number(box.width.toFixed(2)),
      sameLine: Math.min(formulaBox.bottom, box.bottom) > Math.max(formulaBox.top, box.top),
      adjacent: box.left >= formulaBox.right - 1 && box.left - formulaBox.right < 15,
      display: style.display,
      whiteSpace: style.whiteSpace,
      fontSize: style.fontSize
    };
  }));
}

for (const width of [390, 1280]) {
  test(`reaction: estado físico permanece em uma única linha (${width}px)`, async ({ page }, info) => {
    await mountReactions(page, width);
    for (const host of ['.card-sheet-content', '.study-explanation-body']) {
      if (host === '.study-explanation-body') await page.getByRole('button', { name: 'Explicação', exact: true }).click();
      const root = page.locator(host);
      await expect(root.locator('.package-instance')).toHaveCount(2);
      const measured = await measureStates(root);
      await info.attach(`reaction-estado-${width}-${host.includes('explanation') ? 'explicacao' : 'unidade'}.json`,
        { body: JSON.stringify(measured, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: info.outputPath(`reaction-estado-${width}-${host.includes('explanation') ? 'explicacao' : 'unidade'}.png`) });
      for (const value of measured) {
        expect(value.lineBoxes, JSON.stringify(value)).toBe(1);
        expect(value.stateHeight, JSON.stringify(value)).toBeLessThanOrEqual(24);
        expect(value.sameLine && value.adjacent, JSON.stringify(value)).toBe(true);
      }
      if (host === '.study-explanation-body') {
        await page.getByRole('button', { name: 'Fechar explicação', exact: true }).click();
      }
    }
  });
}
