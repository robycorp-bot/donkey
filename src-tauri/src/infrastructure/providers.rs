use crate::domain::{AppResult, ChatMessage, Provider};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const INCOMPLETE_NOTICE: &str = "\n\n[Coder mega-brain: o provedor encerrou esta resposta antes de concluí-la. Peça para continuar antes de usar código incompleto.]";
const INSTRUCTIONS: &str = "Você é um assistente de programação. Responda em português brasileiro por padrão, com um toque nordestino bem-humorado e respeitoso. Seja direto e tecnicamente preciso. Você recebe somente as mensagens enviadas neste chat; não afirme ter lido arquivos, executado comandos ou feito alterações no projeto.";

pub struct ProviderClient {
    client: Client,
}

impl ProviderClient {
    pub fn new() -> AppResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .connect_timeout(Duration::from_secs(15))
            // Authorization must never follow a redirect to another host.
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(2)
            .user_agent("Coder-mega-brain/0.1.0")
            .build()
            .map_err(|_| "Não foi possível preparar a conexão segura com os provedores.")?;
        Ok(Self { client })
    }

    pub async fn chat(
        &self,
        provider: Provider,
        model: &str,
        messages: &[ChatMessage],
        key: &str,
    ) -> AppResult<ChatReply> {
        provider.require_supported()?;
        let started = std::time::Instant::now();
        let (endpoint, payload) = request_payload(provider, model, messages)?;
        let mut request = self.client.post(endpoint).json(&payload);
        request = match provider {
            Provider::Anthropic => request
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01"),
            _ => request.bearer_auth(key),
        };
        let mut response = request.send().await.map_err(|error| {
            if error.is_timeout() {
                "O provedor demorou mais de 120 segundos. Tente novamente.".to_string()
            } else {
                "Falha ao conectar ao provedor. Confira sua conexão e tente novamente.".to_string()
            }
        })?;
        if !response.status().is_success() {
            // Never expose provider error bodies: they can echo keys, prompts, or other secrets.
            return Err(provider_error(response.status()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err("A resposta do provedor excedeu o limite desta versão.".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "A conexão foi interrompida durante a resposta.")?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err("A resposta do provedor excedeu o limite desta versão.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "O provedor retornou uma resposta em formato inesperado.")?;
        let text = extract_text(provider, &value)?;
        let usage = extract_usage(provider, &value);
        Ok(ChatReply {
            text,
            model: usage.model.unwrap_or_else(|| model.to_owned()),
            input_tokens: usage.input,
            output_tokens: usage.output,
            cost_usd: usage.cost,
            latency_ms: started.elapsed().as_millis() as u64,
        })
    }
}

/// What the UI needs to show cost and usage. Never contains credentials.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatReply {
    pub text: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Real cost reported by the provider (OpenRouter). None = estimate in the UI.
    pub cost_usd: Option<f64>,
    pub latency_ms: u64,
}

struct Usage {
    input: u64,
    output: u64,
    cost: Option<f64>,
    model: Option<String>,
}

fn extract_usage(provider: Provider, value: &Value) -> Usage {
    let number = |path: &str| value.pointer(path).and_then(Value::as_u64).unwrap_or(0);
    let (input, output) = match provider {
        Provider::OpenRouter | Provider::MinhaVida => (
            number("/usage/prompt_tokens"),
            number("/usage/completion_tokens"),
        ),
        _ => (
            number("/usage/input_tokens"),
            number("/usage/output_tokens"),
        ),
    };
    let cost = match provider {
        Provider::MinhaVida => Some(0.0),
        Provider::OpenRouter => value.pointer("/usage/cost").and_then(Value::as_f64),
        _ => None,
    };
    let model = value
        .get("model")
        .and_then(Value::as_str)
        .filter(|m| m.len() <= 200)
        .map(str::to_owned);
    Usage {
        input,
        output,
        cost,
        model,
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModel {
    pub id: String,
    pub name: String,
    pub company: String,
    pub free: bool,
    /// USD per 1 million tokens.
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub context: u64,
}

impl ProviderClient {
    /// Public catalogue with prices (no key needed). Used for free models and cost estimates.
    pub async fn catalog(&self) -> AppResult<Vec<CatalogModel>> {
        let response = self
            .client
            .get("https://openrouter.ai/api/v1/models")
            .send()
            .await
            .map_err(|_| "Não foi possível buscar a lista de modelos gratuitos.")?;
        if !response.status().is_success() {
            return Err(provider_error(response.status()));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|_| "A lista de modelos gratuitos veio incompleta.")?;
        if bytes.len() > 32 * 1024 * 1024 {
            return Err("A lista de modelos excedeu o limite desta versão.".into());
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "A lista de modelos veio em formato inesperado.")?;
        Ok(parse_catalog(&value))
    }
}

pub fn parse_catalog(value: &Value) -> Vec<CatalogModel> {
    let price = |item: &Value, key: &str| -> f64 {
        item.pointer(&format!("/pricing/{key}"))
            .and_then(|v| {
                v.as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .or(v.as_f64())
            })
            .filter(|p| p.is_finite() && *p >= 0.0)
            .map(|p| p * 1_000_000.0)
            .unwrap_or(0.0)
    };
    let mut models: Vec<CatalogModel> = value
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            if id.len() > 200 {
                return None;
            }
            let input_per_million = price(item, "prompt");
            let output_per_million = price(item, "completion");
            let free =
                id.ends_with(":free") && input_per_million == 0.0 && output_per_million == 0.0;
            let company = id.split('/').next().unwrap_or("outros").to_owned();
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_owned();
            Some(CatalogModel {
                id: id.to_owned(),
                name,
                company,
                free,
                input_per_million,
                output_per_million,
                context: item
                    .get("context_length")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            })
        })
        .collect();
    models.sort_by(|a, b| a.company.cmp(&b.company).then(a.name.cmp(&b.name)));
    models
}

fn request_payload(
    provider: Provider,
    model: &str,
    messages: &[ChatMessage],
) -> AppResult<(&'static str, Value)> {
    provider.require_supported()?;
    Ok(match provider {
        Provider::OpenRouter | Provider::MinhaVida => {
            let mut transcript = vec![json!({ "role": "system", "content": INSTRUCTIONS })];
            transcript.extend(messages.iter().map(|message| json!(message)));
            (
                "https://openrouter.ai/api/v1/chat/completions",
                json!({
                    "model": model, "messages": transcript, "max_tokens": 4096, "stream": false,
                    "usage": { "include": true }
                }),
            )
        }
        Provider::OpenAI => (
            "https://api.openai.com/v1/responses",
            json!({
                "model": model, "input": messages, "instructions": INSTRUCTIONS,
                "max_output_tokens": 4096, "store": false, "stream": false
            }),
        ),
        Provider::Anthropic => (
            "https://api.anthropic.com/v1/messages",
            json!({
                "model": model, "messages": messages, "system": INSTRUCTIONS,
                "max_tokens": 4096, "stream": false
            }),
        ),
        Provider::Copilot => unreachable!("unsupported providers are rejected above"),
    })
}

fn extract_text(provider: Provider, value: &Value) -> AppResult<String> {
    if value.get("status").and_then(Value::as_str) == Some("failed") {
        return Err("O provedor não conseguiu concluir a resposta. Tente novamente.".into());
    }
    let text = match provider {
        Provider::OpenRouter | Provider::MinhaVida => value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        Provider::OpenAI => value
            .get("output")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|item| item.get("type").and_then(Value::as_str) == Some("message"))
            .flat_map(|item| {
                item.get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter(|part| {
                matches!(
                    part.get("type").and_then(Value::as_str),
                    Some("output_text" | "refusal")
                )
            })
            .filter_map(|part| {
                part.get("text")
                    .or_else(|| part.get("refusal"))
                    .and_then(Value::as_str)
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Provider::Anthropic => value
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        Provider::Copilot => String::new(),
    };
    if text.trim().is_empty() {
        return Err("O provedor não retornou texto. Confira se o modelo escolhido aceita conversas de texto e se há cota disponível.".into());
    }
    let incomplete = match provider {
        Provider::OpenAI => value.get("status").and_then(Value::as_str) == Some("incomplete"),
        Provider::Anthropic => {
            value.get("stop_reason").and_then(Value::as_str) == Some("max_tokens")
        }
        Provider::OpenRouter | Provider::MinhaVida => {
            value
                .pointer("/choices/0/finish_reason")
                .and_then(Value::as_str)
                == Some("length")
        }
        Provider::Copilot => false,
    };
    if incomplete {
        Ok(format!("{text}{INCOMPLETE_NOTICE}"))
    } else {
        Ok(text)
    }
}

fn provider_error(status: StatusCode) -> String {
    match status.as_u16() {
        400 | 404 | 422 => "O provedor recusou o pedido. Confira o identificador do modelo e o acesso da sua conta.",
        401 | 403 => "O provedor recusou a autenticação ou o acesso ao modelo. Confira sua chave e as permissões da conta.",
        402 => "O provedor informou saldo insuficiente. Confira os créditos da conta.",
        408 | 504 => "O provedor excedeu o tempo de resposta. Tente novamente.",
        429 => "O provedor informou limite de uso ou cota atingida. Aguarde e confira sua conta.",
        500..=599 => "O provedor está temporariamente indisponível. Tente novamente mais tarde.",
        _ => "O provedor recusou o pedido. Confira sua configuração e tente novamente.",
    }.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::MessageRole;

    #[test]
    fn provider_requests_use_real_fixed_endpoints_and_only_explicit_messages() {
        let transcript = vec![ChatMessage {
            role: MessageRole::User,
            content: "texto explícito".into(),
        }];
        let (endpoint, payload) =
            request_payload(Provider::OpenAI, "modelo-escolhido", &transcript).unwrap();
        assert_eq!(endpoint, "https://api.openai.com/v1/responses");
        assert_eq!(payload["model"], "modelo-escolhido");
        assert_eq!(payload["store"], false);
        assert_eq!(payload["input"][0]["content"], "texto explícito");
        assert!(payload.get("tools").is_none());
        assert!(request_payload(Provider::Copilot, "anything", &transcript).is_err());
    }

    #[test]
    fn responses_parser_skips_reasoning_items_and_handles_multiple_text_blocks() {
        let response = json!({"output": [
            {"type": "reasoning", "summary": []},
            {"type": "message", "content": [
                {"type": "output_text", "text": "Primeiro"},
                {"type": "output_text", "text": "Segundo"}
            ]}
        ]});
        assert_eq!(
            extract_text(Provider::OpenAI, &response).unwrap(),
            "Primeiro\nSegundo"
        );
        assert!(
            extract_text(Provider::OpenAI, &json!({"error":{"message":"secret"}}))
                .unwrap_err()
                .find("secret")
                .is_none()
        );
    }

    #[test]
    fn catalog_marks_free_models_and_prices_per_million() {
        let list = parse_catalog(&json!({"data":[
            {"id":"meta-llama/llama:free","name":"Llama","pricing":{"prompt":"0","completion":"0"}},
            {"id":"openai/gpt-pago","name":"Pago","pricing":{"prompt":"0.000002","completion":"0.000008"}}
        ]}));
        assert_eq!(list.len(), 2);
        let free = list.iter().find(|m| m.company == "meta-llama").unwrap();
        assert!(free.free);
        let paid = list.iter().find(|m| m.company == "openai").unwrap();
        assert!(!paid.free);
        assert!((paid.input_per_million - 2.0).abs() < 1e-9);
        assert!((paid.output_per_million - 8.0).abs() < 1e-9);
    }

    #[test]
    fn free_chat_goes_to_openrouter_and_asks_for_usage() {
        let transcript = vec![ChatMessage {
            role: MessageRole::User,
            content: "oi".into(),
        }];
        for provider in [Provider::MinhaVida, Provider::OpenRouter] {
            let (endpoint, payload) =
                request_payload(provider, "meta/llama:free", &transcript).unwrap();
            assert_eq!(endpoint, "https://openrouter.ai/api/v1/chat/completions");
            assert_eq!(payload["usage"]["include"], true);
            assert_eq!(payload["messages"][0]["role"], "system");
            assert_eq!(payload["messages"][1]["content"], "oi");
        }
        let (endpoint, payload) =
            request_payload(Provider::Anthropic, "claude", &transcript).unwrap();
        assert_eq!(endpoint, "https://api.anthropic.com/v1/messages");
        assert!(payload.get("system").is_some());
    }

    #[test]
    fn catalog_skips_malformed_and_negative_prices() {
        let list = parse_catalog(&json!({"data":[
            {"name":"sem id"},
            {"id":"x/neg","pricing":{"prompt":"-1","completion":"abc"}},
            {"id": "x/".to_string() + &"a".repeat(300)}
        ]}));
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].input_per_million, 0.0);
        assert!(!list[0].free, "only :free ids count as free");
        assert!(parse_catalog(&json!({})).is_empty());
    }

    #[test]
    fn provider_errors_never_echo_bodies() {
        for code in [400, 401, 402, 404, 429, 500, 503, 418] {
            let message = provider_error(StatusCode::from_u16(code).unwrap());
            assert!(!message.is_empty());
        }
        assert!(provider_error(StatusCode::PAYMENT_REQUIRED).contains("saldo"));
    }

    #[test]
    fn usage_is_read_for_each_provider_shape() {
        let or = extract_usage(
            Provider::OpenRouter,
            &json!({"model":"x/y","usage":{"prompt_tokens":10,"completion_tokens":5,"cost":0.0012}}),
        );
        assert_eq!((or.input, or.output, or.cost), (10, 5, Some(0.0012)));
        let an = extract_usage(
            Provider::Anthropic,
            &json!({"usage":{"input_tokens":7,"output_tokens":3}}),
        );
        assert_eq!((an.input, an.output, an.cost), (7, 3, None));
        assert_eq!(
            extract_usage(Provider::MinhaVida, &json!({})).cost,
            Some(0.0)
        );
    }

    #[test]
    fn anthropic_and_openrouter_response_shapes_are_supported() {
        assert_eq!(extract_text(Provider::Anthropic, &json!({"content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"resposta"}]})).unwrap(), "resposta");
        assert_eq!(
            extract_text(
                Provider::OpenRouter,
                &json!({"choices":[{"message":{"content":"resposta"}}]})
            )
            .unwrap(),
            "resposta"
        );
    }

    #[test]
    fn partial_responses_explicitly_report_incompleteness_for_each_provider() {
        let fixtures = [
            (
                Provider::OpenAI,
                json!({"status":"incomplete", "incomplete_details":{"reason":"max_output_tokens"}, "output":[{"type":"message","content":[{"type":"output_text","text":"parcial"}]}]}),
            ),
            (
                Provider::Anthropic,
                json!({"stop_reason":"max_tokens", "content":[{"type":"text","text":"parcial"}]}),
            ),
            (
                Provider::OpenRouter,
                json!({"choices":[{"finish_reason":"length","message":{"content":"parcial"}}]}),
            ),
        ];
        for (provider, response) in fixtures {
            assert_eq!(
                extract_text(provider, &response).unwrap(),
                format!("parcial{INCOMPLETE_NOTICE}")
            );
        }
        assert!(extract_text(
            Provider::OpenAI,
            &json!({"status":"failed", "error":{"message":"secret"}})
        )
        .is_err());
    }
}
