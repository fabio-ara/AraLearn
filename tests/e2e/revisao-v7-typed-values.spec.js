import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const kind of ['memory_layout', 'truth_table']) test(`${kind}: digitação equivalente no estudo e na prévia autoral`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/main.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  for (const file of ['support/studyExplanationFixture.js', 'fixtures/package/project-minimal.json']) {
    await page.route(`**/tests/${file}`, route => route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'application/json',
      body: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') }));
  }
  await page.goto('/');
  await page.evaluate(async kind => {
    const { mountStudyExplanationFixture } = await import('/tests/support/studyExplanationFixture.js');
    const memory = kind === 'memory_layout';
    const representation = { id: 'representation', package: `aralearn.resource.${kind}`, version: '1.0.0', data: memory
      ? { prompt: 'O bloco ocupa 16 bytes, com extremos inclusivos. Complete seu último endereço.', addressBase: 'hexadecimal', addressOrder: 'ascending',
        segments: [{ id: 'block', start: '0x1000', end: '0x100f', label: 'Bloco de 16 bytes', kind: 'custom', description: 'Memória endereçada a bytes' }] }
      : { prompt: 'Complete a negação de P.', variables: ['P'], derivedColumns: ['¬P'], rows: [{ values: ['true'], results: ['false'] }] } };
    const response = { id: 'response', package: 'aralearn.response.gap', version: '1.0.0', data: { blanks: [{ id: 'value', targetInstanceId: 'representation',
      targetPath: memory ? 'segments[0].end' : 'rows[0].results[0]', responseMode: 'text', answer: memory ? '0x100f' : 'false' }] } };
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    const fixture = await mountStudyExplanationFixture(document.querySelector('#aralearn-editor-root'), { unit: 'practice', resourceContent: [representation], practiceResponse: response });
    globalThis.__typedValueUnit = fixture.project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1];
  }, kind);
  const answer = kind === 'memory_layout' ? '0X00100F' : 'F';
  await page.locator('[data-action="complete-input"]').fill(answer);
  await page.getByRole('button', { name: 'Ver comentário da unidade', exact: true }).click();
  await expect(page.locator('.study-continue-popup')).toBeVisible();
  await expect(page.locator('.inline-feedback.err')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${kind}-study.png`) });

  await page.evaluate(async () => {
    const { createCourseInspectionPracticePreview } = await import('/src/ui/courseInspectionPracticePreview.js');
    const { renderPackageStudyUnitBlocks } = await import('/src/render/renderPackageStudyUnit.js');
    const root = document.querySelector('#aralearn-editor-root');
    const unit = globalThis.__typedValueUnit;
    const preview = createCourseInspectionPracticePreview({ render });
    function render() {
      root.innerHTML = renderPackageStudyUnitBlocks(unit, { ...preview.renderOptions(unit, 'test'), blockKeyPrefix: 'test' }) +
        '<button data-action="complete-validate">Validar prévia</button>';
      preview.bind(root, unit, 'test');
    }
    render();
  });
  await page.locator('[data-action="complete-input"]').fill(answer);
  await page.getByRole('button', { name: 'Validar prévia' }).click();
  await expect(page.locator('.inline-feedback.ok')).toHaveText('Correto.');
});
