# Como contribuir com o AraLearn

Uma contribuição deve resolver um problema identificável e conservar as regras de
autoria e estudo do AraLearn. Quando a mudança afeta um comportamento, atualize também
os contratos, testes e documentos que o descrevem.

## Antes de começar

Leia o [README](README.md) para conhecer o produto e a [documentação](docs/README.md)
para localizar a área afetada. Depois, verifique os comandos do `package.json` e os
testes já existentes. O projeto usa [Node.js 22](https://nodejs.org/en/download) ou mais
recente; a camada Android também exige [JDK
17](https://developer.android.com/build/jdks) e [Android SDK
36](https://developer.android.com/studio/intro/update#sdk-manager). O guia de
[Implantação](docs/implantacao.md#diagnosticar-a-máquina) reúne as demais ferramentas e
suas fontes oficiais.

Instale as dependências de forma reproduzível:

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

O núcleo controla navegação, estado de resposta, edição, seleção e integração com
assistência. Cada componente pertence a um [pacote](docs/componentes-didaticos.md) que
define os dados aceitos, sua apresentação e regras pedagógicas próprias. Um novo tipo de
representação deve ser adicionado como pacote; não acrescente ao núcleo uma exceção para
um caso visual específico.

### Persistência relacional e migrações

O [Supabase](docs/supabase.md) fornece autenticação, arquivos e o banco PostgreSQL, onde
o estado compartilhado é armazenado em tabelas relacionadas. O IndexedDB é o
armazenamento estruturado do navegador: mantém a cópia local e as operações pendentes
descritas em [persistência e sincronização](docs/persistencia-relacional.md). Mudanças
do banco são registradas em migrações ordenadas e versionadas. Não edite um banco remoto
manualmente como substituto de uma migração reproduzível.

### Contratos e compatibilidade interna

Os esquemas de dados especificam campos, tipos e limites aceitos e rejeitam campos
desconhecidos. Assim, o conteúdo pode ser validado antes de ser apresentado ou salvo.
Quando um contrato muda, atualize produtor, consumidor, dados de teste e testes no mesmo
lote. Não mantenha leitura silenciosa de formatos removidos.

## Preparar uma contribuição

### Pré-condição

Tenha uma cópia atualizada do repositório e uma árvore de trabalho que permita
identificar suas próprias alterações.

### Passos

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

### Resultado esperado

Outra pessoa consegue compreender a necessidade, executar os testes e relacionar cada
arquivo alterado ao mesmo objetivo.

### Recuperação

Se a branch acumulou experimentos, reorganize os commits antes da solicitação, sem
apagar trabalho de outras pessoas. Se uma validação falhar por dependência externa
opcional, registre qual foi ignorada e por quê; falhas do comportamento alterado
precisam ser corrigidas.

## Escolher as validações

Escolha as verificações pelo efeito da mudança. Para documentação, execute `npm run
audit:docs` e confira links e afirmações alteradas. Para código, comece por testes do
comportamento afetado e pelo lint; amplie a verificação quando houver mudança em
contratos compartilhados, persistência ou autorização.

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
| autoria por MCP | `npm run test:authoring:mcp` |
| autoria por Actions | `npm run test:authoring:actions` e `npm run actions:openapi:check` |
| Componentes didáticos | testes do pacote, galeria visual e curso de componentes |
| Integração Android | `npm run android:debug` e verificação do APK |
| Banco e Edge Functions | testes Deno, pgTAP e testes integrados do ambiente local |
| Documentação | `npm run audit:docs` e verificação de links locais |

A automação distingue alterações apenas documentais de candidatas que exigem validação
integral. Nesta última, usa Node.js 22 e Java 17 e verifica o aplicativo, o banco e os
artefatos web e Android antes da publicação.

## Alterar ou criar um componente didático

### Pré-condição

Defina primeiro o que o estudante precisa fazer, como comparar valores ou identificar
uma relação. Essa é a operação-alvo da tarefa. Justifique por que um texto, uma tabela
ou um pacote existente não a atende adequadamente.

### Passos

1. Consulte a convenção acadêmica da área representada.
2. Defina um contrato semântico de alto nível, sem coordenadas ou sintaxe da
   biblioteca gráfica.
3. Implemente o pacote isolado do núcleo.
4. Declare campos textuais editáveis e alvos de prática reais.
5. Cubra exposição e as modalidades de resposta que façam sentido; não aplique
   uma modalidade artificial apenas para uniformizar a galeria.
6. Teste rótulos longos, várias lacunas independentes, temas claro e escuro e
   larguras móveis.
7. Teste uma representação complexa, não apenas o exemplo mínimo.
8. Regenere o catálogo de teste do curso.

### Resultado esperado

O catálogo descreve quando escolher o componente, o modelo obtém seu contrato somente
após a escolha, e o aplicativo renderiza sem sobreposição ou medição autoral de pixels.

### Diagnóstico

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

Determine primeiro a função do documento e o que o leitor precisa compreender. Explique
a finalidade de um conceito antes de introduzir seu nome técnico e encaminhe ao
documento canônico no ponto em que ele passa a ser necessário. Em tarefas operacionais,
informe as condições necessárias, o procedimento, o resultado e a recuperação
pertinente; explique o comportamento sem conexão quando ele afetar a tarefa.

Na prosa, use minúsculas para nomes comuns como curso, explicação, fonte e unidade de
estudo. Preserve a grafia de títulos, identificadores e rótulos reais da interface. Ao
retirar conteúdo de uma página, confira se o destino conserva a explicação; a completude
pertence ao conjunto da documentação. Distingua comportamento implementado, decisão de
design e evidência de pesquisa. Após a redação, releia o documento inteiro procurando
perdas de sentido, jargão desnecessário e conceitos que aparecem sem explicação.

Preserve UTF-8 sem BOM, acentuação e links relativos válidos. Não descreva processos
internos de conversa ou autoria do texto. Afirmações acadêmicas devem apontar para
referências existentes; instruções técnicas devem ser confirmadas no código ou em
documentação oficial.

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

Mantenha `main` como linha pública legível. Reorganize ou reúna commits com rebase ou
squash quando isso tornar o histórico mais claro e evite commits de percurso sem valor
duradouro.

## Diagnóstico geral

| Situação | Ação |
| --- | --- |
| Um arquivo gerado volta ao estado anterior | Localize e corrija a fonte ou o gerador. |
| O teste passa isoladamente e falha na suíte | Procure estado global, ordem de execução ou artefato não regenerado. |
| Uma mudança visual exige muitos valores fixos | Reavalie o motor de disposição ou o contrato semântico do pacote. |
| A migração funciona apenas no banco pessoal | Recrie um ambiente limpo e teste a sequência completa. |
| A documentação contradiz o aplicativo | Use código e testes como evidência, corrija o texto e adicione uma verificação quando possível. |
