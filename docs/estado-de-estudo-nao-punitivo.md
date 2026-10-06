# Estado de estudo não punitivo

## Problema que o estado de estudo resolve

Para interromper uma lição durante um deslocamento e retomá-la depois, o
aplicativo precisa lembrar onde continuar, quais unidades já foram avançadas e
o que a pessoa marcou para rever. O AraLearn chama esse conjunto de
**estado de estudo**.

Durante a prática, a pessoa pode tentar novamente ou consultar a resposta antes
de continuar. O progresso acompanha a passagem pelas unidades e as escolhas
pessoais de retomada. Tentativas e uso de ajuda ficam fora de notas ou
classificações de estudantes. Essa é a opção de estudo não punitivo adotada
pelo produto, relacionada ao [modelo didático](modelo-didatico.md).

## Estado funcional e telemetria

O **estado funcional** permite que uma escolha continue produzindo seu efeito,
como reabrir uma lição no ponto alcançado. A **telemetria comportamental**
registra eventos para analisar uso, como abertura, duração, repetição ou
sequência temporal de ações.

O AraLearn conserva o estado funcional necessário ao estudo. Sua finalidade
delimita os dados guardados e o que se pode interpretar a partir deles. Uma
investigação de desempenho ou proficiência precisa definir outra coleta,
com finalidade e método próprios. Dados educacionais exigem pergunta explícita,
limites de inferência e governança proporcionais ao risco
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## O que é conservado

| Registro | Finalidade | Unidade de registro | Limite de interpretação |
| --- | --- | --- | --- |
| ponto de continuação | reabrir a lição na unidade alcançada | uma posição por lição | não informa tempo, atenção, dificuldade ou domínio |
| conclusão estrutural | impedir que uma unidade avançada reapareça como inédita | identidades de unidades por lição | não informa acerto, qualidade da resposta, nota ou aprendizagem |
| marca **Rever** | formar a lista pessoal de revisão | presença ou ausência da marca por unidade | não informa erro, déficit, prioridade docente ou risco |

As observações são textos ligados ao objeto que motivou o apontamento,
conservados separadamente do progresso. Essa separação permite que o
proprietário faça a triagem do texto enviado sem receber o estado pessoal de
continuidade.

A data de atualização serve para conciliar cópias. As interações momentâneas,
como uma abertura ou uma resposta, permanecem fora do estado depois que cumprem
sua função na tela. O registro conserva o ponto atual necessário à retomada,
em vez de uma sequência de eventos da sessão.

## Avançar e retomar

Na prática, **Continuar** confere a resposta antes de permitir o avanço; numa
unidade apenas expositiva, o mesmo controle avança diretamente. Quando a autoria
preparou um retorno adicional, ele é apresentado antes da próxima unidade.
O [guia do estudante](guia-estudante.md#responder-a-uma-prática) explica as etapas
da resposta, da consulta à solução e do avanço.

O aplicativo registra a identidade da unidade avançada e usa essa informação
para calcular o ponto de retomada na lição. A resposta em elaboração permanece
na interação aberta; o registro de continuidade conserva o avanço. Sem conexão,
a mudança entra na cópia local e aguarda sincronização.

Conservar os dados do aplicativo permite recuperar a continuidade local. Limpar
esses dados pode remover mudanças ainda não sincronizadas. No modo automático,
o retorno da conexão permite enviar as operações pendentes e comparar a versão
remota. No modo manual, use a nuvem para solicitar a sincronização, conforme o
[guia do estudante](guia-estudante.md#escolher-quando-sincronizar).

## Marcar para rever

Dentro de uma unidade, use **Marcar para rever**. O controle indica quando a
marca está ativa; o mesmo comando a retira.

As marcas formam a seção **Rever** da tela inicial, com o caminho até a unidade.
Elas pertencem à pessoa e podem ser atualizadas sem conexão. Em dois
dispositivos, deixe ambos sincronizarem antes de alternar repetidamente a mesma
marca.

## Registrar uma observação

Entre numa conta e, em uma unidade acessível, abra **Observações**, escolha uma
categoria ou **Sem categoria**, escreva e salve. Podem existir várias anotações
próprias no mesmo alvo.

A pessoa estudante vê somente os próprios registros. O proprietário recebe a
caixa de entrada necessária à triagem. Sem conexão, o comando entra numa fila
própria e o texto permanece no dispositivo. Progresso e **Rever** são guardados
em outro conjunto de registros.

O capítulo de [observações](observacoes-pedagogicas.md) explica respostas,
retirada, retenção e limites.

## Identidades estáveis e reorganização do curso

Continuidade, **Rever** e anotações usam identidades de lição e unidade. Inserir
uma unidade no começo da sequência preserva os vínculos seguintes porque eles
apontam para os objetos, e não apenas para suas posições. Mover ou renomear um
objeto também preserva o vínculo quando sua identidade permanece.

Se o alvo for retirado, o registro aparece como indisponível ou deixa de
participar da navegação, conforme sua função. A marca ou anotação permanece
associada à identidade original; uma unidade com texto parecido é outro objeto.
Essa regra evita transferir uma dúvida para um conteúdo que a pessoa não indicou.

## Cópia local e sincronização

No navegador e no Android, o [IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API),
recurso do navegador para guardar dados estruturados no dispositivo, conserva
o estado depois do fechamento da página. O servidor mantém a cópia vinculada
à conta para que outro dispositivo possa receber a continuidade. A
[persistência relacional](persistencia-relacional.md) descreve essa sincronização.

O estado pessoal envia mudanças delimitadas de progresso ou marcas **Rever**,
em vez de substituir todo o documento a cada ação. Um identificador reconhece a
repetição do mesmo pedido depois de uma falha de rede. As versões impedem que
uma cópia antiga sobrescreva silenciosamente uma mudança mais recente.

As observações usam cópia e fila próprias. Sua versão de sincronização avança
separadamente para cada pessoa e curso. Assim, alterações nas observações de
outra pessoa preservam a versão da sua fila. Esse número coordena a atualização;
o texto dos registros segue as permissões de cada pessoa.

Os registros técnicos de envio permitem conferir se uma alteração chegou ao
servidor. Eles acompanham a entrega da operação.

## Quem pode acessar

Com conta, o estado de continuidade e **Rever** só podem ser lidos pela própria
pessoa. Sem conta, permanecem localmente no dispositivo. Cada estudante também
lê somente suas anotações. O proprietário recebe a caixa de entrada do curso,
que contém os apontamentos enviados para triagem.

Uma síntese dessa caixa ajuda a localizar alvos com registros abertos e
acompanhar a fila de trabalho. Seu objeto são as contribuições recebidas; uma
avaliação de estudantes, turmas ou ensino requer dados e critérios adequados
à pergunta educacional.

## Regra para admitir um novo indicador

Um indicador pretende representar um fenômeno, como autonomia ou compreensão.
O conceito empregado para formular e investigar esse fenômeno é chamado de
**construto**; sua definição e as evidências necessárias à interpretação estão
no [glossário de construtos](glossario-construtos.md). Antes de incorporar um
indicador educacional ao AraLearn, é preciso documentar:

1. a pergunta educacional;
2. o construto teórico e sua definição;
3. a unidade de análise e a agregação;
4. a decisão apoiada e quem responde por ela;
5. as inferências vedadas;
6. a validade e as limitações da medida;
7. o método de avaliação;
8. acesso, retenção, exclusão e custo de armazenamento.

Essas definições permitem julgar a pertinência da coleta antes de implementá-la.
A autorregulação, por exemplo, envolve planejamento, acompanhamento e reflexão;
sua investigação precisa relacionar as observações a essas dimensões
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated);
[Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated)).

<!-- referências locais: início -->

## Referências

- [Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated): Jaclyn Broadbent; Walter L. Poon (2015). **Self-Regulated Learning Strategies and Academic Achievement in Online Higher Education Learning Environments: A Systematic Review.** *The Internet and Higher Education*, 27, p. 1–13.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated): Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70.

<!-- referências locais: fim -->
