# Atlas visual do AraLearn — v10

Esta versão corrige a navegação e a organização por coleções.

- `←` retorna exatamente ao estado anterior, preservando posição de rolagem.
- `↑` é separado e sobe apenas um nível didático.
- `Rever → Unidade` permite `←` de volta à fila e `↑` para a Microssequência.
- Listas de 1, 20 e 200 Cursos usam rolagem contínua; não há `Carregar mais`.
- O card inteiro é a área principal de toque. Ícones ficam para ações secundárias.
- Coleções usam relação muitos-para-muitos: um Curso pode estar em várias. O overlay “Organizar em coleções” adiciona ou retira marcações em um só lugar.
- Criar coleção, organizar coleções e menus contextuais usam bottom sheets/overlays.
- Botões de produto priorizam ícones; texto fica para estados, conteúdo e decisões que exigem linguagem.

Coleções continuam marcadas como extensão proposta, pois não existe hoje uma entidade persistida equivalente no backend.
