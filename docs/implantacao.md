# Implantação

O AraLearn é entregue por três partes coordenadas: backend Supabase, site
estático e aplicativo Android. As três devem partir da mesma revisão validada.
Publicar somente uma parte pode tornar a interface incompatível com os contratos
do servidor.

## Pré-requisitos

- Node.js e dependências instaladas com `npm install`;
- Supabase CLI autenticado e projeto ligado ao repositório;
- GitHub CLI autenticado quando a publicação usar GitHub Pages ou Release;
- Java e Android SDK compatíveis com o projeto para gerar o APK;
- variáveis públicas de URL e chave publicável do Supabase.

Credenciais administrativas e chaves de provedores não entram no site, no APK,
nos commits ou nos logs públicos.

## Validação local

Comece pelos verificadores do repositório:

```bash
npm test
npm run test:e2e
npm run test:authoring:mcp
npm run test:authoring:actions
npm run actions:openapi:check
```

Quando a mudança alcançar PostgreSQL, Auth, Storage ou Edge Functions, recrie o
Supabase local e execute os testes específicos antes de usar o ambiente
hospedado. O [capítulo sobre Supabase](supabase.md) explica os limites de cada
prova.

## Ordem de publicação

1. confirme branch, revisão e árvore de trabalho;
2. confira migrations pendentes com operação de leitura ou `--dry-run`;
3. aplique as migrations no projeto ligado;
4. publique `aralearn-course-api`, `aralearn-authoring-mcp` e
   `aralearn-authoring-action` quando seus fontes mudarem;
5. execute `npm run deployment:verify-hosted`;
6. gere o site com `npm run pages:build` e publique pelo workflow `pages.yml`;
7. execute `npm run deployment:verify-site`;
8. gere o Android de release com `npm run android:release`;
9. publique o APK pelo workflow `android-release.yml` ou na Release
   correspondente;
10. percorra as jornadas críticas na revisão publicada.

O workflow `validacao.yml` é o gate comum. Ele não substitui o ensaio visual no
Chrome nem a prova hospedada quando o contrato remoto mudou.

## Backend

As migrations são cumulativas e transacionais quando o PostgreSQL permite. O
manifesto corrente termina em
`20260824130000_restore_gpt_actions_openapi.sql`. Antes de aplicar, confira que
o projeto ligado é o destino pretendido e que o backup exigido pela operação
existe e pode ser restaurado.

As Edge Functions possuem responsabilidades distintas:

- `aralearn-course-api`: aplicação autenticada e operações de produto;
- `aralearn-authoring-mcp`: protocolo MCP e suas cinco ferramentas públicas;
- `aralearn-authoring-action`: GPT personalizado por Actions/OpenAPI.

Não publique uma função no lugar da outra e não reutilize credenciais ou sessão
entre MCP e Actions.

## Site

`npm run pages:build` produz `.pages` a partir dos mesmos fontes usados pelos
testes. O artefato contém configuração pública, assets, contratos de componentes
e o documento OpenAPI de Actions. Nenhuma chave secreta pode aparecer nele.

Depois da publicação, confira a URL final, o carregamento dos módulos, o
manifesto, o service worker, o documento OpenAPI e o console. Faça o percurso
de Estudo e as áreas principais de Autoria com uma identidade autorizada.

## Android

O APK encapsula a mesma aplicação e acrescenta a ponte nativa necessária ao
relay local da Assistência por API. O WebView não recebe permissão genérica para
conteúdo HTTP. A compilação de release valida assinatura, origem dos assets e
presença da ponte esperada.

Instale o APK somente em dispositivo descartável ou ambiente autorizado.
Confirme login, retomada, área segura, teclado, rolagem, abertura de PDFs e o
relay local quando disponível.

## Recuperação

Falha antes de uma migration não altera o banco. Falha depois de uma migration
exige diagnóstico do estado confirmado, não repetição cega. Use o backup
verificado e os procedimentos do manual privado para recuperar dados; use Git e
uma Release anterior para recuperar clientes.

Não mantenha dois caminhos ativos como estratégia de reversão. Quando um
contrato for substituído e não houver consumidor externo real, migre os
consumidores, publique o caminho final e remova o anterior.
