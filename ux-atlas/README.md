# Atlas visual do AraLearn

Artefato temporário de investigação e desenho de UX/UI. Ele não altera o frontend real do AraLearn.

## Referências funcionais

- Estado corrente examinado: `ebd3feed909df9c007d0c09140ba28d3afe2dc61` (`main`, versão 0.0.27 publicada).
- Referência histórica de Estudo: `9e7ddc013d8efcf2918bf2b5b03f506217098e15`, usada apenas para recuperar padrões de navegação que funcionavam bem antes das regressões posteriores.

O atlas distingue:

- **capacidade atual** — comportamento sustentado pelo runtime/documentação corrente;
- **UX proposta** — reorganização visual ou de navegação sem afirmar nova capacidade de domínio;
- **extensão futura** — direção de pesquisa que exige infraestrutura ainda inexistente;
- **dados sintéticos** — números e conteúdo fictícios usados somente para tornar o comportamento visível.

## Como usar

Abra `index.html` diretamente no navegador.

O atlas distingue cinco escalas: **Visão geral**, **Estudo**, **Autoria**, **ChatGPT / MCP** e **Pesquisa**. A Visão geral agora também numera as saídas da tela selecionada; os mesmos números aparecem sobre os controles do mock.

Nos grafos detalhados:

1. selecione um card;
2. apenas as saídas daquele card recebem números;
3. o mesmo número aparece sobre o controle correspondente no mock;
4. clique no controle ou na ação lateral para seguir o fluxo;
5. use `−`, `+`, foco e visão geral para navegar pelo grafo.

Os nomes dos cards não possuem numeração e os rótulos textuais das arestas foram removidos para evitar sobreposição. As descrições das ações ficam no painel lateral.

## Direção de UX consolidada nesta edição

### Estudo

O Estudo não é redesenhado do zero. A proposta recupera e evolui padrões bons do frontend histórico e atual:

- navegação explícita por Curso → Módulo → Lição → Microssequência → Unidade;
- cards de navegação com progresso e ação primária de `play`;
- conteúdo da Unidade ocupando praticamente toda a superfície;
- ferramentas contextuais em ícones consistentes, com nome acessível e tooltip;
- Fontes, Observações, edição e assistência abertas somente quando solicitadas;
- continuidade e uso offline como requisitos de primeira ordem.

### Autoria

A Autoria deixa de ser uma coleção de páginas explicativas e passa a se organizar pelo trabalho sobre objetos do Curso. As superfícies centrais são:

1. **Desenho paramétrico** — quatro parâmetros canônicos como controles quantitativos/fechados, herança por escopo, orientação textual separada e política de recursos junto do desenho;
2. **Inspeção contínua** — várias Unidades renderizadas em sequência, permitindo leitura rápida, edição, assistência, Fontes, Observações e auditoria no próprio contexto;
3. **Pesquisa da autoria** — métricas, séries, proporções, durações e comparações visuais sobre a autoria assistida por IA.

A política de recursos aparece ao lado dos quatro parâmetros porque funciona como variável controlável e pode diferenciar Variantes, mas no domínio corrente ela continua sendo `component_policy`, não um quinto parâmetro canônico.

### Observações e auditoria

Observações são anotações ancoradas no objeto onde surgem: Curso, Módulo, Lição, Tópico, Microssequência, Unidade, Fonte ou Âncora. Na UX proposta, o autor/pesquisador pode registrar uma nota durante a inspeção sem abandonar o fluxo de leitura.

A auditoria pode considerar Observações selecionadas junto da Unidade, plano, parâmetros e Fontes. O atlas representa esse ciclo como:

`inspecionar → observar → auditar → reparar → verificar`.

### ChatGPT / MCP

MCP é a integração conversacional corrente. Actions não fazem parte do produto atual.

Como o ChatGPT não está embutido no AraLearn, o atlas trata o handoff como parte da UX e mostra três disposições possíveis:

- tela de computador dividida entre AraLearn e ChatGPT;
- celular + computador;
- alternância de janelas/abas.

O fluxo deixa explícito que o ChatGPT pode reler o estado corrente, propor parâmetros/recursos/reparos, debater divergências com o autor e só então executar uma alteração confirmada pelo AraLearn.

### Pesquisa

Os Analytics correntes são **Authoring Analytics**. O objeto de pesquisa é a autoria assistida por IA. Observações de estudantes podem entrar como fatos que retroalimentam a autoria, sem transformar o painel em avaliação individual de aprendizagem.

Os sete conjuntos correntes são: atividade, materializações, desenho, Fontes, Observações, auditorias e Variantes. O contrato suporta contagem, duração, razão e porcentagem e exige definição, denominador, dados ausentes e inferências proibidas.

Distribuição experimental de Variantes a grupos e outcomes educacionais aparecem no grafo apenas como **extensão futura**; o runtime atual não implementa participantes, consentimento, atribuição ou inferência causal.

## Graphviz

Os arquivos em `graphs/*.dot` são a fonte editável dos grafos. O Graphviz é usado somente no desenvolvimento do atlas para calcular layout e gerar SVG. Os SVGs são incorporados em `graphs.js`, portanto quem abre o ZIP não precisa instalar Graphviz nem depender de rede.

## Verificação desta edição

Foram verificados:

- sintaxe JavaScript;
- inicialização sem erros de console/runtime;
- seleção de todos os nós dos cinco grafos;
- navegação por controles do mock, inclusive transições entre áreas;
- zoom/pan/foco;
- ausência de overflow horizontal nos mocks;
- visualização representativa em 1440×960, 430×932 e 390×844.


## Ajustes da edição v5

- a tela principal mostra explicitamente o seletor **Estudo / Autoria**, alinhado ao comportamento já existente na Home do AraLearn;
- `Como chegar` mostra uma trilha clicável no painel de detalhe;
- a Visão geral usa a mesma numeração de saídas dos grafos detalhados;
- números das arestas recebem um círculo visual para não se confundirem com linhas;
- a busca de `Meus cursos` foi corrigida (o SVG da lupa não possui mais tamanho implícito do navegador);
- cards de navegação usam o progresso como faixa inferior, deixando título e ação primária mais legíveis;
- `Pessoas` distingue o acesso direto atual de uma futura organização em **grupos/coortes**;
- a proposta futura de coortes mostra um estudo contendo grupos A/B/C e associação a Variantes, sem afirmar que essa infraestrutura já exista.
