# Princípios de interface do Atlas final

Âncora funcional: `ebd3feed909df9c007d0c09140ba28d3afe2dc61` (`main`, AraLearn 0.0.27).

Esta edição não usa a v10/v11 como arquitetura. Ela usa o sistema visual e as superfícies atuais do repositório como contrato, preservando apenas decisões anteriores que continuam coerentes.

1. **Visibilidade do estado:** toda tela responde “onde estou, o que posso fazer e o que mudou”.
2. **Reconhecimento > memória:** capacidades aparecem pelo objeto e pela tarefa; ninguém precisa memorizar nove áreas de Autoria.
3. **Controle e liberdade:** voltar preserva contexto; subir nível didático é ação diferente; overlays fecham sem destruir a tela de origem.
4. **Consistência:** mesma ação, mesmo ícone/nome/comportamento; ações irmãs ficam no mesmo eixo.
5. **Prevenção de erro:** operações destrutivas, cópia pessoal, conflito de revisão e resultado incerto têm estados próprios.
6. **Divulgação progressiva:** metadados, filtros, proveniência e ações secundárias aparecem quando necessários.
7. **Densidade móvel:** composição útil até 430 px, uma rolagem vertical; comparações largas rolam apenas localmente.
8. **Acessibilidade:** controles principais >=44×44 px; foco visível; texto não depende de cor; gráficos têm tabela equivalente.
9. **Backend e UI separados:** a existência de uma capacidade não obriga uma aba permanente; exige um caminho claro e verificável.
10. **Pesquisa sem inferência indevida:** fatos de autoria/materialização não são tratados como aprendizagem.

## Referências externas usadas como teste de decisão

- Nielsen Norman Group — Ten Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- W3C — WCAG 2.2: https://www.w3.org/TR/WCAG22/
- GitHub Primer — ActionBar, ActionList, ActionMenu, Dialog e Overlay: https://primer.style/product/components/
- Material Design 3 — referência de sistema de componentes: https://m3.material.io/

O documento `docs/sistema-visual.md` do próprio AraLearn prevalece: composição de até 430 px, quatro grupos de Autoria, Inspeção como sequência finita, Pesquisa com gráfico+tabela+fatos e controles principais de 44 px.