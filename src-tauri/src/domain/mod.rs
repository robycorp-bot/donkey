use serde::{Deserialize, Serialize};

pub type AppResult<T> = Result<T, String>;

pub const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_CHAT_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub name: String,
    pub path: String,
    pub entries: Vec<FileEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDocument {
    pub path: String,
    pub name: String,
    pub content: String,
    pub language: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    OpenRouter,
    OpenAI,
    Anthropic,
    Copilot,
    /// "Modal minha vida": only free models, routed through OpenRouter.
    MinhaVida,
}

impl Provider {
    pub const ALL: [Self; 5] = [
        Self::OpenRouter,
        Self::OpenAI,
        Self::Anthropic,
        Self::Copilot,
        Self::MinhaVida,
    ];

    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn id(self) -> &'static str {
        match self {
            Self::OpenRouter => "openrouter",
            Self::OpenAI => "openai",
            Self::Anthropic => "anthropic",
            Self::Copilot => "copilot",
            Self::MinhaVida => "minhavida",
        }
    }

    pub fn require_supported(self) -> AppResult<()> {
        if self == Self::Copilot {
            return Err("O Copilot ainda depende da integração oficial com o SDK. Este chat está indisponível nesta versão.".into());
        }
        Ok(())
    }
}

#[derive(Serialize)]
pub struct ProviderStatus {
    pub id: Provider,
    pub configured: bool,
    /// Masked fingerprint (only the last 4 characters), never the key itself.
    pub hint: Option<String>,
}

impl Provider {
    /// Known key prefixes. Blocks pasting one vendor's key into another vendor's slot,
    /// which would send that secret to the wrong company.
    pub fn key_prefixes(self) -> &'static [&'static str] {
        match self {
            Self::OpenRouter | Self::MinhaVida => &["sk-or-"],
            Self::Anthropic => &["sk-ant-"],
            Self::OpenAI => &["sk-"],
            Self::Copilot => &[],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_keep_only_the_last_four_characters() {
        assert_eq!(mask_key("sk-or-v1-abcdef9876"), "…9876");
        assert_eq!(mask_key("abc"), "…abc");
        assert!(!mask_key("sk-ant-SEGREDO-1234").contains("SEGREDO"));
    }

    #[test]
    fn providers_serialize_with_stable_ids() {
        for provider in Provider::ALL {
            let json = serde_json::to_string(&provider).unwrap();
            assert_eq!(json, format!("\"{}\"", provider.id()));
        }
        assert!(Provider::Copilot.require_supported().is_err());
        assert!(Provider::MinhaVida.require_supported().is_ok());
    }

    #[test]
    fn every_supported_provider_has_key_prefixes() {
        for provider in Provider::ALL {
            assert_eq!(
                provider.key_prefixes().is_empty(),
                provider == Provider::Copilot
            );
        }
    }
}

pub fn mask_key(key: &str) -> String {
    let tail: String = key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("…{tail}")
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}
