# AraLearn

AraLearn é um aplicativo local-first para estudo, autoria e organização de microssequências de aprendizagem.

## O que o projeto é

O projeto reúne a mesma base local para autoria, organização e leitura de microssequências. O conteúdo fica estruturado em cursos, módulos, lições, microssequências e cards, com persistência local e contrato público próprio para troca de dados.

## Estado atual

- contrato público principal `aralearn.contract`
- pipeline própria do contrato principal para validar, compilar e renderizar
- núcleo próprio do contrato principal para storage, editor, seed e LLM, sem compatibilidade com `intent + data`
- bootstrap web principal já aponta para a casca principal do produto
- persistência local separada entre projeto e progresso
- edição manual de microssequências e cards integrada ao motor editorial
- casca navegável cobrindo `curso -> módulo -> lição -> microssequência -> cards`
- reorganização estrutural para refletir múltiplos cursos reais no mesmo projeto
- geração, revisão e reposicionamento assistidos por LLM via API na camada editorial

## Como o conteúdo se organiza

```text
Projeto
  -> Cursos
    -> Módulos
      -> Lições
        -> Microssequências
          -> Cards
```

Essa hierarquia é a mesma usada pelo contrato público, pelo motor interno e pela interface local.

## Documentação pública

- [Visão geral da documentação](./docs/README.md)
- [Contrato público atual](./docs/aralearn-contract.md)
- [Exemplos JSON](./docs/examples/)
- [Histórico de versões](./CHANGELOG.md)

## Estrutura principal do repositório

- `public/`: entrada web, assets e estilos da interface local
- `src/`: contrato, motor, persistência, editor e UI
- `tests/`: suíte automatizada
- `scripts/`: utilitários de desenvolvimento, como servidor local
- `docs/`: documentação pública e exemplos

## Execução local

```powershell
npm install
npm start
```

## Validação

```powershell
npm test
npm run validate:example
```

## Próximos passos

As próximas iterações devem aprofundar os fluxos editoriais assistidos, consolidar os contratos públicos e amadurecer a interface local.
