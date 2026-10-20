# Análise inicial e escopo

O arquivo [`struct/context-all-md`](../struct/context-all-md) descreve um editor próprio para uso pessoal: leve, escuro, com identidade retrô, IA acessível e uma organização orientada ao domínio. Ele orienta o produto; não equivale a uma especificação técnica fechada nem a evidência de que as integrações já existem.

A orientação visual posterior do usuário substituiu o retrô por uma aparência mais próxima do macOS: limpa, com painéis arredondados, tipografia de sistema, controles próprios de janela e sem barra de atividades semelhante à do VS Code. O contexto original permanece preservado.

## Decisões para começar

| Desejo do contexto | Encaminhamento inicial |
| --- | --- |
| Editor próprio, sem fork do VS Code | Shell Tauri 2 com interface Svelte 5 e edição Monaco |
| Sensação simples, tecnologia por baixo | Explorador, editor e chats visíveis; animação discreta e respeito à preferência por movimento reduzido |
| Boteco de IA sem extensão Continue | Adapter direto para API do OpenRouter |
| Chats Codex, Anthropic e Copilot | Espaços separados, com limites reais de cada API; Copilot reservado |
| Cada chat pede configuração | Chave e modelo por provedor; envio bloqueado quando indisponível |
| Organização em DDD | Domínio e casos de uso separados de Svelte, Tauri, disco e HTTP |
| Executável para produção | Processo de build Windows documentado e validação nativa antes de homologar |
| Tom nordestino antigo e divertido | Microtextos opcionais, compreensíveis e respeitosos; erros técnicos preservam informações úteis |

## Corte da versão 0.1.0

O primeiro ciclo entrega uma fatia utilizável: escolher uma pasta, abrir arquivo, editar, salvar e conversar com um provedor configurado. O explorador representa o filesystem selecionado. O editor detecta modificações externas ao salvar para reduzir risco de sobrescrita acidental.

Os chats têm históricos independentes na sessão. Chaves pertencem ao cofre nativo; histórico, preferências persistentes e recuperação de sessão exigem definição própria. O estado visual deve distinguir configuração ausente, envio em andamento e falha real. Uma chave cadastrada não comprova conectividade ou saldo.

## Fora do primeiro ciclo

Na versão 0.2.0, Git local, scripts npm e servidor HTML com prévia foram implementados para testes pessoais. Docker, terminal interativo completo, Ollama, extensões e execução autônoma de agentes continuam em fases posteriores. Não há compatibilidade com extensões do VS Code nem paridade com os agentes oficiais.

O executável final é a meta do projeto; publicar, assinar e homologar uma distribuição é uma etapa distinta da construção desta base.
