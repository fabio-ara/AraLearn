# Matriz de rastreabilidade pedagógica

Esta matriz liga problemas educacionais, hipóteses, implementação e avaliação.
`Evidência` não significa prova de eficácia do AraLearn. Quando a literatura não
sustenta diretamente uma decisão do produto, a linha é marcada como hipótese a
ser avaliada.

## Entradas iniciais da renovação do front-end

| ID | Problema e contexto | Evidência ou construto | Hipótese de design | Mecanismo | Interpretação permitida | Interpretação proibida | Avaliação e custo | Rastreabilidade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | estudante-trabalhador usa celular pequeno em ambiente sujeito a interrupção | carga cognitiva extrínseca; revisão sistemática de UI para mobile learning | menor densidade e hierarquia progressiva reduzem esforço operacional sem retirar funções | base visual neutra, poucos elementos simultâneos, Central progressiva e ações contextuais | passos, erros de operação e percepção podem indicar usabilidade | aparência minimalista não prova aprendizagem nem menor carga cognitiva | teste de jornada, escala subjetiva e entrevista; nenhum dado histórico novo | #60; `docs/auditoria-front-end.md`; testes Playwright |
| UX-02 | a pessoa não sabe se um curso está em construção, publicado, submetido ou oficial | visibilidade do estado do sistema; learner agency como linha de investigação | uma projeção comum dos estados correntes aumenta compreensão e controle | Central: Em construção, Em Trilhas, Em avaliação, Em Coleções e Neste dispositivo | capacidade de localizar e explicar o estado pode indicar compreensão do fluxo | abrir a Central ou permanecer nela não indica atenção, domínio ou engajamento | tarefas de localização e explicação; payload paginado, sem persistência adicional | #60, #74; `get_current_state_central_v1`; `list_current_state_central_v1`; testes PGlite e Playwright |
| UX-03 | tema único pode ser inadequado ao ambiente, preferência ou necessidade visual | evidência de polaridade é dependente de tarefa, iluminação e pessoa | oferecer claro, escuro e sistema é mais defensável que declarar um modo universal | tokens semânticos, escolha local e contraste verificado nos dois modos | preferência, legibilidade percebida e desempenho na tarefa podem ser comparados por contexto | modo escuro não é automaticamente mais acessível; modo claro não é universalmente superior | testes de leitura e recursos em iluminação variada; poucos bytes locais para a preferência | #60; `docs/sistema-visual.md`; galeria de resources |
| UX-04 | assistência em aba separada retira o estudante do card que motivou a correção | contiguidade, carga extrínseca e agência; hipótese específica do artefato | edição contextual reduz troca de contexto e torna o escopo compreensível | modo Editar, seleção no card e caixa inferior com escopo explícito | tempo, erros e relato da jornada podem avaliar atrito | uso da IA não prova dificuldade ou aprendizagem; pedido não autoriza aplicação automática | um/múltiplos cards, offline, falhas e reversão; payload limitado ao escopo | #61; leitor e assistência atômica |
| UX-05 | controles autorais durante estudo podem competir com teoria e prática | coerência e carga extrínseca; hipótese a validar no AraLearn | separar Ler e Editar preserva foco sem retirar agência | Ler limpo; Editar explícito e reversível | compreensão dos modos e incidência de ações acidentais podem ser avaliadas | menos controles visíveis não prova menor carga nem melhor aprendizagem | teste comparativo das jornadas; nenhum armazenamento adicional | #60, #61; testes mobile e acessibilidade |
| UX-06 | ícones misturados e sem rótulo visível podem ser ambíguos para pessoas leigas | consistência, reconhecimento e acessibilidade | um vocabulário SVG coerente com nomes acessíveis reduz ambiguidade | set único, `currentColor`, `aria-label` e rótulo quando necessário | reconhecimento de ações e erros de escolha podem indicar clareza | familiaridade do projetista não prova compreensão do usuário | teste por persona, teclado e leitor de tela; impacto estático pequeno | #60; registro de ícones |

## Fontes verificadas para estas entradas

- Ahmad Faudzi, M., Che Cob, Z., Omar, R., Sharudin, S. A., & Ghazali, M.
  (2023). Investigating the user interface design frameworks of current mobile
  learning applications: A systematic review. *Education Sciences, 13*(1), 94.
  <https://doi.org/10.3390/educsci13010094>
- Piepenbrock, C., Mayr, S., & Buchner, A. (2014). Smaller pupil size and better
  proofreading performance with positive than with negative polarity displays.
  *Ergonomics, 57*(11), 1670–1677.
  <https://doi.org/10.1080/00140139.2014.948496>
- Xie, X., Song, F., Liu, Y., Wang, S., & Yu, D. (2021). Study on the effects of
  display color mode and luminance contrast on visual fatigue. *IEEE Access, 9*,
  35915–35923. <https://doi.org/10.1109/ACCESS.2021.3061770>
- World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines
  (WCAG) 2.2*. <https://www.w3.org/TR/WCAG22/>

As fontes de sistemas de design orientam engenharia e acessibilidade, mas não
são tratadas como evidência de aprendizagem. Elas constam em
`docs/sistema-visual.md`.
