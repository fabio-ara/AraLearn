# Supabase no AraLearn

Supabase fornece PostgreSQL, Auth, Storage e Edge Functions. O aplicativo trata
essas partes como um backend único, mas cada uma responde a um problema
distinto. A interface nunca é a autoridade final de acesso.

## PostgreSQL

O banco conserva o Curso vivo, sua hierarquia, revisões, relações de acesso,
estado pessoal, Fontes, Âncoras, Auditoria, Variantes e fatos de Pesquisa. As
migrations ficam em `supabase/migrations` e o manifesto corrente termina em
`20260824130000_restore_gpt_actions_openapi.sql`.

Escritas relevantes usam revisão esperada e identificador de pedido. A revisão
impede aplicar uma decisão sobre uma composição diferente; o identificador
permite repetir com segurança a mesma operação quando a resposta se perde.

RLS limita as linhas pela identidade autenticada. Funções `security definer`
expõem somente contratos delimitados, fixam `search_path`, validam sessão e
revogam execução pública quando não são uma API intencional.

## Auth e OAuth

A aplicação usa a conta AraLearn. O dispositivo persiste somente os campos de
sessão necessários e renova tokens segundo o contrato do Auth.

MCP e Actions possuem clientes OAuth e transportes distintos. O servidor MCP
anuncia suas ferramentas e desafio; o GPT personalizado usa o documento OpenAPI
e a função de Actions. Uma sessão de um canal não autoriza o outro.

## Storage

O bucket de avatares e o bucket privado `course-source-pdfs` validam caminho,
proprietário, tamanho e tipo. PDFs pertencem a revisões de Fonte. O acesso de
leitura é temporário e a interface mostra somente Fontes autorizadas para a
Unidade.

O preparo de upload cria uma intenção curta e vinculada à sessão. O envio não
aceita caminho arbitrário, troca de proprietário ou reutilização de intenção.
Resíduos de objetos são classificados pela Manutenção antes de qualquer
remoção.

## Edge Functions

| Função | Finalidade | Autorização |
| --- | --- | --- |
| `aralearn-course-api` | operações da aplicação, perfil, ciclo de vida e contratos de Curso | sessão AraLearn |
| `aralearn-authoring-mcp` | protocolo MCP e ferramentas públicas de Autoria | OAuth do MCP |
| `aralearn-authoring-action` | operações OpenAPI do GPT personalizado | OAuth de Actions |

As três funções reutilizam domínio e RPCs canônicos, mas não são aliases. Cada
uma valida envelope, origem e identidade do próprio transporte.

## Desenvolvimento local

Com Docker e Supabase CLI disponíveis:

```bash
supabase start
supabase db reset
npm run test:supabase:smoke
npm run test:authoring:mcp:local
npm run test:authoring:mcp:local:oauth
```

Use a configuração de teste do repositório. Não copie tokens, chaves de serviço
ou dados pessoais para fixtures públicas.

O teste local demonstra migrations, RLS, funções e Storage no ambiente
recriado. Ele não prova que o projeto hospedado recebeu a mesma revisão. Para
isso, aplique a publicação autorizada e execute:

```bash
npm run deployment:verify-hosted
```

## Manutenção e retenção

`current-data-lifecycle-v1` executa lotes limitados e idempotentes de retenção.
`current-administrative-maintenance-v1` apresenta o agendamento e um inventário
classificado a identidades administrativas. A remoção de órfão revalida classe,
caminho e estado imediatamente antes de excluir.

Objetos ausentes são informados, não “corrigidos” por exclusão de metadados. Um
objeto desconhecido também não é removido por semelhança de prefixo.

## Promoção segura

Antes do `db push`, confira o projeto ligado, a lista de migrations e o backup
exigido. Depois, publique apenas as Edge Functions alteradas e execute o
verificador hospedado. Se um check falhar, investigue o estado efetivo antes de
repetir uma escrita.

Os procedimentos de publicação e recuperação estão em [Implantação](implantacao.md).
