# Criar e revisar cursos por conversa

Uma conversa pode ajudar a transformar materiais em curso e a discutir mudanças no que já foi produzido. O assistente trabalha fora do AraLearn; o aplicativo conserva o mapa, as explicações, as unidades e as fontes que você poderá inspecionar. Também é possível editar diretamente no aplicativo.

Para consultar ou alterar um curso, a conversa precisa de uma conexão autorizada. O [Model Context Protocol (MCP)](autoria-mcp.md) permite que um cliente compatível descubra e utilize as tarefas disponíveis. O outro canal usa operações descritas em [OpenAPI](autoria-actions.md), um formato de descrição de serviços, oferecidas atualmente por Actions. Os respectivos guias explicam a configuração. A disponibilidade em outro cliente depende dos recursos e da autenticação que ele oferece.

## Comece pelo contexto que muda o desenho

Um pedido útil informa quem aprenderá, o objetivo, os conhecimentos prévios e o assunto a cobrir. Por exemplo:

> Quero criar um curso privado sobre comunicação em redes para adultos que usam computador, mas nunca estudaram redes. Ao final, devem explicar como uma mensagem sai de um notebook e chega a um serviço. Quero começar pelas situações concretas e ensinar a terminologia necessária. Prepare uma proposta de organização para eu conferir no aplicativo antes de produzir as unidades.

Se houver uma ementa ou outro material obrigatório, acrescente-o e diga seu papel: delimitar o assunto, fundamentar as explicações ou oferecer exemplos de avaliação. As [diferenças entre esses usos das fontes](fontes-e-citacoes.md) ajudam a evitar que um material de escopo seja tratado como autoridade sobre qualquer afirmação.

Informe também restrições que mudem o trabalho, como acessibilidade, idioma ou uma condição de pesquisa. O público descrito é o do curso; ele não determina o conhecimento da pessoa autora.

As [preferências de autoria](configuracoes.md#preferências-pessoais) podem orientar o trabalho habitual. **Conteúdo** desenvolve explicações e fontes; **Ciclo completo** inclui também desenho e unidades. Você pode combinar até onde o assistente continuará e em quais pontos deseja examinar propostas ou resultados. Alterar seu padrão pessoal não modifica retroativamente cursos ou trabalhos já combinados.

## Desenvolva o mapa e as bases explicativas

O assistente propõe um mapa curricular: módulos, lições e microssequências, pequenos percursos com objetivos próprios. O [guia da pessoa autora](guia-professor-autor.md#aprovar-o-mapa-curricular) explica como avaliar sua organização.

Um trecho ilustrativo da proposta poderia ter esta organização. Os itens abaixo de cada lição são microssequências; o restante do curso ainda precisaria aparecer no mapa completo.

> Módulo 1 — Acompanhar uma comunicação \
> Lição 1 — Meios, mensagens e participantes \
> • Meios pelos quais uma mensagem pode passar \
> • Quem envia e quem recebe uma mensagem \
> Lição 2 — Do pedido à resposta \
> • O pedido de uma informação a um serviço \
> • A inversão dos papéis na resposta

Abra o link para **Planejamento** e confira a proposta completa. Não é preciso julgar o mapa apenas pela síntese da conversa. Você pode pedir uma mudança localizada:

> Na primeira lição, quero distinguir mensagem, origem e destino antes de apresentar os meios de transmissão. Na segunda, use o mesmo caso de comunicação para desenvolver a inversão dos papéis na resposta. Preserve os demais assuntos e me mostre o mapa atualizado.

Volte ao aplicativo e confira se a mudança corresponde ao pedido. Quando aprovar o mapa, a decisão se refere à versão salva que você examinou. Ela não aprova automaticamente explicações e atividades futuras.

A explicação desenvolve o conteúdo de uma microssequência e suas fontes. Pode ser produzida antes das unidades, inclusive enquanto o mapa ainda está em rascunho. Um pedido como “desenvolva primeiro a explicação sobre origem, destino e mensagem, com as fontes que sustentam cada relação” permite trabalhar a base antes de decidir sua apresentação em unidades. Veja [Explicação e revisão humana](explicacao-e-revisao-humana.md).

## Produza em lotes manejáveis

Quando o trabalho inclui unidades, a produção é organizada em partes. Cada parte reúne um conjunto de microssequências para uma etapa de autoria; mudar seus limites não muda os módulos e as lições.

Combine um recorte que consiga inspecionar. No exemplo anterior, a primeira parte poderia cobrir apenas a comunicação entre dois dispositivos e a inversão dos papéis na resposta. Antes da produção, peça uma progressão curta:

> Para esta parte, proponha como alternar explicação e prática. Quero começar por uma mensagem concreta, identificar quem envia e quem recebe e terminar com outro caso. Não crie uma tela para cada frase.

Examine a proposta e ajuste o que altera a experiência de estudo. Se estiver adequada, autorize a produção daquele recorte. Uma autorização de continuidade também pode permitir avançar entre partes, respeitando os limites e os pontos de inspeção combinados; não é preciso repetir a mesma decisão em cada mensagem.

Depois da produção, abra o conteúdo salvo. Confira o resultado efetivo, inclusive respostas e fontes, antes de declarar sua revisão. Se uma etapa não terminou, a retomada deve continuar o trabalho pendente a partir do estado do curso.

## Preserve um repertório de conhecimentos

Peça que a sequência considere o que já foi ensinado. “Explique isso para iniciantes” é menos preciso que apontar uma lacuna: “A unidade usa a palavra interface antes de mostrar o ponto de conexão do dispositivo; desenvolva essa relação antes da atividade”.

O AraLearn registra ideias introduzidas, utilizadas e retomadas ao longo do percurso. Esse repertório ajuda a examinar a progressão, como explica o [guia da pessoa autora](guia-professor-autor.md#acompanhar-ideias-ao-longo-do-percurso). Sua conferência deve considerar o texto, não apenas as declarações registradas.

## Produza um percurso suficiente para o objetivo

Se o resultado ficou denso, indique qual relação exige desenvolvimento. Se ficou fragmentado, identifique os trechos que só fazem sentido juntos. Um pedido pode conservar o conteúdo e mudar sua distribuição:

> As duas primeiras unidades apresentam partes do mesmo exemplo. Reúna o desenvolvimento desse exemplo numa única unidade e mantenha uma atividade depois dela. Preserve as fontes e o objetivo.

Os [critérios de suficiência e progressão](guia-professor-autor.md#produzir-unidades-coerentes) orientam essa inspeção. Um alvo de palavras ajuda a ajustar extensão; não substitui o julgamento sobre o que precisa ser ensinado.

## Escolha representações pela função

Explique o que deseja tornar visível: comparar estados, seguir um percurso ou justificar uma escolha. Por exemplo, “uma tabela deve permitir comparar quem envia e quem recebe no pedido e na resposta” é um pedido de função, não apenas de variedade visual.

O assistente pode escolher entre os [componentes didáticos](componentes-didaticos.md) disponíveis. Confira na prévia se a representação realiza a comparação pretendida e se o texto ensina a lê-la.

## Trate prática como parte da aprendizagem

Ao pedir uma atividade, informe o que a pessoa deverá fazer com o conhecimento. Identificar a origem de uma mensagem, prever o destinatário e explicar por que os papéis mudam são tarefas diferentes.

Peça que o retorno da resposta desenvolva o raciocínio necessário. Depois, confira se a atividade pode ser resolvida com o que o percurso já ensinou. O [guia autoral](guia-professor-autor.md#escolher-componentes-e-prática) relaciona essas escolhas ao desenho do curso.

## Use fontes segundo seu papel

Ao enviar um PDF, diga se quer que seja guardado como fonte do curso. Um arquivo presente na conversa não substitui uma fonte salva e recuperável em outra sessão. Para uma referência já cadastrada, peça a consulta pelo título e confira o material e o trecho utilizado.

Quando uma afirmação estiver duvidosa, peça a conferência da relação: “Leia o trecho indicado e mostre como ele sustenta esta explicação”. O cadastro bibliográfico ajuda a localizar a obra; a revisão depende de examinar o que foi efetivamente lido e usado.

## Revise como estudante

Percorra o conteúdo na ordem e consulte a explicação compartilhada quando precisar. O [roteiro de inspeção autoral](guia-professor-autor.md#revisar-como-estudante) ajuda a conferir conhecimentos prévios, transições, exemplos e prática.

Ao encontrar um problema, descreva o efeito sobre a compreensão e delimite o que deve ser preservado. “Não entendi por que a resposta inverte os papéis; desenvolva essa relação e preserve a atividade e as fontes” oferece uma direção mais clara que “melhore o texto”.

## Retome e revise depois

Em uma conversa nova, peça ao assistente que localize o curso e leia o estado salvo. A continuidade depende desse registro, não de reconstruir todo o trabalho pelo resumo de uma conversa anterior.

Você pode levar uma referência direta do ponto em exame. Na Autoria, o controle chamado atualmente **Debater com GPT** copia esse pedido; cole-o na conversa conectada. O nome do controle não significa que a conversa esteja dentro do AraLearn. Peça a leitura da explicação ou unidade, das observações e das fontes pertinentes antes da proposta.

Uma correção deve identificar o que será alterado e os pontos usados apenas como contexto. Depois da autorização, volte ao curso para conferir o resultado. As observações efetivamente atendidas são tratadas após a confirmação da gravação; as vagas, parcialmente atendidas ou editadas depois da preparação continuam pendentes, conforme o [fluxo de observações](observacoes-pedagogicas.md#da-observação-à-revisão).

Se a resposta se perder depois de uma alteração, peça a conferência da mesma tentativa antes de repetir o pedido. O assistente precisa distinguir o que foi salvo do que ainda está pendente. [Solução de problemas](solucao-de-problemas.md) apresenta a recuperação e encaminha aos detalhes dos canais.

Salvar uma correção não declara revisão humana. Quando tiver inspecionado uma explicação ou unidade, você poderá marcar sua revisão no aplicativo ou pedir expressamente que a decisão seja registrada pelo canal conectado. A marca se refere àquele conteúdo salvo e pode ficar desatualizada depois de mudanças relevantes.
