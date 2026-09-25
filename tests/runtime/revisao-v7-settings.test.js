import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderUiIcon } from '../../src/ui/renderUiIcons.js';

const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');
const [visitorSettings, assistantConnection, authoringPreferences] = await Promise.all([
  read('../../src/ui/VisitorSettings.js'),
  read('../../src/ui/AssistantConnectionSettings.js'),
  read('../../src/ui/AuthoringProcessPreferencesSettings.js')
]);
const sources = { visitorSettings, assistantConnection, authoringPreferences };
// P004: painel inicial de Configurações considerado adequado pelo proprietário.
const approvedGroups = ['Conta', 'Aparência', 'Sincronização e dados deste dispositivo', 'Preferências de autoria', 'Conectar assistente'];

function buttons(source) {
  return [...source.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gu)].map(match => [match[0], match[1]]);
}

function visibleText(inner) {
  return inner
    .replace(/\$[{]renderUiIcon\([^)]*\)[}]/gu, '')
    .replace(/<svg[\s\S]*?<\/svg>/gu, '')
    .replace(/<span class="visually-hidden">[\s\S]*?<\/span>/gu, '')
    .replace(/<[^>]*>/gu, '')
    .trim();
}

function iconNames(source) {
  return [...source.matchAll(/renderUiIcon\((['"])([a-z0-9-]+)\1/gu)].map(match => match[2]);
}

test('D001/O035: todo controle de ação das Configurações é icon-only com nome acessível', () => {
  for (const [name, source] of Object.entries(sources)) {
    const found = buttons(source);
    assert.ok(found.length > 0, name + ': nenhum controle de ação encontrado');
    for (const [tag, inner] of found) {
      if (/data-visitor-open-view=/u.test(tag)) {
        // P004: as entradas de grupo da tela inicial aprovada conservam o rótulo visível.
        assert.match(inner, /<strong>[^<]+<\/strong>/u, name + ': grupo sem rótulo aprovado: ' + tag);
        continue;
      }
      assert.match(tag, /(?:aria-label|title)="/u, name + ': controle sem nome acessível: ' + tag);
      assert.doesNotMatch(visibleText(inner), /[A-Za-zÀ-ÿ]/u,
        name + ': controle conserva texto visível: ' + tag);
    }
  }
});

test('P004/O002/P005: grupos aprovados permanecem e destinos distintos usam ícones distintos', () => {
  const groupsSource = visitorSettings.match(/const groups = (\[[\s\S]*?\]);\r?\n/u)?.[1] || '';
  const entries = [...groupsSource.matchAll(/\["([a-z]+)", "([a-z0-9-]+)", "([^"]+)"\]/gu)];
  assert.equal(entries.length, approvedGroups.length, 'painel inicial de Configurações perdeu grupos aprovados');
  assert.deepEqual(entries.map(entry => entry[3]), approvedGroups);
  const icons = entries.map(entry => entry[2]);
  assert.equal(new Set(icons).size, icons.length, 'destinos distintos compartilham ícone: ' + icons.join(', '));
  const authoring = entries.find(entry => entry[1] === 'authoring');
  const assistant = entries.find(entry => entry[1] === 'assistant');
  assert.equal(authoring[2], 'edit');
  assert.equal(assistant[2], 'sparkles');
  assert.notEqual(authoring[2], assistant[2]);
  assert.match(visitorSettings, /data-visitor-open-view="[$][{]view[}]"[\s\S]*?<strong>[$][{]label[}]<\/strong>/u,
    'entrada de grupo precisa manter o rótulo aprovado e o ícone');
});

test('os ícones usados nos hosts de Configurações existem no sistema de ícones', () => {
  for (const [name, source] of Object.entries(sources)) {
    const icons = iconNames(source);
    assert.ok(icons.length > 0, name + ': nenhum ícone declarado');
    for (const icon of icons) {
      const markup = renderUiIcon(icon, 'account-settings-action-icon');
      assert.match(markup, /aria-hidden="true"/u, name + ': ícone decorativo ' + icon + ' sem aria-hidden');
    }
  }
  for (const theme of ['theme-system', 'theme-light', 'theme-dark']) assert.match(renderUiIcon(theme, 'icon'), /viewBox/u);
  assert.match(visitorSettings, /renderUiIcon\(\x60theme-[$][{]value[}]\x60/u);
  assert.match(visitorSettings, /\[\["system", "do sistema"\], \["light", "claro"\], \["dark", "escuro"\]\]/u);
  assert.throws(() => renderUiIcon('icone-inexistente', 'icon'), TypeError,
    'o sistema de ícones precisa recusar nome inexistente');
});

test('O036: a limpeza de dados sem conta é sinalizada como destrutiva e mantém confirmação e retorno', () => {
  const group = visitorSettings.match(/<div class="account-device-data-actions">([\s\S]*?)<\/div>/u)?.[1] || '';
  assert.match(group, /<button class="is-danger" type="button" data-visitor-clear-device/u,
    'perda de dados locais precisa de sinalização de risco');
  assert.equal((group.match(/<button/gu) || []).length, 1, 'agrupamento de dados locais mudou de composição');
  assert.equal((visitorSettings.match(/is-danger/gu) || []).length, 1, 'só a ação de perda de dados deve ser destrutiva');
  assert.match(visitorSettings, /confirmValue\("Remover os dados sem conta deste dispositivo\?/u);
  assert.match(visitorSettings, /status\.textContent = "Removendo os dados sem conta deste dispositivo…"/u);
  assert.match(visitorSettings, /root\.querySelector\("\[data-visitor-clear-device\]"\)\.addEventListener\("click"/u);
  assert.match(visitorSettings, /publicErrorMessage\(error, "Não foi possível concluir a limpeza/u);
});

test('O039: salvar e recarregar preferências expõem ícones e efeitos distinguíveis', () => {
  const save = authoringPreferences.match(/<button[^>]*data-process-save[\s\S]*?<\/button>/u)?.[0] || '';
  const reload = authoringPreferences.match(/<button[^>]*data-process-reload[\s\S]*?<\/button>/u)?.[0] || '';
  assert.match(save, /aria-label="Salvar preferências de autoria"/u);
  assert.match(save, /title="Salvar preferências de autoria"/u);
  assert.match(reload, /aria-label="Recarregar preferências salvas, mantendo alterações não salvas"/u);
  assert.match(reload, /title="Recarregar preferências salvas, mantendo alterações não salvas"/u);
  assert.notEqual(iconNames(save)[0], iconNames(reload)[0], 'salvar e recarregar precisam manter ícones distintos');
  assert.match(authoringPreferences, /class="authoring-process-actions" role="group" aria-label="Ações das preferências de autoria"/u);
  assert.match(authoringPreferences, /saveButton\.title = saveButton\.ariaLabel = pending \? "Confirmar gravação pendente" : "Salvar preferências de autoria"/u);
  // O nome acessível do recarregar descreve o efeito implementado: o rascunho é mantido.
  assert.match(authoringPreferences, /if \(read && \(wasDirty \|\| editVersion !== version\)\) \{/u);
  assert.match(authoringPreferences, /status\.textContent = "Rascunho mantido\.";/u);
});

test('D002: retorno de foco pertence a estes hosts e não deixa o controle fora da rolagem', () => {
  assert.match(visitorSettings, /const currentOpener = opener\?\.isConnected \? opener/u);
  assert.match(visitorSettings, /currentOpener\?\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(visitorSettings, /openers\.get\(previousView\)\?\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(visitorSettings, /if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); handleBack\(\); \}/u);
  assert.match(visitorSettings, /root\.querySelector\("button\[data-visitor-close\]"\)\.focus\(\{ preventScroll: true \}\)/u);
  const restore = assistantConnection.match(/const restoreRequestFocus = [\s\S]*?\r?\n[ ]{2}\};/u)?.[0] || '';
  assert.match(restore, /control\.focus\(\{ preventScroll: true \}\);/u);
  assert.match(restore, /control\.scrollIntoView\?\.\(\{ block: "nearest", inline: "nearest" \}\)/u);
  assert.ok(restore.indexOf('control.focus') < restore.indexOf('scrollIntoView'),
    'o ajuste de rolagem deve vir depois do foco restaurado');
});

test('campos, conteúdo e explicações permanecem fora dos controles icon-only', () => {
  for (const label of ['Endereço MCP', 'Identificador do cliente', 'Segredo do cliente', 'Endereço OpenAPI',
    'URL de autorização', 'URL de token', 'Escopo', 'Identificador ou URL de retorno do assistente']) {
    assert.ok(assistantConnection.includes(label), 'campo ausente: ' + label);
  }
  assert.match(assistantConnection, /O segredo aparece somente nesta sessão: copie-o para a configuração do seu assistente antes de fechar esta tela\./u);
  assert.match(assistantConnection, /<summary>Conexão por OpenAPI<\/summary>/u);
  for (const label of ['Foco', 'Cadência do trabalho', 'Pontos de revisão', 'Diálogo com o assistente', 'Organização da produção']) {
    assert.ok(authoringPreferences.includes(label), 'rótulo ausente: ' + label);
  }
  assert.match(authoringPreferences, /<p class="authoring-process-scope">Suas preferências para novos trabalhos\.<\/p>/u);
});
