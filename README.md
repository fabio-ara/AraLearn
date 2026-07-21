# AraLearn

**AraLearn é uma plataforma de trilhas de flashcards estruturados para quem quer estudar, revisar e construir o próprio percurso de aprendizagem.**

Ela foi pensada para o estudo autodidata real: pouco tempo, muitas fontes, pausas frequentes, celular à mão e conexão nem sempre disponível. Em vez de transformar conteúdo em uma sequência solta de cartões, o AraLearn organiza cada assunto como um caminho que pode ser retomado, praticado e, quando necessário, melhorado por quem o estuda.

O mesmo usuário ocupa três papéis complementares.

- **Estudante:** seleciona cursos, organiza-os em trilhas pessoais, pratica em etapas delimitadas e continua estudando sem conexão depois do primeiro download.
- **Revisor:** pode comentar, corrigir ou pedir uma intervenção no ponto em que encontra um problema. Em geral, a revisão alcança uma microssequência e é validada antes de ser gravada.
- **Autor:** pode planejar conteúdo, editar a estrutura e usar assistência de linguagem configurada no aplicativo. O curso oficial permanece protegido; a primeira alteração autoral cria uma cópia pessoal independente.

Essa combinação é deliberada: o AraLearn não trata o estudante apenas como consumidor de material pronto, nem entrega à IA autoridade pedagógica sem controle. O modelo pode propor; o contrato, os validadores e a revisão humana decidem o que pode entrar no percurso.

## Do assunto ao card

Cada curso é uma árvore didática explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A microssequência é a unidade de estudo central: pequena o bastante para caber entre compromissos, mas com contexto suficiente para ligar explicação, exemplo e prática. Os cards podem combinar texto, código, tabela, matriz, plano cartesiano, grafo, mapa de relações, fluxograma ou árvore.

Fora da árvore, duas camadas tornam a biblioteca utilizável em escala:

- **Coleções** organizam o catálogo oficial e são administradas pelo AraLearn.
- **Trilhas** são pessoais: o estudante cria, ordena e agrupa os cursos que selecionou.

## O que já funciona

- autenticação por e-mail, sessão persistida e recuperação de senha;
- catálogo oficial remoto, pesquisa por coleções e seleção leve de cursos;
- trilhas pessoais, progresso por lição e card e comentários por usuário;
- estudo sem conexão após o download inicial, com gravação local confirmada antes de indicar que algo foi salvo;
- sincronização automática e oportunista do estado pessoal quando o app está ativo e há rede;
- autoria da estrutura e revisão localizada, com validação de estrutura e persistência granular;
- a mesma aplicação JavaScript na web e no APK Android;
- contrato público `aralearn.contract` v3 para intercâmbio, validação e importação/exportação.

Por trás dessa experiência, uma publicação oficial existe uma única vez no PostgreSQL/Supabase. Selecionar um curso grava apenas o vínculo da conta; o dispositivo mantém uma réplica relacional para uso sem conexão. Progresso, comentários e trilhas ocupam pouco espaço. Uma cópia pessoal independente só é criada quando há uma alteração autoral efetiva.

O resultado é uma plataforma que pode manter muitos cursos sem transformar cada seleção em uma cópia completa na nuvem e que continua útil quando a conexão falha.

## O que vem depois

O AraLearn já possui a superfície pessoal de autoria. A próxima frente, separada do aplicativo de estudo, é a autoria administrativa de cursos oficiais: materiais e referências poderão alimentar um GPT personalizado, inclusive em fluxos apoiados por consulta a fontes externas. O modelo enviará partes verificáveis a uma API restrita. O destino será sempre um rascunho relacional validado e uma publicação integral; o modelo não terá acesso direto ao banco.

Também pertencem a uma fase futura o servidor docente, turmas, indicadores de aprendizagem e múltiplos autores. Essas ideias não são descritas como recursos já entregues.

## Arquitetura, em uma frase

O PostgreSQL/Supabase é a fonte canônica compartilhada; o IndexedDB mantém, para cada conta, uma réplica que permite estudar sem conexão; o JSON v3 é o contrato público e a visão de domínio em memória, não o documento persistido pelo aplicativo.

O site e o APK não levam cursos operacionais embarcados, documentos integrais de progresso ou segredos administrativos. Sem rede, uma fila local preserva as alterações. Quando a rede volta, o aplicativo as envia sem duplicar dados e recebe as novidades da conta aos poucos. Para o estado pessoal, vale a última alteração válida confirmada pelo servidor, sem impor ao estudante uma tela de versões ou de combinação manual de dados.

## Começar localmente

```bash
npm install
npm run dev
```

O aplicativo precisa da URL pública do projeto Supabase e da chave pública de acesso. A configuração e os cuidados de implantação estão em [Supabase: desenvolvimento e implantação](docs/supabase.md).

Validação principal:

```bash
npm test
npm run lint
npm run validate:example
npm run validate:cutover
npm run catalog:validate
npm run test:e2e
npm run pages:build
npm run android:debug
```

## Ler sem repetir

O README apresenta a proposta e o estado do produto. Os documentos abaixo aprofundam uma pergunta de cada vez.

| Se você quer entender… | Leia… |
| --- | --- |
| o problema, o público e a posição do AraLearn | [Visão do produto](docs/visao-do-produto.md) |
| microssequências, cards e escolhas didáticas | [Modelo didático](docs/modelo-didatico.md) |
| a experiência de autenticação, biblioteca, estudo sem conexão e sincronização | [Uso do app](docs/uso-do-app.md) |
| catálogo compartilhado, cópia pessoal e a arquitetura de segurança | [Arquitetura](docs/arquitetura.md) |
| banco relacional, IndexedDB, fila de envio e estudo sem conexão | [Persistência relacional e sincronização](docs/persistencia-relacional.md) |
| contratos e recursos renderizáveis | [Contrato público](docs/aralearn-contract.md) e [Recursos de card](docs/recursos-de-card.md) |
| assistência de linguagem, contexto e limites da autoria futura | [Assistência por IA](docs/assistencia-por-ia.md) e [Fluxos, prompts e contratos](docs/fluxos-prompts-e-contratos.md) |
| fundamentos de pesquisa e próximos passos | [Fundamentos, pesquisa e governança](docs/fundamentos-pesquisa-e-governanca.md) e [Estado atual e roadmap](docs/estado-atual-e-roadmap.md) |

O [mapa completo da documentação](docs/README.md) organiza esses caminhos por tipo de leitor.

Publicação web: <https://fabio-ara.github.io/AraLearn/>

## Contribuição

Mudanças entram por ramo temático, com histórico revisado antes da integração. Consulte [CONTRIBUTING.md](CONTRIBUTING.md).
