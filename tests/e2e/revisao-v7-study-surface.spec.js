import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

async function mount(page, name, width, practice = false, scenario = null) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/main.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  for (const file of ['support/studyExplanationFixture.js', 'fixtures/package/project-minimal.json']) {
    await page.route(`**/tests/${file}`, route => route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'application/json',
      body: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') }));
  }
  await page.goto('/');
  await page.evaluate(async ({ name, practice, scenario }) => {
    const { RESOURCE_PACKAGE_REGISTRY: registry } = await import('/src/resources/packages/index.js');
    const { mountStudyExplanationFixture } = await import('/tests/support/studyExplanationFixture.js');
    const definition = registry.get(`aralearn.resource.${name}`, '1.0.0');
    const data = structuredClone(definition.authoringContract.example);
    let practiceResponse = null;
    if (scenario === 'long-stack') {
      data.frames[1].functionName = 'calcularTotalComDescontosEImpostos(itensSelecionados, regrasRegionais)';
      data.frames[1].fields[0].name = 'valorAcumuladoAntesDaAplicacaoDoDesconto';
      data.frames[1].fields[0].value = 'Aguarda o cálculo dos itens restantes para somar o imposto regional ao subtotal.';
      data.frames[1].continuation = 'Retomar a função que calcula o total, combinar o subtotal devolvido com o imposto e só então apresentar o resultado ao cliente.';
    }
    if (scenario === 'descending-memory') data.addressOrder = 'descending';
    if (scenario === 'long-url') data.text = 'Consulte https://example.org/' + 'endereco-semantico-muito-longo'.repeat(12) + ' para observar o endereço completo.';
    if (scenario === 'reaction-state') {
      data.reactants = [{ id: 'salt', formula: 'Ca(OH)₂', name: 'hidróxido de cálcio', state: 'aq' },
        { id: 'acid', formula: 'H₃PO₄', name: 'ácido fosfórico', coefficient: 2, state: 'aq' }];
      data.products = [{ id: 'phosphate', formula: 'Ca₃(PO₄)₂', name: 'fosfato de cálcio', state: 's' },
        { id: 'water', formula: 'H₂O', name: 'água', coefficient: 6, state: 'l' }];
      data.reactants[0].coefficient = 3;
    }
    if (scenario === 'long-gap') {
      const answer = 'a amostra perdeu água para o ambiente por evaporação, conservando a quantidade de sal';
      data.text = `Após aquecer a solução, ${answer}.`;
      practiceResponse = { id: 'response', package: 'aralearn.response.gap', version: '1.0.0', data: { blanks: [
        { id: 'cause', label: 'Explicação da mudança', targetInstanceId: 'representation', targetPath: 'text', responseMode: 'choice',
          answer, distractors: ['o sal evaporou junto com a água e a solução conservou a mesma concentração em todos os momentos'] }
      ] } };
    }
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
  }, { name, practice, scenario });
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

for (const width of [320, 390, 430, 1280]) {
  for (const [name, scenario] of [['paragraph', 'long-url'], ['reaction', 'reaction-state'], ['call_stack', 'long-stack'], ['terminal_session', null], ['memory_layout', 'descending-memory']]) {
    test(`v10: ${name} com leitura integral nos dois hosts (${width}px)`, async ({ page }, info) => {
      await mount(page, name, width, false, scenario);
      if (name === 'call_stack') await page.addStyleTag({ content: '.package-call-stack { zoom: 1.25; }' });
      for (const host of ['.card-sheet-content', '.study-explanation-body']) {
        if (host === '.study-explanation-body') await page.getByRole('button', { name: 'Explicação', exact: true }).click();
        const root = page.locator(host);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        if (name === 'paragraph') {
          await expect(root).toContainText('https://example.org/endereco-semantico-muito-longo');
          expect(await root.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
        }
        if (name === 'reaction') {
          const species = await root.locator('[data-reaction-species]').evaluateAll(nodes => nodes.map(node => {
            const formula = node.querySelector('.package-reaction-formula').getBoundingClientRect();
            const state = node.querySelector('.package-reaction-state').getBoundingClientRect();
            return { state: node.dataset.reactionSpecies, sameLine: Math.min(formula.bottom, state.bottom) > Math.max(formula.top, state.top),
              adjacent: state.left >= formula.right - 1 && state.left - formula.right < 15 };
          }));
          expect(species).toHaveLength(4);
          for (const value of species) expect(value.sameLine && value.adjacent, JSON.stringify(value)).toBe(true);
        }
        if (name === 'call_stack') {
          await expect(root.locator('[data-frame-state="active"]')).toHaveCount(1);
          await expect(root.locator('.package-call-stack')).toContainText('regrasRegionais');
          expect(await root.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
          await root.locator('[data-frame-state="suspended"]').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath(`stack-${width}-${host.includes('explanation') ? 'explanation' : 'unit'}-long-frame.png`) });
          await root.locator('.package-call-stack li').last().scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath(`stack-${width}-${host.includes('explanation') ? 'explanation' : 'unit'}-base.png`) });
        }
        if (name === 'memory_layout') {
          const endpoints = await root.locator('.package-memory-stack li > code').allTextContents();
          for (let index = 1; index < endpoints.length; index += 1) {
            expect(BigInt(endpoints[index - 1])).toBeGreaterThanOrEqual(BigInt(endpoints[index]));
          }
          await root.locator('.package-memory-direction').scrollIntoViewIfNeeded();
          await expect(root.locator('.package-memory-direction')).toContainText('decrescentes');
          await page.screenshot({ path: info.outputPath(`memory-${width}-${host.includes('explanation') ? 'explanation' : 'unit'}-direction.png`) });
          await root.locator('.package-memory-stack li').first().scrollIntoViewIfNeeded();
        }
        if (name === 'terminal_session') {
          const disclosure = root.locator('details').first();
          await expect(disclosure).not.toHaveAttribute('open');
          await page.screenshot({ path: info.outputPath(`${name}-${width}-${host.includes('explanation') ? 'explanation' : 'unit'}-collapsed.png`) });
          await disclosure.locator('summary').focus();
          await page.keyboard.press('Enter');
          await expect(disclosure).toHaveAttribute('open', '');
          await expect(disclosure.locator('.package-terminal-stream').first()).toBeVisible();
          await expect(disclosure.locator('.package-terminal-exit')).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath(`${name}-${width}-${host.includes('explanation') ? 'explanation' : 'unit'}.png`) });
        if (host === '.study-explanation-body') {
          await page.getByRole('button', { name: 'Fechar explicação', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Explicação', exact: true })).toBeFocused();
        }
      }
    });
  }
  test(`v10: alternativas de lacuna realmente quebram e permanecem selecionáveis (${width}px)`, async ({ page }, info) => {
    await mount(page, 'paragraph', width, 'choice', 'long-gap');
    const blank = page.locator('.card-sheet-content [data-action="text-gap-open-choice"]');
    await blank.click();
    const options = page.locator('.token-option');
    await expect(options).toHaveCount(2);
    const measurements = await options.evaluateAll(nodes => nodes.map(node => {
      const label = node.querySelector('.token-option-label');
      const range = document.createRange(); range.selectNodeContents(label);
      return { lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.y))).size,
        noOverflow: node.scrollWidth <= node.clientWidth + 1, height: node.getBoundingClientRect().height };
    }));
    for (const value of measurements) {
      expect(value.lines).toBeGreaterThan(1);
      expect(value.noOverflow).toBe(true);
      expect(value.height).toBeGreaterThanOrEqual(44);
    }
    await options.first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const focus = await options.first().evaluate(node => {
      const style = getComputedStyle(node);
      return { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset) };
    });
    expect(focus.width).toBeGreaterThan(0);
    expect(focus.width + focus.offset).toBeLessThanOrEqual(0);
    await page.screenshot({ path: info.outputPath(`gap-${width}-multiline-focus.png`) });
    const selected = await options.first().getAttribute('data-text-gap-value');
    await page.keyboard.press('Enter');
    await expect(blank).toContainText(selected);
    await page.screenshot({ path: info.outputPath(`gap-${width}-selected.png`) });
    // O gesto vigente sobre uma lacuna preenchida a limpa; o seguinte reabre.
    await blank.click();
    await expect(blank).not.toContainText(selected);
    await blank.click();
    await expect(options).toHaveCount(2);
    await options.last().click();
    await expect(blank).not.toBeEmpty();
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
        await expect(results.first()).not.toHaveAttribute('open');
        await results.first().locator('summary').click();
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
// D030: rolagem horizontal é a solução vigente para tabelas largas; código preserva rolagem local.
// Prova que o fim do conteúdo é alcançável nos dois hosts, em 320 e 390 px, sem exigir indicador extra.
for (const width of [320, 390]) for (const name of ['table', 'truth_table', 'code']) {
  test(`D030: rolagem horizontal alcança o fim do conteúdo em ${name} (${width}px)`, async ({ page }, info) => {
    await mount(page, name, width);
    for (const [host, tag] of [['.card-sheet-content', 'unidade'], ['.study-explanation-body', 'explicacao']]) {
      if (host === '.study-explanation-body') await page.getByRole('button', { name: 'Explicação', exact: true }).click();
      const root = page.locator(host);
      await expect(root.locator('.package-instance')).toHaveCount(1);
      const scope = `${host} ${name === 'code' ? '.runtime-code-block pre' : '.runtime-table-wrap'}`;
      const measure = () => page.evaluate((selector) => {
        const node = document.querySelector(selector);
        const box = node.getBoundingClientRect();
        const content = node.querySelector('table') ?? node.querySelector('code');
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let rightMost = null;
        let tailText = '';
        while (walker.nextNode()) {
          const textNode = walker.currentNode;
          if (!textNode.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(textNode);
          for (const rect of range.getClientRects()) if (!rightMost || rect.right > rightMost.right) { rightMost = rect; tailText = textNode.textContent.trim(); }
        }
        return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, maxScroll: node.scrollWidth - node.clientWidth,
          scrollLeft: Math.round(node.scrollLeft), atEnd: node.scrollWidth - node.clientWidth - node.scrollLeft <= 1,
          boxLeft: box.left, boxRight: box.right, contentRight: rightMost ? rightMost.right : null,
          tailText: tailText.slice(-48), tailVisible: Boolean(rightMost) && rightMost.right <= box.right + 1,
          documentWidth: document.documentElement.scrollWidth };
      }, scope);
      const start = await measure();
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${tag}-rolagem-inicial.png`) });
      await page.evaluate(selector => { const node = document.querySelector(selector); node.scrollLeft = node.scrollWidth; }, scope);
      const end = await measure();
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${tag}-rolagem-final.png`) });
      const evidence = { width, name, host: tag, start, end };
      writeFileSync(info.outputPath(`${name}-${width}-${tag}.json`), JSON.stringify(evidence, null, 2));
      await info.attach(`${name}-${width}-${tag}.json`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
      expect(start.scrollWidth, JSON.stringify(start)).toBeGreaterThan(start.clientWidth + 1);
      expect(start.tailVisible, JSON.stringify(start)).toBe(false);
      expect(end.atEnd, JSON.stringify(end)).toBe(true);
      expect(end.tailVisible, JSON.stringify(end)).toBe(true);
      expect(end.documentWidth, JSON.stringify(end)).toBeLessThanOrEqual(width);
      if (host === '.study-explanation-body') await page.getByRole('button', { name: 'Fechar explicação', exact: true }).click();
    }
  });
}
