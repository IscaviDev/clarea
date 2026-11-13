"""Fake Gemini for local tests: answers each Clarea job with a small valid JSON after a delay.
The first request answers 503 once, to test the automatic retry."""
import json, re, sys, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

STATE = {"n": 0}

def answer(prompt):
    if '"files"' in prompt and "=== " in prompt:
        files = {}
        for path, a, b in re.findall(r"=== (.+?) \(líneas (\d+)-(\d+) de \d+\) ===", prompt):
            files[path] = {"role": "Archivo de prueba", "what": "Explicación de prueba de " + path.split("/")[-1] + ".",
                           "blocks": [{"from": int(a), "to": int(b), "imp": 2, "easy": "Bloque de prueba.", "tech": "Explicación técnica de prueba."}]}
        return {"files": files}
    if '"glossary"' in prompt:
        return {"glossary": [{"term": t, "cat": "Prueba", "easy": "Concepto de prueba.", "tech": "Detalle de prueba.", "code": "", "file": "", "line": 0} for t in ["fetch()", "require_once", "$_POST"]]}
    if '"questions"' in prompt:
        mc = [{"type": "mc", "q": "Pregunta de prueba %d" % i, "options": ["a", "b", "c", "d"], "answer": i % 4, "why": "Porque sí.", "wrong": ["", "", "", ""]} for i in range(8)]
        return {"questions": mc + [{"type": "written", "q": "Escrita de prueba", "model": "Respuesta modelo de prueba.", "keyTerms": ["prueba"], "wrong": []}]}
    return {"summary": "Resumen de prueba.", "branches": {}, "prs": {}}

class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def log_message(self, *a): pass
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        STATE["n"] += 1
        if STATE["n"] == 1:
            b = json.dumps({"error": {"code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE"}}).encode()
            self.send_response(503); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b); return
        time.sleep(4)
        prompt = json.loads(raw)["contents"][0]["parts"][0]["text"]
        b = json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(answer(prompt), ensure_ascii=False)}]}, "finishReason": "STOP"}]}).encode()
        self.send_response(200); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 9198), H).serve_forever()
