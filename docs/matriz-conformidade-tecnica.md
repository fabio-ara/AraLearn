# Matriz de conformidade técnica

Esta matriz liga propriedades do produto aos mecanismos que as sustentam e às
provas executáveis correspondentes. Ela descreve o estado corrente; números de
execuções pertencem aos checks, não a esta página.

| Propriedade | Mecanismo principal | Onde verificar | Limite da prova |
| --- | --- | --- | --- |
| hierarquia Curso → Módulo → Lição → Microssequência → Unidade | `CourseStudyApplication.js` e contrato do Curso | testes de tela e jornadas de Estudo | não mede compreensão |
| `←` volta à tela anterior e `↑` sobe na hierarquia | histórico de navegação e posição pessoal | `course-study-cutover.spec.js` | depende da jornada exercitada |
| Visualizar, Editar e Assistência são modos irmãos da Unidade | `CourseStudyScreen.js` e `CourseProviderAssistance.js` | testes de tela, assistência e edição | não avalia preferência visual |
| edição compartilhada preserva o original | operação de cópia pessoal e CAS | testes PostgreSQL, PGlite, IndexedDB e E2E | não cobre acesso não autorizado fora dos casos testados |
| Assistência exige plano, confirmação e renderer | `courseContextualAssistance.js`, consulta de componentes e renderer canônico | testes de domínio, runtime e E2E | qualidade pedagógica da proposta exige julgamento humano |
| proposta inválida não substitui conteúdo | validação tipada, reparo limitado e preview reversível | testes de assistência e corpus de componentes | não garante utilidade de proposta válida |
| Autoria atravessa interface e persistência | superfície, controlador, API, RPCs e tabelas canônicas | testes de painéis, Supabase local e E2E | não mede facilidade de uso |
| Fontes ligam revisão, Âncoras e PDF | contratos de Fonte, Storage privado e citações redigidas | testes de Fonte, PDF, Storage e Estudo | existência da Fonte não prova a afirmação |
| Auditoria separa achado de Observação | entidades e projeções próprias | testes de Auditoria e Observações | não valida o mérito acadêmico do achado |
| Pesquisa mostra fatos e ausências sem causalidade automática | projeções analíticas com definição e denominador | testes de Analytics e exportação | inferência causal exige desenho de pesquisa |
| MCP expõe cinco ferramentas canônicas | servidor MCP, OAuth e registro vertical | testes MCP e smoke OAuth | não cobre clientes externos indisponíveis |
| Actions é distinto de MCP | OpenAPI, Edge Function e cliente OAuth próprios | testes de Actions e gerador OpenAPI | configuração de um GPT externo requer acesso à plataforma |
| excluir Curso e sair de compartilhamento são operações distintas | `course-product-operations-v1` | testes de operação, API e Home | ação destrutiva real exige confirmação do alvo |
| limpeza local, saída e exclusão de conta têm efeitos distintos | IndexedDB, Auth e exclusão relacional | testes de sessão, armazenamento e UI | recuperação depende de backup quando aplicável |
| Manutenção é restrita e revalida órfãos | RPC administrativa e inventário classificado | testes PGlite, paridade e UI autorizada | não oferece inspeção genérica do banco |
| web e Android usam o mesmo produto | build Pages e empacotamento WebView | E2E, verificadores de implantação e builds | hardware real ainda pode revelar diferenças |

## Como usar a matriz

Ao alterar uma propriedade, acompanhe o fluxo até as camadas realmente
afetadas. Uma tela nova sem autorização e persistência não fecha o caso; uma RPC
sem superfície compreensível também não.

Comece pela prova focal que detecta a regressão concreta. Amplie para Supabase
local, E2E, build e ambiente hospedado quando a mudança atravessar esses
contratos. A [verificação da interface](auditoria-front-end.md) descreve o
percurso visual, e [Implantação](implantacao.md) descreve os gates de publicação.
