# Uso do app

Usar o AraLearn é passar de um tema amplo para uma etapa concreta de estudo. O fluxo básico é: definir escopo, planejar a trilha, abrir uma microssequência, gerar ou corrigir cards, estudar, revisar e continuar.

Esse desenho se aproxima da aprendizagem autorregulada descrita por Zimmerman (2002): o estudante precisa planejar, monitorar e ajustar o próprio estudo. O app não elimina esse trabalho; ele o organiza.

## 1. Definir escopo

O escopo declara o que será estudado. Ele pode conter tema, objetivo, conteúdos que entram, conteúdos que ficam fora, convenções de notação, observações de prova, fonte preferencial ou recorte profissional.

Exemplo:

```text
Quero estudar ponteiros introdutórios em C.
Entram: endereço, operador &, operador *, ponteiro para int, erro entre valor e endereço.
Ficam fora: alocação dinâmica e ponteiro para função.
```

Esse passo é importante porque a LLM precisa de fronteiras. Sem fronteiras, tende a abrir assuntos laterais e transformar uma etapa local em explicação ampla demais.

## 2. Planejar a trilha por top-down

Depois do escopo, o AraLearn pode acionar uma LLM por API para propor a estrutura inicial:

```text
curso -> módulo -> lição -> microssequência
```

Essa etapa cria caminho. Ela não precisa produzir os cards finais. O usuário deve revisar a estrutura, corrigir títulos, ajustar recortes e verificar se as exclusões foram respeitadas.

## 3. Abrir uma microssequência

Ao abrir uma microssequência, o usuário sai da visão geral e entra em uma etapa específica. A microssequência informa objetivo, papel, dependências, conteúdos cobertos, critérios de verificação, status e cards disponíveis.

É nessa etapa que o AraLearn monta o contexto para a LLM: caminho da etapa, `guide`, dependências, próxima microssequência, referências escolhidas, fontes anexadas e cards existentes quando a operação é de correção.

## 4. Gerar cards por bottom-up

No bottom-up, a LLM recebe uma tarefa local. Ela pode gerar ou corrigir cards, propor apoio para uma dificuldade ou continuar a próxima etapa planejada.

O resultado não entra automaticamente no projeto. O AraLearn confere formato, campos obrigatórios, alternativas, resposta, lacunas, recursos visuais e coerência mínima com o escopo. Quando a validação aceita o resultado, o app atualiza os cards da microssequência.

## 5. Estudar os cards

Os cards podem ser explicativos ou interativos. Dependendo do conteúdo, podem aparecer como parágrafo, pergunta objetiva, código, tabela, matriz, plano, grafo, mapa de relações, fluxograma, árvore ou composição de blocos.

Esse ponto se relaciona a uma regra básica de usabilidade: o sistema deve tornar o estado e a ação compreensíveis ao usuário. Nielsen (1994) formulou esse princípio como visibilidade do estado do sistema. No AraLearn, a interface precisa deixar claro onde o estudante está, que etapa está ativa e que card está sendo usado.

Quando o conteúdo já está salvo no IndexedDB ou vem embarcado no app, o estudo dessa etapa pode seguir localmente. A conexão volta a ser necessária quando o usuário pede planejamento, geração ou correção assistida por IA.

## 6. Corrigir cards

Se a explicação ficou ruim, o exercício saiu do escopo ou o card precisa de outro recurso, o usuário pode pedir correção. Depois da validação, o conjunto corrigido substitui os cards atuais da microssequência.

## 7. Criar apoio local

Quando uma lacuna aparece, o usuário pode criar uma microssequência de apoio. Essa etapa não substitui a trilha principal. Ela resolve uma dificuldade e permite retornar ao percurso.

Exemplo: durante uma lição de ponteiros, o estudante percebe que ainda confunde variável, endereço e valor. Em vez de abandonar a lição, pode criar uma etapa de apoio sobre essa distinção.

## 8. Usar fontes e arquivos

O AraLearn pode usar referências escolhidas pelo usuário e fontes anexadas quando uma intervenção exigir contexto. Se houver uso de API externa, apenas o contexto necessário à chamada deve ser enviado ao serviço configurado. A qualidade da extração depende do formato do arquivo, da clareza do material original e da revisão posterior.

## 9. Fluxo resumido

```text
definir escopo
-> planejar trilha por top-down
-> abrir microssequência
-> gerar ou corrigir cards por bottom-up
-> estudar
-> revisar os cards
-> criar apoio local quando necessário
-> continuar
```

## Referências citadas

Nielsen, J. (1994). *10 usability heuristics for user interface design*. Nielsen Norman Group. <https://www.nngroup.com/articles/ten-usability-heuristics/>

Zimmerman, B. J. (2002). Becoming a self-regulated learner: An overview. *Theory Into Practice*, 41(2), 64-70. <https://doi.org/10.1207/s15430421tip4102_2>
