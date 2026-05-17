# Assistência por IA generativa

Este documento descreve o papel da IA no AraLearn a partir da arquitetura real do produto e dos limites técnicos que a própria literatura recomenda explicitar.

## A posição do produto

No AraLearn, a LLM não ocupa o lugar de autora da didática. Ela tampouco ocupa o lugar de fonte de verdade. Seu papel é mais restrito: organizar, preencher ou reparar conteúdo dentro de um recorte previamente decidido pelo app.

Essa escolha nasce de uma constatação prática e teórica. Na prática, pedidos muito amplos tendem a produzir deriva, repetição, generalização vazia e inconsistência estrutural, sobretudo em modelos leves. Na teoria, trabalhos sobre linguagem controlada e sobre heurísticas superficiais em NLP mostram que fluência textual e estrutura formal confiável não coincidem automaticamente (Neuhaus & Barkmeyer, 2013; Njonko et al., 2014; McCoy, Pavlick & Linzen, 2019). Por isso, o AraLearn não delega à IA o desenho do percurso. Ele desloca parte da inteligência da operação para contratos, limites, artefatos intermediários e validações locais.

## Por que o AraLearn prefere restrição

Em vez de pedir ao modelo que imagine sozinho um percurso “completo”, o app define:

- o contexto hierárquico;
- o escopo da operação;
- a governança da lição;
- o tipo didático permitido;
- o tamanho da microssequência;
- os formatos de apresentação e prática disponíveis;
- as validações que o resultado precisará atravessar.

Esse desenho é compatível com a observação, bastante recorrente em uso real, de que modelos fracos ou baratos se comportam melhor quando a tarefa é estreita, incremental e formalmente delimitada.

## Estrutura antes de conteúdo

No estágio atual do produto, uma distinção ficou especialmente importante:

- o top-down organiza a trilha;
- o runtime local materializa o conteúdo.

Isso significa que a LLM participa de dois momentos diferentes.

### 1. LLM no fluxo top-down

Aqui o objetivo é transformar material amplo em sequência didática. A LLM ajuda a:

- organizar cursos, módulos e lições;
- planejar microssequências;
- sugerir ordem, contraste, prática e cobertura;
- reagir à governança da lição e ao `domainMap`.

O top-down já não precisa pré-gerar cards por padrão para cumprir essa função. Seu papel principal é estruturar o percurso.

### 2. LLM no fluxo bottom-up

Aqui o objetivo já é muito mais localizado. No runtime da microssequência, a IA pode:

- materializar;
- corrigir;
- expandir;
- reformular;
- editar localmente.

É nesse ponto que o estudo pode assumir um caráter mais dialógico. O usuário já está dentro de uma trilha. A pergunta não surge no vazio. Surge no interior de uma estrutura previamente construída.

## Weak model mode

No pipeline bottom-up de cards, o AraLearn opera com política de contenção semelhante ao que o projeto chama de `weakModelMode`. Em termos simples, isso significa que o sistema evita pedir liberdade demais ao modelo quando a tarefa exige precisão estrutural.

O plano devolvido precisa ser enxuto. O modelo não deve decidir sozinho:

- a posição dos elementos;
- o `cardPlan`;
- o formato final de cada unidade interativa;
- o percurso inteiro da lição.

Depois da validação, o próprio AraLearn recompõe partes determinísticas do contrato antes de pedir o preenchimento do conteúdo.

## O papel da lição

A qualidade da assistência depende fortemente da lição. É a lição que concentra a governança didática principal por meio de `sourceGuideStructured`, tags de formato, tipos de conteúdo, ações de aprendizagem, suporte e, quando houver, `domainMap`.

Isso significa que a geração não deve ser lida como evento isolado. Ela é uma operação situada. Quando a lição está mal orientada, a saída tende a ficar difusa. Quando a lição está clara, a LLM precisa improvisar menos.

## JSON, contratos e artefatos intermediários

Um dos pontos fortes do produto hoje está em não tratar a interação com a LLM como simples “prompt e resposta”.

No fluxo estrutural, o modelo pode trabalhar a partir de artefatos como:

- `intent`;
- `sourceLedger`;
- `lessonPlans`;
- `courseGraph`;
- `lessonGovernance`;
- `microsequencePlans`;
- `interventionPlan`.

No fluxo local, a LLM trabalha com:

- contexto da lição;
- metadados da microssequência;
- pedido local do usuário;
- tags, tipo didático e anexos relevantes;
- contratos próprios de geração ou edição.

Esse desenho aproxima o AraLearn de uma lógica de especificação intermediária: primeiro o sistema estrutura a tarefa, depois o modelo preenche dentro desse recorte.

## O estado atual do top-down

Hoje o produto tem uma camada estrutural pública única para home, curso, módulo e lição: o painel contextual já aciona o `CourseForge` em todos esses escopos. O motor continua organizado por fases, com intenção própria, artefatos persistíveis, auditoria local e reparo antes da aplicação do patch.

Descrever esse ponto com precisão importa. O correto hoje é: a trilha estrutural pública já foi consolidada no `CourseForge`; o workbench da microssequência continua existindo, mas como superfície local de materialização, edição e reparo, não como motor estrutural paralelo da lição.

No estado atual da ingestão, o fluxo estrutural já aceita texto simples e passa a priorizar `PDF` e `DOCX` como formatos reais de uso. O suporte inicial busca extrair texto utilizável com warnings rastreáveis quando a qualidade vier parcial, em vez de prometer leitura perfeita do layout original.

## Pipeline local de cards e microssequência

No runtime local, o fluxo real tende a seguir a lógica:

1. o usuário faz um pedido localizado;
2. o app monta um contrato local;
3. a LLM devolve conteúdo ou reformulação;
4. o app normaliza a resposta;
5. o app valida estrutura;
6. o app valida coerência didática local;
7. o app aplica a iteração;
8. o usuário aceita ou exclui a versão gerada.

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

## Aplicação direta e responsabilidade editorial

O resultado validado é aplicado diretamente na microssequência. Não existe mais uma camada separada de prévia privada. A reversão acontece por iteração ativa: o usuário pode aceitar ou excluir a versão gerada.

Isso torna a IA parte do fluxo real de autoria, mas não elimina curadoria humana. O usuário continua responsável por julgar fidelidade, clareza, pertinência e adequação do material ao seu próprio percurso.

## Fontes, anexos e parsers

Quando houver fontes e anexos, o AraLearn usa grounding mínimo, não promessa de RAG sofisticado. O objetivo é manter vínculo mínimo entre transformação e origem por `sourceRefs`, `sourceUsePlan` e artefatos de ingestão.

No estado atual do repositório, isso se apoia também em bibliotecas open source já integradas para extração textual, como `pdfjs-dist` e `mammoth`, usadas respectivamente no tratamento de `PDF` e `DOCX`.

## Codex local

`Codex CLI local` permanece suportado como integração avançada. O fluxo principal do estudante comum continua sendo provider por API. O provider local interessa sobretudo quando o usuário quer manter a operação mais próxima de seu próprio ambiente.

No pipeline público atual, esse provider já atende a geração estrutural e a geração local da microssequência, ao lado de um provider falso de teste usado para validação offline do motor.

## Referências centrais

- RECON / linguagem controlada: https://www.nist.gov/publications/recon-controlled-english-business-rules
- RuleCNL: https://arxiv.org/abs/1406.2096
- HANS / heurísticas superficiais: https://aclanthology.org/P19-1334/
- Feedback e aprendizagem: https://assess.ucr.edu/sites/g/files/rcwecm2336/files/2019-02/hattietimperley_2007.pdf
- Fundamentos gerais do projeto: [Fundamentos e evidências](fundamentos-e-evidencias.md)
