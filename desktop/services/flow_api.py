"""useapi.net Google Flow adapter.

This module is deliberately independent from the Chrome extension.  It is safe
to import without a token and keeps the token in the desktop process only.
"""
from __future__ import annotations

import json
import mimetypes
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://api.useapi.net/v1/google-flow/"
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_VIDEO_BYTES = 100 * 1024 * 1024


class FlowApiError(RuntimeError):
    """A structured useapi failure suitable for fallback decisions."""

    def __init__(self, message: str, status: int | None = None,
                 retry_after: float | None = None, payload: Any = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after
        self.payload = payload

    @property
    def retryable(self) -> bool:
        return self.status in {408, 429, 500, 502, 503, 504, 596}


@dataclass(frozen=True)
class FlowFile:
    data: bytes
    content_type: str
    filename: str = "upload"


def _retry_seconds(headers: dict[str, str], body: Any) -> float:
    value = headers.get("retry-after") or headers.get("Retry-After")
    if value:
        try:
            return max(0.0, float(value))
        except ValueError:
            pass
    retry_at = body.get("retryAfter") if isinstance(body, dict) else None
    if retry_at:
        try:
            from datetime import datetime, timezone
            stamp = datetime.fromisoformat(str(retry_at).replace("Z", "+00:00"))
            return max(0.0, stamp.timestamp() - time.time())
        except (TypeError, ValueError, OverflowError):
            pass
    return 30.0


def _json_response(raw: bytes) -> Any:
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"raw": raw.decode("utf-8", errors="replace")}


class UseApiClient:
    """Small dependency-free client for the Google Flow endpoints we need."""

    def __init__(self, token: str = "", base_url: str = DEFAULT_BASE_URL,
                 timeout: float = 60.0, opener: Callable[..., Any] = urlopen):
        self.token = (token or "").strip()
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout = timeout
        self._open = opener

    def _require_token(self) -> None:
        if not self.token:
            raise FlowApiError("ยังไม่ได้ตั้ง useapi API token")

    def _request(self, method: str, path: str, *, body: Any = None,
                 raw: bytes | None = None, content_type: str | None = None,
                 timeout: float | None = None) -> tuple[Any, dict[str, str], int]:
        self._require_token()
        url = urljoin(self.base_url, path.lstrip("/"))
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        data = raw
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif content_type:
            headers["Content-Type"] = content_type
        request = Request(url, data=data, headers=headers, method=method.upper())
        try:
            with self._open(request, timeout=timeout or self.timeout) as response:
                response_headers = dict(response.headers.items())
                return _json_response(response.read()), response_headers, response.status
        except HTTPError as exc:
            raw_error = exc.read()
            payload = _json_response(raw_error)
            retry_after = _retry_seconds(dict(exc.headers.items()), payload) if exc.code == 429 else None
            detail = payload.get("error") if isinstance(payload, dict) else payload
            if isinstance(detail, dict):
                detail = detail.get("message") or detail.get("status")
            raise FlowApiError(str(detail or f"useapi HTTP {exc.code}"), exc.code,
                               retry_after, payload) from exc
        except URLError as exc:
            raise FlowApiError(f"เชื่อมต่อ useapi ไม่สำเร็จ: {exc.reason}", None) from exc

    @staticmethod
    def build_image_payload(prompt: str, references: Iterable[str] = (),
                            model: str = "nano-banana-2-lite", count: int = 1,
                            email: str = "") -> dict[str, Any]:
        refs = [str(x) for x in references if str(x).strip()]
        if len(refs) > 10:
            raise ValueError("useapi รองรับรูปอ้างอิงภาพนิ่งสูงสุด 10 รูป")
        if not prompt or not prompt.strip():
            raise ValueError("ต้องมี prompt สำหรับสร้างภาพ")
        if not 1 <= int(count) <= 4:
            raise ValueError("count ของภาพต้องอยู่ระหว่าง 1 ถึง 4")
        payload: dict[str, Any] = {
            "prompt": prompt.strip(), "model": model, "aspectRatio": "9:16",
            "count": int(count),
        }
        if email.strip():
            payload["email"] = email.strip()
        for i, ref in enumerate(refs, 1):
            payload[f"reference_{i}"] = ref
        return payload

    @staticmethod
    def build_video_payload(prompt: str, start_image: str, end_image: str,
                            model: str = "veo-3.1-fast", duration: int = 8,
                            email: str = "") -> dict[str, Any]:
        if not prompt or not prompt.strip():
            raise ValueError("ต้องมี prompt สำหรับสร้างวิดีโอ")
        if not start_image or not end_image:
            raise ValueError("ต้องมี startImage และ endImage สำหรับ I2V-FL")
        if int(duration) not in (4, 6, 8, 10):
            raise ValueError("duration ต้องเป็น 4, 6, 8 หรือ 10 วินาที")
        payload: dict[str, Any] = {
            "prompt": prompt.strip(), "model": model, "aspectRatio": "portrait",
            "duration": int(duration), "startImage": start_image,
            "endImage": end_image, "async": True,
        }
        if email.strip():
            payload["email"] = email.strip()
        return payload

    def list_accounts(self) -> Any:
        return self._request("GET", "/accounts")[0]

    def get_account(self, email: str) -> Any:
        return self._request("GET", f"/accounts/{quote(email, safe='')}")[0]

    def upload_asset(self, asset: FlowFile | bytes | str | Path,
                     content_type: str | None = None, email: str = "") -> Any:
        if isinstance(asset, FlowFile):
            file = asset
        elif isinstance(asset, (str, Path)):
            path = Path(asset)
            data = path.read_bytes()
            file = FlowFile(data, content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream", path.name)
        else:
            data = bytes(asset)
            file = FlowFile(data, content_type or "image/jpeg")
        if file.content_type not in {"image/png", "image/jpeg", "image/webp", "video/mp4"}:
            raise ValueError(f"ชนิดไฟล์ไม่รองรับ: {file.content_type}")
        limit = MAX_VIDEO_BYTES if file.content_type == "video/mp4" else MAX_IMAGE_BYTES
        if len(file.data) > limit:
            raise ValueError(f"ไฟล์ใหญ่เกินขนาดสูงสุด {limit} bytes")
        path = "/assets"
        if email.strip():
            path += "/" + quote(email.strip(), safe="")
        return self._request("POST", path, raw=file.data, content_type=file.content_type)[0]

    @staticmethod
    def media_generation_id(upload_response: dict[str, Any]) -> str:
        value = upload_response.get("mediaGenerationId")
        if isinstance(value, dict):
            value = value.get("mediaGenerationId")
        if not value:
            raise FlowApiError("response upload ไม่มี mediaGenerationId", payload=upload_response)
        return str(value)

    def create_image(self, prompt: str, references: Iterable[str] = (),
                     model: str = "nano-banana-2-lite", count: int = 1,
                     email: str = "") -> Any:
        payload = self.build_image_payload(prompt, references, model, count, email)
        return self._request("POST", "/images", body=payload)[0]

    def create_video(self, prompt: str, start_image: str, end_image: str,
                     model: str = "veo-3.1-fast", duration: int = 8,
                     email: str = "") -> Any:
        payload = self.build_video_payload(prompt, start_image, end_image, model, duration, email)
        return self._request("POST", "/videos", body=payload)[0]

    @staticmethod
    def job_id(response: dict[str, Any]) -> str:
        job_id = response.get("jobId") or response.get("jobid")
        if not job_id:
            raise FlowApiError("response สร้างงานไม่มี jobId", payload=response)
        return str(job_id)

    def get_job(self, job_id: str) -> Any:
        return self._request("GET", f"/jobs/{quote(job_id, safe='')}")[0]

    def poll_job(self, job_id: str, *, interval: float = 5.0,
                 timeout: float = 600.0, sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
        started = time.monotonic()
        while time.monotonic() - started <= timeout:
            try:
                job = self.get_job(job_id)
            except FlowApiError as exc:
                if exc.status != 429:
                    raise
                sleep(exc.retry_after or 30.0)
                continue
            status = str(job.get("status") or job.get("state") or "").lower()
            if status in {"completed", "complete", "succeeded", "success"}:
                return job
            if status in {"failed", "error", "cancelled", "canceled"}:
                raise FlowApiError(str(job.get("error") or "useapi job failed"), payload=job)
            sleep(interval)
        raise FlowApiError(f"รอ useapi job นานเกิน {int(timeout)} วินาที", status=408)

    @staticmethod
    def video_url(job: dict[str, Any]) -> str:
        media = job.get("media") or []
        if isinstance(media, dict):
            media = [media]
        for item in media:
            if isinstance(item, dict):
                url = item.get("videoUrl") or item.get("video_url")
                if url:
                    return str(url)
                nested = item.get("video") or {}
                url = nested.get("videoUrl") if isinstance(nested, dict) else None
                if url:
                    return str(url)
        url = job.get("videoUrl") or job.get("video_url")
        if url:
            return str(url)
        raise FlowApiError("job สำเร็จแต่ไม่พบ signed video URL", payload=job)

    def download_mp4(self, signed_url: str, destination: str | Path) -> Path:
        if not signed_url or not signed_url.startswith(("https://", "http://")):
            raise ValueError("signed URL ของวิดีโอไม่ถูกต้อง")
        dest = Path(destination)
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_suffix(dest.suffix + ".part")
        request = Request(signed_url, headers={"Accept": "video/mp4"})
        try:
            with self._open(request, timeout=self.timeout) as response, temp.open("wb") as out:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            temp.replace(dest)
        except Exception:
            temp.unlink(missing_ok=True)
            raise
        return dest


def dry_run_payload(prompt: str, references: Iterable[str], start_image: str,
                    end_image: str, model: str = "veo-3.1-fast",
                    duration: int = 8) -> dict[str, Any]:
    """Build the exact request bodies without requiring a token or network."""
    image = UseApiClient.build_image_payload(prompt, references)
    video = UseApiClient.build_video_payload(prompt, start_image, end_image, model, duration)
    result = {"image": image, "video": video}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result
