# Arquitetura

A arquitetura do AraLearn foi desenhada para que uma resposta de LLM por API não altere diretamente o estado do usuário. Entre a resposta do serviço e as linhas persistidas há um fluxo de composição, validação, diff, transação e renderização. O PostgreSQL do Supabase é a fonte canônica compartilhada; o IndexedDB é uma réplica relacional offline.

Para o fluxo de geração, consulte [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). Para o formato público de intercâmbio, consulte [Contrato público](aralearn-contract.md). O mapeamento persistido está em [Persistência relacional e sincronização](persistencia-relacional.md).

## Visão geral

O documento raiz do projeto tem este formato:

```json
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "courses": []
}
```

JSON é um formato textual para representar dados estruturados; a documentação da MDN Web Docs (2026) o apresenta como forma legível de organizar objetos, listas e valores. JSON Schema, por sua vez, define regras para esses dados, como campos obrigatórios e valores aceitos (JSON Schema, 2026).

No AraLearn, essa estrutura organiza a árvore didática:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

A mesma visão de domínio serve para organizar o estudo, importar ou exportar material e selecionar contexto para a geração por LLM. Ela é montada em memória a partir de linhas e não é salva como um documento único.

## Responsabilidades

O usuário define escopo, escolhe a etapa, revisa o conteúdo e decide o que fica no projeto.

A LLM por API propõe estrutura, texto, exemplos, exercícios e correções dentro do contexto enviado.

O AraLearn monta a visão de domínio, escolhe o contexto, compõe a saída, valida campos, calcula mutações granulares, persiste apenas as entidades afetadas e apresenta os cards. O backend autentica, autoriza por curso e revisiona as linhas compartilhadas.

Essa divisão evita tratar a resposta da LLM como documento final.

## Camadas de código

A organização do código separa responsabilidades:

| Camada | Função |
|---|---|
| `src/domain/` | Entidades e validações do domínio. |
| `src/contract/` | Contrato público e validação estrutural. |
| `src/model/` | Conversões internas para execução e apresentação. |
| `src/generation/topDown/` | Planejamento de curso, módulos, lições e microssequências. |
| `src/generation/bottomUp/` | Geração e correção de cards dentro de uma microssequência. |
| `src/generation/contracts/` | Contratos transitórios enviados às LLMs. |
| `src/generation/validation/` | Validação estrutural e didática das saídas. |
| `src/generation/repair/` | Reparos mecânicos permitidos. |
| `src/generation/runtime/` | Execução, histórico e aplicação do resultado. |
| `src/render/` | Apresentação dos cards na interface. |
| `src/ui/` | Navegação, autoria e estudo. |
| `src/persistence/` | Normalização e montagem do contrato, diff, transações e repositório relacional. |
| `src/supabase/` | Configuração pública, autenticação, catálogo remoto e cliente HTTP. |
| `src/sync/` | Identidade do dispositivo e sincronização incremental da réplica. |

## Top-down

O fluxo top-down começa com escopo. O usuário informa tema, objetivo, inclusões, exclusões e orientações. A LLM propõe curso, módulos, lições e microssequências. O app valida dependências, fronteiras e coerência estrutural antes de aplicar a proposta.

Esse fluxo não precisa gerar cards. Sua função é transformar intenção ampla em trilha revisável.

## Bottom-up

O fluxo bottom-up começa em uma microssequência aberta. O app monta um contexto local e pede à LLM uma intervenção: gerar cards, corrigir cards, criar apoio ou continuar a próxima etapa.

O resultado passa por composição e validação. Um card de escolha precisa de alternativas e resposta válida. Uma matriz precisa de valores. Um grafo precisa de vértices e arestas coerentes. Um exercício de lacuna precisa ter opções. Se o resultado falha, o app pode pedir correção localizada ou rejeitar a saída.

## Saída estruturada e validação própria

APIs modernas oferecem recursos para respostas estruturadas. A OpenAI (2026) documenta *Structured Outputs*; a Gemini API documenta geração aderente a schema (Google AI for Developers, 2026); e a DeepSeek documenta *JSON Output* (DeepSeek, 2026). O AraLearn se beneficia desse tipo de recurso quando disponível, mas não depende apenas dele.

Mesmo que o serviço devolva JSON válido, o app ainda verifica se aquele JSON faz sentido dentro do contrato do AraLearn e da microssequência ativa.

## Renderização

Renderizar, aqui, significa transformar dados em card visível. O app não precisa receber uma imagem de matriz, grafo ou fluxograma. Ele recebe dados: células, vértices, arestas, nós, pontos, linhas ou blocos. Depois monta a representação na tela.

Essa decisão tem duas vantagens. Primeiro, o conteúdo continua editável e exportável. Segundo, o app consegue validar a estrutura antes de mostrá-la ao estudante.

## Autenticação e catálogo

Sem sessão, o runtime mostra somente a porta de autenticação. Cadastro, confirmação, recuperação, login, renovação e saída usam Supabase Auth com a mesma implementação JavaScript na web e no WebView Android. O runtime recebe apenas a Project URL e a publishable key.

O catálogo é exclusivamente remoto. A tela inicial consulta metadados de cursos oficiais publicados, sem baixar a árvore de todos os cursos. Ao escolher um curso, `clone_catalog_course` cria no servidor uma cópia pessoal transacional, gera novos UUIDs, preserva a identidade de origem e associa a cópia ao usuário. Nenhum curso operacional é empacotado no site ou no APK.

## Persistência relacional

Curso, módulo, lição, tópico, microssequência, dependência, card, bloco e recursos estruturados são linhas com chaves estrangeiras, posição, revisão, `updated_at` e tombstone. Progresso de lição, progresso de card e comentários também são relações independentes. Os `id` textuais do contrato continuam como `contract_key`, separados dos UUIDs persistidos.

Progresso de lição, progresso de card e comentário usam UUIDs determinísticos por usuário + entidade persistida, de modo que dois dispositivos criem a mesma identidade natural. Em `card.topics`, strings livres continuam válidas mesmo sem tópico estruturado correspondente; quando há correspondência na mesma lição, a linha relacional acrescenta a FK sem mudar o contrato público.

A interface pode trabalhar com um `ProjectDocument` montado em memória. Ao salvar, o repositório compara o documento anterior com o posterior e registra operações no menor escopo coerente. Alterar um texto ou uma alternativa muda uma linha; substituir cards valida primeiro o fragmento e troca apenas o card e seus filhos ou a microssequência indicada. O curso inteiro não é serializado para persistir uma correção local.

Microssequências mantêm `revision` para metadados gerais e `cards_revision` para a subárvore de cards. A substituição transacional compara o segundo token, evitando que uma edição independente de título ou dependência gere falso conflito sobre os cards.

## Réplica offline e sincronização

Na web e no Android, o banco IndexedDB `aralearn-relational-v1` replica as tabelas necessárias ao uso local. Cada mutação recebe identificador idempotente e revisão-base, é aplicada em transação local e entra na outbox. O push em lote e o pull por sequência são paginados; o cursor só avança depois da aplicação local atômica.

O banco global guarda somente a sessão/PKCE; cada UUID autenticado usa uma réplica física `aralearn-relational-v1:user:<uuid>`. Salvar produz uma Promise de durabilidade e os estados `pending`, `saved` ou `error`. Logout e fechamento controlado aguardam `flush`; uma falha permanece visível e repetível, e sair não apaga a réplica da conta.

`apply_sync_batch` preserva a ordem causal: captura as revisões no início do lote, reconhece os incrementos produzidos por mutações anteriores do mesmo lote e desfaz o lote inteiro se uma mutação realmente conflitar ou for rejeitada. A bloqueadora fica registrada como conflito; as mutações revertidas ou ainda não executadas continuam pendentes. A exclusão de curso segue a mesma regra com uma operação composta e revisão-base própria, sem apagar a árvore quando o curso remoto mudou.

Uma divergência de revisão não é resolvida por última gravação silenciosa. O estado remoto continua canônico, a intenção local é preservada e o dispositivo registra as duas versões em `conflicts`. Depois da primeira sincronização, a árvore já replicada e as novas mutações permanecem utilizáveis sem rede.

Todas as tabelas expostas têm RLS. Usuários autenticados podem ler cursos oficiais publicados; uma cópia pessoal só pode ser lida ou alterada pelo proprietário ou membro autorizado. Service role, senha de banco e outros segredos administrativos não fazem parte do runtime.

## Falhas

O estado anterior deve permanecer intacto quando uma intervenção falha. Uma resposta truncada, um JSON inválido, um campo fora do contrato ou um exercício malformado não deve substituir linhas já aprovadas. Conflitos de sincronização também precisam permanecer visíveis e recuperáveis.

## Referências citadas

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

MDN Web Docs. (2026). *Working with JSON*. <https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
