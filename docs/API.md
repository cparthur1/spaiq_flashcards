<!-- SPDX-License-Identifier: GPL-2.0-only -->
# Spaiq Flashcards - API de Estatísticas (REST API)

A **API de Estatísticas do Spaiq Flashcards** permite que assinantes **Flashcards Pro** exportem e sincronizem suas métricas diárias de estudo em tempo real com aplicativos externos de acompanhar progresso, painéis pessoais (Notion, Obsidian, Home Assistant), widgets para desktop/mobile ou bots de produtividade.

---

## 1. Visão Geral & Endpoint Base

- **Base URL Oficial:** `https://flashcards-backend.camblu.workers.dev`
- **Ambiente Local (Desenvolvimento):** `http://localhost:8000`
- **Formato de Dados:** JSON (`application/json; charset=utf-8`)
- **CORS:** Habilitado globalmente (`Access-Control-Allow-Origin: *`) para consumo a partir de navegadores, servidores e aplicativos móveis.

---

## 2. Autenticação & Chave de API (Exclusivo PRO)

> [!IMPORTANT]
> A geração e o consumo da API são **exclusivos para assinantes do plano Flashcards Pro**. Caso a assinatura seja cancelada ou expire, as requisições retornarão código `403 Forbidden`.

### Como Obter Sua Chave de API
1. Acesse o webapp [https://flashcards.camblu.org/](https://flashcards.camblu.org/) (ou seu servidor local).
2. Abra o menu **Configurações** (no menu lateral do jogo ou pelo atalho direto em Estatísticas).
3. Role até a seção **API de Estatísticas (PRO)**.
4. Clique em **Solicitar Chave de API**.
5. Sua chave com prefixo `fc_live_...` será gerada instantaneamente. Você pode copiá-la, regerá-la ou revogá-la a qualquer momento.

### Formas de Envio da Chave
A API aceita a chave através de qualquer um dos três métodos abaixo:

1. **Header `X-API-Key` (Recomendado):**
   ```http
   X-API-Key: fc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. **Header `Authorization: Bearer`:**
   ```http
   Authorization: Bearer fc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. **Query Parameter na URL:**
   ```http
   GET /api/v1/stats?api_key=fc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

---

## 3. Endpoints

### Obter Estatísticas Diárias do Usuário

Retorna as métricas de estudo, taxa de retenção, tempo gasto e sequência de dias para a data informada (ou o dia atual).

- **Método:** `GET`
- **Caminho:** `/api/v1/stats` *(ou `/api/stats`)*

#### Parâmetros de Consulta (Query Parameters)

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| `date` | `string` | Não | Data atual (`YYYY-MM-DD`) | Data no formato ISO `YYYY-MM-DD` (ex: `2026-11-05`). |
| `api_key` | `string` | Opcional se enviado via Header | — | Sua chave de API Pro. |
| `sample` | `boolean` | Não | `false` | Se `true`, preenche valores zerados com dados realistas para testes de interface. |

---

### Exemplo de Resposta (200 OK)

```json
{
  "date": "2026-11-05",
  "cards_reviewed": 142,
  "retention_rate": 0.88,
  "time_spent_seconds": 1840,
  "streak_days": 18,
  "past_14_days_time": "180;1250;950;0;1100;540;1400;360;0;600;1300;980;1600;1840",
  "past_14_days_cards": "12;109;82;0;98;45;120;30;0;50;110;85;140;142"
}
```

#### Descrição dos Campos

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `date` | `string` | Data de referência no formato `YYYY-MM-DD`. |
| `cards_reviewed` | `integer` | Quantidade total de flashcards respondidos pelo usuário no dia. |
| `retention_rate` | `float` | Taxa de acerto/retenção cognitiva no dia (entre `0.00` e `1.00`), calculada como `acertos / total_respondidos`. |
| `time_spent_seconds` | `integer` | Tempo ativo total dedicado ao estudo de flashcards no dia, medido em segundos. |
| `streak_days` | `integer` | Sequência consecutiva atual de dias com estudo (Spaiq Streak). |
| `past_14_days_time` | `string` | Tempo de estudo (em segundos) nos últimos 14 dias em ordem cronológica até a data consultada, separados por ponto e vírgula (`;`). |
| `past_14_days_cards` | `string` | Quantidade de cards respondidos nos últimos 14 dias em ordem cronológica até a data consultada, separados por ponto e vírgula (`;`). |

---

## 4. Webhooks de Meta Diária (Spaiq Pro)

Você pode cadastrar uma **URL de Webhook (POST)** no Spaiq para ser notificado em tempo real assim que a sua **meta diária de estudos** for batida no Caderno!

### Payload do Webhook (POST Event)

```json
{
  "event": "daily_goal_reached",
  "date": "2026-11-05",
  "cards_reviewed": 25,
  "daily_goal": 25,
  "streak_days": 18,
  "timestamp": "2026-11-05T11:47:00.000Z"
}
```

### Configuração no Webapp
1. Acesse **Configurações** -> **API de Estatísticas (PRO)**.
2. No bloco **Webhook de Meta Diária**, informe sua URL (ex: `https://seu-servidor.com/webhook` ou `http://localhost:5050/webhook`).
3. Clique em **Salvar Webhook** e teste o disparo em tempo real clicando em **Testar Webhook**.

---

## 5. Códigos de Status & Erros

A API adota códigos de status HTTP convencionais:

| Código | Identificador | Causa / Ação Recomendada |
| :--- | :--- | :--- |
| `200 OK` | — | Requisição concluída com sucesso. |
| `401 Unauthorized` | `unauthorized` | Nenhuma chave de API foi fornecida no cabeçalho ou na URL. |
| `401 Unauthorized` | `invalid_api_key` | A chave informada é inválida, inexistente ou foi revogada. |
| `403 Forbidden` | `pro_required` | A conta vinculada à chave não possui uma assinatura ativa do **Flashcards Pro**. |
| `404 Not Found` | `user_not_found` | Conta de usuário não encontrada no banco de dados. |

### Exemplo de Erro (403 Forbidden - Usuário Não-Pro):
```json
{
  "error": "pro_required",
  "message": "A API de estatísticas é exclusiva para assinantes Pro."
}
```

---

## 6. Exemplos de Código

### cURL
```bash
curl -X GET "https://flashcards-backend.camblu.workers.dev/api/v1/stats" \
  -H "X-API-Key: fc_live_suachaveaqui"
```

Consultando uma data retroativa específica:
```bash
curl -X GET "https://flashcards-backend.camblu.workers.dev/api/v1/stats?date=2026-11-01" \
  -H "X-API-Key: fc_live_suachaveaqui"
```

---

### Python (`requests`)
```python
import requests

API_KEY = "fc_live_suachaveaqui"
URL = "https://flashcards-backend.camblu.workers.dev/api/v1/stats"

headers = {
    "X-API-Key": API_KEY
}

response = requests.get(URL, headers=headers, timeout=10)

if response.status_code == 200:
    stats = response.json()
    print(f"Data: {stats['date']}")
    print(f"Cards Revisados: {stats['cards_reviewed']}")
    print(f"Taxa de Retenção: {stats['retention_rate'] * 100:.1f}%")
    print(f"Tempo Gasto: {stats['time_spent_seconds'] // 60} minutos")
    print(f"Sequência Diária: {stats['streak_days']} dias")
elif response.status_code == 403:
    print("Acesso negado: Assinatura Flashcards Pro necessária.")
else:
    print(f"Erro {response.status_code}: {response.json().get('message')}")
```

---

### JavaScript / Node.js (`fetch`)
```javascript
const API_KEY = 'fc_live_suachaveaqui';

async function fetchFlashcardsStats() {
  const res = await fetch('https://flashcards-backend.camblu.workers.dev/api/v1/stats', {
    headers: {
      'X-API-Key': API_KEY
    }
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Falha na API (${res.status}): ${error.message}`);
  }

  const data = await res.json();
  console.log('Estatísticas do dia:', data);
  return data;
}

fetchFlashcardsStats();
```

---

## 7. Conector Oficial: Integração com StudyFlow (`track_progress`)

O repositório inclui um script em Python pronto para sincronizar automaticamente suas estatísticas com o gerenciador de estudos **StudyFlow** (`track_progress`):

### 1. Consulta Pontual & Atualização Automática de Tarefas
Ao executar o conector, ele consulta as estatísticas do dia e marca automaticamente como concluídas todas as tarefas "Flashcards" pendentes nos seus conteúdos de estudo:
```bash
python3 scripts/sync_track_progress.py --api-key fc_live_suachaveaqui
```

### 2. Modo Servidor de Webhook (Tempo Real)
Inicie o conector como receptor de Webhook em background na porta `5050`:
```bash
python3 scripts/sync_track_progress.py --listen 5050
```
Em seguida, acesse **Configurações -> API de Estatísticas** no Spaiq Flashcards e aponte o Webhook para `http://localhost:5050/webhook`. Assim que sua meta diária de estudos for batida, o StudyFlow marcará as tarefas de flashcard como concluídas instantaneamente!

---

## 8. Casos de Uso Comuns

- **Aplicativos de Hábitos e Produtividade**: Integre com o aplicativo `track_progress` ou painéis de estudo para registrar o cumprimento da meta de flashcards do dia.
- **Widgets de Desktop & Mobile**: Crie widgets no Scriptable (iOS) ou KWGT (Android) para exibir sua sequência (`streak_days`) e cartões revisados (`cards_reviewed`) na tela inicial.
- **Painéis Notion / Obsidian**: Sincronize diariamente via script cron os minutos estudados (`time_spent_seconds`) e taxa de retenção (`retention_rate`) no seu diário de aprendizado.
- **README de Perfil do GitHub**: Adicione um badge ou gráfico dinâmico demonstrando seu compromisso diário com repetição espaçada.

---

## 9. Segurança & Boas Práticas

- **Mantenha sua chave confidencial**: Nunca cometa sua chave de API em repositórios públicos do GitHub.
- **Regeneração Imediata**: Caso sua chave seja exposta acidentalmente, utilize a opção **Regerar Chave** nas Configurações do Spaiq. A chave anterior deixará de funcionar instantaneamente.
