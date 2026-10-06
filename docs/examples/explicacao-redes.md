# Exemplos de explicação: fundamentos de redes e SNMP/RMON

Estes exemplos sintéticos permitem inspecionar o
[contrato de explicação e revisão humana](../explicacao-e-revisao-humana.md).
Os casos e números foram criados para esse fim e permanecem como rascunhos
didáticos. Uma futura materialização no aplicativo e a revisão humana
permitiriam avaliar seu uso em tela. A aprendizagem precisaria ser investigada
com estudantes e tarefas definidos.

Cada exemplo reúne uma microssequência, unidades substantivas, duas práticas e
uma única base explicativa, acessível pelo comando **Explicação**. Quantidade de unidades, títulos, seções e extensão são decisões locais. As seções identificam o texto destinado ao estudante e as notas de autoria e aplicação. As respostas esperadas orientam a autoria das práticas, enquanto o apoio desenvolve os conceitos e as relações necessários para resolvê-las.

## Fundamentos de redes — quem participa, por onde se conecta e que regra usa

### Plano inspecionável em autoria

**Objetivo:** diante de uma pequena situação de comunicação, distinguir o host participante, sua interface com a rede e o protocolo usado, justificando como a identidade do host se conserva quando a interface em uso muda.

**Pressupostos a desenvolver no apoio:** uma aplicação é um programa que realiza
uma tarefa; comunicar envolve informação enviada e recebida; uma conexão pode
usar cabo ou rádio. O recorte antecede o estudo detalhado de endereçamento e
roteamento. A distinção entre interface física e lógica aparece apenas para
delimitar o exemplo e fica fora da avaliação desta etapa.

**Proposta da explicação:** desenvolver a relação participante–interface–regra em uma situação concreta; explicitar o que o desenho representa; contrastar uma máquina com duas interfaces e duas máquinas com uma interface cada. A fonte prevista é a RFC 1122, §§1.1.1, 1.1.3 e 1.3.3. RFC (*Request for Comments*) é uma série de documentos técnicos sobre a Internet, que inclui padrões e outras propostas; o número identifica o documento consultado. A referência fundamenta os conceitos técnicos usados no exemplo.

**Requisito de evidência F-E1:** selecionar uma descrição que preserve corretamente as três funções e sua relação quando o caso muda. As duas respostas permitem observar a seleção entre descrições oferecidas. Examinar uma explicação elaborada pelo próprio estudante exigiria outra tarefa.

### Unidades compactas do percurso — texto do estudante

#### F-U1 — Uma máquina pode ter duas interfaces

Um notebook pode acessar a rede por cabo ou por uma conexão sem fio. Esses
dois pontos de conexão pertencem à mesma máquina: cada um é uma **interface
de rede**. O notebook executa programas para realizar tarefas, suas
**aplicações**; como participante final da comunicação, é chamado **host**.
A máquina continua sendo o mesmo host após a troca da interface em uso. Ao descrever uma falha,
identifique tanto a máquina quanto a interface afetada.¹

#### F-U2 — Conexão e regra têm funções diferentes

O **protocolo** estabelece regras de comunicação: como representar uma mensagem e como tratá-la. A interface permite a conexão do host; o protocolo organiza a troca. Imagine um laboratório cuja aplicação aceita o pedido “temperatura?” e devolve uma medida em graus Celsius. A comunicação depende tanto da conexão quanto de o programa destinatário reconhecer o pedido. Ao trocar o cabo pela conexão sem fio, a aplicação pode conservar a mesma regra de pedido e resposta.¹

*A regra textual do laboratório foi criada para este exemplo. Ela ilustra a função de um protocolo de aplicação.*

### Explicação compartilhada F-X — texto do estudante

#### Três perguntas sobre a mesma comunicação

Uma técnica quer ler uma medida em um notebook. Primeiro, identifica os
participantes: o notebook e a máquina que oferece a medida. Depois, confere por
onde o notebook se conecta, observando a interface usada. Para entender a troca
entre os programas, examina a regra que dá sentido ao pedido e à resposta. Cada
pergunta esclarece um aspecto da mesma comunicação.

O termo host identifica a função de participante final da comunicação. A RFC 1122 relaciona essa função às aplicações que usam serviços da rede. Uma interface física liga o host à rede conectada; o mesmo host pode ter mais de uma. Há regras para a troca entre programas e regras para a transmissão pela
conexão de rede. Elas tratam de etapas diferentes da comunicação.¹

#### Um caso resolvido

No laboratório, o notebook N tem uma interface cabeada C e uma interface sem fio S. A aplicação já leu a medida usando C. A técnica desliga C, conecta S e executa a mesma aplicação, com o mesmo pedido “temperatura?”. Pela descrição do caso, o host continua sendo N; mudou a interface utilizada. A resposta esperada pela aplicação ainda é a medida. Para saber se a comunicação funcionará pelo segundo caminho, a técnica ainda precisa conferir sua disponibilidade e configuração.

| Elemento do caso | O que identifica | Informação que ainda precisa ser conferida |
|---|---|---|
| Notebook N | O participante que executa a aplicação | A interface em uso |
| Interface C ou S | O ponto de conexão escolhido no caso | Os demais participantes da comunicação |
| Pedido e resposta combinados | A regra da aplicação fictícia | A disponibilidade da conexão e do serviço |

#### Como ler o desenho

A relação abaixo representa **pertencimento**: as duas interfaces pertencem
ao notebook N. Um diagrama em árvore pode apresentar o notebook acima das
interfaces. Seus três elementos identificam um host e duas partes dele.

| Participante | Interfaces que lhe pertencem |
| --- | --- |
| Notebook N | Interface C — conexão por cabo; interface S — conexão sem fio |

**Descrição equivalente:** o notebook N possui as interfaces C e S; C corresponde à conexão por cabo, S à conexão sem fio. As linhas indicam a relação entre a máquina e seus pontos de conexão.

“Interface” também pode designar uma interface lógica. A terminologia da RFC 1122 distingue a interface física da interface lógica. O desenho focaliza as duas conexões físicas do caso; endereços e interfaces lógicas pertencem a um recorte posterior.¹

### Práticas novas — enunciados, resposta e feedback

#### F-P1 — Terminal de atendimento

Um terminal de atendimento T usa uma interface por cabo e outra por rádio. Seu programa envia um pedido de senha no formato combinado com o servidor. A conexão por cabo deixa de ser usada e T passa a usar a conexão por rádio. Qual descrição preserva as funções dos elementos?

- A. T continua sendo o host; mudou sua interface em uso; o formato combinado pertence ao protocolo da aplicação.
- B. A interface por rádio é um novo host; T passa a ser apenas o protocolo.
- C. Como mudou a interface, o formato de pedido necessariamente deixou de valer.

**Resposta correta:** A.

**Feedback após responder:** O terminal continua sendo o participante; sua
interface por rádio é uma parte dele. O formato de pedido pertence à regra da
aplicação e pode permanecer igual após a troca de conexão. Para saber se a
comunicação funcionará pelo novo caminho, ainda seria preciso verificar o
acesso ao servidor.¹

#### F-P2 — Duas câmeras, uma regra

As câmeras A e B são máquinas distintas. Cada uma possui apenas uma interface de rede e ambas enviam pedidos com o mesmo formato de aplicação. Um relatório diz: “Como usam a mesma regra de comunicação, A e B formam um único host”. Qual correção é adequada?

- A. Há dois hosts e duas interfaces no recorte; ambos os participantes usam a mesma regra de comunicação.
- B. Há um host, porque uma regra de comunicação só pode ser usada por uma máquina.
- C. Há dois protocolos obrigatoriamente diferentes, porque as máquinas são distintas.

**Resposta correta:** A.

**Feedback após responder:** Há duas máquinas participantes, cada uma com sua
interface. A regra compartilhada permite que seus programas interpretem as
mensagens de modo compatível. Assim, a contagem dos hosts acompanha os
participantes do caso, enquanto o protocolo descreve como eles se comunicam.¹

### Aplicação pedagógica e composição previstas

| unidade de análise | Introdução | Uso ou retomada no percurso | Cobertura da tarefa |
|---|---|---|---|
| F-A1 — Host como participante final | F-U1 | F-U2 usa; F-P1 e F-P2 mobilizam | Identificar o participante sem contar interfaces como hosts |
| F-A2 — Interface como conexão do host | F-U1 | F-U2 retoma por contraste; ambas as práticas mobilizam | Distinguir alteração da conexão e identidade do participante |
| F-A3 — Protocolo como regra da comunicação | F-U2 | Ambas as práticas mobilizam | Separar compartilhamento da regra e identidade da máquina |

F-U1 e F-U2 contêm definição, exemplo e contraste substantivos. F-X desenvolve
os pressupostos e as relações que podem ser consultados durante o percurso. As
introduções e as oportunidades são contabilizadas nas unidades que as realizam. As práticas usam apenas o que já foi ensinado. A segunda muda de **um
host com várias interfaces** para **vários hosts com uma interface cada**, uma
variação na relação entre as quantidades de participantes e de interfaces. F-P1 e F-P2 vinculam-se ao mesmo F-E1 com identidades de
oportunidade distintas. A avaliação observa a escolha entre razões oferecidas;
produzir uma justificativa sem essas opções exigiria outra atividade.

Componentes do catálogo corrente: prosa em `aralearn.resource.paragraph@1.0.0`; comparação em `aralearn.resource.table@1.0.0`; pertencimento em `aralearn.resource.tree@1.0.0`, variante `hierarchy`; respostas em `aralearn.response.choice@1.0.0`. A árvore se justifica pela relação pai–filho do recorte. Uma tarefa de seguir enlaces entre equipamentos exigiria representar a topologia da rede. Configuração do desenho prevista, com o componente já instalado:

```json
{
  "variant": "hierarchy",
  "prompt": "As linhas ligam o notebook às interfaces que lhe pertencem.",
  "nodes": [
    {"id": "notebook-n", "label": "Notebook N", "parentId": null},
    {"id": "interface-c", "label": "Interface C — conexão por cabo", "parentId": "notebook-n"},
    {"id": "interface-s", "label": "Interface S — conexão sem fio", "parentId": "notebook-n"}
  ]
}
```

## Gerência SNMP/RMON — observar o estado e recuperar um intervalo

### Plano inspecionável em autoria

**Objetivo:** escolher uma forma de observação compatível com uma pergunta operacional, identificando quem consulta, quem responde, qual informação é nomeada e se a pergunta exige estado atual ou histórico previamente coletado.

**Pressupostos:** host, interface e protocolo conforme o exemplo anterior;
diferença entre “agora” e “durante um intervalo”. A explicação recupera essas
relações. Sintaxe de comandos de fornecedor, programação de MIB e configuração
de segurança pertencem a etapas operacionais posteriores.

**Proposta da explicação:** conectar a pergunta operacional ao diálogo entre
gerente e agente; desenvolver a diferença entre objeto, instância e valor; e
contrastar uma resposta atual com registros de intervalos RMON por meio de um
caso resolvido. As fontes previstas são RFC 3411, RFC 3416 e RFC 2819; RFC 2578
e RFC 2863 sustentam os detalhes indispensáveis de identificação e interface.
O recorte tem finalidade introdutória e técnica.

**Requisito G-E1:** escolher uma interpretação/plano que associe corretamente papéis, instância consultada e natureza temporal da evidência. O julgamento precisa relacionar esses elementos na situação apresentada.

### Unidades compactas do percurso — texto do estudante

#### G-U1 — A pergunta parte do gerente

A operadora quer saber se uma interface do equipamento está funcionando. No
computador dela, uma aplicação de **gerência** envia uma consulta; no equipamento
observado, o **agente** dá acesso à informação e responde. Esse diálogo usa
SNMP, o Protocolo Simples de Gerência de Rede. “Gerente” e “agente” são papéis
desempenhados por programas nos equipamentos participantes. A interface é o objeto da
pergunta; quem formula a consulta é o gerente.²

#### G-U2 — Nome, instância e valor

Para consultar o estado de uma interface, o gerente precisa indicar **qual informação deseja** e **a qual interface ela se refere**. No exemplo, a informação é o estado operacional e a interface escolhida tem índice 2, um número que a identifica dentro daquele equipamento.

O nome `ifOperStatus` identifica a informação de estado operacional. Acrescentar `.2` escolhe uma instância: essa informação para a interface específica de índice 2. A resposta traz um terceiro elemento, o valor encontrado.⁴⁵

| Parte da consulta e da resposta | Função no caso |
| --- | --- |
| `ifOperStatus` | Nomear a informação desejada: estado operacional |
| `.2` | Escolher a interface a que a informação se refere |
| `up(1)` | Informar o valor: a interface está pronta para passar tráfego nesse estado |

A operação **Get** solicita o valor da instância exata, como `ifOperStatus.2`. O retorno `up(1)` informa o estado da interface identificada naquele momento. Para examinar os dez minutos anteriores, seria preciso consultar registros desse intervalo.³⁵

A documentação desses objetos é organizada em módulos MIB, da expressão **Base de Informações de Gerência**. Ela permite consultar o significado e o tipo de cada informação. Um **OID**, identificador de objeto, é o nome numérico usado para identificar o objeto ou sua instância; nomes simbólicos como `ifOperStatus` tornam essa identificação mais legível. A explicação compartilhada desenvolve essa relação.⁴⁵

#### G-U3 — O histórico precisa ter sido coletado

A MIB **RMON**, de monitoramento remoto de redes, oferece grupos de objetos para observação. Seus grupos de histórico permitem controlar amostragem periódica e recuperar registros guardados no monitor. Isso permite, por exemplo, consultar depois os intervalos coletados enquanto a estação de gerência estava sem contato. O histórico precisa estar configurado, implementado e ainda disponível. O gerente recupera esses registros por meio da comunicação SNMP, complementando a consulta do estado atual com observações de intervalos anteriores.⁶

### Explicação compartilhada G-X — texto do estudante

#### Transformar a dúvida em uma pergunta observável

“A rede está boa?” reúne muitas dúvidas diferentes. A operadora do laboratório separa duas: “A interface 2 está operacional agora?” e “O que foi registrado enquanto a estação de gerência ficou desconectada?”. A primeira pede um estado. A segunda exige observação guardada durante o intervalo. Cada pergunta requer seu próprio conjunto de dados.

O gerente formula a consulta e o agente fornece acesso aos dados. O agente é o software que obtém a informação de gerência da interface observada. A arquitetura SNMP admite diferentes aplicações e funções, inclusive notificações; o caso usa somente consulta e resposta. O acesso depende da autorização e do contexto da informação.²

#### O nome permite pedir o dado certo

O identificador OID é uma sequência hierárquica de números. Nomes simbólicos facilitam sua leitura. Módulos MIB documentam significado, tipo e acesso dos objetos. Em uma tabela, o índice diferencia linhas: pedir `ifOperStatus.2` seleciona a instância de índice 2. A correspondência desse número com uma interface precisa ser conferida em cada equipamento.⁴⁵

No laboratório, a configuração de acesso já foi feita e a documentação do equipamento já relaciona o índice 2 à interface desejada. A operadora realiza a seguinte troca ilustrativa. A tabela representa conceitualmente a consulta e a resposta. A execução em um equipamento exigiria os comandos e a configuração próprios de seu ambiente.

| Sentido | Operação e conteúdo ilustrativos | Interpretação |
|---|---|---|
| Gerente → agente | Get: `ifOperStatus.2` | Pedir o valor da instância exata |
| Agente → gerente | Response: `ifOperStatus.2 = up(1)` | Receber o estado dessa interface |

Na operação Get, o nome deve corresponder à variável acessível. Falta de objeto ou instância pode produzir uma exceção na resposta; interpretar o retorno exige verificar se ele contém o valor solicitado ou informa essa exceção.³ O valor `up(1)` descreve a interface. Avaliar o funcionamento da aplicação requer conferir também sua própria troca de mensagens.⁵

#### Quando a pergunta é sobre o intervalo

Considere um monitor que já guardava uma amostra a cada minuto, com capacidade disponível para manter seis amostras. A estação de gerência ficou desconectada por três minutos, mas o monitor continuou funcionando. Após a reconexão, consultar os registros existentes pode recuperar o que ele observou. Essa recuperação depende dos dados que o monitor coletou e ainda conserva.

A RMON distingue controle da coleta e dados resultantes. Retenção é limitada, e registros antigos podem ser substituídos. Grupos e objetos disponíveis dependem da implementação. Uma leitura da interface atual e uma recuperação de histórico, portanto, respondem a perguntas diferentes.⁶

### Práticas novas — enunciados, resposta e feedback

#### G-P1 — Estado atual e evidência sobre o passado

No equipamento L, a interface observada tem índice 7. O gerente recebeu do agente `ifOperStatus.7 = up(1)`. A operadora quer saber se isso também prova ausência de problemas nos cinco minutos anteriores. Qual interpretação é adequada?

- A. O retorno descreve o estado da interface 7; para examinar o intervalo, é necessário consultar evidência previamente coletada, como histórico RMON disponível.
- B. O valor 1 identifica a interface 1 e prova que todas as interfaces funcionaram durante cinco minutos.
- C. A consulta transformou o gerente em monitor RMON e criou os registros anteriores.

**Resposta correta:** A.

**Feedback após responder:** O índice `.7` identifica a interface consultada,
e `up(1)` informa seu estado operacional naquele momento. O número 1 pertence
ao valor de estado. Para examinar os cinco minutos anteriores, a operadora
precisa de registros coletados durante esse período e deve conferir o que
eles mediram. Essa informação permite uma conclusão delimitada pelos dados e
pelos intervalos disponíveis.³⁵⁶

#### G-P2 — Duas perguntas depois de uma desconexão

O monitor M permaneceu ativo enquanto a estação de gerência ficou sem contato por dois minutos. Antes disso, havia histórico RMON configurado; os registros desses minutos continuam disponíveis. A interface de interesse tem índice 3. A operadora quer conhecer seu estado atual e examinar os registros do período. Qual plano atende às duas perguntas?

- A. Pelo gerente, consultar no agente `ifOperStatus.3` para o estado e recuperar os registros históricos existentes para o período; interpretar cada retorno conforme seu objeto e intervalo.
- B. Consultar somente `ifOperStatus.3` e tratar o estado recebido como duas amostras históricas.
- C. Pedir a `ifOperStatus.2` o estado da interface 3, porque o último número de um identificador nunca altera a instância.

**Resposta correta:** A.

**Feedback após responder:** A consulta a `ifOperStatus.3` trata do estado
atual da interface 3. Os registros históricos respondem à pergunta sobre o
período de desconexão. Consultar `.2` escolheria outra instância, e tratar um
estado atual como duas amostras confundiria os tipos de dado. O caso assegura
que o histórico existe; em uma situação real, disponibilidade, intervalo e
retenção também precisam ser conferidos.³⁴⁶

### Aplicação pedagógica e composição previstas

| unidade de análise | Introdução | Uso ou retomada no percurso | Cobertura da tarefa |
|---|---|---|---|
| G-A1 — Relação gerente–agente na consulta | G-U1 | G-U2 e G-U3 usam; ambas as práticas mobilizam | Atribuir quem pergunta e quem dá acesso aos dados |
| G-A2 — Objeto, instância e valor na informação de gerência | G-U2 | Ambas as práticas mobilizam | Selecionar a interface e interpretar o retorno |
| G-A3 — Consulta Get e alcance de sua resposta | G-U2 | G-U3 retoma por contraste; ambas as práticas mobilizam | Distinguir obter um valor de reconstruir um intervalo |
| G-A4 — Coleta e recuperação de histórico RMON | G-U3 | Ambas as práticas mobilizam | Exigir observação anterior disponível para tratar o passado |

As identidades representam relações instrucionais delimitadas pelo objetivo. A
contagem acompanha essas decisões de planejamento, enquanto a validação do que
o estudante aprende exigiria outro método. Se a inspeção mostrar que G-A2 reúne
relações demais para o público, a introdução precisa ser reorganizada com o
mesmo objetivo; agrupar várias ideias sob um só nome apenas para atender ao teto
falsearia o registro.

G-U1, G-U2 e G-U3 trazem definição, exemplo e contraste; o apoio aprofunda a leitura seletiva e o caso resolvido. F-A1 a F-A3 são pressupostos do segundo exemplo e podem ser recuperados no apoio. As práticas mobilizam o repertório já ensinado: G-P1 interpreta uma conclusão indevida e G-P2 seleciona um plano para duas perguntas. Ambas atendem ao mesmo G-E1, preservando sua operação-alvo e variando caso/dados e característica da tarefa. A contagem de oportunidades corresponde às duas respostas solicitadas.

Componentes previstos: `paragraph`, `table` e `response.choice`, todos na versão
`1.0.0` do catálogo corrente. A tabela de troca permite comparar direção,
conteúdo e interpretação. Ela apresenta a comunicação conceitual do exemplo;
uma etapa que ensinasse comandos executáveis precisaria indicar o ambiente e
usar a representação pertinente àquela operação.

## Parâmetros e composição das práticas

As atribuições abaixo são **propostas contextuais deste rascunho**, no escopo da
microssequência. Elas só se tornariam escolhas aplicadas depois da decisão da
pessoa autora e da gravação no servidor. O catálogo de parâmetros e suas regras
de herança permanecem os vigentes. A pertinência dos valores precisa ser
examinada no conteúdo e no público desse recorte.

| Parâmetro humano existente | Fundamentos | SNMP/RMON | Efeito e limite a inspecionar |
|---|---|---|---|
| `maximo_ideias_novas_por_unidade` | 2 | 2 | F-U1 introduz duas, F-U2 uma; G-U1 uma, G-U2 duas, G-U3 uma. O teto conta introduções nas unidades. Dificuldade exige avaliação própria, e a extensão conceitual da base acompanha seu objetivo. |
| `formas_de_explicacao` | `plain_definition`, `concrete_example`, `contrast` | Mesmas três formas | Apontar os trechos das unidades que realizam cada forma; conferir a realização no conteúdo indicado pela declaração. |
| `oportunidades_distintas_por_requisito` | 2 para F-E1 | 2 para G-E1 | Duas práticas completas por requisito, com identidades distintas e mesma operação-alvo. A apreciação humana examina a pertinência dessas oportunidades ao requisito. |
| `dimensoes_de_variacao_da_pratica` | `case_or_data` | `case_or_data`, `task_feature` | Fundamentos muda a relação entre quantidade de hosts e interfaces; SNMP muda dados e interpretação de retorno para seleção de plano. O nível de apoio permanece constante, e a dificuldade requer avaliação própria. |
| `alvo_palavras_conversa` | 120 | 120 | Orientação flexível para resposta operacional de autoria; documentos são fornecidos na extensão necessária à inspeção. |
| `alvo_palavras_unidade` | 90 | 100 | Escolhas editoriais locais para distribuir a exposição, preservando o sentido de enunciados, alternativas e feedback. A base explicativa tem a extensão necessária a seu desenvolvimento. |

O exemplo seleciona os parâmetros do catálogo pertinentes ao recorte. A
relação `aplicacaoPedagogica.explicacoes[].ideia` vincula cada forma realizada
à identidade da unidade de análise. A base explicativa compartilhada tem
identidade e conteúdo próprios.

Nas quatro práticas, a composição prevista de `response.choice` usa `selectionMode: "single"` e `selectionCriterion: "correct"`. O enunciado completo vai somente em `question`, sem duplicação em `content`; `options` conserva as três alternativas com identidades estáveis; `answerIds` referencia a alternativa descrita como correta. As letras A/B/C deste arquivo são localizadores editoriais; o aplicativo pode
embaralhar opções. Ao materializar, os comentários precisam identificar as
alternativas pelo seu conteúdo ou explicar diretamente a relação, para
permanecerem compreensíveis em qualquer ordem. O feedback vai no espaço
`feedback`, em `paragraph`, após a confirmação da resposta. A solução é revelada pelo controle próprio da prática, em ação explícita do estudante.

## Fontes, leitura e limites

As chamadas ¹–⁶ marcam vínculos previstos. Em uma futura versão de teste no aplicativo, devem apontar às fontes/âncoras pelo catálogo e pelos componentes de apresentação existentes, com ocorrência no trecho, retorno à origem e acesso de citação/link. Todos os vínculos permanecem **não verificados por pessoa autora** neste rascunho. As referências abaixo identificam os trechos técnicos usados para permitir essa conferência, sem reproduzir o texto integral das obras.

| Chamada | Fonte primária e localização consultada em 07/09/2026 | Papel no exemplo e limite |
|---|---|---|
| ¹ | R. Braden (ed.), [RFC 1122 — Requirements for Internet Hosts: Communication Layers](https://www.rfc-editor.org/rfc/rfc1122.html#section-1.1.1), outubro de 1989, §§1.1.1, 1.1.3, 1.3.3, trecho introdutório de §3.3.4.1 | Host, interface e contexto de protocolos. Consulta restrita aos trechos indicados, para fundamentar as distinções conceituais. O laboratório e seus pedidos são criação sintética. A implementação atual da pilha exige consultar suas especificações vigentes. |
| ² | D. Harrington, R. Presuhn e B. Wijnen, [RFC 3411 — An Architecture for Describing SNMP Management Frameworks](https://www.rfc-editor.org/rfc/rfc3411.html#section-3.1.3), dezembro de 2002, §§3.1.2, 3.1.3–3.1.3.2 e 3.3–3.3.1 | Papéis de software e escopo contextual da informação. Consulta dos trechos textuais indicados sobre os papéis do software e o contexto dos dados. Diagramas e modelos de segurança completos permanecem fora dessa leitura. |
| ³ | R. Presuhn (ed.), [RFC 3416 — Version 2 of the Protocol Operations for SNMP](https://www.rfc-editor.org/rfc/rfc3416.html#section-4.2.1), dezembro de 2002, introdução e §4.2.1 | MIB e consulta Get, correspondência exata e exceções. Consulta focal das operações de consulta. Credenciais e configuração de segurança exigem avaliação própria do equipamento e da versão de SNMP utilizada. |
| ⁴ | K. McCloghrie, D. Perkins e J. Schoenwaelder, [RFC 2578 — Structure of Management Information Version 2](https://www.rfc-editor.org/rfc/rfc2578.html#section-3.5), abril de 1999, §§3.5–3.6, 7.5 e 7.7 (incluindo regra de índice inteiro) | OID, significado documentado e instância de linha. Desenvolve a identificação necessária para ler as consultas do exemplo, sem ensinar toda a linguagem de definição de MIB. |
| ⁵ | K. McCloghrie e F. Kastenholz, [RFC 2863 — The Interfaces Group MIB](https://www.rfc-editor.org/rfc/rfc2863.html#section-6), junho de 2000, §6, definições `ifIndex`, `ifDescr`, `ifAdminStatus` e `ifOperStatus` | Semântica de índice e estado operacional. Consulta focal das definições. A correspondência dos índices precisa ser verificada no equipamento real; o funcionamento da aplicação exige dados próprios. |
| ⁶ | S. Waldbusser, [RFC 2819 — Remote Network Monitoring Management Information Base](https://www.rfc-editor.org/rfc/rfc2819.html#section-2.1), maio de 2000, §§2–2.1, 2.3–2.3.3 e §5, definições `historyControlIndex`, `historyControlDataSource`, `historyControlBucketsGranted`, `historyControlInterval` | Coleta local, histórico, amostragem e retenção. Consulta focal. A implementação e a posição do monitor delimitam os grupos e o tráfego observáveis. O intervalo de um minuto foi escolhido para compor o caso sintético. |

As páginas oficiais **About this RFC** informam o estado de cada fonte. A
[RFC 1122](https://www.rfc-editor.org/info/rfc1122/) aparece como Internet
Standard e recebeu atualizações posteriores, entre elas a RFC 9293 para TCP. As
páginas da [RFC 3416](https://www.rfc-editor.org/info/rfc3416/) e da
[RFC 2819](https://www.rfc-editor.org/info/rfc2819/) também as apresentam como
Internet Standards e registram que substituem, respectivamente, a RFC 1905 e a
RFC 1757.

O exemplo usa somente a distinção conceitual localizada na RFC 1122, preservando
fora do recorte suas antigas recomendações operacionais. A
[RFC 3411](https://www.rfc-editor.org/info/rfc3411/) registra atualizações pelas
RFCs 5343 e 5590, relativas à descoberta de Context EngineID e ao subsistema de
transporte; esses mecanismos também ficam fora do conteúdo ensinado aqui. As
definições adicionais de SMIv2 e IF-MIB foram consultadas apenas no recorte
indicado na tabela.

Uma revisão futura pode percorrer integralmente as erratas e toda a cadeia de
atualizações. Antes de transformar o exemplo em prática sobre equipamento real,
a autoria precisa conferir também a documentação e o suporte efetivo desse
equipamento.
