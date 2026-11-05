use crate::{
    domain::{AppResult, ChatMessage, MessageRole, Provider, ProviderStatus, MAX_CHAT_BYTES},
    infrastructure::{credentials::SystemCredentials, providers::ProviderClient},
};
use zeroize::Zeroizing;

pub struct AssistantService {
    providers: ProviderClient,
}

impl AssistantService {
    pub fn new() -> AppResult<Self> {
        Ok(Self {
            providers: ProviderClient::new()?,
        })
    }

    pub fn statuses(&self) -> AppResult<Vec<ProviderStatus>> {
        Provider::ALL
            .into_iter()
            .map(|id| {
                let key = if id == Provider::Copilot {
                    None
                } else {
                    Self::key_for(id)?
                };
                let hint = key.as_ref().map(|key| {
                    let own = id != Provider::MinhaVida
                        || SystemCredentials::get(id).ok().flatten().is_some();
                    let masked = crate::domain::mask_key(key);
                    if own {
                        masked
                    } else {
                        format!("{masked} (chave do Boteco)")
                    }
                });
                Ok(ProviderStatus {
                    id,
                    configured: key.is_some(),
                    hint,
                })
            })
            .collect()
    }

    /// Modal minha vida may reuse the OpenRouter key: free models cost nothing there.
    fn key_for(provider: Provider) -> AppResult<Option<Zeroizing<String>>> {
        let own = SystemCredentials::get(provider)?.filter(|key| !key.is_empty());
        if own.is_some() || provider != Provider::MinhaVida {
            return Ok(own);
        }
        Ok(SystemCredentials::get(Provider::OpenRouter)?.filter(|key| !key.is_empty()))
    }

    pub async fn catalog(&self) -> AppResult<Vec<crate::infrastructure::providers::CatalogModel>> {
        self.providers.catalog().await
    }

    pub fn configure(&self, provider: Provider, api_key: String) -> AppResult<()> {
        let secret = Zeroizing::new(api_key);
        provider.require_supported()?;
        let key = secret.trim();
        if key.is_empty() || key.len() > 2048 || !key.bytes().all(|byte| byte.is_ascii_graphic()) {
            return Err(
                "Informe uma chave de API válida, com até 2048 caracteres e sem espaços.".into(),
            );
        }
        let prefixes = provider.key_prefixes();
        if !prefixes.iter().any(|prefix| key.starts_with(prefix))
            || (provider == Provider::OpenAI
                && (key.starts_with("sk-or-") || key.starts_with("sk-ant-")))
        {
            return Err(format!(
                "Essa chave não parece ser deste provedor (esperado começar com {}). Por segurança ela não foi guardada.",
                prefixes.join(" ou ")
            ));
        }
        SystemCredentials::set(provider, key)
    }

    pub fn remove(&self, provider: Provider) -> AppResult<()> {
        SystemCredentials::remove(provider)
    }

    pub async fn chat(
        &self,
        provider: Provider,
        model: String,
        messages: Vec<ChatMessage>,
    ) -> AppResult<crate::infrastructure::providers::ChatReply> {
        provider.require_supported()?;
        validate_chat(&model, &messages)?;
        if provider == Provider::MinhaVida && !model.trim().ends_with(":free") {
            return Err("O Modal minha vida aceita somente modelos gratuitos (:free).".into());
        }
        let secret = Self::key_for(provider)?
            .ok_or("Configure a chave deste provedor antes de abrir a conversa.")?;
        self.providers
            .chat(provider, model.trim(), &messages, secret.as_str())
            .await
    }
}

fn validate_chat(model: &str, messages: &[ChatMessage]) -> AppResult<()> {
    let model = model.trim();
    if model.is_empty() || model.len() > 200 || !model.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err(
            "Informe o identificador exato do modelo, sem espaços e com até 200 caracteres.".into(),
        );
    }
    if messages.is_empty() || messages.len() > 100 {
        return Err("A conversa precisa ter entre 1 e 100 mensagens. Inicie uma nova conversa se necessário.".into());
    }
    if messages
        .first()
        .is_none_or(|message| message.role != MessageRole::User)
        || messages
            .last()
            .is_none_or(|message| message.role != MessageRole::User)
    {
        return Err("A conversa deve começar e terminar com uma mensagem sua.".into());
    }
    let mut size = 0usize;
    for message in messages {
        if message.content.trim().is_empty() || message.content.len() > 64 * 1024 {
            return Err("Cada mensagem precisa ter texto e no máximo 64 KiB.".into());
        }
        size = size.saturating_add(message.content.len());
        if size > MAX_CHAT_BYTES {
            return Err("A conversa ultrapassou 256 KiB. Inicie uma nova conversa.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn message(role: MessageRole, text: &str) -> ChatMessage {
        ChatMessage {
            role,
            content: text.into(),
        }
    }

    #[test]
    fn free_chat_rejects_paid_models_before_any_network_call() {
        let service = AssistantService::new().unwrap();
        let err = tauri::async_runtime::block_on(service.chat(
            Provider::MinhaVida,
            "openai/gpt-4.1".into(),
            vec![message(MessageRole::User, "oi")],
        ))
        .unwrap_err();
        assert!(err.contains(":free"));
    }

    #[test]
    fn copilot_and_malformed_keys_are_rejected() {
        let service = AssistantService::new().unwrap();
        assert!(service.configure(Provider::Copilot, "x".into()).is_err());
        assert!(service
            .configure(Provider::OpenAI, "sk- com espaço".into())
            .is_err());
        assert!(service.configure(Provider::OpenAI, "".into()).is_err());
        assert!(service
            .configure(Provider::OpenAI, format!("sk-{}", "a".repeat(2100)))
            .is_err());
    }

    #[test]
    fn keys_from_another_vendor_are_rejected_before_storage() {
        let service = AssistantService::new().unwrap();
        let err = service
            .configure(Provider::Anthropic, "sk-or-v1-abc".into())
            .unwrap_err();
        assert!(err.contains("não parece"));
        let err = service
            .configure(Provider::OpenAI, "sk-ant-abc".into())
            .unwrap_err();
        assert!(err.contains("não parece"));
        assert_eq!(crate::domain::mask_key("sk-or-v1-abcd1234"), "…1234");
    }

    #[test]
    fn chat_limits_reject_empty_huge_and_invalid_transcripts() {
        assert!(validate_chat("model", &[]).is_err());
        assert!(validate_chat("bad model", &[message(MessageRole::User, "oi")]).is_err());
        assert!(validate_chat("model", &[message(MessageRole::Assistant, "oi")]).is_err());
        assert!(validate_chat(
            "model",
            &[message(MessageRole::User, &"a".repeat(65 * 1024))]
        )
        .is_err());
        assert!(validate_chat("model", &[message(MessageRole::User, " ")]).is_err());
        assert!(validate_chat(
            "author/model",
            &[
                message(MessageRole::User, "oi"),
                message(MessageRole::Assistant, "olá"),
                message(MessageRole::User, "continue")
            ]
        )
        .is_ok());
    }
}
