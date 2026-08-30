"""Explainable China-oriented job triage for the local Jobwise workspace.

The output is deliberately a decision aid, not a claim that a recruiter will
accept an application.  It separates supported evidence from gaps and items
the candidate still needs to verify.
"""

from __future__ import annotations

import re
from typing import Any, Iterable


CAPABILITY_CATALOG: dict[str, tuple[str, ...]] = {
    "机器视觉与设备测试": (
        "机器视觉", "视觉", "工业相机", "相机", "光源", "定位", "测量", "检测", "缺陷", "标定",
        "功能测试", "整机测试", "精度测试", "稳定性测试",
    ),
    "自动化与运动控制": (
        "自动化", "plc", "ethercat", "modbus", "伺服", "运动控制", "运动平台", "传感器", "控制程序",
    ),
    "电气系统与调试": (
        "电气", "接线", "布线", "控制柜", "电路", "硬件", "参数调试", "设备调试", "维护",
    ),
    "现场交付与问题闭环": (
        "现场", "安装", "调试", "验收", "交付", "出厂", "复测", "问题整改", "异常", "故障", "驻场",
    ),
    "AI 检测与软件开发": (
        "深度学习", "pytorch", "cnn", "resnet", "cbam", "python", "cuda", "算法", "软件开发",
    ),
    "工业软件与通信": (
        "c#", ".net", "winforms", "wpf", "modbus tcp", "modbus rtu", "命名管道", "共享内存", "jsonl", "上位机",
    ),
    "嵌入式与硬件开发": (
        "嵌入式", "stm32", "单片机", "keil", "pcb", "altium", "蓝牙", "传感器驱动", "固件",
    ),
    "电力系统仿真与分析": (
        "电力系统", "电网", "psasp", "powerworld", "潮流", "暂态稳定", "供配电", "继电保护",
    ),
}

_RISK_SIGNALS = {
    "派遣/外包/劳务性质": ("劳务派遣", "派遣", "外包", "人力外包", "第三方用工"),
    "长期驻场或频繁出差": ("长期出差", "频繁出差", "长期驻场", "驻场服务"),
    "倒班或夜班": ("倒班", "夜班", "两班倒", "三班倒"),
    "休息与加班安排": ("大小周", "单休", "经常加班", "接受加班"),
}


def evaluate_job(
    *,
    title: str,
    description: str,
    evidence: Iterable[dict[str, Any]],
    preferences: dict[str, Any] | None = None,
    target_titles: Iterable[str] = (),
    skills: Iterable[str] = (),
    location: str = "",
    salary: str = "",
) -> dict[str, Any]:
    """Return one stable, human-readable decision card for a saved JD."""
    title = title.strip()
    description = description.strip()
    corpus = f"{title}\n{description}".casefold()
    evidence_records = [item for item in evidence if isinstance(item, dict)]
    preference_data = preferences if isinstance(preferences, dict) else {}

    jd_clusters = _matched_clusters(corpus)
    supported, unsupported = _evidence_for_clusters(evidence_records, jd_clusters, corpus, skills)
    role_score = _role_direction_score(title, target_titles)
    evidence_score = min(45, sum(15 if item.get("support_level") == "evidence" else 7 for item in supported))
    preference_score, logistics_checks = _logistics_score(corpus, location, salary, preference_data)
    requirements = _hard_requirement_checks(corpus, evidence_records)
    risk_signals = _risk_signals(corpus)
    quality = _information_quality(title, description, location, salary)
    quality_score = quality["score"]
    hard_fail = any(item["verdict"] == "fail" for item in requirements)
    score = max(0, min(100, role_score + evidence_score + preference_score + quality_score))
    gaps = _build_gaps(jd_clusters, supported, unsupported, requirements)
    checks = logistics_checks + [item["message"] for item in requirements if item["verdict"] != "pass"]
    checks += [f"发现“{item['label']}”信号：{item['message']}" for item in risk_signals]
    if not checks:
        checks.append("请核实具体职责占比、直属团队、薪资结构和入职流程。")

    recommendation = _recommendation(score, hard_fail, risk_signals, requirements)
    evidence_claims = [item["claim"] for item in supported[:3]]
    return {
        "version": 2,
        "score_label": "方向匹配",
        "direction_score": score,
        "recommendation": recommendation,
        "summary": _summary(score, supported, gaps, quality),
        "matched_skills": [item["label"] for item in supported],
        "missing_skills": gaps,
        "evidence": evidence_claims,
        "evidence_items": [_public_evidence(item) for item in supported[:3]],
        "checks": _deduplicate(checks),
        "gaps": gaps,
        "risk_signals": risk_signals,
        "requirements": requirements,
        "dimensions": {
            "role_direction": {"score": role_score, "max_score": 25, "note": _role_note(role_score, target_titles)},
            "evidence": {"score": evidence_score, "max_score": 45, "matched_clusters": jd_clusters},
            "logistics": {"score": preference_score, "max_score": 15},
            "jd_information": quality,
        },
        "resume_focus": _resume_focus(supported, gaps),
    }


def _matched_clusters(corpus: str) -> list[str]:
    return [label for label, signals in CAPABILITY_CATALOG.items() if any(signal in corpus for signal in signals)]


def _evidence_for_clusters(
    evidence: list[dict[str, Any]], clusters: list[str], corpus: str, skills: Iterable[str]
) -> tuple[list[dict[str, Any]], list[str]]:
    supported: list[dict[str, Any]] = []
    unsupported = list(clusters)
    for cluster in clusters:
        cluster_signals = CAPABILITY_CATALOG[cluster]
        candidates = [
            item for item in evidence
            if item.get("status") == "confirmed"
            and _application_usable(item)
            and _evidence_matches(item, cluster, cluster_signals, corpus)
        ]
        if candidates:
            best = max(candidates, key=lambda item: _evidence_priority(item, cluster, cluster_signals, corpus))
            supported.append({**best, "label": cluster, "support_level": "evidence"})
            unsupported.remove(cluster)
            continue
        declared = [str(skill).strip() for skill in skills if _skill_matches_cluster(str(skill), cluster, cluster_signals, corpus)]
        if declared:
            supported.append({
                "id": f"declared-skill-{cluster}",
                "kind": "skill",
                "label": cluster,
                "claim": f"画像中已确认技能：{'、'.join(declared[:3])}。",
                "signals": declared,
                "metrics": [],
                "source": {"type": "user", "label": "个人画像技能", "reference": ""},
                "status": "confirmed",
                "verified": True,
                "schema_version": 1,
                "support_level": "declared_skill",
            })
            unsupported.remove(cluster)
    return supported, unsupported


def _evidence_matches(record: dict[str, Any], cluster: str, signals: tuple[str, ...], corpus: str) -> bool:
    text = " ".join([
        str(record.get("label", "")), str(record.get("claim", "")),
        *[str(item) for item in record.get("signals", [])],
    ]).casefold()
    if cluster.casefold() in text:
        return True
    matched_signals = sum(1 for signal in signals if signal in text and signal in corpus)
    return matched_signals >= 1


def _evidence_priority(record: dict[str, Any], cluster: str, signals: tuple[str, ...], corpus: str) -> tuple[int, int, int]:
    text = " ".join([
        str(record.get("label", "")), str(record.get("claim", "")),
        *[str(item) for item in record.get("signals", [])],
    ]).casefold()
    exact_cluster = int(str(record.get("label", "")).casefold() == cluster.casefold())
    matched_signals = sum(1 for signal in signals if signal in text and signal in corpus)
    metric_count = len(record.get("metrics", []))
    return exact_cluster, matched_signals, metric_count


def _skill_matches_cluster(skill: str, cluster: str, signals: tuple[str, ...], corpus: str) -> bool:
    normalized = skill.casefold().strip()
    if not normalized:
        return False
    if cluster.casefold() in normalized:
        return True
    return any(signal in normalized and signal in corpus for signal in signals)


def _application_usable(record: dict[str, Any]) -> bool:
    """Keep interview-only or internal evidence out of application materials."""
    usage = record.get("usage")
    if not isinstance(usage, list) or not usage:
        return True
    return bool({"resume", "ats", "communication"} & {str(item) for item in usage})


def _role_direction_score(title: str, target_titles: Iterable[str]) -> int:
    normalized_title = _normalize(title)
    targets = [str(item).strip() for item in target_titles if str(item).strip()]
    if not targets:
        return 10
    similarities = [_text_similarity(normalized_title, _normalize(target)) for target in targets]
    best = max(similarities, default=0.0)
    if best >= 0.82:
        return 25
    if best >= 0.56:
        return 18
    if best >= 0.32:
        return 10
    return 0


def _logistics_score(corpus: str, location: str, salary: str, preferences: dict[str, Any]) -> tuple[int, list[str]]:
    score = 15
    checks: list[str] = []
    locations = preferences.get("locations", [])
    if isinstance(locations, str):
        locations = [part.strip() for part in re.split(r"[,，、;；]", locations) if part.strip()]
    if not isinstance(locations, list):
        locations = []
    location = location.strip()
    if locations:
        if not location:
            score -= 4
            checks.append(f"你的优先地点是“{'、'.join(map(str, locations))}”，JD 未写明地点，请先核实。")
        elif not any(_location_matches(location, str(item)) for item in locations):
            score -= 8
            checks.append(f"岗位地点“{location}”不在你的优先地点内，请确认是否接受。")
    travel = str(preferences.get("travel_preference", "unspecified"))
    travel_terms = ("长期出差", "频繁出差", "长期驻场", "驻场")
    if any(term in corpus for term in travel_terms):
        if travel == "not_preferred":
            score -= 10
            checks.append("你的偏好是尽量不长期出差/驻场，该岗位存在明显冲突。")
        elif travel in {"limited", "unspecified"}:
            score -= 4
            checks.append("岗位涉及出差或驻场，请确认频率、周期、补贴和休息安排。")
    expected_salary = str(preferences.get("salary_expectation", "")).strip()
    if expected_salary and not salary:
        score -= 3
        checks.append(f"你的薪资预期为“{expected_salary}”，该岗位尚未录入薪资。")
    return max(0, score), checks


def _hard_requirement_checks(corpus: str, evidence: list[dict[str, Any]]) -> list[dict[str, str]]:
    checks: list[dict[str, str]] = []
    confirmed_corpus = " ".join(
        " ".join([
            str(item.get("label", "")),
            str(item.get("claim", "")),
            *[str(signal) for signal in item.get("signals", [])],
        ])
        for item in evidence
        if item.get("status") == "confirmed"
    ).casefold()
    years = re.search(r"(?<!\d)([3-9]|[1-9]\d)\s*年(?:及以上|以上)?[^\n，。；]{0,12}(?:工作)?经验", corpus)
    if years:
        checks.append({"type": "experience_years", "verdict": "needs_confirmation", "message": f"JD 明确要求 {years.group(1)} 年及以上经验，请核实年限与独立负责范围。"})
    if any(term in corpus for term in ("本科及以上", "统招本科", "全日制本科", "硕士及以上")):
        if "本科" in confirmed_corpus or "硕士" in confirmed_corpus or "博士" in confirmed_corpus:
            checks.append({"type": "education", "verdict": "pass", "message": "已确认学历证据满足 JD 的本科及以上要求。"})
        else:
            checks.append({"type": "education", "verdict": "needs_confirmation", "message": "JD 有明确学历要求，请根据真实学历与专业确认。"})
    if any(term in corpus for term in ("英语流利", "英文沟通", "英语作为工作语言", "海外客户")):
        checks.append({"type": "language", "verdict": "needs_confirmation", "message": "JD 提到英语或海外协作，请确认实际工作语言要求。"})
    if any(term in corpus for term in ("低压电工证", "电工证", "注册电气", "上岗证")):
        requested_terms = [term for term in ("低压电工证", "电工证", "注册电气", "上岗证") if term in corpus]
        if any(term in confirmed_corpus for term in requested_terms):
            checks.append({"type": "credential", "verdict": "pass", "message": "已确认的证书证据与 JD 上岗要求对应；投递前仍应核对有效期。"})
        else:
            checks.append({"type": "credential", "verdict": "needs_confirmation", "message": "JD 提到证书或上岗要求，请确认你的证书有效期与岗位是否硬性要求。"})
    return checks


def _risk_signals(corpus: str) -> list[dict[str, str]]:
    signals: list[dict[str, str]] = []
    for label, terms in _RISK_SIGNALS.items():
        found = [term for term in terms if term in corpus]
        if found:
            signals.append({"label": label, "terms": "、".join(found), "message": "请在投递前核实具体安排。"})
    return signals


def _information_quality(title: str, description: str, location: str, salary: str) -> dict[str, Any]:
    signals = 0
    missing: list[str] = []
    if len(description) >= 120:
        signals += 6
    else:
        missing.append("JD 内容较短")
    if any(term in description for term in ("职责", "负责", "工作内容", "岗位职责")):
        signals += 3
    else:
        missing.append("职责范围")
    if any(term in description for term in ("要求", "任职", "资格", "技能")):
        signals += 3
    else:
        missing.append("任职要求")
    if location:
        signals += 2
    else:
        missing.append("工作地点")
    if salary:
        signals += 1
    else:
        missing.append("薪资")
    return {"score": signals, "max_score": 15, "missing": missing, "confidence": "较完整" if signals >= 11 else "信息有限"}


def _build_gaps(clusters: list[str], supported: list[dict[str, Any]], unsupported: list[str], requirements: list[dict[str, str]]) -> list[str]:
    gaps = [f"JD 涉及“{cluster}”，当前事实库没有可确认的对应证据。" for cluster in unsupported]
    gaps += [item["message"] for item in requirements if item["verdict"] == "needs_confirmation"]
    return _deduplicate(gaps)[:5]


def _recommendation(score: int, hard_fail: bool, risks: list[dict[str, str]], requirements: list[dict[str, str]]) -> str:
    if hard_fail:
        return "暂缓投递"
    if score >= 70 and not risks and not requirements:
        return "优先投递"
    if score >= 50:
        return "可以投递，先核实"
    return "谨慎评估"


def _summary(score: int, evidence: list[dict[str, Any]], gaps: list[str], quality: dict[str, Any]) -> str:
    if evidence:
        return f"方向匹配 {score}/100：已找到 {len(evidence)} 条可确认依据；" + ("仍有待核实项。" if gaps else "JD 信息较完整，可继续准备材料。")
    return f"方向匹配 {score}/100：当前未找到直接证据链；请补充完整 JD 或先核实关键要求（{quality['confidence']}）。"


def _resume_focus(evidence: list[dict[str, Any]], gaps: list[str]) -> list[str]:
    focus = [f"优先展示“{item['label']}”相关经历：{item['claim']}" for item in evidence[:2]]
    if gaps:
        focus.append("对未覆盖要求使用真实的相邻经历说明学习路径，不补写未做过的工具、年限或职责。")
    return focus[:3]


def _role_note(score: int, target_titles: Iterable[str]) -> str:
    targets = [str(item) for item in target_titles if str(item).strip()]
    if not targets:
        return "尚未设置目标岗位，方向分仅作中性参考。"
    if score >= 18:
        return "岗位名称与目标方向接近。"
    return "岗位名称与目标方向存在距离，建议阅读完整职责后再决定。"


def _public_evidence(record: dict[str, Any]) -> dict[str, Any]:
    source = record.get("source") if isinstance(record.get("source"), dict) else {}
    return {"id": record.get("id", ""), "label": record.get("label", ""), "claim": record.get("claim", ""), "source_type": source.get("type", "other")}


def _normalize(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]", "", value.casefold())


def _text_similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    left_tokens = {left[index:index + 2] for index in range(len(left) - 1)} or {left}
    right_tokens = {right[index:index + 2] for index in range(len(right) - 1)} or {right}
    return (2 * len(left_tokens & right_tokens)) / (len(left_tokens) + len(right_tokens))


def _location_matches(job_location: str, preference: str) -> bool:
    left = re.sub(r"[市省区县\s/·-]", "", job_location.casefold())
    right = re.sub(r"[市省区县\s/·-]", "", preference.casefold())
    return bool(left and right and (left in right or right in left))


def _deduplicate(items: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        value = str(item).strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result
