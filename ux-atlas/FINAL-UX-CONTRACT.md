# Contrato histórico da rodada final de experiência

Este documento conserva a referência normativa compacta que orientou #152 e
#153. Ele registra como as decisões de #147, #174 e #151–#155 foram traduzidas
em jornadas e critérios de verificação durante aquela rodada. Não é a fonte do
comportamento corrente: para isso, prevalecem o produto, os contratos
executáveis e o [mapa da documentação atual](../docs/README.md).

Base funcional: release `0.0.29`, revisão
`8f21fb21c8713c8efc0f3e0cf4d1bc955a6ff2c6`. Backend, persistência, MCP,
Actions/OpenAPI, Pesquisa, Fontes, Auditoria, componentes didáticos, cópia
pessoal e contratos correntes são preservados por padrão.

## Decisões encerradas pela pesquisa finita

A pesquisa respondeu às seis perguntas de #151 e terminou. Não existe
alternativa de arquitetura pendente.

1. **Encontrar tarefas.** Depois de abrir o Curso, a pessoa encontra as tarefas
   principais como ações nomeadas por objetivo humano, sem memorizar grupos como
   `Curso`, `Revisar`, `Pesquisa` ou `Pessoas`. A Home de Autoria mostra estado,
   próxima ação e todas as entradas principais em um único nível de escolha.
   Isso aplica reconhecimento em vez de memorização e visibilidade do estado.
2. **Manter contexto e posição.** A barra superior informa o objeto atual. A
   superfície Conteúdo preserva a hierarquia Curso → Módulo → Lição →
   Microssequência → Unidade, permite selecionar o elemento estruturado e mantém
   retorno previsível. ATAG 2.0 A.3.4 exige que edição e navegação aproveitem a
   estrutura já presente no conteúdo.
3. **Escolher o recipiente da tarefa.** Edição direta serve a propriedades do
   objeto visível; disclosure revela detalhe secundário; dialog ou sheet serve
   a uma decisão focal e breve; tela própria serve a tarefas com navegação,
   histórico ou estado próprios. Dialog modal prende o foco e o devolve ao
   controle de origem. Conteúdo extenso não vira dialog.
4. **Expor estado e recuperação.** Estado, início, fim, falha e próximo passo
   aparecem junto do objeto. Mudanças destrutivas são reversíveis ou confirmadas;
   erros preservam o original e indicam uma ação possível. Histórico não é
   reduzido ao último evento.
5. **Organizar mobile.** Uma coluna útil de no máximo 430 px, sem sidebar,
   dashboard ou formulário universal. Uma tarefa principal por tela, ações
   frequentes compactas na barra superior, detalhe avançado em disclosure e um
   único rolador vertical principal.
6. **Observar materializações externas.** Materialização é objeto de primeira
   classe: Parte → histórico completo → execução → etapas e fatos → objetos
   produzidos. Canal de origem é atributo da execução. Aplicativo, MCP e Actions
   convergem para o mesmo histórico visual; não criam experiências paralelas.

Fontes consultadas e encerradas:

- [ATAG 2.0](https://www.w3.org/TR/ATAG20/), especialmente A.3.4 e A.4.1;
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), especialmente foco, teclado,
  identificação consistente, reflow e tamanho de alvo;
- [WAI-ARIA APG: toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/),
  [disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) e
  [dialog modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/);
- [heurísticas de usabilidade de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/),
  usadas somente para reconhecimento, estado e controle da pessoa;
- [editor genérico e editores específicos do H5P](https://h5p.org/documentation/for-developers/authoring-tool-customization)
  e [semântica do conteúdo](https://h5p.org/semantics);
- [edição contextual da página de Curso no Moodle](https://docs.moodle.org/403/en/course/view)
  e organização hierárquica por módulos no Canvas.

## Terminologia final

O rótulo de interface é **Assistência por IA**. É a sessão contextual em que um
sistema de inteligência artificial ajuda a discutir, planejar, preparar,
validar e pré-visualizar uma alteração tipada antes de a pessoa decidir
aplicá-la ao rascunho.

Não foi encontrado um equivalente internacional estabelecido que nomeie
exatamente esta interação. *Contextual AI assistance for authoring* é apenas uma
descrição técnica própria do AraLearn. No domínio, **assistência contextual por
modelo de linguagem** é uma descrição técnica válida.
`course_provider_assistance` permanece como símbolo de implementação. O NIST AI
RMF sustenta somente a distinção geral entre sistema de IA e meio técnico; não é
autoridade para o rótulo desta interface.

`API` é meio de acesso; `provider` é o serviço configurado; MCP e Actions são
integrações de autoria distintas. Por isso `Assistência por API`, `Assistente de
IA` e `Copiloto` não são rótulos correntes. Os demais termos estabilizados em
`docs/vocabulario-controlado.md` permanecem inalterados.

## Precedência funcional adotada na rodada

O escopo funcional fixado neste contrato prevalece sobre a conveniência do
recorte técnico. Preservar o backend e seus contratos é a regra por padrão, não
uma proibição de completar a menor extensão vertical necessária. A ausência de
endpoint, RPC ou método público pode ser uma lacuna entre camadas; não autoriza
reduzir silenciosamente a capacidade definida aqui.

Antes de criar uma operação, a rodada exigia procurar o mecanismo canônico em
todo o produto. Se ele fosse insuficiente, completava-se somente a extensão
vertical necessária. Uma decisão normativa incorreta precisava ser revista
explicitamente antes da implementação de uma capacidade menor.

## Modos de Estudo por nível

| Nível | Visualizar | Editar | Assistência por IA | Contrato corrente reaproveitado |
| --- | --- | --- | --- | --- |
| Curso | sim | sim, se autorizado | não | metadados e composição do Curso |
| Módulo | sim | sim, se autorizado | não | metadados e ordem das Lições |
| Lição | sim | sim, se autorizado | sim, se autorizado | metadados, ordem e estrutura das Microssequências |
| Microssequência | sim | sim, se autorizado | sim, se autorizado | objetivo, ordem e estrutura das Unidades |
| Unidade | sim | sim, se autorizado | sim, se autorizado | título, composição e conteúdo renderizável |

O baseline histórico confirma `Visualizar / Editar / IA` como modos situados em
Lição, Microssequência e Unidade. A baseline 0.0.29 preserva a escrita tipada da
Unidade e a assistência estrutural, mas omite `Editar` em níveis anteriores e
coloca seletores com texto dentro do conteúdo. #152 restaura a gramática visual
e liga os modos aos contratos correntes, sem portar handlers ou persistência
históricos.

Os modos ficam na barra superior. Cada botão mostra somente ícone, tem `title`,
`aria-label`, estado perceptível e `aria-pressed`. Os botões toggle permanecem na
ordem normal de Tab, o mecanismo acessível mais simples para este grupo pequeno.
O padrão composite de toolbar, com roving `tabindex` e navegação por setas, só
será usado se uma verificação concreta demonstrar benefício que compense a
interação adicional; a quantidade de três modos, sozinha, não o exige.

## Mapa humano de tarefas de Autoria

Depois de abrir um Curso, a pessoa precisa conseguir:

- compreender estado e próxima ação;
- planejar objetivo, público, escopo, resultados, evidências e Partes;
- ajustar parâmetros, herança, cobertura e política de componentes;
- preparar e explorar a estrutura do Curso;
- abrir uma Parte e acompanhar todas as suas materializações;
- abrir execução, etapas, fatos e objetos produzidos;
- navegar e editar Curso, Módulo, Lição, Microssequência e Unidade;
- usar Assistência por IA no objeto suportado;
- manter Fontes, revisões, Âncoras, PDFs, vínculos e proveniência;
- triar Observações, Auditorias, Achados, correções, verificação e reversão;
- criar e comparar Variantes e examinar Pesquisa com seus limites;
- administrar Pessoas e acessos;
- usar ChatGPT/MCP/Actions conservando Curso, Parte ou objeto de referência;
- operar o ciclo de vida do Curso e acessar Manutenção pela conta quando o papel
  real autorizar.

## Arquitetura de informação única de Autoria

Ao abrir um Curso, a rota inicial é **Visão geral**. Ela mostra identidade do
Curso, estado relevante, próxima ação, Parte/materialização que requer atenção
e a grade compacta das tarefas abaixo. Não é dashboard analítico.

As tarefas principais, todas em um nível de escolha, são:

1. **Planejamento**: objetivo, público, escopo, resultados, evidências, Partes e
   materializações;
2. **Conteúdo**: estrutura, renderer, inspeção e edição contextual consolidados;
3. **Parâmetros e componentes**: valores efetivos, origem, herança, cobertura e
   política;
4. **Fontes**: catálogo, revisões, Âncoras, PDFs e vínculos;
5. **Revisão**: Observações e Auditoria na mesma entrada, mantendo os contratos
   e conceitos distintos;
6. **Variantes e pesquisa**: variantes comparáveis, fatos, definições, tabelas,
   gráficos e exportação;
7. **Pessoas e acesso**: proprietário, acessos diretos, concessão e revogação.

`Estrutura` e `Inspeção` deixam de ser destinos irmãos. **Conteúdo** consolida
hierarquia, leitura e edição sobre o renderer existente, pois são momentos da
mesma tarefa humana. Essa consolidação não funde contratos. Da mesma forma,
`Revisão` consolida o ponto de entrada de Observações e Auditoria sem confundir
os objetos. A barra superior mantém voltar, título do objeto atual e menu de
tarefas; não há sidebar ou navegação principal por grupos abstratos.

## Jornada de materialização

Fluxo normativo:

`Curso → Visão geral → Planejamento → Parte → Materializações → execução → etapas e resultados → objeto produzido`.

O detalhe da Parte lista todas as execuções em ordem decrescente de início, com
estado, canal (`Aplicativo`, `MCP` ou `Actions`), início, término e resumo. O
detalhe da execução traduz etapas e fatos para linguagem de produto, identifica
falha acionável sem stack trace e fornece links para Módulos, Lições,
Microssequências e Unidades produzidos ou alterados. O link abre Conteúdo no
objeto e voltar restaura a mesma execução. Atualização normal relê o histórico;
deep link usa Curso, Parte, materialização e alvo canônicos quando disponíveis.

## Jornadas de aceite

### Estudo

- Home → Curso → Módulo → Lição → Microssequência → Unidade → voltar tela a
  tela;
- subir um nível em cada tela sem consumir o histórico de voltar;
- Home → Retomar → Unidade → voltar à mesma Home e ao controle de origem;
- Visualizar/Editar/Assistência por IA conforme a tabela, com salvar explícito;
- responder, avançar, rever, abrir Fontes e Observações;
- abrir Conta/aparência, trocar avatar e retornar foco.

### Autoria

- criar/abrir Curso e encontrar cada tarefa principal após uma escolha;
- executar as jornadas A–G de #153 por clique e teclado;
- validar mais de uma materialização por Parte, incluindo falha anterior;
- abrir um objeto produzido e voltar à execução;
- confirmar que MCP e Actions aparecem no mesmo histórico visual;
- confirmar que Conteúdo não duplica Estrutura e Inspeção.

## Invariantes executáveis

- conteúdo útil, topbar, Home e cards compartilham arestas com tolerância de 2 px;
- largura útil máxima de 430 px; testes em 360, 390, 430 e 1280 px;
- controles irmãos na toolbar diferem no máximo 1 px em altura e centro vertical;
- botões compactos de modo não contêm texto visível; nomes ficam em
  `aria-label` e `title`;
- alvo de toque mede ao menos 24 × 24 px e prefere `--tap` (44 px) nas ações
  primárias ou isoladas;
- `goBack` não chama nem usa `goUp` como fallback;
- transição que salta níveis registra origem, rolagem e foco;
- Unidade e telas de Autoria usam um único rolador vertical principal em cenário
  normal; conteúdo largo pode rolar horizontalmente;
- dialog modal prende foco, fecha com `Escape` e restaura o controle de origem;
- disclosure expõe `aria-expanded` coerente;
- dock e teclado virtual não encobrem foco ou ação necessária;
- a partir da Visão geral de Autoria, cada tarefa principal exige no máximo um
  acionamento de escolha;
- uma Parte com duas ou mais materializações renderiza todas;
- cada objeto produzido possui link que abre Conteúdo no alvo e permite voltar;
- nenhuma ação principal depende de ID, JSON, hash, endpoint ou nome de tabela;
- interface, títulos e nomes acessíveis usam `Assistência por IA`.

## Screenshots normativos exigidos na rodada

Em 390 e 1280 px, registrar Home de Estudo, Curso, Lição, Microssequência,
Unidade em cada modo, Conta/aparência, Visão geral de Autoria, Planejamento,
Parte, histórico, execução, Conteúdo/objeto produzido, Parâmetros, Fonte,
Revisão, Variantes/Pesquisa e Pessoas. Testes geométricos ampliam Estudo e
Autoria a 360 e 430 px.
