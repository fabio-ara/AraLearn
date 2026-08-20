# Estado de estudo não punitivo

## Problema que o estado de estudo resolve

Para interromper uma Lição durante um deslocamento e retomá-la depois, o
aplicativo precisa lembrar onde continuar, quais Unidades já foram avançadas e
o que a pessoa marcou para rever. O AraLearn chama esse conjunto mínimo de
**estado de estudo**.

Esse estado sustenta a continuidade. Ele não forma boletim, histórico de
navegação nem modelo de proficiência.

## Estado funcional e telemetria

O **estado funcional** permite que uma escolha continue produzindo seu efeito,
como reabrir uma Lição no ponto alcançado. A **telemetria comportamental**
registra eventos para analisar uso, como abertura, duração, repetição ou
sequência temporal de ações.

O AraLearn conserva o estado funcional necessário a Estudo. A plataforma não
coleta uma trilha completa de interação para uso futuro indefinido. Dados
educacionais exigem pergunta explícita, limites de inferência e governança
proporcionais ao risco
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## O que é conservado

| Registro | Finalidade | Unidade | Limite de interpretação |
| --- | --- | --- | --- |
| ponto de continuação | reabrir a Lição na Unidade alcançada | uma posição por Lição | não informa tempo, atenção, dificuldade ou domínio |
| conclusão estrutural | impedir que uma Unidade avançada reapareça como inédita | identidades de Unidades por Lição | não informa acerto, qualidade da resposta, nota ou aprendizagem |
| marca **Rever** | formar a lista pessoal de revisão | presença ou ausência da marca por Unidade | não informa erro, déficit, prioridade docente ou risco |

Observações ficam em Anotações ancoradas próprias. Essa separação permite que o
proprietário faça a triagem do texto enviado sem receber o estado pessoal de
continuidade.

A data de atualização serve para conciliar cópias. Ela não é convertida em
sessão, frequência ou tempo de estudo. O estado pessoal também não guarda cada
abertura, cada envio, respostas anteriores, último resultado, velocidade de
avanço ou comparação entre estudantes.

## Avançar e retomar

Abra Curso, Módulo, Lição, Microssequência e Unidade. Quando houver prática,
responda e use **Continuar** para confirmar; depois, use **Continuar** novamente
para avançar. Uma Unidade apenas expositiva avança no primeiro uso do controle.

O aplicativo registra a identidade da Unidade concluída e o novo ponto de
retomada. A resposta momentânea do componente não é guardada como avaliação.
Sem conexão, a mudança entra na cópia local e aguarda sincronização.

Ao interromper, preserve os dados do aplicativo. Quando a conexão retornar, o
dispositivo envia as operações pendentes e compara a versão remota antes de
concluir a sincronização.

## Marcar para rever

Dentro de uma Unidade, use **Marcar para rever**. O estado pressionado mostra que
a marca está ativa. O mesmo controle a retira.

As marcas formam a seção **Rever** da tela inicial, com o caminho até a Unidade.
Elas pertencem à pessoa e podem ser atualizadas sem conexão. Em dois
dispositivos, deixe ambos sincronizarem antes de alternar repetidamente a mesma
marca.

## Registrar uma observação

Em uma Unidade acessível, abra **Observação**, escolha uma categoria ou **Sem
categoria**, escreva e salve. Podem existir várias Anotações próprias no mesmo
alvo.

A pessoa estudante vê somente os próprios registros. O proprietário recebe a
caixa de entrada necessária à triagem, sem o histórico de navegação do
estudante. Sem conexão, o comando entra numa fila própria e o texto permanece no
dispositivo. Progresso e **Rever** usam outro repositório.

O documento [Observações e Anotações
ancoradas](observacoes-pedagogicas.md) explica respostas, retirada, retenção e
limites.

## Identidades estáveis e reorganização do Curso

Continuidade, **Rever** e Anotações usam identidades de Lição e Unidade. Inserir
uma Unidade no começo da sequência não desloca os vínculos seguintes apenas por
posição. Mover ou renomear um objeto preserva o vínculo quando sua identidade
permanece.

Se o alvo for retirado, o AraLearn não transfere automaticamente a marca ou a
Anotação para uma Unidade de texto parecido. Uma aproximação desse tipo poderia
associar uma dúvida ao lugar errado. Conforme a função, o registro aparece como
indisponível ou deixa de participar da navegação.

## Cópia local e sincronização

No navegador e no Android, **IndexedDB** mantém dados estruturados que sobrevivem
ao fechamento da página. O Supabase conserva a contraparte ligada à conta para
que outro dispositivo possa receber a continuidade.

O estado pessoal envia mudanças delimitadas de progresso ou marcas **Rever**,
em vez de substituir todo o documento a cada ação. Um identificador reconhece a
repetição do mesmo pedido depois de uma falha de rede. As versões impedem que
uma cópia antiga sobrescreva silenciosamente uma mudança mais recente.

Anotações usam cópia e fila próprias. A versão entregue a Estudo é monotônica e
privada por pessoa e Curso: atividade de colegas não aparece como conflito,
invalidação local ou mensagem entre abas. Essa versão coordena a leitura; ela
não contém texto nem amplia permissões.

Contadores técnicos de envio descrevem a entrega de uma operação. Eles não se
tornam indicadores de comportamento de estudo.

## Quem pode acessar

O estado de continuidade e **Rever** pertence à conta e só pode ser lido pela
própria pessoa. Cada estudante também lê somente suas Anotações. O proprietário
recebe a caixa de entrada do Curso, sem tempo de estudo, quantidade de respostas,
respostas anteriores ou classificação individual de desempenho.

Uma síntese da caixa de entrada ajuda a localizar alvos com registros abertos.
Ela descreve a fila de trabalho e não mede estudantes, turmas, aprendizagem ou
qualidade docente.

## Regra para admitir um novo indicador

Antes de criar um indicador educacional, é preciso documentar:

1. a pergunta educacional;
2. o construto teórico e sua definição;
3. a unidade de análise e a agregação;
4. a decisão apoiada e quem responde por ela;
5. as inferências vedadas;
6. a validade e as limitações da medida;
7. o método de avaliação;
8. acesso, retenção, exclusão e custo de armazenamento.

Sem essas respostas, a conveniência técnica não justifica a coleta. Autonomia e
autorregulação são fenômenos mais amplos do que cliques observáveis; um
indicador simplificado não equivale ao construto
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated);
[Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated)).
