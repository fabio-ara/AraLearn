# Como contribuir com o AraLearn

Uma contribuição precisa preservar duas qualidades ao mesmo tempo: o
comportamento do produto e a possibilidade de verificar por que ele se comporta
assim. Por isso, código, contratos, testes e documentação formam uma única
mudança quando tratam da mesma responsabilidade.

## Antes de começar

Leia o [README](README.md) para conhecer o produto e a
[documentação](docs/README.md) para localizar a área afetada. Depois, verifique
os comandos do `package.json` e os testes já existentes. O projeto usa Node.js
22 ou mais recente; a camada Android também exige JDK 17 e Android SDK 36.

Instale as dependências de forma reproduzível:

```powershell
npm ci
```

Não coloque credenciais reais em arquivos versionados. URL pública e chave
publicável do Supabase são configuração de runtime; senha, `service_role` e
segredos de assinatura pertencem ao ambiente seguro de execução.

## Conceitos que orientam a mudança

### Fonte canônica e artefato gerado

Alguns arquivos são editados por pessoas; outros são produzidos por scripts.
Por exemplo, packages de autoria geram arquivos em
`docs/downloads/authoring/`, e o runtime Android é preparado a partir das
fontes web. Corrija a fonte ou o gerador, depois regenere o artefato. Alterar
somente o resultado gerado faz a correção desaparecer na próxima execução.

### Kernel e packages de resources

O kernel controla navegação, estado de resposta, edição, seleção e integração
com assistência. Cada resource pertence a um package com contrato,
renderização e regras pedagógicas próprias. Um novo tipo de representação deve
ser adicionado como package; não acrescente ao kernel uma exceção para um caso
visual específico.

### Persistência relacional e migrações

O PostgreSQL/Supabase guarda o estado compartilhado; o IndexedDB mantém a
réplica e as operações pendentes do dispositivo. Mudanças de banco são
migrações ordenadas e versionadas. Não edite um banco remoto manualmente como
substituto de uma migração reproduzível.

### Contratos e compatibilidade interna

Schemas fechados permitem validar conteúdo antes de renderizar ou persistir.
Quando um contrato muda, atualize produtor, consumidor, fixtures e testes no
mesmo lote. Não introduza fallback silencioso para formatos removidos.

## Preparar uma contribuição

### Pré-condição

Tenha uma cópia atualizada do repositório e uma árvore de trabalho que permita
identificar suas próprias alterações.

### Passos

1. Crie uma branch temática a partir de `main`.
2. Delimite um problema observável e os arquivos responsáveis por ele.
3. Reproduza a falha ou registre o comportamento atual antes de editar.
4. Implemente a menor mudança que preserve a separação de responsabilidades.
5. Acrescente ou atualize testes que falhariam sem a correção.
6. Atualize a documentação pública quando comportamento, fluxo, contrato ou
   operação mudar.
7. Execute as validações adequadas.
8. Revise o diff para retirar credenciais, arquivos incidentais e código morto.
9. Crie commits curtos, claros e em português.
10. Abra um pull request com problema, solução, impacto e validações.

### Resultado esperado

Outra pessoa consegue compreender a necessidade, executar os testes e
relacionar cada arquivo alterado ao mesmo objetivo.

### Recuperação

Se a branch acumulou experimentos, reorganize os commits antes do pull request,
sem apagar trabalho de outras pessoas. Se uma validação falhar por dependência
externa opcional, registre qual foi ignorada e por quê; falhas do comportamento
alterado precisam ser corrigidas.

## Escolher as validações

Use a suíte completa como base:

```powershell
npm test
npm run lint
npm run audit:docs
```

Acrescente verificações conforme a área:

| Área | Validações principais |
| --- | --- |
| Exemplo de curso | `npm run validate:example` |
| Packages de autoria | `npm run authoring:packages` e `npm run test:authoring-packages` |
| Resources | testes do package, galeria visual e curso de resources |
| Integração Android | `npm run android:debug` e testes de cutover do Android |
| Banco e Edge Functions | testes Deno, pgTAP e smokes do ambiente local aplicáveis |
| Documentação | `npm run audit:docs` e verificação de links locais |

A automação pública usa Node.js 22 e Java 17, valida o app, banco, packages,
artefatos e APK antes da publicação do site.

## Alterar ou criar um resource

### Pré-condição

Defina primeiro o gesto cognitivo que a representação resolve e por que texto,
tabela ou um package existente não o resolvem adequadamente.

### Passos

1. Consulte a convenção acadêmica da área representada.
2. Defina um contrato semântico de alto nível, sem coordenadas ou sintaxe da
   biblioteca gráfica.
3. Implemente o package isolado do kernel.
4. Declare campos textuais editáveis e alvos de prática reais.
5. Cubra exposição e as modalidades de resposta que façam sentido; não aplique
   uma modalidade artificial apenas para uniformizar a galeria.
6. Teste rótulos longos, várias lacunas independentes, temas claro e escuro e
   larguras móveis.
7. Teste uma representação complexa, não apenas o exemplo mínimo.
8. Regere catálogo e pacotes de autoria.

### Resultado esperado

O catálogo descreve quando escolher o resource, o modelo obtém seu contrato
somente após a escolha, e o runtime renderiza sem sobreposição ou medição
autoral de pixels.

### Diagnóstico

Se apenas um exemplo funciona, o contrato ou o layout está específico demais.
Se a correção exige condicional no kernel, a responsabilidade provavelmente
está no package. Se lacunas compartilham estado, cada alvo precisa de identidade
própria e teste de interação.

## Alterar o banco de dados

Crie uma nova migração no diretório adotado pelo projeto. Ela deve poder ser
aplicada a partir do estado anterior e produzir o mesmo esquema em outro
ambiente. Atualize políticas de segurança por linha, funções, tipos gerados e
testes correspondentes.

Não reescreva uma migração já aplicada como forma de consertar produção. Uma
nova migração torna a sequência auditável e permite que ambientes existentes
alcancem o mesmo resultado.

## Alterar a documentação

Escreva para quem ainda não conhece o produto. Apresente o problema, defina o
termo técnico e só então forneça o procedimento. Em tarefas operacionais,
informe pré-condição, passos, resultado esperado, comportamento offline e
recuperação.

Preserve UTF-8 sem BOM, acentuação e links relativos válidos. Não descreva
processos internos de conversa ou autoria do texto. Afirmações acadêmicas
devem apontar para referências existentes; instruções técnicas devem ser
confirmadas no código ou em documentação oficial.

## Alterar dependências locais ou Android

Para bundles em `public/vendor`, siga o procedimento do
[inventário de bibliotecas locais](public/vendor/README.md). Não edite arquivos
minificados para reparar um resource.

Para Android, altere o invólucro apenas quando a responsabilidade for realmente
nativa. O domínio continua no runtime web. Gere o APK, inspecione o artefato e
execute o roteiro do [módulo Android](android/README.md).

## Pull request

O pull request deve registrar:

- problema reproduzido;
- comportamento anterior e comportamento esperado;
- decisão técnica e alternativas relevantes;
- risco para persistência, offline, autorização e acessibilidade;
- testes executados e resultados;
- capturas quando houver mudança visual;
- migração ou procedimento operacional, quando aplicável.

Mantenha `main` como linha pública legível. Prefira rebase ou squash quando
isso tornar o histórico mais claro e evite commits de percurso sem valor
duradouro.

## Diagnóstico geral

| Situação | Ação |
| --- | --- |
| Um arquivo gerado volta ao estado anterior | Localize e corrija a fonte ou o gerador. |
| O teste passa isoladamente e falha na suíte | Procure estado global, ordem de execução ou artefato não regenerado. |
| Uma mudança visual exige muitos valores fixos | Reavalie o motor de layout ou o contrato semântico do package. |
| A migração funciona apenas no banco pessoal | Recrie um ambiente limpo e teste a sequência completa. |
| A documentação contradiz o app | Use código e testes como evidência, corrija o texto e adicione uma verificação quando possível. |
