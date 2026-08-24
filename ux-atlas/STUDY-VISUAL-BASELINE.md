# Identidade visual de Estudo — referência obrigatória

Esta referência complementa o Atlas. Ela existe para impedir que a implementação final preserve as capacidades atuais, mas perca novamente a linguagem visual e interacional que tornava Estudo simples.

## Regra de autoridade

- **Funcionalidade, dados, autorização e persistência:** sempre `main` atual.
- **Cobertura e navegação do frontend:** `ux-atlas/`.
- **Identidade visual/interacional de Estudo:** baseline histórico `9e7ddc013d8efcf2918bf2b5b03f506217098e15`, reaplicado aos componentes atuais.
- **Tokens, acessibilidade e responsividade:** `docs/sistema-visual.md` e estilos atuais.

Não restaurar Workspace, Trilhas, rotas, schemas, APIs ou persistência antigos.

## Evidência histórica concreta

### Área principal

No baseline, `src/ui/renderHomeScreen.js` usa `home-product-switch` com dois controles irmãos:

- **Estudo**;
- **Autoria**.

Esse padrão deve permanecer como seletor compacto de área principal. A entrada atual de Estudo pode conservar seu seletor de Curso e sua prévia rica; o requisito é a identidade da troca Estudo/Autoria, não a antiga arquitetura de Cursos.

### Modos de conteúdo

No baseline, `src/ui/renderLessonScreen.js` define um único `renderEntityModeSwitcher` com:

- **Visualizar** (`preview`);
- **Editar** (`edit`);
- **Assistência por IA** (`sparkles`).

O mesmo padrão era aplicado à Lição, Microssequência e Card. O Card corresponde conceitualmente à atual Unidade de estudo.

A implementação final deve recuperar essa gramática visual como **segmented control/toggle de modos pares**. No produto atual, usar **Assistência por API** quando essa ação executa o provider configurado no aplicativo.

## Mapeamento para o código atual

Não portar os handlers antigos.

- **Visualizar:** renderer/runtime atual de `src/study/CourseStudyScreen.js`.
- **Editar:** `manualStudyUnitEdit` e fluxo manual atuais.
- **Assistência por API:** `StudyUnitProviderAssistance` e `studyUnitAssistanceTargetAvailability` atuais.
- **Cópia pessoal:** contratos atuais implementados após #149.
- **Fontes/Observações/Rever/progresso/offline:** mecanismos atuais.

O código atual já possui edição manual e trigger de assistência na Unidade; a mudança desejada é principalmente tornar os três modos novamente irmãos, claros e consistentes, sem criar outro editor ou outro fluxo de IA.

## Requisitos visuais

1. `Visualizar` é o modo inicial e mantém o runtime limpo.
2. `Editar` e `Assistência por API` ocupam o mesmo nível semântico de `Visualizar`.
3. Trocar de modo não muda Curso/Microssequência/Unidade nem perde posição.
4. Ações internas do modo — desfazer, refazer, aplicar, descartar, salvar, configurar provider — aparecem depois que o modo é escolhido; não competem com o seletor de modo.
5. Microssequência usa a mesma gramática quando há operação naquele nível.
6. A identidade deve ser reaplicada à Autoria por família visual: densidade, cards, tipografia, segmented controls, iconografia, superfícies e ações compactas; não copiar funções impróprias de Estudo.
7. Uma única coluna útil, aproximadamente 430 px; nada de dashboard/desktop sidebar.

## Anti-regressão

A implementação não está autorizada a simplificar removendo um modo funcional, nem a reconstruir os modos por uma nova arquitetura.

Se uma capacidade atual existe mas a UI proposta não deixa claro onde operá-la, corrigir a UI. Se a capacidade não existe no backend atual, não inventá-la: registrar como indisponível/futuro.

## Referências relacionadas

- #61 — modos Ler/Editar e assistência contextual, com requisitos frugais e exclusão explícita de editor low-code/JSON.
- #148 — restauração da entrada de Estudo.
- #149 — edição contextual e cópia pessoal sobre a arquitetura 2.0.
- #152 — implementação do frontend final.
- #174 — gate contra overengineering.
