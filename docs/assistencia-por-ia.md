# Assistência por IA generativa

Este documento descreve o papel da IA no AraLearn a partir da arquitetura real do produto e dos limites técnicos que a própria literatura recomenda explicitar.

## A posição do produto

No AraLearn, a LLM não ocupa o lugar de autora da didática. Ela tampouco ocupa o lugar de fonte de verdade. Seu papel é mais restrito: preencher ou reparar conteúdo dentro de um recorte previamente decidido pelo app.

Essa escolha nasce de uma constatação prática e teórica. Na prática, pedidos muito amplos tendem a produzir deriva, repetição, generalização vazia e inconsistência estrutural, sobretudo em modelos leves. Na teoria, trabalhos sobre linguagem controlada e sobre heurísticas superficiais em NLP mostram que fluência textual e estrutura formal confiável não coincidem automaticamente (Neuhaus & Barkmeyer, 2013; Njonko et al., 2014; McCoy, Pavlick & Linzen, 2019). Por isso, o AraLearn não delega à IA o desenho do percurso. Ele desloca parte da inteligência da operação para contratos, limites e validações locais.

## Por que o AraLearn prefere restrição

Em vez de pedir ao modelo que imagine sozinho um percurso “completo”, o app define:

- o contexto hierárquico;
- o escopo da lição;
- o tipo didático permitido;
- o tamanho da microssequência;
- o plano determinístico dos cards;
- os formatos de apresentação e prática disponíveis;
- as validações que o resultado precisará atravessar.

Esse desenho é compatível com a observação, bastante recorrente em uso real, de que modelos fracos ou baratos se comportam melhor quando a tarefa é estreita, incremental e formalmente delimitada.

## Weak model mode

O pipeline bottom-up de cards opera em `weakModelMode`. Em termos simples, isso significa que a primeira etapa pede ao modelo apenas uma escolha restrita entre opções fechadas. O plano devolvido é enxuto. O modelo não devolve `cardPlan`, não escolhe livremente a posição dos elementos, não decide sozinho o formato final de cada unidade interativa. Depois da validação desse plano preliminar, o AraLearn monta o `cardPlan` por conta própria e só então pede o preenchimento do conteúdo.

Essa política não é uma admissão de fraqueza do produto; é uma forma de calibrar a operação para o tipo de modelo que o projeto pretende suportar com custo plausível.

## O papel da lição

A qualidade da assistência depende fortemente da lição. É a lição que concentra a governança didática principal por meio de `sourceGuideStructured`, tags de formato, tipos de conteúdo, ações de aprendizagem e nível de apoio.

Isso significa que a geração não deve ser lida como evento isolado. Ela é uma operação situada. Quando a lição está mal orientada, a saída tende a ficar difusa. Quando a lição está clara, a LLM precisa improvisar menos.

## Geração de microssequências e geração de cards

O AraLearn usa IA em dois pontos centrais, mas com objetivos diferentes.

Na lição, a IA pode sugerir microssequências draft. Nesse nível, o foco é organização do percurso, não redação dos cards. O sistema pode considerar `sourceGuideStructured`, `domainMap`, cobertura já existente e risco de redundância.

No painel da microssequência, a IA atua sobre cards. Aqui o objetivo já é muito mais localizado: explicar, demonstrar, praticar, consolidar ou revisar um ponto delimitado pelo próprio percurso.

## O estado atual do top-down

Hoje o produto tem duas camadas distintas de geração mais ampla, e a documentação precisa nomeá-las corretamente.

A primeira é a camada já pública na interface. Ela aparece no painel contextual de home, curso e módulo para gerar estrutura, e na lição para gerar microssequências `draft` ou gerar e reposicionar essas microssequências. Essa é a trilha efetivamente visível ao usuário comum no app.

A segunda é a nova camada interna `CourseForge`. Ela já existe no código e na suíte automatizada como motor top-down por fases, com intenção própria, artefatos persistíveis, auditoria local e reparo antes da aplicação do patch. Essa camada já vai além da estrutura: ela também alcança planejamento de lições, microssequências, cards e aderência mínima à fonte. Mas ela ainda não aparece como fluxo autônomo e nomeado na UI pública.

Descrever esse ponto com precisão importa. Dizer que o AraLearn “já tem motor top-down completo” é verdadeiro se a referência for o estado interno do repositório e da suíte. Dizer que o usuário final “já opera esse motor completo pela interface” ainda seria exagero.

## Pipeline de cards

O fluxo real da geração de cards é o seguinte:

1. o usuário faz um pedido localizado;
2. o app monta um contrato de planejamento;
3. a LLM devolve um plano enxuto;
4. o app valida o plano;
5. o app monta `cardPlan` determinístico;
6. o app resolve os formatos permitidos;
7. o app monta o contrato de geração;
8. a LLM devolve os cards;
9. o app normaliza a resposta;
10. o app executa reparo estrutural determinístico;
11. o app valida estrutura;
12. o app valida coerência didática local;
13. o app valida vínculo mínimo com fonte, quando houver;
14. se necessário, o app pede reparo ou continuação;
15. o resultado validado é aplicado.

O que interessa aqui é que a geração não é tratada como bloco único, e sim como operação em camadas.

## Meticulosidade e política didática

A camada de meticulosidade não existe para pedir mais texto. Ela existe para conter dois riscos muito comuns em geração por LLM: resumo genérico e prolixidade enganosa. Em outras palavras, o problema não é só sair insuficiente; é sair liso, amplo e sem progressão prática.

Por isso, a política da geração reforça:

- decomposição do ponto didático;
- rejeição de resumo genérico;
- exigência de função nova para novas microssequências;
- separação entre cobertura e repetição;
- variação de prática com finalidade.

## Checagens locais de qualidade

Uma parte importante da assistência não está no prompt, mas na camada de checagens locais. O AraLearn combina três tipos de inspeção.

O primeiro tipo é estrutural: contrato, quantidade, posição, formato e campos obrigatórios. O segundo é declarativo: cobertura já registrada, prática ausente, variação insuficiente, duplicação sem função nova. O terceiro é textual, mas com força limitada: padrões evidentes de bastidor, dependência externa, resposta revelada ou genericidade local.

O ponto decisivo é que esses três tipos não têm o mesmo estatuto. A camada estrutural e parte da camada declarativa podem justificar bloqueio ou continuação automática. A camada textual, por si só, não deve ser confundida com interpretação semântica forte. Ela funciona como apoio, sinal de risco e insumo para revisão, o que é coerente com a cautela sugerida por McCoy, Pavlick e Linzen (2019).

## Continuação automática

Quando a falha é forte o bastante, o app pode acionar continuação automática antes da entrega final. Isso não significa “conversar mais com a LLM até ficar bonito”. Significa restringir ainda mais a tarefa.

Dependendo do caso, a continuação pode:

- reescrever posições específicas;
- inserir uma etapa de preparação;
- inserir prática mínima;
- adiar a lacuna para outra microssequência da lição;
- rejeitar redundância em vez de inflar volume.

Essa continuação existe para preservar o pedido do usuário e reduzir o número de iterações manuais necessárias, não para competir com o que o usuário escreveu.

## Aplicação direta e responsabilidade editorial

O resultado validado é aplicado diretamente na microssequência. Não existe mais uma camada separada de prévia privada. A reversão acontece por iteração ativa: o usuário pode aceitar ou excluir a versão gerada.

Isso torna a IA parte do fluxo real de autoria, mas não elimina curadoria humana. O usuário continua responsável por julgar fidelidade, clareza, pertinência e adequação do material ao seu próprio percurso.

## Fontes e anexos

Quando houver fontes e anexos, o AraLearn usa grounding mínimo, não promessa de RAG sofisticado. O objetivo é manter vínculo mínimo entre transformação e origem por `sourceRefs` e `sourceUsePlan`. Isso é suficiente para aumentar rastreabilidade local sem transformar o app em infraestrutura pesada de busca semântica.

## Codex local

`Codex CLI local` permanece suportado como integração avançada. O fluxo principal do estudante comum continua sendo Gemini/API comum. O provider local interessa sobretudo quando o usuário quer manter a operação mais próxima de seu próprio ambiente.

No pipeline público atual, esse provider já atende a geração estrutural e a geração de microssequências da lição, além do workbench da microssequência. Na refatoração interna `CourseForge`, ele também já existe como provider real da nova trilha top-down, ao lado de um provider falso de teste usado para validação offline do motor.

## Referências centrais

- RECON / linguagem controlada: https://www.nist.gov/publications/recon-controlled-english-business-rules
- RuleCNL: https://arxiv.org/abs/1406.2096
- HANS / heurísticas superficiais: https://aclanthology.org/P19-1334/
- Feedback e aprendizagem: https://assess.ucr.edu/sites/g/files/rcwecm2336/files/2019-02/hattietimperley_2007.pdf
- Fundamentos gerais do projeto: [Fundamentos e evidências](fundamentos-e-evidencias.md)
