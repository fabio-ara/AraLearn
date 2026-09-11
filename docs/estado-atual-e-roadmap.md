# Capacidades e limites atuais

O AraLearn permite criar cursos com assistência de inteligência artificial (IA), inspecionar seu conteúdo
e suas fontes e estudar as trilhas resultantes no celular. A pessoa autora
orienta as alterações e declara a revisão do conteúdo que examinou. O estudo
pode continuar sem conexão depois que o curso foi carregado no dispositivo.

Referência atualizada em **2026-09-11**. A seção de
[verificação técnica](#verificação-técnica) indica onde consultar as condições
em que o funcionamento foi examinado.

## Quadro de capacidades

As funções disponíveis têm condições diferentes de acesso e conexão. A revisão
humana do conteúdo e a autorização para estudá-lo também são decisões distintas.

| Capacidade | Quem pode usar | Conexão e condições | Limites e aprofundamento |
| --- | --- | --- | --- |
| Estudar, responder e rever | visitante em curso público ou pessoa com acesso | internet no primeiro carregamento e na sincronização; depois, o conteúdo guardado permite continuar sem conexão | [guia do estudante](guia-estudante.md) |
| Consultar a explicação compartilhada | pessoa com acesso ao conteúdo | texto já guardado dispensa internet; arquivos têm regras próprias | a base pode ser salva antes ou depois das unidades; [explicação e revisão humana](explicacao-e-revisao-humana.md) |
| Editar e declarar revisão autoral | proprietário, na interface ou por canal autorizado | internet para gravar e conferir a versão atual | editar o material e registrar sua revisão são ações separadas; [guia da pessoa autora](guia-professor-autor.md) |
| Registrar observação | pessoa autenticada com acesso | internet para enviar; uma observação pendente de envio pode aguardar no dispositivo | observar não concede edição do curso; [observações](observacoes-pedagogicas.md) |
| Compartilhar e tornar público | proprietário define o acesso; destinatário ou visitante estuda | internet para alterar o acesso e abrir o curso pela primeira vez | tornar o curso público não libera automaticamente seus arquivos; [acesso](uso-do-app.md#conceder-e-revogar-acesso) |
| Planejar e produzir cursos | proprietário | internet para consultar e gravar a autoria | mapa, explicação e unidades têm estados próprios de produção e revisão; [autoria contextual](autoria-contextual.md) |
| Usar assistência por IA durante o estudo | proprietário | internet e acesso a um dos serviços de IA oferecidos | prévia, aplicação ao rascunho e salvamento são etapas separadas; [assistência](assistencia-por-ia.md) |
| Usar um assistente externo por MCP | proprietário; copiar outro curso exige permissão específica | internet e aplicação compatível configurada | [MCP e limitações conhecidas](autoria-mcp.md) |
| Usar um assistente externo por Actions/OpenAPI | proprietário; copiar outro curso exige permissão específica | internet e configuração do canal no serviço externo | [OpenAPI e Actions](autoria-actions.md) explica o cliente atualmente utilizado e as condições do canal |
| Consultar e comparar dados de autoria | proprietário dos cursos consultados | internet para consultar os dados salvos | descreve escolhas e material produzido; [dados de autoria](analytics-instrucionais.md) |
| Excluir curso próprio ou sair de compartilhado | proprietário exclui; pessoa convidada pode sair | internet e confirmação da ação | sair preserva o original; [ciclo de vida](#dados-acesso-e-ciclo-de-vida) |
| Executar manutenção dos dados | identidade administrativa autorizada | internet; cada remoção é novamente verificada no servidor | operações administrativas delimitadas; [privacidade](privacidade.md) |

Medir um efeito sobre a aprendizagem exige uma investigação própria. O aplicativo
oferece conteúdo e registros que podem apoiar esse trabalho; a
[avaliação](#avaliação-e-desenvolvimento) depende da pergunta, das pessoas
participantes e do método escolhido.

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

**Dados de autoria** permite examinar as escolhas usadas na produção, ver em
quais unidades elas aparecem e comparar cursos próprios. **Exportar curso e
análise** reúne o conteúdo integral salvo e seus registros de autoria, incluindo
fontes, configurações e declarações de revisão. Os arquivos de PDF e áudio e os
dados pessoais ficam fora da exportação. O
[capítulo de dados de autoria](analytics-instrucionais.md) detalha seu alcance.

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

## Verificação técnica

A [matriz técnica](matriz-conformidade-tecnica.md) relaciona as propriedades
do produto à implementação e às verificações correspondentes. Esses testes
examinam, por exemplo, se o conteúdo é salvo, se as permissões são respeitadas
e se a navegação preserva o contexto. Os resultados se referem às versões,
aos ambientes e às operações efetivamente exercitados.

O [procedimento de verificação dos canais de autoria](prova-local-canais-autoria.md)
permite reproduzir chamadas de MCP e OpenAPI e conferir seus efeitos no banco.
O [catálogo conversacional 4.0.0](autoria-mcp.md#tarefas-disponíveis) reúne
54 tarefas. Os testes locais do protocolo verificam a comunicação com o
AraLearn; o funcionamento numa aplicação externa depende também da conexão,
da autorização e das capacidades dessa aplicação. As verificações dos serviços
de IA possuem igualmente o alcance registrado na
[documentação da assistência](assistencia-por-ia.md).

## Avaliação e desenvolvimento

Compreensão, aprendizagem e transferência para novas situações exigem
investigação com pessoas, tarefas e instrumentos adequados. O
[protocolo de avaliação](protocolo-avaliacao-artefato.md) relaciona perguntas,
métodos e evidências para examinar esses efeitos.

Hipóteses de extensão, como as medidas experimentais de ocupação visual do
[benchmark editorial](benchmark-footprint-editorial.md), conservam seu caráter
de investigação. Uma medida proposta só se torna capacidade atual depois de
implementada e verificada para a finalidade correspondente.
