# Assistência por IA

## Papel da IA no AraLearn

A IA no AraLearn não ocupa o lugar de professor, autor ou autoridade final. Ela atua como colaboradora em tarefas que costumam gerar atrito: organizar material, propor etapas, transformar fonte em prática, reformular cards e continuar uma trilha já iniciada.

O produto não foi concebido como chat educacional que depois exporta flashcards. A IA trabalha dentro de uma arquitetura de estudo.

## O que a IA faz

A assistência pode atuar em quatro frentes principais:

- organizar materiais em cursos, módulos, lições e microssequências;
- materializar cards dentro de uma microssequência planejada;
- corrigir, expandir ou reformular conteúdo existente;
- ajudar a continuar uma trilha sem perder o contexto.

O valor está menos em “gerar conteúdo” e mais em gerar no lugar certo, com escopo claro e possibilidade de revisão.

## O que a IA não deveria fazer sozinha

A IA não deve:

- decidir a estrutura inteira sem possibilidade de edição;
- substituir a revisão do usuário;
- inserir conteúdo fora do escopo da lição;
- transformar fonte em resumo passivo;
- produzir volume que o usuário não consegue inspecionar;
- esconder incerteza ou origem do material;
- corromper o projeto quando uma resposta vem malformada.

Esses limites orientam o desenho do app.

## Estrutura antes do pedido

Antes de acionar o modelo, o AraLearn procura preparar a tarefa.

Isso pode incluir:

- selecionar o ponto da árvore em que a intervenção acontece;
- extrair texto de fontes;
- resumir ou recortar contexto;
- enviar orientação da lição;
- limitar recursos aceitos;
- pedir saída em contrato público;
- validar e reparar a resposta;
- aplicar a mudança de forma controlada.

Essa forma de trabalho reduz o peso do prompt livre e aumenta a capacidade de revisão.

## Geração estrutural

Na geração estrutural, a IA ajuda a transformar material amplo em percurso. Ela pode propor cursos, módulos, lições e microssequências planejadas.

A geração estrutural não precisa criar todos os cards. Em muitos casos, o resultado mais útil é uma árvore revisável: o usuário vê o caminho, corrige o que for necessário e materializa etapas depois.

## Materialização local

Na materialização local, o usuário já está em uma microssequência. A tarefa é mais delimitada: produzir cards para aquela etapa, respeitando a lição, os recursos aceitos e o que já existe no percurso.

Esse fluxo evita que uma intervenção pequena se torne replanejamento completo do curso.

## Correção e reformulação

A IA também pode ajudar a corrigir material ruim, expandir uma explicação insuficiente, alterar o tipo de prática ou adaptar a sequência a uma dificuldade do usuário.

Mesmo nesses casos, a alteração precisa permanecer visível e editável. O usuário não deve perder a capacidade de comparar, recusar ou reescrever.

## Fontes e ancoragem

Quando o usuário fornece fontes, a IA deve trabalhar com elas como apoio, não como material a ser simplesmente comprimido.

O objetivo é converter fonte em percurso: conceitos, relações, exemplos, procedimentos, erros frequentes e prática. Sempre que possível, a origem do conteúdo deve permanecer rastreável.

## Custos e limites

Modelos de IA têm limites de contexto, custo, disponibilidade e qualidade. Por isso, o AraLearn não deve depender de uma única chamada nem de uma única plataforma.

A arquitetura favorece tarefas delimitadas, contratos explícitos e provedores substituíveis. Isso permite usar modelos mais baratos ou locais em parte dos fluxos, desde que a validação do produto continue ativa.

## Autoria humana

A assistência por IA só faz sentido no AraLearn se o usuário continua capaz de intervir.

O usuário pode revisar a estrutura, ajustar a orientação da lição, editar cards, escolher outro modelo, alterar parâmetros e reorganizar o percurso. A IA reduz esforço operacional; a autoria permanece humana.
