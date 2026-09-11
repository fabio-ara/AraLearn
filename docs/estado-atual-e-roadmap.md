# Capacidades e limites atuais

O AraLearn permite criar cursos com assistência de IA, inspecionar seu conteúdo
e suas fontes e estudar as trilhas resultantes no celular. A pessoa autora
orienta as alterações e declara a revisão do conteúdo que examinou. O estudo
pode continuar sem conexão depois que o curso foi carregado no dispositivo.

Estado documental reconciliado em **2026-09-11**, com o
[catálogo conversacional 4.0.0](autoria-mcp.md#tarefas-disponíveis), de 54 tarefas,
e a implementação corrente. A data identifica a revisão da documentação;
os registros de verificação conservam as datas, os ambientes e os recortes
em que foram produzidos.

## Quadro de capacidades

**Existe** indica implementação no produto. **Conectado** informa quando a
operação precisa de internet; **Acessível**, quem pode utilizá-la.
**Uso verificado** identifica o alcance documentado das verificações e
**Funciona** conserva esse mesmo limite, sem estendê-lo a todos os dispositivos
ou clientes. **Necessário** registra a função atendida, e **Alinhamento** situa
a capacidade no produto, na operação ou na pesquisa.

| Caso de uso | Existe | Conectado | Acessível | Uso verificado | Funciona | Necessário | Alinhamento | Limites e destino |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estudar, responder e rever | sim | primeiro carregamento e sincronização | visitante em curso público ou pessoa com acesso | local documentado | no recorte verificado | continuidade do estudo | produto | conteúdo preparado fica no dispositivo; [guia do estudante](guia-estudante.md) |
| Consultar explicação compartilhada | sim | dispensável para texto já guardado | pessoa com acesso ao conteúdo | local documentado | no recorte verificado | recuperar desenvolvimento e fontes | produto | base salva antes ou depois das unidades; arquivos têm regras próprias; [explicação](explicacao-e-revisao-humana.md) |
| Editar e declarar revisão autoral | sim | para gravar e conferir a versão atual | proprietário, na interface ou canal autorizado | interface, serviço e banco locais | no recorte verificado | inspeção e correção humanas | produto | edição e marca de revisão são ações separadas; [guia da pessoa autora](guia-professor-autor.md) |
| Registrar observação | sim | para enviar; a fila pode aguardar | pessoa autenticada com acesso | local documentado | no recorte verificado | contribuição ligada ao conteúdo | produto | registro próprio não concede edição; [observações](observacoes-pedagogicas.md) |
| Compartilhar e tornar público | sim | para alterar acesso e abrir pela primeira vez | proprietário concede; destinatário ou visitante estuda | local documentado | no recorte verificado | acesso ao curso | produto | publicação não libera automaticamente arquivos; [acesso](uso-do-app.md#conceder-e-revogar-acesso) |
| Planejar e produzir cursos | sim | para consultar e gravar autoria | proprietário | local documentado | no recorte verificado | autoria | produto | mapa, explicação e unidades têm estados próprios; [autoria contextual](autoria-contextual.md) |
| Usar Assistência por IA no estudo | sim | durante a conversa e a gravação | proprietário | interface e contratos locais | depende também do provedor | alteração contextual assistida | produto | prévia, aplicação ao rascunho e salvamento separados; [assistência](assistencia-por-ia.md) |
| Usar MCP | sim | sim | proprietário; cópia exige direito próprio | protocolo local documentado | no recorte verificado | autoria por conversa | produto | compatibilidade depende do cliente; [MCP e limitações conhecidas](autoria-mcp.md) |
| Usar Actions/OpenAPI | sim | sim | proprietário; cópia exige direito próprio | protocolo local documentado | no recorte verificado | autoria por conversa | produto | integração específica de GPTs personalizados; [Actions](autoria-actions.md) |
| Consultar e comparar dados de autoria | sim | sim | proprietário dos cursos consultados | local documentado | no recorte verificado | inspeção do desenho realizado | produto e pesquisa | dimensões, configurações e inventários; [dados de autoria](analytics-instrucionais.md) |
| Excluir curso próprio ou sair de compartilhado | sim | sim | pessoa com a relação correspondente | local documentado | no recorte verificado | gestão do acervo | produto | excluir e sair têm efeitos distintos; [ciclo de vida](#dados-acesso-e-ciclo-de-vida) |
| Executar Manutenção | sim | sim | identidade administrativa autorizada | local documentado | no recorte verificado | manutenção dos dados | operação | remoção delimitada e revalidada; [privacidade](privacidade.md) |
| Medir efeito educacional | não automaticamente | conforme o estudo | pesquisa autorizada | exige investigação própria | depende do método e da execução | responder pergunta empírica | pesquisa | [protocolo de avaliação](protocolo-avaliacao-artefato.md) |

## Estudo

O seletor reúne cursos próprios, compartilhados e públicos. A prévia apresenta
o objetivo, o progresso e a disponibilidade para abertura. O curso se organiza
em módulos e lições; cada lição reúne microssequências didáticas, pequenos
percursos com objetivo próprio, formados por unidades de explicação e prática.
O [modelo didático](modelo-didatico.md) desenvolve essa organização.

Nas unidades, a pessoa lê, responde às atividades, consulta a explicação e suas
referências e pode marcar conteúdo para **Rever**. Fechar um apoio devolve o
ponto de leitura e preserva uma resposta ainda não enviada. **Voltar** retorna
à origem da navegação; **Home** abre a tela inicial.

O [estado pessoal](estado-de-estudo-nao-punitivo.md) guarda posição, conclusões
e marcas para a continuidade. As respostas momentâneas não formam um boletim.
Visitantes mantêm esse estado no dispositivo; com conta, ele pode ser
sincronizado. Observações exigem conta e ficam separadas do progresso.

Editar o conteúdo durante o estudo é permitido somente ao proprietário.
Quem recebeu acesso pode estudar e enviar observações. Criar uma cópia
independente exige uma permissão específica.

## Autoria

A autoria apresenta cursos próprios e permite desenvolver o mapa curricular,
as explicações, as unidades e suas fontes. O mapa pode ser salvo por ramos e
aprovado depois da inspeção de sua versão completa. Uma explicação pode ser
produzida antes das unidades, inclusive com o mapa ainda em rascunho, ou ser
revista depois delas. Partes e lotes agrupam o trabalho de produção; não são
níveis adicionais do currículo.

O [guia da pessoa autora](guia-professor-autor.md) descreve o ciclo de propor,
inspecionar, decidir, aplicar e reler. Cada explicação e unidade tem sua própria
[declaração de revisão](explicacao-e-revisao-humana.md#revisão-independente-por-objeto).
Salvar, produzir ou corrigir uma observação não declara revisão humana.
Uma mudança relevante pode deixar a marca anterior desatualizada.

Os [parâmetros de desenho](desenho-instrucional-parametrizado.md) orientam a
apresentação e a prática. A intenção atual indica como conduzir o próximo
trabalho; a configuração aplicada conserva as escolhas usadas na produção.
Preferências pessoais, perfis reutilizáveis e condições de pesquisa têm
alcances distintos, descritos em [Parâmetros de autoria](parametros-de-autoria.md).

As [fontes](fontes-e-citacoes.md) podem ser vinculadas à explicação ou a uma
unidade específica, com localização no material e relação com o texto.
A [fila de observações](observacoes-pedagogicas.md) conserva os apontamentos
sobre cada objeto. Uma correção confirmada trata somente as versões atendidas;
entradas editadas ou parcialmente atendidas continuam pendentes.

**Dados de autoria** permite inspecionar dimensões do desenho, abrir as unidades
que compõem uma distribuição e comparar cursos próprios. **Exportar curso e
análise** reúne o conteúdo integral, o inventário e as configurações, além das
declarações e contagens do recorte. PDFs, áudios e dados pessoais ficam fora
desse arquivo. O [capítulo de dados de autoria](analytics-instrucionais.md)
detalha seu alcance.

## Assistência por IA

No estudo de um curso próprio, **Assistência por IA** abre uma conversa sobre
uma lição, microssequência ou unidade. A pessoa pode discutir a proposta e
pedir uma prévia antes de decidir. **Aplicar ao rascunho** confirma a escolha
para edição; **Salvar** grava o resultado no curso.

A interface oferece OpenAI, Gemini e DeepSeek e mantém a chave de acesso apenas
durante a sessão. A disponibilidade concreta depende do serviço e das
credenciais utilizados. As verificações locais dos componentes e contratos
não confirmam todos os provedores em operação. Veja o contexto enviado e os
limites em [Assistência por IA](assistencia-por-ia.md).

## Autoria conversacional

A conexão entre a conversa e o curso permite que um assistente consulte o
estado salvo e execute as operações autorizadas. O [MCP](autoria-mcp.md) é um
protocolo para clientes compatíveis descobrirem e chamarem essas ferramentas.
A descrição [OpenAPI](autoria-actions.md) apresenta as operações para clientes
que usam chamadas web autorizadas. O capítulo técnico explica sua utilização
pelo recurso Actions de um cliente externo e as condições de cada canal.

Nos dois canais, a pessoa inspeciona o curso, discute propostas e determina as
mudanças. O assistente retoma as preferências e o contexto pertinentes;
a referência salva vincula a aprovação ao objeto efetivamente examinado.
Uma resposta perdida exige conferir a tentativa original antes de repetir
uma alteração. A [limitação conhecida na confirmação de exclusão por MCP](autoria-mcp.md#confirmação-de-exclusão-por-mcp)
permanece delimitada ao caso documentado.

Consultas e exportações extensas oferecem continuações. A leitura só está
completa depois da última página, preservando o texto original. Os
[fluxos e contratos](fluxos-prompts-e-contratos.md) explicam essa relação entre
linguagem natural, contexto e gravação. O gerenciamento da identidade da conta,
sua exclusão e a manutenção administrativa permanecem no aplicativo.

## Dados, acesso e ciclo de vida

Conteúdo completo salvo pode ser estudado por quem tem acesso. O proprietário
pode ativar a política de disponibilizar somente conteúdo com revisão atual.
Essa escolha é independente de tornar o curso público e das permissões de
arquivos: um PDF pode continuar restrito num curso público.

**Remover dados deste dispositivo** apaga a cópia local da conta ativa;
**Sair** encerra a sessão. Nenhuma dessas ações equivale a excluir a conta.
Na tela inicial, **Ações deste curso** permite ao proprietário excluir seu
curso e à pessoa convidada sair de um curso compartilhado. Sair preserva o
original. Excluir a conta remove os cursos próprios e os dados vinculados
conforme o [ciclo de exclusão](uso-do-app.md#excluir-a-conta).

**Manutenção** aparece somente para o papel administrativo autorizado.
A área trata de retenção e de arquivos ou registros remanescentes que o sistema
consegue identificar. Cada remoção é novamente verificada no servidor.
A [política de privacidade](privacidade.md) descreve acesso, retenção e exclusão.

## Aplicação web e Android

O AraLearn pode ser usado no navegador, instalado a partir dele ou aberto no
aplicativo Android. O curso previamente carregado fica disponível para estudo
sem conexão. Sincronização automática e manual determinam quando o dispositivo
envia progresso e consulta atualizações; arquivos de áudio, PDFs e serviços
externos têm requisitos próprios de acesso e conexão.

A [arquitetura](arquitetura.md) explica a relação entre aplicativo e servidor.
A [persistência](persistencia-relacional.md) detalha quais dados permanecem no
dispositivo, e [Uso do aplicativo](uso-do-app.md#trabalhar-sem-conexão) orienta
sua preparação e retomada.

## Avaliação e desenvolvimento

A verificação técnica examina se conteúdo, permissões, gravação e navegação
funcionam nas condições exercitadas. Compreensão, aprendizagem e transferência
para novas situações exigem investigação com pessoas, tarefas e instrumentos
adequados. O [protocolo de avaliação](protocolo-avaliacao-artefato.md) relaciona
perguntas, métodos e evidências; a
[matriz técnica](matriz-conformidade-tecnica.md) localiza as verificações do produto.

Hipóteses de extensão, como as medidas experimentais de ocupação visual do
[benchmark editorial](benchmark-footprint-editorial.md), conservam seu caráter
de investigação. Uma medida proposta só se torna capacidade atual depois de
implementada e verificada para a finalidade correspondente.
