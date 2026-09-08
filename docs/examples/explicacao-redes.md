# Exemplos de Explicação: fundamentos de redes e SNMP/RMON

Estes exemplos sintéticos ilustram o [contrato de Explicação e revisão humana](../explicacao-e-revisao-humana.md). São rascunhos didáticos, sem aprovação humana de conteúdo, materialização no aplicativo ou evidência de aprendizagem. Casos e números são inventados; não representam cursos reais.

Cada exemplo reúne uma microssequência, unidades substantivas, duas práticas e uma única Explicação. Quantidade de unidades, títulos, seções e extensão são decisões locais. Notas de autoria, aplicação e respostas esperadas ficam separadas do texto que será apresentado ao estudante; o gabarito não pertence ao apoio aberto durante a tentativa.

## Fundamentos de redes — quem participa, por onde se conecta e que regra usa

### Plano inspecionável em Autoria

**Objetivo:** diante de uma pequena situação de comunicação, distinguir o host participante, sua interface com a rede e o protocolo usado, justificando por que trocar uma interface não cria, por si só, outro host.

**Pressupostos a desenvolver no apoio:** uma aplicação é um programa que realiza uma tarefa; comunicar envolve informação enviada e recebida; uma conexão pode usar cabo ou rádio. Não se exige conhecer endereços, camadas, roteamento ou nomes de protocolos antes deste recorte. A distinção entre interface física e lógica será localizada como limite, sem virar requisito de avaliação aqui.

**Proposta da Explicação:** desenvolver a relação participante–interface–regra em uma situação concreta; explicitar o que o desenho representa; contrastar uma máquina com duas interfaces e duas máquinas com uma interface cada. A fonte prevista é a RFC 1122, §§1.1.1, 1.1.3 e 1.3.3. Seu papel é técnico/conceitual, não evidência de avaliação nem fonte de edital.

**Requisito de evidência F-E1:** selecionar uma descrição que preserve corretamente as três funções e sua relação quando o caso muda. As duas respostas constituem oportunidades de prática planejadas; não certificam capacidade geral de explicar redes.

### Unidades compactas do percurso — texto do estudante

#### F-U1 — Uma máquina pode ter duas interfaces

Um **host** é um participante que usa a comunicação da rede para realizar tarefas de suas aplicações. A **interface de rede** é seu ponto de conexão com uma rede. Um notebook pode usar uma interface para o cabo e outra para a conexão sem fio: são dois pontos de conexão do mesmo host. Duas interfaces não significam dois computadores. Ao descrever uma falha, identifique tanto a máquina quanto a interface afetada.¹

#### F-U2 — Conexão e regra têm funções diferentes

O **protocolo** estabelece regras de comunicação: como representar uma mensagem e como tratá-la. A interface permite a conexão do host; o protocolo organiza a troca. Imagine um laboratório cuja aplicação aceita o pedido “temperatura?” e devolve uma medida em graus Celsius. Ter o cabo conectado não basta se o programa envia um pedido que o outro não reconhece. Trocar o cabo pela conexão sem fio muda o acesso; não define, sozinho, uma nova regra para a aplicação.¹

*A regra textual do laboratório é um exemplo autoral fictício, não o nome nem a especificação de um protocolo padronizado.*

### Explicação compartilhada F-X — texto do estudante

#### Três perguntas sobre a mesma comunicação

Uma técnica quer ler uma medida em um notebook. Perguntar **quem participa** leva ao notebook e à máquina que oferece a medida. Perguntar **por onde o notebook se conecta** leva à sua interface. Perguntar **como os programas entendem o pedido** leva às regras de comunicação. Essas perguntas se referem à mesma situação, mas não são intercambiáveis.

O termo host destaca a função de participante final da comunicação, não um tamanho, uma marca ou uma aparência de equipamento. A RFC 1122 relaciona essa função às aplicações que usam serviços da rede. Uma interface física liga o host à rede conectada; o mesmo host pode ter mais de uma. Protocolos atuam em diferentes camadas da comunicação. O protocolo da aplicação e as regras do enlace não são a mesma coisa.¹

#### Um caso resolvido

No laboratório, o notebook N tem uma interface cabeada C e uma interface sem fio S. A aplicação já leu a medida usando C. A técnica desliga C, conecta S e executa a mesma aplicação, com o mesmo pedido “temperatura?”. Pela descrição do caso, o host continua sendo N; mudou a interface utilizada. A resposta esperada pela aplicação ainda é a medida. Isso não garante que o segundo caminho esteja disponível ou configurado: apenas distingue os objetos envolvidos.

| Elemento do caso | O que identifica | O que não permite concluir sozinho |
|---|---|---|
| Notebook N | O participante que executa a aplicação | Qual interface está em uso |
| Interface C ou S | O ponto de conexão escolhido no caso | Que existe outra máquina |
| Pedido e resposta combinados | A regra da aplicação fictícia | Que a conexão ou o serviço está funcionando |

#### Como ler o desenho

O desenho abaixo representa **pertencimento**, não o caminho de um pacote. Há um notebook no topo e duas interfaces pertencentes a ele. Assim, contar três caixas não equivale a contar três hosts. Se fossem dois notebooks diferentes, seria necessário representar dois participantes.

```text
Notebook N
├── Interface C — conexão por cabo
└── Interface S — conexão sem fio
```

**Descrição equivalente:** o notebook N possui as interfaces C e S; C corresponde à conexão por cabo, S à conexão sem fio. Nenhuma linha representa envio de mensagem.

“Interface” também pode designar uma interface lógica. A terminologia da RFC 1122 separa os dois conceitos; por isso o desenho não pretende enumerar todos os endereços ou interfaces que um sistema real pode apresentar.¹

### Práticas novas — enunciados, resposta e feedback

#### F-P1 — Terminal de atendimento

Um terminal de atendimento T usa uma interface por cabo e outra por rádio. Seu programa envia um pedido de senha no formato combinado com o servidor. A conexão por cabo deixa de ser usada e T passa a usar a conexão por rádio. Qual descrição preserva as funções dos elementos?

- A. T continua sendo o host; mudou sua interface em uso; o formato combinado pertence ao protocolo da aplicação.
- B. A interface por rádio é um novo host; T passa a ser apenas o protocolo.
- C. Como mudou a interface, o formato de pedido necessariamente deixou de valer.

**Resposta correta:** A.

**Feedback após responder:** A distingue participante, conexão e regra. Em B, uma parte do terminal foi tomada pelo participante completo. C atribui à mudança de interface uma mudança obrigatória de protocolo que o caso não informa. O enunciado também não prova que o servidor esteja acessível pelo novo caminho.¹

#### F-P2 — Duas câmeras, uma regra

As câmeras A e B são máquinas distintas. Cada uma possui apenas uma interface de rede e ambas enviam pedidos com o mesmo formato de aplicação. Um relatório diz: “Como usam a mesma regra de comunicação, A e B formam um único host”. Qual correção é adequada?

- A. Há dois hosts e duas interfaces no recorte; compartilhar um protocolo não funde os participantes.
- B. Há um host, porque uma regra de comunicação só pode ser usada por uma máquina.
- C. Há dois protocolos obrigatoriamente diferentes, porque as máquinas são distintas.

**Resposta correta:** A.

**Feedback após responder:** O caso identifica duas máquinas participantes e uma interface de cada. Compartilhar a regra permite que programas interpretem mensagens de modo compatível; isso não transforma duas máquinas em uma. B confunde regra compartilhada com identidade. C impede sem motivo que participantes diferentes usem a mesma regra.¹

### Aplicação pedagógica e composição previstas

| Unidade de análise | Introdução | Uso ou retomada no percurso | Cobertura da tarefa |
|---|---|---|---|
| F-A1 — Host como participante final | F-U1 | F-U2 usa; F-P1 e F-P2 mobilizam | Identificar o participante sem contar interfaces como hosts |
| F-A2 — Interface como conexão do host | F-U1 | F-U2 retoma por contraste; ambas as práticas mobilizam | Distinguir alteração da conexão e identidade do participante |
| F-A3 — Protocolo como regra da comunicação | F-U2 | Ambas as práticas mobilizam | Separar compartilhamento da regra e identidade da máquina |

F-U1 e F-U2 já contêm definição, exemplo e contraste substantivos. F-X desenvolve pressupostos e relações; não recebe introduções curriculares ou oportunidades creditadas por ter sido aberto. Não há ideia nova declarada nas práticas. A segunda prática muda de **um host com várias interfaces** para **vários hosts com uma interface cada**; não é somente troca de nomes ou reordenação de alternativas. F-P1 e F-P2 vinculam-se ao mesmo F-E1 com identidades de oportunidade distintas. A avaliação declarada continua limitada à seleção com razões oferecidas, sem inferir produção autônoma de uma justificativa.

Componentes do catálogo corrente: prosa em `aralearn.resource.paragraph@1.0.0`; comparação em `aralearn.resource.table@1.0.0`; pertencimento em `aralearn.resource.tree@1.0.0`, variante `hierarchy`; respostas em `aralearn.response.choice@1.0.0`. A árvore se justifica pela relação pai–filho do recorte; não substitui uma topologia quando a tarefa for seguir enlaces entre equipamentos. Configuração do desenho prevista, sem renderer novo:

```json
{
  "variant": "hierarchy",
  "prompt": "As linhas indicam quais interfaces pertencem ao notebook; não representam tráfego.",
  "nodes": [
    {"id": "notebook-n", "label": "Notebook N", "parentId": null},
    {"id": "interface-c", "label": "Interface C — conexão por cabo", "parentId": "notebook-n"},
    {"id": "interface-s", "label": "Interface S — conexão sem fio", "parentId": "notebook-n"}
  ]
}
```

## Gerência SNMP/RMON — observar o estado e recuperar um intervalo

### Plano inspecionável em Autoria

**Objetivo:** escolher uma forma de observação compatível com uma pergunta operacional, identificando quem consulta, quem responde, qual informação é nomeada e se a pergunta exige estado atual ou histórico previamente coletado.

**Pressupostos:** host, interface e protocolo conforme o exemplo anterior; diferença entre “agora” e “durante um intervalo”. A Explicação recupera essas relações. Não se exige conhecer a sintaxe de comandos de fornecedor, programar uma MIB ou configurar segurança antes deste recorte.

**Proposta da Explicação:** conectar a pergunta operacional ao diálogo entre gerente e agente; desenvolver a diferença entre definição de objeto, instância e valor; resolver uma consulta de leitura; contrastar uma resposta atual com registros de intervalos RMON. As fontes previstas são RFC 3411, RFC 3416 e RFC 2819; RFC 2578 e RFC 2863 sustentam os detalhes indispensáveis de identificação e interface. Sem alegação de cobertura de concurso.

**Requisito G-E1:** escolher uma interpretação/plano que associe corretamente papéis, instância consultada e natureza temporal da evidência. Escolher o nome de uma sigla isolada não atende ao requisito.

### Unidades compactas do percurso — texto do estudante

#### G-U1 — A pergunta parte do gerente

Para verificar uma interface, uma aplicação de **gerência** pode enviar uma consulta SNMP, o Protocolo Simples de Gerência de Rede. O **agente** oferece acesso à informação de gerência no sistema observado e responde à consulta. “Gerente” e “agente” designam papéis de software: não significam obrigatoriamente duas caixas especiais. Em nosso laboratório, o gerente roda no computador da operadora e o agente no equipamento observado. A interface observada é o objeto da pergunta; não é quem formula a consulta.²

#### G-U2 — Nome, instância e valor

A **MIB**, Base de Informações de Gerência, organiza os objetos acessíveis. Um **OID**, identificador de objeto, nomeia um objeto ou sua instância. Na notação simbólica `ifOperStatus.2`, o nome indica estado operacional e `.2` seleciona a interface de índice 2. Uma consulta **Get** pede o valor da instância exata. Se a resposta for `up(1)`, informa que essa interface está pronta para passar tráfego naquele estado; o valor não é seu nome. Uma leitura atual, sozinha, não descreve os dez minutos anteriores.³⁴⁵

#### G-U3 — O histórico precisa ter sido coletado

A MIB **RMON**, de monitoramento remoto de redes, oferece grupos de objetos para observação. Seus grupos de histórico permitem controlar amostragem periódica e recuperar registros guardados no monitor. Isso permite, por exemplo, consultar depois os intervalos coletados enquanto a estação de gerência estava sem contato. O histórico precisa estar configurado, implementado e ainda disponível. Consultar agora não cria registros do passado. RMON complementa a informação acessada pela gerência SNMP; não é uma alternativa que dispense esse diálogo.⁶

### Explicação compartilhada G-X — texto do estudante

#### Transformar a dúvida em uma pergunta observável

“A rede está boa?” reúne muitas dúvidas diferentes. A operadora do laboratório separa duas: “A interface 2 está operacional agora?” e “O que foi registrado enquanto a estação de gerência ficou desconectada?”. A primeira pede um estado. A segunda exige observação guardada durante o intervalo. Uma resposta positiva à primeira não resolve automaticamente a segunda.

O gerente formula a consulta e o agente fornece acesso aos dados. O agente não é a interface observada: é software que consegue obter sua informação de gerência. A arquitetura SNMP admite diferentes aplicações e funções, inclusive notificações; o caso usa somente consulta e resposta. O acesso depende da autorização e do contexto da informação.²

#### O nome permite pedir o dado certo

O identificador OID é uma sequência hierárquica de números. Nomes simbólicos facilitam sua leitura. Módulos MIB documentam significado, tipo e acesso dos objetos. Em uma tabela, o índice diferencia linhas: pedir `ifOperStatus.2` é pedir uma instância específica, não toda a tabela. O número 2 é índice local do exemplo; não significa que todo equipamento use 2 para a mesma porta.⁴⁵

No laboratório, a configuração de acesso já foi feita e a documentação do equipamento já relaciona o índice 2 à interface desejada. A operadora realiza a seguinte troca ilustrativa. Os nomes de mensagem e valores são notação didática; não são comandos para copiar em um terminal.

| Sentido | Operação e conteúdo ilustrativos | Interpretação |
|---|---|---|
| Gerente → agente | Get: `ifOperStatus.2` | Pedir o valor da instância exata |
| Agente → gerente | Response: `ifOperStatus.2 = up(1)` | Receber o estado dessa interface |

Na operação Get, o nome deve corresponder à variável acessível. Falta de objeto ou instância pode produzir uma exceção na resposta; uma mensagem recebida não garante que o valor pretendido tenha sido obtido.³ A resposta `up(1)` também não prova que a aplicação da usuária esteja funcionando: é um dado sobre a interface.⁵

#### Quando a pergunta é sobre o intervalo

Considere um monitor que já guardava uma amostra a cada minuto, com capacidade disponível para manter seis amostras. A estação de gerência ficou desconectada por três minutos, mas o monitor continuou funcionando. Após a reconexão, consultar os registros existentes pode recuperar o que ele observou. Essa possibilidade depende da coleta anterior; a consulta posterior não volta no tempo.

A RMON distingue controle da coleta e dados resultantes. Retenção é limitada, e registros antigos podem ser substituídos. Grupos e objetos disponíveis dependem da implementação. Uma leitura da interface atual e uma recuperação de histórico, portanto, respondem a perguntas diferentes.⁶

### Práticas novas — enunciados, resposta e feedback

#### G-P1 — Um retorno atual não preenche o passado

No equipamento L, a interface observada tem índice 7. O gerente recebeu do agente `ifOperStatus.7 = up(1)`. A operadora quer saber se isso também prova ausência de problemas nos cinco minutos anteriores. Qual interpretação é adequada?

- A. O retorno descreve o estado da interface 7; para examinar o intervalo, é necessário consultar evidência previamente coletada, como histórico RMON disponível.
- B. O valor 1 identifica a interface 1 e prova que todas as interfaces funcionaram durante cinco minutos.
- C. A consulta transformou o gerente em monitor RMON e criou os registros anteriores.

**Resposta correta:** A.

**Feedback após responder:** A preserva a instância consultada e limita a conclusão ao tipo de dado recebido. Em B, o valor de estado foi confundido com o índice e extrapolado para outras interfaces. C atribui à consulta uma coleta retroativa. Mesmo um histórico disponível só sustenta conclusões compatíveis com seus dados e intervalos; não prova “ausência de qualquer problema”.³⁵⁶

#### G-P2 — Duas perguntas depois de uma desconexão

O monitor M permaneceu ativo enquanto a estação de gerência ficou sem contato por dois minutos. Antes disso, havia histórico RMON configurado; os registros desses minutos continuam disponíveis. A interface de interesse tem índice 3. A operadora quer conhecer seu estado atual e examinar os registros do período. Qual plano atende às duas perguntas?

- A. Pelo gerente, consultar no agente `ifOperStatus.3` para o estado e recuperar os registros históricos existentes para o período; interpretar cada retorno conforme seu objeto e intervalo.
- B. Consultar somente `ifOperStatus.3` e tratar o estado recebido como duas amostras históricas.
- C. Pedir a `ifOperStatus.2` o estado da interface 3, porque o último número de um identificador nunca altera a instância.

**Resposta correta:** A.

**Feedback após responder:** O plano A associa cada pergunta a um dado pertinente e mantém a interface 3 como alvo. B confunde estado e histórico. C escolhe outra instância. O caso assegura a existência dos registros; fora dele, seria preciso verificar disponibilidade, intervalo e retenção antes de afirmar que o período foi recuperado.³⁴⁶

### Aplicação pedagógica e composição previstas

| Unidade de análise | Introdução | Uso ou retomada no percurso | Cobertura da tarefa |
|---|---|---|---|
| G-A1 — Relação gerente–agente na consulta | G-U1 | G-U2 e G-U3 usam; ambas as práticas mobilizam | Atribuir quem pergunta e quem dá acesso aos dados |
| G-A2 — Objeto, instância e valor na informação de gerência | G-U2 | Ambas as práticas mobilizam | Selecionar a interface e interpretar o retorno |
| G-A3 — Consulta Get e alcance de sua resposta | G-U2 | G-U3 retoma por contraste; ambas as práticas mobilizam | Distinguir obter um valor de reconstruir um intervalo |
| G-A4 — Coleta e recuperação de histórico RMON | G-U3 | Ambas as práticas mobilizam | Exigir observação anterior disponível para tratar o passado |

As identidades representam relações instrucionais delimitadas pelo objetivo. Não são uma contagem de siglas nem componentes de conhecimento empiricamente validados. Se a inspeção mostrar que G-A2 reúne relações demais para o público, a decisão é reorganizar a introdução e conservar o objetivo, não chamar várias ideias de uma só para passar no teto.

G-U1, G-U2 e G-U3 trazem definição, exemplo e contraste. O apoio desenvolve a leitura seletiva e o caso resolvido; não concentra uma relação obrigatória ausente do percurso. F-A1 a F-A3 são pressupostos usados neste segundo exemplo, com recuperação no apoio, sem nova introdução curricular. As práticas não introduzem conceitos novos: G-P1 interpreta uma conclusão indevida, G-P2 seleciona um plano para duas perguntas. Ambas atendem ao mesmo G-E1 e preservam sua operação-alvo; variam caso/dados e característica da tarefa. Não contam acesso ao apoio como resposta ou oportunidade adicional.

Componentes previstos: `paragraph`, `table` e `response.choice`, todos na versão `1.0.0` do catálogo corrente. A tabela de troca foi escolhida porque o objeto é comparar direção, conteúdo e interpretação. Não há comando de fornecedor, sintaxe inventada de CLI ou programa a executar; portanto não se usa `code` como decoração. Uma topologia de equipamentos não acrescentaria a distinção temporal exigida por esta tarefa.

## Parâmetros e composição das práticas

As atribuições abaixo são **propostas contextuais deste rascunho**, no escopo da microssequência. Não são defaults científicos, aprovação humana nem atribuições gravadas no servidor. Preferências explícitas da pessoa autora prevaleceriam segundo a herança já existente. O catálogo de parâmetros permanece o vigente; desenho aplicado e fatos de uso conservam o mecanismo atual.

| Parâmetro humano existente | Fundamentos | SNMP/RMON | Efeito e limite a inspecionar |
|---|---|---|---|
| `maximo_ideias_novas_por_unidade` | 2 | 2 | F-U1 introduz duas, F-U2 uma; G-U1 uma, G-U2 duas, G-U3 uma. O teto não mede dificuldade e não se aplica como teto paralelo de conceitos da Explicação. |
| `formas_de_explicacao` | `plain_definition`, `concrete_example`, `contrast` | Mesmas três formas | Apontar os trechos das unidades que realizam cada forma. A Explicação adicional não substitui silenciosamente evidência de aplicação ausente. |
| `oportunidades_distintas_por_requisito` | 2 para F-E1 | 2 para G-E1 | Duas práticas completas por requisito, com identidades distintas e mesma operação-alvo. A escolha exige apreciação humana da pertinência, não apenas contagem. |
| `dimensoes_de_variacao_da_pratica` | `case_or_data` | `case_or_data`, `task_feature` | Fundamentos muda a relação entre quantidade de hosts e interfaces; SNMP muda dados e interpretação de retorno para seleção de plano. Não se declara variação de nível de apoio nem dificuldade. |
| `alvo_palavras_conversa` | 120 | 120 | Orientação flexível para resposta operacional de autoria. Não limita documentos que exigem inspeção completa. |
| `alvo_palavras_unidade` | 90 | 100 | Escolhas editoriais locais para distribuir a exposição. Enunciados, alternativas e feedback mantêm sentido; nenhuma palavra necessária é removida para alcançar o número. Não há alvo de palavras da Explicação. |

Não foram acrescentados controles de dificuldade, aprendizagem, comprimento do overlay ou cadência. A relação `aplicacaoPedagogica.explicacoes[].ideia` continua vinculando formas à identidade da análise; ela não é o objeto compartilhado chamado Explicação.

Nas quatro práticas, a composição prevista de `response.choice` usa `selectionMode: "single"` e `selectionCriterion: "correct"`. O enunciado completo vai somente em `question`, sem duplicação em `content`; `options` conserva as três alternativas com identidades estáveis; `answerIds` referencia a alternativa descrita como correta. As letras A/B/C deste arquivo são localizadores editoriais, não posições fixas de exibição: o renderer existente pode embaralhar opções. O feedback apresentado acima vai no slot `feedback`, em `paragraph`, após confirmação da resposta. O estudante não recebe o campo de resposta esperada como conteúdo antecipado do apoio.

## Fontes, leitura e limites

As chamadas ¹–⁶ marcam vínculos previstos. Em uma futura fixture do app, devem apontar às fontes/âncoras pelo catálogo e renderer existentes, com ocorrência no trecho, retorno à origem e acesso de citação/link. A leitura técnica registrada abaixo não equivale a conferência humana da fonte. Todos os vínculos permanecem **não verificados por pessoa autora** neste rascunho. Nada precisa copiar o texto integral da RFC para o curso.

| Chamada | Fonte primária e localização consultada em 07/09/2026 | Papel no exemplo e limite |
|---|---|---|
| ¹ | R. Braden (ed.), [RFC 1122 — Requirements for Internet Hosts: Communication Layers](https://www.rfc-editor.org/rfc/rfc1122.html#section-1.1.1), outubro de 1989, §§1.1.1, 1.1.3, 1.3.3, trecho introdutório de §3.3.4.1 | Host, interface e contexto de protocolos. Leitura focal desses trechos, não integral. Não é catálogo atualizado de implementação de toda a pilha. O laboratório e seus pedidos são criação sintética. |
| ² | D. Harrington, R. Presuhn e B. Wijnen, [RFC 3411 — An Architecture for Describing SNMP Management Frameworks](https://www.rfc-editor.org/rfc/rfc3411.html#section-3.1.3), dezembro de 2002, §§3.1.2, 3.1.3–3.1.3.2 e 3.3–3.3.1 | Papéis de software e escopo contextual da informação. Leitura dos trechos textuais localizados; não auditoria de todos os diagramas ou modelos de segurança. |
| ³ | R. Presuhn (ed.), [RFC 3416 — Version 2 of the Protocol Operations for SNMP](https://www.rfc-editor.org/rfc/rfc3416.html#section-4.2.1), dezembro de 2002, introdução e §4.2.1 | MIB e consulta Get, correspondência exata e exceções. Leitura focal. “Versão 2 das operações” não significa que o exemplo recomende credenciais ou segurança de SNMPv2c. |
| ⁴ | K. McCloghrie, D. Perkins e J. Schoenwaelder, [RFC 2578 — Structure of Management Information Version 2](https://www.rfc-editor.org/rfc/rfc2578.html#section-3.5), abril de 1999, §§3.5–3.6, 7.5 e 7.7 (incluindo regra de índice inteiro) | OID, significado documentado e instância de linha. Acrescentada porque “OID” não pode ser apenas uma sigla solta. Sem ensinar toda a linguagem de definição de MIB. |
| ⁵ | K. McCloghrie e F. Kastenholz, [RFC 2863 — The Interfaces Group MIB](https://www.rfc-editor.org/rfc/rfc2863.html#section-6), junho de 2000, §6, definições `ifIndex`, `ifDescr`, `ifAdminStatus` e `ifOperStatus` | Semântica de índice e estado operacional. Leitura focal das definições; não associação dos índices a equipamento real nem prova de funcionamento da aplicação. |
| ⁶ | S. Waldbusser, [RFC 2819 — Remote Network Monitoring Management Information Base](https://www.rfc-editor.org/rfc/rfc2819.html#section-2.1), maio de 2000, §§2–2.1, 2.3–2.3.3 e §5, definições `historyControlIndex`, `historyControlDataSource`, `historyControlBucketsGranted`, `historyControlInterval` | Coleta local, histórico, amostragem e retenção. Leitura focal. Não se afirma que todos os grupos estejam implementados ou que o monitor enxergue tráfego de toda a rede. Intervalos de um minuto são dados do caso, não recomendação operacional universal. |

Também foram consultadas as páginas oficiais **About this RFC**. [RFC 1122](https://www.rfc-editor.org/info/rfc1122/) é listada como Internet Standard com atualizações posteriores, incluindo RFC 9293 para TCP; o exemplo limita-se à distinção conceitual lida e não reproduz suas antigas recomendações operacionais. [RFC 3411](https://www.rfc-editor.org/info/rfc3411/) registra atualizações pelas RFCs 5343 e 5590, relativas a descoberta de Context EngineID e subsistema de transporte; seus mecanismos não são ensinados aqui. As páginas de [RFC 3416](https://www.rfc-editor.org/info/rfc3416/) e [RFC 2819](https://www.rfc-editor.org/info/rfc2819/) as apresentam como Internet Standards e registram que substituem, respectivamente, RFC 1905 e RFC 1757. Não foi realizada varredura integral de erratas ou de toda a cadeia de atualizações. As definições adicionais de SMIv2 e IF-MIB foram consultadas para o recorte; uma futura prática operacional em equipamento requer conferir sua documentação e suporte efetivo.
