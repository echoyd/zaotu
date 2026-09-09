"""Anonymous ZAOTU beta HTTP function.

This intentionally exposes only browser-local guest material generation.  It
contains no account, persistence, worker, or private-workspace code.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Response, jsonify, request, send_from_directory
from pydantic import ValidationError

from app.public_product.demo_profiles import public_demo_profiles
from app.public_product.documents import render_public_resume_docx, render_public_resume_from_template_docx
from app.public_product.materials import compose_public_materials
from app.public_product.profile_contract import PublicProfileAnalysisRequest, analyze_public_profile


app = Flask(__name__)
PUBLIC_STATIC_DIR = Path(__file__).resolve().parent / "public"


# Funnel telemetry is deliberately limited to progress events.  Do not add
# profile, job, document, contact, feedback or free-text fields here: the
# anonymous beta must remain content-blind.
TELEMETRY_EVENTS = frozenset({
    "landing_view",
    "beta_started",
    "first_asset_confirmed",
    "jd_submitted",
    "materials_generated",
    "docx_succeeded",
    "feedback_packet_exported",
})
PUBLIC_ORIGINS = frozenset({
    "https://zaotu-beta-d6gya28z138ad2bfe-1459334972.ap-shanghai.app.tcloudbase.com",
    "https://zaotu-beta-d6gya28z138ad2bfe-1459334972.tcloudbaseapp.com",
    *(origin.strip() for origin in os.getenv("ZAOTU_PUBLIC_ORIGINS", "").split(",") if origin.strip()),
})
CLOUDBASE_ROOT_ORIGIN = "https://zaotu-beta-d6gya28z138ad2bfe-1459334972.ap-shanghai.app.tcloudbase.com"
CLOUDBASE_STATIC_ORIGIN = "https://zaotu-beta-d6gya28z138ad2bfe-1459334972.tcloudbaseapp.com"
CLOUDBASE_MANAGED_ORIGINS = frozenset({CLOUDBASE_ROOT_ORIGIN, CLOUDBASE_STATIC_ORIGIN})
TELEMETRY_SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def serve_public_static(path: str):
    """Serve only files explicitly included in the public static package.

    The deployment builder copies the independently audited beta bundle into
    ``public``.  This allows CloudBase's function access service to provide a
    normal HTML response when the static-hosting default domain forces an
    attachment response.  A missing file deliberately falls through to the
    API router; traversal paths are never served.
    """
    if not PUBLIC_STATIC_DIR.is_dir():
        return None
    relative = Path(path or "index.html")
    if relative.is_absolute() or ".." in relative.parts:
        return None
    target = PUBLIC_STATIC_DIR / relative
    if not target.is_file():
        return None
    return send_from_directory(PUBLIC_STATIC_DIR, relative.as_posix())


@app.after_request
def public_response_headers(response: Response) -> Response:
    """Keep visitor responses private and allow only the public beta origin."""
    # Flask's static-file helper otherwise supplies ``no-cache``.  The beta
    # contract is stricter: every visitor response, including the release
    # manifest, must be non-persistent.
    response.headers["Cache-Control"] = "no-store"
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    # CloudBase may otherwise mark ordinary function responses as downloads.
    # Keep web/API responses inline while preserving DOCX attachment headers.
    if response.mimetype != "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        response.headers["Content-Disposition"] = "inline"
    origin = request.headers.get("Origin")
    if origin in PUBLIC_ORIGINS:
        # CloudBase writes CORS for both default domains. Adding it again in
        # Flask produces duplicate values that browsers reject.
        if origin not in CLOUDBASE_MANAGED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Vary"] = "Origin"
    return response


def parse_telemetry_payload() -> tuple[dict[str, str] | None, str | None]:
    """Accept only an allowlisted, content-free anonymous funnel event."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, "请求体必须是 JSON 对象"
    if set(payload) != {"event", "session_id", "version"}:
        return None, "匿名统计只接受 event、session_id 与 version"
    event = payload.get("event")
    session_id = payload.get("session_id")
    version = payload.get("version")
    if event not in TELEMETRY_EVENTS:
        return None, "不支持的匿名统计事件"
    if not isinstance(session_id, str) or not TELEMETRY_SESSION_PATTERN.fullmatch(session_id):
        return None, "匿名统计编号格式无效"
    if not isinstance(version, str) or not 1 <= len(version) <= 48:
        return None, "版本号格式无效"
    return {"event": event, "session_id": session_id, "version": version}, None


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "OPTIONS"])
@app.route("/<path:path>", methods=["GET", "POST", "OPTIONS"])
def public_api(path: str):
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        static_response = serve_public_static(path)
        if static_response is not None:
            return static_response
    endpoint = "/" + path
    if endpoint.endswith("/healthz"):
        return jsonify({"status": "ok", "service": "zaotu-anonymous-beta"})
    if endpoint.endswith("/public/demo-profiles") and request.method == "GET":
        return jsonify({
            "success": True,
            "profiles": [profile.model_dump() for profile in public_demo_profiles()],
            "notice": "这些是虚构演示资料，只用于体验不同 JD 的材料排序，不可复制为个人经历。",
        })
    if request.method != "POST":
        return jsonify({"detail": "Not Found"}), 404
    if endpoint.endswith("/public/telemetry"):
        telemetry, error = parse_telemetry_payload()
        if error:
            return jsonify({"detail": error}), 400
        # CloudBase function logs can be aggregated by event/version.  The
        # request body contains no career content or contact information.
        app.logger.info("zaotu_funnel event=%s session=%s version=%s", telemetry["event"], telemetry["session_id"], telemetry["version"])
        return jsonify({"success": True, "accepted": telemetry["event"]}), 202
    if endpoint.endswith("/public/guest/profile/materials/docx/template"):
        template = request.files.get("template")
        raw_payload = request.form.get("payload", "")
        if not template or not template.filename:
            return jsonify({"detail": "请提供 DOCX 模板文件"}), 422
        if not template.filename.lower().endswith(".docx"):
            return jsonify({"detail": "目前仅支持 DOCX 占位符模板，不支持 PDF 或旧版 DOC"}), 422
        try:
            payload = PublicProfileAnalysisRequest.model_validate_json(raw_payload)
        except ValidationError as error:
            return jsonify({"detail": error.errors()}), 422
        materials = compose_public_materials(payload.profile, payload.job)
        if not materials["export_readiness"]["ready"]:
            return jsonify({"detail": "请先补全本人确认的教育、技能和一段可用于简历的真实经历。"}), 409
        try:
            document = render_public_resume_from_template_docx(materials, template.read())
        except ValueError as error:
            return jsonify({"detail": str(error)}), 422
        return Response(
            document,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote('造途_自定义模板岗位简历.docx')}"},
        )
    if endpoint.endswith("/public/guest/profile/materials/docx/photo"):
        photo = request.files.get("photo")
        raw_payload = request.form.get("payload", "")
        if not photo or not photo.filename:
            return jsonify({"detail": "请提供本人证件照"}), 422
        if photo.mimetype not in {"image/jpeg", "image/png"}:
            return jsonify({"detail": "证件照仅支持 JPG 或 PNG"}), 415
        try:
            payload = PublicProfileAnalysisRequest.model_validate_json(raw_payload)
        except ValidationError as error:
            return jsonify({"detail": error.errors()}), 422
        materials = compose_public_materials(payload.profile, payload.job)
        if not materials["export_readiness"]["ready"]:
            return jsonify({"detail": "请先补全本人确认的教育、技能和一段可用于简历的真实经历。"}), 409
        try:
            document = render_public_resume_docx(materials, photo_bytes=photo.read(2 * 1024 * 1024 + 1))
        except ValueError as error:
            return jsonify({"detail": str(error)}), 422
        return Response(
            document,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote('造途_岗位专属简历_含证件照.docx')}"},
        )
    try:
        payload = PublicProfileAnalysisRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        return jsonify({"detail": error.errors()}), 422
    if endpoint.endswith("/public/guest/profile/analyze"):
        return jsonify({"success": True, **analyze_public_profile(payload)})
    if endpoint.endswith("/public/guest/profile/materials"):
        return jsonify({"success": True, **compose_public_materials(payload.profile, payload.job)})
    if endpoint.endswith("/public/guest/profile/materials/docx"):
        materials = compose_public_materials(payload.profile, payload.job)
        if not materials["export_readiness"]["ready"]:
            return jsonify({"detail": "请先补全本人确认的教育、技能和一段可用于简历的真实经历。"}), 409
        return Response(
            render_public_resume_docx(materials),
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote('造途_岗位专属简历.docx')}"},
        )
    return jsonify({"detail": "Not Found"}), 404


if __name__ == "__main__":
    # CloudBase starts scf_bootstrap for this HTTP function.  The Flask app
    # must actively listen on the injected runtime port; importing this module
    # in tests must remain side-effect free.
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "9000")))
