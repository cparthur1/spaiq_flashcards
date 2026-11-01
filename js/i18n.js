// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/i18n.js
 * Internationalization & Localization Engine for Flashcards WebApp.
 * Supports Portuguese (BR) and English (US).
 *
 * Language Detection Rules:
 * - Default language when browser language cannot be determined: Portuguese (BR) [pt-BR]
 * - If browser is Spanish (es*), Portuguese (PT) (pt-PT*), or Portuguese (BR) (pt*): set app language to Portuguese (BR) [pt-BR]
 * - All other languages: set to English (US) [en-US]
 * - Explicit user setting in settings overrides automatic detection (options: 'auto', 'pt-BR', 'en-US')
 */

export const LANGUAGE_STORAGE_KEY = 'flashcards_language';

export const TRANSLATIONS = {
  'pt-BR': {
    // App & Brand
    app_name: 'Spaiq Flashcards',
    app_subtitle: 'Abra um arquivo ou crie um novo baralho agora mesmo.',
    page_title_game: 'Flashcards',
    page_title_stats: 'Estatísticas & Progresso | Flashcards',
    page_title_generate: 'Criar Baralho de Flashcards',
    page_title_bulk_add: 'Adicionar Vários ao Caderno | Flashcards',

    // General Actions & Common
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    save: 'Salvar',
    delete: 'Excluir',
    close: 'Fechar',
    done: 'Concluído',
    edit: 'Editar',
    download: 'Baixar',
    back: 'Voltar',
    next: 'Próximo',
    skip: 'Pular',
    search: 'Pesquisar...',
    clear: 'Limpar',
    test: 'Testar',
    manage: 'Gerenciar',
    or: 'OU',
    loading: 'Carregando...',
    default: 'Padrão',
    yes: 'Sim',
    no: 'Não',
    all: 'Todos',
    minutes: 'minutos',
    cards_unit: 'cards',
    card_unit_singular: 'card',

    // Home / Landing Page
    explore_files: 'Explorar arquivos',
    create_deck: 'Criar Baralho',
    continue_session: 'Continuar Sessão Atual',
    streak_label_singular: 'dia seguido',
    streak_label_plural: 'dias seguidos',
    daily_study_streak: 'Sequência diária de estudos',
    open_source_footer: 'Esse app é OpenSource, verifique o código e contribua em',

    // Exam Week Modal
    exam_week: 'Semana de Provas',
    exam_week_subtitle: 'Misture múltiplos baralhos para estudar',
    exam_saved_title: 'Sessão em Andamento',
    exam_saved_desc: 'Você já tem uma mistura salva.',
    exam_continue_btn: 'Continuar Sessão Salva',
    exam_upload_label: 'Carregar Baralhos (.json)',
    exam_drop_title: 'Clique para selecionar arquivos .json',
    exam_drop_subtitle: 'Você pode selecionar múltiplos baralhos de uma vez',
    exam_selected_decks: 'Baralhos Selecionados',
    exam_total_cards: '{count} cards no total',
    exam_empty_msg: 'Nenhum baralho adicionado ainda.',
    exam_start_btn: 'Iniciar Mistura',
    exam_error_no_file: 'Selecione pelo menos um arquivo .json válido.',
    exam_error_too_large: 'Os baralhos somados são grandes demais para o navegador. Tente carregar menos baralhos.',
    exam_error_start: 'Erro ao iniciar Semana de Provas: {message}',
    exam_remove_deck_confirm: 'Remover o baralho "{name}" da Semana de Provas?',
    exam_deck_toggle: '{name}: {status}',
    exam_deck_enabled: 'Ativado',
    exam_deck_disabled: 'Desativado',
    exam_deck_removed_toast: 'Baralho removido da mistura',
    exam_cards_added_toast: '+{count} cards adicionados à mistura!',

    // Hamburger Menu & Modes
    quick_settings: 'Configurações rápidas',
    settings: 'Configurações',
    settings_subtitle: 'Acessibilidade, Pomodoro, IA e metas',
    my_account: 'Minha Conta',
    my_account_subtitle: 'Sincronização e Plano Pro',
    pomodoro_timer: 'Timer Pomodoro',
    pomodoro_timer_subtitle: 'Micro-pausas cognitivas',
    ai_assistant: 'Assistente de IA',
    ai_assistant_subtitle: 'Correções e explicações',
    study_modes: 'Modos de Estudo',
    mode_normal: 'Modo Normal',
    mode_normal_subtitle: 'Baralho atual em estudo',
    mode_notebook: 'Caderno de Erros',
    mode_notebook_subtitle: 'Cards favoritados e recuperação',
    mode_exam: 'Semana de Provas',
    mode_exam_subtitle: 'Mistura de múltiplos baralhos',
    actions: 'Ações',
    bulk_add_to_notebook: 'Adicionar Vários ao Caderno',
    view_stats: 'Ver Estatísticas',
    change_deck: 'Trocar Baralho',
    exit_app: 'Sair',
    exit_confirm: 'Deseja realmente sair da sessão?',

    // Study & Game Interface
    flip_card: 'Virar Cartão',
    submit_answer: 'Enviar',
    type_answer_placeholder: 'Digite sua resposta...',
    blank_placeholder: 'lacuna...',
    correct_answer: 'Resposta Correta!',
    incorrect_answer: 'Resposta Incorreta',
    your_answer: 'Sua resposta:',
    expected_answer: 'Gabarito:',
    next_question: 'Próxima Pergunta',
    add_bookmark: 'Favoritar no Caderno',
    remove_bookmark: 'Remover do Caderno',
    bookmark_added_toast: 'Card adicionado ao Caderno',
    bookmark_removed_toast: 'Card removido do Caderno',
    studying_deck_toast: 'Estudando: {title}',
    game_restarted_toast: 'Jogo reiniciado!',
    deck_restarted_toast: 'Baralho reiniciado!',
    session_completed_toast: 'Sessão concluída! Parabéns!',
    daily_goal_completed_toast: 'Meta diária do caderno concluída!',
    accuracy: 'Precisão',
    correct: 'Acertos',
    errors: 'Erros',
    remaining: 'Restantes',
    speed: 'Velocidade',
    duration: 'Duração',
    streak: 'Sequência',

    // Anki Ratings
    anki_again: 'Errei',
    anki_hard: 'Difícil',
    anki_good: 'Bom',
    anki_easy: 'Fácil',

    // Card Types
    card_type_open: 'Pergunta Aberta',
    card_type_open_double: 'Dupla Pergunta',
    card_type_mc: 'Múltipla Escolha',
    card_type_fill: 'Preencha a Lacuna',
    card_type_anki: 'Flashcard Anki',

    // Deck Completion
    deck_completed_title: 'Parabéns! Baralho Concluído!',
    deck_completed_subtitle: 'Você revisou todos os cartões disponíveis.',
    completed_cards: 'Cards Concluídos',
    best_streak: 'Maior Sequência',
    restart_deck: 'Reiniciar Baralho',
    back_to_home: 'Voltar ao Início',

    // Settings Modal
    settings_modal_title: 'Configurações',
    settings_modal_subtitle: 'Idioma, Acessibilidade, Pomodoro, IA e metas',
    settings_language_heading: 'Idioma do Aplicativo',
    settings_language_label: 'Idioma de exibição',
    settings_language_info: 'Detectado automaticamente com base no navegador.',
    lang_auto: 'Automático (Navegador)',
    lang_pt: 'Português (Brasil)',
    lang_en: 'English (US)',

    settings_accessibility_heading: 'Acessibilidade',
    haptic_vibration: 'Vibração tátil',
    haptic_vibration_desc: 'Feedback ao virar cards, acertos e erros',
    haptic_enabled_toast: 'Vibração tátil ativada',
    haptic_disabled_toast: 'Vibração tátil desativada',
    sound_effects: 'Efeitos sonoros',
    sound_effects_desc: 'Sinais sonoros em respostas e Pomodoro',
    sound_enabled_toast: 'Efeitos sonoros ativados',
    sound_disabled_toast: 'Efeitos sonoros desativados',
    animations_transitions: 'Animações e transições',
    animations_transitions_desc: 'Efeitos de partículas, ondas de choque e física',
    animations_enabled_toast: 'Animações ativadas',
    animations_disabled_toast: 'Animações desativadas',

    settings_notifications_heading: 'Notificações Diárias',
    settings_notifications_desc: 'Lembretes para praticar cards e salvar o streak',
    notif_morning: 'Manhã',
    notif_morning_desc: 'Inicie o dia revisando',
    notif_noon: 'Meio-dia',
    notif_noon_desc: 'Pausa do almoço e metas',
    notif_night: 'Noite (Salvar Streak)',
    notif_night_desc: 'Aviso antes da meia-noite se streak não salvo',
    urgent_tag: 'Urgente',
    test_notif_prompt: 'Teste como a notificação aparece no seu dispositivo:',
    test_notif_sent: 'Notificação de teste enviada!',
    notif_not_supported: 'Seu navegador não suporta notificações web.',
    notif_permission_denied: 'Permissão de notificação negada no navegador.',

    settings_pinned_stats_heading: 'Estatísticas no Cabeçalho',
    settings_pinned_stats_desc: 'Escolha quais métricas aparecem fixadas no topo',
    pinned_count_label: '{count} de {max} fixadas',
    pinned_tab_deck: 'Jogo Normal (Baralho)',
    pinned_tab_notebook: 'Caderno',
    pinned_min_warning: 'Pelo menos 1 estatística deve permanecer fixada',
    pinned_max_warning: 'Máximo de 3 estatísticas fixadas atingido',
    stat_pinned_toast: '"{label}" fixada no cabeçalho',
    stat_unpinned_toast: '"{label}" desafixada do cabeçalho',

    settings_pomodoro_heading: 'Pomodoro & Pausas',
    pomodoro_switch_title: 'Timer Pomodoro',
    pomodoro_switch_desc: 'Micro-pausas para combate à fadiga sináptica',
    focus_time: 'Tempo de Foco',
    micro_break: 'Micro-pausa',

    settings_ai_heading: 'Recursos de IA',
    gemini_assistant: 'Assistente Gemini',
    gemini_assistant_desc: 'Correção semântica e explicação de respostas',
    ai_enabled_toast: 'Recursos de IA ativados',
    ai_disabled_toast: 'Recursos de IA desativados',
    pro_exclusive_feature: 'Recurso exclusivo do plano Flashcards Pro',
    flashcards_pro_plan: 'Plano Flashcards Pro',
    pro_plan_active: 'Plano Flashcards Pro Ativo ✓',
    pro_plan_available: 'Disponível no Flashcards Pro',
    pro_ai_included: 'IA inclusa no plano',

    settings_notebook_heading: 'Meta do Caderno & Dados',
    daily_review_goal: 'Meta Diária de Revisão',
    no_limit_goal: 'Sem limite (Estudar todos os cards vencidos)',
    goal_cards_per_day: '{count} cards por dia',
    goal_progress_today: '{reviewed} revisados hoje • {due} vencidos',
    goal_set_toast: 'Meta diária: {goal} cards por dia!',
    goal_all_due_toast: 'Estudando todos os cards vencidos',
    clear_notebook: 'Limpar Caderno',
    clear_notebook_desc: 'Apaga todos os cartões e históricos',
    clear_notebook_confirm: 'Tem certeza de que deseja limpar todo o Caderno? Todos os cartões salvos e históricos de repetição serão apagados. Essa ação não pode ser desfeita.',
    clear_notebook_success: 'Caderno limpo com sucesso!',

    // Mindful Pomodoro Break
    pomodoro_break_title: 'Pausa Pomodoro',
    pomodoro_break_desc: 'Feche os olhos, beba água ou respire fundo. O cérebro consolida novas conexões durante o descanso.',
    pomodoro_break_timer_label: 'Tempo Restante de Pausa',
    pomodoro_skip_break: 'Pular Pausa e Voltar',
    pomodoro_break_over_title: 'Acabou a pausa!',
    pomodoro_continue: 'Continuar',
    pomodoro_prompt_title: 'Hora de uma micro-pausa!',
    pomodoro_prompt_desc: 'Faça uma pausa de 5 minutos para descansar a mente e consolidar o aprendizado.',
    pomodoro_start_break: 'Iniciar Pausa',
    pomodoro_not_now: 'Agora não',

    // Edit Modal
    edit_flashcard: 'Editar Flashcard',
    edit_question_label: 'Pergunta / Conceito',
    edit_answer_label: 'Resposta Principal',
    edit_answer2_label: 'Resposta 2',
    edit_detailed_answer_label: 'Resposta Detalhada',
    edit_anki_placeholder: 'Explicação detalhada... Suporta Markdown, listas e fórmulas LaTeX ($x^2$)',
    edit_fill_label: 'Respostas das Lacunas (separadas por ponto e vírgula ";")',
    edit_fill_help: 'Cada resposta preenche um "_" na ordem em que aparecem no texto. Sinônimos podem ser separados por "/".',
    edit_mc_label: 'Alternativas (2 a 6)',
    edit_mc_correct_badge: 'Marque a correta',
    edit_add_option: '+ Adicionar Alternativa',
    edit_image_url_label: 'Link da Imagem da Pergunta (Opcional)',
    edit_ans_image_url_label: 'Link da Imagem da Resposta (Anki)',
    save_changes: 'Salvar Alterações',

    // Explore Files Modal
    recent_decks_slots: 'Baralhos Recentes (3 Slots)',
    slot_overwritable_info: 'Slot aberto é sobrescritível',
    notebook_slot_label: 'Caderno',
    permanent_slot_info: 'Slot permanente',
    load_json_file: 'Carregar Arquivo (.json)',
    exam_week_mix: 'Semana de Provas (Misturar)',
    empty_slot: 'Slot Vazio',
    slot_in_progress: 'Em andamento',
    slot_completed: 'Concluído',
    pin_slot: 'Fixar slot',
    unpin_slot: 'Desafixar slot',
    share_deck: 'Compartilhar',
    delete_slot: 'Excluir',
    export_deck: 'Exportar .json',
    deck_shared_copied: 'Link de compartilhamento copiado!',
    slot_delete_confirm: 'Deseja excluir este baralho do slot?',
    notebook_clear_confirm: 'Deseja realmente limpar todo o Caderno?',

    // Pro Modal
    flashcards_pro_title: 'Flashcards Pro',
    flashcards_pro_subtitle: 'Sincronização em nuvem e recursos de Inteligência Artificial sem chave de API.',
    pro_feat_ai_gen: 'Gerar flashcards com IA usando seus materiais',
    pro_feat_semantic: 'Correção semântica e tutor virtual inteligente',
    pro_feat_cloud_sync: 'Sincronização na nuvem entre todos os seus dispositivos',
    pro_feat_unlimited: 'Estude em qualquer lugar sem limites',
    pro_subscribe_btn: 'Assinar Pro por R$ 4,99/mês',
    pro_unlocked_title: 'DESBLOQUEADO!',
    pro_unlocked_subtitle: 'FLASHCARDS PRO',

    // Account Modal
    account_subscription_title: 'Minha Conta & Assinatura',
    account_subscription_subtitle: 'Gerencie seu perfil, plano e pagamentos',
    google_sign_in: 'Entrar com o Google',
    google_sign_out: 'Sair da Conta',
    active_subscription: 'Assinatura Ativa',
    cancel_subscription: 'Cancelar Assinatura',
    delete_account: 'Excluir Conta',

    // Generator & Editor Page
    generate_page_title: 'Criar Baralho',
    traditional_section: 'Tradicional',
    create_now_title: 'Crie agora',
    create_now_desc: 'Crie cartões manualmente do zero.',
    convert_doc_title: 'Converta um doc',
    convert_doc_desc: 'Importe de texto, tabela ou documento.',
    ai_section: 'Inteligência Artificial',
    create_materials_title: 'Crie de materiais',
    create_materials_desc: 'Gere flashcards automaticamente com IA.',
    improve_doc_title: 'Aprimore um doc',
    improve_doc_desc: 'Melhore perguntas e respostas com IA.',
    deck_title_placeholder: 'Título do Baralho',
    add_card: 'Adicionar Cartão',
    save_deck: 'Salvar Baralho',
    play_deck: 'Iniciar Estudo',

    // Stats Page
    stats_title: 'Estatísticas',
    stats_overview: 'Visão Geral',
    total_cards_studied: 'Total de Cards Estudados',
    average_accuracy: 'Precisão Média',
    study_time: 'Tempo de Estudo',
    current_streak: 'Sequência Atual',
    anki_quality: 'Qualidade da Lembrança (Anki)',
    format_performance: 'Desempenho por Formato',
    session_timeline: 'Linha do Tempo da Sessão',
    activity_calendar: 'Calendário de Atividade',
    accuracy_evolution: 'Evolução da Precisão',
    detailed_history: 'Histórico Detalhado de Sessões',
    attention_cards: 'Cards que Precisam de Atenção',
    clear_stats_history: 'Limpar Histórico de Estatísticas',
    clear_stats_confirm: 'Deseja realmente limpar todo o histórico de estatísticas? Essa ação não pode ser desfeita.',

    // Bulk Add Page
    bulk_add_title: 'Adicionar Vários ao Caderno',
    bulk_add_subtitle: 'Faça upload de baralhos para o Caderno',
    loaded_decks_col: 'Baralhos Carregados',
    added_to_notebook_col: 'Adicionados ao Caderno',
    move_cards_here: 'Mova cartões para cá',
    select_all: 'Selecionar Todos',
    confirm_and_save: 'Confirmar e Salvar',

    // Streaks & Notifications
    streak_freeze_awarded: '+1 Protetor de Streak ganho! {streak} dias!',
    streak_count_notification: 'Sequência diária: {streak} {unit}!',
    streak_day_singular: 'dia',
    streak_day_plural: 'dias',
    shared_deck_deleted: 'Este baralho compartilhado foi apagado pelo proprietário.',

    // Additional Generator Page Keys
    back_to_home: 'Voltar ao início',
    choose_creation_mode: 'Selecione o modo de criação para os seus flashcards',
    manual_and_direct: 'Manual & Direto',
    open_direct_editor: 'Abrir editor direto',
    import_document: 'Importar documento',
    ai_powered: 'AI Powered',
    up_to_10_files: 'Até 10 arquivos',
    upload_materials_btn: 'Enviar slides & materiais',
    enhance_with_gemini: 'Aprimorar com Gemini',
    format_explanation_title: 'Como funciona a formatação:',
    format_explanation_text: 'Cada linha do documento vai ser um card. No modo <strong>Tradicional</strong>, o que vem antes do <strong>":"</strong> é a resposta e o que vem depois é a pergunta. No modo <strong>Anki-like</strong>, o que vem antes do <strong>":"</strong> é a frente e o que vem depois é o verso. Se quiser digitar a resposta, selecione tradicional, se não, anki-like.',
    special_tags: 'Tags especiais:',
    notes_and_dividers: 'Notas e Divisores:',
    notes_and_dividers_desc: 'Linhas iniciadas com # viram divisores de seção no editor (não aparecem durante o jogo).',
    select_card_format: 'Selecione o Formato dos Cards',
    format_traditional_desc: 'Você digita a resposta ao estudar no jogo.',
    format_anki_desc: 'Apenas virar e avaliar dificuldade (Errei/Fácil).',
    file_types_txt_doc: 'Arquivo (.txt, .doc, .docx)',
    drop_file_here: 'Clique ou arraste o arquivo aqui',
    supports_txt_doc: 'Suporta arquivos .txt, .doc ou .docx',
    convert_and_open_editor: 'Converter e Abrir Editor',
    create_materials_with_ai: 'Crie de materiais com IA',
    pro_feature_gemini_integrated: 'Geração de IA com Gemini integrada ao seu plano',
    active_status: 'Ativo',
    study_materials: 'Materiais de Estudo',
    upload_slides_pdfs_photos: 'Upload de slides, PDFs, textos ou fotos',
    no_file_selected: 'Nenhum arquivo selecionado',
    files_selected_count: '{count} arquivos selecionados',
    specific_demands: 'Demandas Específicas (Opcional)',
    specific_demands_placeholder: 'Ex: Priorize mecanismos de ação e diagnósticos diferenciais...',
    generating_with_gemini_msg: 'Processando arquivos e gerando flashcards com o Gemini...',
    generate_with_ai: 'Gerar com IA',
    enhance_doc_with_ai: 'Aprimore um documento com IA',
    enhance_instructions_title: 'Como estruturar para aprimoramento:',
    pro_feature_enhance_integrated: 'Aprimoramento de IA com Gemini integrado ao seu plano',
    drop_txt_word_here: 'Clique ou arraste o arquivo .txt ou Word',
    gemini_will_complete: 'O Gemini completará distratores e rótulos automaticamente',
    gemini_enhancing_msg: 'O Gemini está aprimorando e preenchendo as alternativas...',
    card_creator_tab: 'Criador de Cards',
    ai_assistant_tab: 'Assistente IA',
    card_type_label: 'Tipo de Cartão',
    card_type_write: 'Escrever',
    card_type_write_double: 'Escrever duplo',
    card_type_fill: 'Preencher',
    card_type_anki: 'Anki',
    card_type_mc: 'Múltipla escolha',
    card_type_comment: 'Comentário',
    creator_hint_open: 'Pergunta é uma descrição e você digita o nome do conceito.',
    creator_hint_open_double: 'Pergunta solicita dois termos e você digita ambos.',
    creator_hint_fill: 'Frase com lacunas "_" para você preencher os termos faltantes.',
    creator_hint_anki: 'Pergunta ou frente do cartão com resposta rica revelada ao virar.',
    creator_hint_mc: 'Pergunta com alternativas onde uma é a correta.',
    creator_hint_comment: 'Nota ou separador de seção (não aparece no jogo).',
    question_concept_label: 'Pergunta / Conceito',
    question_placeholder: 'Escreva a pergunta ou conceito...',
    question_image_label: 'Link da Imagem da Pergunta (Opcional)',
    remove_image: 'Remover',
    image_url_placeholder: 'Cole o link da imagem (https://...)',
    main_answer_concept: 'Resposta Principal (Conceito)',
    main_answer_placeholder: 'Nome do conceito...',
    first_answer_placeholder: 'Primeira resposta...',
    second_answer_placeholder: 'Segunda resposta...',
    fill_blanks_label: 'Respostas das Lacunas (separadas por ";")',
    fill_blanks_help: 'Use "_" no texto acima para cada lacuna. Cada resposta preenche uma lacuna na ordem de aparição. Sinônimos para a mesma lacuna podem ser separados por "/" (ex: 30 / trinta).',
    anki_desc_label: 'Resposta / Descrição Longa',
    anki_desc_placeholder: 'Explicação detalhada revelada ao virar o cartão... Suporta Markdown, listas e fórmulas LaTeX ($x^2$)',
    answer_image_label: 'Link da Imagem da Resposta (Opcional)',
    mc_options_label: 'Alternativas (2 a 6)',
    mc_correct_badge: 'Marque a correta',
    add_mc_option: 'Adicionar Alternativa',
    add_card_to_deck: 'Adicionar Card ao Baralho',
    ai_chat_greeting: 'Olá! Quer que eu ajuste algo? Diga, por exemplo: "Adicione 3 questões de múltipla escolha" ou "Reescreva a pergunta 2".',
    ai_chat_placeholder: 'Peça um ajuste ao baralho...',
    default_deck_title: 'Meu Baralho',
    save_file_btn: 'Salvar Arquivo',
    play_now_btn: 'Jogar Agora',
    gemini_generating_title: 'O Gemini está gerando seus flashcards',
    live_badge: 'AO VIVO',
    analyzing_docs_status: 'Analisando documentos e estruturando questões técnicas...',
    gemini_down_title: 'API do Gemini Indisponível',
    gemini_down_desc: 'A API do Gemini está temporariamente fora do ar ou enfrentando alta demanda. Como você prefere prosseguir?',
    use_traditional_txt_btn: 'Usar apenas conversão tradicional (TXT)',
    retry_gemini_btn: 'Tentar Novamente',
    alert_mc_min_options: 'A questão de múltipla escolha deve ter pelo menos 2 alternativas.',
    alert_comment_empty: 'Por favor, digite o texto do comentário.',
    alert_question_empty: 'Por favor, informe a pergunta ou selecione uma imagem.',
    alert_main_ans_empty: 'Por favor, digite a resposta principal.',
    alert_both_ans_empty: 'Por favor, preencha as duas respostas.',
    alert_anki_ans_empty: 'Por favor, informe a resposta ou uma imagem de resposta para o cartão Anki.',
    alert_mc_valid_range: 'A questão de múltipla escolha deve conter entre 2 e 6 alternativas válidas.',
    alert_mc_correct_empty: 'A alternativa correta selecionada não pode estar vazia.',
    alert_fill_missing_blank: 'A frase deve conter pelo menos uma lacuna "_" para preenchimento.',
    alert_fill_missing_answers: 'Por favor, informe a(s) resposta(s) esperada(s), separadas por ";" se houver mais de uma.',
    confirm_delete_card: 'Excluir este flashcard permanentemente?',
    alert_free_trial_no_export: 'Baralhos gerados no teste gratuito com IA não podem ser exportados como arquivo JSON.\n\nAssine o Spaiq Pro para exportar seus baralhos e ter acesso ilimitado!',
    alert_add_card_before_play: 'Adicione pelo menos um cartão antes de jogar.',
    alert_storage_quota_exceeded: 'Erro de espaço: o baralho é grande demais para salvar no navegador (provavelmente contém imagens locais antigas). Por favor, use links de imagem da web.',
    alert_pro_monthly_limit: 'Você atingiu o limite mensal de baralhos incluídos no Pro.\n\nDeseja adquirir 1 geração de baralho extra por R$ 0,99 agora?',

    // Additional Stats Page Keys
    back_to_game: 'Voltar ao Jogo',
    export_data: 'Exportar Dados',
    tab_current_session: 'Sessão Atual',
    tab_past_sessions: 'Sessões Anteriores',
    tab_struggling: 'Foco de Revisão',
    deck_cleared: 'Deck zerado',
    deck_cleared_sub: 'Todos os cards deste baralho foram respondidos.',
    progress: 'Progresso',
    progress_ratio: '{current} / {total} cards',
    excellent: 'Excelente',
    total_time: 'Tempo Total',
    average_time_per_card: 'Média: {time} / card',
    consecutive_correct: 'acertos seguidos',
    best_streak_record: 'Maior recorde: {streak}',
    estimate_pace: 'Previsão & Ritmo',
    calculating: 'Calculando...',
    to_finish_remaining: 'para concluir os cards restantes',
    fastest: 'Mais rápido: {time}',
    slowest: 'Mais lento: {time}',
    deck_mastery: 'Domínio do Baralho',
    starting: 'Iniciando',
    of_100: 'de 100',
    mastery_advancing: 'Avançando na memorização ativa',
    highlights_title: 'Grifos & Destaques',
    marked_snippets: 'trechos marcados',

    // Additional Bulk Add Page Keys
    bulk_add_header_title: 'Adicionar Vários ao Caderno',
    bulk_add_header_sub: 'Importe cartões de múltiplos baralhos para revisão espaçada contínua',
    notebook_total_count: '{count} no caderno',
    bulk_drop_title: 'Faça upload de baralhos para o Caderno',
    bulk_drop_sub: 'Arraste ou clique para selecionar um ou múltiplos arquivos .json. Você poderá escolher exatamente quais cartões deseja adicionar.',
    select_decks_btn: 'Selecionar Baralhos',
    load_more_decks: 'Carregar Mais Decks',
    selected_count: '{count} selecionados',
    add_to_notebook_btn: 'Adicionar ao Caderno',
    added_this_session: 'Nesta sessão',
    move_cards_here_title: 'Mova cartões para cá',
    move_cards_here_sub: 'Selecione cartões na lista da esquerda e clique no botão com a flecha para adicioná-los ao seu Caderno.',
    alert_question_empty_bulk: 'A pergunta/frente não pode ficar vazia.',
    confirm_remove_deck_from_notebook: 'Remover todos os cartões do baralho "{deckName}" do seu Caderno?',
    select_all_btn: 'Selecionar todos',
    decks_in_notebook: 'Baralhos no Caderno',
    notebook_subtitle_count: '{cardsCount} {cardsUnit} de {decksCount} {decksUnit}',
    search_notebook_cards_placeholder: 'Buscar por pergunta, resposta ou baralho...',
    edit_notebook_card: 'Editar Cartão do Caderno',
    front_label: 'Frente',
    back_label: 'Verso',
    all_cards_transferred: 'Todos os cartões foram transferidos!',
    load_more_to_add: 'Carregue mais baralhos se desejar adicionar outros cartões.',
    loaded_deck_singular: 'baralho carregado',
    loaded_decks_plural: 'baralhos carregados',
    cards_available_in_list: 'cartões disponíveis na lista',
    select_card_aria: 'Selecionar cartão',
    move_instant_to_notebook: 'Mover instantaneamente para o Caderno',
    clear_selection: 'Limpar seleção',
    card_moved_to_notebook: 'Cartão movido para o Caderno!',
    card_added_toast: '{count} cartão adicionado ao Caderno!',
    cards_added_toast: '{count} cartões adicionados ao Caderno!',
    card_removed_from_notebook: 'Cartão removido do Caderno',
    card_updated_success: 'Cartão atualizado com sucesso!',
    notebook_empty_title: 'Seu Caderno está vazio',
    notebook_empty_sub: 'Nenhum cartão salvo ainda. Faça upload de baralhos e clique em "Adicionar ao Caderno" para começar suas revisões espaçadas contínuas.',
    zero_cards_saved: '0 cartões salvos',
    all_decks_filter: 'Todos',
    no_cards_found: 'Nenhum cartão encontrado',
    try_another_search_or_deck: 'Tente buscar por outro termo ou selecione outro baralho no filtro acima.',
    click_to_expand_deck: 'Clique para expandir os cartões deste baralho',
    click_to_collapse_deck: 'Clique para recolher os cartões deste baralho',
    remove_deck_btn: 'Remover baralho',
    remove_deck_cards_title: 'Remover todos os cartões deste baralho do Caderno',
    reviewed_times: 'Revisado {count}x',
    edit_this_card: 'Editar este cartão',
    remove_from_notebook: 'Remover do Caderno',
    showing_cards_footer: 'Mostrando {visible} de {total} {unit}',
    deck_cards_removed_toast: '{count} {unit} do Caderno',
    card_removed_singular: 'cartão removido',
    cards_removed_plural: 'cartões removidos',
    error_saving_storage: 'Erro ao salvar no armazenamento local',
    no_valid_cards_found: 'Nenhum cartão válido encontrado nos arquivos.',
    cards_loaded_success: '{count} cartões carregados com sucesso!',
    added_singular: 'adicionado',
    added_plural: 'adicionados',
    selected_singular: 'selecionado',
    selected_plural: 'selecionados',
    deck_singular: 'baralho',
    decks_plural: 'baralhos',
    cartao_singular: 'cartão',
    cartoes_plural: 'cartões',
    cartao_salvo_singular: 'cartão salvo',
    cartoes_salvos_plural: 'cartões salvos',
    image: 'Imagem',
    deck_default: 'Baralho',
    in_a_row: 'seguidos',
    with_ai: 'com IA',
    streak_protected_recently: 'Streak protegido recentemente!',
    streak_protected_title: 'Sua sequência foi protegida pelo congelador recentemente!',
    heatmap_summary_days: '<strong>{days}</strong> {daysUnit} • <strong>{cards}</strong> {cardsUnit} nos últimos 5 meses',
    active_day_singular: 'dia ativo',
    active_days_plural: 'dias ativos',
    card_reviewed_singular: 'card revisado',
    cards_reviewed_plural: 'cards revisados',
    no_past_sessions: 'Nenhuma sessão anterior concluída ainda.',
    complete_round_hint: 'Conclua ou reinicie uma rodada para registrar seu histórico aqui!',
    session_completed: 'Concluída',
    session_partial: 'Parcial',

    // Notifications Module
    notif_default_title: 'Hora dos Flashcards',
    notif_default_body: 'Reserve alguns minutos para revisar seus cards e acelerar seu aprendizado.',
    notif_morning_title: 'Flashcards: Comece o dia com foco!',
    notif_morning_body_studied: 'Ótimo começo! Deseja avançar ainda mais na sua meta de hoje?',
    notif_morning_body_unstudied: 'Revise alguns cards agora pela manhã para ativar sua memória de longo prazo.',
    notif_noon_title: 'Flashcards: Pausa do Meio-dia',
    notif_noon_body_studied: 'Sua meta está em andamento! Que tal uma revisão rápida de consolidação?',
    notif_noon_body_unstudied: 'Aproveite o intervalo do almoço para adiantar seus cards e manter a mente afiada.',
    notif_night_title_danger: 'ATENÇÃO: Sua sequência vai ser perdida!',
    notif_night_body_danger_streak: 'Resta pouco tempo antes da meia-noite! Você ainda não estudou hoje e vai perder seu streak de {streak} dias. Entre agora para salvar sua sequência!',
    notif_night_body_danger_no_streak: 'O dia está acabando e você ainda não praticou hoje! Faça seus cards antes da meia-noite para manter o ritmo de estudos.',
    notif_night_title_review: 'Revisão Noturna de Consolidação',
    notif_night_body_review: 'Sua sequência de hoje já está salva, mas revisar antes de dormir ajuda a fixar conexões neurais durante o sono.'
  },

  'en-US': {
    // App & Brand
    app_name: 'Spaiq Flashcards',
    app_subtitle: 'Open a file or create a new deck right now.',
    page_title_game: 'Flashcards',
    page_title_stats: 'Statistics & Progress | Flashcards',
    page_title_generate: 'Create Flashcard Deck',
    page_title_bulk_add: 'Bulk Add to Notebook | Flashcards',

    // General Actions & Common
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    close: 'Close',
    done: 'Done',
    edit: 'Edit',
    download: 'Download',
    back: 'Back',
    next: 'Next',
    skip: 'Skip',
    search: 'Search...',
    clear: 'Clear',
    test: 'Test',
    manage: 'Manage',
    or: 'OR',
    loading: 'Loading...',
    default: 'Default',
    yes: 'Yes',
    no: 'No',
    all: 'All',
    minutes: 'minutes',
    cards_unit: 'cards',
    card_unit_singular: 'card',

    // Home / Landing Page
    explore_files: 'Explore files',
    create_deck: 'Create Deck',
    continue_session: 'Continue Current Session',
    streak_label_singular: 'day streak',
    streak_label_plural: 'day streak',
    daily_study_streak: 'Daily study streak',
    open_source_footer: 'This app is Open Source, check the code and contribute at',

    // Exam Week Modal
    exam_week: 'Exam Week',
    exam_week_subtitle: 'Mix multiple decks together to study',
    exam_saved_title: 'Session in Progress',
    exam_saved_desc: 'You already have a saved mix.',
    exam_continue_btn: 'Continue Saved Session',
    exam_upload_label: 'Load Decks (.json)',
    exam_drop_title: 'Click to select .json files',
    exam_drop_subtitle: 'You can select multiple decks at once',
    exam_selected_decks: 'Selected Decks',
    exam_total_cards: '{count} cards in total',
    exam_empty_msg: 'No decks added yet.',
    exam_start_btn: 'Start Mix',
    exam_error_no_file: 'Please select at least one valid .json file.',
    exam_error_too_large: 'The combined decks are too large for the browser. Try loading fewer decks.',
    exam_error_start: 'Error starting Exam Week: {message}',
    exam_remove_deck_confirm: 'Remove deck "{name}" from Exam Week?',
    exam_deck_toggle: '{name}: {status}',
    exam_deck_enabled: 'Enabled',
    exam_deck_disabled: 'Disabled',
    exam_deck_removed_toast: 'Deck removed from mix',
    exam_cards_added_toast: '+{count} cards added to mix!',

    // Hamburger Menu & Modes
    quick_settings: 'Quick settings',
    settings: 'Settings',
    settings_subtitle: 'Accessibility, Pomodoro, AI and goals',
    my_account: 'My Account',
    my_account_subtitle: 'Sync & Pro Plan',
    pomodoro_timer: 'Pomodoro Timer',
    pomodoro_timer_subtitle: 'Cognitive micro-pauses',
    ai_assistant: 'AI Assistant',
    ai_assistant_subtitle: 'Corrections and explanations',
    study_modes: 'Study Modes',
    mode_normal: 'Normal Mode',
    mode_normal_subtitle: 'Current deck in study',
    mode_notebook: 'Mistakes Notebook',
    mode_notebook_subtitle: 'Bookmarked cards & recovery',
    mode_exam: 'Exam Week',
    mode_exam_subtitle: 'Multi-deck mix',
    actions: 'Actions',
    bulk_add_to_notebook: 'Bulk Add to Notebook',
    view_stats: 'View Statistics',
    change_deck: 'Change Deck',
    exit_app: 'Exit',
    exit_confirm: 'Are you sure you want to exit the session?',

    // Study & Game Interface
    flip_card: 'Flip Card',
    submit_answer: 'Submit',
    type_answer_placeholder: 'Type your answer...',
    blank_placeholder: 'blank...',
    correct_answer: 'Correct Answer!',
    incorrect_answer: 'Incorrect Answer',
    your_answer: 'Your answer:',
    expected_answer: 'Expected answer:',
    next_question: 'Next Question',
    add_bookmark: 'Bookmark in Notebook',
    remove_bookmark: 'Remove from Notebook',
    bookmark_added_toast: 'Card added to Notebook',
    bookmark_removed_toast: 'Card removed from Notebook',
    studying_deck_toast: 'Studying: {title}',
    game_restarted_toast: 'Game restarted!',
    deck_restarted_toast: 'Deck restarted!',
    session_completed_toast: 'Session completed! Congratulations!',
    daily_goal_completed_toast: 'Notebook daily goal completed!',
    accuracy: 'Accuracy',
    correct: 'Correct',
    errors: 'Errors',
    remaining: 'Remaining',
    speed: 'Speed',
    duration: 'Duration',
    streak: 'Streak',

    // Anki Ratings
    anki_again: 'Again',
    anki_hard: 'Hard',
    anki_good: 'Good',
    anki_easy: 'Easy',

    // Card Types
    card_type_open: 'Open Question',
    card_type_open_double: 'Double Question',
    card_type_mc: 'Multiple Choice',
    card_type_fill: 'Fill in the Blank',
    card_type_anki: 'Anki Flashcard',

    // Deck Completion
    deck_completed_title: 'Congratulations! Deck Completed!',
    deck_completed_subtitle: 'You reviewed all available flashcards.',
    completed_cards: 'Completed Cards',
    best_streak: 'Best Streak',
    restart_deck: 'Restart Deck',
    back_to_home: 'Back to Home',

    // Settings Modal
    settings_modal_title: 'Settings',
    settings_modal_subtitle: 'Language, Accessibility, Pomodoro, AI and goals',
    settings_language_heading: 'App Language',
    settings_language_label: 'Display language',
    settings_language_info: 'Automatically detected based on your browser.',
    lang_auto: 'Automatic (Browser)',
    lang_pt: 'Português (Brasil)',
    lang_en: 'English (US)',

    settings_accessibility_heading: 'Accessibility',
    haptic_vibration: 'Haptic vibration',
    haptic_vibration_desc: 'Feedback on card flips, correct and wrong answers',
    haptic_enabled_toast: 'Haptic vibration enabled',
    haptic_disabled_toast: 'Haptic vibration disabled',
    sound_effects: 'Sound effects',
    sound_effects_desc: 'Audio cues on answers and Pomodoro',
    sound_enabled_toast: 'Sound effects enabled',
    sound_disabled_toast: 'Sound effects disabled',
    animations_transitions: 'Animations & transitions',
    animations_transitions_desc: 'Particle effects, shockwaves and physics',
    animations_enabled_toast: 'Animations enabled',
    animations_disabled_toast: 'Animations disabled',

    settings_notifications_heading: 'Daily Notifications',
    settings_notifications_desc: 'Reminders to practice cards and protect your streak',
    notif_morning: 'Morning',
    notif_morning_desc: 'Start your day with review',
    notif_noon: 'Noon',
    notif_noon_desc: 'Lunch break and goals',
    notif_night: 'Night (Save Streak)',
    notif_night_desc: 'Alert before midnight if streak is not saved',
    urgent_tag: 'Urgent',
    test_notif_prompt: 'Test how the notification looks on your device:',
    test_notif_sent: 'Test notification sent!',
    notif_not_supported: 'Your browser does not support web notifications.',
    notif_permission_denied: 'Notification permission denied in browser.',

    settings_pinned_stats_heading: 'Header Pinned Stats',
    settings_pinned_stats_desc: 'Choose which metrics appear pinned at the top',
    pinned_count_label: '{count} of {max} pinned',
    pinned_tab_deck: 'Normal Deck',
    pinned_tab_notebook: 'Notebook',
    pinned_min_warning: 'At least 1 stat must remain pinned',
    pinned_max_warning: 'Maximum of 3 pinned stats reached',
    stat_pinned_toast: '"{label}" pinned to header',
    stat_unpinned_toast: '"{label}" unpinned from header',

    settings_pomodoro_heading: 'Pomodoro & Breaks',
    pomodoro_switch_title: 'Pomodoro Timer',
    pomodoro_switch_desc: 'Micro-breaks to combat synaptic fatigue',
    focus_time: 'Focus Time',
    micro_break: 'Micro-break',

    settings_ai_heading: 'AI Features',
    gemini_assistant: 'Gemini Assistant',
    gemini_assistant_desc: 'Semantic evaluation and answer explanations',
    ai_enabled_toast: 'AI features enabled',
    ai_disabled_toast: 'AI features disabled',
    pro_exclusive_feature: 'Exclusive feature for Flashcards Pro subscribers',
    flashcards_pro_plan: 'Flashcards Pro Plan',
    pro_plan_active: 'Flashcards Pro Active ✓',
    pro_plan_available: 'Available in Flashcards Pro',
    pro_ai_included: 'AI included in plan',

    settings_notebook_heading: 'Notebook Goal & Data',
    daily_review_goal: 'Daily Review Goal',
    no_limit_goal: 'No limit (Study all due cards)',
    goal_cards_per_day: '{count} cards per day',
    goal_progress_today: '{reviewed} reviewed today • {due} due',
    goal_set_toast: 'Daily goal: {goal} cards per day!',
    goal_all_due_toast: 'Studying all due cards',
    clear_notebook: 'Clear Notebook',
    clear_notebook_desc: 'Deletes all cards and spaced review history',
    clear_notebook_confirm: 'Are you sure you want to clear the entire Notebook? All saved cards and spaced review history will be deleted. This cannot be undone.',
    clear_notebook_success: 'Notebook cleared successfully!',

    // Mindful Pomodoro Break
    pomodoro_break_title: 'Pomodoro Break',
    pomodoro_break_desc: 'Close your eyes, drink water, or take a deep breath. Your brain consolidates new connections during rest.',
    pomodoro_break_timer_label: 'Remaining Break Time',
    pomodoro_skip_break: 'Skip Break & Resume',
    pomodoro_break_over_title: 'Break is over!',
    pomodoro_continue: 'Continue',
    pomodoro_prompt_title: 'Time for a micro-break!',
    pomodoro_prompt_desc: 'Take a 5-minute break to rest your mind and consolidate learning.',
    pomodoro_start_break: 'Start Break',
    pomodoro_not_now: 'Not now',

    // Edit Modal
    edit_flashcard: 'Edit Flashcard',
    edit_question_label: 'Question / Concept',
    edit_answer_label: 'Main Answer',
    edit_answer2_label: 'Answer 2',
    edit_detailed_answer_label: 'Detailed Answer',
    edit_anki_placeholder: 'Detailed explanation... Supports Markdown, bullet lists, and LaTeX formulas ($x^2$)',
    edit_fill_label: 'Blank Answers (separated by semicolons ";")',
    edit_fill_help: 'Each answer fills a "_" in order of appearance. Synonyms can be separated by "/".',
    edit_mc_label: 'Options (2 to 6)',
    edit_mc_correct_badge: 'Mark correct',
    edit_add_option: '+ Add Option',
    edit_image_url_label: 'Question Image URL (Optional)',
    edit_ans_image_url_label: 'Answer Image URL (Anki)',
    save_changes: 'Save Changes',

    // Explore Files Modal
    recent_decks_slots: 'Recent Decks (3 Slots)',
    slot_overwritable_info: 'Open slot is overwritable',
    notebook_slot_label: 'Notebook',
    permanent_slot_info: 'Permanent slot',
    load_json_file: 'Load File (.json)',
    exam_week_mix: 'Exam Week (Mix)',
    empty_slot: 'Empty Slot',
    slot_in_progress: 'In progress',
    slot_completed: 'Completed',
    pin_slot: 'Pin slot',
    unpin_slot: 'Unpin slot',
    share_deck: 'Share',
    delete_slot: 'Delete',
    export_deck: 'Export .json',
    deck_shared_copied: 'Share link copied to clipboard!',
    slot_delete_confirm: 'Do you want to delete this deck from its slot?',
    notebook_clear_confirm: 'Are you sure you want to clear the entire Notebook?',

    // Pro Modal
    flashcards_pro_title: 'Flashcards Pro',
    flashcards_pro_subtitle: 'Cloud sync and Artificial Intelligence features without your own API key.',
    pro_feat_ai_gen: 'Generate flashcards with AI from your own study materials',
    pro_feat_semantic: 'Semantic answer checking and smart virtual tutor',
    pro_feat_cloud_sync: 'Seamless cloud sync across all your devices',
    pro_feat_unlimited: 'Study anywhere without limits',
    pro_subscribe_btn: 'Subscribe to Pro for R$ 4,99/mo',
    pro_unlocked_title: 'UNLOCKED!',
    pro_unlocked_subtitle: 'FLASHCARDS PRO',

    // Account Modal
    account_subscription_title: 'My Account & Subscription',
    account_subscription_subtitle: 'Manage your profile, plan, and payments',
    google_sign_in: 'Sign in with Google',
    google_sign_out: 'Sign Out',
    active_subscription: 'Active Subscription',
    cancel_subscription: 'Cancel Subscription',
    delete_account: 'Delete Account',

    // Generator & Editor Page
    generate_page_title: 'Create Deck',
    traditional_section: 'Traditional',
    create_now_title: 'Create now',
    create_now_desc: 'Build flashcards manually from scratch.',
    convert_doc_title: 'Convert a doc',
    convert_doc_desc: 'Import from text, tables, or documents.',
    ai_section: 'Artificial Intelligence',
    create_materials_title: 'Create from materials',
    create_materials_desc: 'Generate flashcards automatically with AI.',
    improve_doc_title: 'Enhance a doc',
    improve_doc_desc: 'Polish questions and answers with AI.',
    deck_title_placeholder: 'Deck Title',
    add_card: 'Add Card',
    save_deck: 'Save Deck',
    play_deck: 'Start Studying',

    // Stats Page
    stats_title: 'Statistics',
    stats_overview: 'Overview',
    total_cards_studied: 'Total Cards Studied',
    average_accuracy: 'Average Accuracy',
    study_time: 'Study Time',
    current_streak: 'Current Streak',
    anki_quality: 'Recall Quality (Anki)',
    format_performance: 'Performance by Format',
    session_timeline: 'Session Timeline',
    activity_calendar: 'Activity Calendar',
    accuracy_evolution: 'Accuracy Evolution',
    detailed_history: 'Detailed Session History',
    attention_cards: 'Cards Needing Attention',
    clear_stats_history: 'Clear Statistics History',
    clear_stats_confirm: 'Are you sure you want to clear all statistics history? This action cannot be undone.',

    // Bulk Add Page
    bulk_add_title: 'Bulk Add to Notebook',
    bulk_add_subtitle: 'Upload decks to your Notebook',
    loaded_decks_col: 'Loaded Decks',
    added_to_notebook_col: 'Added to Notebook',
    move_cards_here: 'Move cards here',
    select_all: 'Select All',
    confirm_and_save: 'Confirm & Save',

    // Streaks & Notifications
    streak_freeze_awarded: '+1 Streak Freeze earned! {streak} days!',
    streak_count_notification: 'Daily streak: {streak} {unit}!',
    streak_day_singular: 'day',
    streak_day_plural: 'days',
    shared_deck_deleted: 'This shared deck was deleted by its owner.',

    // Additional Generator Page Keys
    back_to_home: 'Back to home',
    choose_creation_mode: 'Select creation mode for your flashcards',
    manual_and_direct: 'Manual & Direct',
    open_direct_editor: 'Open direct editor',
    import_document: 'Import document',
    ai_powered: 'AI Powered',
    up_to_10_files: 'Up to 10 files',
    upload_materials_btn: 'Upload slides & materials',
    enhance_with_gemini: 'Enhance with Gemini',
    format_explanation_title: 'How formatting works:',
    format_explanation_text: 'Each line in the document becomes a card. In <strong>Traditional</strong> mode, what comes before <strong>":"</strong> is the answer and what comes after is the question. In <strong>Anki-like</strong> mode, what comes before <strong>":"</strong> is the front and after is the back. If you want to type the answer, pick traditional; otherwise, anki-like.',
    special_tags: 'Special tags:',
    notes_and_dividers: 'Notes & Dividers:',
    notes_and_dividers_desc: 'Lines starting with # become section dividers in the editor (not shown during the game).',
    select_card_format: 'Select Card Format',
    format_traditional_desc: 'You type the answer when studying in game.',
    format_anki_desc: 'Just flip and evaluate difficulty (Again/Easy).',
    file_types_txt_doc: 'File (.txt, .doc, .docx)',
    drop_file_here: 'Click or drag file here',
    supports_txt_doc: 'Supports .txt, .doc, or .docx files',
    convert_and_open_editor: 'Convert and Open Editor',
    create_materials_with_ai: 'Create from materials with AI',
    pro_feature_gemini_integrated: 'Gemini AI generation included with your plan',
    active_status: 'Active',
    study_materials: 'Study Materials',
    upload_slides_pdfs_photos: 'Upload slides, PDFs, text, or photos',
    no_file_selected: 'No file selected',
    files_selected_count: '{count} files selected',
    specific_demands: 'Specific Requirements (Optional)',
    specific_demands_placeholder: 'E.g.: Prioritize mechanisms of action and differential diagnoses...',
    generating_with_gemini_msg: 'Processing files and generating flashcards with Gemini...',
    generate_with_ai: 'Generate with AI',
    enhance_doc_with_ai: 'Enhance a document with AI',
    enhance_instructions_title: 'How to structure for enhancement:',
    pro_feature_enhance_integrated: 'Gemini AI enhancement included with your plan',
    drop_txt_word_here: 'Click or drag .txt or Word file',
    gemini_will_complete: 'Gemini will automatically generate distractors and labels',
    gemini_enhancing_msg: 'Gemini is enhancing and completing options...',
    card_creator_tab: 'Card Creator',
    ai_assistant_tab: 'AI Assistant',
    card_type_label: 'Card Type',
    card_type_write: 'Write',
    card_type_write_double: 'Double write',
    card_type_fill: 'Fill in blank',
    card_type_anki: 'Anki',
    card_type_mc: 'Multiple choice',
    card_type_comment: 'Comment',
    creator_hint_open: 'Question is a description and you type the concept name.',
    creator_hint_open_double: 'Question asks for two terms and you type both.',
    creator_hint_fill: 'Sentence with "_" blanks for you to fill in missing terms.',
    creator_hint_anki: 'Question or card front with rich answer revealed upon flip.',
    creator_hint_mc: 'Question with multiple options where one is correct.',
    creator_hint_comment: 'Note or section divider (not shown in game).',
    question_concept_label: 'Question / Concept',
    question_placeholder: 'Write question or concept...',
    question_image_label: 'Question Image URL (Optional)',
    remove_image: 'Remove',
    image_url_placeholder: 'Paste image URL (https://...)',
    main_answer_concept: 'Main Answer (Concept)',
    main_answer_placeholder: 'Concept name...',
    first_answer_placeholder: 'First answer...',
    second_answer_placeholder: 'Second answer...',
    fill_blanks_label: 'Blank Answers (separated by ";")',
    fill_blanks_help: 'Use "_" in text above for each blank. Each answer fills a blank in order. Synonyms can be separated by "/" (e.g.: 30 / thirty).',
    anki_desc_label: 'Answer / Detailed Description',
    anki_desc_placeholder: 'Detailed explanation revealed on flip... Supports Markdown, lists, and LaTeX formulas ($x^2$)',
    answer_image_label: 'Answer Image URL (Optional)',
    mc_options_label: 'Options (2 to 6)',
    mc_correct_badge: 'Mark correct',
    add_mc_option: 'Add Option',
    add_card_to_deck: 'Add Card to Deck',
    ai_chat_greeting: 'Hello! Want me to adjust anything? For example: "Add 3 multiple choice questions" or "Rewrite question 2".',
    ai_chat_placeholder: 'Ask for a deck adjustment...',
    default_deck_title: 'My Deck',
    save_file_btn: 'Save File',
    play_now_btn: 'Play Now',
    gemini_generating_title: 'Gemini is generating your flashcards',
    live_badge: 'LIVE',
    analyzing_docs_status: 'Analyzing documents and structuring technical questions...',
    gemini_down_title: 'Gemini API Unavailable',
    gemini_down_desc: 'The Gemini API is temporarily down or experiencing high traffic. How would you like to proceed?',
    use_traditional_txt_btn: 'Use traditional conversion only (TXT)',
    retry_gemini_btn: 'Try Again',
    alert_mc_min_options: 'Multiple choice questions must have at least 2 options.',
    alert_comment_empty: 'Please enter comment text.',
    alert_question_empty: 'Please enter question or select an image.',
    alert_main_ans_empty: 'Please enter the main answer.',
    alert_both_ans_empty: 'Please fill in both answers.',
    alert_anki_ans_empty: 'Please provide an answer or an answer image for the Anki card.',
    alert_mc_valid_range: 'Multiple choice questions must contain between 2 and 6 valid options.',
    alert_mc_correct_empty: 'The selected correct option cannot be empty.',
    alert_fill_missing_blank: 'Sentence must contain at least one blank "_" to fill.',
    alert_fill_missing_answers: 'Please provide expected answer(s), separated by ";" if more than one.',
    confirm_delete_card: 'Permanently delete this flashcard?',
    alert_free_trial_no_export: 'Decks generated in free AI trial cannot be exported as JSON.\n\nSubscribe to Spaiq Pro to export decks and get unlimited access!',
    alert_add_card_before_play: 'Add at least one card before playing.',
    alert_storage_quota_exceeded: 'Storage error: deck is too large to save in browser. Please use web image links.',
    alert_pro_monthly_limit: 'You have reached your monthly Pro deck limit.\n\nWould you like to purchase 1 extra deck generation for R$ 0,99 now?',

    // Additional Stats Page Keys
    back_to_game: 'Back to Game',
    export_data: 'Export Data',
    tab_current_session: 'Current Session',
    tab_past_sessions: 'Previous Sessions',
    tab_struggling: 'Review Focus',
    deck_cleared: 'Deck completed',
    deck_cleared_sub: 'All cards in this deck have been reviewed.',
    progress: 'Progress',
    progress_ratio: '{current} / {total} cards',
    excellent: 'Excellent',
    total_time: 'Total Time',
    average_time_per_card: 'Avg: {time} / card',
    consecutive_correct: 'consecutive correct',
    best_streak_record: 'Best record: {streak}',
    estimate_pace: 'Pace & Estimate',
    calculating: 'Calculating...',
    to_finish_remaining: 'to finish remaining cards',
    fastest: 'Fastest: {time}',
    slowest: 'Slowest: {time}',
    deck_mastery: 'Deck Mastery',
    starting: 'Starting',
    of_100: 'of 100',
    mastery_advancing: 'Advancing in active recall',
    highlights_title: 'Highlights & Markings',
    marked_snippets: 'highlighted snippets',

    // Additional Bulk Add Page Keys
    bulk_add_header_title: 'Bulk Add to Notebook',
    bulk_add_header_sub: 'Import cards from multiple decks for continuous spaced review',
    notebook_total_count: '{count} in notebook',
    bulk_drop_title: 'Upload decks to your Notebook',
    bulk_drop_sub: 'Drag or click to select one or multiple .json files. You can choose exactly which cards to add.',
    select_decks_btn: 'Select Decks',
    load_more_decks: 'Load More Decks',
    selected_count: '{count} selected',
    add_to_notebook_btn: 'Add to Notebook',
    added_this_session: 'This session',
    move_cards_here_title: 'Move cards here',
    move_cards_here_sub: 'Select cards in the left list and click the arrow button to add them to your Notebook.',
    alert_question_empty_bulk: 'Question/front cannot be empty.',
    confirm_remove_deck_from_notebook: 'Remove all cards of deck "{deckName}" from your Notebook?',
    select_all_btn: 'Select all',
    decks_in_notebook: 'Decks in Notebook',
    notebook_subtitle_count: '{cardsCount} {cardsUnit} from {decksCount} {decksUnit}',
    search_notebook_cards_placeholder: 'Search by question, answer, or deck...',
    edit_notebook_card: 'Edit Notebook Card',
    front_label: 'Front',
    back_label: 'Back',
    all_cards_transferred: 'All cards have been transferred!',
    load_more_to_add: 'Load more decks if you want to add other cards.',
    loaded_deck_singular: 'deck loaded',
    loaded_decks_plural: 'decks loaded',
    cards_available_in_list: 'cards available in the list',
    select_card_aria: 'Select card',
    move_instant_to_notebook: 'Move instantly to Notebook',
    clear_selection: 'Clear selection',
    card_moved_to_notebook: 'Card moved to Notebook!',
    card_added_toast: '{count} card added to Notebook!',
    cards_added_toast: '{count} cards added to Notebook!',
    card_removed_from_notebook: 'Card removed from Notebook',
    card_updated_success: 'Card updated successfully!',
    notebook_empty_title: 'Your Notebook is empty',
    notebook_empty_sub: 'No cards saved yet. Upload decks and click "Add to Notebook" to start your continuous spaced reviews.',
    zero_cards_saved: '0 cards saved',
    all_decks_filter: 'All',
    no_cards_found: 'No cards found',
    try_another_search_or_deck: 'Try searching for another term or select another deck above.',
    click_to_expand_deck: 'Click to expand cards from this deck',
    click_to_collapse_deck: 'Click to collapse cards from this deck',
    remove_deck_btn: 'Remove deck',
    remove_deck_cards_title: 'Remove all cards of this deck from Notebook',
    reviewed_times: 'Reviewed {count}x',
    edit_this_card: 'Edit this card',
    remove_from_notebook: 'Remove from Notebook',
    showing_cards_footer: 'Showing {visible} of {total} {unit}',
    deck_cards_removed_toast: '{count} {unit} from Notebook',
    card_removed_singular: 'card removed',
    cards_removed_plural: 'cards removed',
    error_saving_storage: 'Error saving to local storage',
    no_valid_cards_found: 'No valid cards found in files.',
    cards_loaded_success: '{count} cards loaded successfully!',
    added_singular: 'added',
    added_plural: 'added',
    selected_singular: 'selected',
    selected_plural: 'selected',
    deck_singular: 'deck',
    decks_plural: 'decks',
    cartao_singular: 'card',
    cartoes_plural: 'cards',
    cartao_salvo_singular: 'card saved',
    cartoes_salvos_plural: 'cards saved',
    image: 'Image',
    deck_default: 'Deck',
    in_a_row: 'in a row',
    with_ai: 'with AI',
    streak_protected_recently: 'Streak protected recently!',
    streak_protected_title: 'Your streak was protected by the streak freeze recently!',
    heatmap_summary_days: '<strong>{days}</strong> {daysUnit} • <strong>{cards}</strong> {cardsUnit} in the past 5 months',
    active_day_singular: 'active day',
    active_days_plural: 'active days',
    card_reviewed_singular: 'card reviewed',
    cards_reviewed_plural: 'cards reviewed',
    no_past_sessions: 'No previous sessions completed yet.',
    complete_round_hint: 'Complete or restart a round to log your history here!',
    session_completed: 'Completed',
    session_partial: 'Partial',

    // Notifications Module
    notif_default_title: 'Flashcards Time',
    notif_default_body: 'Take a few minutes to review your cards and accelerate your learning.',
    notif_morning_title: 'Flashcards: Start your day with focus!',
    notif_morning_body_studied: 'Great start! Want to make even more progress on today\'s goal?',
    notif_morning_body_unstudied: 'Review some cards this morning to activate your long-term memory.',
    notif_noon_title: 'Flashcards: Midday Break',
    notif_noon_body_studied: 'Your goal is on track! How about a quick consolidation review?',
    notif_noon_body_unstudied: 'Use your lunch break to review your cards and keep your mind sharp.',
    notif_night_title_danger: 'ATTENTION: Your streak is about to be lost!',
    notif_night_body_danger_streak: 'Little time left before midnight! You haven\'t studied today and will lose your {streak}-day streak. Jump in now to protect your streak!',
    notif_night_body_danger_no_streak: 'The day is almost over and you haven\'t practiced today! Review your cards before midnight to keep your study momentum.',
    notif_night_title_review: 'Nighttime Consolidation Review',
    notif_night_body_review: 'Your streak is already safe today, but reviewing before sleeping strengthens neural connections during rest.'
  }
};

/**
 * Detects the app language based on browser environment.
 * Rule:
 * - Default language when not possible to get browser's language: Portuguese (BR) [pt-BR]
 * - When browser is Spanish (es*), Portuguese (PT) (pt-PT*), or Portuguese (BR) (pt*): set to Portuguese (BR) [pt-BR]
 * - All other languages: set to English (US) [en-US]
 *
 * @returns {'pt-BR' | 'en-US'}
 */
export function detectBrowserLanguage() {
  try {
    const langs = (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length > 0)
      ? navigator.languages
      : (typeof navigator !== 'undefined' && navigator.language ? [navigator.language] : []);

    if (!langs || langs.length === 0) {
      return 'pt-BR'; // Default when not possible to get browser's language
    }

    const primary = (langs[0] || '').toLowerCase().trim();
    if (!primary) {
      return 'pt-BR';
    }

    // Spanish, Portuguese (PT), and Portuguese (BR) -> Portuguese (BR)
    if (primary.startsWith('es') || primary.startsWith('pt')) {
      return 'pt-BR';
    }

    // All other languages -> English (US)
    return 'en-US';
  } catch (e) {
    return 'pt-BR';
  }
}

/**
 * Gets the saved language preference ('auto', 'pt-BR', 'en-US')
 * @returns {string}
 */
export function getLanguagePreference() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'pt-BR' || saved === 'pt') return 'pt-BR';
    if (saved === 'en-US' || saved === 'en') return 'en-US';
    if (saved === 'auto') return 'auto';
  } catch (e) {}
  return 'auto';
}

/**
 * Resolves the active effective language code ('pt-BR' or 'en-US')
 * @returns {'pt-BR' | 'en-US'}
 */
export function getCurrentLanguage() {
  const pref = getLanguagePreference();
  if (pref === 'pt-BR') return 'pt-BR';
  if (pref === 'en-US') return 'en-US';
  return detectBrowserLanguage();
}

/**
 * Changes user language preference and reapplies translations.
 * @param {'auto' | 'pt-BR' | 'en-US'} pref
 */
export function setLanguage(pref) {
  try {
    if (pref === 'pt-BR' || pref === 'en-US' || pref === 'auto') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, pref);
      localStorage.setItem('flashcards_settings_updated_at', String(Date.now()));
    }
  } catch (e) {
    console.warn('[i18n] Erro ao salvar idioma:', e);
  }

  const activeLang = getCurrentLanguage();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = activeLang;
  }

  applyTranslations();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('flashcards:language-change', {
      detail: {
        language: activeLang,
        preference: pref
      }
    }));
  }
}

/**
 * Translates a key with optional dynamic parameters.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const lang = getCurrentLanguage();
  const dict = TRANSLATIONS[lang] || TRANSLATIONS['pt-BR'];
  let text = dict[key];

  if (text === undefined) {
    // Fallback to other language if missing
    const fallbackDict = (lang === 'pt-BR') ? TRANSLATIONS['en-US'] : TRANSLATIONS['pt-BR'];
    text = fallbackDict[key] !== undefined ? fallbackDict[key] : key;
  }

  if (params && typeof params === 'object') {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
    }
  }

  return text;
}

/**
 * Scans DOM and applies translations to all marked elements.
 * Supported attributes:
 * - data-i18n: sets textContent
 * - data-i18n-html: sets innerHTML
 * - data-i18n-placeholder: sets placeholder
 * - data-i18n-title: sets title
 * - data-i18n-alt: sets alt
 * - data-i18n-aria-label: sets aria-label
 *
 * @param {HTMLElement|Document} [root=document]
 */
export function applyTranslations(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const activeLang = getCurrentLanguage();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = activeLang;
  }

  // 1. textContent
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  });

  // 2. innerHTML
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) {
      el.innerHTML = t(key);
    }
  });

  // 3. placeholder
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = t(key);
    }
  });

  // 4. title
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
    }
  });

  // 5. alt
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    const key = el.getAttribute('data-i18n-alt');
    if (key) {
      el.alt = t(key);
    }
  });

  // 6. aria-label
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) {
      el.setAttribute('aria-label', t(key));
    }
  });
}

/**
 * Initializes i18n on page load and hooks cross-tab storage changes.
 */
export function initI18n() {
  const activeLang = getCurrentLanguage();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = activeLang;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyTranslations());
    } else {
      applyTranslations();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LANGUAGE_STORAGE_KEY) {
        applyTranslations();
        window.dispatchEvent(new CustomEvent('flashcards:language-change', {
          detail: {
            language: getCurrentLanguage(),
            preference: getLanguagePreference()
          }
        }));
      }
    });
  }
}

/**
 * Attaches interactive logic to a top header language menu.
 * Works with the standard header language dropdown markup:
 * - Trigger button: `#${btnId}`
 * - Dropdown card: `#${dropdownId}`
 * - Active code label: `#${labelId}`
 * - Option buttons: `.lang-option-btn[data-lang="..."]`
 *
 * @param {string} [btnId='lang-menu-btn']
 * @param {string} [dropdownId='lang-dropdown-menu']
 * @param {string} [labelId='lang-current-label']
 */
export function setupHeaderLanguageMenu(btnId = 'lang-menu-btn', dropdownId = 'lang-dropdown-menu', labelId = 'lang-current-label') {
  if (typeof document === 'undefined') return;

  const langBtn = document.getElementById(btnId);
  const langDropdown = document.getElementById(dropdownId);
  const currentLabel = document.getElementById(labelId);
  if (!langBtn || !langDropdown) return;

  const optionBtns = langDropdown.querySelectorAll('.lang-option-btn');

  function updateLanguageUI() {
    const cur = getCurrentLanguage();
    const pref = getLanguagePreference();
    if (currentLabel) {
      currentLabel.textContent = cur === 'pt-BR' ? 'PT' : 'EN';
    }
    optionBtns.forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      const check = btn.querySelector('.lang-check-icon');
      if (check) {
        if (lang === pref) {
          check.classList.remove('hidden');
        } else {
          check.classList.add('hidden');
        }
      }
    });
  }

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!langDropdown.contains(e.target) && !langBtn.contains(e.target)) {
      langDropdown.classList.add('hidden');
    }
  });

  optionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-lang');
      setLanguage(selected);
      updateLanguageUI();
      langDropdown.classList.add('hidden');
    });
  });

  window.addEventListener('flashcards:language-change', () => {
    updateLanguageUI();
  });

  updateLanguageUI();
}

// Auto-initialize on import
initI18n();
