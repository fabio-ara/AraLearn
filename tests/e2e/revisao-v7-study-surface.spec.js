import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function mount(page, name, width, practice = false) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/main.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  for (const file of ['support/studyExplanationFixture.js', 'fixtures/package/project-minimal.json']) {
    await page.route(`**/tests/${file}`, route => route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'application/json',
      body: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') }));
  }
  await page.goto('/');
  await page.evaluate(async ({ name, practice }) => {
    const { RESOURCE_PACKAGE_REGISTRY: registry } = await import('/src/resources/packages/index.js');
    const { mountStudyExplanationFixture } = await import('/tests/support/studyExplanationFixture.js');
    const definition = registry.get(`aralearn.resource.${name}`, '1.0.0');
    const data = structuredClone(definition.authoringContract.example);
    let practiceResponse = null;
    if (practice === true) {
      data.connectors[0].label = 'transporta amostras calibradas para decidir a atuação';
      practiceResponse = { id: 'response', package: 'aralearn.response.gap', version: '1.0.0', data: { blanks: [
        { id: 'flow', targetInstanceId: 'representation', targetPath: 'connectors[0].label', responseMode: 'choice',
          answer: data.connectors[0].label, distractors: ['envia comandos de atuação para acionar o sensor'] }
      ] } };
    }
    if (name === 'table') {
      data.columns = Array.from({ length: 8 }, (_, i) => `Coluna ${i + 1}`);
      data.rows = Array.from({ length: 6 }, (_, r) => data.columns.map((_, c) => `Valor ${r + 1}.${c + 1}`));
    }
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    await mountStudyExplanationFixture(document.querySelector('#aralearn-editor-root'), { unit: practice ? 'practice' : 'theory', practiceResponse,
      citationOccurrences: name === 'formula' ? [{ occurrenceId: 'formula-claim', slot: 'content', resourceId: 'representation', path: 'accessibleText',
        quote: data.accessibleText, prefix: null, suffix: null, status: 'resolved' }] : null, resourceContent: [
      { id: 'representation', package: definition.manifest.id, version: definition.manifest.version, data }
    ] });
  }, { name, practice });
}

for (const width of [320, 390, 1280]) test(`O021: comentário preserva acesso por ponteiro à Explicação (${width}px)`, async ({ page }, info) => {
  await mount(page, 'paragraph', width, 'choice');
  await page.locator('[data-choice-option-id="local"]').click();
  await page.locator('[data-choice-option-id="prior"]').click();
  await page.locator('[data-action="next-study-unit"]').click();
  const feedback = page.locator('.study-continue-popup');
  await expect(feedback).toBeVisible();
  const explanation = page.getByRole('button', { name: 'Explicação', exact: true });
  const commentBox = await feedback.boundingBox();
  const actionBox = await explanation.boundingBox();
  expect(commentBox.y + commentBox.height).toBeLessThanOrEqual(actionBox.y);
  await page.screenshot({ path: info.outputPath(`feedback-dock-${width}.png`) });
  await explanation.click();
  await expect(page.getByRole('dialog', { name: 'Explicação', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar explicação', exact: true }).click();
  await expect(explanation).toBeFocused();
  await expect(feedback).toBeVisible();
});

for (const width of [390, 1280]) for (const name of ['entity_relationship', 'database_schema', 'system_internal_block', 'state_machine', 'bpmn_process', 'state_transition_table', 'table']) {
  test(`${name}: conteúdo integral na Unidade e Explicação em ${width}px`, async ({ page }, info) => {
    await mount(page, name, width);
    for (const host of ['.card-sheet-content', '.study-explanation-body']) {
      if (host === '.study-explanation-body') await page.getByRole('button', { name: 'Explicação', exact: true }).click();
      const root = page.locator(host);
      await expect(root.locator('.package-instance')).toHaveCount(1);
      if (['table', 'state_transition_table'].includes(name)) {
        const extent = await root.locator('.runtime-table-wrap').evaluate(node => {
          node.scrollLeft = node.scrollWidth;
          const last = node.querySelector('tr:last-child > :last-child').getBoundingClientRect();
          const box = node.getBoundingClientRect();
          return { visibleLastColumn: last.right <= box.right + 1, scrolled: node.scrollLeft,
            width: box.width, documentWidth: document.documentElement.scrollWidth };
        });
        expect(extent.visibleLastColumn).toBe(true);
        if (name === 'table') expect(extent.scrolled).toBeGreaterThan(0);
        expect(extent.width).toBeLessThanOrEqual(430);
        expect(extent.documentWidth).toBeLessThanOrEqual(width);
      } else {
        await expect(root.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
        expect(Number(await root.locator('svg[data-diagram-scale]').getAttribute('data-diagram-scale'))).toBeGreaterThanOrEqual(1);
        const measured = await root.locator('foreignObject').evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect();
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          const fragments = [];
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(walker.currentNode);
            for (const rect of range.getClientRects()) fragments.push(rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
          }
          return { text: node.textContent, fits: fragments.every(Boolean) };
        }));
        // Explicação instrumenta todos os campos citáveis; reproduz o corte de M28/M29.
        if (host === '.study-explanation-body' && ['entity_relationship', 'database_schema'].includes(name)) expect(measured.length).toBeGreaterThan(0);
        for (const label of measured) expect(label.fits, label.text).toBe(true);
        await root.getByRole('button', { name: 'Explorar diagrama em tela inteira', exact: true }).click();
        const canvas = page.locator('dialog[open] [data-resource-scroll-frame="diagram"]');
        await canvas.focus();
        await expect(canvas).toBeFocused();
        await page.keyboard.press('End');
        const focus = await canvas.evaluate(node => {
          const style = getComputedStyle(node);
          return { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset), radius: parseFloat(style.borderBottomLeftRadius) };
        });
        expect(focus.width).toBeGreaterThan(0);
        expect(focus.offset + focus.width).toBeLessThanOrEqual(0);
        expect(focus.radius).toBeGreaterThan(0);
        const moved = await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop, canScroll: node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight }));
        if (moved.canScroll) expect(moved.x + moved.y).toBeGreaterThan(0);
        await page.screenshot({ path: info.outputPath(`${name}-${width}-${host.includes('explanation') ? 'explanation' : 'unit'}.png`) });
        await page.keyboard.press('Escape');
      }
    }
  });
}

test('D016: gesto durante a abertura do diagrama prevalece sobre o reposicionamento pendente', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mount(page, 'entity_relationship', 390);
  await expect(page.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  // Controla somente os quadros da transição; geometria, foco e teclado são do navegador.
  await page.evaluate(() => {
    const original = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame };
    const queued = new Map();
    let nextId = -1;
    window.requestAnimationFrame = callback => { const id = nextId--; queued.set(id, callback); return id; };
    window.cancelAnimationFrame = id => { if (!queued.delete(id)) original.cancel.call(window, id); };
    window.diagramFrameProbe = {
      size: () => queued.size,
      flush: async () => {
        let frames = 0;
        for (let round = 0; round < 8; round += 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (!queued.size) return frames;
          const batch = [...queued.values()]; queued.clear();
          for (const callback of batch) { frames += 1; callback(performance.now()); }
        }
        throw new Error('A fila de quadros não estabilizou.');
      },
      restore: () => {
        window.requestAnimationFrame = original.request;
        window.cancelAnimationFrame = original.cancel;
        for (const callback of queued.values()) original.request.call(window, callback);
        delete window.diagramFrameProbe;
      }
    };
    document.querySelector('[data-diagram-action="toggle-expanded"]').click();
  });
  try {
    const canvas = page.locator('dialog[open] [data-resource-scroll-frame="diagram"]');
    await canvas.focus();
    await page.keyboard.press('End');
    const before = await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
    expect(before.x + before.y).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.diagramFrameProbe.size())).toBeGreaterThan(0);
    const frames = await page.evaluate(() => window.diagramFrameProbe.flush());
    const after = await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
    await info.attach('diagram-transition.json', { body: JSON.stringify({ before, after, frames }), contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(frames).toBeGreaterThanOrEqual(2);
    expect(after).toEqual(before);
    await expect(canvas).toBeFocused();
  } finally {
    await page.evaluate(() => window.diagramFrameProbe?.restore());
  }
});

test('SysML conserva rótulo de lacuna longo e resposta após explorar e retornar', async ({ page }, info) => {
  await mount(page, 'system_internal_block', 390, true);
  await expect(page.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Explorar diagrama em tela inteira', exact: true }).click();
  const blank = page.locator('dialog[open] [data-action="text-gap-open-choice"]');
  await blank.click();
  await page.locator('[data-text-gap-value="transporta amostras calibradas para decidir a atuação"]').click();
  await expect(page.locator('dialog[open] [data-action="text-gap-open-choice"]')).toContainText('transporta amostras calibradas para decidir a atuação');
  const fits = await page.locator('dialog[open] [data-action="text-gap-open-choice"]').evaluate(node => {
    const container = node.closest('foreignObject').getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return { fits: node.scrollWidth <= node.clientWidth + 1 && rect.left >= container.left - 1 && rect.right <= container.right + 1,
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, width: rect.width, frame: container.width };
  });
  await page.screenshot({ path: info.outputPath('sysml-long-gap.png') });
  expect(fits.fits, JSON.stringify(fits)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-sheet-content [data-action="text-gap-open-choice"]')).toContainText('transporta amostras calibradas para decidir a atuação');
});

for (const name of ['formula', 'call_stack', 'terminal_session', 'memory_layout', 'code']) {
  test(`${name}: gramática e conteúdo legíveis nos dois contextos`, async ({ page }, info) => {
    await mount(page, name, 390);
    for (const host of ['.card-sheet-content', '.study-explanation-body']) {
      if (host === '.study-explanation-body') await page.getByRole('button', { name: 'Explicação', exact: true }).click();
      const root = page.locator(host);
      await expect(root.locator('.package-instance')).toHaveCount(1);
      if (name === 'formula') {
        await expect(root.locator('math')).toBeVisible();
        const marker = root.getByRole('button', { name: 'Referência 1', exact: true });
        await expect(marker).toBeVisible();
        expect(await marker.evaluate(node => Boolean(node.closest('.visually-hidden')))).toBe(false);
        await marker.click();
        await expect(page.getByLabel(host.includes('explanation') ? 'Referências' : 'Referências desta unidade')
          .locator('[data-citation-reference-id="support-link"]')).toBeVisible();
        if (!host.includes('explanation')) await page.getByRole('button', { name: 'Fechar fontes', exact: true }).click();
      }
      if (name === 'terminal_session') {
        const results = root.locator('details');
        expect(await results.count()).toBeGreaterThan(1);
        await expect(results.first()).toHaveAttribute('open', '');
        await results.nth(1).locator('summary').click();
        await expect(results.nth(1)).toHaveAttribute('open', '');
      }
      if (name === 'call_stack') {
        await expect(root.locator('li.is-active')).toHaveCount(1);
        await expect(root.locator('li.is-active')).toContainText('Em execução');
        await expect(root.locator('.package-call-stack-return').first()).toContainText('Ao terminar');
      }
      if (name === 'code') await expect(root.locator('.runtime-code-language')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.screenshot({ path: info.outputPath(`${name}-${host.includes('explanation') ? 'explanation' : 'unit'}.png`) });
    }
  });
}
