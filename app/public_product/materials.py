"""Job-specific public materials built only from confirmed public evidence."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from app.public_product.profile_contract import PublicJobInput, PublicProfile, assess_export_readiness, exportable_evidence


TRACKS = {
    "automation": ("plc", "hmi", "伺服", "运动控制", "ethercat", "modbus", "电气", "自动化"),
    "vision": ("机器视觉", "视觉", "halcon", "visionpro", "相机", "光源", "图像", "检测", "定位"),
    "software": ("python", "c#", ".net", "软件", "sql", "接口", "数据", "git"),
    "embedded": ("stm32", "嵌入式", "单片机", "pcb", "固件", "传感器"),
    "general": (),
}


def compose_public_materials(profile: PublicProfile, job: PublicJobInput) -> dict[str, Any]:
    readiness = assess_export_readiness(profile)
    terms = _terms(f"{job.title}\n{job.description}")
    track = _track(terms)
    evidence = exportable_evidence(profile)
    selected = sorted(evidence, key=lambda item: _evidence_score(item, terms, track), reverse=True)[:8]
    activities = {item.id: item for item in profile.experiences if item.candidate_confirmed}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for item in selected:
        grouped[str((item.get("parent_ref") or {}).get("record_id") or "")].append(item)

    work, projects, portfolio = [], [], []
    for activity_id, items in grouped.items():
        activity = activities.get(activity_id)
        if not activity:
            continue
        entry = {
            "name": activity.organization_or_project or activity.title or "已确认经历",
            "role": activity.title,
            "period": _period(activity.start_date, activity.end_date),
            "bullets": [item["claim"] for item in items],
            "type": activity.experience_type,
        }
        if activity.domain == "skill":
            portfolio.append({"name": activity.organization_or_project or activity.title, "summary": "；".join(entry["bullets"]), "period": entry["period"]})
        else:
            (work if activity.experience_type in {"employment", "internship", "freelance"} else projects).append(entry)

    skills = _skill_groups(profile, terms, track)
    summary = _summary(profile, job.title, selected, track)
    hr_review = _hr_review(profile, job, selected, readiness, work, projects)
    technical_review = _technical_review(job, selected, skills, track)
    review = {
        "status": "approved" if readiness["ready"] and not hr_review["risks"] and selected else "needs_review",
        "hr_review": hr_review,
        "technical_review": technical_review,
        "gap_responses": _gap_responses(job, selected, track),
        "release_gate": "ready_for_visual_review" if readiness["ready"] and selected else "blocked",
        "required_steps": [
            {"step": "本人确认联系方式、时间和职责边界", "status": "required"},
            {"step": "确认 Word/PDF 单页、无截断后再投递", "status": "required"},
        ],
    }
    resume = {
        "identity": {
            "name": profile.identity.preferred_name,
            "phone": profile.identity.phone,
            "email": profile.identity.email,
            "location": profile.identity.city,
            "tagline": _tagline(track),
        },
        "target_title": job.title,
        "summary": summary,
        "skills": skills,
        "experiences": [
            {"company": item["name"], "role": item["role"], "period": item["period"], "bullets": [{"text": bullet, "status": "confirmed"} for bullet in item["bullets"]]}
            for item in work[:2]
        ],
        "projects": [
            {"name": item["name"], "subtitle": item["role"], "period": item["period"], "bullets": [{"text": bullet, "status": "confirmed"} for bullet in item["bullets"]]}
            for item in projects[:2]
        ],
        "portfolio": portfolio[:2], "engineering_highlights": [],
        "education": _education(profile),
        "credentials": [{"name": item.name} for item in profile.credentials if item.candidate_confirmed],
        "document_options": {"max_experiences": 2, "omit_engineering_highlights": True},
        "preflight_review": review,
    }
    return {
        "track": track,
        "resume": resume,
        "ats_text": _ats(resume),
        "basis": selected,
        "review": review,
        "export_readiness": readiness,
    }


def _terms(text: str) -> set[str]:
    lowered = text.casefold()
    return {term for group in TRACKS.values() for term in group if term in lowered} | set(re.findall(r"[a-zA-Z][a-zA-Z0-9+.#/-]{1,}|[\u4e00-\u9fff]{2,8}", lowered))


def _track(terms: set[str]) -> str:
    scores = {name: sum(term in terms for term in vocabulary) for name, vocabulary in TRACKS.items() if vocabulary}
    return max(scores, key=scores.get) if scores and max(scores.values()) else "general"


def _evidence_score(item: dict, terms: set[str], track: str) -> int:
    text = " ".join([item.get("label", ""), item.get("claim", ""), *item.get("signals", [])]).casefold()
    score = sum(4 for signal in item.get("signals", []) if str(signal).casefold() in terms)
    score += sum(1 for term in terms if term and term in text)
    score += sum(3 for signal in TRACKS.get(track, ()) if signal in text)
    return score


def _skill_groups(profile: PublicProfile, terms: set[str], track: str) -> list[dict]:
    skills = [item for item in profile.skills if item.candidate_confirmed]
    skills.sort(key=lambda item: (item.name.casefold() in terms, any(marker in item.name.casefold() for marker in TRACKS.get(track, ()))), reverse=True)
    labels = {"automation": "自动化与控制", "vision": "视觉与成像", "software": "软件与数据", "embedded": "嵌入式与硬件", "general": "核心技能"}
    grouped: dict[str, list[str]] = defaultdict(list)
    for item in skills[:18]:
        skill_text = item.name.casefold()
        category = next((name for name, vocabulary in TRACKS.items() if name != "general" and any(marker in skill_text for marker in vocabulary)), "general")
        grouped[category].append(item.name)
    order = [track, "automation", "vision", "software", "embedded", "general"]
    result = []
    for name in dict.fromkeys(order):
        if grouped.get(name):
            result.append({"label": labels[name], "items": grouped[name][:7], "status": "confirmed"})
    return result[:4]


def _summary(profile: PublicProfile, title: str, selected: list[dict], track: str) -> str:
    proof = "、".join(item.get("label", "相关经历") for item in selected[:2])
    signals = []
    for item in selected:
        for signal in item.get("signals", []):
            if signal not in signals:
                signals.append(signal)
    baseline = {"automation": "自动化控制与设备调试", "vision": "视觉应用与成像验证", "software": "软件实现与问题排查", "embedded": "嵌入式与硬件实践", "general": "岗位相关实践"}[track]
    headline = profile.identity.headline.strip()
    opening = f"{headline}；" if headline else ""
    tool_text = f"，可围绕{'、'.join(signals[:6])}说明实际使用场景" if signals else ""
    return f"{opening}应聘{title}方向，具备{baseline}相关的真实实践基础{tool_text}；代表经历包括{proof}。"


def _education(profile: PublicProfile) -> dict:
    item = next((item for item in profile.education if item.candidate_confirmed), None)
    if not item:
        return {}
    return {"school": item.school, "major": item.major, "degree": item.degree, "period": _period(item.start_date, item.end_date)}


def _period(start: str, end: str) -> str:
    return " - ".join(item for item in (start, end) if item)


def _hr_review(profile: PublicProfile, job: PublicJobInput, selected: list[dict], readiness: dict, work: list[dict], projects: list[dict]) -> dict:
    strengths = []
    if selected: strengths.append(f"已选取 {len(selected)} 条本人确认的岗位相关证据，避免 JD 关键词空转。")
    if work or projects: strengths.append("经历来源已区分工作/实习与课程、实验或个人项目，降低表述误导。")
    risks = [item["message"] for item in readiness["missing"]]
    if not profile.identity.phone and not profile.identity.email: risks.append("正式投递前需补充并核对至少一种联系方式。")
    if not selected: risks.append("当前没有可用于对外材料的已确认事实。")
    return {"strengths": strengths, "risks": risks}


def _technical_review(job: PublicJobInput, selected: list[dict], skills: list[dict], track: str) -> dict:
    signals = {str(signal).casefold() for item in selected for signal in item.get("signals", [])}
    jd_track_signals = set(TRACKS.get(track, ())) & _terms(f"{job.title}\n{job.description}")
    covered = sorted(signal for signal in jd_track_signals if signal in signals)
    risks = [] if covered else ["JD 的核心技术词尚未被已确认项目证据直接覆盖；请补充真实使用场景或按相邻能力准备面试回答。"]
    return {"strengths": [f"已覆盖岗位相关技术信号：{'、'.join(covered)}。"] if covered else [], "risks": risks, "skill_groups": skills}


def _gap_responses(job: PublicJobInput, selected: list[dict], track: str) -> list[dict]:
    direct = {str(signal).casefold() for item in selected for signal in item.get("signals", [])}
    gaps = [term for term in TRACKS.get(track, ()) if term in _terms(job.description) and term not in direct]
    return [{"requirement": item, "assessment": "requires_confirmation", "resume_action": "不把缺项写成已有技能；突出同一项目中最接近的真实工具或问题处理证据。", "interview_response": "如实说明当前接触程度，并准备具体学习路径和可展示的相关成果。"} for item in gaps[:4]]


def _tagline(track: str) -> str:
    return {"automation": "自动化控制 · 设备调试", "vision": "视觉应用 · 成像验证", "software": "软件开发 · 数据与工具", "embedded": "嵌入式 · 硬件实践", "general": "真实经历 · 岗位定制"}[track]


def _ats(resume: dict) -> str:
    lines = [resume["identity"].get("name", ""), resume["target_title"], "", "个人概述", resume["summary"], "", "技能"]
    lines += [f"{item['label']}：{'、'.join(item['items'])}" for item in resume.get("skills", [])]
    for heading, key, first, second in (("工作经历", "experiences", "company", "role"), ("项目经历", "projects", "name", "subtitle")):
        lines += ["", heading]
        for item in resume.get(key, []):
            lines.append(" | ".join(value for value in (item.get(first, ""), item.get(second, ""), item.get("period", "")) if value))
            lines += [f"- {bullet['text']}" for bullet in item.get("bullets", [])]
    if resume.get("portfolio"):
        lines += ["", "工程作品"]
        for item in resume["portfolio"]:
            lines.append(" | ".join(value for value in (item.get("name", ""), item.get("period", "")) if value))
            lines.append(item.get("summary", ""))
    education = resume.get("education") or {}
    lines += ["", "教育背景", " | ".join(value for value in (education.get("school", ""), education.get("major", ""), education.get("degree", ""), education.get("period", "")) if value)]
    return "\n".join(lines).strip() + "\n"
