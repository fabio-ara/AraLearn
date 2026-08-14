# Estado de estudo não punitivo

## Problema que o estado de estudo resolve

Para interromper uma lição no metrô e retomá-la depois, o aplicativo precisa
lembrar algumas decisões: qual card já avançou, onde continuar, o que a pessoa
marcou para rever e qual observação escreveu. Esse registro funcional não
precisa se transformar em vigilância do comportamento.

O AraLearn chama de **estado de estudo** o conjunto mínimo de dados que permite
essa continuidade. Ele não é um boletim, um histórico de navegação nem um
modelo de proficiência.

## Estado funcional e telemetria

Dois tipos de dados podem parecer semelhantes, mas respondem a perguntas
diferentes:

- **estado funcional**: permite que uma função escolhida pela pessoa continue
  funcionando, como reabrir uma lição no ponto correspondente;
- **telemetria comportamental**: registra eventos para analisar o uso, como
  abertura, duração, repetição ou sequência temporal de ações.

O AraLearn mantém o primeiro conjunto e não coleta o segundo conjunto para o
estudo. Essa decisão segue um princípio de minimização: não conservar um sinal
apenas porque poderia ser analisado no futuro. Dados educacionais exigem uma
pergunta explícita, limites de inferência e governança proporcionais ao risco
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## O que é conservado

| Estado corrente | Para que serve | Unidade | O que não permite concluir |
| --- | --- | --- | --- |
| ponto de continuação | reabrir a lição no card correspondente | um card corrente por lição e item de **Trilhas** | tempo, atenção, dificuldade ou domínio |
| conclusão estrutural | evitar que uma etapa já avançada reapareça como inédita | conjunto de identidades de cards por lição | acerto, qualidade da resposta, nota ou aprendizagem |
| marca **Rever** | formar a lista pessoal de cards escolhidos para revisão | presença ou ausência da marca por card | erro, déficit, prioridade docente ou risco |
| observação | reencontrar o texto que a própria pessoa registrou | categoria e texto correntes por card | compreensão, mesmo quando não há observação |

A data de atualização existe para conciliar cópias e indicar a atualidade do
estado. Ela não é convertida em sessão, frequência, tempo de estudo ou jornada
comportamental.

O aplicativo não registra no estado de estudo:

- abertura ou mera visualização do card;
- tempo de permanência;
- quantidade de tentativas;
- respostas certas ou erradas anteriores;
- último resultado da prática;
- velocidade de avanço;
- comparação com outras pessoas.

## Avançar e retomar

**Pré-condição:** ter um curso em **Trilhas** e abrir uma lição.

**Passos:** responda à prática quando houver e use **Play** para confirmar ou
avançar. Saia da lição quando desejar. Ao voltar, abra o mesmo item.

**Resultado esperado:** o aplicativo usa a identidade da lição e dos cards para
recompor a continuidade. A conclusão estrutural indica somente que a pessoa fez
o card avançar; não guarda a resposta anterior como avaliação.

**Sem conexão:** a mudança é aplicada imediatamente na réplica do dispositivo e
fica disponível na próxima abertura offline.

**Recuperação:** se o servidor ainda mostrar um ponto anterior, mantenha o
dispositivo com a alteração e sincronize ao recuperar a conexão. Não limpe os
dados locais enquanto houver aviso de envio pendente.

## Marcar **Rever**

**Pré-condição:** estar em um card.

**Passos:** toque no ícone **Rever**. Toque novamente para retirar a marca.

**Resultado esperado:** a marca pessoal passa a integrar ou deixa de integrar
a lista de revisão. Ela não fica visível como classificação para colegas ou
professores.

**Sem conexão:** a marca é atualizada localmente e sincronizada depois.

**Recuperação:** se outro dispositivo apresentar o estado anterior, sincronize
os dois antes de alternar novamente a marca.

## Registrar uma observação

**Pré-condição:** estar em um card e possuir permissão de comentário quando o
curso pertencer a um workspace.

**Passos:** abra o ícone de observação, escolha o tipo, escreva e salve.

**Resultado esperado:** o estado pessoal conserva uma observação corrente por
card. Em um workspace inequivocamente associado, participantes autorizados
podem triar esse registro sem receber seu histórico de navegação.

**Sem conexão:** o texto é preservado localmente e aguarda envio.

**Recuperação:** consulte [Observações pedagógicas nos
cards](observacoes-pedagogicas.md) para sincronização, resposta e vínculo de
correção.

## Identidades estáveis e reorganização do curso

Um caminho baseado apenas em posição seria frágil: inserir um card no começo
da lição deslocaria todos os seguintes. Por isso, continuidade, **Rever** e
observações usam identidades próprias de lição e card. Mover ou renomear um
objeto preserva o vínculo quando sua identidade permanece a mesma.

Se o objeto for retirado, o AraLearn não transfere automaticamente o estado para
outro card “parecido”. Uma aproximação textual poderia associar uma dúvida ou
uma marca ao alvo errado. O registro passa a indicar indisponibilidade ou deixa
de participar da navegação corrente, conforme a função.

## Réplica local e sincronização

No navegador e no aplicativo Android, o estado corrente fica em **IndexedDB**,
um banco de dados do próprio dispositivo adequado a dados estruturados que
precisam sobreviver ao fechamento da página. Diferentemente de uma variável em
memória, ele permite reabrir o estudo sem recarregar tudo do servidor.

O Supabase conserva a contraparte vinculada à conta para que outro dispositivo
possa receber a continuidade. A sincronização envia mudanças por parte do
estado, em vez de substituir todo o documento a cada toque. Uma identidade de
mutação permite reconhecer a repetição da mesma tentativa quando a resposta da
rede se perde. Um número de revisão impede que uma cópia antiga sobrescreva
silenciosamente uma mudança mais recente.

Esses mecanismos resolvem consistência e retomada; não autorizam coleta de
novos sinais. Contadores internos de tentativas de rede, por exemplo, descrevem
a entrega de uma operação, não o comportamento de estudo.

## Quem pode acessar

O estado de continuidade, **Rever** e as observações próprias pertencem à conta.
Papéis de revisão de um workspace recebem as observações vinculadas ao espaço,
conforme sua autorização, mas não recebem tempo, tentativas, respostas anteriores
ou uma classificação individual de desempenho.

Uma síntese de observações pode ajudar a localizar cards com registros abertos.
Ela descreve a fila de trabalho, não mede estudantes, turmas, aprendizagem ou
qualidade docente.

## Regra para admitir um novo indicador

Um indicador educacional futuro só deve ser implementado depois de documentar:

1. a pergunta educacional que pretende responder;
2. o construto teórico e sua definição;
3. a unidade de análise e a forma de agregação;
4. a decisão que o indicador apoiará e quem responderá por ela;
5. as inferências proibidas;
6. a validade e as limitações da medida;
7. o método de avaliação da funcionalidade;
8. acesso, retenção, exclusão e custo de armazenamento.

Se não houver resposta clara a esses itens, a conveniência técnica não é
justificativa para coletar o dado. Autonomia e autorregulação são fenômenos
mais amplos do que cliques observáveis; indicadores simplificados não devem ser
tratados como equivalentes aos construtos ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated)).
