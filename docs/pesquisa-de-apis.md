# Pesquisa de APIs

Levantamento feito em 30/10/2026 sobre como obter dados de Garmin, Oura, WHOOP e Apple Watch. As políticas dos fabricantes mudam com frequência, então confirme nas fontes oficiais antes de depender de qualquer detalhe. Itens marcados com **[a verificar]** não foram confirmados em fonte oficial.

## Resumo

| Aparelho | Caminho | Observações |
|---|---|---|
| Garmin | API Pessoal (chave gerada no Garmin Connect) | Reaberta em 21/10/2026. Gratuita, só leitura, para uso individual |
| Oura | API v2 com OAuth2 | Tokens pessoais (PAT) descontinuados |
| WHOOP | API v2 com OAuth2 | Aplicativos em desenvolvimento têm limite de 10 membros |
| Apple Watch | HealthKit, dentro do iPhone | Não existe API na nuvem; exige um app iOS |

Nenhum fabricante entrega o sinal bruto dos sensores (PPG, acelerômetro). Só chega o que a empresa decide expor.

## Garmin

### API Pessoal (usada pelo Life Track)

O programa de desenvolvedores da Garmin ficou fechado para novos pedidos de março a outubro de 2026 e reabriu em 21/10/2026 com três faixas:

| Faixa | Para quem | Dados | Custo |
|---|---|---|---|
| Personal | Uma pessoa lendo a própria conta | Atividades (JSON e arquivo FIT), saúde geral e saúde da mulher (JSON) | Grátis, sem aprovação |
| Starter | Empresas, até 1.000 usuários | Personal mais APIs de Treino e Cursos (enviar treino ao relógio) | Grátis, segundo a imprensa |
| Enterprise | Escala, com histórico e suporte | Tudo, incluindo histórico e intervalos batimento a batimento | Pago, cobrança a partir de 01/04/2027 |

Como funciona a autenticação, segundo a documentação oficial:

1. Você cria a chave em Garmin Connect (web), Configurações, Chave de API pessoal. A chave vale 30 dias, 90 dias, 180 dias ou 1 ano, e é exibida uma única vez.
2. A chave é trocada por um token de acesso (`POST /personalapitoken-service/personal-api/personal-api-key/token`, cabeçalho `Authorization: ApiKey <chave>`).
3. O token vale 24 horas e não tem refresh: pede-se um novo.

A Garmin mantém um cliente Python oficial (Apache 2.0): [garmin/connect-personal-api-python](https://github.com/garmin/connect-personal-api-python). O Life Track usa esse cliente.

Limitações conhecidas:

- Somente leitura e por consulta (pull). Nada chega sozinho depois do treino, e não dá para enviar treino ao relógio.
- Uso individual. A Garmin declara que a API Pessoal não serve a aplicativos comerciais com vários usuários.
- A Garmin pode remover campos proprietários dos arquivos FIT entregues pela API (VO2 máx., tempo de recuperação e condição de desempenho foram citados). **[a verificar]** se a faixa Personal entrega o arquivo completo.
- Limites de requisições não são divulgados.

### O que a API Pessoal entrega (testado)

| Dado | Comando do cliente | Usado no Life Track |
|---|---|---|
| Lista de atividades (81 campos por atividade) | `activities` | Sim |
| Arquivo FIT da atividade | `activity-download` | Sim (mapa, ritmo, voltas, dinâmica) |
| Sono (fases, nota, respiração, estresse) | `sleep-summaries` | Sim |
| HRV (média, faixa pessoal, status) | `hrv-summaries` | Sim |
| Resumo diário (FC de repouso, passos, Body Battery, estresse, calorias) | `daily-summaries` | Sim |
| FC ao longo do dia | `heart-rate` | Ainda não |
| Zonas de FC, idade fitness | `heart-rate-zones`, `fitness-age` | Ainda não |
| SpO2 e peso | `spo2`, `weight-measurements` | Sim (quando registrados) |
| Hidratação e alimentação | `hydration`, `food-logs` | Não: o relógio não grava água na conta e o diário alimentar é pago (Connect+) |

SpO2 e peso podem vir vazios se o recurso estiver desligado no relógio ou se nada tiver sido registrado.

### Outros caminhos (não usados)

- **Exportação completa da conta**: no site do Garmin Connect, em configurações da conta, há o pedido de exportação dos dados. É assíncrono e traz os arquivos FIT originais. Útil para histórico.
- **Bibliotecas não oficiais** (`python-garminconnect`): imitam o login do aplicativo, quebraram em março de 2026 depois de uma mudança de autenticação da Garmin e violam os termos de uso.
- **Agregadores** (Terra e similares): serviços pagos, pensados para empresas.
- **Connect IQ**: SDK gratuito para criar aplicativos no próprio relógio, com acesso mais granular aos sensores. Projeto à parte, em Monkey C.

## Oura

- API v2 com OAuth2. Tokens pessoais (PAT) foram descontinuados; as fontes divergem sobre a data. Não conte com eles.
- Tokens de atualização são de uso único: cada renovação invalida o anterior, então o novo token precisa ser gravado antes de ser usado.
- Aplicativos em desenvolvimento ficam limitados a 10 usuários até a aprovação da Oura, o que basta para uso pessoal.
- Cobre sono, atividade diária, treinos, sessões, VO2 máx., frequência cardíaca e configuração do anel. Prontidão, estresse e resiliência **[a verificar]**.
- Documentação oficial: <https://cloud.ouraring.com/v2/docs>.

## WHOOP

- API v2 (desde julho de 2025) com OAuth2 de código de autorização. O aplicativo é registrado no painel de desenvolvedores da WHOOP, que fornece `client_id` e `client_secret`.
- Aplicativos em desenvolvimento ficam limitados a 10 membros.
- Endpoints de dados: ciclos (`/v2/cycle`), recuperação (`/v2/recovery`), sono (`/v2/activity/sleep`), treinos (`/v2/activity/workout`), perfil e medidas corporais. A paginação usa `next_token`.
- A recuperação inclui HRV, FC de repouso, SpO2 e temperatura da pele.
- A API padrão não documenta FC contínua, ECG nem diário.
- Se há custo para uso pessoal **[a verificar]**.
- Documentação oficial: <https://developer.whoop.com/api>.

## Apple Watch

- Não existe API na nuvem. Os dados ficam no HealthKit, dentro do iPhone.
- O acesso exige um **aplicativo iOS** (Swift), com autorização do usuário por tipo de dado, que lê o HealthKit e envia para o servidor.
- A entrega em segundo plano (background delivery) é inconsistente segundo relatos de desenvolvedores: há casos de sincronização só com o iPhone carregando e de treinos que chegam sem a rota GPS.
- Alternativa sem programar: no app Saúde, "Exportar todos os dados de saúde" gera um `export.xml`.

## Fontes

- [Garmin: Connect Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/) e [FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- [Garmin: Health API](https://developer.garmin.com/gc-developer-program/enterprise/health-api/)
- [DC Rainmaker: Garmin revamps Connect Developer API Program](https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html)
- [the5krunner: Garmin Personal API Key 2026](https://the5krunner.com/2026/10/22/garmin-personal-api/)
- [Terra: Garmin Connect Developer Program pause](https://tryterra.co/blog/garmin-connect-developer-program-pause)
- [Terra: WHOOP API in 2026](https://tryterra.co/blog/whoop-api-data-access-permissions-limitations-2026)
- [Oura API v2](https://cloud.ouraring.com/v2/docs)
- [Apple Developer Forums: HealthKit background delivery](https://developer.apple.com/forums/thread/108530)
- [Open Wearables (referência de arquitetura)](https://github.com/the-momentum/open-wearables/wiki)
