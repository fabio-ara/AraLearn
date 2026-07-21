# Estado atual e próximos passos

Este documento separa as capacidades operacionais do aplicativo estudantil das ferramentas técnicas do repositório e das fases futuras.

## Implementado no runtime atual

- aplicação web local e publicação em GitHub Pages;
- APK Android por WebView, com o mesmo runtime JavaScript da web;
- autenticação Supabase com cadastro, confirmação, recuperação, sessão persistida e renovação;
- catálogo oficial exclusivamente remoto, pesquisado por coleções e metadados;
- uma única árvore relacional por publicação oficial;
- seleção leve por `user_course_selections`, sem copiar a árvore durante a adição do curso;
- catálogo oficial compartilhado e imutável, com cópia pessoal transacional criada somente na primeira alteração autoral;
- trilhas pessoais, progresso de lições e cards e comentários por card;
- PostgreSQL/Supabase como fonte canônica compartilhada, com RLS e RPCs autorizadas;
- banco IndexedDB separado por UUID de usuário;
- cache local apenas das árvores selecionadas;
- outbox idempotente, bootstrap com high-water e pull incremental paginado;
- sincronização automática e oportunista enquanto o app está visível e online;
- regra de última mutação pessoal válida confirmada pelo servidor;
- estudo, revisão e edição offline depois do primeiro download da árvore;
- cards `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- contrato público `aralearn.contract` v3, normalização, remontagem e validação;
- importação e exportação manual em JSON v3, sem persistência documental;
- edição manual, geração top-down e intervenção bottom-up no runtime completo da web e do APK;
- persistência granular das alterações de cursos pessoais, sem regravar um curso inteiro;
- publicação administrativa de fixtures válidas, fora do runtime e dos artefatos finais;
- testes JavaScript, E2E, SQL, RLS e builds web/Android.

O armazenamento remoto cresce como `catálogo compartilhado + estado pessoal + árvores efetivamente personalizadas`, e não como `catálogo × usuários`. Apenas quem altera conteúdo cria uma árvore pessoal independente; selecionar e estudar um curso oficial não a duplica. O site e o APK não contêm catálogo operacional, service role ou documento integral persistido de curso, progresso ou comentários.

## Ferramentas presentes no repositório

O repositório conserva módulos, contratos, harnesses e benchmarks de geração estruturada por LLM. Parte desses módulos sustenta a autoria pessoal top-down e bottom-up já disponível na interface; os harnesses e benchmarks continuam sendo ferramentas técnicas de pesquisa e teste.

O JSON v3 continua sendo usado pelos validadores e pelo processo administrativo de publicação. Importar uma fixture para o catálogo é uma operação administrativa, não uma funcionalidade pessoal do app.

## Próxima estabilização

Antes de ampliar o produto, as prioridades são:

- validar migrations, RLS e RPCs em um Supabase iniciado do zero;
- medir espaço por tabela e índice com um catálogo crescente;
- testar retomada offline e sincronização entre web e Android;
- ampliar observabilidade de outbox, feed e downloads de árvore;
- amadurecer acessibilidade e experiência em telas pequenas;
- testar atualização de publicação preservando progresso ligado a identidades estáveis.

## Autoria pessoal por cópia sob demanda

Edição granular pelo estudante faz parte do runtime completo. Um curso oficial continua compartilhado enquanto for apenas selecionado e estudado. Na primeira mudança real de conteúdo, o servidor cria transacionalmente um **curso pessoal independente**, com UUIDs próprios, transfere seleção, trilha, progresso e comentários e só então aceita os patches granulares. A interface não cria essa cópia ao abrir a aba de edição nem ao selecionar o curso, e não oferece versionamento, refresh ou merge automático com a origem.

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
- a autoria pessoal assistida reduz esforço sem reduzir revisão humana e qualidade?

As fases futuras devem preservar privacidade, equidade, transparência sobre uso de serviços externos e responsabilidade humana sobre o conteúdo educacional.
