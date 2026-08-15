# Auditoria do front-end

Auditar a interface significa verificar sistematicamente se ela cumpre suas finalidades e regras. A auditoria não procura apenas “telas bonitas”: verifica se a pessoa consegue localizar, estudar e alterar conteúdo sem conhecer detalhes internos do sistema.

## Vocabulário inicial

- **front-end** é a parte do sistema apresentada à pessoa no navegador ou no aplicativo;
- **contrato** é uma regra verificável sobre a forma de dados ou o comportamento de uma operação;
- **evidência executável** é um teste ou verificador que pode ser repetido para confrontar uma afirmação com o sistema;
- **token de design** é um nome estável para uma decisão visual, como cor de ação ou espaçamento;
- **IndexedDB** é o banco de dados do navegador usado como réplica local;
- **Playwright** é a ferramenta que automatiza jornadas em um navegador real; um **smoke test** é uma verificação breve das funções essenciais no ambiente implantado;
- **hash** é um resumo calculado de um conteúdo; **cursor** marca uma posição numa leitura paginada; **CAS** (*compare-and-swap*) rejeita uma gravação quando a revisão mudou desde a leitura;
- **JWT** é o token assinado que identifica uma sessão perante o servidor;
- **JSON** é um formato textual de dados; **schema** é o conjunto de regras que descreve sua forma aceita;
- **provider** é o serviço externo que executa um modelo usado pela assistência.
- **reflow** é a reorganização do conteúdo quando a largura, o tamanho do texto ou a ampliação mudam, sem perda de informação nem sobreposição.

Este documento descreve o método, a interface esperada e os limites da evidência. O [sistema visual](sistema-visual.md) detalha tokens e acessibilidade; a [matriz de conformidade](matriz-conformidade-tecnica.md) liga afirmações a código e testes.

## 1. Método de auditoria

Cada requisito é examinado em cinco níveis:

1. **semântica**: o controle representa a tarefa que anuncia;
2. **autoridade**: a ação só aparece e só é aceita quando autorizada;
3. **estado**: carregamento, sucesso, conflito e falha são distinguíveis;
4. **interação**: toque, teclado, retorno, rolagem e foco funcionam;
5. **integração**: IndexedDB, rede e servidor não criam resultados contraditórios.

As evidências recebem pesos diferentes:

| Evidência | O que demonstra | O que não demonstra |
|---|---|---|
| inspeção de código | responsabilidade e fluxo implementados | execução em todos os ambientes |
| teste unitário | regra isolada | integração visual completa |
| Playwright | jornada no navegador e geometria medida | uso prolongado ou diversidade humana |
| smoke remoto | comunicação no ambiente implantado | disponibilidade futura |
| avaliação com pessoas | compreensibilidade e carga percebida | ausência de defeito técnico fora da amostra |

Uma alegação só é chamada de confirmada no escopo que a evidência realmente cobre.

## 2. Modelo de navegação

```text
Trilhas
├── curso ou planejamento
│   └── módulo
│       └── lição
│           └── microssequência
│               └── card
└── painel
    ├── Coleções
    └── Chatbot
```

`Trilhas` reúne organização pessoal e entrada no estudo. `Coleções` apresenta o catálogo e, para contas autorizadas, controles editoriais. Não existe uma segunda tela que replique a mesma biblioteca pessoal.

### Decisão de vocabulário

O front-end expõe conceitos que ajudam a agir: grupo, curso, módulo, lição, microssequência, card e coleção. Estados técnicos como hash, cursor, revisão CAS, `partial` ou `ready` permanecem no protocolo. Quando um conflito exige decisão, a mensagem explica que o conteúdo mudou e precisa ser recarregado; não apresenta apenas o código interno.

Essa abstração reduz carga, mas não pode esconder consequências. Retirar um curso de Trilhas, excluir uma composição privada e retirar uma publicação de Coleções são comandos diferentes e recebem rótulos e confirmações próprios.

## 3. Trilhas e Coleções

### Trilhas

A tela inicial carrega a projeção paginada de grupos, planejamentos, composições e seleções. Um cache por conta substitui a projeção anterior somente quando todas as páginas chegam. Sem rede, o cache é leitura local; não concede autoridade nova.

Grupos e cursos usam ordem alfabética em português. A posição pedagógica dentro do curso continua explícita. Menus contextuais operam no item a que pertencem: criar ou renomear grupo, mover item, editar rótulo e retirar ou excluir quando permitido. Formulários surgem junto ao rótulo e devolvem foco ao acionador.

### Coleções

Coleções é carregada quando sua aba é aberta. Pesquisa, seleção e abertura são o estado comum. Controles de administrar coleção ou publicação dependem de capacidade resolvida no servidor.

Adicionar um curso oficial cria um vínculo leve em Trilhas. Abrir ou tocar Play não adiciona, move, copia nem publica. Essa separação é verificada em `tests/e2e/learning-spaces-panel.spec.js` e `tests/e2e/unified-home-trails.spec.js`.

## 4. Hierarquia e estudo

Curso, módulo, lição e microssequência são superfícies de navegação progressiva. A pessoa vê objetivo e filhos do nível corrente sem precisar percorrer um grafo de autoria.

No card, o Play segue dois estados:

1. confirma a resposta e materializa feedback local;
2. no toque seguinte, avança.

A avaliação não aguarda persistência remota. O estado é gravado na réplica e sincronizado em seguida. Tema, retorno e retomada também operam sem depender de uma requisição pendente. A jornada de latência e falta de rede está em `tests/e2e/study-card-progression.spec.js`.

O cartão preserva posição de leitura quando o feedback aparece. Scroll interno só pertence a resources que precisam manter tamanho natural; tocar fora do frame continua rolando o card.

## 5. Ações contextuais e autoridade

Um controle é exibido quando a ação faz sentido naquele alvo e a conta possui capacidade conhecida. A interface falha fechada: capacidade ausente ou carregamento incompleto não habilita edição destrutiva.

Entretanto, esconder o controle não é a barreira de segurança. Toda escrita remota revalida JWT, relação, capacidade, revisão e estado. O front-end apenas previne tentativa inútil e comunica a autoridade efetiva.

| Alvo | Ações comuns | Condição |
|---|---|---|
| grupo pessoal | criar, renomear, excluir | conta proprietária |
| curso privado | editar, mover, excluir | capacidade sobre a composição |
| curso oficial selecionado | abrir, retirar de Trilhas | vínculo da conta |
| publicação oficial | editar classificação, retirar de Coleções | capacidade editorial |
| parte do workspace | editar texto, estrutura autorizada, observar | revisão e capacidade correntes |

Falha de escrita mantém a superfície de edição e seu texto. Edição textual pode permanecer como mudança local pendente; conflito CAS conserva a proposta e pede reconciliação, sem sobrescrever silenciosamente o remoto.

## 6. Edição situada

**Visualizar**, **Editar** e **Assistência por IA** pertencem à superfície montada
e ocupam o centro da barra superior quando disponíveis. No leitor de cards, o
nome do curso não cria outra linha visual: permanece apenas como contexto
acessível. Voltar permanece à esquerda e o painel global, identificado por um
ícone de áreas, à direita.

### Visualizar

Mostra o resultado do card e os controles de estudo. Não exibe JSON, caminhos de schema ou ferramentas autorais.

### Editar

Um contorno discreto indica a instância escolhida sem alterar sua geometria.
Os rótulos, textos, legendas e descrições visíveis autorizados por
`editableTargets()` recebem cursor de texto e caret exatamente onde já aparecem.
Não surge formulário, painel de campos, caminho de schema ou prévia paralela.
Ids, coordenadas, topologia, tipos de nó e textos apenas acessíveis são contexto
protegido.

### Assistência por IA

A seleção delimita a autoridade:

- instância: somente seus textos declarados;
- card: recomposição completa validada do card;
- cards da microssequência: alteração ou criação dentro dessa microssequência;
- microssequências da lição: no máximo uma nova microssequência no escopo autorizado.

Contexto adjacente pode ser lido, mas não gravado. A conversa conserva uma janela curta de turnos e versões em memória, com desfazer, refazer e restaurar. Resposta do provider é validada contra os contratos e o escopo antes de entrar na árvore.

Os componentes principais estão em `src/ui/renderLessonScreen.js`, `src/render/renderPackageCard.js` e `src/assist/`. As jornadas estão em `tests/e2e/card-assistance.spec.js` e `tests/e2e/authoring-assistant.spec.js`.

## 7. Estados de rede e persistência

O front-end distingue:

- conteúdo disponível localmente;
- mutação local pendente;
- sincronização em curso;
- rejeição determinística;
- conflito de revisão;
- indisponibilidade transitória;
- curso ainda não materializado.

Uma ausência de conexão não bloqueia leitura, tema, resposta, feedback ou avanço já materializados. Uma operação que exige servidor — login novo, assistência remota, publicação ou mudança de permissão — informa a dependência em vez de simular sucesso.

A fila local não é mostrada como jargão de “outbox”; a interface comunica “alteração pendente” ou “sincronização necessária”. Detalhes ficam disponíveis para diagnóstico, não como requisito para estudar.

## 8. Sistema visual e acessibilidade

Componentes usam os tokens de `public/styles-tokens.css`. SVGs funcionais usam `currentColor`. O auditor de resíduos procura cores literais fora da fundação, seletores e ramos órfãos e glifos usados como ícones.

A auditoria cobre:

- claro, escuro e Sistema;
- 360, 390, 412 e 1280 px;
- foco visível e ordem de teclado;
- nome e estado acessíveis;
- alvo de toque;
- zoom e reflow;
- preferência de movimento reduzido;
- recursos complexos com rolagem interna;
- contraste de texto, controles e dados.

Automação de contraste e árvore acessível não substitui leitor de tela nem teste com participantes. A referência normativa é [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 9. Matriz de jornadas

| Jornada | Evidência principal |
|---|---|
| carga e organização de Trilhas | `tests/e2e/unified-home-trails.spec.js`, `tests/e2e/home-course-group-move.spec.js` |
| Coleções e permissões | `tests/e2e/learning-spaces-panel.spec.js` |
| estudo, Play, feedback, offline e retomada | `tests/e2e/study-card-progression.spec.js` |
| edição e assistência situada | `tests/e2e/card-assistance.spec.js`, `tests/e2e/authoring-assistant.spec.js` |
| persistência autoral offline | `tests/e2e/workspace-offline-authoring.spec.js` |
| resources e temas | `tests/e2e/package-visuals.spec.js`, `tests/e2e/table-resource.spec.js` |
| layout da tela inicial | `tests/e2e/home-layout.spec.js` |
| Android e artefato | testes runtime de Android e verificador de implantação |

Os testes não mantêm componentes obsoletos apenas por compatibilidade. O objetivo é uma única interface corrente e uma única responsabilidade por ação.

## 10. Critérios de aprovação

Uma mudança de front-end é aprovada quando:

1. usa vocabulário da tarefa, sem expor implementação desnecessária;
2. mantém leitura e ações frequentes em primeiro plano;
3. não confunde abrir com selecionar, nem retirar com excluir;
4. falha fechada em autoridade, mas não bloqueia operação local por rede;
5. preserva texto diante de falha e conflito;
6. funciona por toque e teclado nas larguras suportadas;
7. oferece nome, estado, foco e contraste acessíveis;
8. atualiza testes de jornada e auditoria de resíduos;
9. não cria componente paralelo para responsabilidade já existente.

## 11. Limites da auditoria

A auditoria de código e navegador demonstra a implementação observada nas fixtures. Ela não comprova que uma pessoa leiga compreende toda representação, que a carga cognitiva é baixa em uso prolongado, nem que uma Edge Function remota permanecerá disponível. Esses aspectos requerem avaliação com participantes, observação de uso, dados operacionais e revisão pedagógica dos cursos produzidos.
