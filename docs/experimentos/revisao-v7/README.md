# Experimentos de autoria da revisão v7

Estes arquivos preservam gerações reais de GPT 5.6 Luna, feitas em sessões
independentes por ensaio, com esforço alto. O conteúdo é sintético. Não houve
execução desses cursos em produção nem avaliação com estudantes. Os resultados
medem autoria e validação local; não são uma certificação de aprendizagem.

## Protocolo e reprodução

O [brief](brief.md) fixa público, conhecimentos, três objetivos e requisitos de
evidência. O [catálogo](catalog.json) e os contratos
[inicial](tool.json) e [assistido](tool-assisted-v2.json) foram congelados antes
dos respectivos ensaios. Cada pasta conserva `first.json`, anterior à validação,
e `final.json`, após as correções do autor. Uma saída inicial contém JSON inválido;
ela foi preservada deliberadamente. O script aceita um objeto único como argumento
da ferramenta e registra separadamente a divergência do formato de lista pedido
pelo ensaio.

Para repetir a verificação estrutural contra o runtime do checkout:

```sh
node scripts/verifyV7AuthoringExperiments.mjs
```

O [resultado registrado](assessment.json) distingue parsing, contrato da
ferramenta, resolução do foco e validação dos componentes. O script não chama
um modelo nem aprova qualidade pedagógica. Os pareceres abaixo resultam da
leitura independente das gerações e da revisão crítica do orquestrador.

| Condição | Sessões | Microssequências produzidas | Resultado estrutural final |
| --- | ---: | ---: | --- |
| Um foco, contrato inicial (`single-*`) | 6 | 6 | Conteúdo corrigido, mas os seis ensaios conservaram problema na referência operacional de parte/foco |
| Três focos no mesmo recorte (`group-ABC-*`) | 2 | 6 | Um recorte completo sem erros; outro conservou referência de parte não fornecida |
| Um foco, parte derivada (`assisted-v2-A-*`) | 2 | 2 | Dois resultados finais válidos; uma primeira saída exigiu correção de sintaxe JSON |
| Correção após crítica independente (`corrected-B`) | 1 | 1 | Válido após corrigir a posição de `fontes` na Explicação |
| Segunda correção do foco B (`corrected-B-2`) | Continuação da sessão B | 1 revisão | Primeiro arquivo e final idênticos e válidos; extremo calculado diretamente no mapa de memória |

A referência de parte não foi fornecida no brief. Portanto, o primeiro contraste
também mede uma lacuna de contexto do protocolo, e não permite atribuir as falhas
somente à capacidade do modelo. Essa lacuna torna concreto o benefício de resolver
a parte a partir da microssequência já conhecida pelo sistema. Os dois ensaios
assistidos não bastam para estimar uma taxa geral de sucesso.

## Qualidade, evidência e correção

As produções finais focais iniciais somaram 20 unidades; as duas produções em
grupo, 21. As duas assistidas somaram nove. Quantidade não foi usada como nota de
qualidade. Houve escolhas únicas e múltiplas, quatro a cinco alternativas,
duas ou três corretas e lacunas com um a três alvos. A correção B acrescentou
um caso com seis alternativas, três corretas e feedback específico por opção.

| Saídas finais | Unidades | Práticas single / multiple / gap | Alternativas por choice | Lacunas por gap |
| --- | ---: | --- | --- | --- |
| Seis focais iniciais | 20 | 4 / 5 / 5 | 4–5 | 1–3 |
| Dois recortes de três focos | 21 | 2 / 4 / 6 | 4 | 1–2 |
| Duas focais assistidas do objetivo A | 9 | 3 / 2 / 1 | 4 | 1 |
| Correção B, mantida na revisão B-2 | 3 | 0 / 1 / 2 | 6 | 1 |

Todas as alternativas dos choices finais tinham feedback próprio, mas presença
não implica correção ou utilidade. As focais iniciais usaram parágrafo, tabela,
memória e máquina de estados; os recortes em grupo acrescentaram tabela de
transições. No objetivo B, uma focal usou somente tabela e parágrafo, enquanto a
outra acrescentou mapa de memória. No objetivo C, as duas focais usaram máquina
de estados. As duas assistidas trataram apenas protocolos e usaram parágrafo e
tabela; comparar sua variedade bruta com três domínios distintos seria injusto.
Essas variações, registradas em `assessment.json`, demonstram repertório e
instabilidade entre execuções, sem usar quantidade de componentes como nota.

Foram encontrados defeitos semânticos apesar de contratos válidos:

- Em gerações do foco A em grupo, uma lacuna tinha sua resposta declarada em
  outro trecho do próprio enunciado. Preencher o nome não recolhia a relação
  entre confirmação, retransmissão e recuperação que o plano pedia.
- No foco B, apareceu cálculo com fim e tamanho simultaneamente ocultos,
  sem dado suficiente para determiná-los; outra geração repetiu a solução
  fora do alvo. O schema e a avaliação do gabarito passaram nesses casos.
- No foco C, feedbacks fizeram afirmações incompatíveis com a tabela de
  transições fornecida. Outro percurso antecipou passos que a prática
  declarava pedir ao estudante.

A auditoria do produto passou a reconstruir `studentContent` com os alvos
ocultos. O indicador de resposta encontrada em outro trecho é apenas um indício:
um valor pode reaparecer legitimamente como dado de uma comparação. A revisão
semântica continua responsável por julgar a operação realmente solicitada.

Uma crítica automática rejeitou escolha/lacuna em geral para evidências causais.
Essa generalização foi rejeitada na integração: selecionar justificativas
mecanísticas ou completar relações pode recolher evidência adequada. O defeito
deve ser demonstrado no conteúdo concreto. Reconhecer uma justificativa fornecida
também não equivale à sua elaboração espontânea.

Na [correção B](corrected-B/final.json), os dois cálculos mantêm todos os dados
necessários após o mascaramento. O terceiro exercício diferencia contiguidade,
lacuna e compartilhamento de um byte, com seis opções e três corretas. O feedback
explica o erro de contagem inclusiva e os limites de cada par. A revisão da raiz
considera corrigidas as insuficiências de dados e alinhamento observadas. Permanece
um problema de tolerância de notação no primeiro gap de texto: foi declarada a
variante `0X201F`, mas não `0x201f`. Em alvos tipados de `memory_layout`, o runtime
agora normaliza base, caixa e zeros iniciais; texto livre continua literal para
não confundir identificadores. A [segunda correção](corrected-B-2/final.json)
usa a extremidade do mapa de memória como alvo. O runtime aceita grafias
equivalentes conforme a base declarada, sem flexibilizar código ou texto comum.
As três práticas recolhem cálculo de extremo, cálculo de tamanho e classificação
de contiguidade, lacuna e sobreposição. A revisão do orquestrador confirmou dados
suficientes, respostas ocultas nos alvos, exemplos distintos na Explicação e
feedback que explica o mecanismo. Isso demonstra um ciclo de melhoria neste
objetivo; não estabelece uma taxa geral de geração satisfatória.

## Q019: recorte focal e recorte com três microssequências

Os defeitos apareceram nas duas condições. A amostra não demonstra degradação
universal provocada pelo agrupamento; também não sustenta equivalência de qualidade
ou estabilidade. D023 já determina raciocínio focal, implementado como uma
microssequência por chamada. A decisão técnica da intervenção conserva a parte
como agrupamento operacional administrado pelo backend. Tornar parte equivalente
a microssequência exigiria outra migração sem benefício demonstrado: o modelo já
deixou de administrar vários focos na mesma chamada. Uma comparação maior que
busque inferência causal precisaria equilibrar também a informação operacional
fornecida e a ordem dos objetivos.

## Q020: 2, 4, 6 e 12 lacunas

Há dois corpus construídos por workers independentes, com geração programática
dos casos: [primeiro](gap-Q020/corpus.json) e [réplica](gap-Q020-replica/corpus.json).
Cada sessão produziu duas práticas de
cada tamanho 2/4/6. A réplica acrescentou um controle com 12, em intervalos
inclusivos de memória de 64 bits. A/B de cada tamanho pertencem à mesma sessão;
não são réplicas independentes entre modelos.

As 12 práticas finais de 2/4/6 e o controle de 12 passaram por contrato,
mascaramento, renderização e avaliação. Na réplica, uma duplicata de distrator
foi corrigida. Distratores que são respostas de *outra* lacuna permanecem
legítimos: a ambiguidade relevante é aceitar como distrator uma resposta correta
no próprio alvo. A recomendação do primeiro ensaio de eliminar distratores
cruzados e impor limite operacional de seis foi rejeitada pela revisão da raiz.

O controle de 12 comprova capacidade naquele exemplo, sem estabelecer um limite
pedagógico seguro universal. A decisão técnica conserva o teto estrutural de 12,
porque a capacidade foi exercitada em uma operação legítima de intervalos e não
há evidência de que cortar em seis melhore a autoria. Não se recomenda quantidade
mínima nem máxima automaticamente. Um limite pedagógico geral continua sem
demonstração; ele não é confundido com a capacidade do schema. Os testes do produto
verificam 2/4/6, coerência entre alvos, equivalência local, endereços exatos e V/F
digitáveis; a auditoria julga a suficiência e a coerência da prática inteira.

## Limites da conclusão

A [comparação de cursos grandes](comparacao-grande.md) é uma prova operacional
separada (H005): mede fronteiras reais de bytes em HTTP local e o retorno da
interface. Usa dados e identidade simulados, sem avaliar geração ou aprendizagem.

Os ensaios não medem persistência, OAuth, publicação, experiência hospedada ou
retenção da aprendizagem. A cadeia de auditoria deve ser validada também no
serviço, separadamente destes arquivos. Erros iniciais, correções e críticas não
foram ocultados para transformar uma geração boa em promessa de previsibilidade.
