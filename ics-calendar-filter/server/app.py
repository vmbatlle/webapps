"""
Local dev server for the ICS Calendar Filter app.

Serves the static frontend (index.html, css/, js/) and exposes a small API that
proxies the Universidad de Zaragoza "Consulta Pública de Horarios" portal, so
the app can fetch a course's ICS directly instead of the user downloading it
manually from an external site.

Run with:  python3 server/app.py
Then open: http://localhost:8000
"""
import json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import sia_client
from sia_client import SiaError

ROOT_DIR = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[server] {self.address_string()} - {fmt % args}")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/config":
            self._send_json(200, {"centros": sia_client.CENTROS, "anios": sia_client.ANIOS})
            return
        if parsed.path == "/api/opciones":
            qs = parse_qs(parsed.query)
            try:
                data = sia_client.fetch_options(
                    anio=qs.get("anio", [""])[0],
                    centro=qs.get("centro", [""])[0],
                    plan=qs.get("plan", [None])[0],
                    curso=qs.get("curso", [None])[0],
                    trimestre=qs.get("trimestre", [None])[0],
                )
                self._send_json(200, data)
            except SiaError as exc:
                self._send_json(502, {"error": str(exc)})
            except Exception as exc:  # network/timeouts/etc.
                self._send_json(502, {"error": f"Error consultando el portal: {exc}"})
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/horario":
            length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                self._send_json(400, {"error": "JSON inválido"})
                return
            try:
                ics_text = sia_client.fetch_ics(
                    anio=str(body.get("anio", "")),
                    centro=str(body.get("centro", "")),
                    plan=str(body.get("plan", "")),
                    curso=str(body.get("curso", "")),
                    trimestre=str(body.get("trimestre", "")),
                    grupos=[str(g) for g in body.get("grupos", [])],
                    asignaturas=[str(a) for a in body.get("asignaturas", [])],
                )
            except SiaError as exc:
                self._send_json(502, {"error": str(exc)})
                return
            except Exception as exc:
                self._send_json(502, {"error": f"Error consultando el portal: {exc}"})
                return

            data = ics_text.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/calendar; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        self.send_error(404)


def main():
    port = 8000
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving {ROOT_DIR} on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
