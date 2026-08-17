# Conformidade do desenho e da materialização

## Guia de recuperação

- `INTENT`: recupere para `audit`, `repair` e reauditoria; em `create`, `extend` ou `revise`, use apenas para conferência prospectiva.
- Combine com `semantic-audit.md`, os contracts JIT das operações de auditoria e o estado persistido corrente.
- Execute checks determinísticos antes do julgamento semântico. Não use a conversa como evidência nem como estado.

## Cadeia comparável

Compare, por referências versionadas:

```text
fontes e objetivo -> análise instrucional -> snapshot efetivo
-> ResourceSets -> blueprint -> cards/resources reais -> manifesto
```

O manifesto descreve a materialização; não substitui cards, blueprint, snapshot
ou fontes. Contagens de cards, palavras, práticas e resources são métricas
derivadas, não objetivos pedagógicos.

Para uma microssequência, leia no mínimo objetivo, `covers`, `checks`, `errors`
e dependências; análise instrucional; snapshot efetivo; ResourceSets;
blueprint e binding; manifesto; cards e resources persistidos; fontes
pertinentes; e findings ativos anteriores. Para uma Parte, percorra as
microssequências declaradas e conserve seus limites e dependências.

## Quatro classes de conclusão

1. **Conformidade estrutural determinística**: referências, versões, hashes,
   locks, autorização, ordem, contagens e rastreabilidade verificáveis pelo
   backend.
2. **Conformidade semântico-instrucional**: adequação entre requisito,
   explicação, evidência, prática e representação, julgada sobre o conteúdo
   real.
3. **Qualidade factual**: afirmações confrontadas com as fontes autorizadas e
   sua data, versão, jurisdição ou condição de validade.
4. **Eficácia educacional**: efeito sobre aprendizagem ou transferência. A
   auditoria de autoria não o infere; isso exige evidência empírica apropriada.

Não converta essas classes em score único e não apresente uma operacionalização
AraLearn como medida científica validada.

## Checks determinísticos

Use `gerirDesenhoInstrucional` com `run_audit`, `kind: audit`, no estado
corrente. Em uma reauditoria, use `kind: reaudit`. O backend
verifica, entre outros pontos, IDs e caminhos, camadas e ordem teoria/prática,
evidências e contagens declaradas versus artefatos reais, locks, revisão do
snapshot, cards derivados ausentes, contratos de resource e resposta,
ResourceSet e condição experimental, hashes e rastreabilidade. O resultado
abre um audit run versionado e pagina findings sem ultrapassar o limite do
protocolo.

Um manifesto registrado com contrato válido ainda pode conter divergência de
desenvolvimento, operação-alvo da tarefa ou cobertura. Nunca trate a aceitação do
manifesto como aprovação pedagógica.

## Auditoria semântico-instrucional

Depois dos checks, releia os artefatos reais e procure compressão excessiva,
explicação prometida apenas mencionada, evidência ausente, prática que mede
outra operação, prática antes da fundamentação, resource inadequado à
estrutura, substituição tratada como equivalência e lacuna de cobertura.

Registre somente conclusão pública e localizada. Não registre cadeia de
raciocínio, deliberação interna, transcript ou score. Use
`record_semantic_audit` no mesmo audit run; o backend fixa a origem semântica.
Cada finding contém:

- código e gravidade operacional;
- alvo exato, com alvo de resource quando pertinente;
- regra, parâmetro ou requisito violado e sua versão;
- evidência pública curta, observável no conteúdo ou nos artefatos;
- reparo proposto opcional;
- revisão, snapshot e ciclo de vida persistidos pelo servidor.

## Decisão, reparo e reauditoria

Finding não autoriza reparo. A pessoa aprova ou rejeita cada achado; o reparo
posterior altera somente findings aprovados e respeita locks e escopo. Um
finding rejeitado permanece registrado e nunca vira autorização implícita.
Não limpe nem substitua um mandato `repair_findings` enquanto ele ainda contiver
achado não concluído; cada vínculo confirmado consome seu finding e o último
encerra o mandato antes de outra auditoria.

Reauditoria abre outro `run_audit` com `kind: reaudit`, relê o estado persistido corrente e não
reaproveita como conclusão o relatório anterior. Ela verifica o reparo, procura
regressões e pode encontrar um problema novo. Não permita que quem repara
certifique a própria alteração sem essa nova leitura.

A conclusão da reauditoria deve cobrir todos os findings reparados elegíveis do
escopo. Para `outcome: still_open`, registre também a nova ocorrência de mesma
identidade em `findings`; ela pertence à rodada corrente — ou a um child run
congelado da Parte — e sucede a ocorrência antiga. Use `outcome: resolved`
somente quando essa identidade não reaparecer na rodada. Uma lista vazia não
encerra silenciosamente reparos que ainda aguardam verificação.

## Auditoria de Parte

A Parte é lote operacional, não unidade pedagógica. Sua auditoria agrega sem
apagar os recortes locais: cobertura do plano, coerência e dependências entre
microssequências, revisitação útil, redundância, integração e distribuição de
findings. Mostre quantidades e denominadores, nunca um score global.
Percorra separadamente as páginas de findings e componentes. Para inspecionar
uma microssequência do pai, use a `childAuditRunRef` exata do componente; não a
troque pela rodada mais recente do mesmo escopo. Componente ausente ou alvo
indisponível mantém cobertura parcial e nunca vira conformidade.

## Métricas e limites

São defensáveis como fatos do workspace quando têm unidade e denominador:
checks passados, falhos ou não aplicáveis; findings por origem, gravidade,
status e microssequência; cobertura declarada versus materializada; resources
permitidos versus usados; e reparos por estado. Esses dados não são telemetria
comportamental do estudante e não demonstram aprendizagem ou causalidade.
