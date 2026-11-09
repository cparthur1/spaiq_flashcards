# -*- coding: utf-8 -*-
import subprocess
import os

# Step 1: Convert MD to HTML body via Pandoc
print("1. Converting Markdown to HTML with Pandoc...")
pandoc_res = subprocess.run([
    "pandoc",
    "docs/mapeamento_funcoes_game.md",
    "-f", "markdown",
    "-t", "html",
    "--toc",
    "--toc-depth=3"
], capture_output=True, text=True, check=True)

html_body = pandoc_res.stdout

# Step 2: Wrap into full styled HTML document with Mermaid and Print CSS
full_html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mapeamento de Funções - Flashcards</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    @page {{
      size: A4;
      margin: 15mm 12mm 15mm 12mm;
      @bottom-right {{
        content: counter(page);
      }}
    }}
    
    * {{
      box-sizing: border-box;
    }}
    
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }}
    
    h1 {{
      font-size: 22pt;
      color: #0f172a;
      border-bottom: 2px solid #3b82f7;
      padding-bottom: 8px;
      margin-top: 0;
      margin-bottom: 16px;
    }}
    
    h2 {{
      font-size: 16pt;
      color: #1e3a8a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 6px;
      margin-top: 28px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }}
    
    h3 {{
      font-size: 13pt;
      color: #2563eb;
      margin-top: 20px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }}
    
    p, li {{
      color: #334155;
    }}
    
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 20px 0;
      font-size: 9.5pt;
      page-break-inside: auto;
    }}
    
    tr {{
      page-break-inside: avoid;
      page-break-after: auto;
    }}
    
    thead {{
      display: table-header-group;
    }}
    
    th {{
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-bottom: 2px solid #94a3b8;
    }}
    
    td {{
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }}
    
    tr:nth-child(even) td {{
      background: #f8fafc;
    }}
    
    code {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 9pt;
      background: #f1f5f9;
      color: #0284c7;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }}
    
    pre {{
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
      font-size: 9pt;
      page-break-inside: avoid;
    }}
    
    pre.mermaid {{
      background: transparent !important;
      border: none !important;
      text-align: center;
      margin: 20px auto;
      display: flex;
      justify-content: center;
      page-break-inside: avoid;
    }}
    
    pre.mermaid svg {{
      max-width: 100% !important;
      height: auto !important;
    }}
    
    nav#TOC {{
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 24px;
      margin-bottom: 28px;
      page-break-after: always;
    }}
    
    nav#TOC ul {{
      margin: 6px 0;
      padding-left: 20px;
    }}
    
    nav#TOC a {{
      color: #2563eb;
      text-decoration: none;
    }}
    
    nav#TOC a:hover {{
      text-decoration: underline;
    }}
    
    hr {{
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0;
    }}
  </style>
</head>
<body>
  {html_body}
  
  <script>
    mermaid.initialize({{
      startOnLoad: false,
      theme: 'neutral',
      flowchart: {{
        curve: 'basis',
        useMaxWidth: true,
        htmlLabels: true
      }},
      securityLevel: 'loose'
    }});
    
    window.addEventListener('DOMContentLoaded', async () => {{
      // Transform pre.mermaid code blocks to mermaid containers
      const mermaidNodes = document.querySelectorAll('pre.mermaid');
      mermaidNodes.forEach(node => {{
        const code = node.querySelector('code');
        if (code) {{
          node.textContent = code.textContent;
        }}
      }});
      
      try {{
        await mermaid.run({{
          nodes: document.querySelectorAll('pre.mermaid')
        }});
        console.log("Mermaid diagrams rendered successfully.");
      }} catch (err) {{
        console.error("Error rendering Mermaid:", err);
      }} finally {{
        document.body.classList.add('mermaid-ready');
      }}
    }});
  </script>
</body>
</html>
"""

temp_html = "docs/temp_render.html"
with open(temp_html, "w", encoding="utf-8") as f:
    f.write(full_html)

print("2. HTML generated at", temp_html)

# Step 3: Use Headless Chrome to print to PDF
pdf_output = "docs/mapeamento_funcoes_game.pdf"
print("3. Converting HTML to PDF with Google Chrome (Headless)...")

chrome_cmd = [
    "google-chrome",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=8000",
    f"--print-to-pdf={pdf_output}",
    temp_html
]

subprocess.run(chrome_cmd, check=True)

if os.path.exists(pdf_output):
    size = os.path.getsize(pdf_output)
    print(f"4. Success! PDF created at {pdf_output} ({size} bytes)")
else:
    print("Failed to create PDF.")
