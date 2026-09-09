# Preferências, resolução e configuração aplicada na autoria

Preferências pessoais definem como iniciar um trabalho de autoria. Decisões fixadas no curso, condições de pesquisa, configuração aplicada às unidades e perfis salvos têm responsabilidades próprias. O [contrato contextual](autoria-contextual.md) descreve essas distinções e os locais de acesso desejados.

O domínio em [authoringProcessPreferences.js](../src/domain/authoringProcessPreferences.js) e a [migração de preferências](../supabase/migrations/20260909025429_contextual_authoring_process_preferences.sql) implementam normalização, armazenamento por conta e resolução com o desenho do curso. Interface, adapter e canais precisam consumir esses contratos; a presença desses arquivos, por si só, não comprova integração nem implantação hospedada.

## Dimensões independentes

| Dimensão | Valores e significado |
| --- | --- |
| Foco (`focus`) | `content`: trabalhar bases explicativas/fontes; `full_cycle`: continuar também desenho, unidades e revisão no recorte autorizado. |
| Organização do fluxo (`cadence`) | `microsequence`, `part`, `batch`: objeto/recorte pelo qual organizar o trabalho. Não altera tamanhos, frequência de pausa ou pontos de revisão. |
| Pontos de revisão (`reviewPoints`) | Conjunto de `curricular_map`, `explanation`, `study_unit`. Pode ser vazio. Indica onde inspecionar, sem declarar revisão, conceder acesso ou exigir comentário. |
| Parâmetros (`parameters`) | Os cinco parâmetros de produção/conversa do catálogo existente, cada um com modo `automatic` ou `fixed` e valor admitido pela própria definição. |

Os cinco parâmetros são `alvo_palavras_conversa`, `preferencia_da_conversa`, `alvo_microssequencias_por_parte`, `alvo_partes_por_lote` e `frequencia_de_pausa`. Seus IDs técnicos, tipos, limites e opções vêm de [courseDesignParameters.js](../src/domain/courseDesignParameters.js), selecionados pelos grupos `conversation` e `cadence`. Este módulo não cria novas definições desses parâmetros nem inclui parâmetros de conteúdo na preferência pessoal de processo.

Na ausência de preferência salva, o produto devolve foco `full_cycle`, organização `part`, os três pontos de revisão e os cinco parâmetros em `automatic/null`. São padrões iniciais de produto, identificados como tal; não afirmam que a pessoa já escolheu esse processo. Valores numéricos de referência do catálogo não são convertidos automaticamente em valores fixos.

## Persistência e fronteira de acesso

`private.authoring_process_preferences` guarda uma linha por conta: preferências normalizadas, revisão e data de atualização. Sua exclusão acompanha a exclusão da conta. A migração conserva todos os parâmetros já presentes nos cursos e perfis, sem inferir um default pessoal a partir de escolhas de cursos diferentes.

| Operação de serviço | Entrada | Retorno |
| --- | --- | --- |
| `get_authoring_process_preferences_for_actor_v1` | `p_actor_id uuid` | `{contract, revision, preferences, updatedAt}`; revisão zero e data nula indicam preferência ainda não salva. |
| `save_authoring_process_preferences_for_actor_v1` | `p_actor_id uuid`, `p_expected_revision bigint`, `p_preferences jsonb`, `p_request_id text` | `{contract, revision, requestId, changed, idempotent, preferences, updatedAt}`. |

As duas RPCs permitem execução somente ao serviço; a identidade da pessoa vem da autenticação resolvida pelo adapter. A tabela privada tem RLS forçada e acesso direto revogado. O serviço verifica a existência da conta. Essa fronteira segue a convenção atual do projeto e exige preservar os grants ao integrar novos clientes. As orientações de [privilégios e funções do Supabase](https://supabase.com/docs/guides/database/functions) documentam por que uma função exposta deve ter permissões explícitas e caminho de schemas definido.

A gravação verifica a revisão esperada. O hash do pedido é calculado no banco sobre as preferências normalizadas e essa revisão. O recibo existente de mudanças guarda a identidade da solicitação: repetir a mesma escrita devolve o resultado anterior; reutilizar a identidade com outro conteúdo é recusado. Gravar uma preferência idêntica já salva não incrementa a revisão. A primeira gravação cria a escolha explícita da conta, mesmo quando coincide com o padrão inicial.

O save não altera revisão do curso, atribuições de desenho, unidades, bases ou perfis. Aparência e sincronização continuam preferências locais do dispositivo.

## Resolução com curso e mandato

`resolveAuthoringProcessPreferences({account, courseDesign, mandate})` recebe a preferência da conta e uma leitura autoritativa validada de desenho. Usa `effectiveAssignment` dos cinco parâmetros de processo; a precedência entre os escopos continua pertencendo ao contrato de desenho, sem uma segunda implementação de herança.

Quando existe uma atribuição efetiva do curso, seu modo e valor regem aquele parâmetro. Na ausência de atribuição, vale a preferência pessoal. A condição de curso conserva origem, motivo e escopo no resultado. Um valor anteriormente escolhido em modo automático permanece inspecionável na condição, mas não vira uma nova preferência pessoal fixa.

O retorno usa `aralearn.authoring-process-resolution.v1` e contém:

- `preferences`: processo que rege a continuação, incluindo o snapshot de mandato quando fornecido;
- `currentPreferences`: resolução que resultaria dos dados pessoais e do curso correntes;
- `source`: `product_default`, `account` ou `mandate`;
- `courseConditions`: decisões efetivas de processo, com origem, motivo e escopo;
- `personalPreferencesChanged`: a revisão pessoal mudou desde o acordo;
- `courseConditionsChanged`: mudou uma condição de processo do curso, sem reagir à simples alteração de texto em outro campo do curso;
- `conflicts`, `researchConflicts` e `requiresReconciliation`: incompatibilidades que a continuação precisa resolver.

`createAuthoringProcessMandate(resolution, preferences?)` produz um snapshot estreito, com curso, revisão pessoal, preferências acordadas e condições do curso. O argumento opcional permite uma exceção explícita de fluxo, por exemplo trabalhar só as bases nesse mandato. Uma condição de pesquisa não pode ser contrariada. O chamador registra esse snapshot com a intenção do fluxo vigente; o domínio não cria tabela de sessões ou outro writer.

Se a preferência pessoal mudar durante um mandato, o resultado preserva o processo já acordado e informa a mudança. A UI ou o assistente pode mostrar a diferença e incorporar uma alteração explicitamente combinada. Mudança nas condições do curso exige conciliação; o resultado conserva o acordo anterior para inspeção e não o aplica silenciosamente contra uma condição nova. Perfil salvo continua sendo uma cópia explícita e independente desse snapshot.

## Normalizadores e contratos

| Exportação | Uso |
| --- | --- |
| `normalizeAuthoringProcessPreferences` | Valida foco, organização, pontos únicos e os cinco parâmetros completos, ordenando pela fonte canônica. |
| `normalizeAuthoringProcessPreferencesRead` | Valida `aralearn.authoring-process-preferences.v1`, revisão, dados e data. |
| `normalizeAuthoringProcessPreferencesSave` | Valida `{expectedRevision, preferences, requestId}`. |
| `normalizeAuthoringProcessPreferencesChange` | Valida `aralearn.authoring-process-preferences-change.v1`; quando recebe o pedido esperado, vincula dados, revisão e identidade do recibo. |
| `normalizeAuthoringProcessMandate` | Valida `aralearn.authoring-process-mandate.v1`, escopo do curso e condições do snapshot. |

Uma leitura offline continua sendo cache identificado como tal pelo cliente. Ela não pode ser apresentada como preferência confirmada no servidor nem autorizar gravação/revisão com uma base desatualizada.

## Calibração da configuração aplicada

`aplicar_configuracao_instrucional` registra expressamente a intenção corrente em unidades existentes, conservando texto, base explicativa aplicada e a declaração anterior de revisão. Uma diferença material de desenho pode deixar essa revisão desatualizada. A operação resolve as decisões fixadas no servidor e recebe escolhas justificadas somente para os parâmetros automáticos.

A procedência de cada escolha respeita os escopos do catálogo: os três parâmetros de cadência exclusivos do curso conservam `course`; escolhas contextuais admitidas na unidade usam `study_unit`. Os motivos automáticos têm espaços externos removidos e passam pelo mesmo validador completo usado na materialização. Valor, origem, motivo ou escopo incompatível reverte a operação antes de persistir o snapshot ou seu recibo. O [teste transacional de desenho](../supabase/tests/030_contextual_design_test.sql) cobre esse contrato com as funções completas da stack local; não constitui prova hospedada nem declaração de revisão humana.

## Base explicativa aplicada às unidades

A [migração da base aplicada](../supabase/migrations/20260909030823_contextual_applied_explanation_basis.sql) acrescenta `private.course_entities.applied_explanation_basis`. A coluna guarda a proveniência da Explicação usada na produção de cada unidade, separada de seu conteúdo editável, da intenção de desenho e da declaração de revisão. Acervo sem registro conserva `null`; o sistema não deduz aplicação a partir da base que existe hoje.

```json
{
  "contract": "aralearn.applied-explanation-basis.v1",
  "microsequenceId": "micro-1",
  "basisHash": "<SHA-256 de 64 caracteres hexadecimais>",
  "entityVersion": 2
}
```

O materializador existente chama `private.capture_course_applied_explanation_basis_v1(p_course_id uuid, p_units jsonb)` na mesma transação, após salvar a Explicação e suas fontes. O hook exige base completa e pertencimento da unidade à microssequência. Captura `entityVersion` da base salva e o hash privado `course_content_basis_hash_v1(courseId, 'microsequence_explanation', microsequenceId)`, que considera conteúdo, relações, dependências declaradas, fontes e arquivos pertinentes. O hash identifica os dados salvos usados; não mede correção, leitura, eficácia ou qualidade pedagógica.

O retorno booleano participa da mudança/revisão do curso e do recibo que o materializador já mantém. A captura não cria outro writer ou RPC pública. Falha no hook reverte a transação inteira; replay do recibo conserva o resultado anterior. Quando a única diferença é a base aplicada, a mudança ainda é registrada. A versão textual da unidade não é incrementada apenas por esse metadado.

Editar manualmente a unidade conserva o snapshot. Editar a Explicação ou uma fonte também conserva o snapshot histórico das unidades existentes. Uma nova materialização explícita substitui o registro pela base salva que rege aquela produção. O registro aplicado participa do hash de revisão da unidade: reaplicar base diferente pode desatualizar a revisão, mas nunca declara nova inspeção. O hash da Explicação não depende dos snapshots das unidades.

O leitor de entidades devolve `appliedExplanationBasis` fora de `content`. [appliedExplanationBasis.js](../src/domain/appliedExplanationBasis.js) fornece `normalizeAppliedExplanationBasis`, `exportAppliedExplanationBasis` e `collectAppliedExplanationBases` para validar e transportar esse metadado. Importação e edição de conteúdo não podem escrever a coluna nem inserir a alegação dentro de `content`.

Cópia autorizada conserva conteúdo, base, fontes e configuração pertinente ao artefato. O hook `private.copy_course_applied_explanation_basis_v1(sourceCourseId uuid, targetCourseId uuid)` preserva os quatro campos originais e acrescenta o campo opcional `sourceCourseId`, identificando o curso onde ocorreu a aplicação. Uma cópia de outra cópia conserva a origem inicial. O snapshot não afirma equivalência com o hash do destino, cujos identificadores ou arquivos disponíveis podem diferir. Produção explícita posterior no destino substitui o snapshot por seus quatro campos locais e retira a proveniência de cópia.

O contrato de exportação reserva essa proveniência separadamente do documento importável: `artifact.appliedExplanationBases` contém pares `{studyUnitId, basis}` com `sourceCourseId` explícito. O adapter precisa montar esse campo usando os registros autoritativos de entidades; a composição do documento de conteúdo, isoladamente, não transporta o metadado. Essa informação pode ser inspecionada no artefato, mas não autoriza importação a declarar aplicação nem revisão. Copiar e exportar não concedem inspeção autoral nova.

Os [testes do metadado](../tests/runtime/applied-explanation-basis.test.js) verificam validação, ausência histórica e origem conservada na exportação. Os [testes SQL focais](../tests/runtime/applied-explanation-basis-pglite.test.js) executam a migração completa e as funções reais de gravação de Explicação, hash e completude em PGlite. Cobrem captura após texto/fontes, preservação em edições, replay, reaplicação, cópias sucessivas, rollback, projeção e proteção contra escrita indevida. Os escritores externos e a atribuição de fontes são fixtures transacionais mínimas; essa prova não substitui a execução dos escritores completos pelo cliente real.

## Verificação focal das preferências

Os testes [de domínio](../tests/runtime/authoring-process-preferences.test.js) cobrem dimensões independentes, reutilização do catálogo, resolução pessoal/curso/pesquisa, mudança de preferência com mandato preservado, escolha automática e confirmação vinculada ao pedido. Os testes [PGlite](../tests/runtime/authoring-process-preferences-pglite.test.js) executam a migração completa com os normalizadores reais de parâmetros e perfis em schema sintético: persistência, replay, conflito de revisão, isolamento por conta, grants, RLS e conservação dos dados de curso representados na fixture.

Essa prova local não substitui autenticação pelo cliente real, integração do adapter, interface visível, conversa natural ou aplicação da migração no serviço hospedado. Esses gates pertencem à integração coordenada do programa.
