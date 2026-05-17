# Assistência por IA

## O lugar da IA no AraLearn

O AraLearn não foi concebido como chat educacional que, por acaso, exporta flashcards. A IA entra no produto como parte de uma arquitetura mais ampla de organização didática, materialização localizada e continuidade do estudo.

Isso muda a questão principal. O problema já não é apenas escolher o modelo mais fluente, mas organizar a tarefa de modo que a saída seja útil dentro de uma trilha persistente, editável e auditável.

## O que a IA faz no app

Hoje a IA é usada principalmente para:

- organizar material amplo em cursos, módulos, lições e microssequências;
- materializar conteúdo dentro de uma microssequência planejada;
- corrigir, expandir ou reformular conteúdo já existente;
- continuar a trilha sem perder o contexto do percurso.

O valor do produto não está, portanto, em “gerar tudo”, mas em saber onde, quando e como gerar.

## Fluxo estruturado em vez de pedido solto

Boa parte da proposta do AraLearn está em não depender apenas de prompt livre. O app tenta estruturar a tarefa antes de pedir texto ao modelo.

No fluxo estrutural, isso passa por ingestão de fontes, organização do material, distribuição de contexto, contratos, auditoria e aplicação por patch. No fluxo local, passa por escopo menor, reuso da trilha já planejada, intervenção situada e edição mínima sempre que possível.

Essa decomposição dialoga com discussões recentes sobre specification-driven development: em vez de uma conversa única e indiferenciada, o sistema conduz uma sequência de fases mais delimitadas.

## Pipeline, orçamento de tokens e divisão da tarefa

O AraLearn também trata a administração de contexto e de orçamento como parte da arquitetura, não como detalhe invisível.

O produto divide trabalho entre parsing, artefatos intermediários, fases do pipeline e chamadas a modelos. Isso ajuda a:

- evitar enviar material bruto demais de uma só vez;
- usar melhor o contexto realmente necessário;
- separar tarefas que podem ser resolvidas localmente das que precisam de modelo;
- reduzir custo e ruído na geração.

Em outras palavras, o app não tenta compensar tudo com uma prompt gigante. Ele busca decompor a tarefa para que o modelo trabalhe melhor e para que o usuário mantenha mais controle sobre o percurso.

## É RAG?

Há no produto elementos que lembram RAG, porque o app ingere fontes, preserva texto útil, sintetiza trechos relevantes e recupera partes do material durante a geração.

Mesmo assim, descrever o AraLearn simplesmente como sistema RAG seria insuficiente. O núcleo do produto não é responder perguntas sobre documentos, mas transformar material e intenção de estudo em trilha editável e, depois, intervir localmente nessa trilha. Há grounding e recuperação localizada, mas dentro de uma arquitetura mais ampla de autoria e organização didática.

## Linguagem autoral e modelos de linguagem

Uma das razões pelas quais o app funciona bem com assistência estruturada é sua linguagem autoral simples. O conteúdo não precisa existir apenas como texto corrido. Ele pode ser representado em JSON por estruturas que continuam inteligíveis para pessoas e também úteis para modelos.

Isso melhora a colaboração entre autoria humana e geração algorítmica. O modelo não precisa inventar a interface final; ele trabalha sobre uma representação intermediária que o runtime do produto sabe interpretar e renderizar.

## Autoria legítima e parametrização

O AraLearn procura preservar autoria real, inclusive para usuários mais experientes, como professores, autores de curso ou pesquisadores.

Além de revisar o resultado, o usuário pode interferir em escopo, provider, modelo, parâmetros, orientação da lição e outros campos de configuração. Isso não transforma o produto em ferramenta só para especialistas, mas impede que ele reduza a experiência a uma obediência passiva ao que o modelo devolve.

## Operação local e limite prático

Sem conexão, o app continua útil para estudo, navegação e revisão do que já está salvo localmente. Já as operações criativas que dependem de modelo remoto continuam condicionadas ao provider disponível.

Esse limite é importante e deve ser dito com clareza. Ao mesmo tempo, ele não diminui a proposta do AraLearn: a continuidade local do estudo já é parte relevante do produto, não mero efeito colateral da implementação.
