# Assistência por IA generativa

## A posição do produto

O AraLearn usa inteligência artificial como infraestrutura de organização e resposta localizada, não como autoridade didática final. A pergunta central do projeto não é apenas “qual modelo responde melhor?”, mas “como organizar a tarefa para que o resultado seja útil, auditável e editável?”.

Essa posição orienta o produto inteiro.

## Estrutura antes de conteúdo

O sistema procura estruturar o problema antes de pedir conteúdo ao modelo. Isso acontece por meio de:

- hierarquia explícita do projeto;
- governança didática no nível da lição;
- ingestão e normalização de fontes;
- artefatos intermediários;
- contratos públicos e internos;
- validação, auditoria e reparo;
- aplicação por patch.

Em vez de delegar tudo a prompt livre, o AraLearn faz a LLM trabalhar dentro de um quadro delimitado.

## Organização de material amplo

Quando o usuário traz fontes extensas, a IA ajuda a transformar esse material em arquitetura pedagógica. Isso inclui:

- reconhecer temas e subtemas;
- sugerir progressão;
- distribuir conteúdo em cursos, módulos e lições;
- planejar microssequências;
- registrar metadados didáticos mínimos para continuidade.

O valor desse processo está na ordenação do material. O fluxo estrutural do produto não existe para despejar cards por atacado, mas para construir uma trilha navegável e utilizável.

## Intervenção local durante o estudo

Quando o usuário já está em uma microssequência, a IA pode:

- materializar conteúdo planejado;
- corrigir cards ruins;
- expandir um ponto insuficiente;
- reformular uma microssequência pouco clara;
- sugerir novos cards localizados;
- continuar a trilha a partir do próximo ponto planejado.

Nesse cenário, o usuário não interage com um chat genérico. Ele atua dentro de uma arquitetura pedagógica já existente.

## Controle do usuário

O usuário mantém controle editorial sobre o resultado. Ele pode:

- editar títulos, descrições e fonte-guia;
- mudar parâmetros avançados de geração;
- revisar o que foi criado;
- aceitar, excluir ou reformular iterações;
- alterar cards manualmente;
- exportar, versionar e conservar o projeto localmente.

A auditoria embutida reforça esse controle, mas não o substitui. O produto presume intervenção humana possível e desejável.

## Contratos, JSON e artefatos

O AraLearn depende de saídas estruturadas. A LLM não devolve apenas texto corrido: ela trabalha com contratos públicos e internos que representam curso, lição, microssequência, cards e artefatos de geração.

Essa escolha tem quatro efeitos:

- reduz ambiguidade;
- melhora validação;
- permite auditoria programática;
- torna a aplicação segura e reversível.

## Weak model mode e providers acessíveis

O projeto procura funcionar bem com modelos acessíveis, inclusive em cenários de baixo custo. Por isso o produto investe em:

- decomposição da tarefa;
- redução de ruído por ingestão;
- contratos pequenos e objetivos;
- auditoria localizada;
- materialização progressiva em vez de geração massiva.

O objetivo não é exigir um modelo “genial”, e sim criar condições para que modelos úteis, baratos ou locais produzam resultado aproveitável.

## Codex local e providers por API

O AraLearn pode operar com providers por API e com provider local via `Codex CLI`. Essa duplicidade é importante por razões práticas:

- custos variáveis;
- disponibilidade local;
- autonomia operacional;
- teste de fluxos mais pesados fora de limites estritos de API.

Em todos os casos, o provider é componente operacional. A arquitetura pedagógica do produto continua sendo responsabilidade do sistema.

## Fontes, anexos e parsers

Uma parte importante da qualidade da IA no AraLearn não vem do modelo em si, mas da forma como a fonte entra no fluxo. O projeto usa parsers open source, como `pdfjs-dist` e `mammoth`, para extrair texto de modo mais controlado antes de gerar grounding, planejamento e conteúdo.

Isso é especialmente importante quando a fonte é um artigo científico, uma apostila extensa, um conjunto de slides ou um documento técnico.

## O que o AraLearn não faz

O produto não presume:

- verdade automática da resposta do modelo;
- equivalência entre fluência textual e qualidade didática;
- substituição da autoria humana;
- neutralidade automática da organização proposta;
- suficiência de um único passo gerativo.

Por isso o sistema insiste em estrutura, inspeção, reversibilidade e intervenção.

## Leituras complementares

- [Arquitetura](arquitetura.md)
- [Modelo didático](modelo-didatico.md)
- [Contrato público](aralearn-contract.md)
