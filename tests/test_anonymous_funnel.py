"""Integration checks for the content-blind anonymous beta funnel."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FUNCTION_PATH = ROOT / "deployment" / "zaotu-function" / "main.py"
PUBLIC_ORIGIN = "https://zaotu-beta-d6gya28z138ad2bfe-1459334972.tcloudbaseapp.com"


def load_function():
    spec = importlib.util.spec_from_file_location("zaotu_anonymous_funnel_test", FUNCTION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_anonymous_funnel_accepts_only_allowlisted_progress_metadata():
    module = load_function()
    client = module.app.test_client()
    for event in module.TELEMETRY_EVENTS:
        response = client.post(
            "/api/public/telemetry",
            json={"event": event, "session_id": "Q" * 24, "version": "0.1.0-beta.1"},
            headers={"Origin": PUBLIC_ORIGIN},
        )
        assert response.status_code == 202
        assert response.get_json() == {"success": True, "accepted": event}
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["access-control-allow-origin"] == PUBLIC_ORIGIN
        assert response.headers["x-content-type-options"] == "nosniff"


def test_anonymous_funnel_rejects_profile_and_free_text_payloads():
    module = load_function()
    client = module.app.test_client()
    response = client.post(
        "/api/public/telemetry",
        json={
            "event": "jd_submitted",
            "session_id": "Q" * 24,
            "version": "0.1.0-beta.1",
            "profile": {"email": "not-allowed@example.test"},
        },
    )
    assert response.status_code == 400
    assert "只接受" in response.get_json()["detail"]


def test_public_build_and_privacy_copy_include_versioned_funnel_contract():
    builder = (ROOT / "frontend" / "scripts" / "write-release-manifest.mjs").read_text(encoding="utf-8")
    start_page = (ROOT / "frontend" / "app" / "start" / "page.tsx").read_text(encoding="utf-8")
    assert "zaotu-release.json" in builder
    assert "source_revision" in builder
    assert "trackAnonymousFunnel" in start_page
    assert "trackAnonymousFunnel('landing_view', trackedVersion)" in start_page
    assert "trackAnonymousFunnel('docx_succeeded', releaseInfo.version)" in start_page
    assert "sessionStorage" in start_page
    assert "不发送职业资料、JD、联系方式、简历文本、文件名或反馈内容" in start_page


def test_cloudbase_bootstrap_starts_the_http_app_on_the_runtime_port():
    source = FUNCTION_PATH.read_text(encoding="utf-8")
    bootstrap = (ROOT / "deployment" / "zaotu-function" / "scf_bootstrap").read_text(encoding="utf-8")
    attributes = (ROOT / ".gitattributes").read_text(encoding="utf-8")
    assert source.count('if __name__ == "__main__"') == 1
    assert 'app.run(host="0.0.0.0", port=int(os.getenv("PORT", "9000")))' in source
    assert "exec /var/lang/python39/bin/python3.9 main.py" in bootstrap
    assert "* text=auto eol=lf" in attributes


def test_function_static_fallback_is_limited_to_the_audited_public_bundle():
    source = FUNCTION_PATH.read_text(encoding="utf-8")
    assert 'PUBLIC_STATIC_DIR = Path(__file__).resolve().parent / "public"' in source
    assert "relative.is_absolute() or \"..\" in relative.parts" in source
    assert "send_from_directory(PUBLIC_STATIC_DIR, relative.as_posix())" in source
