# AraLearn

AraLearn é uma plataforma de trilhas de flashcards estruturados para quem quer estudar, revisar e construir o próprio percurso de aprendizagem.

Ela foi pensada para o estudo autodidata real: pouco tempo, muitas fontes, pausas frequentes, celular à mão e conexão nem sempre disponível. Em vez de transformar conteúdo em uma sequência solta de cartões, o AraLearn organiza cada assunto como um caminho que pode ser retomado, praticado e, quando necessário, melhorado por quem o estuda.

No AraLearn, a mesma pessoa pode estudar, revisar e criar.

- **Estudante:** seleciona cursos, organiza-os em trilhas pessoais, pratica em etapas delimitadas e continua estudando sem conexão depois do primeiro download.
- **Revisor:** pode comentar, corrigir um card no dispositivo ou participar da
  revisão editorial de um curso quando a conta tiver essa capacidade.
- **Autor:** pode reparar resources e cards no aplicativo; ao selecionar uma
  microssequência ou lição, também pode criar cards ou uma microssequência
  dentro do recipiente autorizado. Planejamento e transformações extensas
  ficam no GPT personalizado com Action ou na integração MCP. Cada envio local válido
  grava somente o recorte selecionado; na autoria remota, cada comando altera
  apenas as partes necessárias do workspace composto.

O pedido nunca amplia a seleção feita pela pessoa. Contrato, validadores e
permissões delimitam o que pode ser gravado no percurso.

## Do assunto ao card

Cada curso é uma árvore didática explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A microssequência é a unidade de estudo central: pequena o bastante para caber entre compromissos, mas com contexto suficiente para ligar explicação, exemplo e prática. Os cards escolhem representações no catálogo acadêmico de packages — como texto anotado, glosa interlinear, matriz, reação química, grafo e mapa de relações — e as combinam somente com formas de resposta pedagogicamente compatíveis.

Na biblioteca, duas formas de organização usam a mesma gramática visual de
grupos e cards, mas atendem a finalidades e permissões diferentes:

- **Coleções** organizam o catálogo oficial. Qualquer pessoa pode consultá-las;
  contas editoriais também podem criar, renomear, ordenar ou retirar grupos e
  cursos oficiais.
- **Trilhas** são pessoais: a pessoa cria, renomeia e ordena seus grupos e
  organiza neles planos, composições em materialização e cursos oficiais
  selecionados. Excluir um grupo não exclui os itens nem o estado de estudo;
  eles passam para **Outros**.
- **Workspaces** reúnem pessoas e autoria com papéis locais, sem duplicar o curso.

Em `Coleções`, adicionar um curso a `Trilhas` é sempre uma ação explícita e cria
somente o vínculo da conta. O botão de abrir ou estudar apenas navega: não
seleciona, copia, move, publica nem reorganiza conteúdo.

## O que já funciona

- autenticação por e-mail, sessão persistida e recuperação de senha;
- catálogo oficial remoto, pesquisa por coleções e seleção leve de cursos;
- trilhas pessoais, retomada, conclusão estrutural, marca **Rever** e observações
  pedagógicas pessoais, sem tempo, tentativas ou histórico de resultados;
- estudo sem conexão após o download inicial, com gravação local confirmada antes de indicar que algo foi salvo;
- sincronização automática e oportunista do estado pessoal quando o app está ativo e há rede;
- autoria integral, com workspace composto, validação estrutural e artefatos de
  publicação imutáveis;
- planos produzidos pelo GPT personalizado com Action ou por clientes MCP e
  cursos privados em `Trilhas`, com
  cursos oficiais disponíveis em `Coleções`;
- gateway MCP que lê, reorganiza e publica cursos por workspaces compostos e
  comandos atômicos;
- integração MCP para clientes compatíveis e GPT personalizado com Action gerada
  do mesmo registro de ferramentas;
- a mesma aplicação JavaScript na web e no APK Android;
- envelope operacional `aralearn.library.v1`, contrato unitário
  `aralearn.course.v1`, protocolo de catálogo `aralearn.resource-library.v1` e
  packages independentes para validação, renderização, avaliação e autoria sob
  demanda.

Por trás dessa experiência, cada publicação existe como um artefato JSON
imutável no Supabase Storage. O PostgreSQL guarda metadados, vínculos, o hash
da revisão publicada e, durante a autoria remota, uma linha corrente para cada
parte do workspace. O dispositivo projeta a publicação no IndexedDB para uso
sem conexão. Estado funcional de estudo, observações e trilhas permanecem separados do
conteúdo.

O resultado é uma plataforma que pode manter muitos cursos sem transformar cada seleção em uma cópia completa na nuvem e que continua útil quando a conexão falha.

## Autoria do catálogo

O AraLearn dispõe de um gateway MCP para construir cursos por partes. O
assistente pode ler o que já existe, copiar uma parte para outro curso, editar
qualquer nível por operações atômicas e recombinar estruturas. Copiar cria uma
parte independente, com novas identidades; mover transfere a parte e remove a
origem na mesma alteração. Não há compartilhamento oculto entre cursos.

Planejamento, construção de uma parte, auditoria independente, reparo e
reauditoria acontecem em rodadas distintas. Cada rodada mostra o resultado e
espera a decisão da pessoa; essas pausas não criam estados ou bloqueios no
backend. Auditoria é somente leitura e reparo altera apenas os problemas
aprovados. Assim que a estrutura é confirmada, o mesmo item aparece em
`Trilhas`; cada parte materializada fica estudável sem publicação, mesmo quando
o restante do plano ainda não foi produzido.

É o mesmo assistente em todas as etapas. A conta conectada determina se ele
pode apenas criar e testar conteúdo privado, enviar uma revisão para avaliação,
assumir uma submissão editorial ou publicar no catálogo. A revisão recebe
somente o artefato explicitamente submetido, não a biblioteca privada inteira.
O assistente não acessa tabelas diretamente nem recebe a chave administrativa
do Supabase.

O MCP remoto autentica a conta por OAuth 2.1 e não oferece chave estática
alternativa. Publicar no catálogo exige permissão editorial separada.
No ChatGPT, a integração MCP recebe instruções do servidor e recupera conhecimento
autoral sob demanda; o GPT personalizado combina instruções e conhecimento
anexados com uma Action OpenAPI fina sobre o mesmo executor e uma concessão
OAuth confidencial compatível com o construtor de GPTs.

O roteiro em linguagem comum está em [Criar cursos pelo
chat](docs/criar-cursos-pelo-chat.md). Ele explica a construção incremental, a
revisão por microteorias, a presença automática em `Trilhas` e a submissão editorial sem exigir
que a pessoa manipule JSON ou nomes de ferramentas.

Cards produzidos por integrações usam envelopes JSON estruturados e
versionados. Uma lacuna declara a instância e o caminho exatos que completa; o
servidor valida o envelope e os contratos versionados dos packages escolhidos,
sem interpretar instruções em português como HTML ou posição visual.

O registry oferece packages de conteúdo e resposta descobertos sob demanda.
Escolhas podem ser simples ou múltiplas e são corrigidas pelo conjunto exato após confirmação da resposta do
estudante. A assistência por API repara o card inteiro ou somente os resources
selecionados. No nível da microssequência, selecionar todos os cards permite
criar até oito cards dentro dela; no nível da lição, selecionar todas as
microssequências permite criar no máximo uma nova, também com até oito cards.
O contexto adjacente permanece somente leitura. **Enviar** valida e grava a
mudança em uma única transação e mostra o resultado no próprio conteúdo. No
card, a conversa volátil conserva até oito turnos e nove versões, com
**Desfazer**, **Refazer** e restauração de uma versão; ela não é persistida nem
sincronizada. Não há tela **Atual/Proposta** nem etapa **Aplicar**. A aplicação
usa o mesmo leitor em cursos privados e do catálogo selecionados em `Trilhas`.
A edição aparece somente quando a conta tem permissão: o dono edita seu curso
privado e uma conta editorial pode editar conteúdo oficial. Prompt e resposta
do serviço não entram na
sincronização pessoal.

O [material de autoria](authoring/README.md) pode ser baixado já organizado para [ChatGPT](docs/downloads/authoring/aralearn-authoring-chatgpt.zip), [Gemini](docs/downloads/authoring/aralearn-authoring-gemini.zip), [Microsoft 365](docs/downloads/authoring/aralearn-authoring-microsoft-365.zip), [Claude](docs/downloads/authoring/aralearn-authoring-claude.zip) ou uma [integração genérica](docs/downloads/authoring/aralearn-authoring-generic.zip). No ChatGPT, o pacote inclui instruções, dois conhecimentos e o OpenAPI da Action; o pacote também descreve separadamente a integração MCP para clientes compatíveis.

Os pacotes explicam como configurar uma integração; não dão acesso automático a nenhum catálogo. Cada instância do AraLearn controla quem pode publicar cursos por meio das permissões do próprio banco.

Workspaces de turma e equipe já permitem papéis locais, comentários situados e
colaboração autoral. O AraLearn não converte esse contexto em vigilância,
ranking ou acompanhamento individual por rastros comportamentais.

## Arquitetura, em uma frase

O PostgreSQL mantém o estado pessoal e o workspace mutável por partes; o
Storage conserva os artefatos imutáveis de publicação, e a submissão aponta
para a revisão privada exata; o IndexedDB projeta cada curso selecionado para
estudo sem conexão.

O site e o APK não levam cursos operacionais embarcados, documentos integrais de progresso ou segredos administrativos. Sem rede, outboxes e filas locais próprias de cada fluxo preservam as alterações. Quando a rede volta, o aplicativo as envia sem duplicar dados e recebe as novidades da conta aos poucos. Para o estado pessoal, vale a última alteração válida confirmada pelo servidor, sem impor ao estudante uma tela de versões ou de combinação manual de dados.

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

Para um percurso curto, escolha seu papel no [guia de
leitura](docs/README.md#comece-pelo-seu-papel).

| Se você quer entender… | Leia… |
| --- | --- |
| o problema, o público e a posição do AraLearn | [Visão do produto](docs/visao-do-produto.md) |
| microssequências, cards e escolhas didáticas | [Modelo didático](docs/modelo-didatico.md) |
| a experiência de autenticação, biblioteca, estudo sem conexão e sincronização | [Uso do app](docs/uso-do-app.md) |
| registrar e interpretar observações situadas nos cards | [Observações pedagógicas](docs/observacoes-pedagogicas.md) |
| catálogo compartilhado, workspaces compostos, artefatos publicados e segurança | [Arquitetura](docs/arquitetura.md) |
| PostgreSQL, projeção e réplica local em IndexedDB, outbox e sincronização | [Persistência relacional e sincronização](docs/persistencia-relacional.md) |
| retomar, marcar para rever e entender o que não é rastreado | [Estado de estudo não punitivo](docs/estado-de-estudo-nao-punitivo.md) |
| contratos e recursos renderizáveis | [Contrato público](docs/aralearn-contract.md) e [Recursos de card](docs/recursos-de-card.md) |
| termos, garantias, limites e evidências técnicas | [Glossário técnico](docs/glossario-tecnico.md) e [Matriz de conformidade técnica](docs/matriz-conformidade-tecnica.md) |
| assistência durante o estudo e autoria pessoal | [Assistência por IA](docs/assistencia-por-ia.md) e [Fluxos, prompts e contratos](docs/fluxos-prompts-e-contratos.md) |
| criar pelo chat, workspaces compostos, MCP e capacidades por conta | [Criar cursos pelo chat](docs/criar-cursos-pelo-chat.md), [Autoria e publicação do catálogo](docs/autoria-do-catalogo.md) e [Gateway MCP de autoria](docs/autoria-mcp.md) |
| participar, convidar e administrar papéis locais | [Workspaces educacionais](docs/workspaces-educacionais.md) |
| fundamentos, literatura, construtos e avaliação | [Revisão de literatura](docs/revisao-de-literatura.md), [Quadro teórico](docs/quadro-teorico.md) e [Protocolo de avaliação](docs/protocolo-avaliacao-artefato.md) |
| contribuição investigada e próximos passos | [Contribuição e originalidade](docs/contribuicao-originalidade.md) e [Estado atual e roadmap](docs/estado-atual-e-roadmap.md) |

O [mapa completo da documentação](docs/README.md) organiza esses caminhos por tipo de leitor.

Publicação web: <https://fabio-ara.github.io/AraLearn/>

## Contribuição

Mudanças entram por ramo temático, com histórico revisado antes da integração. Consulte [CONTRIBUTING.md](CONTRIBUTING.md).
