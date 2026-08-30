"""Fictional, non-identifying sample profiles for public product demonstrations.

They are deliberately modest: the samples show how coursework, labs and
personal projects become credible evidence when their real scope is named.
They are not templates to be copied as a user's own experience.
"""

from __future__ import annotations

from app.public_product.profile_contract import (
    PublicEducation,
    PublicEvidence,
    PublicEvidenceParent,
    PublicEvidenceSource,
    PublicExperience,
    PublicIdentity,
    PublicPreferences,
    PublicProfile,
    PublicSkill,
)


def public_demo_profiles() -> list[PublicProfile]:
    return [_automation_demo(), _vision_demo(), _software_demo()]


def _automation_demo() -> PublicProfile:
    activity = PublicExperience(
        id="demo-automation-course", experience_type="coursework", title="自动化产线控制课程设计",
        organization_or_project="自动化综合实训", context="在课程实训中完成小型分拣流程控制与界面联调。",
        actions=["编写顺序动作、互锁和异常提示逻辑", "核对 I/O 信号并完成 HMI 状态展示"],
        tools=["PLC", "HMI", "Modbus"], deliverables=["课程设计说明", "可演示控制流程"],
        skills=["PLC", "HMI", "Modbus", "I/O 调试"], candidate_confirmed=True,
    )
    return PublicProfile(
        profile_id="sample_automation_v1", origin="sample", revision=1,
        identity=PublicIdentity(preferred_name="自动化方向演示用户", city="深圳", headline="自动化专业应届求职者"),
        preferences=PublicPreferences(target_titles=["PLC 工程师", "电气调试工程师"], locations=["深圳", "广州"]),
        education=[PublicEducation(id="demo-automation-edu", school="示例工科院校", degree="本科", major="自动化", candidate_confirmed=True)],
        experiences=[activity],
        skills=[
            PublicSkill(id="demo-auto-skill-plc", name="PLC", category="控制", scope="guided_task", candidate_confirmed=True),
            PublicSkill(id="demo-auto-skill-hmi", name="HMI", category="控制", scope="guided_task", candidate_confirmed=True),
            PublicSkill(id="demo-auto-skill-modbus", name="Modbus", category="工业通信", scope="basic_practice", candidate_confirmed=True),
        ],
        evidence=[PublicEvidence(
            id="demo-auto-evidence", kind="project", label=activity.title,
            parent_ref=PublicEvidenceParent(section="experience", record_id=activity.id),
            claim="在自动化综合实训中编写 PLC 顺序控制与互锁逻辑，完成 HMI 状态展示、I/O 核对和异常联调。",
            signals=["PLC", "HMI", "Modbus", "I/O", "调试"], source=PublicEvidenceSource(type="coursework", label="本人确认的课程实训"),
            status="confirmed", proficiency="basic_practice", responsibility_scope="personal_deliverable",
            metric_scope="not_applicable", usage=["resume", "ats", "interview"],
        )],
    )


def _vision_demo() -> PublicProfile:
    activity = PublicExperience(
        id="demo-vision-lab", experience_type="lab", title="零件外观检测实验",
        organization_or_project="机器视觉实验室练习", context="在实验环境中完成图像采集、阈值分割和尺寸定位验证。",
        actions=["调整光照与相机参数以获得稳定成像", "使用视觉工具完成定位和基础尺寸测量"],
        tools=["HALCON", "工业相机", "光源"], deliverables=["实验记录", "图像处理流程"],
        skills=["HALCON", "图像处理", "光源调试"], candidate_confirmed=True,
    )
    return PublicProfile(
        profile_id="sample_vision_v1", origin="sample", revision=1,
        identity=PublicIdentity(preferred_name="视觉方向演示用户", city="苏州", headline="机器视觉应用方向求职者"),
        preferences=PublicPreferences(target_titles=["机器视觉工程师", "视觉应用工程师"], locations=["苏州", "上海"]),
        education=[PublicEducation(id="demo-vision-edu", school="示例理工学院", degree="本科", major="测控技术", candidate_confirmed=True)],
        experiences=[activity],
        skills=[
            PublicSkill(id="demo-vision-skill-halcon", name="HALCON", category="视觉工具", scope="guided_task", candidate_confirmed=True),
            PublicSkill(id="demo-vision-skill-image", name="图像处理", category="视觉基础", scope="basic_practice", candidate_confirmed=True),
            PublicSkill(id="demo-vision-skill-light", name="光源调试", category="成像", scope="basic_practice", candidate_confirmed=True),
        ],
        evidence=[PublicEvidence(
            id="demo-vision-evidence", kind="project", label=activity.title,
            parent_ref=PublicEvidenceParent(section="experience", record_id=activity.id),
            claim="在机器视觉实验练习中完成相机与光照参数调整，并使用 HALCON 验证基础定位、分割和尺寸测量流程。",
            signals=["HALCON", "工业相机", "光源", "定位", "测量"], source=PublicEvidenceSource(type="coursework", label="本人确认的实验练习"),
            status="confirmed", proficiency="basic_practice", responsibility_scope="personal_deliverable",
            metric_scope="experiment_result", boundaries=["实验环境验证，不代表客户产线项目"], usage=["resume", "ats", "interview"],
        )],
    )


def _software_demo() -> PublicProfile:
    activity = PublicExperience(
        id="demo-software-project", experience_type="project", title="设备数据看板个人项目",
        organization_or_project="个人作品", context="围绕模拟设备数据制作可演示的状态查看和异常记录工具。",
        actions=["设计数据读取、状态展示和异常记录流程", "整理 README 与演示截图，持续修复边界输入问题"],
        tools=["Python", "SQL", "Git"], deliverables=["可运行作品", "README", "演示截图"],
        skills=["Python", "SQL", "Git", "问题排查"], candidate_confirmed=True,
    )
    return PublicProfile(
        profile_id="sample_software_v1", origin="sample", revision=1,
        identity=PublicIdentity(preferred_name="软件方向演示用户", city="杭州", headline="工业软件方向转岗求职者"),
        preferences=PublicPreferences(target_titles=["Python 开发工程师", "工业软件工程师"], locations=["杭州", "上海"], work_style="hybrid"),
        education=[PublicEducation(id="demo-software-edu", school="示例大学", degree="本科", major="计算机科学", candidate_confirmed=True)],
        experiences=[activity],
        skills=[
            PublicSkill(id="demo-software-skill-python", name="Python", category="开发", scope="independent_routine", candidate_confirmed=True),
            PublicSkill(id="demo-software-skill-sql", name="SQL", category="数据", scope="guided_task", candidate_confirmed=True),
            PublicSkill(id="demo-software-skill-git", name="Git", category="工程协作", scope="basic_practice", candidate_confirmed=True),
        ],
        evidence=[PublicEvidence(
            id="demo-software-evidence", kind="project", label=activity.title,
            parent_ref=PublicEvidenceParent(section="experience", record_id=activity.id),
            claim="围绕模拟设备数据开发状态查看与异常记录工具，整理可运行作品、README 和演示截图，并持续修复边界输入问题。",
            signals=["Python", "SQL", "Git", "软件开发", "异常记录"], source=PublicEvidenceSource(type="portfolio", label="本人确认的个人作品"),
            status="confirmed", proficiency="independent", responsibility_scope="personal_deliverable",
            metric_scope="software_simulation", boundaries=["个人作品，使用模拟数据"], usage=["resume", "ats", "interview"],
        )],
    )
