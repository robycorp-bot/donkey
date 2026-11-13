# Glossário

Termos que os agentes DEVEM usar como estão. Não sinônimo inventado.

| Termo | Significa | Não confundir com |
| --- | --- | --- |
| **Donkey** | Aplicativo desktop (Tauri) + documentação deste repositório | A fábrica genérica `factory-ia/` copiável para outros repos |
| **Harness** | Módulo meio de campo: audita, redige, resume e sintetiza antes de falar com Grau 33 | O chat na UI (chat consome o Harness quando integrado) |
| **Grau 33** | Zona não confiável: qualquer LLM ou API de terceiro fora do perímetro local | “Nível 33” de modelo ou temperatura |
| **Auditar solicitação** | Fluxo em que o usuário revisa o que seria enviado (achados, redações, resumo) e confirma ou cancela | Code review pós-entrega |
| **Dado sintético** | Conteúdo fictício com **mesma forma** (XML, JSON, colunas) que o real, para o modelo aprender estrutura sem PII | Mock de teste unitário descartável |
| **Meio de campo** | Donkey decide o que o Grau 33 vê; o fornecedor não é fonte da verdade sobre o que foi lido no disco | Proxy HTTP cego |
| **Provedor prioritário** | Claude, Grok e modelos do pacote Cursor (quando configurados) | Únicos provedores permitidos |
| **Cofre** | Armazenamento nativo de chaves de API no SO | Histórico de chat |
