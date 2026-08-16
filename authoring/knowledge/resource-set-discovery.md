# ResourceSet e descoberta progressiva

## Guia de recuperação

- `INTENT`: recupere para `create`, `extend`, `revise`, `audit` e `repair` depois de resolver o snapshot e antes de escolher qualquer package.
- Recupere junto dos contratos exatos dos candidatos selecionados; não carregue todos os manifests ou contracts.
- Não aceite allowlist fornecida pelo modelo como autoridade. A disponibilidade vem do estado persistido resolvido pelo servidor.

## Três relações distintas

`ResourceSet` define disponibilidade: quais `package@version` podem participar no escopo e sob quais papéis, ajustes e políticas. Seleção é a decisão do blueprint por um package autorizado. Uso é o que aparece nos cards materializados. Registre as três relações separadamente para que o manifesto e a auditoria possam comparar permitido, escolhido e usado.

O contexto confiável da consulta contém `workspaceId` e a referência do snapshot. Com esse contexto, `explore` e `search` só apresentam versões permitidas; `inspect` e `contracts` recusam candidatos fora do conjunto. Sem contexto, a ferramenta declara o modo legado irrestrito; esse modo não demonstra conformidade com um desenho parametrizado.

## Descoberta

Quando Auto precisar de um conjunto ainda inexistente, faça um bootstrap separado: explore e busque por famílias/facetas para propor disponibilidade, congele referências exatas de `package@version` e persista o ResourceSet antes do assignment que o referencia. Essa busca inicial não autoriza seleção nem demonstra conformidade. A autoridade começa depois que a referência entra no snapshot efetivo.

1. Leia os requisitos de estrutura, operação cognitiva, fidelidade e representação da análise e do blueprint em formação.
2. Use `explore` para famílias e facetas permitidas.
3. Use `search` para candidatos e preserve a referência exata do ResourceSet autorizador.
4. Use `inspect` apenas nos candidatos plausíveis.
5. Carregue com `contracts` exatamente uma versão escolhida por chamada.
6. Valide composição e representação antes de salvar; registre seleção e autorizador no manifesto.

Adequação, papel e política precisam ser autorizados pelo mesmo ResourceSet que contém o package; não monte uma autorização artificial unindo permissões independentes de conjuntos diferentes. O catálogo pode crescer sem aumentar o prompt, a lista de tools ou o volume de contracts carregados.

## Ausência de representação adequada

`canonical` só é aceito quando o mesmo conjunto o autoriza para requisito, papel e ajuste; não acrescente limitação artificial. A política `block` rejeita `versatile` e `substitute`. `allow_versatile_with_limitation` admite `versatile` com limitação explícita e rejeita `substitute`. `allow_substitute_with_limitation` admite ambos com limitação explícita. O ResourceSet pode restringir ainda mais essas possibilidades. Quando a política bloquear, interrompa aquela materialização e registre a indisponibilidade. Nunca finja equivalência entre representações.

Em experimento, o conjunto permitido é uma condição persistida. O assistente escolhe localmente entre os packages autorizados, mas não amplia o conjunto, altera locks ou troca a condição.
