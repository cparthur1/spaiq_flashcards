# Spaiq Flashcards

> Plataforma moderna, orientada a privacidade e potencializada por IA para estudo ativo, repetição espaçada e retenção de longo prazo.

[![Acessar Webapp](https://img.shields.io/badge/Acessar-Webapp%20Online-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white)](https://flashcards.camblu.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Ready-7c3aed?style=for-the-badge&logo=pwa&logoColor=white)](https://flashcards.camblu.org/)
[![Powered by Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4f46e5?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Local First](https://img.shields.io/badge/Privacidade-100%25%20Local-10b981?style=for-the-badge&logo=databricks&logoColor=white)](https://flashcards.camblu.org/)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg?style=for-the-badge)](./LICENSE)
[![DCO](https://img.shields.io/badge/DCO-Signed--off--by-green.svg?style=for-the-badge)](./DCO.txt)

> **Experimente online agora sem precisar instalar nada:**  
> **[https://flashcards.camblu.org/](https://flashcards.camblu.org/)**

O **Spaiq Flashcards** (ou simplesmente **Spaiq**) transforma materiais brutos (PDFs, documentos Word, slides ou anotações) em baralhos interativos de alta retenção, combinando o algoritmo de repetição espaçada (estilo Anki), geração inteligente de perguntas, categorização semântica por matérias e assuntos (Interleaving Effect), sincronização na nuvem para assinantes Pro, transferência P2P via QR Code e analítica cognitiva em tempo real.

---

## Principais Funcionalidades

### 1. Criação & Edição com IA (Google Gemini)
- **Geração Multiformato:** Crie baralhos técnicos a partir de arquivos **PDF**, **Docx (Word)**, **TXT** ou colando anotações diretamente no app.
- **Streaming em Tempo Real:** Os flashcards surgem na tela conforme são sintetizados pelo modelo. O editor abre instantaneamente para revisão contínua.
- **Edição Agêntica (Agentic Deck Editor):** Peça ajustes em linguagem natural no painel lateral de chat. O Gemini usa *Function Calling* para criar, atualizar ou podar cartões no baralho.
- **Correção Semântica Inteligente:** Na hora de responder, a IA analisa o significado da sua resposta escrita, perdoa pequenos erros de digitação e explica o fundamento do acerto ou erro.
- **Tutor Virtual Integrado:** Dúvidas no cartão atual? Abra o assistente dentro da partida para pedir analogias, exemplos práticos ou aprofundamento imediato.

---

### 2. Modos de Cartão & Renderização Científica
- **Aberto (Active Recall):** Digite a resposta esperada para forçar a recuperação ativa da memória.
- **Aberto Duplo:** Perguntas com 2 respostas obrigatórias (ex.: *Origem & Inserção*, *Mecanismo de Ação & Posologia*).
- **Preencher Lacunas (Fill in the Blanks / Cloze):** Frase com lacunas marcadas por `_` (ex: valores de referência, critérios diagnósticos, estadiamentos clínicos). Inputs interativos inline com autoajuste de largura, navegação por Enter/Tab, suporte a sinônimos com `/` e validação inteligente.
- **Múltipla Escolha:** 2 a 6 opções com feedback visual imediato e suporte a atalhos de teclado e gamepad.
- **Anki (Repetição Espaçada):** Cartões com frente/verso e autoavaliação em 4 botões (*Errei, Difícil, Bom, Fácil*).
- **Fórmulas Matemáticas (KaTeX):** Renderização impecável de LaTeX inline (`$...$`) e em bloco (`$$...$$`).
- **Markdown & Imagens:** Formatação rica com tabelas, negritos e imagens na pergunta e na resposta.

---

### 3. Gamificação Pedagógica & Sequência Diária (Spaiq Streaks)
- **Streaks Diários:** Acompanhamento motivacional de dias consecutivos de estudo, visível diretamente na tela inicial do app.
- **Proteção contra Perda (Streak Freeze):** Congeladores de cortesia que preservam a sua sequência caso imprevistos impeçam o estudo em um dia específico.
- **Metas Diárias Personalizadas:** Defina limites saudáveis de cartões/dia com presets rápidos (10, 20, 30, 50 cards) e feedback visual de conclusão de meta.

---

### 4. Sincronização em Nuvem & Spaiq Pro
- **Sincronização Multi-Dispositivo:** Seus baralhos e progresso sincronizados automaticamente entre computador, tablet e celular através do Cloudflare Workers e Google Cloud Firestore.
- **Privacidade por Padrão:** Usuários no plano gratuito operam em modo estritamente local (Local-First no navegador).
- **Assinaturas Transparentes:** Gestão de planos com Stripe, permitindo ativação instantânea, renovação e cancelamento transparente.
- **Transferência P2P Serverless (QR Code):** Alternativa para transferir sessões pontuais de estudo entre dispositivos em menos de 2 segundos via QR Code com bitsets binários e compressão LZ-String, sem necessidade de login.

---

### 5. Marca-Texto Interativo nos Cartões (Highlighter)
- **Seleção Dinâmica:** Selecione qualquer trecho de texto da pergunta ou resposta para exibir o gatilho minimalista flutuante.
- **Paleta Pastel com 4 Cores:** Amarelo, Verde, Azul e Roxo pastel sem distrações visuais.
- **Persistência Total:** Marcações são salvas permanentemente no baralho e acompanham o cartão nas próximas rodadas.
- **Desmarcar com 1 Toque:** Selecionar um trecho já grifado permite a remoção imediata da marcação.
- **Analytics de Destaques:** Acompanhe na página de estatísticas a contagem de grifos aplicados por cor.

---

### 6. Página de Estatísticas & Analítica Cognitiva (`pages/stats.html`)

#### Aba Sessão Atual
- **Progresso & Precisão:** Percentual de conclusão do baralho, acertos/erros, tempo total e ritmo médio (`s/card`).
- **Previsão & Ritmo:** Estimativa de tempo restante até zerar o baralho, card mais rápido (recall imediato) e card mais lento (reflexão aprofundada).
- **Domínio do Baralho (Mastery Score):** Índice de fixação (0 a 100 pontos) com distintivos dinâmicos (*Mestre do Baralho*, *Domínio Avançado*, *Em Construção*, *Iniciando*).
- **Linha do Tempo Invertida:** Exibe estritamente os **últimos 10 cartões respondidos**, com o mais recente posicionado na **extrema esquerda** com pulso indicador e tooltip detalhado.
- **Diagnóstico Pedagógico:** Análise comparativa sessão a sessão (`+X% vs sessão anterior`) para identificar ganhos ou fadiga cognitiva.

#### Categorização Semântica com Gemini Flash-Lite (Function Calling)
- **Desempenho por Matérias Globais:** Agrupa todos os seus baralhos estudados em disciplinas gerais (ex.: *Medicina*, *Semiologia*, *Farmacologia*) e aponta em quais matérias seu aproveitamento é superior.
- **Desempenho por Assuntos do Baralho:** Mapeia cada pergunta do baralho atual para um tópico conciso (ex.: *Valvopatias*, *Eletrocardiograma*, *Arritmias*) com barra de aproveitamento e badges de retenção.
- **Prática Intercalada (Interleaving Effect):** O algoritmo organiza perguntas em blocos intercalados de matérias para maximizar a retenção neural a longo prazo.

#### Aba Histórico
- Totais acumulados de sessões, tempo de estudo, cartões revisados, precisão histórica e **Recorde de Sequência Histórica**.
- Gráfico responsivo em SVG/CSS da evolução da precisão sessão a sessão.
- Grid de matérias globais para acompanhamento de longo prazo.

#### Aba Foco de Revisão
- Exibe estritamente os **Top 20 cards com maior frequência de erros** em ordem decrescente.
- Botão **+ Caderno** individual ou em lote para transferir dúvidas para o Caderno de Estudos.
- Opção **Ignorar** posicionada abaixo de cada botão para ocultar cartões pontuais da lista de atenção.

---

### 7. Caderno de Estudos (Notebook) & Semana de Provas
- **Caderno:** Espaço dedicado para isolar cartões difíceis, errados ou marcados para reforço imediato, sincronizado entre seus dispositivos.
- **Semana de Provas (Multi-Baralhos):** Agrupe vários baralhos de diferentes matérias em uma única rodada integrada para simular exames e vestibulares.

---

### 8. API REST de Estatísticas & Progresso (Spaiq Pro)
- **Integração Externa:** Conecte seus dados de estudo a aplicativos de acompanhamento de progresso, painéis pessoais (Notion, Obsidian, Home Assistant) ou widgets móveis.
- **Métricas Retornadas em JSON:** Data (`date`), total de cartões revisados no dia (`cards_reviewed`), taxa de retenção (`retention_rate`), tempo de estudo em segundos (`time_spent_seconds`) e sequência consecutiva de dias (`streak_days`).
- **Autenticação:** Chave secreta de API (`fc_live_...`) solicitada e gerenciada diretamente no menu de **Configurações** do webapp.
- **Documentação Técnica Completa:** Consulte a especificação dos endpoints, esquemas de erros e exemplos em Python, Node.js e cURL em [**docs/API.md**](./docs/API.md).

---

## Design System & Estética (Material Design 3)

O Spaiq foi projetado segundo diretrizes rigorosas:
- **Material Design 3 Expressive:** Tokens de superfície, elevações táteis, transições com curvas de aceleração padrão M3 e tipografia em Roboto Flex e Inter.
- **Ícones Oficiais:** Ícones consistentes do Google Fonts Material Symbols (`material-symbols-rounded`) e vetores SVG inline sem emojis.
- **Menu Hambúrguer Estruturado:** Header despoluído com seções organizadas (*Quick settings*, *Baralho*, *Estudo & Sessão*, *Sair*).
- **Instalação Nativa PWA:** Banner e diálogo de instruções para instalação em tela cheia no Android e iOS.

---

## Atalhos de Teclado & Gamepad

| Ação | Teclado | Gamepad / Controle |
| :--- | :--- | :--- |
| **Girar Cartão (Anki)** | `Espaço` ou `Enter` | Botão `A` / `Cross` |
| **Classificar Errei (Again)** | `1` | D-Pad `Esquerda` |
| **Classificar Difícil (Hard)** | `2` | D-Pad `Cima` |
| **Classificar Bom (Good)** | `3` | D-Pad `Direita` |
| **Classificar Fácil (Easy)** | `4` | D-Pad `Baixo` |
| **Alternativas (Múltipla Escolha)** | `1`, `2`, `3`, `4` | Botões frontais |
| **Console Diagnóstico** | `Alt + C` | — |

---

## Configuração da Chave da API do Gemini (Opcional & Grátis)

Os recursos básicos de flashcards funcionam **100% offline**. Para habilitar a geração de baralhos, o chat tutor e a categorização por matérias no modo gratuito:

1. Obtenha uma chave gratuita no [Google AI Studio](https://aistudio.google.com/app/apikey).
2. No menu do app, acesse **Configurações** -> **Inteligência Artificial**.
3. Cole sua chave de API (`AIzaSy...`).
4. Sua chave é guardada **apenas localmente no seu navegador** (`sessionStorage`/`localStorage`), garantindo total privacidade.

---

## Estrutura de Arquivos JSON (Modo Manual)

Você pode salvar e carregar seus próprios baralhos usando arquivos `.json`. O formato suportado é simples e extensível:

```json
[
  {
    "type": "anki",
    "description": "Qual a tríade clínica clássica da estenose aórtica?",
    "answer": "Dispneia de esforço, angina de peito e síncope."
  },
  {
    "type": "open",
    "description": "Qual o principal neurotransmissor inibitório do SNC?",
    "answer": "GABA"
  },
  {
    "type": "open_double",
    "description": "Quais são a origem e a inserção do músculo bíceps braquial?",
    "answer": "Tubérculo supraglenoidal e processo coracoide",
    "answer2": "Tuberosidade do rádio e aponeurose bicipital"
  },
  {
    "type": "multiple_choice",
    "description": "Qual a conduta inicial na hipercalemia grave com alterações no ECG?",
    "answer": "Gluconato de Cálcio a 10% IV",
    "options": [
      "Furosemida IV",
      "Gluconato de Cálcio a 10% IV",
      "Insulina regular com glicose",
      "Bicarbonato de Sódio"
    ]
  }
]
```

---

## Tecnologias Utilizadas

- **Frontend Core:** HTML5 Semântico, Vanilla JavaScript moderno (ES Modules).
- **Estilização:** Tailwind CSS + Material Design 3 Expressive ([`css/style.css`](css/style.css)).
- **Backend Serverless:** Cloudflare Workers (JavaScript edge computing) e Google Cloud Firestore.
- **Inteligência Artificial:** Google Generative AI SDK com chamadas estruturadas de Function Calling (`gemini-flash-lite-latest`).
- **Renderização Científica:** [KaTeX](https://katex.org/) (fórmulas matemáticas) e [Marked.js](https://marked.js.org/) (Markdown).
- **Sincronização & QR:** [LZ-String](https://pieroxy.net/blog/pages/lz-string/index.html) e [html5-qrcode](https://github.com/mebjas/html5-qrcode).
- **Pagamentos:** Stripe (Elements & Webhooks serverless).
- **PWA & Offline:** Service Worker ([`sw.js`](sw.js)) com cache estático automatizado.

---

## Acesso Online Imediato

Você pode utilizar o app diretamente pelo navegador em qualquer dispositivo (Desktop ou Mobile), sem precisar clonar ou instalar nada:

**[https://flashcards.camblu.org/](https://flashcards.camblu.org/)**

Compatível com instalação como PWA para funcionamento offline.

---

## Como Executar Localmente

Como o projeto é 100% estático no cliente e sem dependências de compilação complexas, basta servi-lo com qualquer servidor web HTTP:

```bash
# Clone o repositório
git clone https://github.com/cparthur1/Flashcards.git
cd Flashcards

# Inicie um servidor estático simples (exemplo com Python 3)
python3 -m http.server 8000

# Ou use Node.js
npx serve .
```

Abra `http://localhost:8000` no seu navegador favorito.

---

## Licença & Modelo de Contribuição (Linux Model)

Este projeto adota a filosofia de governança e documentação de direitos autorais inspirada no **Kernel Linux**:

- **Licença:** Distribuído sob a [GNU General Public License v2.0 (GPL-2.0-only)](./LICENSE).
- **Copyleft Forte:** Quem utilizar ou modificar este código e redistribuí-lo deve obrigatoriamente manter o projeto aberto sob os mesmos termos da GPLv2.
- **Identificadores SPDX:** O código-fonte utiliza cabeçalhos `SPDX-License-Identifier: GPL-2.0-only`.
- **DCO (Developer Certificate of Origin):** Sem transferência burocrática de propriedade intelectual (CLA). Você mantém os direitos autorais do seu código e assina cada commit com `git commit -s` (`Signed-off-by`).
- **Como Contribuir:** Consulte as regras detalhadas em nosso [CONTRIBUTING.md](./CONTRIBUTING.md) e o guia de direitos autorais em [dev_guidelines/COPYRIGHT_AND_LICENSING.md](./dev_guidelines/COPYRIGHT_AND_LICENSING.md).

---

*Desenvolvido para transformar estudos complexos em memória permanente e de longo prazo.*
