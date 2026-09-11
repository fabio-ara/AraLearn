# Como contribuir com o AraLearn

Uma contribuição começa por um problema que outra pessoa consiga reconhecer e termina
com uma mudança que possa ser conferida. Como a mesma regra pode aparecer na interface,
no servidor e nos clientes externos de autoria, uma alteração de comportamento inclui
os contratos, testes e documentos afetados.

## Antes de começar

Leia o [README](README.md) para conhecer o produto e a [documentação](docs/README.md)
para localizar a área afetada. Depois, verifique os comandos do `package.json` e os
testes já existentes. Para executar as ferramentas JavaScript do projeto, use
[Node.js 22](https://nodejs.org/en/download) ou mais recente. Para gerar o aplicativo
Android, são necessários também o [JDK 17](https://developer.android.com/build/jdks),
conjunto de ferramentas de desenvolvimento Java, e o [Android SDK
36](https://developer.android.com/studio/intro/update#sdk-manager), que fornece as
ferramentas e interfaces da plataforma Android. O guia de
[Implantação](docs/implantacao.md#diagnosticar-a-máquina) reúne as demais ferramentas e
suas fontes oficiais.

O gerenciador de pacotes npm acompanha o Node.js. O comando abaixo instala as
versões de dependências registradas no repositório, para que diferentes pessoas
trabalhem com o mesmo conjunto de bibliotecas:

```powershell
npm ci
```

Não coloque credenciais reais em arquivos versionados. URL pública e chave publicável do
Supabase são configurações do aplicativo; senha, `service_role` e segredos de assinatura
pertencem ao ambiente seguro de execução.

## Conceitos que orientam a mudança

### Arquivo de origem e artefato gerado

Alguns arquivos são editados por pessoas; outros são produzidos por scripts. Por
exemplo, o aplicativo Android é preparado a partir das fontes web. Corrija a fonte ou o
gerador, depois regenere o artefato. Alterar somente o resultado gerado faz a correção
desaparecer na próxima execução.

### Núcleo e pacotes de componentes

O núcleo cuida do que é comum às unidades, como navegação, resposta e edição. Cada
[pacote de componente](docs/componentes-didaticos.md) define os dados aceitos e a
apresentação e as regras pedagógicas de uma representação específica. Quando surgir um novo tipo de
representação, implemente-o como pacote; uma exceção visual no núcleo espalharia uma
regra particular pela infraestrutura compartilhada.

### Persistência relacional e migrações

O [Supabase](docs/supabase.md) fornece autenticação, arquivos e o banco PostgreSQL, onde
o estado compartilhado fica em tabelas relacionadas. O IndexedDB é o armazenamento do
navegador usado para a cópia local e para operações pendentes, como explica
[persistência e sincronização](docs/persistencia-relacional.md). Uma mudança na
estrutura ou nas regras do banco recebe uma migração: arquivo versionado em SQL, a
linguagem usada para alterar o banco, que leva outros ambientes ao mesmo estado. Uma
edição manual do banco remoto não cumpre essa função.

### Contratos e compatibilidade interna

Os esquemas de dados especificam campos, tipos e limites aceitos e rejeitam campos
desconhecidos. Assim, o conteúdo pode ser validado antes de ser apresentado ou salvo.
Quando um contrato muda, atualize produtor, consumidor, dados de teste e testes no mesmo
lote. Não mantenha leitura silenciosa de formatos removidos.

## Preparar uma contribuição

Tenha uma cópia atualizada do repositório. A árvore de trabalho é o conjunto de arquivos
da sua cópia local; a comparação com a versão salva no Git deve permitir identificar
com clareza o que você modificou.

1. Crie uma branch, linha de trabalho separada, a partir de `main`.
2. Delimite um problema observável e os arquivos responsáveis por ele.
3. Reproduza a falha ou registre o comportamento atual antes de editar.
4. Implemente a menor mudança que preserve a separação de responsabilidades.
5. Para mudanças de comportamento, acrescente ou atualize testes que falhariam
   sem a correção.
6. Atualize a documentação pública quando comportamento, fluxo, contrato ou
   operação mudar.
7. Execute as validações adequadas.
8. Revise a comparação das alterações (*diff*) para retirar credenciais, arquivos incidentais e código morto.
9. Crie commits curtos, claros e em português.
10. Abra uma solicitação de integração (*pull request*) com problema, solução,
    impacto e validações.

Outra pessoa consegue compreender a necessidade, executar os testes e relacionar cada
arquivo alterado ao mesmo objetivo.

Se a branch acumulou experimentos, reorganize os commits antes da solicitação, sem
apagar trabalho de outras pessoas. Se uma validação falhar por dependência externa
opcional, registre qual foi ignorada e por quê; falhas do comportamento alterado
precisam ser corrigidas.

## Escolher as validações

Escolha as verificações pelo efeito da mudança. Para documentação, execute `npm run
audit:docs` e confira links e afirmações alteradas. Para código, comece pelo teste que
reproduz o comportamento afetado e pela análise automática chamada *lint*. Uma mudança
que atravessa contratos, persistência ou autorização também precisa das provas dessas
fronteiras.

```powershell
npm run test:focal -- tests/runtime/ci-path-classification.test.js
npm run lint
npm run audit:docs
```

O arquivo do exemplo testa como a integração contínua (CI) classifica mudanças;
substitua-o pelos testes pertinentes à contribuição. `npm test` executa a preparação e a
suíte ampla. As exigências para integrar e publicar estão no [fluxo de
validação](docs/implantacao.md#validar-antes-da-publicação).

Acrescente verificações conforme a área:

| Área | Validações principais |
| --- | --- |
| Exemplo de curso | `npm run validate:example` |
| [Autoria por MCP](docs/autoria-mcp.md), conexão de assistentes às ferramentas do AraLearn | `npm run test:authoring:mcp` |
| [Autoria por Actions](docs/autoria-actions.md), ações descritas para o cliente conversacional | `npm run test:authoring:actions` e `npm run actions:openapi:check` |
| Componentes didáticos | testes do pacote, galeria visual e curso de componentes |
| Integração Android | `npm run android:debug` e verificação do arquivo instalável (APK) |
| Banco e funções executadas no servidor | [Testes locais](docs/supabase.md): Deno executa os testes das funções, e pgTAP verifica o banco |
| Documentação | `npm run audit:docs` e verificação de links locais |

A automação distingue alterações apenas documentais de candidatas que exigem validação
integral. Nesta última, usa Node.js 22 e Java 17 e verifica o aplicativo, o banco e os
artefatos web e Android antes da publicação.

## Alterar ou criar um componente didático

Defina primeiro o que o estudante precisa fazer, como comparar valores ou identificar
uma relação. Essa é a operação-alvo da tarefa. Justifique por que um texto, uma tabela
ou um pacote existente não a atende adequadamente.

1. Consulte a convenção acadêmica da área representada.
2. Defina os dados e as relações que representam o assunto. Num fluxograma, por
   exemplo, a autoria declara etapas e ligações; o componente calcula onde
   desenhá-las. Esse é o papel do contrato semântico, descrito na referência de
   [componentes](docs/componentes-didaticos.md).
3. Implemente o pacote isolado do núcleo.
4. Declare campos textuais editáveis e alvos de prática reais.
5. Cubra exposição e as modalidades de resposta que façam sentido; não aplique
   uma modalidade artificial apenas para uniformizar a galeria.
6. Teste rótulos longos, várias lacunas independentes, temas claro e escuro e
   larguras móveis.
7. Teste uma representação complexa, não apenas o exemplo mínimo.
8. Regenere o catálogo de teste do curso.

O catálogo descreve quando escolher o componente, o modelo obtém seu contrato somente
após a escolha, e o aplicativo renderiza sem sobreposição ou medição autoral de pixels.

Se apenas um exemplo funciona, o contrato ou a disposição visual está específica demais.
Se a correção exige uma condição no núcleo, a responsabilidade provavelmente está no
pacote. Se lacunas compartilham estado, cada alvo precisa de identidade própria e teste
de interação.

## Alterar o banco de dados

Crie uma nova migração no diretório adotado pelo projeto. Ela deve poder ser aplicada a
partir do estado anterior e produzir o mesmo esquema em outro ambiente. Atualize
políticas de segurança por linha, funções, tipos gerados e testes correspondentes.

Não reescreva uma migração já aplicada como forma de consertar produção. Uma nova
migração torna a sequência auditável e permite que ambientes existentes alcancem o mesmo
resultado.

## Alterar a documentação

Os [princípios editoriais](docs/principios-editoriais.md) explicam as escolhas de
organização, linguagem e fontes. Cada capítulo desenvolve um assunto; quando
depende de outro, oferece contexto suficiente e um link para aprofundar. Uma
correção pode mudar a distribuição do conteúdo entre páginas, desde que conserve
as relações necessárias à compreensão e a profundidade disponível no conjunto.

A contribuição documental inclui a conferência do comportamento descrito, das
fontes e dos links, seguida da leitura integral do texto. Na prosa, nomes comuns
como curso, explicação e unidade de estudo ficam em minúsculas; os rótulos da
interface conservam sua grafia. Os arquivos usam UTF-8 sem BOM, isto é, sem a
marca inicial de codificação que alguns editores acrescentam.

## Alterar dependências locais ou Android

Para bibliotecas empacotadas em `public/vendor`, siga o procedimento do [inventário de
bibliotecas locais](public/vendor/README.md). Não edite arquivos minificados para
reparar um componente.

Para Android, altere o invólucro apenas quando a responsabilidade for realmente nativa.
O domínio continua na aplicação web. Gere o APK, inspecione o artefato e execute o
roteiro do [módulo Android](android/README.md).

## Solicitação de integração

A solicitação de integração deve registrar:

- problema reproduzido;
- comportamento anterior e comportamento esperado;
- decisão técnica e alternativas relevantes;
- risco para persistência, uso sem conexão, autorização e acessibilidade;
- testes executados e resultados;
- capturas quando houver mudança visual;
- migração ou procedimento operacional, quando aplicável.

Mantenha `main` como linha pública legível. Antes da integração, o Git permite
reorganizar os commits (*rebase*) ou reunir vários em um só (*squash*). Essas
operações são úteis quando tornam a evolução da mudança mais clara; em branches
compartilhadas, a reorganização precisa ser combinada com quem também trabalha nelas.

## Diagnóstico geral

| Situação | Ação |
| --- | --- |
| Um arquivo gerado volta ao estado anterior | Localize e corrija a fonte ou o gerador. |
| O teste passa isoladamente e falha na suíte | Procure estado global, ordem de execução ou artefato não regenerado. |
| Uma mudança visual exige muitos valores fixos | Reavalie o motor de disposição ou o contrato semântico do pacote. |
| A migração funciona apenas no banco pessoal | Recrie um ambiente limpo e teste a sequência completa. |
| A documentação contradiz o aplicativo | Use código e testes como evidência, corrija o texto e adicione uma verificação quando possível. |
