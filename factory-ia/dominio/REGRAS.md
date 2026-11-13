# Regras invioláveis do domínio

Vale para este produto. Soma-se a `factory-ia/AGENTS.md` §5; não a substitui.

1. **Grau 33:** Nenhum dado classificado como sigiloso ou sensível (política LGPD do projeto) pode ser transmitido a API de LLM externa sem passar pelo **Harness** e sem decisão explícita do usuário quando o Harness sinalizar risco.
2. **Fail-closed:** Em dúvida sobre PII ou sigilo, **bloquear envio** e pedir **auditar solicitação**; não “chutar” que está limpo.
3. **Menor exposição:** O modelo externo recebe apenas o **mínimo** necessário (resumo, trecho redigido, esquema sintético). Abrir workspace **não** autoriza envio automático de arquivos ao provedor.
4. **Segredos:** Chaves de API no cofre nativo; nunca logar corpo de requisição contendo credencial ou PII em logs persistidos.
5. **Web (prévia):** Sem acesso irrestrito ao disco; sem chamadas reais de IA com segredo na prévia web.
6. **Ética de tokens:** Escolha de modelo deve considerar complexidade da tarefa; não usar o modelo mais potente como padrão para toda mensagem.

**Proibido sem ADR + CTO + humano:**

- Novo provedor que armazene conversa em região não documentada ou exija envio de código-fonte completo do workspace por padrão.
- Desativar detecção LGPD no Harness em build de produção.
- Enviar dados reais de cliente para “fine-tuning” ou telemetria do fornecedor.

**Falhas públicas:** Mensagens ao usuário em português, sem stack interna, sem trecho de arquivo com PII, sem cabeçalhos de autenticação.
