# Life Track

Painel web local para ver seus dados de saúde e treino de relógios e anéis inteligentes. Ele busca os dados direto na API do fabricante a cada abertura, mostra em gráficos e **não guarda nada em disco**: sem banco de dados, sem nuvem, sem conta.

> **Estado atual:** só o **Garmin** funciona hoje. **Oura** e **WHOOP** estão planejados e a [seção de cada um](#oura-ring) explica o que será preciso. **Apple Watch** exige um aplicativo iOS e está mais adiante no [roteiro](#roteiro).

| Aparelho | Estado | Como os dados chegam |
|---|---|---|
| Garmin (testado com Forerunner 165) | Funciona | API Pessoal da Garmin, chave gerada por você |
| Oura Ring | Planejado | API v2 com OAuth2 |
| WHOOP | Planejado | API v2 com OAuth2 |
| Apple Watch | Planejado | Aplicativo iOS lendo o HealthKit |

## O que o painel mostra

Visual no estilo Apple, em modo escuro: fundo preto, cartões cinza-grafite, fonte do sistema (SF Pro no Mac) e um único destaque laranja, usado só no que está selecionado ou é o dia atual. Barra lateral em três grupos, como no app Saúde: Resumo; Categorias (Recuperação, Sono, Atividade, Coração, Corpo); Registros (Treinos). No celular ela vira uma barra de abas. A busca encontra qualquer dado (⌘K de qualquer lugar). Há microanimações: barras que crescem, linhas que se desenham, números que contam, o controle segmentado que desliza e resposta ao toque em cada cartão. Quem ativa "Reduzir movimento" no sistema não vê nenhuma animação.

**Resumo (página inicial)**
- Um resumo do dia em texto, escrito a partir dos seus números, e o seletor de dia (clique na data para abrir um calendário).
- Um aviso quando o relógio não sincroniza há mais de um dia.
- "Editar" escolhe quais cartões aparecem; a escolha fica salva no navegador.
- Cartões do mesmo tamanho, nesta ordem: Body Battery, sono, passos, estresse, calorias, equilíbrio, frequência cardíaca (batimentos do dia inteiro), HRV, FC de repouso, esforço, respiração, peso, idade física, zonas de FC e oxigênio (os três últimos e a idade física começam desligados; ligue em "Editar").
- "Sua semana" com os indicadores principais lado a lado, o mapa de calor de treinos e as atividades recentes.

**Cada indicador** abre com o **dia escolhido no topo** (valor grande, todos os detalhes e, no sono, as fases e as notas), depois a **semana** com um gráfico próprio para cada dado, e só então as médias da semana:
- Sono: uma barra por noite, da hora em que dormiu até a hora em que acordou, com a duração e a nota.
- Passos e andares: barras com a meta e a média.
- Estresse: a composição de cada dia (repouso, baixo, médio, alto).
- Calorias: ativas e em repouso empilhadas.
- Body Battery e frequência cardíaca: a faixa do mínimo ao máximo, com o repouso marcado.
- HRV: a linha das noites sobre a sua faixa equilibrada.
- Equilíbrio: quantos dos seis indicadores principais ficaram no seu normal em cada dia.

Abaixo, a lista dia a dia (no sono: deitou, acordou, duração, nota e fases) e o dia escolhido em detalhe, com a curva do dia quando existe. As setas trocam de semana; o controle no topo troca para 30 dias, 90 dias ou 6 meses, com gráfico, estatísticas e a tabela completa. O mapa de calor do ano aparece nas duas visões.

**Categorias**: cada uma lista os seus indicadores com o valor do dia e os últimos 7 dias, e traz os cartões de detalhe: a curva da Body Battery (Recuperação), a FC do dia e o HRV da noite (Coração), peso e idade física (Corpo), treinos recentes (Atividade).

**Teclado**: ← e → trocam de dia na página de um indicador, Shift+← e Shift+→ trocam de semana, ⌘K abre a busca e "Pular para o conteúdo" é o primeiro item do Tab. O estudo de usabilidade e acessibilidade está em [docs/estudo-ux.md](docs/estudo-ux.md).

**Treinos**: totais, filtro por modalidade, mapa de calor, horas por semana e lista completa. Cada treino tem mapa, ritmo, FC, altimetria, cadência e potência (um gráfico para cada), zonas, dinâmica de corrida, voltas e outros números.

O dia de hoje ainda está em andamento: passos, calorias, estresse, andares e esforço aparecem como "até agora" e ficam fora das médias.

### O que depende do seu relógio e da sua conta

O painel puxa tudo o que a API Pessoal oferece, mas alguns dados só existem se você os registrar: **oxigênio (SpO2)** exige o Pulse Ox ligado no relógio (pode ser só durante o sono); **peso** é registrado no Garmin Connect (Mais › Estatísticas de saúde › Peso). O Life Track só lê. Quando não há registro, o cartão diz isso. Alimentação (diário pago da Garmin, o Connect+) e hidratação (o Forerunner 165 não grava água na conta) ficam de fora.

## Como funciona

```
 Navegador ──► servidor local (FastAPI, 127.0.0.1) ──► API Pessoal da Garmin
   gráficos        traduz e guarda só em memória            (a chave nunca sai do servidor)
```

- A chave fica em um arquivo da sua máquina e **nunca vai para o navegador**.
- O servidor guarda respostas em **memória** por pouco tempo (5 minutos para visão geral e lista de treinos, 1 hora para o detalhe de um treino). Ao reiniciar, tudo some. O botão de atualizar no canto superior direito limpa esse cache.
- Localmente não há login e o servidor escuta apenas em `127.0.0.1`. Hospedado, o painel fica aberto a quem souber o endereço, a menos que você defina `APP_PASSWORD` (veja "Hospedagem").

## Instalação

Requisitos: Python 3.12 ou mais novo, no macOS ou Linux (testado no macOS). Windows não foi testado.

```bash
git clone https://github.com/cauecarneiro/life-track.git
cd life-track

# com uv (recomendado)
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt

# ou só com pip
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Usando com Garmin

Funciona com qualquer relógio Garmin que sincronize com o Garmin Connect. Foi testado com o Forerunner 165. O que aparece depende do que o seu modelo registra: SpO2, por exemplo, pode vir vazio.

### 1. Crie a chave pessoal

A API Pessoal da Garmin é gratuita, não exige aprovação e é pensada para uma pessoa ler os próprios dados. Foi liberada em 21/10/2026.

1. Entre em **connect.garmin.com** pelo navegador (a chave é criada na versão web do Garmin Connect).
2. Abra **Configurações** e, no menu lateral, **Chave de API pessoal**.
3. Clique em **Criar chave** e aceite os termos.
4. Escolha a validade (30 dias, 90 dias, 180 dias ou 1 ano) e confirme.
5. **Copie a chave.** Ela é mostrada uma única vez. Se perder, apague e crie outra.

A Garmin avisa por e-mail cerca de uma semana antes de a chave expirar.

### 2. Guarde a chave num arquivo seu

O cliente da Garmin procura a chave em `~/.config/garmin/connect-personal-api-key`. Com a chave ainda copiada:

```bash
# macOS
mkdir -p ~/.config/garmin
pbpaste > ~/.config/garmin/connect-personal-api-key
chmod 600 ~/.config/garmin/connect-personal-api-key
```

No Linux, cole a chave nesse mesmo arquivo com um editor de texto e rode o `chmod 600`. Se preferir, use uma variável de ambiente: `export GARMIN_PERSONAL_API_KEY=...` (o valor pode ficar no histórico do terminal).

Não cole a chave em chats, issues, commits ou capturas de tela.

### 3. Teste a conexão

```bash
.venv/bin/gc-personal profile-settings
```

Se aparecer um JSON com as suas configurações, está conectado. Se der erro `401`, a chave expirou ou foi digitada errado.

### 4. Abra o painel

```bash
./iniciar.sh
```

O navegador abre em <http://127.0.0.1:8765>. Para mudar a porta: `PORT=9000 ./iniciar.sh`.

### Limitações da API Pessoal

- **Só leitura e por consulta.** Nada chega sozinho depois do treino, e não dá para enviar treinos ao relógio. Sincronize o relógio com o aplicativo Garmin Connect antes de abrir o painel.
- **Uso individual.** A Garmin declara que a API Pessoal não é para aplicativos comerciais com vários usuários. Para isso existem as faixas Starter e Enterprise.
- **A chave expira.** Depois do prazo, crie outra e substitua o arquivo.
- **Histórico.** Os dados começam quando o relógio começou a gravar na sua conta. Para trazer algo mais antigo, peça a exportação completa da conta no Garmin Connect.
- **Campos proprietários.** A Garmin pode remover alguns campos (como VO2 máx.) dos arquivos FIT entregues pela API.
- **Limite de consultas:** a API aceita 100 por minuto. O servidor fica abaixo disso (80 por minuto), espera a vez quando precisa, repete sozinho se a Garmin responder 429 e guarda em cache os dias já fechados, então o botão de atualizar só busca de novo o que pode ter mudado.

Detalhes e fontes em [docs/pesquisa-de-apis.md](docs/pesquisa-de-apis.md).

## Oura Ring

**Ainda não implementado.** O que já se sabe sobre o caminho:

- A API v2 da Oura usa **OAuth2**. Os tokens de acesso pessoal (PAT) foram descontinuados.
- Será preciso registrar um aplicativo no portal de desenvolvedores da Oura (<https://cloud.ouraring.com>), obter `client_id` e `client_secret` e cadastrar uma URL de retorno apontando para o servidor local.
- Aplicativos em desenvolvimento são limitados a 10 usuários, o que cobre uso pessoal.
- Os tokens de atualização são de uso único: cada renovação invalida o anterior, então o novo precisa ser gravado antes do uso.
- Dados previstos: sono, atividade diária, treinos, frequência cardíaca, VO2 máx., e prontidão, estresse e resiliência se a API confirmar.

## WHOOP

**Ainda não implementado.** O que já se sabe sobre o caminho:

- A API v2 usa **OAuth2** com código de autorização. É preciso registrar um aplicativo no painel de desenvolvedores da WHOOP (<https://developer.whoop.com>), obter `client_id` e `client_secret`, cadastrar a URL de retorno e escolher os escopos de cada categoria de dado.
- Aplicativos em desenvolvimento são limitados a 10 membros.
- Dados previstos: recuperação (com HRV, FC de repouso, SpO2 e temperatura da pele), sono, ciclos e treinos.
- A API não documenta frequência cardíaca contínua, ECG nem diário.
- Se há algum custo para uso pessoal ainda precisa ser verificado.

## Apple Watch

**Ainda não implementado.** Não existe API na nuvem para o Apple Watch: os dados ficam no HealthKit, dentro do iPhone. O caminho é um aplicativo iOS em Swift que leia o HealthKit, com sua autorização, e envie os dados ao servidor. Enquanto isso, o app Saúde permite exportar tudo em um `export.xml`.

## Roteiro

- [x] Garmin: sono, HRV, repouso, Body Battery, estresse, passos
- [x] Garmin: treinos com mapa, ritmo, FC, zonas, altimetria, cadência, potência e voltas
- [x] Garmin: FC ao longo do dia, Body Battery e HRV da noite, respiração, calorias, andares, zonas, idade física, peso e SpO2 (quando registrados)
- [ ] Tema claro
- [ ] Oura Ring
- [ ] WHOOP
- [ ] Apple Watch (app iOS)
- [ ] Carga de treino (aguda e crônica) e recuperação
- [ ] Plano de treino com base nos seus números
- [ ] Modo demonstração com dados fictícios, para testar sem aparelho

## Privacidade

Dados de saúde são sensíveis. O projeto foi feito para que nada saia da sua máquina além das chamadas à API do fabricante:

- Nenhum dado seu é salvo em disco pelo painel. O `.gitignore` bloqueia `data/`, arquivos `.fit`, `.zip`, `.gpx`, `.tcx`, `.env` e qualquer arquivo com `api-key` ou `bearer-token` no nome, para evitar commits acidentais.
- O token temporário da Garmin é guardado pelo cliente oficial em `~/.config/garmin/`, fora da pasta do projeto.
- O navegador carrega, de serviços externos: a fonte Geist (Google Fonts), as bibliotecas Chart.js e Leaflet (cdnjs) e os **blocos de mapa do OpenStreetMap**. Esse último recebe os endereços dos blocos que você visualiza, o que revela a região dos seus percursos. Se isso importa para você, troque o provedor de mapas em `app/static/js/views/workout.js` ou desative o mapa.
- Ao abrir uma issue ou enviar um pull request, **não inclua** chaves, respostas da API, arquivos FIT ou capturas de tela com seus dados.

## Estrutura

```
app/
  server.py        servidor FastAPI: chama a Garmin, processa os arquivos FIT, entrega JSON
  static/
    index.html
    css/style.css  todo o visual (cores e medidas em variáveis no topo)
    js/            módulos ES, sem etapa de build
      main.js        rotas, teclado, dica flutuante
      metrics.js     o que cada indicador mede e mostra (um lugar para adicionar indicadores)
      heatmap.js     o mapa de calor
      charts.js      gráficos (Chart.js) e mini-gráficos em SVG
      cards.js       os cartões do resumo e das páginas por assunto
      week.js        a visão semanal de cada indicador
      views/         hub (início, vitais, corpo, nutrição), indicador, treinos e treino
docs/
  pesquisa-de-apis.md   o que cada fabricante oferece, com fontes
iniciar.sh         sobe o servidor e abre o navegador
requirements.txt   dependências
```

Rotas do servidor:

| Rota | O que devolve |
|---|---|
| `GET /api/overview?days=30` | Um registro por dia: sono (com notas), HRV, FC, Body Battery, estresse, passos, andares, calorias, respiração, intensidade |
| `GET /api/day/{AAAA-MM-DD}` | Curva de FC, Body Battery e HRV da noite e SpO2 de um dia |
| `GET /api/profile` | Zonas de FC, idade física e peso |
| `GET /api/activities?days=365` | Lista de treinos |
| `GET /api/activities/{id}` | Pontos do percurso, voltas e dinâmica de um treino, lidos do arquivo FIT |
| `POST /api/refresh` | Limpa o cache em memória |

## Contribuindo

Contribuições são bem-vindas, principalmente para os itens do [roteiro](#roteiro). Para adicionar um indicador na tela, o ponto de partida é `app/static/js/metrics.js`. Para adicionar um aparelho, o ponto de partida é `build_overview` em `app/server.py`: ele monta um registro por dia com campos como `sleepH`, `hrv`, `restingHR`, `bbMax` e `steps`. Um novo provedor precisa devolver registros nesse mesmo formato para a interface funcionar sem mudanças.

Antes de abrir um pull request, confira que nenhum dado pessoal entrou no commit (`git diff --staged`).

## Aviso

Este é um projeto independente, sem vínculo com Garmin, Oura, WHOOP ou Apple. Os nomes são marcas dos respectivos donos. O painel é uma ferramenta de acompanhamento e não oferece orientação médica. A disponibilidade e as regras das APIs são dos fabricantes e podem mudar.

## Licença

[MIT](LICENSE)

## Hospedagem (Render, plano grátis)

O `render.yaml` cria o serviço a partir do `Dockerfile`. No Render: **New, Blueprint**, escolha este repositório e preencha a variável secreta:

- `GARMIN_PERSONAL_API_KEY`: a chave pessoal da Garmin (vale no máximo 1 ano; ao vencer, gere outra e troque em Environment).

Sem mais nada, o painel abre **sem senha**: quem tiver o endereço vê seus dados. Não compartilhe o link. Para proteger, crie no Render a variável `APP_PASSWORD`; o navegador passa a pedir usuário (qualquer um) e essa senha.

No plano grátis o serviço dorme após 15 minutos sem uso; a primeira visita depois disso leva cerca de 1 minuto. Cada push na `main` publica a nova versão.
