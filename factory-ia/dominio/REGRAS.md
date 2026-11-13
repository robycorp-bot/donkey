# Regras invioláveis do domínio

Vale para este produto. Soma-se a `factory-ia/AGENTS.md` §5; não a substitui.

1. **Grau 33:** Nenhum dado classificado como sigiloso ou sensível (política LGPD do projeto) pode ser transmitido a API de LLM externa sem passar pelo **Harness** e sem decisão explícita do usuário quando o Harness sinalizar risco.
2. **Fail-closed:** Em dúvida sobre PII ou sigilo, **bloquear envio** e pedir **auditar solicitação**; não “chutar” que está limpo.
3. **Perímetro de confiança:** o Donkey é o editor do desenvolvedor e **pode** ver tudo o que ele
   vê — é assim que ele filtra. Quem não pode ver é a empresa terceira. Todo processo de fornecedor
   rodando aqui dentro (CLI delegado, extensão, agente) conta como **Grau 33**, não como Donkey, e
   só alcança o projeto por via mediada e auditada. O Donkey **nunca** reusa credencial de outro
   aplicativo, e o login do Google do usuário não é credencial de provedor em lugar nenhum.
4. **Menor exposição:** O modelo externo recebe apenas o **mínimo** necessário (resumo, trecho redigido, esquema sintético). Abrir workspace **não** autoriza envio automático de arquivos ao provedor.
5. **Segredos:** Chaves de API no cofre nativo; nunca logar corpo de requisição contendo credencial ou PII em logs persistidos.
6. **Web (prévia):** Sem acesso irrestrito ao disco; sem chamadas reais de IA com segredo na prévia web.
7. **Ética de tokens:** Escolha de modelo deve considerar complexidade da tarefa; não usar o modelo mais potente como padrão para toda mensagem.

**Proibido sem ADR + CTO + humano:**

- Novo provedor que armazene conversa em região não documentada ou exija envio de código-fonte completo do workspace por padrão.
- Desativar detecção LGPD no Harness em build de produção.
- Enviar dados reais de cliente para “fine-tuning” ou telemetria do fornecedor.

**Falhas públicas:** Mensagens ao usuário em português, sem stack interna, sem trecho de arquivo com PII, sem cabeçalhos de autenticação.
