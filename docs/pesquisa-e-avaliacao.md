# Pesquisa e avaliação

Este documento organiza o AraLearn como objeto de pesquisa educacional e como produto que precisa de critérios para decisões de arquitetura.

Leitura complementar:

- [Fundamentos e evidências](fundamentos-e-evidencias.md)
- [Guia de uso do app](uso-do-app.md)

## Objeto

O AraLearn pode ser investigado como uma infraestrutura aberta para transformar informação em prática de aprendizagem.

O foco não é apenas geração automática de cards. O objeto mais amplo é o ciclo:

```text
informação
  -> transformação didática
  -> prática ativa
  -> revisão
  -> edição
  -> reorganização
  -> percurso auditável
```

## Hipótese central

A hipótese de trabalho é que microssequências didáticas podem reduzir fricção em estudo autodirigido, especialmente em cenários de atenção fragmentada.

Isso pode ocorrer porque o sistema:

- transforma dúvidas em ações de estudo;
- oferece unidades praticáveis;
- preserva progresso local;
- permite revisão e edição;
- favorece retomada;
- organiza material em cursos;
- evita que o estudo seja reduzido a resumo genérico.

## Perguntas de pesquisa

Perguntas possíveis:

- Microssequências melhoram retenção em comparação com leitura simples ou com resumo?
- Lacunas por opções são mais adequadas que digitação livre em quais contextos?
- A geração assistida por IA generativa preserva o sentido do material original?
- O painel de revisão melhora a qualidade final dos cards?
- Rascunhos cumulativos ajudam o estudante a construir cursos pessoais?
- Mapa de domínio e variação de prática melhoram a cobertura sem aumentar redundância?
- Estudantes trabalhadores se beneficiam de percursos didáticos menores e revisáveis?
- O uso offline com persistência local favorece retomada?
- Que tipos de card funcionam melhor por disciplina?
- A checagem local de superficialidade reduz explicações rasas sem inflar a densidade textual?

## Métricas possíveis

Métricas de uso:

- tempo até iniciar prática;
- número de retomadas;
- cards concluídos;
- versões criadas;
- rascunhos consolidados;
- pedidos de edição por microssequência.

Métricas didáticas:

- acerto em lacunas;
- acerto em múltipla escolha;
- reincidência de erro;
- diversidade de prática por capacidade;
- itens explicados sem prática;
- itens com prática única;
- itens com erro comum tratado;
- itens com formato de prova coberto;
- necessidade de ver resposta;
- qualidade de distratores;
- clareza percebida;
- retenção depois de intervalo.

Métricas de autoria:

- tempo para criar uma microssequência;
- quantidade de ajustes necessários;
- proporção de cards aceitos;
- proporção de cards descartados;
- tipos de contêiner usados.

## Critérios de qualidade

Uma decisão de produto deve considerar:

- valor didático;
- clareza para o usuário;
- custo cognitivo;
- robustez técnica;
- portabilidade do JSON;
- facilidade de validação;
- preservação de autonomia do estudante;
- adequação a modelos menores;
- possibilidade de avaliação empírica.

## Riscos

Riscos pedagógicos:

- transformar explicações frágeis em material praticável sem revisão;
- trocar decomposição por resumo genérico;
- criar lacunas ambíguas;
- usar alternativas pouco plausíveis;
- fragmentar demais o conteúdo;
- reduzir estudo a desempenho imediato;
- esconder divergências ou controvérsias de uma área.

Riscos técnicos:

- depender de modelo específico;
- aceitar JSON inválido ou incompleto;
- misturar rascunho e curso definitivo;
- perder histórico de revisão;
- exportar estado local quando o objetivo era apenas exportar estrutura.

Riscos éticos:

- registrar dados sensíveis de aprendizagem sem clareza;
- usar erros do estudante de forma punitiva;
- reduzir autonomia sobre o próprio percurso;
- confundir assistência com autoridade final.

## Desenhos de estudo

Possíveis desenhos:

- estudo piloto com poucos usuários;
- comparação entre leitura e microssequência;
- comparação entre microssequência escrita manualmente e gerada por IA generativa;
- análise qualitativa de revisões feitas no painel;
- avaliação de lacunas por opções;
- análise de retenção depois de alguns dias;
- estudo de caso com estudantes trabalhadores;
- análise de qualidade de JSON gerado por diferentes modelos.

## Decisões que dependem de evidência

Algumas decisões não devem ser tomadas apenas por preferência visual ou facilidade técnica:

- quantidade ideal de cards por microssequência;
- uso de lacunas por opções ou por digitação;
- entrada de `flow` na geração automática;
- reposicionamento de cards isolados;
- eventual exportação de histórico auxiliar local;
- nível de intervenção automática na edição;
- critérios para aceitar ou rejeitar uma geração.

Também precisam de evidência:

- quando uma variação de prática consolida de fato, em vez de repetir;
- quando um item merece nova microssequência, em vez de revisão da existente;
- quando a checagem local de superficialidade está sensível demais ou permissiva demais.

Essas decisões devem ser orientadas por testes, revisão didática e evidência de uso.

## Política de alegações

Ao escrever sobre o AraLearn, convém separar:

- `resultado já sustentado`: por exemplo, que o app usa prática ativa, validação estrutural e persistência local;
- `decisão plausível`: por exemplo, o desenho específico do `domainMap`;
- `hipótese aberta`: por exemplo, o efeito líquido dos presets e do tamanho ideal de microssequência.

Essa separação evita transformar documentação de produto em retórica sem lastro.
