# Autoria pelo MCP

Um assistente externo precisa descobrir quais operações o AraLearn oferece
antes de consultar ou alterar um curso. O [Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/latest)
padroniza essa comunicação: o serviço apresenta ferramentas, seus argumentos e
seus resultados; o cliente as chama conforme o trabalho autorizado.

No AraLearn, essas ferramentas permitem planejar o curso, desenvolver a
explicação — o texto-base com fontes de uma microssequência —, produzir unidades
e corrigir conteúdo. A pessoa orienta o trabalho e inspeciona o resultado no
aplicativo. A [autoria por conversa](criar-cursos-pelo-chat.md) apresenta esse
percurso; os [fluxos e contratos](fluxos-prompts-e-contratos.md) explicam como o
pedido se transforma numa operação verificável.

As ferramentas atendem a clientes compatíveis com o protocolo. O modelo usado
pelo cliente participa da produção e da análise; o curso permanece salvo no
AraLearn, onde também pode ser editado pela interface.

## Tarefas disponíveis

As tarefas vêm do catálogo público `aralearn.human-authoring-tasks` 4.0.0, definido em
[courseHumanTasks.js](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).
O catálogo contém 16 leituras e 38 escritas. Cada definição reúne nome,
argumentos aceitos e resultado. As tabelas descrevem seus usos; os formatos
estruturados de entrada, ou schemas, são gerados dessa fonte.

| Leitura | Quando usar |
| --- | --- |
| `consultar_preferencias_autoria` | ler foco, cadência, pontos de revisão e diálogo pessoais, com as condições do curso quando indicado |
| `consultar_perfis` | listar perfis de preferências desta conta |
| `prever_aplicacao_perfil` | examinar alcance e exceções antes de aplicar um perfil ao curso |
| `retomar_curso` | localizar ou continuar um curso pelo título |
| `comparar_cursos` | confrontar inventário, configuração e dimensões declaradas de dois recortes próprios |
| `exportar_autoria` | obter o artefato literal e a leitura autoral de um recorte próprio |
| `consultar_planejamento` | ler o mapa curricular completo e, quando pertinente, uma parte operacional |
| `preparar_materializacao` | reunir base explicativa, fontes, repertório acumulado e configuração do lote antes de produzir unidades |
| `consultar_configuracao` | ler parâmetros pedagógicos, alvos editoriais e direção editorial efetivos |
| `consultar_repertorio_instrucional` | ler unidades de análise, requisitos de evidência, vínculos e aplicações salvas |
| `consultar_observacoes` | ler as entradas versionadas da fila pertinente à explicação ou às unidades |
| `preparar_revisao` | reunir também unidades afetadas por progressão, exemplos ou prática |
| `consultar_fontes` | localizar fontes, âncoras e proveniência |
| `consultar_componentes` | buscar representações pela função e ler o contrato exato do componente escolhido |
| `consultar_audios` | recuperar uma página da biblioteca de áudios do curso para reutilização |
| `consultar_acesso` | ler visibilidade, concessões, permissão de cópia e políticas de arquivos e revisão |

| Escrita | Quando usar |
| --- | --- |
| `salvar_preferencias_autoria` | alterar padrões pessoais de processo sem modificar cursos ou condições de pesquisa retroativamente |
| `salvar_perfil` | criar ou editar preferências por cópia, sem alterar cursos |
| `excluir_perfil` | excluir um perfil sem alterar cópias já aplicadas |
| `aplicar_perfil` | aplicar a prévia examinada, preservando exceções salvo seleção explícita |
| `criar_curso` | criar um curso privado após confirmar título e objetivo |
| `alterar_curso` | renomear ou alterar objetivo, conservando os metadados não indicados |
| `excluir_curso` | preparar e confirmar exclusão do curso próprio por alvo inequívoco, com a limpeza pertinente de arquivos |
| `copiar_curso` | preparar e confirmar cópia independente de curso próprio ou explicitamente autorizado |
| `salvar_mapa_curricular` | salvar uma proposta completa como rascunho para inspeção |
| `aprovar_mapa_curricular` | registrar a aprovação da versão persistida inspecionada, usando sua referência opaca |
| `salvar_ramo_curricular` | incluir ou editar módulo, lição ou microssequência por recorte, inclusive dependências, cobertura e fontes previstas |
| `mover_ramo_curricular` | mover ou reordenar ramo completo preservando descendentes, identidades e registros |
| `duplicar_ramo_curricular` | copiar ramo e dados úteis no mesmo curso, sem herdar declaração humana de revisão |
| `remover_ramo_curricular` | remover explicitamente ramo e descendentes, protegendo referências sobreviventes e fontes compartilhadas |
| `salvar_parte` | agrupar microssequências já previstas num lote operacional e registrar sua progressão local |
| `salvar_explicacoes` | produzir ou corrigir bases explicativas e fontes antes ou depois das unidades, preservando as unidades existentes |
| `materializar_parte` | gravar as unidades de estudo de uma parte preparada |
| `reordenar_unidades` | salvar a ordem completa das unidades de uma microssequência, preservando IDs, conteúdo e configuração aplicada |
| `ajustar_configuracao` | fixar valores de autoria ou pesquisa, delegar parâmetros automáticos ou restaurar herança no escopo |
| `ajustar_orientacao` | alterar a orientação do objeto corrente para trabalho futuro |
| `ajustar_componentes` | definir disponibilidade, exclusões e preferências de componentes no escopo escolhido |
| `manter_unidade_analise` | incluir, editar ou remover um item expresso do repertório instrucional |
| `manter_requisito_evidencia` | incluir, editar ou remover um requisito expresso de evidência |
| `vincular_repertorio_instrucional` | salvar a seleção explícita de análise e evidência de uma microssequência |
| `registrar_aplicacoes_instrucionais` | registrar introduções, usos, formas e oportunidades nas unidades inspecionadas |
| `aplicar_configuracao_instrucional` | aplicar a intenção corrente às unidades existentes, com calibração explícita dos automáticos e preservação de fixações e condições de pesquisa |
| `registrar_observacao` | acrescentar uma entrada à fila de uma explicação ou de unidades selecionadas |
| `editar_observacao` | alterar a versão inspecionada de uma entrada, conservando sua pendência |
| `aplicar_correcoes` | aplicar o conjunto coerente de correções já revisado |
| `retomar_correcao` | reconciliar conteúdo, fila e tentativa original sem reescrever a correção |
| `declarar_revisao` | registrar ou retirar a declaração humana expressa sobre o conteúdo salvo referenciado |
| `manter_fonte` | salvar ou retirar fonte, PDFs, âncoras, verificação e vínculos de proveniência |
| `incorporar_pdf_como_fonte` | guardar um PDF anexado como fonte ou vinculá-lo a uma fonte existente |
| `guardar_audio` | guardar WAV PCM ou MP3 já existente na biblioteca do curso |
| `definir_visibilidade` | tornar o curso público com arquivos disponíveis por padrão, ou privado; permite restringir os arquivos explicitamente |
| `alterar_acesso` | conceder ou revogar acesso da pessoa identificada, com escolha expressa sobre cópia |
| `definir_acesso_arquivos` | escolher herança, restrição ou disponibilidade dos arquivos da fonte inspecionada |
| `definir_politica_revisao` | escolher entre conteúdo completo salvo e somente revisado sem alterar visibilidade ou direitos |

O mesmo catálogo gera a descrição de dados aceita em Actions. Cada operação
corresponde a uma tarefa delimitada. Atualizar o catálogo exige usar os nomes
correntes; nomes antigos não funcionam como alternativas.

## Arquivos da conversa

Para guardar um anexo da conversa, o servidor precisa de um endereço temporário
que possa baixar e das informações do arquivo. O caminho no computador da pessoa
não fornece esse acesso. Na extensão de arquivos do cliente utilizado nos testes,
esses dados chegam como `{download_url, file_id, mime_type?, file_name?}`,
indicados por `_meta["openai/fileParams"]`.

Essa extensão depende do cliente MCP; ela não faz parte da capacidade presumida
de todo cliente. O servidor verifica a origem autorizada e os bytes antes de
guardar o arquivo. `guardar_audio` recebe áudio já existente, sem chamar síntese
ou transcrição. Os formatos aceitos são WAV PCM, áudio não comprimido, e MP3.

O tipo MIME é o rótulo de formato informado no envio, como `audio/wav`.
O servidor compara o tipo declarado no descritor, o tipo recebido no download
e os bytes do arquivo. Se houver recusa, `unsupported_audio_media_type`
(HTTP 415) distingue os dois rótulos para ajudar a localizar a divergência.
A mensagem mostra apenas rótulos válidos e de tamanho limitado, preservando
URL temporária, cabeçalhos e identificadores. A rejeição de um rótulo não basta
para concluir que os bytes do arquivo são inválidos.

O rótulo `audio/x-wav` recebido no download é aceito como `audio/wav`, desde que
os bytes correspondam a WAV PCM e sejam coerentes com o descritor. O descritor
continua usando `audio/wav` ou `audio/mpeg`; o arquivo armazenado conserva o tipo
normalizado `audio/wav`. MP3, HTML, PDF e WAV não PCM enviados sob o rótulo de
WAV são recusados. Permanecem as verificações de origem, tamanho e
redirecionamento aplicáveis à operação.

As ferramentas do estudo, como áudio e calculadora, são componentes do catálogo
comum, incluídos no campo `content` da unidade ou da explicação. A consulta focal de componentes fornece um contrato por vez; a de
fontes fornece alvos lógicos de PDF; a biblioteca fornece referências de áudio
sem endereços internos de armazenamento. Veja [ferramentas e canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-de-autoria).

## Fluxo de conversa

A retomada localiza o curso e recupera as escolhas do trabalho em andamento.
A pessoa pode começar pelo mapa, por uma explicação ou por uma correção em
conteúdo já existente. O serviço fornece o recorte pertinente e as referências
necessárias às operações seguintes. O [fluxo comum](fluxos-prompts-e-contratos.md)
relaciona planejamento, autorização para produzir e revisão do conteúdo salvo.

Na conversa com o assistente conectado, a pessoa indica o curso e o objeto
que deseja discutir. O assistente lê o conteúdo atual e o contexto necessário
antes de propor uma mudança. A alteração depende da intenção expressa pela pessoa.
A [declaração de revisão](explicacao-e-revisao-humana.md) pode ser registrada
na interface ou pela tarefa `declarar_revisao`, sobre o conteúdo inspecionado.

Uma **parte** agrupa microssequências para produção e pode ser reorganizada
sem mudar o currículo. `salvar_parte` recebe as referências das microssequências
na ordem desejada; `posicao`, quando informada, escolhe a posição do agrupamento
entre 1 e 64. São aceitas até 64 microssequências e uma intenção de até 4.000
caracteres. A reunião conserva títulos, intenções e progressões na proposta para
inspeção. **Reorganizar lotes** apresenta essa prévia no aplicativo.

## Repertório e materialização

Antes de produzir unidades, `preparar_materializacao` reúne a explicação, as
fontes, a configuração e o repertório do percurso. O repertório identifica o
conhecimento a introduzir, usar ou retomar, conforme o
[fluxo de produção](fluxos-prompts-e-contratos.md#repertório-acumulado).
`materializar_parte` recebe as unidades completas e as escolhas aplicadas a elas.
O contrato de [desenho](aralearn-contract.md#desenho) descreve seus campos.

As explicações existentes são reutilizadas. O campo `explicacoes` recebe
somente bases que também serão criadas ou alteradas. `salvar_explicacoes`
permite desenvolver a base e suas fontes antes das unidades, inclusive enquanto
o mapa está em rascunho.

## Configuração para uso e pesquisa

A configuração orienta como apresentar o conteúdo e organizar a prática. Cada
escolha pode ser definida pela pessoa ou delegada ao assistente. Valores fixados
e condições de pesquisa prevalecem sobre a escolha automática. A
[resolução dos parâmetros](autoria-contextual.md#parâmetros-origem-e-persistência)
explica a prioridade e a diferença entre intenção atual e configuração aplicada.

## Perfis da conta

Um perfil guarda escolhas para reutilização. Aplicá-lo copia essas escolhas
para o curso; editar ou excluir o perfil depois conserva as cópias já aplicadas.
`prever_aplicacao_perfil` permite examinar alcance e exceções antes da confirmação
por `aplicar_perfil`. As [preferências de autoria](parametros-de-autoria.md)
explicam a relação entre perfil, padrão pessoal e acordo de um trabalho em curso.

## Fontes, observações e revisão

Uma fonte pode delimitar o escopo, oferecer uma tarefa de avaliação ou sustentar
uma explicação. Seus vínculos registram o uso feito no curso. Uma observação,
por sua vez, registra algo que a pessoa quer examinar ou corrigir. A
[revisão do conteúdo](fluxos-prompts-e-contratos.md#observações-revisão-e-privacidade)
reúne essas entradas e confirma somente as versões integralmente atendidas.

`retomar_correcao` recupera uma tentativa com resposta perdida, conferindo
conteúdo e fila sem reaplicar a correção. A
[recuperação da tentativa](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção)
explica quais referências precisam ser conservadas.

A declaração humana de revisão pertence ao conteúdo inspecionado. Acesso ao
curso e aos arquivos têm operações próprias; a política opcional de somente
conteúdo revisado é explicada nas [regras de revisão e acesso](aralearn-contract.md#revisão-do-conteúdo).

## Respostas e erros

Uma tarefa bem-sucedida devolve `result`, com o que ocorreu, e pode incluir
`deepLink`, um destino de inspeção no AraLearn, e `nextDecision`, uma decisão
ainda necessária. O MCP entrega também dados estruturados que o cliente pode
usar nas próximas chamadas, sem precisar mostrá-los como controles técnicos à
pessoa autora.

`temMais: true` e `continuacao` não nula indicam uma resposta parcial. O cliente
recupera o restante do mesmo recorte antes de avaliar seu conteúdo. A
[continuação e reconstrução](aralearn-contract.md#continuação-e-reconstrução-do-conteúdo)
especifica os fragmentos literais e seus limites; a configuração do canal não
transforma uma leitura parcial em completa.

Erros devolvem `code`, mensagem, diagnóstico limitado e `recovery`, que informa
como retomar a operação e preservar a tentativa. Os dados técnicos necessários
à recuperação ficam separados da mensagem breve para a pessoa. Uma recusa de
autorização, um conflito de versão e uma indisponibilidade têm consequências
diferentes, descritas no [fluxo de recuperação](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção).

## Confirmação de exclusão por MCP

A exclusão de um curso exige confirmação e um resultado verificável do serviço.
Se o cliente não apresentar o retorno da ferramenta, a ação permanece incerta.
Uma descrição produzida pelo assistente não substitui o recibo nem identifica,
por si só, a causa da falta de resposta.

A conferência do curso e da limpeza de arquivos usa o acesso do proprietário
e conserva a confirmação original. Uma resposta ausente
exige reconciliação; uma recusa explícita deve ser respeitada e não autoriza
repetir a exclusão por outro canal. A exclusão também existe em
[Actions](autoria-actions.md) e na interface, com seus controles próprios; essa
capacidade não resolve a incerteza sobre uma tentativa anterior.

## Autenticação e atualização

O MCP usa [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1),
que permite autorizar um cliente a acessar o serviço sem lhe entregar a senha
da conta. A conexão solicita o escopo autoral necessário, isto é, o conjunto permitido de operações, e o servidor
volta a conferir pessoa, sessão, cliente e consentimento em cada chamada.

Uma recusa de acesso à operação (`not_authorized`) conserva o erro e não pede
nova conexão. O desafio OAuth fica reservado à autenticação inválida (`401`)
ou ao erro explícito de escopo insuficiente (`403`, `insufficient_scope`). Essa
distinção evita repetir o login quando a sessão funciona e apenas uma operação
foi recusada. O fluxo de escopo segue a
[especificação MCP de autorização](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#scope-challenge-handling).

Na preparação de `copiar_curso`, o servidor consulta apenas origens que a pessoa
pode copiar: cursos próprios ou com autorização de cópia vigente. A busca por
título e a releitura por identidade usam o mesmo leitor paginado; visibilidade
pública sozinha não concede cópia. Essa preparação não grava o destino. Ao
confirmar, o comando existente confere novamente acesso e revisão da origem;
reconectar não concede uma permissão de curso ausente.

O endereço hospedado do servidor é:

`https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-mcp`

A atualização do catálogo depende do cliente externo utilizado. No
[ChatGPT](https://chatgpt.com), por exemplo, depois de uma publicação que altere
as tarefas:

1. use **Refresh** na conexão AraLearn nas configurações desse serviço;
2. revise e habilite as tarefas correntes indicadas pelo catálogo compartilhado;
3. abra uma conversa nova e retome um curso pelo título;
4. use **Reconnect** somente se a autorização estiver expirada, revogada ou
   vinculada à conta errada.

Atualizar o catálogo e refazer o login OAuth são operações distintas. O login
no site, a conexão OAuth do MCP e a conexão OAuth de Actions também são sessões
independentes.

## Instruções e limites do cliente

A orientação central permanece em
[courseKnowledge.js](../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js).
Seu primeiro parágrafo contém as regras essenciais; guias por fase acrescentam
somente o contexto pertinente. A recomendação publicada do ChatGPT é manter os
primeiros 512 caracteres autossuficientes, não limitar todo o campo a esse
tamanho. A atualização do app recupera também instruções e descrições das
ferramentas. [OpenAI: Developer mode](https://developers.openai.com/api/docs/guides/developer-mode).

Os orçamentos locais controlam o volume de dados do catálogo. A aceitação pelo
cliente é verificada com o artefato realmente carregado e uma conversa nova;
um teste local examina outra etapa desse percurso. O
[roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais)
separa medidas mecânicas, estimativas e observação do cliente real.

Um campo obrigatório pode aparecer no erro do cliente como “propriedade
adicional” quando cliente e servidor usam versões diferentes da descrição dos
campos. Tecnicamente, há uma fronteira entre o esquema servido e a validação
feita pelo cliente. A comparação entre o catálogo servido e o importado permite
localizar essa divergência. O pedido e o erro podem ser
registrados sem dados sensíveis para esse diagnóstico. A correção precisa
alinhar os contratos servido e importado; retirar uma referência necessária
apenas mudaria o conteúdo. Atualizar as ferramentas na
página de detalhes do app recupera ferramentas, descrições e instruções do
servidor, conforme a [documentação de gestão do app](https://developers.openai.com/api/docs/guides/developer-mode).
A confirmação exige uma conversa nova e nova prova da chamada.
Uma indicação genérica sobre o ambiente descreve apenas o contexto da falha; a
comparação dos contratos identifica a configuração divergente.

## Verificação local

```powershell
npm run test:authoring:contract
npm run test:authoring:mcp
deno test --config supabase/functions/deno.json `
  supabase/functions/tests/aralearn-authoring-mcp.test.ts
```

Essas verificações percorrem o catálogo desde a seleção da tarefa e a resolução
do alvo até a autorização, além de conferir a paridade com Actions. A jornada em
cliente real é executada depois da publicação deliberada.

## Referências técnicas

- [Model Context Protocol](https://modelcontextprotocol.io/specification/latest)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
