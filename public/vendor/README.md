# Bibliotecas locais de diagramação e visualização

Este diretório conserva dependências executadas diretamente no navegador. Elas
são mantidas no repositório para que a aplicação web e o APK usem a mesma
versão do renderizador e para que representações já carregadas continuem
disponíveis sem conexão.

Arquivos versionados aqui não devem ser alterados manualmente para corrigir um
caso visual. A correção pertence ao pacote do componente, ao contrato semântico
ou ao processo documentado de atualização da biblioteca.

## Inventário

| Arquivo | Origem | Função no AraLearn |
| --- | --- | --- |
| `viz-global.js` | Viz.js 3.27.0, com Graphviz 14.1.5 em WebAssembly | Calcula disposição de fluxogramas e diagramas relacionais. |
| `vega.min.js` | Vega 6.3.1 | Executa a especificação de visualizações estatísticas. |
| `vega-lite.min.js` | Vega-Lite 6.4.3 | Compila contratos de alto nível para Vega. |
| `vega-interpreter.js` | vega-interpreter 2.3.1 | Avalia árvores de expressão sem geração dinâmica de código. |
| `venn.esm.js` | `@upsetjs/venn.js` 2.0.0 | Calcula regiões e contornos de diagramas de Venn e Euler. |

O formato interno de Vega-Lite e a linguagem DOT não são contratos de autoria.
O modelo fornece dados semânticos ao pacote; o pacote produz a especificação
técnica. Essa separação impede que conteúdo de curso fique acoplado à versão de
uma biblioteca de desenho.

## Por que as dependências são locais

Carregar uma biblioteca por CDN tornaria a primeira renderização dependente da
rede e permitiria que web e APK recebessem arquivos diferentes. A cópia local
torna a versão auditável, reproduzível e disponível no aplicativo empacotado.

`vega-interpreter.js` também atende à política de segurança do aplicativo: ele
interpreta a árvore de expressões em vez de criar funções JavaScript
dinamicamente. Isso permite manter uma política de conteúdo mais restrita.

## Atualizar o interpretador Vega

O interpretador é o único arquivo deste diretório com gerador automatizado no
repositório.

### Pré-condição

Instale as dependências com `npm ci` e confirme que a versão declarada de
`vega-interpreter` continua exatamente sincronizada com o gerador.

### Passos

```powershell
npm run resources:vendor
npm test
```

O script `scripts/buildVegaInterpreterVendor.mjs` transforma a distribuição
instalada em um arquivo clássico compatível com o aplicativo e verifica padrões
esperados de importação e exportação.

### Resultado esperado

`vega-interpreter.js` é reproduzido deterministicamente e a suíte confirma que
o arquivo versionado corresponde à versão instalada.

### Recuperação

Se o gerador rejeitar a estrutura do pacote, a versão do projeto de origem mudou de forma
incompatível. Não remova a verificação: revise a transformação e os testes
antes de atualizar o arquivo versionado.

## Atualizar as demais bibliotecas

`viz-global.js`, `vega.min.js`, `vega-lite.min.js` e `venn.esm.js` não possuem
um gerador de repositório equivalente. Uma atualização deliberada deve:

1. identificar versão, origem e licença do artefato;
2. atualizar a dependência correspondente em `package.json` e no arquivo de
   dependências fixadas;
3. substituir o arquivo empacotado sem remover avisos de licença;
4. testar temas claro e escuro, larguras móveis e execução sem conexão;
5. executar a suíte de componentes e a auditoria do APK;
6. atualizar este inventário.

Não misture atualização de biblioteca com ajustes manuais em código
minificado. Se o projeto de origem não fornecer um artefato adequado, adicione um
gerador verificável antes de versionar o resultado.

## Validação específica

```powershell
npm run resources:vendor -- --check
npm run lint
npm test
```

O primeiro comando confere o artefato do interpretador. Os testes de galeria e
do Curso de componentes exercitam os renderizadores dentro do aplicativo real.

## Diagnóstico

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Um gráfico funciona na web, mas não no APK | Arquivo ausente ou preparação desatualizada | Gere novamente a aplicação Android e inspecione o APK. |
| A política de conteúdo bloqueia uma expressão Vega | Interpretador ausente ou caminho que tenta gerar código | Recrie `vega-interpreter.js` e confira a integração do pacote. |
| O teste `--check` acusa diferença | Arquivo versionado não corresponde à dependência instalada | Execute o gerador, revise a alteração e mantenha versão e arquivo de dependências sincronizados. |
| Um diagrama específico fica ilegível | Contrato ou pacote não trata aquele caso | Corrija o pacote e acrescente um caso de teste; não edite o arquivo empacotado. |

## Projetos e licenças

- [Viz.js](https://github.com/mdaines/viz-js) e sua [licença MIT](https://github.com/mdaines/viz-js/blob/main/LICENSE)
- [Graphviz](https://graphviz.org/)
- [Vega](https://github.com/vega/vega)
- [Vega-Lite](https://github.com/vega/vega-lite)
- [vega-interpreter](https://github.com/vega/vega/tree/main/packages/vega-interpreter)
- [venn.js](https://upset.js.org/venn.js/) e sua [licença](https://github.com/upsetjs/venn.js/blob/main/LICENSE)
