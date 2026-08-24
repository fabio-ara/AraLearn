# Handoff para Codex — fechamento do AraLearn 2.0

## Ponto de partida

Use `main` como base funcional e `ux/codex-frontend-v11` como especificação de UX/UI.

Leia nesta ordem:

1. issue #147;
2. issue #174;
3. `ux-atlas/STUDY-VISUAL-BASELINE.md`;
4. `ux-atlas/MATRIZ-COBERTURA.md`;
5. `ux-atlas/index.html`;
6. `docs/principios-editoriais.md`;
7. a issue corrente entre #151 e #155.

Não use `ux/atlas-frontend`, `ux/atlas-v11-continuity` ou `ux/final-interface-spec` como base de implementação.

## Autoridades

- **Funcionalidade, dados e autorização:** `main`, com as menores adaptações verticais permitidas por #174 quando necessárias ao produto final.
- **Cobertura, navegação e estados:** `ux-atlas/`.
- **Identidade visual e interação de Estudo:** `STUDY-VISUAL-BASELINE.md`, baseada em `9e7ddc013d8efcf2918bf2b5b03f506217098e15`.
- **Implementação visual:** `docs/sistema-visual.md`, tokens e componentes atuais.
- **Documentação:** `docs/principios-editoriais.md`, `docs/README.md`, `docs/inventario-documentacao.md` e a bibliografia canônica `docs/referencias.bib`.

O baseline histórico é referência visual/interacional. Não restaure Workspace, Trilhas, APIs, schemas, rotas ou persistência antigos.

## Resultado obrigatório de Estudo

- switch compacto **Estudo / Autoria**;
- navegação previsível Curso → Módulo → Lição → Microssequência → Unidade;
- `←` volta exatamente à tela anterior e preserva posição/foco quando aplicável;
- `↑`, quando existir, sobe somente um nível didático;
- Unidade com **Visualizar / Editar / Assistência por API**, nesta ordem, com Visualizar como padrão;
- Editar usa o mecanismo manual corrente;
- Assistência usa `StudyUnitProviderAssistance` e os contratos correntes;
- cópia pessoal, offline, rascunho, desfazer/refazer e reconciliação permanecem funcionais.

## Resultado obrigatório de Autoria

A Autoria usa a mesma família visual de Estudo e torna encontráveis, sem dashboard ou taxonomia excessiva:

- Estrutura;
- Planejamento e Partes/materialização;
- Parâmetros, orientações e política de componentes;
- Fontes, Âncoras e PDFs;
- Inspeção;
- Observações;
- Auditoria, correção, verificação e reversão;
- Variantes;
- Pesquisa/Analytics;
- Pessoas/acesso;
- ação contextual ChatGPT/MCP.

Capacidade não precisa ser aba permanente. Capacidade de produto também não pode ficar escondida a ponto de parecer inexistente.

## Operabilidade depois do encerramento

Depois desta sequência, tarefas normais de uso e manutenção não podem depender de código, SQL ou navegação manual no Storage.

A interface deve permitir, conforme autorização:

- criar, localizar, editar e excluir Curso próprio ou cópia pessoal;
- distinguir exclusão remota, limpeza local, zerar progresso e saída de compartilhamento;
- conceder/revogar acesso;
- manter Parâmetros, componentes, Fontes, Âncoras, PDFs e Variantes;
- excluir a própria conta e limpar dados locais pelos fluxos próprios;
- para papel administrativo, abrir **Manutenção**, consultar resíduos correntes classificados pelo backend e executar somente correções seguras e específicas.

**Manutenção** não é cliente de banco: não expõe SQL, tabelas arbitrárias, buckets genéricos ou service key.

## Mudanças de backend

O backend atual é o ponto de partida. Se a UX ou a operabilidade definidas exigirem lacuna pequena, implemente a menor mudança vertical correta, inclusive migration/RPC/endpoint/Edge Function quando necessário.

Antes de criar algo novo, verifique se contrato ou serviço existente pode ser ajustado. A mudança deve entregar comportamento observável, autorização e teste no mesmo recorte.

## Corte completo

Não deixe fallback, legado ou compatibilidade paralela.

Quando um caminho for substituído:

1. migre os consumidores;
2. torne o novo caminho canônico;
3. remova leitura/escrita antigas, aliases, adapters, feature flags e fallbacks usados só para compatibilidade;
4. remova testes e documentação corrente do caminho antigo;
5. prove ausência de consumidor por busca e testes.

O Git e os backups preservam recuperação; o runtime final não preserva duas implementações.

## Freio contra overengineering

Não crie arquitetura futura para concluir #151–#155. Em particular, não implemente `VersionedCourseStore`, Git/GitHub runtime, `CourseLineage`, `ContributionRound`, `SemanticDiff`, event sourcing, plugin system, framework novo, painel administrativo genérico ou nova plataforma de observabilidade.

Não abra subissues automaticamente. Não amplie o escopo por conveniência arquitetural. #156–#168 permanecem deferidas.

## Execução contínua

Execute #151 → #152 → #153 → #154 → #155 sem aguardar confirmação entre etapas normais. Use commits coerentes. Corrija pequenos bloqueios dentro do escopo e continue.

Só interrompa quando houver ação remota destrutiva sem autorização suficiente, credencial indispensável ausente, decisão de produto materialmente ambígua ou falha que não possa ser corrigida proporcionalmente.

Depois de #155, pare.

## Chrome como gate de frontend

O Codex local já consegue operar o Chrome. Use-o diretamente durante #152–#154.

Teste o produto por cliques, teclado, rolagem e navegação reais. Prove Estudo, retorno tela a tela, os três modos da Unidade, Autoria, Parâmetros, Fontes/PDFs, Pesquisa, ciclo de vida de Curso, acessos e Manutenção. Use dados descartáveis para ações destrutivas. Guarde capturas/revisão testada como evidência interna.

Testes automatizados continuam necessários, mas não substituem a navegação real no Chrome.

## Documentação final

A documentação é parte da entrega e deve refletir a finalidade didática do próprio AraLearn.

### Camada de uso, para público geral

Deve permitir que uma pessoa sem formação prévia compreenda o produto e execute tarefas. Comece pelo problema, pela finalidade e pela ação observável. Explique termos técnicos ou educacionais somente depois que o leitor já tenha um referente compreensível.

Os percursos principais ensinam o que é o AraLearn; como navegar; como estudar e retomar; como editar e usar Assistência por API; como criar, planejar e manter Cursos; como configurar Parâmetros e componentes; como trabalhar com Fontes/PDFs, Observações, auditoria, Variantes e Pesquisa; como compartilhar e retirar acesso; como excluir/limpar objetos sem confundir alcances; e como usar Manutenção quando a pessoa possuir o papel administrativo.

### Camada de aprofundamento conceitual e acadêmico

Preserve e aprofunde a documentação sobre modelo didático, desenho instrucional, componentes, aprendizagem, pesquisa educacional, metodologia, métricas, limites de inferência, literatura e referências bibliográficas. Diferencie fundamento teórico, hipótese, capacidade implementada e resultado empírico.

Esse aprofundamento também é didático. Não presuma domínio prévio de construtos ou métodos. Apresente primeiro o problema, desenvolva a ideia em linguagem corrente, introduza depois o termo técnico e então aprofunde relações, alternativas, evidências e limites.

### Camada de engenharia

Documente em profundidade arquitetura, linguagens e tecnologias, fronteiras, persistência, Auth, Storage, Edge Functions, sincronização, offline, contratos, APIs/MCP, segurança, autorização, build, implantação, testes, recuperação e decisões técnicas correntes. Um leitor técnico deve conseguir entender e reproduzir o sistema sem depender da história das issues.

A engenharia também deve ser ensinada progressivamente. Explique o problema e o papel do mecanismo antes de siglas, nomes de tabelas, funções ou contratos. Um pesquisador educacional sem formação em computação deve conseguir acompanhar a ideia principal antes de entrar no detalhe de implementação.

### Pesquisa bibliográfica e referências

Use primeiro o corpus já existente. Amplie a pesquisa quando uma afirmação importante estiver insuficientemente sustentada, quando o mecanismo corrente exigir fonte mais atual ou quando houver controvérsia que não esteja representada.

- Em engenharia, priorize normas, especificações, documentação oficial e literatura técnica primária, complementando com pesquisa acadêmica quando a afirmação depender de evidência sobre segurança, interação humano-computador, privacidade ou comportamento de sistemas.
- Em desenho instrucional e educação, use revisões, meta-análises, estudos fundamentais, teorias e estudos primários relevantes, incluindo evidência contraditória e limites.
- Em pesquisa educacional, fundamente construtos, validade, medição, desenho e inferência com literatura metodológica apropriada.

Todo documento técnico, conceitual ou acadêmico com afirmações externas deve citar autor-data no corpo e terminar com **Referências**, contendo somente as fontes citadas naquela página.

`docs/referencias.bib` é a fonte canônica. Não mantenha bibliografia local manualmente divergente. Em #154, estenda apenas o necessário o mecanismo atual de referências para gerar/validar a bibliografia de cada página e rejeitar citações ou entradas inconsistentes. `docs/referencias.md` permanece como bibliografia geral do projeto.

### Regra editorial

- português brasileiro natural, didático e preciso;
- sem texto de bastidor sobre Codex, ChatGPT como agente de implementação, issues, tentativas ou improvisações;
- sem diário de refatoração na documentação corrente;
- sem cronologia de versões em README e guias correntes;
- sem jargão antes de explicação;
- sem enumerações mecânicas usadas para aparentar completude;
- sem anglicismo dispensável ou travessão estilístico;
- nomes da interface devem coincidir com o produto;
- documentação corrente descreve o estado atual; história fica no Git/CHANGELOG quando pertinente;
- detalhes técnicos e acadêmicos não são removidos para simplificar a entrada: ficam em aprofundamentos integrados e didáticos.

Em #154, revise o corpus inteiro guiado por `docs/inventario-documentacao.md`; reescreva, consolide ou remova documentos correntes quando necessário. Não mantenha duas páginas concorrentes sobre o mesmo comportamento. Execute os auditores documentais existentes e corrija também clareza, coerência e sustentação bibliográfica que a automação não detectar.

## Critérios finais

1. Estudo recupera a experiência e a navegação definidas.
2. Autoria cobre as capacidades de produto do backend final.
3. Tarefas previsíveis de manutenção podem ser feitas pela interface.
4. Chrome real passa nos fluxos definidos nas issues.
5. Pesquisa apresenta gráfico, tabela equivalente, definição, fatos, deep links e exportação com o mesmo contrato.
6. Runtime final não conserva fallback ou compatibilidade com caminhos substituídos.
7. O legado inventariado é cortado em #155 com as verificações existentes.
8. Documentação de uso, técnica e acadêmica descreve a mesma versão do produto, sem bastidores.
9. Aprofundamentos técnicos e acadêmicos são didáticos e bibliograficamente fundamentados, com referências locais ao fim de cada página relevante.
10. `node ux-atlas/validate.mjs`, testes e auditores pertinentes passam.
11. Depois de #155, não iniciar #156–#168.