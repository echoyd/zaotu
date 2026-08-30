"""Anonymous ZAOTU beta HTTP function.

This intentionally exposes only browser-local guest material generation.  It
contains no account, persistence, worker, or private-workspace code.
"""

from __future__ import annotations

from urllib.parse import quote

from flask import Flask, Response, jsonify, request
from pydantic import ValidationError

from app.public_product.demo_profiles import public_demo_profiles
from app.public_product.documents import render_public_resume_docx, render_public_resume_from_template_docx
from app.public_product.materials import compose_public_materials
from app.public_product.profile_contract import PublicProfileAnalysisRequest, analyze_public_profile


app = Flask(__name__)


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "OPTIONS"])
@app.route("/<path:path>", methods=["GET", "POST", "OPTIONS"])
def public_api(path: str):
    if request.method == "OPTIONS":
        return ("", 204)
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
    app.run(host="0.0.0.0", port=9000)
