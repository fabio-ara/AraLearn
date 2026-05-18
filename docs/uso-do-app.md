# Guia de uso do app

## Organização

O AraLearn organiza o estudo em cinco níveis:

```text
curso -> módulo -> lição -> microssequência -> card
```

O curso e o módulo organizam o campo geral. A lição governa o recorte didático. A microssequência é a etapa de estudo. O card é a interação concreta.

## Gerar estrutura

O fluxo top-down começa no painel `Gerar estrutura`.

O usuário informa uma intenção e, quando necessário, anexa fontes. O motor prepara a entrada, escolhe o escopo e pede à IA uma estrutura planejada. O resultado esperado é uma trilha navegável até microssequências, não uma coleção completa de cards.

Durante a geração, o app mostra um popup curto com as fases do motor. Fases locais, como ingestão, validação e aplicação do patch, aparecem separadas das chamadas ao modelo. Quando houver uso de API ou Codex local, o popup indica a chamada ao modelo naquela fase.

Uma geração top-down boa deixa claro:

- quais cursos, módulos e lições existem;
- que microssequências pertencem a cada lição;
- que etapa vem antes e depois;
- quais microssequências ainda estão vazias;
- que contexto semântico interno governa a lição.

## Abrir uma microssequência vazia

Uma microssequência vazia não é erro. Ela é uma etapa planejada que ainda não virou cards.

O usuário abre essa etapa e usa a segunda aba para pedir a materialização. Esse pedido é bottom-up: parte da microssequência atual, usa a lição como contexto e deve gerar cards apenas para aquela etapa.

## Aba de edição no runtime

A aba de edição da microssequência comum mostra só os parâmetros necessários para o pedido:

- pedido em linguagem natural;
- ação;
- tags;
- materialização preferida;
- anexos;
- modelo e envio.

As ações principais são:

- `Continuar na microssequência`: cria os primeiros cards se a microssequência estiver vazia ou cria mais cards se ela já tiver conteúdo.
- `Corrigir microssequência`: pede uma correção local dos cards e da progressão da etapa.
- `Ir a nova microssequência`: abre a próxima microssequência planejada pelo top-down, quando ela existe.
- `Criar nova microssequência`: pede uma etapa extra depois da atual, útil quando falta um degrau intermediário.

`Ir a nova microssequência` é navegação. `Criar nova microssequência` é geração por IA.

## Estudar e revisar

Na primeira aba, o usuário estuda os cards. Na segunda, intervém sobre a microssequência.

O ciclo comum é:

1. abrir microssequência planejada;
2. pedir cards;
3. estudar;
4. corrigir se algo ficou ruim;
5. continuar se faltou conteúdo;
6. avançar para a próxima microssequência planejada.

## Tags

As tags visíveis na aba de edição ancoram o pedido. Elas indicam referências locais da microssequência e ajudam o motor a selecionar contexto relevante.

O usuário não precisa editar conceitos internos. As tags são a forma simples de controlar ancoragem sem expor a camada semântica completa.

## Materialização preferida

Materialização preferida indica o formato desejado dos cards, como automático, parágrafo, pergunta, código, tabela, árvore, fluxograma, plano cartesiano ou matriz.

Essa escolha não substitui a validação didática. Ela orienta o motor quando o formato escolhido ainda faz sentido para o conteúdo.

## Anexos

Anexos podem complementar o pedido. Eles são ingeridos antes da chamada de IA e entram como fonte ou contexto, conforme o fluxo.

Anexos não devem ser tratados como ordem para copiar documento. O objetivo é transformar material em estudo situado.

## Uso sem conexão

Projetos e cards já salvos ficam no dispositivo. Navegação, estudo e revisão de conteúdo existente não dependem de conexão contínua.

Geração por IA remota exige internet. Provedor local exige configuração local.
