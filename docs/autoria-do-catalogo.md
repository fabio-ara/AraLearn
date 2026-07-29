# Autoria e publicação

O AraLearn publica cursos a partir de revisões JSON v4 imutáveis. Há duas
entradas: importação de um documento concluído pela biblioteca e autoria
extensa por workspace no gateway MCP.

## Autoria versionada

O assistente pode listar e ler cursos existentes antes de criar conteúdo. Um
workspace pode começar vazio, partir de um curso ou importar vários cursos.
Dentro dele, operações específicas inserem, substituem, renomeiam, movem e
excluem entidades. Também é possível juntar e separar microssequências,
promover módulo a curso e rebaixar curso a módulo.

Cada alteração exige `expectedRevision` e um `requestId`. O conteúdo integral
fica no Storage por SHA-256; PostgreSQL conserva somente ponteiro, histórico,
autorização e resultado idempotente. Não há escrita pedagógica relacional
remota nem merge silencioso.

## Destinos

| Destino | Estado | Resultado |
| --- | --- | --- |
| biblioteca privada | `partial` | prévia estudável, mesmo com microssequências ainda em construção |
| biblioteca privada | `complete` | curso pessoal integral |
| catálogo | `complete` | revisão editorial publicada |

O catálogo recusa `partial`. Atualizar um curso existente exige o hash da
revisão corrente, impedindo sobrescrita acidental.

## Papéis

- uma chave pessoal lê e grava somente workspaces e cursos do proprietário;
- uma chave editorial com `catalog:publish` administra a publicação oficial;
- a service role permanece apenas na Edge Function e em rotinas
  administrativas locais;
- o gateway nunca entrega acesso direto ao banco ou ao Storage.

## Revisão humana

O GPT apresenta por padrão somente as microteorias produzidas e a quantidade
de práticas. A pessoa autora consegue discutir o recorte conceitual sem
receber todos os exercícios no chat. Práticas podem ser lidas sob demanda e
continuam sujeitas aos schemas, às regras didáticas e à validação integral do
documento.

## Administração do catálogo

Coleções, ordem e posicionamento dos cursos continuam sendo metadados
relacionais. O conteúdo do curso é sempre lido do artefato da revisão. Excluir
ou mover uma coleção não reabre a árvore pedagógica.

Fixtures oficiais são validadas e publicadas com:

```powershell
npm run catalog:validate
npm run catalog:publish
```

O comando de publicação cria um workspace determinístico, importa a fixture e
publica a revisão completa com compare-and-swap quando já existe um curso.

Consulte [Gateway MCP de autoria](autoria-mcp.md), [Workspaces e artefatos
imutáveis](plano-de-controle-e-artefatos.md) e [Contrato
público](aralearn-contract.md).
