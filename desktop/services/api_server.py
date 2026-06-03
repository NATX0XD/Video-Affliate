import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable, Optional

class APIServer:
    def __init__(self, port: int = 3001, on_products: Optional[Callable] = None, log_cb: Optional[Callable] = None):
        self.port = port
        self.on_products = on_products
        self.log = log_cb or print
        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self.queue: list = []

    def start(self):
        handler = self._make_handler()
        self._server = HTTPServer(("localhost", self.port), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        self.log(f"[API] Server เริ่มแล้ว → http://localhost:{self.port}")

    def stop(self):
        if self._server:
            self._server.shutdown()

    def _make_handler(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass  # ปิด default log

            def do_GET(self):
                if self.path == "/api/status":
                    self._json({"status": "ok", "queue": len(server.queue)})
                else:
                    self._json({"error": "not found"}, 404)

            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                try:
                    data = json.loads(body)
                except Exception:
                    self._json({"error": "invalid json"}, 400)
                    return

                if self.path == "/api/generate":
                    products = data.get("products", [data.get("product")] if "product" in data else [])
                    products = [p for p in products if p]
                    server.queue.extend(products)
                    server.log(f"[API] รับสินค้า {len(products)} รายการ (queue: {len(server.queue)})")
                    if server.on_products:
                        threading.Thread(target=server.on_products, args=(products,), daemon=True).start()
                    self._json({"ok": True, "received": len(products), "queue": len(server.queue)})
                else:
                    self._json({"error": "not found"}, 404)

            def do_OPTIONS(self):
                self.send_response(200)
                self._cors()
                self.end_headers()

            def _json(self, data: dict, code: int = 200):
                body = json.dumps(data, ensure_ascii=False).encode()
                self.send_response(code)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _cors(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")

        return Handler
