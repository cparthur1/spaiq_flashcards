#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""
sync_track_progress.py - Sincronizador Spaiq Flashcards <-> StudyFlow (track_progress)

Este script conecta a API de Estatísticas do Spaiq Flashcards (Pro) com o aplicativo
StudyFlow (track_progress), permitindo:
1. Consulta pontual das estatísticas diárias (cards revisados, retenção, tempo gasto e histórico de 14 dias).
2. Marcação automática de tarefas "Flashcards" pendentes no track_progress como concluídas quando houver estudo no dia.
3. Servidor de Webhook integrado para receber o evento em tempo real assim que a meta diária for batida!

Uso:
  # Consulta pontual e sincronização:
  python3 scripts/sync_track_progress.py --api-key fc_live_suachaveaqui

  # Executar como receptor de Webhook (porta 5050):
  python3 scripts/sync_track_progress.py --listen 5050
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.error
import http.server
from datetime import datetime

DEFAULT_API_URL = "https://flashcards-backend.camblu.workers.dev/api/v1/stats"
DEFAULT_TRACK_PATH = os.path.expanduser("~/apps/track_progress/data.json")

def fetch_flashcards_stats(api_key: str, api_url: str = DEFAULT_API_URL, date_str: str = None) -> dict:
    url = api_url
    if date_str:
        url += f"?date={date_str}"

    req = urllib.request.Request(url, headers={
        "X-API-Key": api_key,
        "User-Agent": "SpaiqTrackProgressSync/1.0"
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("message", err_body)
        except Exception:
            msg = err_body
        raise RuntimeError(f"Erro na API Flashcards ({e.code}): {msg}")
    except Exception as e:
        raise RuntimeError(f"Falha de conexão com a API Flashcards: {e}")

def update_track_progress_data(data_path: str, stats: dict, force_mark: bool = False) -> tuple[int, int]:
    """
    Atualiza tarefas relacionadas a Flashcards em track_progress/data.json
    Retorna (tarefas_atualizadas, total_tarefas_flashcards)
    """
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Arquivo track_progress não encontrado em: {data_path}")

    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cards_reviewed = stats.get("cards_reviewed", 0)
    should_complete = force_mark or (cards_reviewed > 0)

    updated_count = 0
    total_flashcard_todos = 0

    if not isinstance(data, list):
        return (0, 0)

    for subject in data:
        contents = subject.get("contents", [])
        for content in contents:
            todos = content.get("todos", [])
            for todo in todos:
                title = (todo.get("title") or "").strip().lower()
                if "flashcard" in title:
                    total_flashcard_todos += 1
                    if should_complete and not todo.get("completed"):
                        todo["completed"] = True
                        updated_count += 1

            # Recalcula se o conteúdo como um todo foi concluído
            if todos and all(t.get("completed") for t in todos):
                content["completed"] = True

    if updated_count > 0:
        # Salva backup
        bak_path = data_path + ".bak"
        try:
            with open(bak_path, "w", encoding="utf-8") as f_bak:
                with open(data_path, "r", encoding="utf-8") as f_orig:
                    f_bak.write(f_orig.read())
        except Exception:
            pass

        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return (updated_count, total_flashcard_todos)

def print_stats_summary(stats: dict):
    print("\n" + "=" * 55)
    print("📊 RESUMO DE ESTUDOS - SPAIQ FLASHCARDS PRO")
    print("=" * 55)
    print(f" Data:               {stats.get('date', 'N/A')}")
    print(f" Flashcards Feitos:  {stats.get('cards_reviewed', 0)}")
    retention = stats.get('retention_rate', 0.0)
    print(f" Taxa de Retenção:   {retention * 100:.1f}%")
    time_sec = stats.get('time_spent_seconds', 0)
    mins = time_sec // 60
    secs = time_sec % 60
    print(f" Tempo de Estudo:    {mins}m {secs:02d}s ({time_sec}s)")
    print(f" Sequência Diária:   {stats.get('streak_days', 0)} dias 🔥")
    print("-" * 55)
    print(f" Histórico 14d (Cards): {stats.get('past_14_days_cards', 'N/A')}")
    print(f" Histórico 14d (Tempo): {stats.get('past_14_days_time', 'N/A')}")
    print("=" * 55 + "\n")

def run_webhook_server(port: int, data_path: str):
    class WebhookHandler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                payload = json.loads(raw_body)
            except Exception:
                payload = {}

            event = payload.get("event") or self.headers.get("X-Spaiq-Event", "unknown")
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Webhook recebido! Evento: {event}")
            print(f"  Payload: {json.dumps(payload, ensure_ascii=False)}")

            if event == "daily_goal_reached":
                updated, total = update_track_progress_data(data_path, payload, force_mark=True)
                print(f"  ✓ Meta diária alcançada! {updated} tarefa(s) de flashcards marcada(s) como concluída(s) em StudyFlow.")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"received": True, "status": "processed"}).encode("utf-8"))

        def log_message(self, format, *args):
            # Silencia logs padrão ruidosos do SimpleHTTP
            pass

    server_address = ("0.0.0.0", port)
    httpd = http.server.HTTPServer(server_address, WebhookHandler)
    print(f"\n🚀 Servidor de Webhook Spaiq Flashcards ativo na porta {port}!")
    print(f"👉 URL para configurar no Spaiq Flashcards: http://localhost:{port}/webhook")
    print("Aguardando eventos de meta diária batida (Pressione Ctrl+C para encerrar)...\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor de Webhook encerrado.")

def main():
    parser = argparse.ArgumentParser(description="Sincronizador Flashcards <-> track_progress")
    parser.add_argument("--api-key", help="Chave de API do Flashcards Pro (fc_live_...)")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="URL do endpoint da API Flashcards")
    parser.add_argument("--date", help="Data específica para consultar (YYYY-MM-DD)")
    parser.add_argument("--track-path", default=DEFAULT_TRACK_PATH, help="Caminho para o data.json do track_progress")
    parser.add_argument("--listen", type=int, help="Inicia o servidor receptor de Webhook na porta indicada (ex: 5050)")

    args = parser.parse_args()

    # Modo 1: Receptor de Webhook
    if args.listen:
        run_webhook_server(args.listen, args.track_path)
        return

    # Modo 2: Consulta pontual e sincronização
    api_key = args.api_key or os.environ.get("FLASHCARDS_API_KEY")
    if not api_key:
        print("Erro: Forneça a chave de API via --api-key ou defina a variável FLASHCARDS_API_KEY.", file=sys.stderr)
        print("Obtenha sua chave no Spaiq Flashcards em: Configurações -> API de Estatísticas (PRO).", file=sys.stderr)
        sys.exit(1)

    try:
        stats = fetch_flashcards_stats(api_key, args.api_url, args.date)
        print_stats_summary(stats)

        if os.path.exists(args.track_path):
            updated, total = update_track_progress_data(args.track_path, stats)
            if updated > 0:
                print(f"✨ SUCESSO: {updated} de {total} tarefa(s) 'Flashcards' foram marcadas como concluídas em StudyFlow!")
            else:
                print(f"ℹ️ {total} tarefa(s) 'Flashcards' encontradas. Nenhuma alteração pendente necessária.")
        else:
            print(f"Aviso: Arquivo track_progress não encontrado em {args.track_path}. Exibindo apenas resumo.")
    except Exception as e:
        print(f"Erro: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
