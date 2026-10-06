# Verificação da interface

Uma tela pode parecer correta e ainda salvar o dado errado, perder o foco ou oferecer
uma ação que o servidor recusará. Por isso, a verificação acompanha o percurso inteiro:
o que a pessoa faz, a resposta visível e o efeito salvo. A
[matriz técnica](matriz-conformidade-tecnica.md) indica os testes disponíveis para
cada capacidade.

## O que precisa ser demonstrado

Um percurso de uso reúne ações com uma finalidade, como abrir um curso, consultar
sua explicação e voltar à atividade. A verificação confere tanto o resultado
percebido pela pessoa quanto o que foi salvo.

Em cada percurso, registre o estado inicial, execute as ações e confirme o efeito
onde o dado é conservado. O servidor mantém a versão compartilhada do curso e
verifica as permissões; o dispositivo guarda rascunhos, posição e filas locais.
A [persistência](persistencia-relacional.md) explica essa divisão.

O curso se organiza em níveis. Dentro de uma lição, a **microssequência didática**
reúne unidades de estudo que desenvolvem um objetivo delimitado. Essa organização,
descrita no [modelo didático](modelo-didatico.md), orienta os percursos de estudo e
de autoria examinados a seguir.

Em **Estudo**:

1. abra a entrada de estudo e escolha o curso;
2. percorra módulo, lição e microssequência;
3. abra uma unidade e retorne pelos mesmos níveis.

Confirme que **Voltar** restaura a origem real, a rolagem e o foco, e que o controle
**Home** oferece a saída global preservando o histórico. Examine também as ações
contextuais de acesso ao nível acima. Na unidade, **Visualizar**, **Editar** e
**Assistência por IA** atuam sobre o mesmo conteúdo. A troca entre esses modos deve
preservar a posição dos elementos cuja função permanece igual. Verifique a atividade,
do preenchimento ao retorno, e as ações de consulta às fontes, registro de
observações, marcação para rever, zeragem de progresso e retomada.

Em **Autoria**, abra o curso diretamente em **Conteúdo**. Confirme que o leitor
apresenta uma unidade de estudo por vez e que índice, pesquisa, endereços diretos,
anterior e próxima permitem chegar também a unidades antigas sem apresentar todo o
curso simultaneamente.

Abra a visão múltipla sem selecionar nenhum alvo. Selecione unidades separadamente
para uma observação em lote e limpe a seleção sem recolher a leitura. Abra e edite
uma unidade de página posterior por seus próprios comandos. Verifique a preservação
do rascunho e a retomada de um envio parcial.

**Materializar** é transformar um desenho autorizado em unidades de estudo salvas.
A produção pode ser organizada em partes e lotes, conjuntos de trabalho que
preservam a estrutura curricular. A [autoria contextual](autoria-contextual.md)
explica como delimitar e acompanhar esses conjuntos.

Em **Planejamento**, comece com um curso descartável ainda sem conteúdo e confirme,
nesta ordem:

1. o mapa curricular completo apresenta módulos, lições e microssequências;
2. a cobertura relaciona todo item obrigatório aos pontos previstos do mapa;
3. no fluxo padrão, a produção aguarda a aprovação do mapa;
4. a aprovação se refere exatamente ao mapa que estava disponível para inspeção;
5. lotes de produção aparecem depois e separados da hierarquia curricular;
6. mudar os limites de um lote preserva a organização curricular;
7. após a produção, a cobertura mostra também as unidades em que o item foi
   desenvolvido.

Exercite também a autorização expressa de produção autônoma: o mapa precisa existir,
e a produção pode prosseguir mantendo-o em rascunho. Confira separadamente o estado do
mapa e as declarações de revisão do conteúdo. O teste deve permitir reconhecer quem
tomou cada decisão.

Materialize ao menos duas partes. Percorra o conteúdo real na ordem e abra os detalhes
de desenho. Quando existirem, confira os rótulos **Ideias introduzidas aqui**,
**Ideias já estabelecidas usadas aqui** e **Ideias retomadas**. A apresentação usual
deve empregar os nomes destinados à pessoa autora, conservando identificadores e
nomes de campos nas referências técnicas. As contagens descrevem o conteúdo
registrado; sua adequação pedagógica exige inspecionar o percurso.

No mapa, teste a seta isoladamente, abra objetivos longos e siga vínculos da
cobertura, retornando ao mesmo ramo, posição e foco. Em **Parâmetros**, percorra os
recortes da hierarquia, do curso à unidade de estudo, incluindo um rascunho ainda
não salvo e valores automáticos, fixos ou herdados. Nos painéis de observações,
confira leitura sem edição, alteração do texto, fechamento e retomada. Campo,
controle de envio e foco devem permanecer visíveis quando um aviso aparece.

Registre uma observação numa unidade e outra em várias unidades, peça revisão, aplique
uma proposta aprovada e inspecione novamente o conjunto afetado. Abra **Dados de
autoria**, escolha dimensões e recortes diferentes e confira que os números coincidem
com a análise incluída em **Exportar curso e análise**. Esse arquivo também contém o
documento integral do curso. Inclua criação, edição e exclusão segura do curso
descartável.

A conversa deve acompanhar as decisões da pessoa autora: a inspeção do mapa prepara
a produção do lote, e a leitura do resultado orienta os ajustes seguintes. Sua
extensão respeita a preferência de diálogo e o que for necessário para decidir.
A explicação didática recebe o desenvolvimento exigido pelo objetivo do curso,
independentemente da concisão solicitada para a conversa.

A **Assistência por IA** permite conversar antes de preparar uma mudança. Exercite a
conversa em vários turnos, solicite **Preparar prévia** e confira a proposta concreta
na apresentação dos componentes. Verifique a descoberta de componentes quando
necessária e o aceite explícito. **Aplicar ao rascunho** leva a proposta à edição;
**Salvar proposta** confirma a gravação. Recusar a proposta preserva o conteúdo corrente.

## Pareceres de IA e decisão humana

Abra a revisão da explicação e de uma unidade que tenha prática. Confira se o parecer
apresenta sua atualidade, o resultado, os critérios e as pendências correspondentes.
Atualidade informa se a base examinada corresponde ao conteúdo de hoje. Assim, um
parecer `current` pode ter resultado `needs_attention`: a base está atual, mas o
julgamento aponta problemas que precisam continuar visíveis. A marca de revisão
humana conserva seus próprios comandos de declaração e retirada. O
[processo de revisão](auditoria-de-conformidade-instrucional.md) desenvolve essas
distinções.

Num curso descartável, altere a ordem ou o conteúdo de uma unidade e releia a
microssequência inteira. Confira quais bases e pareceres mudaram e se a interface
preserva os demais. Se uma resposta de gravação se perder, retome o mesmo pedido e
compare o resultado recuperado com a situação atual. A declaração humana exige que
a pessoa possa inspecionar a base a que sua decisão será vinculada.

## Revisão do percurso materializado

Leia uma microssequência inteira assumindo somente os pré-requisitos declarados.
Confira se cada etapa oferece os conhecimentos necessários à tarefa. Uma prática de
aplicação utiliza relações já ensinadas; uma tentativa exploratória pode anteceder
esse ensino, desde que o enunciado seja compreensível e a sequência desenvolva
depois o conteúdo explorado. Examine também a continuidade entre unidades,
explicação e retorno.

Procure os dois extremos: uma unidade densa que apenas enumera conceitos e uma
sequência fragmentada em telas sem progressão perceptível. Quando esses problemas
ocorrerem, registre qual relação exige dividir a unidade ou reunir os fragmentos.
A escolha e a quantidade de exemplos seguem essa necessidade. Os componentes devem
tornar observável a relação pertinente à tarefa.

## Tamanhos e temas

Use 360, 390 e 430 pixels como larguras de telefone e uma largura de computador
representativa. Em cada tamanho, observe:

- área segura e controles alcançáveis;
- ausência de rolagem horizontal global;
- alinhamento da coluna e dos controles;
- textos extensos sem truncamento de sentido;
- foco depois de abrir, fechar, voltar e falhar;
- geometria estável ao trocar modo, selecionar, validar ou editar;
- folhas sobrepostas e diálogos com dimensões estáveis e conteúdo variável rolando internamente;
- menus e sobreposições fechando por ação explícita, clique externo e `Esc`;
- temas claro e escuro quando a superfície os oferece;
- console sem erro relacionado ao percurso.

**Estudo** permanece a referência visual. Em telas largas, a interface conserva a
mesma organização de navegação e mantém o conteúdo na coluna principal. O
[sistema visual](sistema-visual.md) especifica a composição e suas adaptações.

## Dados e autorização

Use somente identidades e sessões de teste autorizadas. Confira se a interface
oferece manutenção e edição a quem possui as permissões correspondentes. Verifique
também a recusa do servidor quando uma identidade sem permissão envia esses pedidos
diretamente. A [segurança em nível de
linha](supabase.md#postgresql-esquemas-e-autorização) verifica o acesso aos registros
do banco. A comparação de revisões e a validação da operação completam a proteção
das gravações.

Para ações destrutivas, crie dados descartáveis e confira o alvo no diálogo. As ações
**Excluir este curso**, **Sair deste curso**, **Remover dados deste dispositivo**,
**Sair** e **Excluir conta** têm efeitos próprios. Verifique cada uma conforme o
[guia de uso](uso-do-app.md), incluindo o que deve ser removido e o que deve permanecer.

## Automação e Chrome

Os testes de execução exercitam contratos e estados de erro.
[Playwright](https://playwright.dev/docs/intro), ferramenta que controla o navegador
automaticamente, repete interações e tamanhos de tela de forma previsível. Uma rodada
manual no Chrome complementa essa verificação ao observar a aplicação publicada,
com sessão autenticada, foco, console e comportamento real das sobreposições.

Execute as verificações da área alterada e a preparação da candidata:

```bash
npm run validate:candidate -- --base origin/main --plan
npm run validate:candidate -- --base origin/main
```

O primeiro comando mostra as verificações selecionadas; o segundo executa essa
seleção. Mudanças de comportamento precisam dos testes e percursos correspondentes.
A validação final e a publicação seguem o [guia do
desenvolvedor](guia-desenvolvedor.md#testes-e-integração) e o procedimento de
[implantação](implantacao.md).

Uma falha pertinente impede considerar a revisão aprovada. Corrija a causa, repita o
menor recorte afetado e então retome o conjunto de verificações exigido para a mudança.

## Limite da evidência

Apresentar o conteúdo, salvar os dados e responder corretamente às ações são
propriedades técnicas verificáveis. Avaliar a compreensão, a acessibilidade vivida
e os efeitos sobre a aprendizagem exige participantes, tarefas, instrumentos e
análise adequados; consulte o [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).
