# Analytics da Autoria

A área **Analytics** responde, com números simples, a duas perguntas sobre o
estado atual de um Curso:

1. como o conteúdo foi desenhado;
2. onde houve intervenção humana explícita.

Ela não reconstitui a execução técnica que produziu o Curso. Também não atribui
nota de qualidade, aprendizagem ou participação humana. Os números são
descrições do artefato e de ações observáveis.

## Como consultar

1. Abra um Curso próprio em **Autoria**.
2. Entre em **Analytics**.
3. Selecione o escopo: Curso, Parte, Microssequência ou StudyUnit.
4. Leia os números de **Desenho** e **Autoria**.
5. Expanda apenas a tabela necessária para conferir a composição do número.

O seletor recarrega um snapshot do escopo escolhido. Uma referência interna
localiza esse escopo no banco, mas a interface mostra seu nome humano.

## Desenho

A síntese apresenta quatro quantidades:

- **StudyUnits** no escopo;
- **AnalysisUnits**, isto é, novidades semânticas inventariadas;
- oportunidades de **Prática** vinculadas aos requisitos de evidência;
- **Fontes** relacionadas.

Três tabelas recolhidas permitem examinar a composição desses números.

### Configuração aplicada

Mostra os quatro parâmetros pedagógicos efetivamente usados pelas StudyUnits:

- teto de novas AnalysisUnits por StudyUnit expositiva;
- formas de explicação requeridas;
- mínimo de oportunidades distintas de prática por requisito de evidência;
- dimensões de variação requeridas para a prática.

Quando StudyUnits do mesmo escopo usaram valores diferentes, cada valor aparece
com a quantidade de Units a que se aplica e sua origem observável. A direção
editorial permanece separada desses quatro parâmetros.

### Conteúdo e representações

A tabela relaciona:

- cada AnalysisUnit e sua quantidade de introduções;
- a quantidade de novidades introduzidas por StudyUnit;
- formas explicativas aplicadas;
- componentes e representações usados.

Assim, comparar teto 1 e teto 2 não exige transformar assuntos amplos em uma
AnalysisUnit maior. O inventário pode permanecer igual enquanto sua distribuição
entre StudyUnits muda.

### Prática e Fontes

A última tabela de Desenho apresenta:

- oportunidades por requisito de evidência;
- oportunidades que exercitam cada dimensão de variação;
- Fontes, Âncoras e StudyUnits relacionadas, agrupadas pelo papel da Fonte.

Contar uma oportunidade não demonstra que alguém aprendeu. O número informa
apenas que o artefato oferece aquela prática.

## Autoria

A síntese de Autoria mostra:

- Observações humanas ainda abertas;
- parâmetros definidos explicitamente e ainda vigentes;
- StudyUnits cuja última revisão observável foi manual.

A tabela complementar informa Observações criadas e resolvidas e agrupa
StudyUnits pela origem de sua criação e de sua última revisão. Essas contagens
descrevem o estado corrente; não formam percentual de autoria nem score de
colaboração. Ausência de intervenção registrada não significa concordância.

Quando a origem corrente não pode ser atribuída com segurança, Analytics a
mantém ausente; não converte desconhecimento em zero nem reconstrói uma história
por inferência.

## De onde vêm os números

Analytics deriva o snapshot das autoridades correntes do Curso sempre que isso
é possível: estrutura, plano, configuração efetiva, StudyUnits, componentes,
Fontes, Âncoras e Observações. Intervenções humanas entram apenas quando o estado
corrente conserva origem explícita com significado estável.

O contrato `aralearn.course-authoring-analytics.v2` contém somente:

- Curso e escopo;
- desenho quantitativo;
- autoria quantitativa;
- dados ausentes;
- endereço da área, quando disponível.

O AraLearn não transforma a execução técnica nem a interação cotidiana em uma
segunda história do Curso. Também não guarda conversa, raciocínio privado,
cliques, rolagem ou tempo em tela para produzir esses números.

## Exportar Analytics

O botão **Exportar Analytics** baixa um JSON com o mesmo snapshot normalizado
que está na tela. Os números e os dados ausentes são idênticos aos da leitura
visual.

Esse arquivo registra Analytics do escopo naquele momento. Ele não é uma cópia
completa do Curso, não congela o artefato usado numa pesquisa e não cria uma
versão imutável. Uma investigação que precise preservar conteúdo e configuração
deve definir e validar uma exportação própria do artefato.

## Limites de interpretação

Analytics caracteriza o desenho instrucional e intervenções observáveis. Não
mede compreensão, retenção, transferência, atenção, esforço, dificuldade ou
qualidade global. Esses resultados exigem pergunta, população, instrumento,
tratamento de dados ausentes e análise definidos no protocolo da pesquisa.

Consulte o [Guia do pesquisador](guia-pesquisador.md) para formular perguntas e
registrar limites de inferência.
