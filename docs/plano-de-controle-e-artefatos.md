# Plano de controle e artefatos imutáveis

A autoria do AraLearn separa estado transacional de conteúdo volumoso. O
PostgreSQL decide quem pode executar uma operação, qual parte está ativa e qual
revisão está vigente. O Supabase Storage conserva os documentos JSON completos.

Essa divisão evita que a produção de um curso faça o banco analisar, copiar,
indexar ou remontar planos, entregas, auditorias e milhares de cards.

## Onde cada dado fica

O PostgreSQL mantém:

- identidade, proprietário, destino e estado da execução;
- posição, dependências, tentativa e estado de cada parte;
- `requestId`, hash do pedido, lease, cursor e resultado;
- SHA-256, tipo, tamanho, bucket e chave de cada artefato;
- revisão vigente do curso e feed de sincronização;
- permissões, catálogo, biblioteca e progresso.

O Storage mantém, como JSON UTF-8 imutável:

- briefing, plano e trechos do registro;
- especificação, submissão, delta de continuidade e auditoria de cada tentativa;
- documento final validado e revisões dos cursos.

Os buckets `aralearn-authoring-artifacts` e
`aralearn-course-revisions` são privados. O cliente não recebe a service role,
e conhecer um hash não concede acesso ao objeto.

## Endereçamento e integridade

Antes do upload, a Edge Function:

1. rejeita valores que não pertençam ao modelo JSON;
2. ordena recursivamente as chaves dos objetos;
3. serializa números, strings, listas e objetos de forma determinística;
4. codifica o resultado em UTF-8;
5. calcula SHA-256 sobre os bytes exatos.

O caminho é:

```text
artifacts/sha256/ab/cd/abcdef...json
```

O upload nunca usa sobrescrita. Se o objeto já existir, a nova execução cria
somente outra referência. Downloads são conferidos novamente por tamanho,
UTF-8, JSON válido e SHA-256 antes do uso.

Arquivos maiores que 6 MiB usam o protocolo TUS retomável do Storage. O
ArtifactStore não impõe um teto próprio ao objeto; valem somente os limites
inevitáveis do serviço hospedado e do transporte. A autoria continua dividida
em partes retomáveis, sem limite de quantidade de cards derivado do banco.

## Idempotência e concorrência

Toda mutação segue a mesma sequência:

```text
criar request de forma atômica
→ adquirir a única lease do autor
→ gravar artefatos fora da transação SQL
→ confirmar hashes e transição em uma transação curta
→ concluir o request
```

`owner_id + request_id` é único. Uma repetição com outro corpo é rejeitada. Uma
repetição igual observa `accepted`, `running`, `succeeded` ou `failed` e não
repete upload nem validação enquanto a lease estiver ativa. Uma lease vencida
pode ser adquirida pelo mesmo pedido, sem criar uma nova intenção.

Há no máximo uma mutação ativa por execução, para preservar sua ordem causal.
Execuções independentes do mesmo autor podem avançar em paralelo; não existe
quota local de cursos, artefatos ou trabalhos simultâneos por conta.

## Publicação

A validação monta o documento v4 na Edge Function a partir das submissões
aprovadas, executa os validadores e grava a revisão final no Storage. Somente
depois registra `final_document_hash` e muda a execução para `validated`.

A conclusão privada e a publicação oficial não materializam uma árvore SQL.
Elas criam a linha de revisão e trocam o ponteiro vigente do curso na mesma
transação. Uma atualização informa a revisão base; divergência produz conflito
e não altera o curso. O catálogo exige papel editorial e confirmação explícita.

Uma falha antes do commit deixa a revisão vigente intacta. Uma repetição após
resposta perdida lê o request concluído e não publica outra vez.

## Sincronização

`course_revision_sync_changes` informa sequência, curso, operação, escopo e
`revision_hash`. O dispositivo compara o hash com o IndexedDB e só baixa uma
revisão ausente. A revisão é validada antes de substituir a cópia local e o
cursor só avança depois do commit do IndexedDB.

Progresso e demais dados pessoais continuam num fluxo separado do conteúdo.
As linhas de progresso permanecem vinculadas à seleção autenticada e ao curso,
mas não possuem chave estrangeira para lições ou cards remotos: esses
identificadores vêm exclusivamente da revisão validada projetada no IndexedDB.

## Retenção

Objetos que perderam todas as referências de execução, pedido e revisão podem
entrar na coleta de lixo após a retenção configurada. O diagnóstico
`list_unreferenced_artifacts_v3` é somente leitura. A coleta
primeiro chama `release_expired_authoring_artifact_links_v3`: em execuções
publicadas ela preserva o documento final e libera os artefatos intermediários;
em execuções canceladas ou falhas libera todos os vínculos depois do prazo.
Execuções ativas nunca entram nessa etapa. Em seguida,
`claim_unreferenced_artifacts_v3` move os metadados para um tombstone sob trava
curta antes da exclusão física. Enquanto o tombstone existir, o mesmo hash não
pode ser registrado. `complete_artifact_gc_v3` remove o tombstone quando o
objeto desapareceu ou restaura a referência quando o Storage ainda o conserva.

Rascunhos do motor relacional anterior não são migrados. Auth, papéis,
integrações, biblioteca e progresso não fazem parte desse corte destrutivo.
