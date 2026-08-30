"""Portable, privacy-aware career profile contract for the public Jobwise MVP.

This module intentionally does not read ``data/private`` or the local
``candidate_profile`` table. A public profile is supplied by the visitor,
can live in browser storage, and may later be migrated to an account only with
explicit consent. The structure keeps raw career facts separate from derived
writing suggestions so generic onboarding never invents a user's experience.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.career_engine.job_decision import evaluate_job


PUBLIC_PROFILE_SCHEMA_VERSION = "public-profile@1"
EvidenceStatus = Literal["confirmed", "needs_confirmation", "inferred"]
EvidenceSourceType = Literal[
    "user", "resume_import", "portfolio", "project_file", "certificate",
    "coursework", "reference", "other",
]
ExperienceType = Literal[
    "employment", "internship", "project", "coursework", "lab", "freelance",
    "campus", "volunteer", "career_break",
]
SkillScope = Literal[
    "aware", "basic_practice", "guided_task", "independent_routine",
    "troubleshoot_optimize",
]


class PublicContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class PublicIdentity(PublicContractModel):
    """Contact fields are optional and never required for JD analysis."""

    preferred_name: str = Field(default="", max_length=80)
    city: str = Field(default="", max_length=80)
    headline: str = Field(default="", max_length=180)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=160)
    photo_enabled: bool = False


class PublicPreferences(PublicContractModel):
    target_titles: list[str] = Field(default_factory=list, max_length=3)
    target_industries: list[str] = Field(default_factory=list, max_length=5)
    locations: list[str] = Field(default_factory=list, max_length=8)
    salary_expectation: str = Field(default="", max_length=80)
    travel_preference: Literal["unspecified", "open", "limited", "not_preferred"] = "unspecified"
    shift_preference: Literal["unspecified", "open", "limited", "not_preferred"] = "unspecified"
    availability: str = Field(default="", max_length=80)
    work_style: Literal["unspecified", "onsite", "hybrid", "remote", "open"] = "unspecified"


class PublicEducation(PublicContractModel):
    id: str = Field(default_factory=lambda: new_public_id("edu"), max_length=96)
    school: str = Field(default="", max_length=160)
    degree: str = Field(default="", max_length=80)
    major: str = Field(default="", max_length=100)
    start_date: str = Field(default="", max_length=20)
    end_date: str = Field(default="", max_length=20)
    highlights: list[str] = Field(default_factory=list, max_length=8)
    candidate_confirmed: bool = False


class PublicExperience(PublicContractModel):
    """One real activity, including non-employment sources of evidence."""

    id: str = Field(default_factory=lambda: new_public_id("activity"), max_length=96)
    experience_type: ExperienceType
    title: str = Field(default="", max_length=120)
    organization_or_project: str = Field(default="", max_length=160)
    start_date: str = Field(default="", max_length=20)
    end_date: str = Field(default="", max_length=20)
    domain: str = Field(default="", max_length=100)
    context: str = Field(default="", max_length=800)
    responsibilities: list[str] = Field(default_factory=list, max_length=12)
    actions: list[str] = Field(default_factory=list, max_length=16)
    tools: list[str] = Field(default_factory=list, max_length=20)
    deliverables: list[str] = Field(default_factory=list, max_length=12)
    outcomes: list[str] = Field(default_factory=list, max_length=12)
    metrics: list[str] = Field(default_factory=list, max_length=8)
    skills: list[str] = Field(default_factory=list, max_length=20)
    evidence_links: list[str] = Field(default_factory=list, max_length=8)
    confidentiality: Literal["private", "application", "public"] = "private"
    candidate_confirmed: bool = False


class PublicSkill(PublicContractModel):
    id: str = Field(default_factory=lambda: new_public_id("skill"), max_length=96)
    name: str = Field(min_length=1, max_length=100)
    aliases: list[str] = Field(default_factory=list, max_length=8)
    category: str = Field(default="", max_length=80)
    scope: SkillScope = "aware"
    used_in: list[str] = Field(default_factory=list, max_length=12)
    last_used: str = Field(default="", max_length=20)
    candidate_confirmed: bool = False


class PublicCredential(PublicContractModel):
    id: str = Field(default_factory=lambda: new_public_id("credential"), max_length=96)
    name: str = Field(min_length=1, max_length=160)
    issuer: str = Field(default="", max_length=160)
    issued_date: str = Field(default="", max_length=20)
    expires_date: str = Field(default="", max_length=20)
    credential_url: str = Field(default="", max_length=500)
    candidate_confirmed: bool = False


class PublicEvidenceSource(PublicContractModel):
    type: EvidenceSourceType = "user"
    label: str = Field(default="", max_length=160)
    reference: str = Field(default="", max_length=500)


class PublicEvidenceParent(PublicContractModel):
    section: Literal["education", "experience", "skill", "credential", "other"] = "other"
    record_id: str = Field(default="", max_length=96)
    bullet_id: str = Field(default="", max_length=96)


class PublicEvidence(PublicContractModel):
    """A claim is usable only after the visitor explicitly confirms it."""

    id: str = Field(default_factory=lambda: new_public_id("evidence"), max_length=96)
    parent_ref: PublicEvidenceParent = Field(default_factory=PublicEvidenceParent)
    kind: Literal["experience", "project", "skill", "education", "credential", "other"] = "experience"
    label: str = Field(min_length=1, max_length=120)
    claim: str = Field(min_length=1, max_length=1000)
    signals: list[str] = Field(default_factory=list, max_length=24)
    metrics: list[str] = Field(default_factory=list, max_length=8)
    source: PublicEvidenceSource = Field(default_factory=PublicEvidenceSource)
    status: EvidenceStatus = "needs_confirmation"
    proficiency: Literal["lead", "independent", "module_owner", "participated", "basic_practice", "familiar", ""] = ""
    responsibility_scope: Literal["personal_deliverable", "team_result", "system_context", ""] = ""
    metric_scope: Literal["personal_outcome", "system_metric", "experiment_result", "software_simulation", "not_applicable", ""] = ""
    boundaries: list[str] = Field(default_factory=list, max_length=8)
    usage: list[Literal["resume", "ats", "communication", "interview", "internal"]] = Field(default_factory=list)
    confidentiality: Literal["private", "application", "public"] = "private"

    @model_validator(mode="after")
    def confirmed_claim_has_a_real_source(self) -> "PublicEvidence":
        traceable = {"user", "resume_import", "portfolio", "project_file", "certificate", "coursework", "reference"}
        if self.status == "confirmed" and self.source.type not in traceable:
            raise ValueError("已确认事实必须保留本人或可追溯来源")
        return self


class PublicConsent(PublicContractModel):
    local_only: bool = True
    sync_accepted_at: str = ""
    model_generation_accepted_at: str = ""
    export_storage_accepted_at: str = ""


class PublicProfile(PublicContractModel):
    schema_version: Literal["public-profile@1"] = PUBLIC_PROFILE_SCHEMA_VERSION
    profile_id: str = Field(default_factory=lambda: new_public_id("profile"), max_length=96)
    origin: Literal["guest", "account", "sample"] = "guest"
    revision: int = Field(default=1, ge=1)
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    identity: PublicIdentity = Field(default_factory=PublicIdentity)
    preferences: PublicPreferences = Field(default_factory=PublicPreferences)
    education: list[PublicEducation] = Field(default_factory=list, max_length=8)
    experiences: list[PublicExperience] = Field(default_factory=list, max_length=24)
    skills: list[PublicSkill] = Field(default_factory=list, max_length=60)
    credentials: list[PublicCredential] = Field(default_factory=list, max_length=20)
    evidence: list[PublicEvidence] = Field(default_factory=list, max_length=120)
    consent: PublicConsent = Field(default_factory=PublicConsent)

    @model_validator(mode="after")
    def record_ids_are_unique(self) -> "PublicProfile":
        ids = [*(item.id for item in self.education), *(item.id for item in self.experiences), *(item.id for item in self.skills), *(item.id for item in self.credentials), *(item.id for item in self.evidence)]
        if len(ids) != len(set(ids)):
            raise ValueError("职业资产中的记录 ID 不能重复")
        return self


class PublicJobInput(PublicContractModel):
    title: str = Field(min_length=1, max_length=200)
    company_name: str = Field(default="", max_length=200)
    description: str = Field(min_length=1, max_length=20000)
    location: str = Field(default="", max_length=100)
    salary: str = Field(default="", max_length=100)


class PublicProfileAnalysisRequest(PublicContractModel):
    profile: PublicProfile
    job: PublicJobInput


DISCOVERY_PROMPTS = (
    {"id": "real-work", "title": "工作、实习或兼职中的真实任务", "hint": "回忆你实际完成过的排查、交付、协作、客户支持、文档、数据整理或工具使用。", "questions": ["任务发生在什么场景？", "你本人具体做了什么？", "用了什么方法或工具？", "留下了什么交付物或验证结果？"]},
    {"id": "academic", "title": "课程设计、实验、毕业设计或实训", "hint": "没有正式工作经历时，这些同样可以成为真实项目，只需标明其性质。", "questions": ["你解决的题目或需求是什么？", "你的个人分工是什么？", "做出了原型、代码、报告还是演示？", "结果怎样被验证？"]},
    {"id": "portfolio", "title": "个人作品、开源贡献或技能练习", "hint": "重点记录可演示的代码、作品、复现、调试记录或使用说明，而不是只列工具名。", "questions": ["作品的输入、输出和使用场景是什么？", "你做了哪些关键实现或排障？", "能提供什么链接、截图或演示？"]},
    {"id": "community", "title": "校园组织、志愿服务或非技术经历", "hint": "可提炼真实的组织、沟通、执行、数据、内容或服务能力，但不伪装成正式岗位。", "questions": ["服务的对象或目标是什么？", "你负责了哪些可核实动作？", "产生了什么可描述的结果或反馈？"]},
)


def empty_public_profile(*, origin: Literal["guest", "sample"] = "guest") -> PublicProfile:
    return PublicProfile(origin=origin)


def build_evidence_suggestion(experience: PublicExperience, *, action: str, method_or_tool: str = "", result: str = "") -> PublicEvidence:
    """Create a pending suggestion; it is never an automatically confirmed fact."""
    fragments = [action.strip()]
    if method_or_tool.strip():
        fragments.append(f"使用 {method_or_tool.strip()}")
    if result.strip():
        fragments.append(f"形成 {result.strip()}")
    claim = "；".join(part for part in fragments if part)
    return PublicEvidence(
        parent_ref=PublicEvidenceParent(section="experience", record_id=experience.id),
        kind="project" if experience.experience_type in {"project", "coursework", "lab"} else "experience",
        label=experience.title or experience.organization_or_project or "待确认经历",
        claim=claim or "请补充本人完成的具体动作、方法或可验证产物。",
        signals=[*experience.tools[:8], *experience.skills[:8]],
        source=PublicEvidenceSource(type="user", label="引导填写，等待本人确认"),
        status="needs_confirmation", proficiency="basic_practice",
        responsibility_scope="personal_deliverable", metric_scope="not_applicable",
        usage=["internal"], confidentiality=experience.confidentiality,
    )


def exportable_evidence(profile: PublicProfile) -> list[dict]:
    """Return confirmed evidence only; pending/inferred facts stay review-only."""
    return [_to_workspace_evidence(item) for item in profile.evidence if item.status == "confirmed" and "resume" in item.usage]


def profile_to_workspace_projection(profile: PublicProfile) -> dict:
    """Adapter for existing JD analysis. It intentionally excludes phone/email."""
    return {
        "display_name": profile.identity.preferred_name,
        "summary": profile.identity.headline,
        "skills": [item.name for item in profile.skills if item.candidate_confirmed],
        "target_titles": profile.preferences.target_titles,
        "preferences": profile.preferences.model_dump(),
        "evidence": [_to_workspace_evidence(item) for item in profile.evidence],
    }


def assess_export_readiness(profile: PublicProfile) -> dict:
    """Explain what is missing without fabricating a stronger candidate profile."""
    missing: list[dict[str, str]] = []
    if not profile.identity.preferred_name:
        missing.append({"field": "identity.preferred_name", "message": "先填写一个用于简历的姓名或称呼。"})
    if not profile.preferences.target_titles:
        missing.append({"field": "preferences.target_titles", "message": "选择 1—3 个目标岗位方向，才能按 JD 排序内容。"})
    if not any(item.candidate_confirmed and item.school for item in profile.education):
        missing.append({"field": "education", "message": "至少补充一段已确认的教育经历。"})
    if len([item for item in profile.skills if item.candidate_confirmed]) < 3:
        missing.append({"field": "skills", "message": "至少确认 3 项真实技能；可从课程、工具或项目中回忆。"})
    if not exportable_evidence(profile):
        missing.append({"field": "evidence", "message": "至少确认一条可用于简历的真实经历或项目证据。"})
    contact_ready = bool(profile.identity.phone or profile.identity.email)
    return {
        "ready": not missing, "missing": missing, "contact_ready": contact_ready,
        "contact_notice": "联系方式只在导出时需要；分析阶段不会返回或使用它。" if not contact_ready else "联系方式已填写；导出前仍请自行核对。",
        "confirmed_evidence_count": len(exportable_evidence(profile)),
        "pending_evidence_count": len([item for item in profile.evidence if item.status != "confirmed"]),
    }


def analyze_public_profile(request: PublicProfileAnalysisRequest) -> dict:
    """Run existing deterministic JD analysis without persisting visitor data."""
    projection = profile_to_workspace_projection(request.profile)
    job = request.job
    decision = evaluate_job(title=job.title, description=job.description, evidence=projection["evidence"], preferences=projection["preferences"], target_titles=projection["target_titles"], skills=projection["skills"], location=job.location, salary=job.salary)
    return {
        "profile_id": request.profile.profile_id, "revision": request.profile.revision,
        "origin": request.profile.origin, "analysis": decision,
        "export_readiness": assess_export_readiness(request.profile),
        "discovery_prompts": DISCOVERY_PROMPTS,
        "privacy_notice": "游客分析不会保存到 Jobwise 服务端；请勿在示例体验中填写身份证号、精确住址等非必要信息。",
    }


def _to_workspace_evidence(item: PublicEvidence) -> dict:
    return {
        "id": item.id, "kind": item.kind, "label": item.label, "claim": item.claim,
        "parent_ref": item.parent_ref.model_dump(),
        "signals": item.signals, "metrics": item.metrics, "source": item.source.model_dump(),
        "status": item.status, "verification": "user_confirmed" if item.status == "confirmed" else item.status,
        "domains": [], "evidence_tier": "A2" if item.status == "confirmed" else "",
        "proficiency": item.proficiency, "responsibility_scope": item.responsibility_scope,
        "metric_scope": item.metric_scope, "boundaries": item.boundaries, "usage": item.usage,
        "confidentiality": item.confidentiality,
    }
