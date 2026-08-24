# Observações e Anotações ancoradas

Uma dúvida, sugestão ou percepção de erro costuma surgir no ponto exato em que
alguém estuda ou inspeciona um Curso. O AraLearn preserva esse contexto: a
interface chama a manifestação de **Observação**; o domínio registra uma
**Anotação ancorada**.

A Anotação ancorada fica ligada a um alvo identificável e à revisão observada.
Ela não integra o conteúdo do Curso, não concede autoria e não produz correção
automática. A mesma pessoa pode registrar várias Observações no mesmo alvo.

## Alvos

Cada Observação aponta para exatamente um destes objetos:

- Curso;
- Módulo;
- Lição;
- Tópico;
- Microssequência didática;
- Unidade de estudo;
- Fonte;
- Âncora de Fonte.

O registro conserva o caminho observado e, quando disponível, o caminho
corrente. Assim, uma reorganização pode ser mostrada sem reescrever o contexto
em que a manifestação nasceu.

## Origem e canal

Origem descreve quem ou o que produziu a manifestação; canal descreve por onde
ela entrou.

| Origem | Canais correspondentes |
| --- | --- |
| pessoa autora (`author`) | interface de Autoria (`authoring_interface`) ou conversa (`authoring_chat`) |
| estudante (`learner`) | Estudo (`study_interface`) |
| auditoria humana (`human_audit`) | interface de auditoria (`audit_interface`) |
| auditoria automática (`automatic_audit`) | automação de auditoria (`audit_automation`) |

As superfícies correntes criam Observações autorais e de estudantes. O ciclo de
auditoria usa rodadas e achados próprios e, por isso, não cria nem altera uma
Observação por implicação. Registros importados cuja proveniência não pôde ser
determinada conservam `unknown_legacy`, sem receber uma origem inventada.

## Categorias e estados

Categoria é opcional. **Sem categoria** conserva o valor ausente. As categorias
disponíveis são:

| Categoria | Uso |
| --- | --- |
| **Dúvida** (`question`) | pergunta que precisa de esclarecimento |
| **Possível erro** (`possible_error`) | indício que precisa ser verificado |
| **Trecho confuso** (`confusing`) | conteúdo ou representação difícil de interpretar |
| **Sugestão** (`suggestion`) | proposta concreta de melhoria |
| **Pedido de reformulação** (`reformulation_request`) | indicação de que a interpretação apoiada por uma Fonte ou Âncora precisa ser refeita |

**Possível erro** registra uma percepção, sem confirmar erro factual.

| Estado | Significado |
| --- | --- |
| **Aberta** (`open`) | aguarda tratamento |
| **Considerada** (`considered`) | foi examinada ou recebeu resposta e continua em acompanhamento |
| **Resolvida** (`resolved`) | o tratamento da manifestação foi encerrado |
| **Retirada** (`withdrawn`) | quem possui essa capacidade solicitou a retirada |

Uma resposta ou resolução descreve o tratamento da Observação. Mudança de
conteúdo, correção e verificação pertencem ao ciclo de auditoria.

## Classificação de assunto

A classificação automática segue uma regra exata:

- uma Observação cujo alvo é um Tópico recebe somente esse Tópico como assunto,
  com método `exact_topic_target`;
- Curso, Módulo, Lição, Microssequência, Unidade, Fonte e Âncora permanecem sem
  assunto inferido, com método `target_scope_unclassified`;
- registros importados sem classificação verificável usam
  `legacy_unclassified`.

O sistema não deduz Tópicos pelo texto ou pela posição curricular. A pessoa
proprietária pode selecionar assuntos numa ação separada, registrada como
`human_topic_selection`. A correção humana preserva a classificação automática
original para que o método continue rastreável.

## Registrar durante o Estudo

1. Abra **Observação** na Unidade corrente.
2. Escolha uma categoria ou mantenha **Sem categoria**.
3. Escreva um texto específico e salve.

O texto aceita até 2.000 caracteres Unicode e 16 KiB em UTF-8. Quebras de linha,
retorno de carro e tabulação são preservados; outros caracteres de controle são
recusados.

A folha mostra as Observações da própria pessoa naquela Unidade, com categoria,
estado, situação de sincronização e eventual resposta da pessoa proprietária.
Conforme as capacidades recebidas do servidor, é possível criar outro registro,
revisar texto ou categoria e retirar uma Observação.

Uma pessoa estudante lê apenas as próprias Observações. A pessoa proprietária
do Curso recebe todas para triagem, com a identidade de quem contribuiu
protegida por pseudônimo. A interface mostra um rótulo como “Estudante 7A3F” e
omite UUID, endereço de correio eletrônico e referência técnica do pseudônimo.

## Funcionamento sem conexão

Uma Observação criada sem conexão entra numa fila de saída específica. A
interface apresenta a situação como **pendente**, **sincronizando**,
**sincronizada**, **em conflito** ou **falhou**. Esses estados descrevem a
entrega ao servidor, não o tratamento pedagógico.

A fila admite até 128 comandos e 256 KiB por Curso. A cópia local admite até
2 MiB, 48 alvos e 128 Observações por alvo. As páginas possuem até 24 itens;
até 128 páginas podem permanecer por alvo, sempre respeitando o limite agregado
de 128 itens.

Duas abas da mesma conta coordenam atualizações por `BroadcastChannel`. A
mensagem contém somente a identidade do Curso, a versão privada do conjunto e
até 128 identidades de Observação. O texto permanece no IndexedDB e a outra aba
o relê sem substituir um rascunho aberto. Perda de acesso elimina a cópia local,
a fila e a entrega pendente daquele Curso.

## Triagem na Autoria

A área **Auditoria e correções** contém a aba **Observações**, que apresenta uma
caixa de entrada única do Curso. O resumo informa total do recorte, contagens
por origem, canal e estado, além da quantidade sem classificação.

Os filtros cobrem:

- origem e canal;
- estado e categoria;
- ausência de categoria;
- assunto;
- objeto da hierarquia, com inclusão opcional de descendentes.

Cada resultado abre o alvo e o detalhe da Observação. A pessoa proprietária
pode criar Observações no Curso, Módulo, Lição, Tópico ou Microssequência. Para
uma Unidade, a criação parte da **Inspeção**, que preserva o alvo exato. O
detalhe de uma Fonte permite acrescentar uma nota, contestar uma interpretação
ou solicitar a reformulação da Fonte inteira ou de uma de suas Âncoras.

As capacidades devolvidas pelo servidor determinam as ações disponíveis:
considerar, responder, resolver, reabrir, retirar, revisar texto ou categoria e
corrigir assuntos. Uma resposta aceita até 2.000 caracteres Unicode e 16 KiB. A
síntese breve usada pela conversa aceita até 500 caracteres e 4 KiB.

Uma resposta simples registra apenas o texto da resposta. Quando a pessoa
autora registra uma reformulação, também precisa declarar as revisões de Fonte
e de Âncora que considerou. Essa declaração torna verificável a base da
reformulação sem incorporar o conteúdo dos documentos à Observação.

## Uso pelo MCP

Observações integram as ferramentas gerais de Curso:

- `lerCurso`, com `view: "anchored_annotations"`, lê caixa de entrada, alvo ou
  detalhe;
- `alterarCurso`, com `operation: "update_anchored_annotations"`, executa as
  ações permitidas.

Criar uma Observação pela conversa exige `confirmed: true` depois que a pessoa
confirma alvo e síntese. A confirmação protege a operação e não vira dado do
domínio. O cliente envia a manifestação pertinente, sem transformar a conversa
inteira em Observação.

Fonte e Âncora usam os mesmos modos de leitura e os mesmos comandos de
Anotações ancoradas. Uma resposta do tipo `reformulation` exige ao menos um
vínculo vigente com Fonte e Âncora; uma resposta do tipo `answer` não aceita
essa lista.

O ciclo de auditoria também permanece nas ferramentas gerais, por meio de
`audit_cycle` e `update_audit_cycle`. Uma sugestão de resolver ou reabrir uma
Observação exige outro comando de Anotação ancorada com a versão corrente.

## Paginação e quotas

Caixa de entrada, alvo e detalhe usam páginas de até 24 itens. O cursor opaco
possui até 240 caracteres e cada resposta, até 256 KiB. O contrato de item é
`aralearn.course-anchored-annotation.v1`.

Incluindo registros retirados ainda retidos, o servidor admite:

- até 128 Observações correntes por pessoa, Curso e alvo;
- até 512 Observações correntes por pessoa e Curso;
- até 256 versões ou eventos por Observação nas operações ordinárias.

Retirada e exclusão de conta continuam disponíveis quando o limite de versões
é alcançado. A revisão de texto, a mudança de estado e a resposta usam a versão
aplicável ao leitor. Criar uma Observação ou corrigir assuntos também confere a
revisão esperada do Curso.

O Estudo recebe `annotationSetVersion`, um contador privado da projeção daquela
pessoa. A atividade de outras pessoas não o altera e não pode ser deduzida a
partir dele. A pessoa proprietária recebe o contador geral necessário à caixa
de entrada.

## Privacidade, retenção e retirada

Enquanto uma Observação permanece aberta, considerada ou resolvida e o Curso
existe, o servidor conserva o texto corrente, a síntese e a resposta necessários
à função. Eventos de revisão guardam impressões digitais e metadados
delimitados, sem copiar versões anteriores do texto bruto.

Retirar uma Observação redige imediatamente texto, síntese e resposta. O
registro redigido e o recibo técnico expiram logicamente em até 14 dias. Depois
desse prazo, deixam de ser legíveis, pagináveis, contabilizados na quota ou
recuperáveis por repetição.

A remoção física ocorre oportunisticamente em leituras e alterações do Curso,
em lotes delimitados. Um Curso inativo pode conservar linhas já redigidas além
do prazo lógico, pois não há promessa de remoção física agendada. Excluir o
Curso remove as Observações associadas. Observações ativas ou resolvidas não
expiram apenas por idade; cada instalação precisa declarar a política
institucional de retenção.

Quando um achado referencia uma Observação, o vínculo conserva somente
identidade e versão. Após a retirada, o achado a apresenta como indisponível;
após a remoção física, o vínculo desaparece e o restante do ciclo permanece.

O AraLearn não cria cópias para pesquisa por padrão. Um uso científico exige
protocolo, minimização, finalidade, autorização e política de retenção
compatíveis com as pessoas envolvidas.

## Limites de interpretação

Retorno situado pode apoiar ação, mas categoria, quantidade, ausência, estado,
resposta e tempo de tratamento não medem atenção, dificuldade, aprendizagem ou
qualidade. Uma Observação marcada como possível erro ainda precisa de
verificação; uma Observação resolvida informa o encerramento da triagem, não um
resultado educacional.

A literatura sobre retorno formativo e participação sustenta examinar o
contexto e a possibilidade de ação, sem comprovar a eficácia desta forma
específica de registro ([Shute (2008)](referencias.md#ref-shute2008feedback);
[Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)). O AraLearn não usa
Observações para nota, classificação de pessoas, perfil de risco ou inferência
automática.

Consulte [Auditoria e correções do
Curso](auditoria-de-conformidade-instrucional.md) para o ciclo de melhoria e
[Privacidade](privacidade.md) para as regras gerais de dados.

<!-- referências locais: início -->

## Referências

- [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy): David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.

<!-- referências locais: fim -->
