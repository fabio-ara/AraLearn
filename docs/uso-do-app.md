# Guia de uso do app

Este guia descreve o uso do AraLearn no estado atual do produto.

## Estrutura de navegacao

O app trabalha com cinco niveis:

```text
curso -> modulo -> licao -> microssequencia -> card
```

Cada nivel tem uma funcao:

- `curso`: organiza uma trilha ampla;
- `modulo`: agrupa um bloco coerente;
- `licao`: concentra a governanca didatica local;
- `microssequencia`: concentra a progressao estudavel;
- `card`: e a unidade interativa.

## Home

Na home, o usuario normalmente:

- abre um curso existente;
- cria curso vazio;
- importa estrutura ou backup;
- abre o painel estrutural de geracao.

O painel da home serve para top-down amplo. Ele nao e o lugar de materializacao local de cards.

## Curso e modulo

Em curso e modulo, o painel estrutural continua fazendo sentido quando o usuario quer reorganizar ou ampliar a trilha.

Exemplos:

- criar modulos e licoes a partir de material novo;
- aprofundar um curso a partir de anexos;
- reorganizar uma trilha ampla.

## Licao

A licao e o principal centro de governanca didatica do produto.

Ela concentra campos como:

- `sourceGuideStructured`
- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`
- `domainMap`

Na pratica, isso significa que vale revisar a licao antes de exigir qualidade da IA. Uma licao mal orientada tende a gerar resultado difuso.

## Painel estrutural

O painel estrutural esta disponivel a partir da home e de pontos contextuais de curso, modulo e licao.

Ele permite:

- fixar escopo;
- anexar fontes;
- escrever prompt ou orientacao;
- escolher modelo/provider;
- disparar geracao estrutural.

No estado atual, esse painel deixa explicito que o top-down:

- organiza a trilha;
- planeja microssequencias;
- nao materializa cards por padrao.

## Top-down na pratica

O fluxo normal de top-down e:

1. escolher o escopo;
2. anexar ou descrever o material;
3. gerar a estrutura;
4. abrir o resultado;
5. navegar pelas licoes e microssequencias planejadas.

O resultado nao precisa sair como curso inteiro pronto para estudo. O primeiro ganho real e a trilha organizada.

## Microssequencias planejadas

Uma microssequencia pode aparecer vazia.

Isso nao significa erro. Significa que ela foi `planejada`, mas ainda nao foi `materializada`.

O usuario pode:

- navegar por ela;
- entender o que vem depois;
- escolher onde quer comecar;
- abrir o runtime local para materializar o conteudo.

## Runtime da microssequencia

Ao abrir uma microssequencia, o usuario entra no workbench local.

Ali ele pode:

- estudar cards ja existentes;
- materializar uma microssequencia planejada;
- corrigir uma microssequencia;
- expandir com novos cards;
- reformular a proposta;
- editar o foco local;
- abrir a proxima microssequencia planejada.

## Estudo e intervencao no mesmo ambiente

Esse e um ponto importante da UX do produto.

No AraLearn, estudo e autoria nao estao totalmente separados.

O usuario pode:

1. estudar;
2. travar num ponto;
3. abrir o painel local;
4. pedir ajuda localizada;
5. voltar para a execucao.

Isso faz o estudo ficar mais proximo de uma construcao guiada do que de consumo passivo.

## Materializar, corrigir, expandir, reformular

No runtime local, essas acoes tem papeis diferentes:

- `materializar`: criar o conteudo de uma microssequencia planejada;
- `corrigir`: reparar deslocamento ou falha local;
- `expandir`: acrescentar explicacao, pratica ou contraste;
- `reformular`: refazer a proposta local quando ela ficou ruim.

Essas acoes nao devem ser confundidas com regenerar a licao inteira.

## O que entra no estudo

Nem tudo o que existe na arvore entra automaticamente no estudo.

Em termos praticos:

- microssequencias `draft` ficam fora do estudo;
- microssequencias com `included: false` tambem ficam fora;
- cards so aparecem na execucao quando a microssequencia ja foi materializada e esta apta a estudo.

## Iteracoes geradas

Quando a IA gera ou altera conteudo local, o resultado nao precisa ser aceito cegamente.

O usuario pode:

- revisar a iteracao;
- manter a versao;
- descartar a iteracao gerada.

## Fontes e anexos

O fluxo estrutural aceita texto e anexos para ingestao.

Na pratica, isso cobre:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Quando a extracao vier parcial, o sistema pode avisar.

## Configuracao de IA

O app oferece configuracao de provider e modelo.

O caminho mais simples e usar provider por API.

O caminho avancado e usar `Codex CLI local`, quando o usuario quer operar com bridge local.

Mais detalhes:

- [Assistencia por IA](assistencia-por-ia.md)
- [Codex CLI local](codex-cli.md)

## Formatos didaticos

Os cards podem usar formatos diferentes conforme a licao:

- texto;
- multipla escolha;
- codigo;
- tabela;
- arvore;
- fluxograma;
- plano cartesiano;
- matriz.

No produto, isso nao deve ser lido como decoracao. E parte da modelagem didatica.

## Exportacao e backup

Dois formatos importam:

- `aralearn.contract`: estrutura portavel;
- `aralearn.storage`: backup completo do estado local.

Use `contract` quando quiser portar ou publicar estrutura.
Use `storage` quando quiser preservar o ambiente como um todo.

## Melhor forma de usar hoje

Um fluxo produtivo, hoje, costuma ser:

1. preparar a licao ou o material;
2. ajustar governanca da licao quando necessario;
3. gerar a trilha estrutural;
4. abrir a licao desejada;
5. navegar por microssequencias planejadas;
6. materializar a que interessa;
7. estudar e intervir localmente;
8. continuar pela proxima planejada.

## Leituras complementares

- [Visao do produto](visao-do-produto.md)
- [Arquitetura](arquitetura.md)
- [Contrato publico](aralearn-contract.md)
