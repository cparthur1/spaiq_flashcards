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
  "streak_days": 18
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

---

## 4. Códigos de Status & Erros

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

## 5. Exemplos de Código

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

## 6. Casos de Uso Comuns

- **Aplicativos de Hábitos e Produtividade**: Integre com o aplicativo `track_progress` ou painéis de estudo para registrar o cumprimento da meta de flashcards do dia.
- **Widgets de Desktop & Mobile**: Crie widgets no Scriptable (iOS) ou KWGT (Android) para exibir sua sequência (`streak_days`) e cartões revisados (`cards_reviewed`) na tela inicial.
- **Painéis Notion / Obsidian**: Sincronize diariamente via script cron os minutos estudados (`time_spent_seconds`) e taxa de retenção (`retention_rate`) no seu diário de aprendizado.
- **README de Perfil do GitHub**: Adicione um badge ou gráfico dinâmico demonstrando seu compromisso diário com repetição espaçada.

---

## 7. Segurança & Boas Práticas

- **Mantenha sua chave confidencial**: Nunca cometa sua chave de API em repositórios públicos do GitHub.
- **Regeneração Imediata**: Caso sua chave seja exposta acidentalmente, utilize a opção **Regerar Chave** nas Configurações do Spaiq. A chave anterior deixará de funcionar instantaneamente.
