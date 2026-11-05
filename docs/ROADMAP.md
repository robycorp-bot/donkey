# Roadmap

As fases descrevem ordem de evolução, sem datas prometidas. Recursos futuros devem permanecer identificados como planejados até terem comportamento e validação demonstráveis.

| Fase | Entrega | Critério de saída |
| --- | --- | --- |
| 0 — Fundação | Stack, DDD, versão, identidade visual e build | Interface executável; regras separadas de infraestrutura; verificações automatizadas |
| 1 — Editor e chat inicial | Workspace nativo, Monaco, salvamento com conflito, três APIs, cofre de chaves | Testes das regras; fluxo manual Windows de abrir/editar/salvar; chamada autorizada a cada API; falhas e bloqueios conferidos |
| 2 — Uso diário | Persistência de preferências e conversas, recuperação, pesquisa, atalhos e acompanhamento de alterações externas | Reinício sem perda prevista de estado; conflitos e desempenho observados em projetos reais |
| 3 — Ferramentas locais | Git, terminal, Docker e Live Server | Comandos e estado reais; processos encerráveis; acesso limitado ao workspace; erros visíveis |
| 4 — Agentes e modelos locais | Ollama, contexto selecionado, ferramentas e integração oficial Copilot | Autenticação validada; revisão de alterações; permissões, cancelamento e limites de execução definidos |
| 5 — Distribuição pessoal | Ícone final, empacotamento, assinatura se aplicável e instalação Windows | Executável e instalador testados em ambiente limpo; atualização e recuperação documentadas |

A versão 0.1.0 reúne a fundação e a implementação inicial da fase 1. A conclusão de cada verificação está registrada em [`VALIDACAO.md`](VALIDACAO.md); a presença do código não fecha automaticamente a fase.

A versão 0.2.0 antecipa Git, scripts npm, servidor HTML, prévia incorporada e instalador pessoal. Docker, terminal interativo, persistência de conversas e agentes permanecem pendentes. O [guia de primeiro teste](PRIMEIRO_TESTE.md) delimita os fluxos implementados.

Depois de existir um fluxo completo, medir tempo de abertura, uso de memória, custo do Monaco, latência das APIs e tamanho da distribuição. A ambição de leveza deve ser comprovada por essas medições.
