# Documentação do AraLearn

Este diretório documenta o produto novo do AraLearn: top-down para planejar a trilha até microssequências e bottom-up para materializar cards uma microssequência por vez.

## Leitura recomendada

- [Visão do produto](visao-do-produto.md): problema, resposta do AraLearn e fluxo principal.
- [Guia de uso](uso-do-app.md): como o usuário comum percorre top-down e bottom-up.
- [Modelo didático](modelo-didatico.md): por que a microssequência é a unidade central.
- [Arquitetura](arquitetura.md): motor, domainMap, fases, patch e persistência.
- [Assistência por IA](assistencia-por-ia.md): como a IA participa sem virar chat solto.
- [Contrato público](aralearn-contract.md): estrutura persistível do projeto e metadados aceitos.
- [Rascunhos e microssequências](rascunhos-e-microssequencias.md): diferença entre etapa planejada e cards materializados.

## Complementos

- [Perfis didáticos](perfis-didaticos.md): como o produto varia sem abandonar sua arquitetura.
- [Arquitetura-alvo](arquitetura-alvo.md): critérios de consolidação do produto.
- [Fundamentos e evidências](fundamentos-e-evidencias.md): bases pedagógicas e perguntas de pesquisa.
- [Pesquisa e avaliação](pesquisa-e-avaliacao.md): hipóteses e critérios para avaliar o produto.
- [Planejamento de Matemática para Informática](planejamento-matematica-para-informatica.md): exemplo de planejamento.
- [Abrir com AraLearn no Android](android-share-import.md): importação via compartilhamento.
- [Codex CLI local](codex-cli.md): provedor local.

## Vocabulário essencial

- `top-down`: fluxo que transforma intenção e fontes em estrutura planejada até microssequências.
- `bottom-up`: fluxo local que cria ou corrige cards dentro de uma microssequência.
- `microssequência planejada`: etapa da trilha que já existe, mas ainda não tem cards.
- `domainMap`: mapa semântico interno da lição, usado para manter coerência didática.
- `domainRefs`: referências leves, na microssequência, para itens do `domainMap`.
- `patch`: alteração validada aplicada ao projeto.
