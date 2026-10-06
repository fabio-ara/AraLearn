# Bibliotecas locais de diagramação e visualização

Gráficos e diagramas precisam de cálculos que não pertencem ao conteúdo do curso. As
bibliotecas deste diretório fazem esse trabalho no navegador. Manter uma cópia delas no
repositório garante que site e Android usem os mesmos arquivos e que uma representação
já carregada continue disponível sem conexão.

Uma correção visual é feita no pacote do componente ou em seu contrato de dados.
Atualizações das bibliotecas seguem o procedimento deste capítulo, preservando o
artefato publicado pelo projeto de origem ou sua transformação reproduzível.

Os pacotes transformam dados do curso em representações visuais. A divisão entre dados,
pacote e biblioteca está descrita em [componentes
didáticos](../../docs/componentes-didaticos.md).

## Inventário

| Arquivo | Origem | Função no AraLearn |
| --- | --- | --- |
| `viz-global.js` | [Viz.js](https://github.com/mdaines/viz-js) 3.27.0, com [Graphviz](https://graphviz.org/) 14.1.5 em WebAssembly, formato de código executável pelo navegador | Calcula disposição de fluxogramas e diagramas relacionais. |
| `vega.min.js` | [Vega](https://github.com/vega/vega) 6.3.1 | Executa a especificação de visualizações estatísticas. |
| `vega-lite.min.js` | [Vega-Lite](https://github.com/vega/vega-lite) 6.4.3 | Compila contratos de alto nível para Vega. |
| `vega-interpreter.js` | vega-interpreter 2.3.1 | Calcula expressões dos gráficos sem gerar código JavaScript durante a execução. |
| `venn.esm.js` | `@upsetjs/venn.js` 2.0.0 | Calcula regiões e contornos de diagramas de Venn e Euler. |

Vega-Lite descreve um gráfico por seus dados e relações visuais; DOT descreve os nós e
as ligações de um diagrama. A autoria fornece ao pacote os elementos e relações que
precisam aparecer, e o pacote produz a especificação
técnica esperada pela biblioteca. Assim, uma mudança na biblioteca de desenho não exige
reescrever o conteúdo do curso.

## Por que as dependências são locais

Uma rede de distribuição de conteúdo (CDN) poderia fornecer essas bibliotecas a partir
de outro servidor. Isso faria a primeira apresentação depender da rede e poderia levar
site e APK a arquivos diferentes. A cópia local torna a versão verificável,
reproduzível e disponível no aplicativo empacotado.

`vega-interpreter.js` também atende à política de segurança do aplicativo: ele calcula
as expressões dos gráficos em vez de criar funções JavaScript dinamicamente. Isso
permite manter uma política de conteúdo mais restrita.

## Atualizar o interpretador Vega

Entre os renderizadores da tabela, o interpretador possui um gerador automatizado no
repositório.

### Pré-condição

Instale as dependências com `npm ci` e confirme que a versão declarada de
`vega-interpreter` continua exatamente sincronizada com o gerador.

### Passos

```powershell
npm run resources:vendor
npm test
```

O script `scripts/buildVegaInterpreterVendor.mjs` transforma a distribuição instalada em
um arquivo clássico compatível com o aplicativo e verifica padrões esperados de
importação e exportação.

### Resultado esperado

`vega-interpreter.js` é reproduzido deterministicamente e a suíte confirma que o arquivo
versionado corresponde à versão instalada.

### Recuperação

Se o gerador rejeitar a estrutura do pacote, a distribuição instalada difere do
formato que a transformação espera. Confira sua versão, revise a transformação e os
testes e só então atualize o arquivo versionado.

## Atualizar as demais bibliotecas

`viz-global.js`, `vega.min.js`, `vega-lite.min.js` e `venn.esm.js` não possuem um
gerador equivalente no repositório. Como alguns são compactados para distribuição — os
arquivos `*.min.js` —, origem e integridade precisam ser verificadas durante uma
atualização:

1. identificar versão, origem e licença do artefato;
2. atualizar a dependência correspondente em `package.json` e no arquivo de
   dependências fixadas;
3. substituir o arquivo empacotado sem remover avisos de licença;
4. testar temas claro e escuro, larguras móveis e execução sem conexão;
5. executar a suíte de componentes e a auditoria do APK;
6. atualizar este inventário.

Mantenha a atualização da biblioteca reproduzível a partir da origem registrada. Se o
projeto de origem exigir adaptação para o navegador, acrescente um gerador verificável
antes de versionar o resultado.

## Validação específica

Confira se o arquivo gerado corresponde à dependência instalada e depois execute as
verificações gerais do código:

```powershell
npm run resources:vendor -- --check
npm run bibliography:vendor -- --check
npm run lint
npm test
```

Os dois primeiros comandos conferem, respectivamente, o interpretador e os módulos
bibliográficos gerados. Os testes de galeria e do curso de componentes exercitam os
renderizadores dentro do aplicativo.

## Diagnóstico

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Um gráfico funciona no site, mas não no Android | Arquivo ausente ou preparação desatualizada | Gere novamente a aplicação Android e inspecione o APK. |
| A política de conteúdo bloqueia uma expressão Vega | Interpretador ausente ou caminho que tenta gerar código | Recrie `vega-interpreter.js` e confira a integração do pacote. |
| O teste `--check` acusa diferença | Arquivo versionado não corresponde à dependência instalada | Execute o gerador, revise a alteração e mantenha versão e arquivo de dependências sincronizados. |
| Um diagrama específico fica ilegível | Contrato ou pacote não trata aquele caso | Corrija o pacote e acrescente um caso de teste; não edite o arquivo empacotado. |

## Dependências bibliográficas

A subpasta `bibliography/` conserva os avisos e as licenças de citeproc-js e dos estilos
e traduções de rótulos da Citation Style Language (CSL), usados para formatar citações e
referências. Os arquivos originais ficam em
[`src/bibliography/upstream`](../../src/bibliography/upstream), e `npm run
bibliography:vendor` gera os módulos a partir desses arquivos com verificação de
integridade. O motor e os estilos são empacotados para uso sem conexão; não são baixados
durante a consulta de uma referência.

Consulte o [aviso de distribuição](bibliography/NOTICE.txt) antes de atualizá-los. Ele
registra as versões, fontes, adaptações e licenças específicas, incluindo CPAL-1.0 e
CC-BY-SA-3.0. A licença MIT do aplicativo não substitui esses termos.

## Projetos e licenças

- [Viz.js](https://github.com/mdaines/viz-js) e sua [licença MIT](https://github.com/mdaines/viz-js/blob/master/LICENSE)
- [Graphviz](https://graphviz.org/)
- [Vega](https://github.com/vega/vega)
- [Vega-Lite](https://github.com/vega/vega-lite)
- [vega-interpreter](https://github.com/vega/vega/tree/main/packages/vega-interpreter)
- [venn.js](https://upset.js.org/venn.js/) e sua [licença](https://github.com/upsetjs/venn.js/blob/main/LICENSE)
