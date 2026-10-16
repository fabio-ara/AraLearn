// Expansão determinística da projeção humana da auditoria: resolve as posições
// de unidade, citação e fonte no mesmo foco e restaura a abertura remitida.
const INICIO_REMISSION_PATH = 'tarefaApresentada.studentContent[0].text';

export function focusOf(context, foco) {
  return (context?.auditoriasPedagogicas ?? []).find(item => item.foco === foco) ?? null;
}

export function resolveLinkSource(link, focus) {
  if (!link || typeof link !== 'object' || !Object.hasOwn(link, 'fonteDoFoco')) return link;
  // O vínculo com source nunca depende do registro; a posição é só o alias gerado.
  if (Object.hasOwn(link, 'source')) return link;
  // Sem registro fontes o alias não tem destino: o vínculo volta intacto.
  if (!Array.isArray(focus?.fontes)) return link;
  const source = focus.fontes[link.fonteDoFoco - 1];
  // Registro presente e sem source: posição inválida é falha real, não ausência.
  if (source === undefined) throw new Error(`fonteDoFoco sem fonte no registro do foco: ${String(link.fonteDoFoco)}`);
  const { fonteDoFoco, ...rest } = link;
  return { ...rest, source };
}

export function resolveCitation(citation, focus) {
  if (!citation || !Array.isArray(citation.links)) return citation;
  return { ...citation, links: citation.links.map(link => resolveLinkSource(link, focus)) };
}

export function resolveUnit(unit) {
  const { observation, ...rest } = unit ?? {};
  const { declarado, tarefaApresentada, inicioRemitido, ...context } = observation ?? {};
  const resolved = { ...context, ...declarado, ...tarefaApresentada };
  if (inicioRemitido === INICIO_REMISSION_PATH && !Object.hasOwn(resolved, 'inicio')) {
    // Só o alias gerado é sintetizado: sem inicio presente, a remissão padrão
    // devolve a abertura; qualquer outro valor de remissão volta como estava.
    resolved.inicio = tarefaApresentada?.studentContent?.[0]?.text ?? '';
  } else if (inicioRemitido !== undefined) {
    resolved.inicioRemitido = inicioRemitido;
  }
  return { ...rest, observation: resolved };
}
