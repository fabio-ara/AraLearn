# Assistencia por IA

Este documento explica como o AraLearn usa LLMs no estado atual do produto.

## Tese central

No AraLearn, a LLM nao ocupa o lugar de autora soberana da didatica.

Ela entra como componente gerador sob restricao:

- recebe contexto;
- recebe contrato ou artefato intermediario;
- responde em JSON restrito;
- passa por validacao;
- so entao pode afetar o projeto.

Essa decisao e tecnica e pedagogica ao mesmo tempo.

## Por que a IA e contida

Pedidos amplos demais tendem a produzir:

- deriva;
- repeticao;
- falsa completude;
- texto fluente, mas didaticamente pobre;
- pouca rastreabilidade;
- pouca previsibilidade em modelos leves.

O AraLearn reage a isso deslocando parte da inteligencia para a arquitetura.

## Dois papeis distintos da LLM

### 1. LLM no top-down

Aqui a LLM ajuda a organizar material amplo em trilha:

- cursos;
- modulos;
- licoes;
- microssequencias planejadas;
- sinais de progressao, contraste, pratica e cobertura.

Ela nao precisa materializar cards por padrao para cumprir esse papel.

### 2. LLM no runtime local

Aqui a LLM atua sobre uma microssequencia concreta, durante o estudo.

Ela pode:

- materializar;
- corrigir;
- expandir;
- reformular;
- editar localmente.

Esse segundo papel e mais dialogico. O usuario estuda, encontra um problema e pede uma intervencao localizada.

## O que vai para o modelo

No AraLearn, o pedido enviado ao modelo nao e apenas um prompt livre. Ele e acompanhado por artefatos estruturados.

No fluxo estrutural, isso pode incluir:

- `intent`
- `sourceLedger`
- `lessonPlans`
- `courseGraph`
- `lessonGovernance`
- `microsequencePlans`
- `interventionPlan`

No fluxo local, pode incluir:

- contexto da licao;
- `sourceGuideStructured`;
- `domainMap`;
- metadados da microssequencia;
- tipo didatico selecionado;
- pedido local do usuario;
- anexos.

## JSON e especificacao intermediaria

Um dos pontos fortes do produto hoje e justamente este: a LLM nao recebe uma arvore inteira sem forma. Ela recebe especificacoes intermediarias pequenas.

Isso aproxima o app de uma logica de desenvolvimento orientado por especificacao:

- primeiro o sistema define a estrutura da tarefa;
- depois a LLM preenche ou repara dentro desse recorte;
- depois o app volta a validar o que recebeu.

## Top-down estrutural

No fluxo top-down, o `CourseForge` organiza o trabalho em fases.

Em alto nivel:

1. resolve intencao e escopo;
2. ingere fontes;
3. deriva governanca local;
4. planeja microssequencias;
5. audita cobertura e ordem;
6. repara quando necessario;
7. compila patch;
8. aplica no projeto.

O que interessa aqui e a mudanca de semantica:

- a LLM ajuda a planejar a trilha;
- o top-down nao precisa pre-gerar cards;
- a trilha fica navegavel antes de ficar completamente materializada.

## Runtime local e autoria dialogica

Quando o usuario entra numa microssequencia planejada ou pronta, o fluxo deixa de ser macroorganizacao e vira intervencao local.

Esse e o ponto em que o estudo pode assumir uma especie de dialetica guiada:

- a estrutura previa diz o que vem antes e depois;
- o usuario aponta duvida, erro ou preferencia;
- a LLM responde no interior desse recorte;
- o app preserva a trilha como moldura.

Nao e uma conversa livre com uma IA genérica. E uma conversa situada dentro de um percurso didatico ja arquitetado.

## Auditoria e reparo

O produto usa auditoria para reduzir dois riscos:

- erro estrutural;
- deslocamento didatico.

As checagens podem incluir:

- schema e forma do JSON;
- coerencia de microssequencia e card;
- aderencia minima a fonte;
- cobertura e progressao;
- pratica ausente ou repeticao sem funcao nova;
- contrastes e prerequisitos quando aplicavel.

Quando necessario, pode haver:

- reparo deterministico;
- reparo assistido pelo provider;
- bloqueio antes da aplicacao.

## Papel do usuario na auditoria

O app nao trata auditoria automatica como substituto de revisao humana.

O usuario ainda pode:

- revisar o que foi criado;
- editar governanca;
- intervir no runtime local;
- aceitar ou descartar iteracoes;
- excluir ou manter microssequencias fora do estudo.

## Ingestao e grounding

Quando a geracao parte de fontes, o AraLearn faz uma camada previa de ingestao.

Hoje isso inclui:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Parsers open source usados no projeto:

- `pdfjs-dist`
- `mammoth`

O app nao promete um sistema pesado de RAG. O que ele tenta fazer e grounding minimo rastreavel o bastante para tornar a transformacao menos opaca.

## Providers suportados

O fluxo publico atual contempla:

- Gemini por API;
- `Codex CLI local` via bridge HTTP.

O provider local e tratado como integracao avancada. O caminho normal do usuario comum continua sendo provider remoto por API.

## O que a documentacao publica afirma com seguranca

Ela pode afirmar com seguranca que:

- a LLM esta subordinada a contratos e validacoes;
- o top-down estrutural ja existe como fluxo publico real;
- o runtime local ja concentra a materializacao progressiva da trilha;
- a autoria humana continua no centro do produto.

Ela nao deve afirmar que toda checagem automatica equivale a entendimento semantico forte. O produto trabalha com mediacao arquitetural, nao com onisciencia do modelo nem do auditor local.

## Leitura complementar

- [Arquitetura](arquitetura.md)
- [Guia de uso do app](uso-do-app.md)
- [Fundamentos e evidencias](fundamentos-e-evidencias.md)
- [Codex CLI local](codex-cli.md)
