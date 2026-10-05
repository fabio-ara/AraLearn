# Matriz de conformidade técnica

Uma mesma ação pode chegar ao AraLearn pela interface ou por um cliente externo de IA.
O resultado e a autorização precisam continuar iguais nos dois caminhos. Esses
clientes usam [MCP](autoria-mcp.md), protocolo de chamada de ferramentas, ou
[Actions](autoria-actions.md), operações descritas em OpenAPI.

A matriz relaciona cada propriedade às partes que a executam e ao teste focal capaz de
reproduzi-la. A última coluna indica condições de uso e avaliações complementares. Todo
resultado pertence à versão e à execução em que foi obtido.

A [arquitetura](arquitetura.md) explica como navegador, serviços e banco se
relacionam. O [guia do desenvolvedor](guia-desenvolvedor.md) orienta a execução dos
testes. As capacidades apresentadas ao público e seus limites estão em [Capacidades e
limites atuais](estado-atual-e-roadmap.md).

## Capacidades e verificações

Os caminhos abaixo partem da raiz do repositório. Nomes curtos de testes referem-se a
arquivos de `tests/runtime/` ou `tests/e2e/`.

| Propriedade | Implementação e relação com os dados | Verificação focal | Condições e alcance |
| --- | --- | --- | --- |
| A autoria abre no conteúdo e mantém o foco | `CourseAuthoringSurface` e rotas usam o curso salvo; inspeção paginada preserva alvo e posição | `course-authoring-route.test.js`, `course-authoring-surface.test.js`, `course-authoring-cutover.spec.js` | a versão hospedada exige sua própria jornada de uso |
| O mapa organiza o curso antes da produção | plano global em módulos, lições e microssequências; partes agrupam produção sem acrescentar nível curricular | `global-authoring-conversation-acceptance.test.js` e testes de planejamento | cobertura e profundidade exigem ler o conteúdo diante do mapa e dos objetivos |
| Ideias são acompanhadas ao longo do percurso | inventário de unidades de análise distingue introdução, uso e retomada | `instructional-analysis-granularity-eval.test.js` e casos sintéticos | equivalência de significado exige comparar as definições e seus usos |
| A explicação pode preceder as unidades | `courseExplanation.js` guarda a base; `appliedExplanationBasis.js` identifica a base usada na produção | `applied-explanation-basis.test.js`, `applied-explanation-basis-pglite.test.js` | a atualização das unidades exige uma operação deliberada sobre seu conteúdo |
| A revisão depende de declaração humana por objeto | `courseContentReview.js`, interface e `declarar_revisao` distinguem explicação e unidade; a base inspecionada é comparada antes da gravação | `course-content-review.test.js`, `course-human-contextual-review.test.js`, `course-microsequence-review.spec.js` | a avaliação pedagógica examina o material; a autorização de acesso conserva controles próprios |
| A inspeção de IA confronta o percurso salvo | `courseContentInspection.js`, `coursePedagogicalAudit.js` e a base focal SQL ligam o parecer ao conteúdo, à ordem, ao desenho e às fontes; cada registro exige seis critérios | `course-content-inspection.test.js`, `course-pedagogical-audit.test.js`, `course-ai-inspection-pglite.test.js` | presença de evidências textuais e validade da base são verificáveis; o mérito do parecer depende da análise pedagógica |
| A leitura compartilhada conserva a base de cada parecer | `courseHumanAuditContext.js` reúne apenas contextos idênticos na mesma página e preserva as referências de cada alvo | `course-human-audit-context.test.js` e `course-human-read-context.test.js` | compartilhar contexto reduz repetição na resposta; cada alvo continua exigindo julgamento próprio |
| A política de estudo é explícita | `saved` permite conteúdo salvo; `reviewed_only` exige revisão atual, além das permissões do curso | `course-content-review-access-pglite.test.js` e jornadas de acesso local | revogação de acesso precisa de confirmação conectada no dispositivo |
| Parâmetros, perfis e cadência conservam decisões aplicadas | `courseDesignParameters.js` tipa valores e herança; perfis copiam preferências, sem vínculo retroativo com os cursos | `course-design-parameters.test.js`, `authoring-profiles.test.js` | alvos organizam a produção; a extensão necessária depende da função didática e os efeitos exigem avaliação educacional |
| MCP e Actions executam as mesmas tarefas | `COURSE_HUMAN_TASKS` alimenta MCP e a projeção OpenAPI; o executor resolve referências e autorização | `course-human-mcp.test.js`, `chatgpt-action-human-schema.test.js`, verificação OpenAPI | cada cliente efetivo precisa receber o contrato atualizado e ser exercitado |
| Correções e decisões conservam os alvos apresentados | observação multialvo com bases anteriores; releitura confirma persistência e decisão expressa aprova ou encerra incidências pelas versões e bases examinadas | `course-observation-corrections-pglite.test.js`, `course-observation-review-transport.test.js`, `course-human-authoring-decisions.test.js` | a aprovação depende da decisão humana expressa; transporte incerto exige reconciliar a tentativa e versões novas exigem releitura |
| Componentes funcionam por contrato de pacote | registro delega validação, edição, apresentação e resposta aos pacotes; núcleo conserva composição e ciclo de vida | testes de pacotes, galeria e inspeção visual | a adequação da representação exige confrontar conteúdo e tarefa |
| Fontes permanecem localizáveis e contestáveis | fontes, âncoras e vínculos correntes ligam trechos, obras e arquivos; citações usam metadados e estilo do curso | testes de fontes, citações, painel e ingestão | a sustentação de uma afirmação exige consultar a passagem e avaliar sua pertinência |
| Arquivos seguem a política autorizada | descritores lógicos no banco; bytes em áreas privadas do Storage; download revalida curso, fonte e arquivo | `course-storage-lifecycle-local-smoke.mjs`, testes de áudio e cópia de arquivos | a restauração exige conferir também os bytes no Storage; mídia hospedada depende de rede |
| Remoção e reanexo preservam arquivos ainda usados | marca de retirada e intenção temporária de limpeza; todas as referências e reservas são conferidas antes da exclusão pela API | testes de ingestão, remoção, reativação e órfãos | a limpeza física dos arquivos exige a API de Storage e a confirmação dos objetos removidos |
| Cópias são independentes e deliberadas | origem própria ou com permissão de cópia; novas identidades e curso privado, com conteúdo, fontes e arquivos preservados | `course-copy-transport.test.js`, `course-copy-client.test.js`, `course-copy-files-local.test.js` | a cópia requer permissão própria; acessos e estado pessoal permanecem na origem |
| Exportação e comparação usam leitura coerente | `courseAuthoringComparison.js` reúne documento, fontes, bases aplicadas e revisão; compara o estado corrente em recortes explícitos | `course-authoring-comparison.test.js` | a equivalência pedagógica exige comparar conteúdo, tarefas e contexto de uso |
| Analytics descreve o estado corrente | `courseAuthoringAnalytics.js` deriva desenho e autoria; painel e exportação usam o mesmo objeto normalizado | `course-analytics-panel.test.js` e testes de domínio | as medidas descrevem registros do curso; atenção e aprendizagem exigem instrumentos próprios |
| Continuidade local preserva trabalho e permissões | IndexedDB mantém composição, progresso e filas; sincronização manual adia trocas de conteúdo, com acesso conferido separadamente | testes de repositórios, duas abas, perda de rede e retorno | os direitos vigentes são conferidos novamente quando há conexão |
| A atualização local conserva pendências antigas | `CourseLocalStore.js` executa a migração para o formato corrente; pedidos excedentes permanecem exportáveis em recuperação de rascunhos | `course-cache-upgrade-v10.test.js`, `revisao-v7-cache-upgrade.test.js` | dados preservados permanecem disponíveis para decisão posterior; a execução depende de um pedido atual válido |
| Banco novo e atualizado convergem | migrações reproduzem esquema; restauração descartável aplica a cadeia e compara estrutura e dados úteis | `verifyBackupRestoreUpgrade.mjs`, `backup-restore-upgrade.test.js` | a recuperação do ambiente hospedado depende de seu backup atual e da verificação dos arquivos |
| Autorização permanece no servidor | privilégios, segurança em nível de linha (RLS) e funções SQL delimitam as operações | Supabase local, testes SQL e jornadas com contas distintas | o servidor precisa recusar também pedidos diretos de identidades sem permissão |
| A publicação usa uma candidata identificada | validação classifica o impacto; manifesto associa revisão, verificações e artefatos promovidos | `deployment-automation.test.js` e workflows | a publicação exige conferir a revisão efetivamente disponível em cada serviço hospedado |

## Contexto histórico

A refatoração foi organizada pelo
[programa #295](https://github.com/fabio-ara/AraLearn/issues/295). O
[registro da base 0.0.64](https://github.com/fabio-ara/AraLearn/blob/20f9a1b575a21b1714452fdb17b4d6b70e610d29/docs/matriz-conformidade-tecnica.md)
e o [histórico de mudanças](../CHANGELOG.md) conservam as etapas e as lacunas
então encontradas. As capacidades atuais estão relacionadas acima.

## Preservação dos dados e das responsabilidades

A revisão crescente do curso evita sobrescrever alterações concorrentes. Os recibos
temporários recuperam respostas perdidas sem repetir efeitos. Esses mecanismos têm
funções distintas e continuam necessários mesmo sem um histórico universal de
execução.

A antiga cópia automática durante a edição foi retirada. Os cursos já criados
conservam propriedade e conteúdo; pendências antigas são reconciliadas por prova da
operação original. A cópia deliberada reutiliza o remapeamento de identidades sem
transformar o estudo em permissão para editar a origem. Os detalhes estão em
[Persistência relacional](persistencia-relacional.md#cópia-independente).

O núcleo dos componentes mantém a composição comum; cada pacote declara suas regras de
apresentação, resposta e edição. Uma extensão que exige capacidade nova precisa
alterar explicitamente o contrato e seus consumidores. Acrescentar um componente não
autoriza executar código arbitrário vindo do curso.

Fontes e arquivos conservam identidades e autorizações próprias. Compartilhar bytes
imutáveis entre cópias exige conferir todos os vínculos antes de apagar o objeto.
Dados privados de autoria não entram na leitura pública só porque o curso ficou
público; o banco constrói uma seleção explícita dos campos permitidos.

## Verificação para integração

Uma mudança precisa ser verificada em cada fronteira que possa alterar seu efeito. Se
mudar uma autorização, por exemplo, a prova percorre a regra, o pedido pela rede, o
banco descartável e o cliente afetado. Instalação nova, atualização e restauração
respondem a riscos diferentes. O [guia do
desenvolvedor](guia-desenvolvedor.md#testes-e-integração) orienta a seleção conforme o
impacto da mudança.

Para a interface, confira também larguras, temas, foco e recuperação de erro no
[roteiro de verificação](auditoria-front-end.md). Para avaliar compreensão,
aprendizagem ou experiência com participantes, use o [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).
