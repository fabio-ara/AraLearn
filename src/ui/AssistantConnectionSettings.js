import { readSupabaseRuntimeConfig } from "../supabase/runtimeConfig.js";

export function mountAssistantConnectionSettings(root) {
  const config = readSupabaseRuntimeConfig();
  root.innerHTML = `<div class="assistant-connection">
    <p>Crie e revise cursos conversando com um assistente. Conecte uma vez e use sua conta AraLearn nas próximas conversas.</p>
    <ol>
      <li><strong>Copie o endereço do AraLearn.</strong>
        <label for="assistant-server-address">Endereço da conexão MCP</label>
        <input id="assistant-server-address" data-assistant-address type="url" readonly spellcheck="false">
        <button type="button" data-assistant-copy>Copiar endereço</button>
      </li>
      <li><strong>Adicione a conexão no seu assistente.</strong>
        <p>No ChatGPT, abra as configurações de apps ou plugins e procure a opção de adicionar uma conexão MCP. Cole o endereço e escolha OAuth, se solicitado.</p>
        <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Abrir ChatGPT (nova aba)</a>
      </li>
      <li><strong>Autorize sua conta AraLearn.</strong>
        <p>Entre ou crie sua conta na tela de autorização e confira o acesso solicitado. Depois, selecione AraLearn na conversa.</p>
      </li>
    </ol>
    <p data-assistant-status role="status" aria-live="polite"></p>
    <details><summary>Não encontrei a opção de conectar</summary>
      <p>A disponibilidade depende do plano, do aplicativo e das permissões do seu workspace. No ChatGPT, procure Developer Mode em Configurações → Segurança e login; depois, crie a conexão em Plugins. Abrir o link não instala nem autoriza a conexão automaticamente.</p>
      <a href="https://developers.openai.com/api/docs/guides/developer-mode" target="_blank" rel="noopener noreferrer">Consultar instruções oficiais do ChatGPT (nova aba)</a>
      <p>Se aparecerem configurações avançadas de OAuth, use a descoberta automática (DCR), mantenha offline_access, deixe os escopos básicos vazios e desmarque OIDC habilitado. Não preencha ID ou segredo de cliente.</p>
      <p>Em outro aplicativo compatível com MCP remoto e OAuth, use o mesmo endereço. Não é necessário fornecer senha ou chave do banco ao assistente.</p>
    </details>
    <details><summary>Como conferir a conexão?</summary>
      <p>Na conversa com AraLearn selecionado, peça: “Consulte os componentes didáticos disponíveis no AraLearn, sem criar ou alterar cursos.” Uma resposta com dados do serviço confirma essa consulta; nenhuma criação é necessária para testar a conexão.</p>
      <p>Após atualizações das ferramentas, atualize a conexão no aplicativo e abra uma conversa nova. Reconecte a conta somente se a autorização expirou, foi revogada ou pertence a outra conta.</p>
    </details>
  </div>`;
  const address = root.querySelector("[data-assistant-address]");
  const button = root.querySelector("[data-assistant-copy]");
  const status = root.querySelector("[data-assistant-status]");
  address.value = config.configured ? `${config.projectUrl}/functions/v1/aralearn-authoring-mcp` : "";
  button.disabled = !address.value;
  if (!address.value) status.textContent = "A conexão não está disponível nesta instalação. Consulte a pessoa responsável pelo AraLearn.";
  button.addEventListener("click", async () => {
    try {
      await globalThis.navigator.clipboard.writeText(address.value);
      status.textContent = "Endereço copiado. Cole na conexão do seu assistente.";
    } catch {
      address.focus();
      address.select();
      status.textContent = "Selecione e copie o endereço acima. O navegador não permitiu a cópia automática.";
    }
  });
}
