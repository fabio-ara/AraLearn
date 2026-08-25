# Identidade visual de Estudo — referência histórica

Este documento preserva a baseline visual usada na rodada de UX encerrada.
Termos, caminhos e instruções abaixo registram aquele período e não têm
autoridade sobre a experiência vigente. Para o estado atual, consulte o
[sistema visual](../docs/sistema-visual.md), o
[guia do estudante](../docs/guia-estudante.md) e os contratos executáveis.

Naquela rodada, esta referência complementava o Atlas para que a implementação
preservasse também a linguagem visual e interacional que tornava Estudo
simples, e não somente suas capacidades.

## Regra de autoridade usada na rodada

- **Funcionalidade, dados, autorização e persistência:** `main` atual e contratos fechados em #151.
- **Cobertura e navegação do frontend:** `ux-atlas/`.
- **Identidade visual/interacional de Estudo:** baseline histórico `9e7ddc013d8efcf2918bf2b5b03f506217098e15`, reaplicado aos componentes atuais.
- **Tokens, acessibilidade e responsividade:** `docs/sistema-visual.md` e estilos atuais.

Não restaurar Workspace, Trilhas, rotas, schemas, APIs ou persistência antigos.

## Evidência histórica concreta

### Área principal

No baseline, `src/ui/renderHomeScreen.js` usa `home-product-switch` com dois controles irmãos:

- **Estudo**;
- **Autoria**.

Esse padrão deve permanecer como seletor compacto de área principal. A entrada atual de Estudo pode conservar seletor de Curso e prévia rica; o requisito é a identidade da troca Estudo/Autoria, não a antiga arquitetura de Cursos.

### Modos de conteúdo

No baseline, `src/ui/renderLessonScreen.js` define um único `renderEntityModeSwitcher` com:

- **Visualizar** (`preview`);
- **Editar** (`edit`);
- **Assistência por IA** (`sparkles`).

A gramática era usada em Lição, Microssequência e Card. O Card corresponde conceitualmente à atual Unidade de estudo. O baseline também possuía compositor de pedido contextual em Lição/Microssequência, em vez de obrigar a pessoa a sair do objeto para conversar com a IA.

A implementação final recupera essa gramática como **segmented control/toggle de modos pares**. No produto atual, usar **Assistência por API** quando a ação executa provider configurado no aplicativo.

## Mapeamento para o código atual

Não portar handlers antigos.

- **Visualizar:** renderer/runtime atual de `src/study/CourseStudyScreen.js`.
- **Editar Unidade:** `manualStudyUnitEdit` e fluxo manual atuais.
- **Assistência por API:** `CourseProviderAssistance`, sessão contextual, providers/relay correntes e extensões verticais da Unidade, Microssequência e Lição.
- **Composição estrutural:** contrato canônico corrente de composição do Curso; estender somente onde a aplicação esteja limitada artificialmente à edição focal.
- **Componentes didáticos:** catálogo, contratos, validação e prévia correntes de `consultarComponentesDidaticos`.
- **Cópia pessoal:** contratos atuais implementados após #149.
- **Fontes/Observações/Rever/progresso/offline:** mecanismos atuais.

Não criar segundo editor, segundo renderer, segundo catálogo ou um chat genérico paralelo ao runtime.

## Assistência por API como modo situado

`Assistência por API` não é um botão de geração instantânea. É um modo contextual que mantém a pessoa no objeto corrente.

A superfície deve continuar simples:

1. o seletor `Visualizar / Editar / Assistência por API` permanece compacto;
2. depois de escolher Assistência, aparece uma área de conversa curta com caixa de pedido;
3. escopo atual é visível em linguagem de produto (`Unidade`, `Microssequência` ou `Lição`);
4. provider/modelo e detalhes de conexão ficam em divulgação progressiva;
5. conversa/plano, proposta de mudança e prévia visual são estados distintos;
6. JSON, schemas, IDs e nomes internos de pacotes não aparecem como interface normal;
7. aplicar/descartar/desfazer/salvar só aparecem quando fazem sentido no estágio atual.

Um turno da conversa pode apenas explicar, discutir ou refinar. Alteração só é preparada depois de confirmação explícita da pessoa.

### Unidade

A assistência pode mudar texto e composição de componentes didáticos. Mesmo quando a escrita estiver limitada a um componente, a LLM recebe a Unidade completa como contexto somente leitura e contexto curricular compacto suficiente para compreender o papel daquela Unidade.

### Microssequência

A assistência pode propor quantidade, ordem, função didática e conteúdo das Unidades. A prévia deve permitir compreender a Microssequência resultante antes de aplicar.

### Lição

Adicionar/remover/reordenar Microssequências é alteração da Lição. A ação pode começar a partir de uma Microssequência, mas deve indicar o alcance, por exemplo `Adicionar Microssequência depois desta`, sem sugerir que a nova irmã é parte interna da Microssequência atual.

## Geração segura de componentes

Para modelos leves, não despejar catálogo e schemas inteiros no contexto.

A experiência pode fazer várias chamadas por uma única proposta, mas a pessoa vê um fluxo simples:

**discutir → confirmar proposta → preparar → validar → pré-visualizar → aplicar**.

Internamente, reutilizar descoberta progressiva de componentes e carregar somente contratos exatos. Saída estruturada da LLM passa pelos validadores correntes e pelo renderer. Erro reparável pode retornar ao modelo em ciclo pequeno e finito; composição inválida nunca vira prévia aceita nem persiste.

## Requisitos visuais

1. `Visualizar` é o modo inicial e mantém o runtime limpo.
2. `Editar` e `Assistência por API` ocupam o mesmo nível semântico de `Visualizar` quando autorizados.
3. Trocar de modo não muda Curso/Lição/Microssequência/Unidade nem perde posição.
4. Ações internas aparecem somente depois que o modo é escolhido e não competem com o seletor principal.
5. Unidade, Microssequência e Lição usam a mesma gramática visual sem confundir seus escopos de mutação.
6. A identidade deve ser reaplicada à Autoria por família visual: densidade, cards, tipografia, segmented controls, iconografia, superfícies e ações compactas; não copiar funções impróprias de Estudo.
7. Uma única coluna útil, aproximadamente 430 px; nada de dashboard/desktop sidebar.
8. O minichat e a prévia precisam funcionar em celular sem cobrir permanentemente o conteúdo ou criar duas rolagens principais concorrentes.

## Anti-regressão

A implementação não está autorizada a simplificar removendo modo funcional ou reduzindo Assistência por API a edição textual quando os contratos finais suportarem composição/estrutura.

Também não está autorizada a resolver essa ampliação com editor low-code, JSON exposto, nova biblioteca de UI ou arquitetura paralela. Reutilize o runtime, o catálogo, a composição e os validadores correntes.

## Referências relacionadas

- #61 — modos Ler/Editar e assistência contextual, seleção de cards, caixa de pedido e operações canônicas.
- #148 — restauração da entrada de Estudo.
- #149 — edição contextual e cópia pessoal sobre a arquitetura 2.0.
- #151 — contratos finais, contexto e geração progressiva.
- #152 — implementação do frontend final.
- #153 — validação das jornadas reais.
- #174 — gate contra overengineering.
