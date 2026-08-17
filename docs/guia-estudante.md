# Guia do estudante

Este guia ensina o percurso de Estudo implementado no código corrente. O Curso
pode pertencer à própria pessoa ou ter sido compartilhado diretamente pelo
proprietário; a experiência de estudo é a mesma nos dois casos.

## Compreender a tela inicial

A Home de **Estudo** mostra diretamente os Cursos acessíveis. Cada cartão
apresenta:

- título e objetivo;
- progresso em Unidades concluídas;
- quantidade de Módulos e Lições;
- um ícone que distingue Curso próprio de Curso compartilhado;
- o botão de abrir.

A lista começa por descritores pequenos. A composição completa de um Curso é
carregada quando ele é aberto. Por isso, um Curso novo pode exigir conexão na
primeira abertura mesmo que a Home já mostre seu nome.

Acima da lista pode aparecer **Rever**, com as Unidades marcadas. O botão de
Autoria leva à atividade autoral, mas Cursos compartilhados não aparecem lá:
acesso direto concede Estudo, não edição.

## Preparar o dispositivo

1. Entre na conta correta.
2. Com conexão disponível, abra cada Curso que pretende usar offline.
3. Aguarde o conteúdo aparecer antes de sair da rede.
4. Abra **Conta e aparência** para escolher tema, conferir o perfil ou sair.

O AraLearn mantém no IndexedDB a lista conhecida, os Cursos abertos e o estado
pessoal. Limpar dados do navegador, reinstalar o aplicativo ou excluir o
armazenamento do site pode remover a réplica ainda não sincronizada.

## Iniciar ou retomar uma sessão de estudo

1. Na Home, escolha **Abrir Curso**.
2. Abra um Módulo.
3. Abra uma Lição.
4. Abra uma Microssequência didática.
5. Examine a lista de Unidades ou comece pela primeira.

Os cartões de navegação mostram progresso em cada nível. Dentro da Unidade, a
barra superior informa o contexto, a barra fina mostra a posição na
Microssequência e a contagem indica a Unidade corrente.

Ao avançar, a Unidade é marcada como concluída. O cursor da Lição permite
retomar o ponto alcançado. Se a conexão estiver ausente, a alteração fica
pendente e é enviada quando possível.

## Responder a uma prática

A forma de resposta depende do componente didático. O runtime corrente inclui,
entre outras, seleção de alternativa, preenchimento de lacuna e ordenação.

1. Leia a explicação e a tarefa inteira.
2. Informe a resposta no próprio componente.
3. Use **Continuar**.
4. Se a resposta estiver incompleta, complete os campos indicados.
5. Quando houver feedback, leia-o e use **Continuar** novamente.

Uma resposta incorreta não produz nota global nem bloqueio do Curso. A
interface oferece nova tentativa ou exibição da resposta quando o contrato do
componente prevê essas ações.

## Marcar para rever

Na Unidade, use o ícone **Marcar para rever**. O estado pressionado indica que a
marca está ativa.

As Unidades marcadas aparecem na seção **Rever** da Home. Cada item conserva o
caminho exato até Curso, Módulo, Lição, Microssequência e Unidade. Abrir o item
carrega o Curso se necessário e leva diretamente ao alvo. Toque novamente no
ícone para retirar a marca.

Marcar para rever é uma decisão pessoal. Ela não altera o conteúdo e não é
visível como marca de outra pessoa.

## Registrar uma observação

Use o ícone **Observação** na Unidade. Escolha uma categoria:

- Dúvida;
- Possível erro;
- Confuso;
- Sugestão;
- Observação.

Escreva até 1.000 caracteres e salve. O ícone passa a indicar que existe uma
observação. Abra novamente para alterar ou retirar o texto.

A observação fica ancorada à Unidade e faz parte do estado pessoal. Nesta
revisão, ela persiste local e remotamente, mas ainda não existe a nova fila
autoral que reúna observação, decisão, correção e verificação. Portanto, não se
deve interpretar o salvamento como garantia de que o conteúdo já entrou em
auditoria.

## Interromper com segurança

É seguro voltar pelos níveis ou fechar o aplicativo depois que a ação aparece
na interface. Sem conexão, o estado pode continuar pendente no dispositivo.
Evite limpar dados, trocar de navegador ou desinstalar antes de reconectar se
houver progresso ou observações recentes importantes.

Conflitos entre dois dispositivos são resolvidos pelo repositório de estado
pessoal com revisão remota e reconciliação determinística. Se o Curso deixar de
estar acessível, a sincronização falha fechada em vez de continuar escrevendo
sem autorização.

## Zerar o progresso de um Curso

Quando um Curso possui progresso, a Home mostra **Zerar progresso do Curso**.
Essa ação:

1. pede confirmação com o título do Curso;
2. limpa somente o progresso daquele Curso;
3. não remove o Curso;
4. não apaga progresso de outros Cursos;
5. não altera o conteúdo canônico.

Marcas e observações são estados distintos; não presuma que “zerar progresso”
seja uma exclusão geral dos dados pessoais.

## Quando editar

Estudo não altera título, estrutura ou conteúdo do Curso. Se o Curso for seu,
abra **Autoria** para inspecionar ou editar. Se for compartilhado, registre uma
observação situada e converse com o proprietário pelos canais disponíveis.

## Limites do estado de estudo

O AraLearn conserva o necessário para continuidade: progresso, cursor, marcas
e observações. Esses registros não devem ser tratados automaticamente como:

- atenção;
- engajamento;
- domínio do conteúdo;
- resultado de aprendizagem;
- desempenho comparável entre pessoas.

Qualquer uso em pesquisa precisa definir construto, unidade de análise,
instrumento, procedimento, ausências e limites de interpretação. Veja
[Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) e o
[glossário de construtos](glossario-construtos.md).
