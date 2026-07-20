# Estado atual e próximos passos

Este documento separa as capacidades operacionais do aplicativo estudantil das ferramentas técnicas do repositório e das fases futuras.

## Implementado no runtime atual

- aplicação web local e publicação em GitHub Pages;
- APK Android por WebView, com o mesmo runtime JavaScript da web;
- autenticação Supabase com cadastro, confirmação, recuperação, sessão persistida e renovação;
- catálogo oficial exclusivamente remoto, pesquisado por coleções e metadados;
- uma única árvore relacional por publicação oficial;
- seleção leve por `user_course_selections`, sem cópia do curso por usuário;
- cursos oficiais selecionados somente para leitura;
- trilhas pessoais, progresso de lições e cards e comentários por card;
- PostgreSQL/Supabase como fonte canônica compartilhada, com RLS e RPCs autorizadas;
- banco IndexedDB separado por UUID de usuário;
- cache local apenas das árvores selecionadas;
- outbox idempotente, bootstrap com high-water e pull incremental paginado;
- sincronização automática e oportunista enquanto o app está visível e online;
- regra de última mutação pessoal válida confirmada pelo servidor;
- estudo offline depois do primeiro download da árvore;
- cards `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- contrato público `aralearn.contract` v3, normalização, remontagem e validação;
- publicação administrativa de fixtures válidas, fora do runtime e dos artefatos finais;
- testes JavaScript, E2E, SQL, RLS e builds web/Android.

O armazenamento remoto cresce como `catálogo compartilhado + estado pessoal`, e não como `catálogo × usuários`. O site e o APK não contêm catálogo operacional, service role ou documento integral persistido de curso, progresso ou comentários.

## Ferramentas presentes no repositório

O repositório conserva módulos, contratos, harnesses e benchmarks de geração estruturada por LLM. Eles são ferramentas de pesquisa, teste e preparação de conteúdo; não representam criação, importação, edição top-down ou correção bottom-up disponível na UI estudantil atual.

O JSON v3 continua sendo usado pelos validadores e pelo processo administrativo de publicação. Importar uma fixture para o catálogo é uma operação administrativa, não uma funcionalidade pessoal do app.

## Próxima estabilização

Antes de ampliar o produto, as prioridades são:

- validar migrations, RLS e RPCs em um Supabase iniciado do zero;
- medir espaço por tabela e índice com um catálogo crescente;
- testar retomada offline e sincronização entre web e Android;
- ampliar observabilidade de outbox, feed e downloads de árvore;
- amadurecer acessibilidade e experiência em telas pequenas;
- testar atualização de publicação preservando progresso ligado a identidades estáveis.

## Autoria pessoal futura

Edição granular pelo estudante não faz parte do corte atual. Quando for implementada, deverá começar por uma ação explícita que crie um **curso pessoal independente**. Essa ação não será efeito colateral da seleção de um curso oficial e não criará versionamento, refresh ou merge automático com a origem.

## Autoria administrativa futura

Depois da estabilização do banco enxuto, uma tarefa separada poderá implementar este fluxo:

```text
materiais no ChatGPT Business
→ GPT personalizado de autoria
→ Action AraLearn restrita
→ serviço servidor em fragmentos pequenos e idempotentes
→ draft relacional
→ validação integral
→ publicação atômica
```

Esse sistema ainda não existe no runtime, nas migrations ou na configuração atual. Ele deverá usar API estreita, escopos e auditoria; o GPT não poderá acessar tabelas diretamente nem receber service role ou senha de banco.

## Direção de pesquisa

O AraLearn precisa ser avaliado em condições reais de estudo: deslocamento, pouco tempo, conexão intermitente e alternância entre dispositivos. Perguntas centrais incluem:

- a microssequência facilita retomadas curtas e frequentes?
- os recursos visuais melhoram a compreensão de conteúdos estruturados?
- o cache offline e a sincronização oportunista são previsíveis para o estudante?
- o modelo compartilhado mantém baixo o custo de armazenamento com centenas de cursos?
- uma futura autoria assistida reduz esforço sem reduzir revisão humana e qualidade?

As fases futuras devem preservar privacidade, equidade, transparência sobre uso de serviços externos e responsabilidade humana sobre o conteúdo educacional.
