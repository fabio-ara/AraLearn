# Matriz de conformidade técnica

Uma mesma ação pode chegar ao AraLearn pela interface ou por uma aplicação externa de
inteligência artificial (IA). As regras de conteúdo e autorização precisam permanecer
coerentes nesses caminhos. As aplicações externas usam [MCP](autoria-mcp.md), protocolo
de descoberta e chamada de ferramentas, ou [Actions](autoria-actions.md), canal cujos
pedidos e respostas são descritos no formato OpenAPI.

A matriz relaciona cada propriedade às partes que a executam e ao teste focal capaz de
reproduzi-la. A última coluna indica condições de uso e avaliações complementares. Todo
resultado pertence à versão e à execução em que foi obtido.

A [arquitetura](arquitetura.md) explica como navegador, serviços e banco se
relacionam. O [guia do desenvolvedor](guia-desenvolvedor.md) orienta a execução dos
testes. As capacidades apresentadas ao público e seus limites estão em [Capacidades e
limites atuais](estado-atual-e-roadmap.md).

## Capacidades e verificações

Os caminhos completos partem da raiz do repositório. Os testes com nome terminado em
`.test.js` ficam em `tests/runtime/`; os terminados em `.spec.js`, em `tests/e2e/`.
Os verificadores mantidos em outros diretórios aparecem com o caminho completo.

| Propriedade | Implementação e relação com os dados | Verificação focal | Condições e alcance |
| --- | --- | --- | --- |
| A autoria abre no conteúdo e mantém o foco | `CourseAuthoringSurface` e rotas usam o curso salvo; consulta em páginas de dados preserva o objeto e a posição de leitura | `course-authoring-route.test.js`, `course-authoring-surface.test.js`, `course-authoring-cutover.spec.js` | a versão hospedada exige sua própria jornada de uso |
| O mapa organiza o curso antes da produção | no [modelo didático](modelo-didatico.md), cada microssequência reúne unidades de estudo voltadas a um objetivo; o mapa situa esses recortes no curso, e as partes agrupam sua produção sem acrescentar nível curricular | `global-authoring-conversation-acceptance.test.js` e testes de planejamento | cobertura e profundidade exigem ler o conteúdo diante do mapa e dos objetivos |
| Ideias são acompanhadas ao longo do percurso | o inventário de [unidades de análise instrucional](desenho-instrucional-parametrizado.md) identifica recortes, como ideias e procedimentos, e distingue sua introdução, uso e retomada | `instructional-analysis-granularity-eval.test.js` e casos sintéticos | equivalência de significado exige comparar as definições e seus usos |
| A explicação pode preceder as unidades | `courseExplanation.js` guarda a [explicação](explicacao-e-revisao-humana.md), que desenvolve o assunto da microssequência; `appliedExplanationBasis.js` identifica a versão dessa base usada para produzir cada unidade | `applied-explanation-basis.test.js`, `applied-explanation-basis-pglite.test.js` | a atualização das unidades exige uma operação deliberada sobre seu conteúdo |
| A revisão depende de declaração humana por objeto | `courseContentReview.js`, interface e `declarar_revisao` distinguem explicação e unidade; a base inspecionada é comparada antes da gravação | `course-content-review.test.js`, `course-human-contextual-review.test.js`, `course-microsequence-review.spec.js` | a avaliação pedagógica examina o material; a autorização de acesso conserva controles próprios |
| A inspeção de IA confronta o percurso salvo | `courseContentInspection.js`, `coursePedagogicalAudit.js` e a base focal reunida pelo banco ligam o parecer ao conteúdo, à ordem, ao desenho e às fontes; novos pareceres exigem os [seis critérios de inspeção](auditoria-de-conformidade-instrucional.md#inspeção-por-ia-sobre-o-conteúdo-salvo) | `course-content-inspection.test.js`, `course-pedagogical-audit.test.js`, `course-ai-inspection-pglite.test.js` | presença de evidências textuais e validade da base são verificáveis; o mérito do parecer depende da análise pedagógica |
| O contexto comum da inspeção preserva a referência de cada alvo | `courseHumanAuditContext.js` apresenta uma vez os contextos idênticos na mesma página de resposta ao assistente, mantendo o vínculo de cada objeto com sua base | `course-human-audit-context.test.js` e `course-human-read-context.test.js` | o agrupamento reduz repetição na resposta; cada alvo continua exigindo julgamento próprio |
| A política de estudo é explícita | `saved` permite estudar o conteúdo completo salvo; `reviewed_only` exige também declaração humana de revisão atual, conforme a [política de estudo](explicacao-e-revisao-humana.md); ambas dependem das permissões do curso | `course-content-review-access-pglite.test.js` e jornadas de acesso local | revogação de acesso precisa de confirmação conectada no dispositivo |
| A intenção corrente permanece distinta das decisões aplicadas | `courseDesignParameters.js` define valores e regras de herança; a produção ou a aplicação expressa registra as decisões da unidade, conforme a [referência de parâmetros](parametros-de-autoria.md) | `course-design-parameters.test.js`, `course-human-design-tasks.test.js` | mudar a orientação para trabalhos futuros conserva o conteúdo salvo; aplicar a configuração e editar o texto são operações distintas |
| Perfis e cadência organizam o processo de autoria | aplicar um perfil copia escolhas para o curso; a cadência organiza o avanço por microssequência, parte ou lote | `authoring-profiles.test.js`, `authoring-process-preferences.test.js` | editar o perfil depois conserva os cursos que receberam a cópia; a extensão do conteúdo depende de sua função didática |
| MCP e Actions executam as mesmas tarefas | `COURSE_HUMAN_TASKS` alimenta MCP e a projeção OpenAPI; o executor resolve referências e autorização | `course-human-mcp.test.js`, `chatgpt-action-human-schema.test.js`, verificação OpenAPI | cada cliente efetivo precisa receber o contrato atualizado e ser exercitado |
| Correções e decisões conservam os alvos apresentados | uma [observação](observacoes-pedagogicas.md) pode ter vários alvos; a correção salva o conteúdo, e a decisão humana aprova o resultado ou encerra a pendência de cada alvo apresentado | `course-observation-corrections-pglite.test.js`, `course-observation-review-transport.test.js`, `course-human-authoring-decisions.test.js` | as bases anteriores sustentam a comparação; resultado incerto exige recuperar a tentativa, e versões novas exigem releitura; decidir a observação é distinto de declarar revisão do conteúdo |
| Componentes funcionam por contrato de pacote | cada [pacote de componente](componentes-didaticos.md) define e valida os dados e cuida da apresentação, resposta e edição; o registro encaminha essas funções ao pacote, e o núcleo conserva a composição e o ciclo de vida comuns | testes de pacotes, galeria e inspeção visual | a adequação da representação exige confrontar conteúdo e tarefa |
| Fontes permanecem localizáveis e contestáveis | [fontes](fontes-e-citacoes.md) identificam materiais, âncoras localizam passagens e vínculos registram seu uso no conteúdo; as citações usam os dados bibliográficos e o estilo do curso | testes de fontes, citações, painel e ingestão | a sustentação de uma afirmação exige consultar a passagem e avaliar sua pertinência |
| Arquivos seguem a política autorizada | o banco registra os anexos; o Storage, serviço de arquivos do [Supabase](supabase.md), guarda os bytes em áreas privadas; baixar um arquivo exige nova conferência do curso, da fonte e do arquivo | `supabase/tests/course-storage-lifecycle-local-smoke.mjs`, testes de áudio e cópia de arquivos | a restauração exige conferir também os bytes no Storage; mídia hospedada depende de rede |
| Remoção e reanexo preservam arquivos ainda usados | marca de retirada e intenção temporária de limpeza; todas as referências e reservas são conferidas antes da exclusão pela interface de programação (API) do serviço | testes de ingestão, remoção, reativação e órfãos | a limpeza física dos arquivos exige a API de Storage e a confirmação dos objetos removidos |
| Cópias são independentes e deliberadas | origem própria ou com permissão de cópia; novas identidades e curso privado, com conteúdo, fontes e arquivos preservados | `course-copy-transport.test.js`, `course-copy-client.test.js`, `course-copy-files-local.test.js` | a cópia requer permissão própria; acessos e estado pessoal permanecem na origem |
| Exportação e comparação usam leitura coerente | `courseAuthoringComparison.js` reúne documento, fontes, bases aplicadas e revisão; compara o estado corrente em recortes explícitos | `course-authoring-comparison.test.js` | a equivalência pedagógica exige comparar conteúdo, tarefas e contexto de uso |
| Os [dados de autoria](analytics-instrucionais.md) descrevem o estado corrente | `courseAuthoringAnalytics.js` calcula medidas a partir dos registros de desenho e autoria; painel e exportação usam o mesmo objeto normalizado | `course-analytics-panel.test.js` e testes de domínio | as medidas descrevem registros do curso; atenção e aprendizagem exigem instrumentos próprios |
| Continuidade local preserva trabalho e permissões | o IndexedDB armazena no navegador a cópia do curso, o progresso e as filas de envio; a [sincronização](persistencia-relacional.md) manual adia trocas de conteúdo, com acesso conferido separadamente | testes de repositórios, duas abas, perda de rede e retorno | os direitos vigentes são conferidos novamente quando há conexão |
| A atualização local conserva pendências antigas | `CourseLocalStore.js` executa a migração para o formato corrente; pedidos excedentes permanecem exportáveis em recuperação de rascunhos | `course-cache-upgrade-v10.test.js`, `revisao-v7-cache-upgrade.test.js` | dados preservados permanecem disponíveis para decisão posterior; a execução depende de um pedido atual válido |
| Banco novo e atualizado convergem | migrações são arquivos que atualizam a estrutura do banco; o [ensaio de restauração](implantacao.md#falhas-e-recuperação) aplica essa sequência em ambiente descartável e compara estrutura e dados úteis | `scripts/verifyBackupRestoreUpgrade.mjs`, `backup-restore-upgrade.test.js` | a recuperação do ambiente hospedado depende de seu backup atual e da verificação dos arquivos |
| Autorização permanece no servidor | privilégios delimitam operações, e a segurança em nível de linha (RLS) restringe os registros acessíveis; funções escritas em SQL, a linguagem do banco, verificam as condições de cada pedido | Supabase local, testes SQL e jornadas com contas distintas | o servidor precisa recusar também pedidos diretos de identidades sem permissão |
| A publicação usa uma candidata identificada | o validador classifica o impacto da mudança; o [manifesto de implantação](implantacao.md) associa a versão candidata às verificações e aos arquivos que serão publicados | `deployment-automation.test.js` e automações do GitHub (workflows) | a publicação exige conferir a revisão efetivamente disponível em cada serviço hospedado |

## Contexto histórico

A refatoração foi organizada pelo
[programa #295](https://github.com/fabio-ara/AraLearn/issues/295). O
[registro da base 0.0.64](https://github.com/fabio-ara/AraLearn/blob/20f9a1b575a21b1714452fdb17b4d6b70e610d29/docs/matriz-conformidade-tecnica.md)
e o [histórico de mudanças](../CHANGELOG.md) conservam as etapas e as lacunas
então encontradas.

## Preservação dos dados e das responsabilidades

Cada alteração do curso recebe um número de revisão. Uma gravação compara o número
que leu com o estado corrente para evitar sobrescrever mudanças de outra operação.
Os recibos temporários guardam o resultado de um pedido: se a resposta se perder,
permitem recuperá-la sem repetir os efeitos. A [persistência](persistencia-relacional.md#escritas-concorrentes)
especifica essas duas proteções.

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
