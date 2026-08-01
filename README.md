# AraLearn

AraLearn é uma plataforma de trilhas de flashcards estruturados para quem quer estudar, revisar e construir o próprio percurso de aprendizagem.

Ela foi pensada para o estudo autodidata real: pouco tempo, muitas fontes, pausas frequentes, celular à mão e conexão nem sempre disponível. Em vez de transformar conteúdo em uma sequência solta de cartões, o AraLearn organiza cada assunto como um caminho que pode ser retomado, praticado e, quando necessário, melhorado por quem o estuda.

No AraLearn, a mesma pessoa pode estudar, revisar e criar.

- **Estudante:** seleciona cursos, organiza-os em trilhas pessoais, pratica em etapas delimitadas e continua estudando sem conexão depois do primeiro download.
- **Revisor:** pode comentar, corrigir um card no dispositivo ou participar da
  revisão editorial de um curso quando a conta tiver essa capacidade.
- **Autor:** pode reparar ou criar um card por vez no aplicativo e planejar,
  reorganizar ou publicar estruturas extensas pelo Chatbot personalizado ou
  pelo Plugin MCP. Uma confirmação local produz um rascunho no dispositivo;
  na autoria remota, cada comando altera somente as partes necessárias do
  workspace composto.

Uma sugestão de IA não modifica o curso por si só. O contrato, os validadores e a revisão humana determinam o que pode entrar no percurso.

## Do assunto ao card

Cada curso é uma árvore didática explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A microssequência é a unidade de estudo central: pequena o bastante para caber entre compromissos, mas com contexto suficiente para ligar explicação, exemplo e prática. Os cards podem usar os dezoito recursos canônicos: parágrafo, escolha, composição, código, tabela, fluxo, árvore, grafo, mapa de relações, matriz, plano cartesiano, fórmula, gráfico estatístico, sequência, texto anotado, exemplo linguístico, mapa de sistema e reação química.

Na biblioteca, duas formas de organização atendem a finalidades diferentes:

- **Coleções** organizam o catálogo oficial e são administradas pelo AraLearn.
- **Trilhas** são pessoais: o estudante cria, ordena e agrupa os cursos que selecionou.

## O que já funciona

- autenticação por e-mail, sessão persistida e recuperação de senha;
- catálogo oficial remoto, pesquisa por coleções e seleção leve de cursos;
- trilhas pessoais, progresso por lição e card e comentários por usuário;
- estudo sem conexão após o download inicial, com gravação local confirmada antes de indicar que algo foi salvo;
- sincronização automática e oportunista do estado pessoal quando o app está ativo e há rede;
- autoria integral, com workspace composto, validação estrutural e artefatos de
  publicação imutáveis;
- importação de cursos privados pela aba Trilhas e importação autorizada para o catálogo pela aba Coleções;
- gateway MCP que lê, reorganiza e publica cursos por workspaces compostos e
  comandos atômicos;
- Plugin MCP para qualquer conversa e Chatbot personalizado com Action gerada
  do mesmo registro de ferramentas;
- a mesma aplicação JavaScript na web e no APK Android;
- contrato público `aralearn.contract` v4 para intercâmbio, validação e importação/exportação.

Por trás dessa experiência, cada publicação existe como um artefato JSON
imutável no Supabase Storage. O PostgreSQL guarda metadados, vínculos, o hash
da revisão publicada e, durante a autoria remota, uma linha corrente para cada
parte do workspace. O dispositivo projeta a publicação no IndexedDB para uso
sem conexão. Progresso, comentários e trilhas permanecem separados do
conteúdo.

O resultado é uma plataforma que pode manter muitos cursos sem transformar cada seleção em uma cópia completa na nuvem e que continua útil quando a conexão falha.

## Autoria do catálogo

O AraLearn dispõe de um gateway MCP para construir cursos em workspaces
compostos. O assistente pode ler o que já existe, importar cursos, editar
qualquer nível por operações atômicas, recombinar estruturas e publicar uma
prévia privada incompleta ou uma revisão completa. Copiar cria uma parte
independente, com novas identidades; mover transfere a parte e remove a origem
na mesma alteração. Não há compartilhamento oculto entre cursos.

Planejamento, construção de uma parte, auditoria independente, reparo e
reauditoria acontecem em rodadas distintas. Cada rodada mostra o resultado e
espera a decisão da pessoa; essas pausas não criam estados ou bloqueios no
backend. Auditoria é somente leitura, reparo altera apenas os problemas
aprovados e uma prévia privada continua publicável mesmo incompleta.

É o mesmo assistente em todas as etapas. A conta conectada determina se ele
pode apenas criar e testar conteúdo privado, enviar uma revisão para avaliação,
assumir uma submissão editorial ou publicar no catálogo. A revisão recebe
somente o artefato explicitamente submetido, não a biblioteca privada inteira.
O assistente não acessa tabelas diretamente nem recebe a chave administrativa
do Supabase.

O MCP remoto autentica a conta por OAuth 2.1 e não oferece chave estática
alternativa. Publicar no catálogo exige permissão editorial separada.
No ChatGPT, o Plugin recebe instruções do servidor e recupera conhecimento
autoral sob demanda; o Chatbot personalizado combina instruções e conhecimento
anexados com uma Action OpenAPI fina sobre o mesmo executor e uma concessão
OAuth confidencial compatível com o construtor de GPTs.

O roteiro em linguagem comum está em [Criar cursos pelo
chat](docs/criar-cursos-pelo-chat.md). Ele explica a construção incremental, a
revisão por microteorias, a prévia privada e a submissão editorial sem exigir
que a pessoa manipule JSON ou nomes de ferramentas.

Cards produzidos por integrações usam uma linguagem JSON formal. Uma lacuna é marcada no campo exato do recurso e recebe uma definição estruturada de resposta. O servidor valida e compila essa forma para o contrato v4; não interpreta instruções em português como HTML ou posição visual. Assim, uma prática pode completar uma célula, um trecho de código, um nó, uma aresta, uma matriz ou um elemento de fórmula sem reduzir a atividade a uma pergunta genérica.

O contrato v4 oferece dezoito recursos. Escolhas podem ser simples ou
múltiplas e são corrigidas pelo conjunto exato após confirmação. A assistência
por API repara o card inteiro ou somente os recursos selecionados e também cria
um card dentro ou fora da microssequência atual. O contexto adjacente permanece
somente leitura, a prévia é protegida por fingerprint e nada é persistido antes
da confirmação. No leitor, **Editar** mantém o card visível, permite selecionar
um ou vários cards ou um recurso diretamente na superfície e oferece edição
manual simples, pedido contextual, prévia e uma reversão. **Ler** remove esses
controles sem trocar de tela. A aplicação local é a mesma em cursos privados e em cursos do
catálogo selecionados em `Trilhas`; ela cria um rascunho local explícito, sem
duplicar o curso no servidor nem enviar prompt ou resposta para a sincronização
pessoal.

O [material de autoria](authoring/README.md) pode ser baixado já organizado para [ChatGPT](docs/downloads/authoring/aralearn-authoring-chatgpt.zip), [Gemini](docs/downloads/authoring/aralearn-authoring-gemini.zip), [Microsoft 365](docs/downloads/authoring/aralearn-authoring-microsoft-365.zip), [Claude](docs/downloads/authoring/aralearn-authoring-claude.zip) ou uma [integração genérica](docs/downloads/authoring/aralearn-authoring-generic.zip). No ChatGPT, o pacote inclui instruções, dois conhecimentos e o OpenAPI da Action; o endpoint MCP configura o Plugin independente.

Os pacotes explicam como configurar uma integração; não dão acesso automático a nenhum catálogo. Cada instância do AraLearn controla quem pode publicar cursos por meio das permissões do próprio banco.

Um ambiente docente com turmas, acompanhamento da aprendizagem e colaboração entre autores permanece como etapa posterior.

## Arquitetura, em uma frase

O PostgreSQL mantém o estado pessoal e o workspace mutável por partes; o
Storage conserva os artefatos canônicos de publicação, e a submissão aponta
para a revisão privada exata; o IndexedDB projeta cada curso selecionado para
estudo sem conexão.

O site e o APK não levam cursos operacionais embarcados, documentos integrais de progresso ou segredos administrativos. Sem rede, uma fila local preserva as alterações. Quando a rede volta, o aplicativo as envia sem duplicar dados e recebe as novidades da conta aos poucos. Para o estado pessoal, vale a última alteração válida confirmada pelo servidor, sem impor ao estudante uma tela de versões ou de combinação manual de dados.

A implantação validada usa arquivos estáticos em HTTPS com Supabase gerenciado. GitHub Pages possui publicação automatizada; outro servidor estático ou uma intranet podem servir o mesmo artefato quando atendem aos requisitos de tipos MIME, cache, retorno de autenticação, CSP e acesso ao Supabase. SharePoint/SPFx, Supabase auto-hospedado em produção e outros serviços de banco e autenticação ainda não possuem integração pronta. A [matriz de implantação](docs/implantacao.md#formas-de-implantação) apresenta esses limites.

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

## Documentação

Os documentos abaixo detalham produto, uso, arquitetura, autoria e pesquisa.

| Se você quer entender… | Leia… |
| --- | --- |
| o problema, o público e a posição do AraLearn | [Visão do produto](docs/visao-do-produto.md) |
| microssequências, cards e escolhas didáticas | [Modelo didático](docs/modelo-didatico.md) |
| a experiência de autenticação, biblioteca, estudo sem conexão e sincronização | [Uso do app](docs/uso-do-app.md) |
| catálogo compartilhado, workspaces compostos, artefatos publicados e segurança | [Arquitetura](docs/arquitetura.md) |
| banco relacional, IndexedDB, fila de envio e estudo sem conexão | [Persistência relacional e sincronização](docs/persistencia-relacional.md) |
| contratos e recursos renderizáveis | [Contrato público](docs/aralearn-contract.md) e [Recursos de card](docs/recursos-de-card.md) |
| assistência durante o estudo e autoria pessoal | [Assistência por IA](docs/assistencia-por-ia.md) e [Fluxos, prompts e contratos](docs/fluxos-prompts-e-contratos.md) |
| criar pelo chat, workspaces compostos, MCP e capacidades por conta | [Criar cursos pelo chat](docs/criar-cursos-pelo-chat.md), [Autoria e publicação do catálogo](docs/autoria-do-catalogo.md) e [Gateway MCP de autoria](docs/autoria-mcp.md) |
| fundamentos de pesquisa e próximos passos | [Fundamentos, pesquisa e governança](docs/fundamentos-pesquisa-e-governanca.md) e [Estado atual e roadmap](docs/estado-atual-e-roadmap.md) |

O [mapa completo da documentação](docs/README.md) organiza esses caminhos por tipo de leitor.

Publicação web: <https://fabio-ara.github.io/AraLearn/>

## Contribuição

Mudanças entram por ramo temático, com histórico revisado antes da integração. Consulte [CONTRIBUTING.md](CONTRIBUTING.md).
