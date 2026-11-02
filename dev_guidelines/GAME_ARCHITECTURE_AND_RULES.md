# Arquitetura do Jogo, Mecânicas, Algoritmos e Regras de Desenvolvimento

> **Documento Oficial de Engenharia e Diretrizes**  
> **Caminho**: `dev_guidelines/GAME_ARCHITECTURE_AND_RULES.md`  
> **Público**: Desenvolvedores e Engenheiros do Flashcards WebApp  
> **Última Atualização**: Outubro de 2026

---

## 1. Visão Geral da Arquitetura e Ciclo de Vida

O motor de jogo do Flashcards WebApp é centralizado no arquivo [`js/game.js`](file:///home/chief_arthur/Apps/Flashcards/js/game.js) com suporte de módulos auxiliares ([`js/utils.js`](file:///home/chief_arthur/Apps/Flashcards/js/utils.js), [`js/stats-tracker.js`](file:///home/chief_arthur/Apps/Flashcards/js/stats-tracker.js), [`js/stats-ai.js`](file:///home/chief_arthur/Apps/Flashcards/js/stats-ai.js) e [`js/key-manager.js`](file:///home/chief_arthur/Apps/Flashcards/js/key-manager.js)).

### 1.1 Modos de Jogo
A aplicação opera em três modos distintos controlados via `activeMode` e sincronizados no `localStorage`:
1. **Normal (`flashcardsSave`)**: Baralho padrão selecionado pelo usuário.
2. **Caderno de Erros (`flashcardsNotebook`)**: Deck dinâmico contendo apenas cartões favoritados ou marcados para estudo de recuperação.
3. **Semana de Provas (`flashcardsExam`)**: Modo multi-deck agregador que mescla cartões de múltiplos baralhos habilitados. As misturas criadas ocupam um slot no sistema de 3 slots (`flashcards_deck_slots`) e são sincronizadas na nuvem para assinantes Pro, com metadados próprios (`isExam: true`, `mode: 'exam'`).

---

### 1.2 Sistema de Slots e Sincronização em Nuvem (Pro)
A aplicação adota um sistema de slots gerenciado por [`js/slot-manager.js`](file:///home/chief_arthur/apps/Flashcards/js/slot-manager.js):
1. **3 Slots de Baralhos e Misturas (Fila FIFO com Deslocamento Contínuo)**:
   - Os slots armazenam os baralhos recentes ou misturas de "Semana de Provas" criadas pelo usuário.
   - Cada slot registra `slotIndex`, `deckId`, `title`, `cardCount`, `isFixed`, `isCurrent`, `isExam`, `mode` e `deckData`.
   - **Mecânica de Deslocamento ao Abrir Novo Baralho**:
     - Quando todos os 3 slots estão ocupados e um novo baralho é aberto:
       - O 3º baralho mais antigo (Slot 3, `slotIndex: 2`) é excluído automaticamente.
       - O 2º baralho (Slot 2, `slotIndex: 1`) é movido para o 3º slot (`slotIndex: 2`).
       - O baralho anteriormente atual (Slot 1, `slotIndex: 0`) é movido para o 2º slot (`slotIndex: 1`).
       - O baralho recém-aberto ocupa o primeiro slot (Slot 1, `slotIndex: 0`, marcado como `isCurrent: true`).
     - Os usuários podem tornar qualquer baralho permanente baixando-o como arquivo `.json` ("Salvar Baralho"), dispensando confirmações invasivas a cada abertura.
   - **Bloqueio por Compartilhamento**:
     - O compartilhamento trava a substituição e exclusão automática (`isFixed: true`, `shareSlug`).
     - O baralho atual deve **sempre sincronizar com a nuvem, exceto quando todos os 3 slots estiverem compartilhados**.
     - Quando todos os 3 slots estiverem compartilhados, a exclusão automática fica totalmente bloqueada.
   - Se o slot for uma mistura da Semana de Provas (`isExam: true`), ao ser aberto ele restaura o estado em `flashcardsExam` e ativa `activeMode = 'exam'`.
   - Durante a partida no modo exame, alterações na mistura (resposta de cards, adição ou remoção de baralhos) atualizam o slot correspondente e disparam `debouncedSyncSlotsToCloud()`.
2. **Slot Dedicado do Caderno**:
   - Armazenado separadamente em `flashcardsNotebook` e sincronizado na nuvem como documento independente (`notebook_{uid}`).
3. **Sincronização Total em Nuvem (Backend Worker + Firestore)**:
   - Exclusiva para usuários Pro (assinantes ativos e emails whitelistados).
   - Preserva `deletedAt` para propagar exclusões de slots entre múltiplos dispositivos.
   - **Progresso**: Sincroniza os 3 slots de baralhos/misturas, o slot do Caderno, estado de jogo (`flashcardsSave`, `flashcardsExam`), modo ativo e meta diária do Caderno.
   - **Configurações**: Sincroniza preferências de IA (`flashcards_ai_enabled`), resposta tátil (`flashcardsHapticEnabled`), efeitos sonoros (`flashcardsSoundEnabled`), animações reduzidas (`flashcardsAnimationsEnabled`), temporizador Pomodoro (`flashcards_pomodoro_enabled`, `flashcards_pomodoro_settings`), agendamento de notificações (`flashcards_notifications_settings`), estatísticas fixadas no cabeçalho (`flashcards_header_pinned_stats_deck`, `flashcards_header_pinned_stats_notebook`) e categorização IA de matérias/assuntos (`flashcards_ai_categories`).
   - **Estatísticas**: Histórico de sessões (`flashcards_stats`) unificado por ID sem perda de sessões entre dispositivos, recalculando métricas agregadas (`allTime`).
   - **Streaks Diários**: Sequência diária consecutiva (`flashcards_daily_streak`) sincronizada com mesclagem inteligente de mapa de calor (Heatmap), melhor streak (`bestStreak`) e créditos de proteção (`freezesAvailable`, `frozenDates`).
   - Disparo do evento customizado `flashcards:sync-updated` para atualização reativa em tempo real da interface em todas as telas abertas.

---

### 1.3 Regras de Internacionalização (i18n)
- O arquivo de internacionalização ([`js/i18n.js`](file:///home/chief_arthur/apps/Flashcards/js/i18n.js)) **deve suportar estritamente apenas Português (`pt-BR`) e Inglês (`en-US`)**.
- Nenhum outro idioma ou dicionário regional deve ser adicionado.
- Navegadores configurados em Espanhol (`es*`) ou variações do Português (`pt*`, `pt-PT`) são automaticamente mapeados para `pt-BR`. Todas as demais línguas utilizam `en-US`.

---

### 1.4 Tipos de Flashcards Suportados

| Tipo (`card.type`) | Estrutura de Resposta | Interface de Entrada | Método de Validação |
| :--- | :--- | :--- | :--- |
| `open` | `card.answer` (sinônimos via `/`) | Campo de texto único `#answer-input` | Similaridade Levenshtein $\ge 0.8$ |
| `open_double` | `card.answer` e `card.answer2` | Dois campos `#answer-input-1` e `#answer-input-2` | Ambos com similaridade $\ge 0.8$ |
| `multiple_choice` | `card.answer`, `card.options` | 2 a 6 botões dinâmicos `.mc-option-btn` | Igualdade normalizada exata |
| `fill` | `card.answers` ou `card.answer` (separados por `;`) | Lacunas inline `.fill-blank-input` | Levenshtein $\ge 0.8$ em cada lacuna |
| `anki` | `card.answer`, `card.answerImage` | Botão Virar Cartão + 4 botões de avaliação | Auto-avaliação do usuário |
| `divisor` / `note` | N/A | Separadores de seção no editor | Ignorados no jogo (`isPlayableCard = false`) |

---

### 1.5 Ciclo de Vida de um Cartão (Fluxograma)

```
[ Início / Próximo ]
         │
         ▼
  loadQuestion() ──► Limpa UI com resetUI() e define questionStartTime
         │
         ▼
  [ Usuário Pensa & Digita / Clica ] ◄── schedulePrecomputeNextCard() roda em background
         │
         ▼
  handleOpenSubmit() / handleFillSubmit() / handleMCSubmit() / handleAnkiRating()
         │
         ▼
   Verificação & Cálculo de Similaridade (Levenshtein >= 80%)
         │
         ├────────────────────────────────────────┐
         ▼                                        ▼
   [ ACERTO ]                               [ ERRO ]
         │                                        │
         ▼                                        ▼
  showFeedback(true)                       showFeedback(false)
  • Pontuação & Streak +1                  • Streak zerada, wrongCount +1
  • Bolinha verde no Canvas                • Bolinha vermelha no Canvas
  • Animação flying-card ao header         • Card balança (shake) e mostra correção
  • Remoção do pool (ou leech check)       • Reagendamento com calculateThinkingGap()
         │                                        │
         ▼                                        ▼
  loadQuestion()                           [ Usuário clica Pular / Próxima ]
                                                  │
                                                  ▼
                                           loadQuestion()
```

---

### 1.4 Fluxo de Conclusão do Baralho (Deck Completion)

Quando todos os cartões jogáveis do baralho são memorizados (`questionsPool.length === 0`):
1. **Animação de Celebração**:
   - `launchCelebrationParticles(150)` dispara confetes coloridos no canvas de fundo `#background-canvas`.
2. **Tela de Conclusão no Card Holder**:
   - O `#question-card` transiciona para `#deck-completion-view` exibindo ícone 🏆, título comemorativo e grid com métricas resumo (Cards Concluídos, Precisão %, Duração e Sequência Máxima).
   - Disponibiliza dois botões de ação:
     - **"Ver estatísticas"**: Leva o usuário diretamente à página [`pages/stats.html`](file:///home/chief_arthur/Apps/Flashcards/pages/stats.html).
     - **"Restart"**: Limpa o canvas, reinicia score/streak, re-embaralha o baralho e inicia nova sessão via `initStatsSession()`.
   - Remove temporizadores automáticos arbitrários para dar controle total ao usuário.
3. **Persistência Enriquecida de Sessão**:
   - `completeCurrentSession()` finaliza a sessão gravando métricas completas (duração ativa, correções de IA, acurácia) tanto no `history` quanto mantendo `currentSession` ativo.
   - A página de estatísticas exibe o `#session-completed-banner` de 100% zerado e permite ao usuário alternar a visualização de todos os cards da sessão respondida.

---

## 2. Algoritmos Centrais e Regras Matemáticas

### 2.1 Algoritmo de Fila Adaptativa e Repetição Espaçada com Pilares Neurobiológicos

O jogo opera em modelo de **estudo intra-sessão e repetição entre sessões** (não utiliza calendário multi-dias). O algoritmo adapta o agendamento de cada cartão dinamicamente combinando quatro pilares da neurociência da aprendizagem:

1. **Dificuldades Desejáveis (Desirable Difficulties — Bjork)**:  
   Garante intervalo mínimo absoluto de **5 cartões** para que o eco fonológico e visual da memória de trabalho decaia (~15 a 30s), impedindo a "fluência ilusória" e forçando esforço cognitivo real de recuperação (retrieval practice).

2. **Erro de Predição e Efeito de Testagem (Prediction Error & Testing Effect)**:  
   - **Erros rápidos ($t < 2.0$s)**: Indicam falso reconhecimento impulsivo ou chute heurístico (alto erro de predição). Recebem gap dilatado (**8 a 10 cartões**) para quebrar o automatismo incorreto antes do re-teste.
   - **Erros de esforço prolongado ($t > 12.0$s)**: Indicam busca semântica exaustiva sem sucesso. Recebem gap contido próximo ao mínimo (**5 cartões**) para oportunizar reconsolidação imediata antes da extinção do traço.
   - **Histórico de erros (`wrongCount`)**: Cartões com muitos erros mantêm intervalos controlados para evitar distanciamento excessivo no deck.

3. **Latência de Resposta e Confirmação de Acerto**:  
   - Se um cartão já teve erros na sessão e é respondido corretamente com **esforço extremo ($t > 10.0$s)**, o traço ainda está no limiar frágil de esquecimento. O cartão **não gradua prematuramente**, exigindo uma segunda confirmação consecutiva (`correctStreak >= 2`).
   - Cartões normais respondidos fluentemente são graduados e removidos do pool da sessão.
   - **Regra Leech**: Cartões com $> 4$ erros exigem estritamente `correctStreak >= 2`.

4. **Prática Intercalada (Interleaving Effect)**:  
   Evita o aprendizado em blocos contínuos do mesmo assunto. Ao selecionar candidatos (sejam vencidos, novos ou aleatórios), o algoritmo prioriza cartões cujo tópico/assunto difere do cartão anterior (`lastCardTopic`).  
   - Quando o usuário ativa os recursos de IA, a categorização pedagógica de temas roda silenciosamente em segundo plano via Gemini Flash-Lite. Assim que concluída, a prática intercalada entra em ação imediatamente e sem qualquer atrito para o usuário.

5. **Combate à Fadiga Cognitiva (Pomodoro & Micro-Pausas)**:  
   Gerenciado por [`js/engine/pomodoro.js`](file:///home/chief_arthur/Apps/Flashcards/js/engine/pomodoro.js). Promove micro-pausas estratégicas para ativar a Default Mode Network (DMN), permitindo que o cérebro processe vias sinápticas em repouso.

---

### 2.2 Algoritmo de Similaridade de Texto (Levenshtein Otimizado)

A validação de respostas abertas e preenchimento de lacunas aceita variações legítimas e pequenos erros de digitação:

1. **Normalização Prévia (`normalizeString`)**:  
   Converte para caixa baixa, remove acentos (Unicode NFD), limpa marcações Markdown (`*`, `_`, `` ` ``, `$`), remove pontuação e observações entre parênteses `(...)`.

2. **Cálculo Levenshtein com Buffers Planos (`calculateSimilarity`)**:  
   Utiliza dois vetores tipados `Int32Array(sLen + 1)` em vez de matrizes bidimensionais completas, reduzindo drasticamente o consumo de memória e coletas de lixo (GC).
   - Limiar de aprovação: **$\ge 0.8$ (80% de similaridade)**.
   - Suporte nativo a sinônimos definidos com barra `/` (ex: `Brasília / Brasilia`).

---

### 2.3 Metadados Puros e Transparência de IA

1. **Invisibilidade em Tempo de Jogo**:  
   Campos atribuídos por IA (`aiTopic`, `aiSubject`) são metadados puros do JSON. **Nunca** devem ser renderizados como selos, tags ou elementos visuais na interface de jogo ou no editor.
2. **Filtro de Pausas de Estudo**:  
   No cálculo da velocidade média por cartão em estatísticas ([`js/stats-tracker.js`](file:///home/chief_arthur/Apps/Flashcards/js/stats-tracker.js)), qualquer resposta que leve mais de **90 segundos** é desconsiderada da média, pois reflete uma pausa do usuário (app deixado aberto).

---

## 3. Otimizações de Desempenho e Eficiência

O projeto conta com 4 otimizações críticas implementadas para garantir velocidade instantânea e preservar bateria:

1. **Gamepad API Orientada a Eventos**:  
   O loop `pollGamepad()` **não** roda incondicionalmente a 60/120 FPS. Ele permanece dormente (consumo de CPU 0%) e só é ativado quando o evento nativo `gamepadconnected` detecta um controle físico conectado.
2. **Levenshtein de Memória Linear $O(N)$**:  
   Substituição da alocação de matriz $O(N \cdot M)$ por vetores reutilizáveis `Int32Array`, evitando engasgos de Garbage Collection em dispositivos móveis.
3. **Pré-indexação $O(1)$ em Estatísticas de IA ([`js/stats-ai.js`](file:///home/chief_arthur/Apps/Flashcards/js/stats-ai.js))**:  
   `answersLog` e `strugglingCards` são normalizados em mapas hash uma única vez antes de iterar os cartões, eliminando dezenas de milhares de execuções redundantes de expressões regulares.
4. **Persistência Debounced do Estado de Jogo**:  
   `saveGameState()` agrupa gravações rápidas no `localStorage` com debounce leve (80ms) e executa *flush* síncrono nos eventos `beforeunload` e `pagehide`.

---

## 4. Regras Obrigatórias para Desenvolvedores (Guidelines)

Ao criar novas funcionalidades ou modificar código existente, siga rigorosamente estas regras:

### Regra 1: Logging Explícito e Identificável
Para permitir diagnósticos rápidos de problemas relatados por usuários ou testes:
- **Sempre** insira logs claros no console utilizando os prefixos padronizados:
  - `[Game]`: Interações de botões, ciclo de cards, UI e formulários.
  - `[Algorithm]`: Agendamento de gaps, seleção de candidatos, leeches e remoção do pool.
  - `[StatsTracker]`: Gravação de sessões, acertos e históricos.
  - `[Anki]`: Ações de virada e pontuações do gamepad/teclado.
  - `[Gamepad]`: Conexão, desconexão e status do loop.
- **Sempre** registre com `console.warn` quando uma ação do usuário for impedida por uma flag de bloqueio (`isOpenSubmitting`, `submitBtn.disabled`, `isAnimating`).

### Regra 2: Resiliência em Flags de Trava (Locks)
- **Nunca** ative flags como `isOpenSubmitting = true` ou `isAnimating = true` sem envolver a execução subsequente em blocos `try...catch`.
- Se ocorrer qualquer exceção no cálculo, na animação ou no registro de dados, o bloco `catch` deve restaurar `isOpenSubmitting = false` e `isAnimating = false` para evitar que a interface fique congelada para o usuário.

### Regra 3: Tipagem Defensiva em Strings e Objetos
- Jamais assuma que propriedades como `card.answer`, `card.description` ou `input.value` são strings válidas.
- Sempre utilize coerção segura antes de métodos de texto:
  ```javascript
  const answer = String(card?.answer ?? '');
  const parts = answer.split('/').map(s => s.trim()).filter(Boolean);
  ```

### Regra 4: Validação de Sessão de Estatísticas
- Ao registrar respostas em `recordStatsAnswer()`, sempre garanta que `data.currentSession` existe antes de acessar propriedades internas. Se não existir, reinicialize-a e recarregue a referência local de `data`.

### Regra 5: Arquitetura Orientada a Eventos
- Evite criar loops contínuos baseados em `setInterval` ou `requestAnimationFrame` que rodem em segundo plano sem necessidade. Prefira disparadores orientados a eventos (`addEventListener`, `MutationObserver`, `IntersectionObserver`).

### Regra 6: 
- Evite usar emojis. Use os icones do https://fonts.google.com/icons ou crie o vector.

### Regra 7: 
- Deixe dicas e regras nesse md para auxiliar os próximos agentes/devs a seguir coerencia
  
---

## 5. Estrutura de Arquivos Principais

```
├── dev_guidelines/
│   ├── DESIGN_LANGUAGE.md              # Diretrizes de UI/UX Material 3
│   └── GAME_ARCHITECTURE_AND_RULES.md  # Este documento (Regras do Jogo e Algoritmos)
├── js/
│   ├── game.js                         # Loop principal, UI do jogo e orquestrador
│   ├── engine/
│   │   ├── scheduler.js                # Algoritmo de repetição espaçada, fila adaptativa, interleaving e gaps
│   │   ├── effects.js                  # Haptics (vibração), Canvas de fundo, partículas e shockwaves
│   │   ├── input-controller.js         # Teclado e Gamepad API orientada a eventos
│   │   ├── tutor.js                    # IA Gemini, tutor interativo e avaliação semântica
│   │   └── pomodoro.js                 # Temporizador Pomodoro, fadiga cognitiva e micro-pausas
│   ├── stats-tracker.js                # Gravação de sessões, métricas e histórico local
│   ├── stats-ai.js                     # Métricas por tópico e agrupamento assistido
│   ├── utils.js                        # Levenshtein, normalização, KaTeX e rotas
│   ├── key-manager.js                  # Gerenciador seguro de API Key Gemini
│   ├── generate.js                     # Criador, editor e importador de baralhos
│   └── stats.js                        # Renderização do dashboard de estatísticas
├── pages/
│   ├── game.html                       # Página da partida
│   ├── generate.html                   # Editor e gerador de decks
│   └── stats.html                      # Painel analítico de desempenho
└── sw.js                               # Service Worker e cache PWA offline
```
