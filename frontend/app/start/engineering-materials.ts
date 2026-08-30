export type EngineeringPreference = { locations: string[]; salary_expectation: string; travel_preference: string; availability: string }
export type EngineeringAssetKind = 'education' | 'experience' | 'project' | 'skill'
export type EngineeringAsset = { id: string; kind: EngineeringAssetKind; title: string; organization: string; role: string; period: string; description: string; highlights: string[]; tools: string[]; confirmed: boolean }
export type EngineeringProfile = { display_name: string; phone: string; email: string; summary: string; skills: string[]; target_titles: string[]; preferences: EngineeringPreference; assets: EngineeringAsset[] }
export type EngineeringDecision = { recommendation: string; evidence: string[]; checks: string[]; resume_focus: string[] }
export type EngineeringVariant = 'professional' | 'delivery' | 'vision_ai'
export type EngineeringJobInput = { title: string; company_name: string; location: string; salary: string; description: string; matched_skills: string[] }
export type EngineeringReview = {
  status: 'approved' | 'needs_review'
  warnings: string[]
  track: string
  priority: { tier: 'A' | 'B' | 'C'; item: string; action: string }[]
  hr_review: { strengths: string[]; risks: string[] }
  technical_review: { strengths: string[]; risks: string[] }
  gap_responses: { requirement: string; assessment: 'direct_evidence' | 'adjacent_strength' | 'requires_confirmation'; resume_action: string; interview_response: string }[]
  refinement_actions: { reviewer: string; finding: string; action: string }[]
  release_gate: 'ready_for_visual_review' | 'blocked'
  review_cycle: { draft_review: 'completed'; hr_review: 'completed'; technical_review: 'completed'; final_review: 'completed'; visual_review: 'required' }
}
export type EngineeringKit = { id: string; version_no: number; resume_content: string; cover_letter_content: string; ats_content: string; basis: { claim: string }[]; review: EngineeringReview }

type Track = { label: string; summary: string; terms: string[] }

const TRACKS: Record<string, Track> = {
  automation: { label: '自动化与运动控制', summary: '自动化控制、设备联调与现场交付', terms: ['plc', '西门子', '三菱', '欧姆龙', '汇川', 'hmi', '伺服', '变频器', '运动控制', 'ethercat', 'modbus', '电气', 'i/o', '传感器', '调试', '自动化'] },
  vision: { label: '机器视觉与智能检测', summary: '工业视觉、成像验证与检测系统集成', terms: ['机器视觉', '视觉', 'halcon', 'visionpro', 'opencv', '工业相机', '相机', '镜头', '光源', '打光', '图像', '定位', '测量', 'ocr', '缺陷', '检测'] },
  software: { label: '工业软件与应用开发', summary: '工业软件实现、通信集成与问题排查', terms: ['python', 'c#', '.net', 'c++', 'qt', 'winforms', 'sql', '接口', 'api', 'git', '软件', '算法', '数据'] },
  embedded: { label: '嵌入式与电子硬件', summary: '嵌入式开发、硬件接口与板级联调', terms: ['stm32', '嵌入式', '单片机', 'pcb', '固件', 'keil', 'uart', 'can', 'spi', 'i2c', '电子', '硬件'] },
  mechanical: { label: '机械设计与设备集成', summary: '机械方案、设备集成与制造协同', terms: ['机械设计', 'solidworks', 'ug', 'creo', '机械', '装配', '夹具', '公差', '气动', '液压', 'bom'] },
  quality: { label: '设备测试与质量验证', summary: '设备测试、验证记录与问题闭环', terms: ['测试', '测试用例', '测试报告', '验证', 'gr&r', 'fmea', '质量', '可靠性', '异常', '故障', '验收'] },
  power: { label: '电力与能源工程', summary: '电力系统、配电设备与工程分析', terms: ['电力', '配电', '继电保护', 'psasp', '潮流', '变电', '能源', '高压', '低压'] },
}

export const engineeringKeywords = Array.from(new Set(Object.values(TRACKS).flatMap(track => track.terms))).map(term => term === 'i/o' ? 'I/O' : term === '.net' ? '.NET' : term === 'c#' ? 'C#' : term === 'c++' ? 'C++' : term === 'hmi' ? 'HMI' : term === 'plc' ? 'PLC' : term === 'ocr' ? 'OCR' : term === 'api' ? 'API' : term === 'bom' ? 'BOM' : term === 'gr&r' ? 'GR&R' : term)

const compact = (value: string, length = 112) => value.replace(/\s+/g, ' ').trim().slice(0, length)
const includes = (text: string, term: string) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase())
const assetLabel = (kind: EngineeringAssetKind) => ({ education: '教育经历', experience: '工作 / 实习经历', project: '项目 / 实训', skill: '技能实践' })[kind]
const dedupe = (items: string[]) => [...new Set(items.filter(Boolean))]

function trackFor(job: Pick<EngineeringJobInput, 'title' | 'description'>) {
  const text = `${job.title} ${job.description}`
  const scored = Object.entries(TRACKS).map(([id, track]) => ({ id, track, score: track.terms.filter(term => includes(text, term)).length }))
  return scored.sort((left, right) => right.score - left.score)[0] || { id: 'automation', track: TRACKS.automation, score: 0 }
}

function requestedTerms(job: Pick<EngineeringJobInput, 'title' | 'description'>, track: Track) {
  return track.terms.filter(term => includes(`${job.title} ${job.description}`, term)).slice(0, 8)
}

function assetText(asset: EngineeringAsset) { return `${asset.title} ${asset.organization} ${asset.role} ${asset.description} ${asset.highlights.join(' ')} ${asset.tools.join(' ')}` }

function selectedEvidence(profile: EngineeringProfile, job: EngineeringJobInput) {
  const selectedTrack = trackFor(job)
  const terms = requestedTerms(job, selectedTrack.track)
  return profile.assets.filter(asset => asset.confirmed).map(asset => {
    const text = assetText(asset)
    const direct = terms.filter(term => includes(text, term))
    const contextual = selectedTrack.track.terms.filter(term => includes(text, term))
    return { asset, direct, score: direct.length * 8 + contextual.length * 3 + (asset.kind === 'experience' ? 3 : asset.kind === 'project' ? 2 : 0) + Math.min(asset.description.length, 240) / 120 }
  }).sort((left, right) => right.score - left.score).slice(0, 4)
}

export function buildEngineeringAnalysis(profile: EngineeringProfile, job: Pick<EngineeringJobInput, 'title' | 'company_name' | 'location' | 'salary' | 'description'>) {
  const materialJob = { ...job, matched_skills: [] }
  const selection = selectedEvidence(profile, materialJob)
  const { track } = trackFor(materialJob)
  const requested = requestedTerms(materialJob, track)
  const background = `${profile.summary} ${profile.skills.join(' ')} ${selection.map(item => assetText(item.asset)).join(' ')}`
  const matched_skills = engineeringKeywords.filter(term => includes(`${job.title} ${job.description}`, term) && includes(background, term)).slice(0, 6)
  const missing = requested.filter(term => !matched_skills.some(found => found.toLocaleLowerCase() === term.toLocaleLowerCase())).slice(0, 3)
  const match_score = Math.max(35, Math.min(94, 35 + matched_skills.length * 8 + selection.length * 6 + (profile.target_titles.length ? 4 : 0) + (profile.preferences.locations.length ? 3 : 0)))
  const evidence = [
    profile.summary ? `职业画像：${compact(profile.summary)}` : '',
    ...selection.slice(0, 2).map(item => `本人确认的${assetLabel(item.asset.kind)}：${item.asset.title}${item.asset.organization ? ` · ${item.asset.organization}` : ''}`),
    matched_skills.length ? `JD 对齐线索：${matched_skills.join('、')}` : '当前缺少可与 JD 直接对应的已确认线索。',
  ].filter(Boolean)
  const checks = [
    missing.length ? `JD 涉及 ${missing.join('、')}；只有确实接触过时，才补入本人确认的资产。` : 'JD 核心词已有对应线索，投递前仍需核对责任范围与表述边界。',
    profile.preferences.locations.length && job.location && !profile.preferences.locations.some(place => job.location.includes(place)) ? `岗位地点“${job.location}”不在优先地点内，请确认是否接受。` : '',
    job.description.length < 100 ? 'JD 信息较少，建议补充完整职责和任职要求后再做最终材料。' : '',
  ].filter(Boolean)
  return { match_score, matched_skills, analysis_summary: `${track.label}方向匹配 ${match_score}/100：${selection.length ? `已选出 ${selection.length} 条本人确认资产` : '尚未找到本人确认资产'}；${job.description.length >= 100 ? '可进入双视角审查。' : 'JD 信息不足，建议先补齐后复核。'}`, decision: { recommendation: match_score >= 78 && selection.length ? '可以投递，先完成审查' : match_score >= 60 ? '补充证据后再投递' : '优先补齐职业资产库', evidence, checks, resume_focus: selection.length ? selection.map(item => `优先展示“${item.asset.title}”中与 ${item.direct.join('、') || track.label} 相关的本人动作、工具、交付物与验证。`) : ['先补充一条真实资产：场景、本人动作、工具、交付物与验证方式。'] } satisfies EngineeringDecision }
}

export function reviewEngineeringMaterials(profile: EngineeringProfile, job: EngineeringJobInput): EngineeringReview {
  const selectedTrack = trackFor(job)
  const selection = selectedEvidence(profile, job)
  const requested = requestedTerms(job, selectedTrack.track)
  const direct = dedupe(selection.flatMap(item => item.direct))
  const confirmedSkills = dedupe([...profile.skills, ...profile.assets.filter(asset => asset.confirmed).flatMap(asset => asset.tools)])
  const hrStrengths = [
    selection.length ? `已从 ${selection.length} 条本人确认资产中筛选岗位相关证据，不以 JD 关键词替代经历。` : '',
    selection.some(item => item.asset.kind === 'experience') ? '已区分工作/实习来源，可避免把项目或练习伪装成正式任职。' : '',
    selection.some(item => item.asset.kind === 'project') ? '项目/实训可作为技术证明，材料会保留其真实性质。' : '',
  ].filter(Boolean)
  const hrRisks = [
    !profile.display_name ? '未填写简历称呼，正式投递前需补齐。' : '',
    profile.target_titles.length === 0 ? '未填写目标岗位方向，HR 难以快速判断求职目标。' : '',
    !profile.assets.some(asset => asset.confirmed && asset.kind === 'education') ? '未确认教育经历；学历/专业要求不能自动假设满足。' : '',
    selection.length === 0 ? '没有可用于材料的本人确认资产，不能生成可投递经历。' : '',
    job.description.length < 100 ? 'JD 过短，职责、年限或硬性要求可能未完整识别。' : '',
  ].filter(Boolean)
  const technicalStrengths = [
    direct.length ? `已由本人确认资产直接覆盖：${direct.join('、')}。` : '',
    confirmedSkills.length >= 3 ? `可追问的已确认工具基础：${confirmedSkills.slice(0, 6).join('、')}。` : '',
  ].filter(Boolean)
  const technicalRisks = requested.filter(term => !direct.some(item => item.toLocaleLowerCase() === term.toLocaleLowerCase())).slice(0, 4).map(term => `JD 要求“${term}”尚无直接已确认项目证据；不写成既有能力。`)
  const gap_responses = requested.slice(0, 5).map(requirement => {
    if (direct.some(item => item.toLocaleLowerCase() === requirement.toLocaleLowerCase())) return { requirement, assessment: 'direct_evidence' as const, resume_action: '在经历要点中明确该工具/方法所在的真实场景、本人动作与交付。', interview_response: '准备用“场景—任务—动作—工具—结果/复盘”讲清该项实际使用经历。' }
    const adjacent = selection.find(item => item.score > 0)
    if (adjacent) return { requirement, assessment: 'adjacent_strength' as const, resume_action: `不声明已掌握“${requirement}”；优先展示相邻强项“${adjacent.asset.title}”中的真实工具、调试或交付动作。`, interview_response: `如实说明对“${requirement}”的当前接触程度，并用“${adjacent.asset.title}”证明可迁移的工程学习与排障能力。` }
    return { requirement, assessment: 'requires_confirmation' as const, resume_action: `暂不将“${requirement}”写入简历技能或经历；先补充真实接触记录。`, interview_response: `如被问到“${requirement}”，如实说明尚待补齐，并说明下一步学习或实操计划。` }
  })
  const priority = [
    ...selection.slice(0, 2).map(item => ({ tier: 'A' as const, item: item.asset.title, action: '进入正式简历核心经历/项目区，保留真实来源和动作边界。' })),
    ...technicalRisks.slice(0, 2).map(item => ({ tier: 'B' as const, item, action: '作为缺口审查项处理，不通过关键词堆叠伪造覆盖。' })),
    ...hrRisks.slice(0, 2).map(item => ({ tier: 'C' as const, item, action: '投递前由本人补充或核实。' })),
  ]
  const refinement_actions = [
    { reviewer: 'HR', finding: selection.length ? '已有可验证资产，但需要先展示与岗位最相关的两条。' : '资料不足以支撑岗位专属经历。', action: selection.length ? '将最相关资产置于概述和经历区首位，删除空泛自评。' : '先补充本人确认资产，再生成最终版。' },
    { reviewer: '技术主管', finding: direct.length ? `可追问技术点为：${direct.join('、')}。` : '没有可追问的技术证据链。', action: direct.length ? '每项只保留可讲清的场景、工具、问题与验证。' : '以相邻真实能力组织面试准备，不声明未做过的技术。' },
  ]
  const warnings = dedupe([...hrRisks, ...technicalRisks])
  const ready = Boolean(profile.display_name && selection.length && confirmedSkills.length >= 3 && !hrRisks.some(item => item.includes('没有可用于材料')))
  return { status: ready && !technicalRisks.length ? 'approved' : 'needs_review', warnings, track: selectedTrack.track.label, priority, hr_review: { strengths: hrStrengths, risks: hrRisks }, technical_review: { strengths: technicalStrengths, risks: technicalRisks }, gap_responses, refinement_actions, release_gate: ready ? 'ready_for_visual_review' : 'blocked', review_cycle: { draft_review: 'completed', hr_review: 'completed', technical_review: 'completed', final_review: 'completed', visual_review: 'required' } }
}

export function composeEngineeringDraft(profile: EngineeringProfile, job: EngineeringJobInput, variant: EngineeringVariant) {
  const selected = selectedEvidence(profile, job)
  const proof = selected[0]?.asset
  if (!proof) return ''
  const strengths = dedupe([...(job.matched_skills || []), ...proof.tools, ...profile.skills]).slice(0, 5)
  const action = compact(proof.highlights[0] || proof.description, 135)
  const opener = `您好，我想应聘${job.company_name || '贵公司'}的${job.title}岗位。`
  const capability = strengths.length ? `我具备${strengths.join('、')}相关的真实实践基础。` : `我有${proof.title}相关的真实项目实践。`
  const proofLine = variant === 'delivery'
    ? `在“${proof.title}”中，我完成过${action}，也积累了现场联调、问题排查与协作交付的实践经验。`
    : variant === 'vision_ai'
      ? `在“${proof.title}”中，我完成过${action}${proof.tools.length ? `，使用过${proof.tools.join('、')}等工具` : ''}。`
      : `在“${proof.title}”中，我完成过${action}${proof.tools.length ? `，使用过${proof.tools.join('、')}等工具` : ''}。`
  return `${opener}${capability}\n\n${proofLine}\n\n如果岗位仍在推进，期待有机会进一步沟通我与该岗位相关的项目经历。`
}

export function composeEngineeringKit(profile: EngineeringProfile, job: EngineeringJobInput, version: number): EngineeringKit {
  const review = reviewEngineeringMaterials(profile, job)
  const selected = selectedEvidence(profile, job).map(item => item.asset)
  const track = review.track
  const skills = dedupe([...job.matched_skills, ...selected.flatMap(asset => asset.tools), ...profile.skills]).slice(0, 10)
  const experience = selected.filter(asset => asset.kind === 'experience')
  const projects = selected.filter(asset => asset.kind === 'project' || asset.kind === 'skill')
  const education = selected.filter(asset => asset.kind === 'education')
  const primary = [...experience, ...projects][0]
  const summary = profile.summary || (primary ? `应聘${job.title}方向，具备${track}相关的真实实践基础；代表经历为“${primary.title}”，包含本人完成的任务、工具与交付。` : `应聘${job.title}方向。`)
  const assetBlock = (asset: EngineeringAsset) => {
    const heading = [asset.organization, asset.title, asset.role, asset.period].filter(Boolean).join('｜')
    const bullets = (asset.highlights.length ? asset.highlights : [asset.description]).filter(Boolean)
    return `${heading}\n${bullets.map(item => `- ${item}`).join('\n')}${asset.tools.length ? `\n- 工具 / 方法：${asset.tools.join('、')}` : ''}`
  }
  const resume_content = [
    profile.display_name,
    `${job.title}｜${profile.preferences.locations.join('、') || '地点可协商'}｜${profile.preferences.availability || '到岗可协商'}`,
    '', '职业概况', summary,
    '', '核心技能', skills.join('、'),
    experience.length ? `\n工作 / 实习经历\n${experience.slice(0, 2).map(assetBlock).join('\n\n')}` : '',
    projects.length ? `\n项目 / 技能实践\n${projects.slice(0, 2).map(assetBlock).join('\n\n')}` : '',
    education.length ? `\n教育背景\n${education.slice(0, 1).map(assetBlock).join('\n')}` : '',
  ].filter(Boolean).join('\n')
  const ats_content = [profile.display_name || '姓名', `目标岗位：${job.title}`, `目标公司：${job.company_name || '未提供'}`, '', '个人概述', summary, '', '核心技能', skills.join('、'), experience.length ? '\n工作 / 实习经历' : '', ...experience.map(assetBlock), projects.length ? '\n项目 / 技能实践' : '', ...projects.map(assetBlock), education.length ? '\n教育背景' : '', ...education.map(assetBlock)].filter(Boolean).join('\n') + '\n'
  const cover = composeEngineeringDraft(profile, job, 'professional')
  const basis = selected.map(asset => ({ claim: `${assetLabel(asset.kind)}：${asset.title}${asset.organization ? `｜${asset.organization}` : ''}｜${asset.description}` }))
  return { id: crypto.randomUUID(), version_no: version, resume_content, cover_letter_content: cover, ats_content, basis, review }
}

export function composeEngineeringInterview(profile: EngineeringProfile, job: EngineeringJobInput) {
  const review = reviewEngineeringMaterials(profile, job)
  const selected = selectedEvidence(profile, job)
  const primary = selected[0]?.asset
  return {
    evidence: selected.map(item => `${assetLabel(item.asset.kind)}：${item.asset.title}｜${compact(item.asset.description, 150)}`),
    prompts: [
      primary ? `请用“场景—任务—本人动作—工具—验证/复盘”讲清“${primary.title}”，不要只说“参与”。` : '先补充一条可用于面试的本人确认资产，再练习技术问答。',
      ...review.gap_responses.slice(0, 3).map(item => `“${item.requirement}”：${item.interview_response}`),
      '向技术负责人确认：设备/项目阶段、你负责模块的边界、现场调试频率、验收标准及前三个月的成功定义。',
    ],
    review,
  }
}
