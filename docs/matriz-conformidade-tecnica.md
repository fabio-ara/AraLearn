# Matriz de conformidade técnica

O código precisa preservar as mesmas regras quando a pessoa usa a interface ou
solicita autoria por um cliente externo de IA. Esses clientes enviam pedidos por
[MCP](autoria-mcp.md), protocolo de chamada de ferramentas, ou por
[Actions](autoria-actions.md), operações descritas em OpenAPI. Esta matriz relaciona
as regras às partes que as executam e às
verificações disponíveis. Um teste localizado é um caminho para reproduzir uma prova;
seu resultado pertence à versão e à execução registradas.

A [arquitetura](arquitetura.md) explica como navegador, serviços e banco se
relacionam. O [guia do desenvolvedor](guia-desenvolvedor.md) orienta a execução dos
testes. As capacidades apresentadas ao público e seus limites estão em [Capacidades e
limites atuais](estado-atual-e-roadmap.md).

## Capacidades e verificações

Os caminhos abaixo partem da raiz do repositório. Nomes curtos de testes referem-se a
arquivos de `tests/runtime/` ou `tests/e2e/`.

| Propriedade | Implementação e relação com os dados | Verificação focal | Limite da prova |
| --- | --- | --- | --- |
| A autoria abre no conteúdo e mantém o foco | `CourseAuthoringSurface` e rotas usam o curso salvo; inspeção paginada preserva alvo e posição | `course-authoring-route.test.js`, `course-authoring-surface.test.js`, `course-authoring-cutover.spec.js` | teste local não confirma a experiência da versão hospedada |
| O mapa organiza o curso antes da produção | plano global em módulos, lições e microssequências; partes agrupam produção sem acrescentar nível curricular | `incremental-authoring-conversation-acceptance.test.js` e testes de planejamento | quantidade de partes não mede cobertura ou profundidade |
| Ideias são acompanhadas ao longo do percurso | inventário de unidades de análise distingue introdução, uso e retomada | `instructional-analysis-granularity-eval.test.js` e casos sintéticos | identidade e contagem não demonstram equivalência de significado |
| A explicação pode preceder as unidades | `courseExplanation.js` guarda a base; `appliedExplanationBasis.js` identifica a base usada na produção | `applied-explanation-basis.test.js`, `applied-explanation-basis-pglite.test.js` | alterar a base não atualiza silenciosamente o conteúdo produzido |
| A revisão depende de declaração humana por objeto | `courseContentReview.js`, interface e `declarar_revisao` distinguem explicação e unidade; a base inspecionada é comparada antes da gravação | `course-content-review.test.js`, `course-human-contextual-review.test.js`, `course-microsequence-review.spec.js` | persistir uma declaração não mede qualidade pedagógica; acesso é decisão separada |
| A política de estudo é explícita | `saved` permite conteúdo salvo; `reviewed_only` exige revisão atual, além das permissões do curso | `course-content-review-access-pglite.test.js` e jornadas de acesso local | revogação de acesso precisa de confirmação conectada no dispositivo |
| Parâmetros, perfis e cadência conservam decisões aplicadas | `courseDesignParameters.js` tipa valores e herança; perfis copiam preferências, sem vínculo retroativo com os cursos | `course-design-parameters.test.js`, `authoring-profiles.test.js` | alvos editoriais e quantidades não certificam aprendizagem nem autorizam truncar conteúdo |
| MCP e Actions executam as mesmas tarefas | `COURSE_HUMAN_TASKS` alimenta MCP e a projeção OpenAPI; o executor resolve referências e autorização | `course-human-mcp.test.js`, `chatgpt-action-human-schema.test.js`, verificação OpenAPI | cada cliente efetivo precisa receber o contrato atualizado e ser exercitado |
| Correções tratam apenas as observações atendidas | fila versionada por explicação ou unidade; releitura da correção confirma conteúdo antes de consumir as versões relacionadas | `course-observation-corrections-pglite.test.js`, `course-observation-review-transport.test.js` | transporte incerto exige reconciliar a mesma tentativa; entradas alteradas continuam pendentes |
| Componentes funcionam por contrato de pacote | registro delega validação, edição, apresentação e resposta aos pacotes; núcleo conserva composição e ciclo de vida | testes de pacotes, galeria e inspeção visual | validade estrutural não demonstra adequação da representação ao conteúdo |
| Fontes permanecem localizáveis e contestáveis | fontes, âncoras e vínculos correntes ligam trechos, obras e arquivos; citações usam metadados e estilo do curso | testes de fontes, citações, painel e ingestão | uma relação bibliográfica não comprova a verdade do conteúdo |
| Arquivos seguem a política autorizada | descritores lógicos no banco; bytes em áreas privadas do Storage; download revalida curso, fonte e arquivo | `course-storage-lifecycle-local-smoke.mjs`, testes de áudio e cópia de arquivos | banco restaurado não comprova presença dos bytes; mídia hospedada exige rede |
| Remoção e reanexo preservam arquivos ainda usados | marca de retirada e intenção temporária de limpeza; todas as referências e reservas são conferidas antes da exclusão pela API | testes de ingestão, remoção, reativação e órfãos | apagar metadados de Storage diretamente não executa a limpeza física |
| Cópias são independentes e deliberadas | origem própria ou com permissão de cópia; novas identidades e curso privado, com conteúdo, fontes e arquivos preservados | `course-copy-transport.test.js`, `course-copy-client.test.js`, `course-copy-files-local.test.js` | leitura pública não concede cópia; acessos e estado pessoal não são transportados |
| Exportação e comparação usam leitura coerente | `courseAuthoringComparison.js` reúne documento, fontes, bases aplicadas e revisão; compara o estado corrente em recortes explícitos | `course-authoring-comparison.test.js` | igualdade de números não demonstra equivalência pedagógica |
| Analytics descreve o estado corrente | `courseAuthoringAnalytics.js` deriva desenho e autoria; painel e exportação usam o mesmo objeto normalizado | `course-analytics-panel.test.js` e testes de domínio | contagens não são notas, telemetria de atenção ou efeitos educacionais |
| Continuidade local preserva trabalho e permissões | IndexedDB mantém composição, progresso e filas; sincronização manual adia trocas de conteúdo, com acesso conferido separadamente | testes de repositórios, duas abas, perda de rede e retorno | cópia local não concede autorização permanente |
| Banco novo e atualizado convergem | migrações reproduzem esquema; restauração descartável aplica a cadeia e compara estrutura e dados úteis | `verifyBackupRestoreUpgrade.mjs`, `backup-restore-upgrade.test.js` | dados sintéticos não substituem um backup atual do ambiente hospedado |
| Autorização permanece no servidor | privilégios, segurança em nível de linha (RLS) e funções SQL delimitam as operações | Supabase local, testes SQL e jornadas com contas distintas | ocultar um controle na interface não substitui recusa no servidor |
| A publicação usa uma candidata identificada | validação classifica o impacto; manifesto associa revisão, verificações e artefatos promovidos | `deployment-automation.test.js` e workflows | aprovação de código não confirma, sozinha, a atualização de todos os serviços hospedados |

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

Uma mudança de contrato, banco ou autorização deve ser exercitada na regra de domínio,
no transporte, no banco descartável e no cliente afetado. Instalação nova, atualização
e restauração verificam riscos diferentes. A seleção de provas segue o impacto real da
mudança, conforme o [guia do
desenvolvedor](guia-desenvolvedor.md#testes-e-integração).

Para a interface, confira também larguras, temas, foco e recuperação de erro no
[roteiro de verificação](auditoria-front-end.md). Para avaliar compreensão,
aprendizagem ou experiência com participantes, use o [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).
