"""useapi adapter tests: dry-run validation and a complete local mock flow."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from services.flow_api import UseApiClient, dry_run_payload


class _MockFlow(BaseHTTPRequestHandler):
    calls = []
    job_reads = 0

    def log_message(self, *_args):
        pass

    def _send(self, status, body, content_type="application/json", headers=None):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        for key, value in (headers or {}).items():
            self.send_header(key, str(value))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self.__class__.calls.append(("GET", self.path))
        if self.path == "/v1/google-flow/accounts":
            return self._send(200, {"seller@example.com": {"health": "OK"}})
        if self.path.startswith("/v1/google-flow/accounts/"):
            return self._send(200, {"health": "OK", "credits": {"credits": 120}})
        if self.path.startswith("/v1/google-flow/jobs/"):
            self.__class__.job_reads += 1
            if self.__class__.job_reads == 1:
                return self._send(429, {"error": "throttled", "retryAfter": "2030-01-01T00:00:00Z"},
                                  headers={"Retry-After": "0"})
            if self.__class__.job_reads == 2:
                return self._send(200, {"jobId": "job-1", "status": "running"})
            return self._send(200, {"jobId": "job-1", "status": "completed",
                                    "media": [{"videoUrl": f"http://127.0.0.1:{self.server.server_port}/signed.mp4"}]})
        if self.path == "/signed.mp4":
            return self._send(200, b"fake-mp4", "video/mp4")
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        self.__class__.calls.append(("POST", self.path, self.headers.get("Content-Type"), raw))
        if self.path == "/v1/google-flow/assets":
            return self._send(200, {"mediaGenerationId": {"mediaGenerationId": "asset-1"}})
        if self.path == "/v1/google-flow/images":
            return self._send(200, {"jobId": "image-1", "media": []})
        if self.path == "/v1/google-flow/videos":
            return self._send(201, {"jobId": "job-1"})
        return self._send(404, {"error": "not found"})


def _server():
    _MockFlow.calls = []
    _MockFlow.job_reads = 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), _MockFlow)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def test_dry_run_without_token(capsys):
    payloads = dry_run_payload("make a product clip", ["face-ref", "product-ref"], "start", "end")
    assert payloads["image"]["aspectRatio"] == "9:16"
    assert payloads["image"]["reference_2"] == "product-ref"
    assert payloads["video"]["aspectRatio"] == "portrait"
    assert payloads["video"]["startImage"] == "start"
    assert payloads["video"]["async"] is True
    assert '"aspectRatio": "portrait"' in capsys.readouterr().out


def test_complete_mock_flow_calls_in_order(tmp_path):
    server, thread = _server()
    try:
        base = f"http://127.0.0.1:{server.server_port}/v1/google-flow"
        client = UseApiClient("test-token", base_url=base, timeout=5)
        assert "seller@example.com" in client.list_accounts()
        assert client.get_account("seller@example.com")["credits"]["credits"] == 120
        uploaded = client.upload_asset(b"image-bytes", "image/jpeg", "seller@example.com")
        asset_id = client.media_generation_id(uploaded)
        assert asset_id == "asset-1"
        created = client.create_video("move product", asset_id, asset_id)
        sleeps = []
        job = client.poll_job("job-1", interval=0, timeout=5, sleep=sleeps.append)
        output = tmp_path / "clip.mp4"
        client.download_mp4(client.video_url(job), output)
        assert output.read_bytes() == b"fake-mp4"
        assert sleeps and sleeps[0] == 0
        paths = [(c[0], c[1]) for c in _MockFlow.calls]
        assert paths[:5] == [
            ("GET", "/v1/google-flow/accounts"),
            ("GET", "/v1/google-flow/accounts/seller%40example.com"),
            ("POST", "/v1/google-flow/assets/seller%40example.com"),
            ("POST", "/v1/google-flow/videos"),
            ("GET", "/v1/google-flow/jobs/job-1"),
        ]
        assert created["jobId"] == "job-1"
    finally:
        server.shutdown()
        thread.join(timeout=2)
