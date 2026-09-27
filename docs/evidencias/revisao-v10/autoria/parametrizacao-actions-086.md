# Condições de pesquisa registradas pelo ChatGPT Actions

Em 27/09/2026, no AraLearn 0.0.86, commit `76d6a2a4a61e3111e422c9e6f152dc6bafbdbb24`, catálogo de tarefas 9.0.0, o ChatGPT Chat/Média registrou duas condições no curso **Do sinal à decisão: como representamos situações para prever o que acontece depois**, ID `68d099a5-60d6-4a26-bd93-4a990a4789c3`. A conversa de autoria já continha correções anteriores: esta prova verifica configuração e recuperação, sem alegar geração inicial independente.

## Pedido humano literal

> No curso “Do sinal à decisão: como representamos situações para prever o que acontece depois”, quero registrar duas condições fixas de desenho instrucional para pesquisa. Na etapa “Qual plano realmente compensa?”, as atividades devem vir depois da explicação e dos exemplos trabalhados. Na etapa “Quando a comparação muda?”, quero uma tentativa inicial antes do ensino pertinente e outra oportunidade depois da explicação e dos exemplos. A tentativa inicial deve explorar o raciocínio do iniciante sem pressupor que ele já aprendeu o que será ensinado. Registre a primeira como “Condição A — prática após o ensino” e a segunda como “Condição B — tentativas antes e depois do ensino”, com a justificativa de verificar se essas escolhas são preservadas na produção. Cada condição vale somente para sua etapa. Mantenha as demais escolhas do curso e as preferências da minha conta. Por enquanto, faça apenas esse registro e confira no AraLearn o que ficou salvo; a produção das atividades vem em seguida. Isso não é aprovação humana do conteúdo nem uma comparação da eficácia das condições.

## Canal, persistência e escopo

O [registro sanitizado](parametrizacao-actions-086.json) contém as configurações anteriores e posteriores e os horários de seis requisições reais de Actions: duas consultas, duas alterações e duas releituras, todas com cliente ChatGPT-User e status 200. A interface solicitou um consentimento pontual; os argumentos visíveis correspondiam ao curso, à primeira etapa e à condição autorizada. Um acesso ao endpoint OAuth também retornou 200; seu tipo de concessão não foi inspecionado e não é apresentado como prova específica de renovação.

A revisão do curso passou de 67 para 71. Cada etapa recebeu uma atribuição fixa da posição da prática, com origem **Condição de pesquisa**, justificativa e orientação local correspondente. Os outros onze parâmetros permaneceram iguais em cada recorte. A releitura independente da raiz usou MCP e SQL somente de diagnóstico, sem autoria ou escrita manual.

| Escopo | Condição persistida | Destino e evidência visual |
| --- | --- | --- |
| Qual plano realmente compensa? | Depois da explicação, fixa, condição de pesquisa | [Abrir parâmetros](https://fabio-ara.github.io/AraLearn/#/authoring/courses/68d099a5-60d6-4a26-bd93-4a990a4789c3?section=parameters&didacticMicrosequenceId=7b5ad12d-439d-8cd6-8307-7121e067f7c4); [escopo e valor](parametrizacao-actions-086-condicao-a.jpg); [origem e justificativa](parametrizacao-actions-086-condicao-a-motivo.jpg) |
| Quando a comparação muda? | Antes e depois, fixa, condição de pesquisa | [Abrir parâmetros](https://fabio-ara.github.io/AraLearn/#/authoring/courses/68d099a5-60d6-4a26-bd93-4a990a4789c3?section=parameters&didacticMicrosequenceId=2f1606a7-dcb7-808e-ab44-e03e7d88e647); [escopo e valor](parametrizacao-actions-086-condicao-b.jpg); [origem e justificativa](parametrizacao-actions-086-condicao-b-motivo.jpg) |

Os links acima vieram da releitura MCP da raiz; a resposta final do ChatGPT neste passo não apresentou links. Ambos foram abertos na mesma aba do Chrome persistente e seus pixels inspecionados. A navegação acessou os controles e a justificativa sem salvar qualquer edição. O texto integral das justificativas consta no JSON; as capturas mostram apenas a porção visível dos campos roláveis.

## Defeito encontrado e limites

A aba hospedada conservava a revisão 67 após a escrita externa. O painel de parâmetros informou que o curso havia mudado, mas **Tentar novamente** repetiu o erro. Recarregar a página permitiu conferir as condições na revisão atual. Isso é uma alternativa usada para esta releitura, não prova da correção do botão. A [correção e sua evidência local](recuperacao-parametros-087.md) têm registro separado.

O curso continuava com sete explicações e **zero unidades de estudo**. Nenhum parâmetro estava aplicado a uma unidade. Esta prova demonstra interpretação da intenção, escopo e persistência da configuração; a ordem e o conteúdo produzidos ainda precisam demonstrar sua realização. As duas etapas têm assuntos diferentes e não constituem comparação controlada de eficácia instrucional. Nenhum resultado desta intervenção constitui validação humana pós-correção.
