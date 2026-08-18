# Inventário editorial da documentação pública

## Finalidade e escopo

Este inventário orienta a consolidação da documentação sem criar uma segunda
fonte de verdade sobre o produto. Ele cobre cada página Markdown em
`docs/**/*.md`, inclusive os materiais derivados publicados em
`docs/downloads/authoring/`. Arquivos executáveis em `authoring/`, documentos
gerais da raiz, imagens, dados de evidência e o manual operacional privado têm
ciclos próprios e não fazem parte desta tabela.

O inventário registra uma decisão editorial, não uma afirmação de que o
conteúdo atual de uma página está correto. A implementação e o comportamento
observado continuam sendo confrontados pelas matrizes e pelos testes
apropriados.

A tabela acompanha apenas as páginas correntes. Retiradas editoriais e seus
destinos são registradas abaixo; o conteúdo anterior permanece recuperável no
Git.

## Estados editoriais

- **conservar:** a função e a maior parte do conteúdo permanecem úteis;
- **reformular:** a página conserva sua função, mas precisa refletir o modelo e
  o vocabulário que forem validados;
- **fundir:** o conteúdo aproveitável deve ser incorporado ao destino e a
  página, então, retirada;
- **remover:** registro transitório ou obsoleto cujo histórico já é preservado
  pelo Git;
- **gerado:** artefato reconstruído a partir de uma fonte canônica, nunca
  editado diretamente.

## Inventário

| Página | Estado | Destino editorial explícito |
| --- | --- | --- |
| `analytics-instrucionais.md` | reformular | manter neste caminho, com métricas de autoria e pesquisa ligadas a dados observáveis |
| `aralearn-contract.md` | reformular | manter neste caminho após estabilizar entidades, vocabulário e contratos públicos |
| `arquitetura.md` | conservar | explica Curso vivo, composição paginada, auditoria/correções, estado pessoal, acesso direto e gates da promoção |
| `assistencia-por-ia.md` | reformular | manter neste caminho e alinhar a assistência à autoria e à pesquisa realmente acessíveis |
| `auditoria-academica-dos-resources.md` | reformular | manter neste caminho após a revisão terminológica e metodológica dos recursos de card |
| `auditoria-de-conformidade-instrucional.md` | conservar | contrato corrente de contexto, rodada, achado, correção, verificação, rollback e privacidade |
| `auditoria-front-end.md` | reformular | manter neste caminho como método reproduzível, sem resultados transitórios de uma versão |
| `autoria-mcp.md` | conservar | explica as seis ferramentas, o recurso de invariantes, OAuth e o Curso compartilhado com a interface |
| `contribuicao-originalidade.md` | reformular | manter neste caminho, distinguindo contribuição demonstrada de hipótese e intenção |
| `criar-cursos-pelo-chat.md` | reformular | manter neste caminho como guia simples da autoria conversacional vigente |
| `desenho-instrucional-parametrizado.md` | reformular | manter neste caminho após validar parâmetros semânticos, escopos e herança |
| `dicionario-metricas-datasets.md` | reformular | manter neste caminho como dicionário versionado das métricas realmente coletadas |
| `downloads/authoring/aralearn-chatgpt-knowledge-core.md` | gerado | reconstruir das fontes em `authoring/` com `npm run authoring:packages` |
| `downloads/authoring/aralearn-chatgpt-knowledge-resources.md` | gerado | reconstruir das fontes em `authoring/` com `npm run authoring:packages` |
| `downloads/authoring/aralearn-chatgpt-system-prompt.md` | gerado | reconstruir das fontes em `authoring/` com `npm run authoring:packages` |
| `downloads/authoring/README.md` | gerado | reconstruir das fontes em `authoring/` com `npm run authoring:packages` |
| `estado-atual-e-roadmap.md` | conservar | matriz corrente e gates de importação, reset, migração e promoção |
| `estado-de-estudo-nao-punitivo.md` | conservar | manter neste caminho e revisar apenas quando o comportamento de Estudo mudar |
| `experimentos-instrucionais-parametrizados.md` | reformular | manter neste caminho após definir a arquitetura mínima de variantes comparáveis |
| `fluxos-prompts-e-contratos.md` | reformular | manter neste caminho, limitado aos fluxos e contratos realmente executados |
| `fundamentacao-pedagogica-dos-resources.md` | reformular | manter neste caminho após a revisão acadêmica da nomenclatura e das representações |
| `fundamentos-pesquisa-e-governanca.md` | reformular | manter neste caminho, separando rigor científico de governança institucional desnecessária |
| `glossario-construtos.md` | reformular | manter neste caminho como vocabulário científico controlado |
| `glossario-tecnico.md` | conservar | mecanismos do runtime canônico e termos futuros explicitamente não implementados |
| `guia-desenvolvedor.md` | reformular | manter neste caminho com o fluxo técnico vigente e verificável |
| `guia-estudante.md` | conservar | percurso atual de Estudo, revisão, observação, retomada e reset por Curso |
| `guia-pesquisador.md` | reformular | manter neste caminho com autoria, experimentos, dados e análise que existirem de fato |
| `guia-professor-autor.md` | conservar | percurso atual de criação, planejamento, Fontes, inspeção, Auditoria e correções, MCP, perfil e acesso |
| `implantacao.md` | reformular | manter neste caminho com requisitos e limites de implantação atuais |
| `integrations/android-share-import.md` | conservar | manter neste caminho enquanto a integração Android permanecer suportada |
| `integrations/codex-cli.md` | remover | transferir memória operacional útil ao manual privado e preservar o texto público no histórico do Git |
| `inventario-documentacao.md` | conservar | manter neste caminho somente durante a consolidação editorial; depois converter a manutenção em auditoria automática |
| `matriz-conformidade-tecnica.md` | reformular | manter neste caminho como ligação entre afirmações e evidências executáveis atuais |
| `matriz-rastreabilidade-pedagogica.md` | reformular | manter neste caminho como ligação entre fundamento, decisão, implementação e avaliação |
| `modelo-didatico.md` | reformular | manter neste caminho após validar hierarquia, Parte, parâmetros e terminologia didática |
| `observacoes-pedagogicas.md` | conservar | contrato de Anotação ancorada, triagem/offline/privacidade e fronteira explícita com auditoria/correções |
| `origens-do-aralearn.md` | conservar | manter neste caminho como narrativa biográfica delimitada, sem função probatória |
| `persistencia-relacional.md` | conservar | modelo canônico de PostgreSQL, IndexedDB, Anotações, auditoria/correções, avatar, CAS, recibos e reconciliação |
| `principios-editoriais.md` | conservar | manter neste caminho como norma editorial da documentação pública |
| `privacidade.md` | reformular | manter neste caminho conforme propriedade, compartilhamento, pesquisa e retenção forem validados |
| `protocolo-avaliacao-artefato.md` | reformular | manter neste caminho como protocolo de avaliação, sem apresentar intenção como resultado |
| `quadro-teorico.md` | reformular | manter neste caminho e atualizar somente com construtos e relações justificáveis |
| `README.md` | reformular | manter neste caminho apenas como mapa de percursos, sem repetir capítulos |
| `componentes-didaticos.md` | conservar | contrato corrente da fronteira entre núcleo, packages e interface de autoria |
| `referencias.md` | gerado | reconstruir de `referencias.bib` com `npm run docs:references` |
| `revisao-de-literatura.md` | reformular | manter neste caminho como síntese narrativa com protocolo e registro prospectivos |
| `roteiro-aceitacao-humana-autoria.md` | reformular | manter neste caminho como roteiro reutilizável, sem dependência de uma tarefa numerada |
| `sistema-visual.md` | conservar | manter neste caminho como referência visual e atualizar junto da interface |
| `solucao-de-problemas.md` | reformular | manter neste caminho somente com sintomas e procedimentos ainda reproduzíveis |
| `supabase.md` | reformular | manter neste caminho conforme banco, Storage, autenticação e funções efetivamente usados |
| `uso-do-app.md` | conservar | guia do runtime canônico e limites ainda não implementados |
| `vocabulario-controlado.md` | gerado | reconstruir de `evidence/terminologia-canonica.v1.json` com `npm run audit:terminology -- --render` |
| `visao-do-produto.md` | reformular | manter neste caminho como intenção corrente, separada do estado implementado |

## Decisões de retirada desta etapa

| Página retirada | Decisão | Destino do conteúdo útil |
| --- | --- | --- |
| `checkpoint-autoria-109.md` | remover | resultados estáveis foram incorporados ao estado corrente e à evidência integrada; o checkpoint permanece no Git |
| `checklist-ux-autoria-integrada.md` | fundir | critérios reutilizáveis foram incorporados ao roteiro de aceitação humana |
| `conformidade-documentacao-autoria.md` | fundir | rastreabilidade vigente foi incorporada à matriz de conformidade técnica |
| `autoria-do-catalogo.md` | remover | o runtime corrente não possui fluxo editorial público; história preservada no Git |
| `guia-administracao-workspace.md` | remover | acesso direto foi incorporado a `guia-professor-autor.md`; história preservada no Git |
| `plano-de-controle-e-artefatos.md` | remover | decisões vigentes foram incorporadas a `arquitetura.md` e `persistencia-relacional.md`; história preservada no Git |
| `workspaces-educacionais.md` | remover | propriedade e acesso direto foram incorporados aos guias e à arquitetura; história preservada no Git |

## Regra de manutenção

Uma página só muda de estado quando seu destino tiver absorvido o conteúdo que
continua válido e os links de entrada tiverem sido corrigidos. Remoção não
apaga a história: commits, tags e releases continuam preservando o contexto.
Arquivos gerados mudam apenas por suas fontes e pelo gerador correspondente.
