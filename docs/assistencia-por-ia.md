# Assistência por modelo de linguagem

O AraLearn usa modelos de linguagem para apoiar a Autoria e a Pesquisa. A
pessoa descreve o que pretende fazer; o cliente conectado lê o Curso, apresenta
uma proposta e envia uma operação com forma e alcance definidos. O domínio e o
PostgreSQL verificam identidade, autorização, revisão e invariantes antes de
gravar qualquer mudança.

Essa separação permite trabalhar em linguagem natural sem tomar uma resposta
provável por registro autorizado ou comando irrestrito. Um documento JSON bem
formado ainda pode conter alvo, relação, referência ou decisão pedagógica
inválidos.

## Como a assistência se integra ao AraLearn

A interface de Autoria e o cliente conectado pelo Model Context Protocol (MCP)
operam o mesmo Curso vivo. Uma alteração confirmada na conversa aparece na
interface e no Estudo; uma alteração feita na interface integra as leituras
posteriores do cliente.

O percurso habitual é:

1. localizar um Curso próprio;
2. ler a vista necessária e sua revisão;
3. explicar a proposta em linguagem compreensível;
4. enviar uma operação delimitada com as versões esperadas;
5. reler o estado confirmado;
6. conferir o resultado na Autoria e, quando houver conteúdo estudável, no
   Estudo.

A ação contextual **ChatGPT** abre um compositor no Curso, na Parte e nos demais
alvos autorais compatíveis. A pessoa confere alvo e caminho, escolhe a intenção
e escreve seu argumento. **Copiar pedido** acrescenta identidade, revisão,
endereço de retorno e limites operacionais. Essa cópia prepara a conversa. O
Curso só muda quando o cliente conectado executa as operações do MCP e o
servidor as confirma.

## Assistência principal e alteração contextual

ChatGPT + MCP é a assistência principal para planejar, materializar, discutir,
auditar e pesquisar o Curso. No próprio AraLearn, a pessoa também pode editar
manualmente folhas simples autorizadas por um componente e usar uma assistência
complementar configurada por provider/API para uma alteração focal.

As duas ações contextuais partem da Unidade de estudo e do conteúdo
selecionado. Elas mostram o escopo, produzem uma prévia no renderer corrente e
permitem aplicar, descartar ou desfazer o rascunho. O envelope completo do
componente é validado antes da persistência. Uma falha de conexão, cota ou
serviço não bloqueia Estudo, edição manual ou o fluxo pelo ChatGPT.

Essa capacidade usa Curso, Unidade, revisão, autorização e sincronização
correntes. Ela não recupera Workspace, publicação, contratos ou persistência
anteriores e não cria um editor ou chat paralelo. A configuração e as
credenciais do serviço não integram o conteúdo compartilhado do Curso, os
recibos MCP ou as exportações.

### O que sai do aplicativo

A interface informa o recorte antes da chamada. O envelope contém o pedido da
pessoa, os valores textuais editáveis, título, papel instrucional, tópicos da
Unidade e as mensagens anteriores daquela conversa contextual. PDFs, Fontes,
outras Unidades, `targetId`, `studyUnitId` e o restante do Curso ficam
excluídos.

Na instalação de produção, o AraLearn oferece somente o relay local em
`127.0.0.1`, `localhost` ou `10.0.2.2`, sempre por HTTP na porta 4183. A chave
do provider é configurada no relay e nunca entra no AraLearn. A política de
conteúdo e a configuração de runtime declaram apenas essas origens exatas e
recusam curingas.

Nesse modo, **Serviço local** aparece fixo, sem uma escolha redundante. A pessoa
informa modelo e pedido; o endpoint permanece recolhido em **Conexão**. A prova
vertical local percorreu esse relay duas vezes; a repetição mais recente passou
1/1 em 14,2 segundos. Ela foi executada sobre origem HTTP local e não comprova,
sozinha, que uma página HTTPS obterá permissão de rede local.

No navegador, `127.0.0.1` e `localhost` são destinos de loopback e recebem
`targetAddressSpace: "loopback"`; somente `10.0.2.2` recebe `"local"`. A
classificação anterior como rede local bloqueava a chamada real a `127.0.0.1`.
A correção passou 21/21 verificações focais.

O aviso distingue a memória efêmera do AraLearn do tratamento externo: o relay
pode encaminhar a requisição ao provider configurado, e esse serviço pode
conservar dados segundo seus próprios termos. A pessoa revisa o conteúdo
enumerado antes de autorizar cada envio.

OpenAI, Gemini e DeepSeek diretos existem apenas num runtime explicitamente
marcado como desenvolvimento. Esse modo mostra um alerta: uma aplicação no
navegador não protege chaves duradouras, portanto orienta usar somente credencial
descartável de teste. Cada provider fica preso à sua origem própria e a chave
segue somente no cabeçalho, nunca no corpo ou no endereço. Esse percurso não é
uma instrução de configuração para pessoas leigas nem uma opção de produção.

Modelo, endpoint e conversa permanecem na memória da sessão autenticada,
compartilhados entre Estudo e Inspeção para evitar configuração repetida.
Fechar a sobreposição apaga pedido, candidata e mensagens anteriores; sair da
conta, recarregar a aplicação ou encerrar a sessão apaga também a configuração.
No modo de desenvolvimento, a chave direta é eliminada junto. Esses valores não
são gravados em `localStorage`, `sessionStorage`, IndexedDB, PostgreSQL,
Storage, logs ou artefatos publicados.

No encerramento, a aplicação destrói a superfície de Estudo ou Autoria e cancela
a chamada ao provider antes de apagar a sessão e fechar os armazenamentos. Uma
resposta tardia não executa callback, não reabre a sobreposição e não recupera a
configuração ou a credencial. O cenário integrado `SIGNED_OUT` verifica esse
comportamento sem erro de página.

O serviço precisa devolver `changes` esparso, com zero ou uma alteração num
caminho textual autorizado. A saída admite até 8.000 tokens. Caminho adicional,
segunda alteração, resposta fora do formato ou Unidade inválida é recusado antes
da prévia. Cada valor editável admite até 6.000 caracteres e o conjunto, até
12.000. Se o recorte exceder esse limite, como pode ocorrer em código ou
terminal extensos, o comando fica desabilitado com o motivo no nome acessível;
a edição manual permanece disponível. A pessoa pode ver a candidata no renderer,
voltar ao texto original, aplicar ao rascunho e, separadamente, salvar a
Unidade. A gravação usa a mesma revisão esperada, autorização e validação da
edição manual.

Desde a versão 0.0.26, quem estuda um Curso compartilhado usa essa mesma
assistência no mesmo renderer. A prévia continua sem efeito persistente.
Somente **Salvar na minha cópia**, depois da revisão humana, cria o Curso pessoal
privado e grava a Unidade nele. O original, as Fontes, os PDFs, o planejamento,
o progresso e as Observações não são alterados nem copiados. O envelope local
que permite repetir uma gravação ambígua contém apenas a intenção final
necessária; conversa, configuração e credencial do provider permanecem fora.

O APK de release ainda não possui paridade comprovada para esse relay HTTP. A
versão Android 0.0.24 encaminha a requisição por uma ponte nativa, fixa em
`http://127.0.0.1:4183/v1/chat/completions`, em vez de iniciar HTTPS para HTTP no
WebView. A política `MIXED_CONTENT_NEVER_ALLOW` permanece ativa. A compilação de
depuração passou; instalação do APK de release e ensaio em dispositivo real ainda
integram o gate Android. O Pages também precisa de ensaio real com as regras de
acesso à rede local do navegador. Até essas provas, a assistência por API não
deve ser apresentada como configuração pronta no Android ou no ambiente
hospedado.

## Ferramentas e contexto

O MCP oferece seis ferramentas estáveis:

- `listarCursos` localiza Cursos próprios;
- `lerCurso` lê uma vista delimitada do estado corrente;
- `criarCurso` cria a raiz privada de um Curso;
- `alterarCurso` reúne as operações autorais do Curso;
- `gerirPessoas` cuida do perfil e do acesso direto ao Estudo;
- `consultarComponentesDidaticos` descobre, inspeciona e valida componentes.

`lerCurso` evita carregar o Curso inteiro quando a decisão exige apenas um
recorte. As vistas correntes são:

| Vista | Conteúdo principal |
| --- | --- |
| `summary` | identidade, título, objetivo e revisão |
| `outline` | hierarquia compacta |
| `instructional_plan` | plano, Partes, vínculos e atividade recente |
| `course_design` | parâmetros, orientações, política de componentes e itens atribuídos ao alvo |
| `course_sources` | Fontes, revisões, Âncoras, anexos e atribuições |
| `course_source_attachment` | preparação de envio ou leitura autorizada de um PDF |
| `anchored_annotations` | caixa de entrada, alvo ou detalhe de Observações |
| `part_materialization` | execução retomável e etapas da produção de uma Parte |
| `study_units` | Unidades em ordem curricular, com a mesma composição da Inspeção |
| `entities` | página estrutural sob revisão fixada |
| `audit_cycle` | contexto focal, rodadas, achados e correções |
| `variant_comparisons` | conjuntos de variantes associados ao Curso |
| `variant_comparison` | comparação completa de um conjunto |
| `research` | fatos de Autoria, métricas, filtros e destinos |

Uma leitura fornece contexto, não permissão de escrita. O comando seguinte
continua restrito ao Curso próprio, à revisão esperada e aos objetos que sua
forma admite.

## Planejamento e produção por Partes

O plano instrucional registra público, escopo, resultados pretendidos,
unidades de análise, requisitos de evidência e Partes. Parte de autoria é um
agrupamento operacional de Microssequências; ela organiza o trabalho sem criar
outro nível na hierarquia didática.

A pessoa pode discutir e reorganizar o plano antes ou durante a produção.
Reordenar, dividir ou unir Partes altera os vínculos de trabalho, preservando o
conteúdo didático já materializado.

A produção de uma Parte ocorre em etapas delimitadas e retomáveis. Ao iniciar a
execução, o servidor resolve os parâmetros, as orientações, a política de
componentes, os itens do plano e as Fontes aplicáveis a cada Microssequência.
Cada etapa confirma conteúdo, vínculos, proveniência e fatos de aplicação numa
única transação. O próximo passo vem do estado persistido, o que permite retomar
uma interrupção sem depender da memória da conversa.

## Componentes didáticos

O cliente descobre componentes conforme a intenção autoral, em vez de receber
todos os contratos de uma só vez. `consultarComponentesDidaticos` oferece esta
sequência:

1. `explore` apresenta famílias e facetas;
2. `search` encontra até oito candidatos por intenção;
3. `inspect` compara os candidatos selecionados;
4. `contracts` entrega um contrato exato por chamada;
5. `validate_study_unit` valida a Unidade proposta;
6. `audit_representation` confronta intenção e composição;
7. `preview_study_unit` prepara uma prévia no mecanismo de apresentação do
   AraLearn.

O termo de produto é **componente didático**. No contrato técnico, cada pacote
de componente possui uma identidade `package@version`. A validação confirma a
forma, as referências e a compatibilidade; a adequação ao público e a correção
do conteúdo ainda exigem julgamento responsável.

## Fontes e proveniência

O cliente pode criar e revisar Fontes, localizar trechos por Âncoras e atribuir
essas referências a itens do plano ou Unidades. Uma atribuição informa a
relação da Fonte com o alvo, como sustentação, adaptação, citação, contraste ou
necessidade de verificação.

PDFs privados são enviados diretamente ao armazenamento de objetos por um
endereço temporário e só passam a integrar a Fonte depois da confirmação do
servidor. A leitura exige autorização e a atribuição pode ser exportada em JSON
com identidades, revisões, relações e Âncoras exatas.

Uma citação torna a origem localizável. Ela não atesta, sozinha, a qualidade da
Fonte nem a verdade da afirmação.

## Observações, auditoria e correções

Observações registram manifestações situadas de quem estuda ou de quem cria o
Curso. A assistência pode consultar a caixa de entrada, registrar uma
Observação autoral após confirmar alvo e síntese, e ajudar na triagem. O texto
da conversa não é copiado integralmente.

A auditoria trata uma Unidade nas dimensões estrutural, pedagógica, factual e
editorial. Cada rodada conserva critérios, resultados e evidências públicos.
Um achado permanece separado de sua proposta de correção, da aplicação e da
verificação posterior.

Uma correção focal pode substituir o conteúdo e as atribuições de Fontes da
Unidade observada. Ela preserva identidade, pai, posição e restante da
estrutura. Aplicar ou reverter a correção exige confirmação humana explícita;
considerá-la resolvida exige outra rodada com o critério pertinente aprovado.

## Variantes e Pesquisa

O cliente pode criar de duas a oito variantes comparáveis a partir do mesmo
ponto de planejamento. Cada variante é outro Curso, com identidade e revisão
próprias. A comparação apresenta diferenças declaradas, fatos materializados,
desvios e dados ausentes. Essa relação sustenta comparação descritiva, não uma
conclusão causal.

A vista `research` usa os mesmos fatos, filtros, métricas e revisões da área
**Pesquisa**. O cliente pode explicar o denominador, mostrar a tabela que
sustenta o gráfico e conduzir a pessoa ao objeto relacionado. Quando o cliente
aceita a extensão visual MCP Apps, um componente apresenta prévias de Unidades,
indicadores agregados de Pesquisa e comparações de Variantes. Nos demais
clientes, a resposta textual preserva o mesmo conteúdo autorizado; quando o
contrato fornece endereço, ele também permanece no texto.

Diagramas que dependem de WebAssembly aparecem como descrição textual dentro do
MCP Apps porque a política estável do cliente não permite esse processamento.
Essa limitação não altera a prévia visual disponível no próprio AraLearn.

## Autoridade, concorrência e confirmação

A Autoria, a Pesquisa e o MCP autoral pertencem à pessoa proprietária do Curso.
O acesso direto concedido a outra conta permite estudar, sem conceder autoria.
OAuth identifica a pessoa e o escopo do cliente; o servidor ainda verifica a
propriedade em cada operação.

Cada alteração informa a revisão esperada do Curso e, quando necessário, a
versão do plano, da Parte, da execução ou do objeto focal. Se o estado mudou
desde a leitura, a operação é recusada para que o cliente releia e reconcilie a
proposta.

`requestId` identifica a repetição segura de uma intenção. O mesmo pedido com o
mesmo conteúdo recupera o recibo anterior; a mesma chave com conteúdo diferente
gera conflito. Uma operação sem mudança efetiva também não cria atividade
artificial.

Conceder ou revogar acesso, criar uma Observação pela conversa, aplicar uma
correção e executar sua reversão possuem confirmações próprias. Uma decisão
pedagógica relevante deve aparecer para a pessoa antes da operação que a grava.
Quando a pessoa já confirmou no ChatGPT e o servidor concluiu a operação, o
AraLearn relê e apresenta o resultado. Ele não solicita outra confirmação nem
repete a escrita apenas porque a pessoa abriu o endereço de acompanhamento.

## Privacidade e funcionamento sem conexão

O Curso conserva somente o estado confirmado, fatos operacionais delimitados e
recibos temporários. Instruções enviadas ao modelo, respostas brutas e raciocínio
privado não integram o Curso. O cliente de modelo continua sujeito aos seus próprios
termos de retenção e localização de dados.

Alterações autorais exigem conexão. Conteúdo já sincronizado continua disponível
em Estudo, e a Inspeção pode reapresentar a página exata guardada no
dispositivo. Observações possuem uma fila local própria; plano, composição,
auditoria, variantes e Pesquisa dependem de releitura do servidor para escrever.

## Limites de interpretação

Os contratos demonstram integridade técnica, autorização e correspondência
entre referências. Eles não demonstram verdade científica, qualidade global,
aprendizagem ou eficácia. Recomendações de interação humano-IA ressaltam
visibilidade, controle e possibilidade de correção
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). Para uso
educacional de modelos generativos, a responsabilidade factual e pedagógica
permanece humana ([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

Consulte [Criar e desenvolver Cursos por
conversa](criar-cursos-pelo-chat.md) para o percurso de uso e [Autoria por
MCP](autoria-mcp.md) para a referência das ferramentas.
