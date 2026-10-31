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

O design é minimalista, com preto como base, tons de cinza e uma única família de fonte (Geist). Cor só aparece em pontinhos de status, sempre acompanhados de texto.

**Hoje (página inicial)**
- Seis indicadores em uma grade: sono, HRV, repouso, Body Battery, passos e estresse. Cada um mostra o valor mais recente, se está dentro, acima ou abaixo do **seu** normal, a diferença para a média de 30 dias e uma linha dos últimos 30 dias.
- O mapa de calor de atividade dos últimos 12 meses (um quadrado por dia, quanto mais claro, mais minutos de treino). Clique em um dia para abrir o treino.
- Os últimos treinos e o resumo dos últimos 7 dias contra a semana anterior.

**Cada indicador** (clique em um cartão da página inicial)
- Um dia em destaque, com o valor grande e os dados daquele dia: no sono, horário de dormir e acordar, nota, necessidade e fases; no HRV, a média da semana e a faixa equilibrada; no estresse, como o dia se dividiu; e assim por diante.
- Troque de dia com as setas da tela, com as **setas do teclado**, clicando no gráfico, clicando no mapa de calor do ano ou escolhendo uma linha da tabela.
- Gráfico dia a dia de 30 dias, 90 dias, 6 meses ou 1 ano, com o dia escolhido marcado. Média, valor mais baixo, mais alto e dias com dado do período. Mapa de calor do ano inteiro do indicador e tabela de todos os dias.

**Treinos**
- Totais do período, filtro por modalidade, mapa de calor, horas por semana e lista completa.
- Página de cada treino: mapa do percurso, ritmo, frequência cardíaca, altimetria, cadência e potência (cada um no seu gráfico), tempo em cada zona, dinâmica de corrida (contato com o solo, oscilação vertical, passada) e tabela de voltas.

O dia de hoje ainda está em andamento, então passos e estresse de hoje não entram nos cartões nem nas médias.

## Como funciona

```
 Navegador ──► servidor local (FastAPI, 127.0.0.1) ──► API Pessoal da Garmin
   gráficos        traduz e guarda só em memória            (a chave nunca sai do servidor)
```

- A chave fica em um arquivo da sua máquina e **nunca vai para o navegador**.
- O servidor guarda respostas em **memória** por pouco tempo (5 minutos para visão geral e lista de treinos, 1 hora para o detalhe de um treino). Ao reiniciar, tudo some. O botão de atualizar no canto superior direito limpa esse cache.
- Não há login. O servidor escuta apenas em `127.0.0.1`. **Não exponha na internet** nem em rede aberta.

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
- **Limites de requisições** não são divulgados.

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
- [ ] Garmin: FC ao longo do dia, SpO2, zonas e idade fitness
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
      views/         home, indicador, treinos e treino
docs/
  pesquisa-de-apis.md   o que cada fabricante oferece, com fontes
iniciar.sh         sobe o servidor e abre o navegador
requirements.txt   dependências
```

Rotas do servidor:

| Rota | O que devolve |
|---|---|
| `GET /api/overview?days=30` | Um registro por dia: sono, HRV, repouso, Body Battery, estresse, passos |
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
