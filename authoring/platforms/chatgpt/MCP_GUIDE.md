# Guia das ferramentas de autoria

O gateway de autoria permite criar, revisar e organizar cursos por operações
pequenas e verificáveis. Ele evita dois riscos de uma integração baseada apenas
em chat: tratar a conversa como banco de dados e reenviar um curso inteiro para
alterar um único card.

O servidor expõe 30 ferramentas por Model Context Protocol. O GPT personalizado
com Action usa um schema OpenAPI gerado do mesmo registro. Portanto, os nomes,
os contratos, as regras de autorização e o estado persistido são os mesmos; o
que muda é apenas o transporte e o fluxo de autenticação.

## Modelo mental

### O chat formula; o workspace conserva

Mensagens ajudam a compreender a intenção, mas podem ser resumidas ou
descartadas. O workspace guarda a árvore corrente, as decisões estáveis, a
autorização humana e os achados de auditoria. Ao começar uma nova etapa, leia o
workspace; não tente reconstruí-lo da memória da conversa.

### A árvore é relacional

Projeto, curso, módulo, lição, tópico, microssequência e card são entidades no
PostgreSQL. Relações de pai e posição formam a árvore. O servidor recompõe um
documento `aralearn.library.v1` quando uma leitura, validação ou publicação
precisa dessa visão integral.

Cada alteração grava somente as entidades atingidas. O Storage recebe um
artefato integral imutável quando uma revisão é fixada para submissão ou
distribuição; ele não recebe uma cópia completa a cada comando.

### A revisão protege outras edições

Toda escrita possui `requestId`. Mutações de conteúdo ou estrutura também usam
a `expectedRevision` devolvida pela última leitura:

- `requestId` identifica uma tentativa. Repita-o somente com argumentos
  idênticos;
- `expectedRevision` afirma qual estado foi lido. Se outra sessão avançou a
  revisão, releia e reconstrua a menor alteração.

Os resumos de `listarAlteracoesRecentesDoWorkspace` ajudam a compreender até
200 eventos recentes, mas não substituem a leitura do estado atual.

### O caminho identifica o alvo

`entityPath` contém todos os ids entre o curso e a entidade. Copie o caminho
devolvido pela leitura. Um id isolado não informa em qual ramo a entidade está,
especialmente depois de cópias ou movimentos.

## Como começar uma etapa

### Pré-condição

Autentique uma conta AraLearn e confirme que ela possui acesso ao workspace ou
permissão para criar um.

### Passos

1. Chame `prepararAutoriaAraLearn` com intenção, alvo e contexto útil.
2. Se o workspace existir, chame `lerWorkspaceDeAutoria` com
   `view: "resume"`.
3. Leia `outline` para a árvore ou `entity` para o recorte que será alterado.
4. Use `document` somente quando a tarefa exigir de fato a visão composta
   integral.

### Resultado esperado

`resume` devolve contagens compactas, ids e estado das Partes, decisões,
mandato, achados ativos e sínteses persistidas. A preparação, por sua vez,
devolve orientação pertinente ao pedido; ela não recupera o estado autoral.

### Offline e recuperação

O gateway remoto exige conexão. Depois de uma queda, repita uma leitura. Se a
queda ocorreu durante escrita, preserve o mesmo `requestId` apenas para replay
idêntico e confira a revisão atual antes de iniciar outra tentativa.

## Famílias de ferramentas

### Preparação e leitura

| Ferramenta | Finalidade |
| --- | --- |
| `prepararAutoriaAraLearn` | Selecionar orientação de criação, ampliação, revisão, reorganização, auditoria ou reparo. |
| `listarCursosDaBibliotecaPessoal` | Listar cursos privados ou selecionados da conta. |
| `consultarCatalogo` | Procurar coleções e cursos publicados quando a conta possui leitura de catálogo. |
| `lerConteudoDoCurso` | Ler árvore, entidade ou documento de um curso acessível. |
| `listarWorkspacesDeAutoria` | Localizar projetos em andamento. |
| `lerWorkspaceDeAutoria` | Ler `resume`, `outline`, `entity` ou documento composto do workspace. |
| `gerirDesenhoInstrucional` | Ler o slice JIT, persistir análise/assignments, resolver snapshot e registrar blueprint ou manifesto. |
| `listarCardsDaMicrossequencia` | Localizar os cards de uma unidade sem carregar o curso inteiro. |
| `listarAlteracoesRecentesDoWorkspace` | Ler resumos recentes para orientação operacional. |

### Estrutura e conteúdo

| Ferramenta | Finalidade |
| --- | --- |
| `criarWorkspaceDeAutoria` | Criar o projeto vazio com contexto estável inicial. |
| `importarCursoNoWorkspace` | Acrescentar ao workspace um curso ao qual a conta já tem acesso. |
| `criarEstruturaNoWorkspace` | Criar entidades estruturais em lotes de até 40 itens. |
| `atualizarMetadadosDaEntidade` | Corrigir metadados de curso, módulo, lição ou microssequência. |
| `salvarCardsNaMicrossequencia` | Salvar os envelopes completos dos cards de uma microssequência. |
| `salvarCardNoWorkspace` | Corrigir ou criar um único card completo. |
| `reorganizarWorkspace` | Copiar, mover, renomear, reunir, dividir, promover ou rebaixar entidades. |
| `excluirDoWorkspace` | Excluir entidade ou workspace por uma operação destrutiva explícita. |

### Resources de card

`consultarBibliotecaDeResources` concentra a descoberta progressiva. Ela não
oferece uma operação para despejar todos os schemas:

1. `explore` apresenta famílias, áreas e facetas;
2. `search` relaciona intenção e candidatos, classificando a cobertura como
   `canonical`, `versatile` ou `substitute`;
3. `inspect` compara até oito perfis;
4. `contracts` devolve exatamente um contrato por chamada;
5. `validate_card` verifica schema, referências e compatibilidade do envelope;
6. `audit_representation` distingue `semantic_fit`,
   `response_affordance` e `feedback_legibility`;
7. `preview_card` devolve um descritor com `rendered: false`, não uma captura de
   tela.

Escolha primeiro a representação pela intenção pedagógica e consulte seu
contrato depois. Não codifique ids de package nem sintaxe interna do
renderizador nas instruções do cliente.

Obedeça à política e ao ResourceSet efetivos. Quando uma aproximação for
autorizada, preserve a limitação e o `chatDisclosure`; quando houver bloqueio,
registre a indisponibilidade e não use package externo nem finja equivalência.

### Participação e observações

`gerirWorkspaceEducacional` reúne operações fechadas:

- espaço e membros: `read`, `create`, `update`, `invite`, `accept_invite`,
  `cancel_invite`, `set_role`, `remove_member`, `transfer_owner` e `leave`;
- comentários de estudo: `list_comments`, `respond_comment`,
  `set_comment_status` e `link_comment_correction`;
- observações situadas: `list_observations`, `create_observation` e
  `delete_observation`.

Proprietário e administrador gerem pessoas. Professor/autor escreve no âmbito
local; revisor revisa; estudante estuda e comenta; leitor apenas lê. Esses
papéis não concedem administração global do catálogo. O banco reavalia a
autorização em cada comando; convite ou mudança de papel não copia a árvore.

`list_comments` permite paginação e filtros por categoria e estado. Estudantes
veem somente as próprias observações; papéis com capacidade de revisão veem o
conjunto autorizado do workspace. O `summary` descreve todo o conjunto visível,
e não apenas a página filtrada. Use contagens e até vinte `focusCards` para
priorizar leitura, sem classificar pessoas, turma ou aprendizagem.

### Continuidade e auditoria

`gerirContinuidadeDaAutoria` guarda o que precisa sobreviver ao chat. O `brief`
contém somente contexto estável e fontes. Para alterá-lo, releia o valor inteiro
e use `replace_stable_brief`, preservando o que ainda for válido.

Partes, decisões, mandatos e achados não pertencem ao `brief`. Depois da
aprovação do planejamento, use uma única `record_approved_plan` para substituir
atomicamente todas as Partes, decisões e o mandato autorizado. A atomicidade
impede que uma interrupção deixe apenas parte do plano aprovado.

Operações de continuidade:

- `define_part` e `remove_part` ajustam Partes;
- `record_decision` e `remove_decision` mantêm decisões;
- `set_mandate` e `clear_mandate` delimitam autorização corrente;
- `record_finding` registra achado de auditoria;
- `decide_finding` conserva a decisão humana;
- `link_finding_correction` aponta para a escrita que corrigiu o achado;
- `verify_finding` registra a reauditoria;
- `delete_finding` representa exclusão explícita, nunca o ocultamento de um
  problema aberto, rejeitado ou ainda não decidido.

Cada autorização recebe um `mandate.id` novo. `build_part` é consumido quando
todas as microssequências da Parte possuem cards `ready`. `audit` e
`restructure` são encerrados explicitamente. Cada
`link_finding_correction` retira o achado correspondente de
`repair_findings`; o último vínculo encerra esse mandato. A reauditoria usa
outro mandato `audit`; inclua `targetPartId` quando o âmbito estiver limitado a
uma Parte.

Enquanto um achado aprovado aguarda correção, cada escrita coberta atualiza
`pendingCorrectionRequestId` e `pendingRevision`. `resume` devolve esse par
mesmo depois do prazo dos recibos. Releia o alvo antes de continuar ou criar o
vínculo final.

A máscara de Parte usa `r` para microssequência pronta com cards, `m` para
materializada ainda não pronta, `p` para planejada sem cards e `x` para id
ausente.

## Construir uma Parte do curso

### Pré-condição

Tenha escopo, fontes, profundidade e público definidos. A autorização para
planejar não autoriza automaticamente a materialização.

### Passos

1. Prepare o contexto e leia `resume`.
2. Procure cursos ou partes reutilizáveis e leia somente os recortes
   necessários.
3. Crie o workspace vazio, caso ele ainda não exista.
4. Registre a árvore planejada em lotes de até 40 entidades. Peça aprovação ou
   ajuste somente quando o mandato ou uma decisão material exigir; quando
   houver, grave-a com `record_approved_plan`.
5. Para uma microssequência, use `gerirDesenhoInstrucional` com `read_slice`,
   knowledge JIT e `save_analysis`.
6. Se Auto precisar de conjunto novo, faça bootstrap por facetas e
   `save_resource_set`; depois use `set_parameter` e `resolve_effective`.
7. Sob `workspaceId` e `snapshotRef`, percorra `explore`, `search`, `inspect` e
   `contracts` para uma versão por chamada; grave o blueprint.
8. Componha cards em memória, use `validate_card` e `audit_representation`,
   salve uma microssequência, releia e só então use `register_manifest`.
9. Revise a projeção de microteorias, cobertura, práticas e resources. Dentro
   da Parte autorizada, avance sem nova confirmação apenas porque a unidade
   terminou.
10. Apresente o resultado e proponha uma auditoria independente.

### Resultado esperado

A Parte aparece em Trilhas. Microssequências prontas são estudáveis e as ainda
planejadas permanecem visíveis como planejamento, sem estado burocrático de
publicação.

### Recuperação

Se a criação estrutural parar no meio, leia `resume` e a máscara da Parte. Não
recrie entidades já existentes. Se a validação de um card falhar, corrija o
envelope antes de gravá-lo; não introduza fallback para um contrato antigo.

## Auditar e reparar

Auditoria e reparo são fases diferentes. `prepararAutoriaAraLearn` usa intenção
`audit` para leitura e registro de achados; `repair` serve a reparos já
autorizados. Nenhuma das duas é revisão editorial do catálogo.

### Pré-condição

Defina o âmbito da auditoria e registre um mandato `audit`. Se a auditoria
abranger somente uma Parte, inclua `targetPartId`.

### Passos

1. Leia `resume` e o recorte autorizado.
2. Consulte `list_comments` para comentários feitos no estudo.
3. Consulte `list_observations` com `kinds: ["note"]` para notas situadas no
   workspace.
4. Use `gerirDesenhoInstrucional`/`run_audit` com `kind: audit` para fixar a revisão e executar
   checks determinísticos. Em Parte, mantenha um caminho de microssequência do
   próprio recorte como cursor operacional.
5. Percorra a view `audit` até `nextCursor: null`. Leia análise, snapshot,
   ResourceSets, blueprint, manifesto, cards/resources reais e fontes.
6. Registre com `record_semantic_audit` no mesmo audit run somente achados compactos,
   públicos e estruturados: código, alvo, regra, gravidade, evidência curta e
   reparo opcional. Não envie raciocínio privado.
7. Apresente os achados e registre a decisão humana.
8. Defina `repair_findings` somente para os achados aprovados.
9. Releia cada alvo, execute a menor mutação e confirme a nova revisão.
10. Vincule a correção somente depois da escrita confirmada.
11. Encerre o mandato de reparo e abra outro `run_audit` com `kind: reaudit` sobre o estado
    corrente.
12. Verifique ou reabra cada achado e procure regressões ou problemas novos.

### Resultado esperado

Achados ativos ficam disponíveis em `resume`. Se a lista vier truncada,
percorra o histórico com `list_observations`, paginação e
`kinds: ["audit_finding"]`. Uma reauditoria usa outro mandato `audit`, não o
mandato consumido pelo reparo.

Os vínculos têm sentidos diferentes: `link_comment_correction` liga uma escrita
confirmada a um comentário feito no estudo; `link_finding_correction` liga uma
escrita confirmada a um achado formal de auditoria. Não troque um pelo outro.

### Recuperação

Se a conversa terminar depois da escrita e antes do vínculo, `resume` devolve
`pendingCorrectionRequestId` e `pendingRevision`. Releia o alvo, confirme o
resultado e finalize o vínculo. Não registre um planejamento ou uma tentativa
rejeitada como correção.

## Limites do mandato

Enquanto houver mandato, a escrita respeita o tipo autorizado:

- `build_part` escreve somente na Parte indicada;
- `repair_findings` escreve apenas nos alvos aprovados;
- `audit` não altera conteúdo;
- `restructure` aceita apenas mudanças estruturais.

Um lote que mistura âmbitos ou não comprova todos os alvos é rejeitado por
inteiro. Essa regra impede que uma autorização restrita seja ampliada por uma
chamada conveniente.

## Corrigir uma entidade

Para metadados de curso, módulo, lição ou microssequência, use
`atualizarMetadadosDaEntidade`. Para um card, use `salvarCardNoWorkspace` e
envie o card completo, preservando id e posição. Para uma microssequência
inteira, use `salvarCardsNaMicrossequencia` com todos os envelopes da unidade.

Esses comandos fechados reduzem contexto e limitam o raio de uma alteração.
Depois de qualquer escrita, informe o efeito humano e a nova revisão.

## Reaproveitar e reorganizar

`importarCursoNoWorkspace` acrescenta um curso acessível ao projeto. Para
transformações internas, `reorganizarWorkspace` aceita:

- `copy_entity`: cria cópia profunda com novos ids, remapeia referências
  internas e preserva a origem;
- `move_entity`: preserva identidade, muda pai ou posição e remove a localização
  anterior na mesma revisão;
- `rename_entity`, `merge_microsequences`, `split_microsequence`,
  `promote_module` e `demote_course`: executam somente a transformação nomeada.

Origem e destino podem pertencer a cursos diferentes do mesmo workspace. Use
os dois `entityPath` completos. A cópia não compartilha conteúdo mutável com a
origem.

Exclusões usam `excluirDoWorkspace` com `delete_entity` ou
`delete_workspace`, sempre com a revisão corrente. Uma exclusão não deve ser
disfarçada como reorganização.

## Estudar, submeter e distribuir

Criar estrutura já torna o plano visível em Trilhas. Cards prontos podem ser
estudados enquanto outras Partes ainda estão planejadas. “Publicado” significa
apenas que uma revisão foi fixada para submissão ou distribuída em Coleções.

Para submissão editorial:

1. use `publicarCursoDoWorkspace` com `target: "private"`;
2. guarde `courseId` e hash confirmados;
3. chame `submeterCursoParaRevisaoEditorial` apontando para esse artefato;
4. não envie um campo `completion` inventado.

`listarRevisoesEditoriais` mostra os próprios envios ou a fila autorizada.
`lerRevisaoEditorial` abre somente o artefato submetido.
`criarWorkspaceDeRevisaoEditorial` produz uma cópia editorial independente. A
pessoa revisora pode pedir ajustes, rejeitar ou distribuir o resultado; a
pessoa autora pode retirar um envio pendente.

Para Coleções, use `publicarCursoDoWorkspace` com `target: "catalog"` e
`collectionId`. Isso exige capacidade editorial. Contas com `catalog:manage`
podem criar, atualizar e transferir cursos por `editarCatalogo`; retiradas usam
`retirarDoCatalogo`. A apresentação das coleções é alfabética, sem comando de
reordenação manual.

## Como interpretar respostas

Cada ferramenta anuncia um `outputSchema` fechado para `data`:

- listas incluem itens e cursor tipados;
- leituras incluem metadados de controle;
- gravações incluem revisão confirmada;
- publicação, retirada e exclusão possuem recibos próprios;
- falhas usam `{ ok: false, requestId, error }`.

Abertura estrutural existe somente em `content`, quando uma entidade ou o
documento integral foi solicitado, e em `definition`, que contém o contrato
variável de um resource. `outline`, `microtheories` e os campos de controle são
fechados. Não suponha campos ausentes do schema.

Na revisão conceitual, apresente microteorias e quantidades de práticas. Não
transcreva todas as práticas por padrão. Quando a pessoa pedir uma prática,
localize seus ids, leia as entidades necessárias e então apresente o conteúdo.
Validação estrutural não equivale a aprovação pedagógica.

## Diagnóstico

| Sintoma | Significado | Recuperação |
| --- | --- | --- |
| A orientação não contém o curso atual | `prepararAutoriaAraLearn` não lê estado | Chame `lerWorkspaceDeAutoria` com `view: "resume"`. |
| Uma alteração relata conflito | Outra sessão avançou a revisão | Releia o alvo e prepare uma nova operação. |
| O replay é recusado | O mesmo `requestId` recebeu argumentos diferentes | Gere outro id para a nova tentativa. |
| O modelo tenta montar um resource sem contrato | A descoberta progressiva foi pulada | Faça `search`, `inspect` e `contracts`, depois valide. |
| A auditoria altera conteúdo | Mandato ou intenção incorretos | Use mandato `audit` em leitura; abra reparo somente após decisão. |
| Um comentário foi marcado como corrigido sem escrita | Vínculo ocorreu cedo demais | Reabra o estado, execute e confirme a menor correção antes do vínculo. |
| Um curso parcial não aparece no catálogo | Trilhas e Coleções têm finalidades diferentes | Estude em Trilhas ou siga a submissão editorial. |
| A conta administra o workspace, mas não publica em Coleções | Papel local não concede capacidade editorial global | Submeta para revisão ou use conta explicitamente autorizada. |

O percurso explicado para pessoas autoras está em
[Criar cursos pelo chat](../../../docs/criar-cursos-pelo-chat.md). Transporte,
autenticação e políticas estão em
[Gateway MCP de autoria](../../../docs/autoria-mcp.md). A configuração do
ChatGPT está em [Configurar autoria no ChatGPT](SETUP.md).
