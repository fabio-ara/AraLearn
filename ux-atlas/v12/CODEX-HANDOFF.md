# Entrega para Codex — interface final do AraLearn

Base funcional: `main` em `ebd3feed909df9c007d0c09140ba28d3afe2dc61`.

## O que implementar

Use o `screen-registry.json` contido no ZIP, `UI-PRINCIPLES.md` e `BACKEND-COVERAGE.md` como especificação de produto. O HTML do Atlas é protótipo de interação e hierarquia, **não código de produção para copiar literalmente**. Reuse os componentes existentes do AraLearn.

## Restrições

- Não criar novas capacidades de backend para satisfazer o mock.
- Não esconder capacidade atual por simplificação de navegação.
- Não transformar todas as capacidades em abas permanentes.
- Manter os nove destinos canônicos de `courseAuthoringRoute.js`: planning, parameters, sources, structure, inspection, observations, variants, research e people.
- Manter os quatro grupos compactos definidos em `CourseAuthoringSurface.js`: Curso, Revisar, Pesquisa, Pessoas.
- Inspeção usa o mesmo renderer de conteúdo do Estudo e preserva posição/Unidade.
- Pesquisa usa o contrato de `CourseAnalyticsPanel`: filtros, gráfico, tabela equivalente, definição, fatos, deep links e exportação.
- Variantes usa `CourseVariantsPanel`: 2–8 Cursos, checkpoint comum, diferenças declaradas, efetivas, factuais e dados ausentes.
- `research_condition` e Variantes não podem ser apresentados como randomização ou efeito educacional.

## Critérios de aceite mínimos

1. Cada capacidade `backend=current` em `BACKEND-COVERAGE.md` possui caminho de UI implementado.
2. Toda rota/ação visível tem teste de destino e estado de erro.
3. Voltar restaura contexto/rolagem; subir nível didático é separado.
4. Overlays devolvem foco ao disparador e fecham por Esc.
5. Controles principais têm área de toque >=44×44 px; foco visível.
6. A largura útil permanece <=430 px em desktop e mobile; uma única rolagem vertical por superfície.
7. Gráficos de Pesquisa têm tabela equivalente e definição da métrica.
8. Nenhuma operação destrutiva ou gravação ambígua destrói rascunho silenciosamente.
9. Testes cobrem os estados do inventário, inclusive vazios, offline, conflito, acesso revogado e falha ambígua.
10. A implementação deve preservar as fronteiras de autorização do backend; visibilidade de controles nunca é autorização.

## Segurança aplicável à interface

Leia `SECURITY-VALIDATION.md`. Preserve as checagens server-side, revisão esperada/idempotência, estados de acesso revogado, autorização de Fonte/PDF e a projeção redigida de Analytics. O Atlas é especificação de UI, não fronteira de segurança.