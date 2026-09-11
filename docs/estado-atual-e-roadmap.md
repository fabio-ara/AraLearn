# Capacidades e limites atuais

O AraLearn permite criar cursos com assistência de inteligência artificial (IA)
e estudar o conteúdo resultante pelo celular. Durante a autoria, a pessoa pode
inspecionar o material junto de suas fontes, orientar alterações e declarar a
revisão do que examinou. Depois do primeiro carregamento, o estudo pode
continuar sem conexão.

Referência atualizada em **2026-09-11**. A seção de
[verificação técnica](#verificação-técnica) indica onde consultar as condições
em que o funcionamento foi examinado.

## Quadro de capacidades

As funções disponíveis têm condições diferentes de acesso e conexão. A revisão
humana do conteúdo e a autorização para estudá-lo também são decisões distintas.

Um **visitante** abre cursos públicos sem entrar numa conta. Uma **pessoa com
acesso** entra para estudar um curso privado ou compartilhado. O
**proprietário** criou ou copiou o curso e responde por sua autoria e acesso. O
papel de **administrador** é reservado à manutenção do serviço.

Um assistente externo usa uma ponte autorizada para trabalhar sobre o curso. O
MCP permite que uma aplicação compatível descubra as tarefas do AraLearn; a
OpenAPI descreve as operações web oferecidas a outras aplicações compatíveis.

| Capacidade | Quem pode usar | Conexão e condições | Limites e aprofundamento |
| --- | --- | --- | --- |
| Estudar, responder e rever | visitante em curso público ou pessoa com acesso | internet no primeiro carregamento e na sincronização; depois, o conteúdo guardado permite continuar sem conexão | [guia do estudante](guia-estudante.md) |
| Consultar a explicação | visitante em curso público ou pessoa com acesso | texto já guardado dispensa internet; arquivos têm regras próprias | o texto-base pode ser salvo antes ou depois das unidades; [explicação e revisão humana](explicacao-e-revisao-humana.md) |
| Editar e declarar revisão autoral | proprietário, na interface ou por canal autorizado | internet para gravar e conferir a versão atual | editar o material e registrar sua revisão são ações separadas; [guia da pessoa autora](guia-professor-autor.md) |
| Registrar observação | pessoa autenticada com acesso | internet para enviar; uma observação pendente de envio pode aguardar no dispositivo | a contribuição segue para o proprietário; [observações](observacoes-pedagogicas.md) |
| Compartilhar e tornar público | proprietário define o acesso; destinatário ou visitante estuda | internet para alterar o acesso e abrir o curso pela primeira vez | o conteúdo e seus arquivos seguem regras de acesso próprias; [acesso](uso-do-app.md#conceder-e-revogar-acesso) |
| Planejar e produzir cursos | proprietário | internet para consultar e gravar a autoria | mapa, explicação e unidades têm estados próprios de produção e revisão; [autoria contextual](autoria-contextual.md) |
| Editar um curso com assistência por IA na tela de estudo | proprietário | internet e acesso a um dos serviços de IA oferecidos | prévia, aplicação ao rascunho e salvamento são etapas separadas; [assistência](assistencia-por-ia.md) |
| Usar um assistente externo por MCP | proprietário; copiar outro curso exige permissão específica | internet e aplicação compatível configurada | [MCP e limitações conhecidas](autoria-mcp.md) |
| Usar um assistente externo por Actions/OpenAPI | proprietário; copiar outro curso exige permissão específica | internet e configuração do canal no serviço externo | [OpenAPI e Actions](autoria-actions.md) explica a aplicação de conversa atualmente verificada e as condições do canal |
| Consultar e comparar dados de autoria | proprietário dos cursos consultados | internet para consultar os dados salvos | descreve escolhas e material produzido; [dados de autoria](analytics-instrucionais.md) |
| Excluir curso próprio ou sair de compartilhado | proprietário exclui; pessoa convidada pode sair | internet e confirmação da ação | sair preserva o original; [ciclo de vida](#dados-acesso-e-ciclo-de-vida) |
| Executar manutenção dos dados | administrador autorizado | internet; cada remoção é novamente verificada no servidor | operações administrativas delimitadas; [privacidade](privacidade.md) |

O aplicativo oferece conteúdo e registros para investigar a experiência de
autoria e estudo. Para medir um efeito sobre a aprendizagem, a
[avaliação](#avaliação-e-desenvolvimento) precisa formular uma pergunta e
escolher participantes e método compatíveis com ela.

## Estudo

O seletor reúne os cursos disponíveis para a pessoa, sejam próprios,
compartilhados ou públicos. A prévia apresenta o objetivo, o progresso e a
disponibilidade para abertura. Dentro do curso, o conteúdo é dividido em vários
níveis, do percurso completo às unidades que aparecem na tela. As
**microssequências didáticas** reúnem unidades relacionadas para desenvolver um
objetivo próximo. O [modelo didático](modelo-didatico.md) desenvolve essa
organização.

Nas unidades, a pessoa lê, responde às atividades, consulta a explicação e suas
referências e pode marcar conteúdo para **Rever**. Fechar um apoio devolve o
ponto de leitura e preserva uma resposta ainda não enviada. **Voltar** retorna
à origem da navegação; **Home** abre a tela inicial.

O [estado pessoal](estado-de-estudo-nao-punitivo.md) guarda posição, conclusões
e marcas para a continuidade. Esses registros acompanham o percurso em vez de
formar um boletim. Visitantes mantêm o estado no dispositivo; com conta, ele
pode ser sincronizado. Observações exigem conta e ficam separadas do progresso.

Editar o conteúdo durante o estudo é permitido somente ao proprietário.
Quem recebeu acesso pode estudar e enviar observações. Criar uma cópia
independente exige uma permissão específica.

## Autoria

A autoria apresenta os cursos que pertencem à pessoa e que ela pode alterar. O
mapa curricular define o percurso; a explicação desenvolve o assunto e suas
fontes; as unidades levam esse conteúdo à sequência de estudo. O mapa pode ser
salvo por ramos e aprovado depois da inspeção de sua versão completa. Uma
explicação pode ser produzida antes das unidades, mesmo com o mapa em rascunho,
ou revista depois delas. **Partes** e **lotes** apenas agrupam etapas de
produção: a estrutura estudada continua sendo a do curso.

O [guia da pessoa autora](guia-professor-autor.md) descreve o ciclo de autoria,
da proposta à releitura. A
[declaração de revisão](explicacao-e-revisao-humana.md#revisão-independente-por-objeto)
nasce quando a pessoa registra expressamente sua decisão sobre uma explicação
ou unidade salva. Produção e correção conservam registros próprios. Uma mudança
relevante pode deixar a marca de revisão anterior desatualizada.

Os [parâmetros de desenho](desenho-instrucional-parametrizado.md) registram como
apresentar o conteúdo e distribuir a prática. A intenção atual orienta o próximo
trabalho; a configuração aplicada conserva as escolhas usadas na produção. A
pessoa também pode guardar preferências para reutilizá-las, enquanto uma
condição de pesquisa fixa as escolhas necessárias à comparação. Os diferentes
alcances estão descritos em [Parâmetros de autoria](parametros-de-autoria.md).

As [fontes](fontes-e-citacoes.md) podem ser vinculadas à explicação ou a uma
unidade específica, com localização no material e relação com o texto.
A [fila de observações](observacoes-pedagogicas.md) conserva os apontamentos
sobre cada objeto. Quando uma contribuição é editada, sua nova versão volta a
representar o pedido atual. Uma correção confirmada encerra as versões que
atendeu e mantém as demais na fila.

**Dados de autoria** permite examinar as escolhas usadas na produção, ver em
quais unidades elas aparecem e comparar cursos próprios. **Exportar curso e
análise** reúne o conteúdo integral salvo e seus registros de autoria. Arquivos
anexos, como PDFs e áudios, assim como dados pessoais, credenciais e conversas,
seguem seus próprios fluxos e ficam fora desse artefato. O
[capítulo de dados de autoria](analytics-instrucionais.md) detalha seu alcance.

## Assistência por IA

No estudo de um curso próprio, **Assistência por IA** abre uma conversa sobre
uma lição, microssequência ou unidade. A pessoa pode discutir a proposta e
pedir uma prévia antes de decidir. **Aplicar ao rascunho** confirma a escolha
para edição; **Salvar** grava o resultado no curso.

A interface oferece atualmente três serviços: OpenAI, Gemini e DeepSeek. A
chave de acesso fica somente durante a sessão, e a disponibilidade depende do
serviço e das credenciais utilizados. Os testes locais verificam a integração
do aplicativo; cada serviço também precisa estar disponível no momento do uso.
Veja o contexto enviado e as condições em
[Assistência por IA](assistencia-por-ia.md).

## Autoria conversacional

A conexão entre a conversa e o curso permite que um assistente consulte o
estado salvo e execute as operações autorizadas. O [MCP](autoria-mcp.md) é um
protocolo para aplicações compatíveis descobrirem e chamarem essas ferramentas.
A descrição [OpenAPI](autoria-actions.md) apresenta as operações para aplicações
que usam chamadas web autorizadas. O capítulo técnico explica sua utilização
pelo recurso Actions de uma aplicação externa e as condições de cada canal.

Nos dois canais, a pessoa inspeciona o curso, discute propostas e determina as
mudanças. O assistente consulta as preferências e o contexto pertinentes. Ao
aprovar uma proposta, a referência salva identifica o conteúdo e a versão que
foram examinados. Se a resposta de uma alteração se perder, a tentativa
original deve ser conferida antes de qualquer repetição. A
[confirmação de exclusão por MCP](autoria-mcp.md#confirmação-de-exclusão-por-mcp)
tem uma limitação específica documentada no guia do canal.

Consultas e exportações extensas podem ser divididas em páginas, chamadas de
**continuações**. Para obter o conteúdo integral, o assistente percorre todas
elas sem reescrever o texto retornado. Os
[fluxos e contratos](fluxos-prompts-e-contratos.md) explicam essa relação entre
linguagem natural, contexto e gravação. O gerenciamento da identidade da conta,
sua exclusão e a manutenção administrativa permanecem no aplicativo.

## Dados, acesso e ciclo de vida

Conteúdo completo salvo pode ser estudado por quem tem acesso. O proprietário
pode ativar a política de disponibilizar somente conteúdo com revisão atual.
Essa escolha é independente de tornar o curso público e das permissões de
arquivos: um PDF pode continuar restrito num curso público.

Os controles atuam sobre objetos diferentes. **Sair** encerra a sessão;
**Remover dados deste dispositivo** apaga a cópia local da conta ativa;
**Excluir conta** remove a conta, seus cursos próprios e os dados vinculados,
conforme o [ciclo de exclusão](uso-do-app.md#excluir-a-conta). Na tela inicial,
**Ações deste curso** permite ao proprietário excluir um curso próprio e à
pessoa convidada sair de um curso compartilhado, preservando o original.

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

O [benchmark editorial](benchmark-footprint-editorial.md), por exemplo, reúne
medidas experimentais de ocupação visual e hipóteses para investigações
posteriores. O quadro de capacidades registra as propriedades que já foram
implementadas e verificadas para a finalidade correspondente.
