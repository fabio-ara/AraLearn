# Auditoria e correções do Curso

## Finalidade e limite

O ciclo de auditoria confronta uma Unidade de estudo existente com o plano, os
parâmetros, a intenção representacional, as Fontes, as Âncoras e as Observações
selecionadas no estado corrente do Curso. Ele registra evidência pública,
localiza um achado, permite propor uma correção pequena, aplica essa correção
somente após confirmação e exige uma nova rodada para verificar o resultado.

O ciclo não atribui nota ao Curso, não mede aprendizagem, compreensão,
proficiência, atenção ou carga cognitiva e não certifica eficácia educacional.
Uma rodada sem achado informa apenas que os critérios registrados tiveram os
resultados declarados naquela revisão.

## Sequência autoritativa

```text
Observação opcional e situada
  → contexto corrente da Unidade
  → rodada imutável com checks públicos
  → achado aberto quando um check falha ou permanece incerto
  → proposta versionada de correção
  → aplicação confirmada sobre a Unidade ainda corrente
  → nova rodada de verificação
  → achado resolvido ou novamente aberto
```

Observação, achado, correção e verificação são objetos diferentes. Responder ou
resolver uma Observação não corrige o Curso. Registrar um achado não concede
autoridade para alterar conteúdo. Aplicar uma correção não prova que o achado
foi resolvido; somente `verify_finding` pode registrar essa conclusão.

## Contexto focal e quatro dimensões

Antes de registrar uma rodada, o servidor recompõe um contexto owner-only da
Unidade. Ele inclui a versão e o hash do alvo, seu caminho curricular, a
Microssequência, o plano focal, os parâmetros efetivos, a orientação, a intenção
representacional, as atribuições correntes de Fontes e até 12 Observações
selecionadas. Um hash liga o comando exatamente a esse contexto. Mudança de
revisão, alvo, plano, parâmetro, proveniência ou Observação exige releitura.

Cada check conserva critério público versionado, resultado, adequação, evidência
pública e referências exatas de plano, parâmetro e Fonte. As dimensões são:

- `structural_conformance`, calculada deterministicamente pelo servidor;
- `pedagogical_quality`, registrada por revisão humana ou automática explícita;
- `factual_quality`, registrada com a evidência factual pertinente;
- `editorial_quality`, registrada sobre clareza e consistência do recorte.

Os resultados são `passed`, `failed`, `uncertain`, `not_applicable` e
`not_checked`. A interface registra as três dimensões humanas; a Edge Function
acrescenta exatamente um check estrutural antes da RPC. `not_checked` nunca é
convertido em conformidade.

## Evidência factual e proveniência

Uma conclusão factual positiva exige Fonte e Âncora correntes, ativas e exatas
no contexto focal. Para uma afirmação, a relação admissível é `supported_by`.
`quoted_from` só é admissível no critério específico de fidelidade de citação;
ela não sustenta, por si só, a verdade da afirmação citada.

Resolver um achado factual exige que o check focal da nova rodada resulte em
`passed` e continue obedecendo à mesma cerca de proveniência. O sistema prova a
identidade, a revisão, a relação e a localização usadas no check. Não prova
autoria científica, qualidade da Fonte ou competência disciplinar de quem
avaliou.

## Rodada, achado e decisão

Uma rodada em `private.course_instructional_audit_runs` é imutável. Ela guarda
tipo `audit|verification`, origem `human_audit|automatic_audit`, método
versionado, revisão do Curso, hash do contexto, alvo, caminho, checks e número
de achados criados. Raciocínio privado, prompt bruto, transcript e cadeia de
pensamento não pertencem ao registro.

Rodadas com zero achados continuam enumeráveis. A lista paginada mostra alvo,
método, contagens por resultado e quantidade de achados; o detalhe da rodada
devolve todos os checks e suas evidências. Assim, “checado sem achado” não some
da interface nem é confundido com “nunca auditado”. Achados e rodadas podem ser
filtrados opcionalmente pela Unidade focal.

`audit_cycle` possui os modos `context|findings|runs|detail`. `findings` e
`runs` usam cursor e aceitam `targetStudyUnitId` opcional. A página separa a
lista `runs` de `runDetail`; em `detail`, exatamente um entre `findingId` e
`auditRunId` deve estar presente.

Um check `failed|uncertain` pode abrir no máximo um achado. O achado guarda a
rodada e o check de origem, gravidade, alvo observado, referências opcionais de
Observações e versões append-only. Seus estados são:

```text
open → awaiting_verification → resolved
  │              │                 │
  └→ dismissed   └→ open           └→ open
```

`dismissed` conserva a decisão de dispensar o caso; `reopen` cria outra versão
aberta. `awaiting_verification` significa somente que uma correção foi aplicada.
Uma verificação `still_open` ou um rollback devolve o achado a `open`.

## Correção autoral e checkpoint

Uma correção v1 edita apenas o conteúdo próprio e as atribuições de Fontes de
uma Unidade de estudo já existente. Ela não cria, exclui, move ou renumera
entidades, não altera pai ou posição e não transporta campos relacionais. O
campo legítimo `topics` da Unidade é preservado; `sources` continua fora do
conteúdo e aparece somente em `sourceLinks`.

A proposta registra uma justificativa e um checkpoint com:

- `before`: conteúdo e proveniência realmente lidos, inclusive referência
  legada histórica quando ela ainda integra o estado anterior;
- `after`: conteúdo proposto e somente Fontes e Âncoras atuais e resolvidas;
- hashes de ambos os snapshots.

Proposta sem diferença é recusada. Ajustar ou rejeitar cria nova versão da
mesma correção; o estado anterior não é reescrito. Os estados são
`proposed|rejected|applied|verified|rolled_back`. Aplicar exige que alvo,
versão, hash e proveniência ainda correspondam ao checkpoint. Conteúdo,
atribuição, versão da Unidade, revisão do Curso, evento e recibo confirmam ou
revertem juntos.

Depois da aplicação, a nova rodada precisa reler o estado corrente. `resolved`
exige o mesmo critério focal, agora `passed`; `still_open` exige `failed` ou
`uncertain`. Um rollback só é permitido enquanto conteúdo e proveniência ainda
correspondem ao snapshot aplicado. Ele restaura o checkpoint `before`, cria
outra versão da correção, reabre o achado e registra a mudança do Curso. O
rollback não apaga a aplicação nem a verificação anteriores.

## Relação com Observações e privacidade

`private.course_audit_finding_annotations` liga um achado a versões exatas de
Anotações ancoradas. O vínculo ajuda a preservar a origem situada, mas a
Observação não se torna evidência factual nem autoridade de correção.

Uma Observação retirada permanece temporariamente como tombstone redigido. Até
a limpeza física, o achado a projeta como `available:false`, sem link profundo.
Quando o tombstone é apagado fisicamente, o `ON DELETE CASCADE` remove o vínculo
e a identidade da Observação deixa de aparecer nas projeções futuras do
achado. O achado, a rodada e a correção permanecem.

Dispensar, reabrir, verificar ou reverter pode devolver
`suggestedAnnotationActions` com `resolve|reopen`. Essas ações são sugestões
somente. A pessoa precisa executar depois um comando explícito de Anotação
ancorada, com a versão corrente; o ciclo de auditoria nunca muda a Observação
implicitamente.

## Autoridades privadas e minimização

Quatro relações privadas são suficientes para o ciclo:

| Relação | Autoridade |
| --- | --- |
| `course_instructional_audit_runs` | rodadas imutáveis |
| `course_audit_findings` | versões append-only de achados e decisões |
| `course_audit_finding_annotations` | vínculo focal entre achado e Observação |
| `course_authoring_corrections` | versões append-only, checkpoint e fatos de aplicação, verificação e rollback |

As quatro usam RLS forçada e não possuem grants diretos. A API chama somente as
duas RPCs service-role owner-only. Exclusão do Curso aplica cascade. Exclusão
da pessoa autora torna os campos de ator anuláveis sem apagar a evidência
instrucional.

O ciclo reutiliza `private.course_change_receipts` para idempotência; não cria
um ledger ou receipt paralelo. `private.course_events` recebe somente aplicação
e rollback, que realmente mudam o Curso. Registrar, decidir, propor, rejeitar e
verificar avançam `audit_set_version`, mas não simulam uma alteração do
conteúdo.

## Interface, rotas e offline

A sétima área da Autoria continua no destino canônico
`section=observations`. Seu rótulo visível é **Auditoria e correções**, com duas
abas: **Observações** e **Achados**. Assim, o novo ciclo não cria uma oitava área
nem separa a manifestação situada do lugar em que ela pode ser selecionada para
uma auditoria.

O link de uma Observação usa `section=observations&annotationId=...`; o de um
achado usa `section=observations&findingId=...` e pode selecionar uma correção
com `correctionId=...`; o de uma rodada usa
`section=observations&auditRunId=...`. No detalhe, `findingId` e `auditRunId`
são mutuamente exclusivos. Fontes e Âncoras abrem `section=sources`; a Unidade
abre a Inspeção. Combinações extras ou incompatíveis falham fechado, e um link
que ultrapasse o orçamento do contrato é devolvido como indisponível.

Observações continuam com cache e outbox próprios. Auditoria, achados,
correções e verificação são estritamente online e owner-only: não há store,
réplica, outbox ou autoridade de auditoria no IndexedDB. Sem rede, a última tela
já renderizada é somente evidência transitória; ações ficam desabilitadas e uma
releitura autoritativa é obrigatória.

## MCP e operações fechadas

O MCP permanece com exatamente seis ferramentas. O ciclo entra nas duas já
existentes:

- `lerCurso` com `view: "audit_cycle"` lê contexto, achados, rodadas ou o
  detalhe exclusivo de um achado ou de uma rodada;
- `alterarCurso` com `operation: "update_audit_cycle"` executa um dos sete
  comandos do domínio.

Os comandos são `record_audit`, `propose_authoring_correction`,
`reject_authoring_correction`, `decide_finding`,
`apply_authoring_correction`, `verify_finding` e
`rollback_authoring_correction`. No MCP, somente aplicar e desfazer exigem
`auditCommand.confirmed:true` depois de confirmação humana explícita. A Edge
remove esse campo antes do domínio; os outros cinco comandos o recusam.

## Limites e quotas

As cercas principais são simultâneas no domínio, na Edge e no PostgreSQL:

- até 24 itens por página, cursor opaco de até 240 caracteres e página ou
  mudança de até 240 KiB;
- até 12 Observações no contexto e por achado, 16 achados por rodada e 32
  checks após o check estrutural do servidor;
- comando de até 192 KiB, snapshot de até 48 KiB, checkpoint de até 96 KiB e
  recibo compacto de até 64 KiB;
- até 256 rodadas por Curso, com reserva para verificar correções aplicadas;
- até 1.024 identidades de achado, 64 identidades de correção por Curso e oito
  por achado;
- históricos projetados limitados, sem apagar as versões persistidas.

Esses tetos tornam custo, transação e egress mensuráveis. Eles não demonstram
sustentabilidade prolongada no Supabase Free Plan nem justificam retenção
indefinida.

## Corte limpo e evidência de engenharia

A migration `20260817210000_course_audit_corrections.sql` instala o ciclo novo
somente sobre o Curso canônico. O preflight bloqueia e reconta 26 famílias de
resíduo do modelo anterior. Todos os blockers de auditoria, desenho,
materialização e correção precisam estar vazios; apenas a contagem bruta de
`observation_threads` pode existir, desde que nenhuma thread conserve referência
de correção.

Runs, findings, mandatos, manifests e ResourceSets substituídos não são lidos,
copiados ou usados como fallback. A existência física de uma arquitetura
anterior não lhe devolve autoridade no Curso canônico.

O domínio `src/domain/courseAuditCycle.js` e seu espelho Edge congelados nesta
revisão possuem SHA-256
`6EB5E85E34FD77D915276DB8FFC9FA3B82E7257025C661ABDBFC923002E92AD9`.

A verificação da fatia precisa cobrir domínio e espelho Edge, PGlite,
PostgreSQL real, RLS, CAS, replay, stale, quotas, privacidade da junção,
preservação de conteúdo/Fontes, aplicação, verificação, sugestões explícitas,
rollback e a interface real em 360, 390, 430 e 1280 px. Automação demonstra
somente os cenários codificados; revisão disciplinar e avaliação humana
continuam necessárias.

Veja também:

- [Contratos públicos de conteúdo](aralearn-contract.md);
- [Autoria por MCP](autoria-mcp.md);
- [Persistência relacional e sincronização](persistencia-relacional.md);
- [Privacidade](privacidade.md);
- [Matriz de conformidade técnica](matriz-conformidade-tecnica.md).
