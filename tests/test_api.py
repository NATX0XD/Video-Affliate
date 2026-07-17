"""API (FastAPI TestClient) — setup/settings/ai proxy/flow config/products/queue/adapter."""
import os


# ── /api/setup roundtrip ─────────────────────────────────────────────────────

def test_setup_roundtrip(web):
    client, ws, db = web
    r = client.post("/api/setup", json={
        "shop_name": "MyShop",
        "flow_email": "seller@example.com",
        "platforms": ["shopee"],
        "review_mode": "hold",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["shop_name"] == "MyShop"
    assert body["setup_done"] is True

    g = client.get("/api/setup").json()
    assert g["configured"] is True
    assert g["shop_name"] == "MyShop"
    assert g["flow_email"] == "seller@example.com"
    assert g["platforms"] == ["shopee"]
    assert g["review_mode"] == "hold"
    # persisted ในทั้ง DB และ settings.json
    assert db.get_config("setup_done") == "1"
    assert db.get_config("shop_name") == "MyShop"


def test_setup_requires_shop_name(web):
    client, ws, db = web
    r = client.post("/api/setup", json={"flow_email": "x@y.com"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert "ชื่อร้าน" in body["error"]
    # ไม่ mark setup_done เมื่อไม่มีชื่อร้าน
    assert db.get_config("setup_done") is None


# ── /api/settings drop foreign key ───────────────────────────────────────────

def test_settings_drops_foreign_key(web):
    client, ws, db = web
    client.post("/api/settings", json={
        "shop_name": "Shoppy",
        "duration": 12,
        "__evil__": "inject",
    })
    got = client.get("/api/settings").json()
    assert got["shop_name"] == "Shoppy"
    assert got["duration"] == 12
    assert "__evil__" not in got


# ── /api/ai/gemini proxy ─────────────────────────────────────────────────────

def test_gemini_requires_token(web):
    client, ws, db = web
    r = client.post("/api/ai/gemini", json={"prompt": "hi"})
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "unauthorized"


def test_gemini_token_but_no_key(web, monkeypatch):
    """token ถูกต้อง แต่ยังไม่ตั้ง google_api_key → 400 (พิสูจน์ว่าผ่านด่าน token)."""
    client, ws, db = web
    r = client.post("/api/ai/gemini",
                    headers={"X-VGAP-Token": ws.api_token},
                    json={"prompt": "hi"})
    assert r.status_code == 400
    assert "Google API key" in r.json()["error"]["message"]


def test_gemini_rejects_bad_model(web, monkeypatch):
    """token + key พร้อม แต่ชื่อโมเดลแปลก → 400 (ก่อนยิงเน็ต)."""
    client, ws, db = web
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
    r = client.post("/api/ai/gemini",
                    headers={"X-VGAP-Token": ws.api_token},
                    json={"prompt": "hi", "model": "bad model!!"})
    assert r.status_code == 400
    assert "โมเดล" in r.json()["error"]["message"]


# ── /api/flow/config — ไม่ส่ง key ดิบ ────────────────────────────────────────

def test_flow_config_no_raw_key(web, monkeypatch):
    client, ws, db = web
    monkeypatch.setenv("GOOGLE_API_KEY", "secret-key-xyz")
    body = client.get("/api/flow/config").json()
    assert body["ok"] is True
    assert body["token"] == ws.api_token
    assert body["google_api_key_set"] is True
    assert "google_api_key" not in body          # ห้ามส่งค่าดิบ
    assert "secret-key-xyz" not in str(body)


def test_flow_config_key_unset_flag_false(web):
    client, ws, db = web
    body = client.get("/api/flow/config").json()
    assert body["google_api_key_set"] is False


# ── /api/products push + list ────────────────────────────────────────────────

def test_products_push_and_list(web):
    client, ws, db = web
    r = client.post("/api/products", json={"products": [
        {"name": "P1", "cart_link": "c1"},
        {"name": "P2", "cart_link": "c2"},
    ]})
    body = r.json()
    assert body["ok"] is True
    assert body["count"] == 2
    assert len(body["ids"]) == 2

    listed = client.get("/api/products").json()["products"]
    names = {p["name"] for p in listed}
    assert {"P1", "P2"} <= names


def test_products_dedup_by_cart_link(web):
    client, ws, db = web
    first = client.post("/api/products", json={"name": "Solo", "cart_link": "dup"}).json()
    again = client.post("/api/products", json={"name": "SoloDupe", "cart_link": "dup"}).json()
    assert first["ids"] == again["ids"]          # cart_link ซ้ำ → id เดิม
    listed = client.get("/api/products").json()["products"]
    assert sum(1 for p in listed if p["cart_link"] == "dup") == 1


# ── /api/queue push / next / claim ───────────────────────────────────────────

def test_queue_push_next_claim(web):
    client, ws, db = web
    client.post("/api/queue/push", json={"payload": {"x": 1}, "priority": 5})
    client.post("/api/queue/push", json={"payload": {"y": 2}, "priority": 0})

    # peek: priority สูงก่อน
    nxt = client.get("/api/queue/next").json()
    assert nxt["ok"] is True
    assert nxt["item"]["payload"] == {"x": 1}
    assert nxt["item"]["priority"] == 5

    # claim: คว้าตัว priority สูง แล้ว flip เป็น claimed
    claimed = client.post("/api/queue/claim", json={"worker": "w1"}).json()
    assert claimed["item"]["payload"] == {"x": 1}
    assert claimed["item"]["status"] == "claimed"
    assert claimed["item"]["claimed_by"] == "w1"

    # peek ถัดไป: เหลือ priority ต่ำ
    nxt2 = client.get("/api/queue/next").json()
    assert nxt2["item"]["payload"] == {"y": 2}


# ── /api/flow/adapter GET + update error ─────────────────────────────────────

def test_flow_adapter_get_default(web):
    client, ws, db = web
    body = client.get("/api/flow/adapter").json()
    assert body["ok"] is True
    assert body["version"] == "bundled-1"        # bundled default เมื่อยังไม่มี cache
    assert body["adapter"]["source"] == "bundled"


def test_flow_adapter_update_without_url_keeps_version(web):
    client, ws, db = web
    r = client.post("/api/flow/adapter/update", json={})
    assert r.status_code == 400
    body = r.json()
    assert body["ok"] is False
    assert body["version"] == "bundled-1"        # คงเวอร์ชันเดิม ไม่ทับ
    # ยืนยันว่า GET ยังคืน bundled เดิม (ไม่ถูกเปลี่ยน)
    assert client.get("/api/flow/adapter").json()["version"] == "bundled-1"
