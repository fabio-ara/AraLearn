# Continuidade v10 → v11

A v11 foi construída copiando a v10 fornecida pelo usuário e acrescentando um patch sobre essa base. Não é uma reconstrução do mock.

## Preservado

- todas as 59 telas da v10;
- grafos e mecanismo de numeração de ações;
- Estudo, Autoria, Rever, coleções e cenários 1/20/200;
- retorno exato `←` e subida didática `↑`;
- cards com alvo principal grande e ações secundárias no mesmo eixo;
- overlays/bottom sheets;
- Inspeção com conteúdo real e barra horizontal de ações da Unidade;
- vistas de Pesquisa da v10 (Ciclo, Parâmetros, Fontes e Histórico).

## Acrescentado/corrigido

- 19 superfícies/estados novos;
- quatro grupos compactos de capacidades dentro do Curso em Autoria;
- Estrutura, Fontes do Curso e Pessoas;
- política e catálogo de componentes;
- ação contextual ChatGPT/MCP;
- Analytics com sete datasets, gráfico, tabela equivalente, definição, fatos, deep links e exportação;
- criação e comparação de Variantes;
- separação explícita entre pesquisa da autoria, experimentos de desenho e efeitos sobre estudantes (futuro);
- matriz de cobertura do backend;
- correção da cardinalidade demonstrativa de Autoria no cenário de 200 Cursos;
- fallback de `←` para deep links sem histórico, mantendo retorno exato quando existe pilha real.
