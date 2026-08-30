'use client'

import { ChangeEvent, FormEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { BiArrowToRight, BiBriefcaseAlt2, BiCheck, BiClipboard, BiCopy, BiDownload, BiFile, BiGridAlt, BiHistory, BiImage, BiMenu, BiPlus, BiRefresh, BiTrash, BiUpload, BiUser, BiX } from 'react-icons/bi'
import ShowcaseHero from '../components/ShowcaseHero'
import ShowcaseJobCard from '../components/ShowcaseJobCard'
import ShowcaseSidebar from '../components/ShowcaseSidebar'
import ShowcaseWorkbench from '../components/ShowcaseWorkbench'
import { buildEngineeringAnalysis as buildAnalysis, composeEngineeringDraft as draftFor, composeEngineeringInterview, composeEngineeringKit as kitFor, reviewEngineeringMaterials, type EngineeringAsset as CareerAsset, type EngineeringAssetKind as AssetKind, type EngineeringDecision as Decision, type EngineeringKit as Kit, type EngineeringProfile as Profile, type EngineeringReview } from './engineering-materials'
import { expressionSuggestion, parseResumeFile, type ResumeImportDraft } from './resume-import'

type Variant = 'professional' | 'delivery' | 'vision_ai'
type Job = { id: string; title: string; company_name: string; source_url: string; location: string; salary: string; description: string; notes: string; status: 'saved' | 'ready' | 'applied'; match_score: number; matched_skills: string[]; analysis_summary: string; decision: Decision; draft?: { variant: Variant; content: string }; kits: Kit[]; outcome?: { status: string; note: string }; follow_up_at?: string }
type BetaFeedbackKind = 'bug' | 'usability' | 'material_quality' | 'word_pdf' | 'suggestion'
type BetaFeedbackSeverity = 'blocker' | 'high' | 'normal' | 'idea'
type BetaFeedback = { id: string; created_at: string; kind: BetaFeedbackKind; severity: BetaFeedbackSeverity; title: string; steps: string; expected: string; actual: string }
type BetaState = { tester_id: string; started_at: string; checklist: { profile: boolean; job: boolean; material: boolean; visual: boolean }; feedback: BetaFeedback[] }
type Store = { version: 2; profile: Profile; jobs: Job[]; beta?: BetaState }
type Pane = { kind: 'resume' | 'interview' | 'application' | 'review'; title: string; summary: string; evidence: string[]; prompts: string[]; warnings: string[]; kit?: Kit; review?: EngineeringReview }
type PublicPage = 'workspace' | 'profile' | 'templates' | 'opportunities' | 'applications' | 'beta'

const storageKey = 'zaotu.showcase.beta.v1'
const legacyProfileStorageKey = 'zaotu.public-profile.v1'
const blankProfile: Profile = { display_name: '', phone: '', email: '', summary: '', skills: [], target_titles: [], preferences: { locations: [], salary_expectation: '', travel_preference: 'unspecified', availability: '' }, assets: [] }
const blankJob = { title: '', company_name: '', source_url: '', location: '', salary: '', description: '', notes: '' }
const betaVersion = 'v0.1.0-beta.1'
// Older beta builds accidentally mixed internal review notes into external
// materials. Never surface a saved legacy draft or kit after an upgrade.
const legacyInternalOutputPattern = /HR 与技术主管双视角自查|正在补充可核实|岗位要求完成|岗位适配|投递前核对/
const createBetaState = (): BetaState => ({ tester_id: '', started_at: '', checklist: { profile: false, job: false, material: false, visual: false }, feedback: [] })
const outcomeOptions = [['applied', '已投递'], ['replied', '收到回复'], ['assessment', '笔试 / 测评'], ['interview', '进入面试'], ['offer', '获得 Offer'], ['rejected', '未通过'], ['no_response', '暂无反馈'], ['withdrawn', '主动撤回']] as const
const assetKindLabel = (kind: AssetKind) => ({ education: '教育经历', experience: '工作 / 实习经历', project: '项目 / 实训', skill: '技能实践' })[kind]
const splitItems = (value: string) => value.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean)
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '').replace(/[，。、·:：()（）【】\[\]-]/g, '')
const compact = (value: string, length = 110) => value.replace(/\s+/g, ' ').trim().slice(0, length)
const evidencePoints = (asset: CareerAsset) => (asset.highlights.length ? asset.highlights : asset.description.split(/[\n；;。]+/)).map(item => item.trim()).filter(Boolean).slice(0, 6)
const formalApiBase = 'https://zaotu-beta-d6gya28z138ad2bfe.service.tcloudbase.com/api'
const publicPages: PublicPage[] = ['workspace', 'profile', 'templates', 'opportunities', 'applications', 'beta']
const pageFromHash = (hash: string): PublicPage => {
  const candidate = hash.replace(/^#/, '')
  return publicPages.includes(candidate as PublicPage) ? candidate as PublicPage : 'workspace'
}

// The public endpoint accepts a portable, anonymous profile contract.  This
// adapter deliberately promotes only visitor-confirmed assets; it never reads
// or blends in the owner's private local profile.
type MaterialReadiness = { ready: boolean; missing: string[] }

function materialReadiness(profile: Profile, jobTitle: string): MaterialReadiness {
  const confirmedAssets = profile.assets.filter(asset => asset.confirmed)
  const skills = Array.from(new Set([...profile.skills, ...confirmedAssets.flatMap(asset => asset.tools)])).filter(Boolean)
  const hasEducation = confirmedAssets.some(asset => asset.kind === 'education' && Boolean(asset.organization.trim()))
  const hasEvidence = confirmedAssets.some(asset => asset.kind === 'experience' || asset.kind === 'project' || asset.kind === 'skill')
  const missing = [
    !profile.display_name.trim() ? '简历称呼' : '',
    !(profile.phone.trim() || profile.email.trim()) ? '至少一种联系方式（手机或邮箱）' : '',
    !(profile.target_titles.length || jobTitle.trim()) ? '目标岗位方向' : '',
    skills.length < 3 ? '至少 3 项本人确认的技能' : '',
    !hasEducation ? '一条已确认且写明学校的教育经历' : '',
    !hasEvidence ? '一条已确认的工作、实习、项目或技能实践' : '',
  ].filter(Boolean)
  return { ready: missing.length === 0, missing }
}

function toFormalProfile(profile: Profile, jobTitle: string, photoEnabled = false) {
  const confirmedAssets = profile.assets.filter(asset => asset.confirmed)
  const mappedActivities = confirmedAssets.filter(asset => asset.kind !== 'education').map(asset => ({
    asset,
    experience_type: asset.kind === 'experience' ? 'employment' : 'project',
  }))
  const skills = Array.from(new Set([...profile.skills, ...confirmedAssets.flatMap(asset => asset.tools)])).slice(0, 24)
  return {
    schema_version: 'public-profile@1', profile_id: crypto.randomUUID(), origin: 'guest', revision: 1, updated_at: new Date().toISOString(),
    identity: { preferred_name: profile.display_name, city: profile.preferences.locations[0] || '', headline: profile.summary, phone: profile.phone, email: profile.email, photo_enabled: photoEnabled },
    preferences: { target_titles: (profile.target_titles.length ? profile.target_titles : [jobTitle]).slice(0, 3), target_industries: [], locations: profile.preferences.locations, salary_expectation: profile.preferences.salary_expectation, travel_preference: profile.preferences.travel_preference, shift_preference: 'unspecified', availability: profile.preferences.availability, work_style: 'unspecified' },
    education: confirmedAssets.filter(asset => asset.kind === 'education').map(asset => ({ id: asset.id, school: asset.organization || '学校待本人补充', degree: asset.title, major: asset.role || compact(asset.description, 96), start_date: asset.period, end_date: '', highlights: evidencePoints(asset), candidate_confirmed: true })),
    experiences: mappedActivities.map(({ asset, experience_type }) => ({ id: asset.id, experience_type, title: asset.role || asset.title, organization_or_project: asset.organization || asset.title, start_date: asset.period, end_date: '', domain: asset.kind, context: asset.description, responsibilities: asset.description ? [asset.description] : [], actions: evidencePoints(asset), tools: asset.tools, deliverables: [], outcomes: [], metrics: [], skills: asset.tools, evidence_links: [], confidentiality: 'private', candidate_confirmed: true })),
    skills: skills.map((name, index) => ({ id: `skill_${index}_${name}`, name, aliases: [], category: '本人填写', scope: 'basic_practice', used_in: [], last_used: '', candidate_confirmed: true })),
    credentials: [],
    evidence: mappedActivities.flatMap(({ asset }) => evidencePoints(asset).map((claim, index) => ({ id: `evidence_${asset.id}_${index}`, parent_ref: { section: 'experience', record_id: asset.id, bullet_id: String(index) }, kind: asset.kind === 'experience' ? 'experience' : 'project', label: asset.title, claim, signals: asset.tools, metrics: [], source: { type: 'user', label: '访问者本人确认的职业资产', reference: '' }, status: 'confirmed', proficiency: 'basic_practice', responsibility_scope: 'personal_deliverable', metric_scope: 'not_applicable', boundaries: [], usage: ['resume', 'ats', 'communication', 'interview'], confidentiality: 'private' }))),
    consent: { local_only: true, sync_accepted_at: '', model_generation_accepted_at: '', export_storage_accepted_at: '' },
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const value = raw ? JSON.parse(raw) as Record<string, unknown> : {} as Record<string, unknown>
    const legacy = JSON.parse(window.localStorage.getItem(legacyProfileStorageKey) || '{}') as Record<string, string>
    const source = value.profile && typeof value.profile === 'object' ? value.profile as Record<string, unknown> : {}
    const preferences = source.preferences && typeof source.preferences === 'object' ? source.preferences as Record<string, unknown> : {}
    const assets = Array.isArray(source.assets) ? source.assets.map(item => { const asset = item as Record<string, unknown>; return { id: String(asset.id || crypto.randomUUID()), kind: ['education', 'experience', 'project', 'skill'].includes(String(asset.kind)) ? String(asset.kind) as AssetKind : 'project', title: String(asset.title || ''), organization: String(asset.organization || ''), role: String(asset.role || ''), period: String(asset.period || ''), description: String(asset.description || ''), highlights: Array.isArray(asset.highlights) ? asset.highlights.map(String) : [], tools: Array.isArray(asset.tools) ? asset.tools.map(String) : [], confirmed: asset.confirmed === true } }).filter(asset => asset.title) : []
    const profile: Profile = { display_name: String(source.display_name || source.name || legacy.name || ''), phone: String(source.phone || ''), email: String(source.email || ''), summary: String(source.summary || [legacy.activity, legacy.action, legacy.result].filter(Boolean).join('；')), skills: Array.isArray(source.skills) ? source.skills.map(String) : splitItems(legacy.skills || ''), target_titles: Array.isArray(source.target_titles) ? source.target_titles.map(String) : splitItems(String(source.target || legacy.target || '')), preferences: { locations: Array.isArray(preferences.locations) ? preferences.locations.map(String) : splitItems(String(source.city || legacy.city || '')), salary_expectation: String(preferences.salary_expectation || ''), travel_preference: String(preferences.travel_preference || 'unspecified'), availability: String(preferences.availability || '') }, assets }
    const jobs = Array.isArray(value.jobs) ? value.jobs.map(item => {
      const old = item as Record<string, unknown>; const description = String(old.description || '')
      if (!String(old.title || '').trim() || !description.trim()) return null
      const analysis = buildAnalysis(profile, { title: String(old.title), company_name: String(old.company_name || old.company || ''), location: String(old.location || ''), salary: String(old.salary || ''), description })
      const title = String(old.title); const company_name = String(old.company_name || old.company || ''); const location = String(old.location || ''); const salary = String(old.salary || ''); const matched_skills = Array.isArray(old.matched_skills) ? old.matched_skills.map(String) : Array.isArray(old.tags) ? old.tags.map(String) : analysis.matched_skills
      const currentReview = reviewEngineeringMaterials(profile, { title, company_name, location, salary, description, matched_skills })
      const kits = Array.isArray(old.kits) ? old.kits.map(item => { const kit = item as Partial<Kit>; return { ...kit, id: String(kit.id || crypto.randomUUID()), version_no: Number(kit.version_no || 1), resume_content: String(kit.resume_content || ''), cover_letter_content: String(kit.cover_letter_content || ''), ats_content: String(kit.ats_content || ''), basis: Array.isArray(kit.basis) ? kit.basis.map(value => ({ claim: String((value as Record<string, unknown>).claim || '') })).filter(value => value.claim) : [], review: kit.review && 'hr_review' in kit.review ? kit.review : currentReview } as Kit }) : []
      const savedDraft = old.draft as Job['draft'] | undefined
      const draft = savedDraft && !legacyInternalOutputPattern.test(String(savedDraft.content || '')) ? savedDraft : undefined
      return { id: String(old.id || crypto.randomUUID()), title, company_name, source_url: String(old.source_url || ''), location, salary, description, notes: String(old.notes || ''), status: old.status === 'applied' ? 'applied' : old.status === 'saved' ? 'saved' : 'ready', match_score: typeof old.match_score === 'number' ? old.match_score : typeof old.score === 'number' ? old.score : analysis.match_score, matched_skills, analysis_summary: String(old.analysis_summary || analysis.analysis_summary), decision: old.decision as Decision || analysis.decision, draft, kits, outcome: old.outcome as Job['outcome'], follow_up_at: String(old.follow_up_at || '') } as Job
    }).filter((item): item is Job => Boolean(item)) : []
    const betaSource = value.beta && typeof value.beta === 'object' ? value.beta as Record<string, unknown> : {}
    const checklistSource = betaSource.checklist && typeof betaSource.checklist === 'object' ? betaSource.checklist as Record<string, unknown> : {}
    const feedback = Array.isArray(betaSource.feedback) ? betaSource.feedback.map(item => {
      const entry = item as Record<string, unknown>
      const kind = ['bug', 'usability', 'material_quality', 'word_pdf', 'suggestion'].includes(String(entry.kind)) ? String(entry.kind) as BetaFeedbackKind : 'bug'
      const severity = ['blocker', 'high', 'normal', 'idea'].includes(String(entry.severity)) ? String(entry.severity) as BetaFeedbackSeverity : 'normal'
      return { id: String(entry.id || crypto.randomUUID()), created_at: String(entry.created_at || ''), kind, severity, title: String(entry.title || '').slice(0, 140), steps: String(entry.steps || '').slice(0, 1800), expected: String(entry.expected || '').slice(0, 1200), actual: String(entry.actual || '').slice(0, 1200) }
    }).filter(entry => entry.title) : []
    const beta: BetaState = { tester_id: String(betaSource.tester_id || ''), started_at: String(betaSource.started_at || ''), checklist: { profile: checklistSource.profile === true, job: checklistSource.job === true, material: checklistSource.material === true, visual: checklistSource.visual === true }, feedback }
    return { version: 2, profile, jobs, beta }
  } catch { return { version: 2, profile: blankProfile, jobs: [], beta: createBetaState() } }
}

export default function PublicStartPage() {
  const [store, setStore] = useState<Store>({ version: 2, profile: blankProfile, jobs: [] })
  const [profileDraft, setProfileDraft] = useState<Profile>(blankProfile)
  const [skillsInput, setSkillsInput] = useState('')
  const [targetTitlesInput, setTargetTitlesInput] = useState('')
  const [locationsInput, setLocationsInput] = useState('')
  const [jobForm, setJobForm] = useState(blankJob)
  const [page, setPage] = useState<PublicPage>('workspace')
  const [notice, setNotice] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState('')
  const [panes, setPanes] = useState<Record<string, Pane>>({})
  const [kitPanes, setKitPanes] = useState<Record<string, 'resume' | 'letter'>>({})
  const [duplicates, setDuplicates] = useState<Job[]>([])
  const [now, setNow] = useState(() => new Date())
  const backupInputRef = useRef<HTMLInputElement>(null)
  const resumeTemplateInputRef = useRef<HTMLInputElement>(null)
  const resumePhotoInputRef = useRef<HTMLInputElement>(null)
  const [resumeTemplate, setResumeTemplate] = useState<File | null>(null)
  const [resumePhoto, setResumePhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [exportingJobId, setExportingJobId] = useState<string | null>(null)
  useEffect(() => {
    queueMicrotask(() => {
      const next = readStore()
      setStore(next)
      setProfileDraft(next.profile)
      setSkillsInput(next.profile.skills.join(', '))
      setTargetTitlesInput(next.profile.target_titles.join(', '))
      setLocationsInput(next.profile.preferences.locations.join(', '))
    })
  }, [])
  useEffect(() => {
    const syncPageFromHash = () => setPage(pageFromHash(window.location.hash))
    syncPageFromHash()
    window.addEventListener('hashchange', syncPageFromHash)
    return () => window.removeEventListener('hashchange', syncPageFromHash)
  }, [])
  useEffect(() => () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl) }, [photoPreviewUrl])
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }, [page])
  const save = (next: Store) => { setStore(next); window.localStorage.setItem(storageKey, JSON.stringify(next)) }
  const updateJob = (id: string, update: (job: Job) => Job) => save({ ...store, jobs: store.jobs.map(job => job.id === id ? update(job) : job) })
  const beta = store.beta || createBetaState()
  const updateBeta = (update: (current: BetaState) => BetaState) => save({ ...store, beta: update(beta) })
  const today = useMemo(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(now), [now])
  const clock = useMemo(() => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now), [now])
  const applied = store.jobs.filter(job => job.status === 'applied').length; const ready = store.jobs.filter(job => job.status === 'ready').length
  const profileReadiness = materialReadiness({ ...profileDraft, skills: splitItems(skillsInput), target_titles: splitItems(targetTitlesInput), preferences: { ...profileDraft.preferences, locations: splitItems(locationsInput) } }, '')
  const navigate = (next: PublicPage) => {
    const hash = `#${next}`
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    setPage(next)
    setNotice('')
  }
  const saveProfile = () => { const profile = { ...profileDraft, skills: splitItems(skillsInput), target_titles: splitItems(targetTitlesInput), preferences: { ...profileDraft.preferences, locations: splitItems(locationsInput) } }; setProfileDraft(profile); save({ ...store, profile }); setNotice('求职画像与工作偏好已更新，之后的匹配会以它为准。') }
  const exportBackup = () => { const content = JSON.stringify({ ...store, exported_at: new Date().toISOString(), product: 'ZAOTU_LOCAL_BACKUP' }, null, 2); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = `造途_本地资料备份_${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000); setNotice('本地资料备份已下载；请妥善保存，其中包含你填写的求职资料和职位记录。') }
  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 2 * 1024 * 1024) { setNotice('备份文件超过 2MB，已拒绝导入。'); return }; try { const candidate = JSON.parse(await file.text()) as Record<string, unknown>; if (candidate.version !== 2 || !candidate.profile || typeof candidate.profile !== 'object' || !Array.isArray(candidate.jobs)) throw new Error('invalid backup'); if (!window.confirm('恢复备份会替换当前浏览器中的造途画像、职位、材料和投递记录。是否继续？')) return; window.localStorage.setItem(storageKey, JSON.stringify({ version: 2, profile: candidate.profile, jobs: candidate.jobs })); const next = readStore(); setStore(next); setProfileDraft(next.profile); setSkillsInput(next.profile.skills.join(', ')); setTargetTitlesInput(next.profile.target_titles.join(', ')); setLocationsInput(next.profile.preferences.locations.join(', ')); setPanes({}); setKitPanes({}); setDuplicates([]); setNotice(`已恢复备份：${next.jobs.length} 条职位记录。`) } catch { setNotice('无法识别该备份文件。请选择由造途导出的 JSON 备份。') } }
  const refresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setNotice('正在读取最新职业资料并重新分析全部职位…')
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
    const profile = { ...profileDraft, skills: splitItems(skillsInput), target_titles: splitItems(targetTitlesInput), preferences: { ...profileDraft.preferences, locations: splitItems(locationsInput) } }
    const previousScores = new Map(store.jobs.map(job => [job.id, job.match_score]))
    const jobs = store.jobs.map(job => ({ ...job, ...buildAnalysis(profile, job) }))
    const changed = jobs.filter(job => previousScores.get(job.id) !== job.match_score).length
    const confirmed = profile.assets.filter(asset => asset.confirmed).length
    const refreshedAt = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
    setProfileDraft(profile)
    save({ ...store, profile, jobs })
    setLastRefresh(refreshedAt)
    setIsRefreshing(false)
    setNotice(jobs.length === 0 ? `刷新完成（${refreshedAt}）：当前还没有职位。` : confirmed === 0 ? `刷新完成（${refreshedAt}）：已重算 ${jobs.length} 条职位；当前没有“本人确认”的职业资产，所以匹配度不会明显提高。请先到“职业资料”补充。` : `刷新完成（${refreshedAt}）：已重算 ${jobs.length} 条职位，${changed ? `${changed} 条分数发生变化` : '分数未变化，说明当前资料与上次一致'}。`)
  }
  const addJob = (event: FormEvent, confirmSimilar = false) => { event.preventDefault(); if (!jobForm.title.trim() || !jobForm.company_name.trim() || !jobForm.description.trim()) { setNotice('请填写职位名称、公司名称和完整 JD。'); return }; const title = normalize(jobForm.title); const company = normalize(jobForm.company_name); const url = normalize(jobForm.source_url); const same = store.jobs.filter(job => (url && normalize(job.source_url) === url) || (normalize(job.title) === title && normalize(job.company_name) === company)); if (same.length && !confirmSimilar) { setDuplicates(same); setNotice('发现疑似重复职位。请查看已有记录，或确认后保留为独立机会。'); return }; const job: Job = { id: crypto.randomUUID(), ...jobForm, status: 'ready', ...buildAnalysis(store.profile, jobForm), kits: [] }; save({ ...store, jobs: [job, ...store.jobs] }); setJobForm(blankJob); setDuplicates([]); setNotice('职位已保存，并完成初步匹配。') }
  const deleteJob = (job: Job) => { if (!window.confirm(`删除本地职位“${job.title} · ${job.company_name}”？\n\n这会删除造途中的职位、草稿、材料和跟进记录；不会撤回招聘平台上的真实投递。`)) return; save({ ...store, jobs: store.jobs.filter(item => item.id !== job.id) }); setNotice('本地职位记录已删除。') }
  const makeDraft = (job: Job, variant: Variant) => {
    if (!store.profile.assets.some(asset => asset.confirmed)) { setNotice('尚未生成招呼语：请先在“职业资料”新增至少一条本人确认的经历、项目或技能实践。'); return }
    const content = draftFor(store.profile, job, variant)
    if (!content) { setNotice('尚未生成招呼语：当前没有可直接用于该岗位的真实项目证据。'); return }
    updateJob(job.id, item => ({ ...item, draft: { variant, content } }))
    setNotice('已生成可直接发送的岗位招呼语；发送前请只核对事实、称呼和岗位名称。')
  }
  const openPlan = (job: Job) => { const review = reviewEngineeringMaterials(store.profile, job); setPanes(current => ({ ...current, [job.id]: { kind: 'resume', title: '简历策略', summary: `围绕 ${job.title} 的 JD，先完成 HR 与技术主管双视角筛选，再将最强证据置于简历首位。`, evidence: job.decision.evidence, prompts: review.priority.map(item => `${item.tier}级｜${item.item}：${item.action}`), warnings: review.warnings, review } })) }
  const openInterview = (job: Job) => { const prep = composeEngineeringInterview(store.profile, job); setPanes(current => ({ ...current, [job.id]: { kind: 'interview', title: '面试准备', summary: `按“场景—任务—本人动作—工具—验证/复盘”回答 ${job.title} 的技术问题；缺项须如实说明。`, evidence: prep.evidence, prompts: prep.prompts, warnings: prep.review.warnings, review: prep.review } })) }
  const openReview = (job: Job) => { const review = reviewEngineeringMaterials(store.profile, job); setPanes(current => ({ ...current, [job.id]: { kind: 'review', title: 'HR / 技术主管审查', summary: `已完成 ${review.track} 方向的内容预审与二次优化建议。系统只会提升已有真实资产，不补写未确认能力。`, evidence: job.decision.evidence, prompts: review.refinement_actions.map(item => `${item.reviewer}｜发现：${item.finding}｜回写：${item.action}`), warnings: review.warnings, review } })) }
  const openKit = (job: Job, refreshKit = false) => {
    const readiness = materialReadiness(store.profile, job.title)
    if (!readiness.ready) {
      const review = reviewEngineeringMaterials(store.profile, job)
      setPanes(current => ({ ...current, [job.id]: {
        kind: 'review', title: '材料生成前检查',
        summary: '当前资料不足以生成可投递的正式简历，因此系统已停止输出占位内容。补齐并确认以下真实资料后，再生成岗位专属材料。',
        evidence: [], prompts: readiness.missing.map(item => `请补充：${item}`),
        warnings: ['JD 可以先用于匹配和 HR / 技术主管审查；但不能替代你的真实职业资料。', ...review.warnings], review,
      } }))
      setNotice(`尚未生成简历：请先补齐 ${readiness.missing.join('、')}。`)
      return
    }
    let kit = !refreshKit && job.kits[0] && !legacyInternalOutputPattern.test(`${job.kits[0].resume_content}\n${job.kits[0].cover_letter_content}`) ? job.kits[0] : undefined
    if (!kit) {
      kit = kitFor(store.profile, job, (job.kits[0]?.version_no || 0) + 1)
      updateJob(job.id, item => ({ ...item, kits: [kit!, ...item.kits] }))
      setNotice(refreshKit ? '已按最新资产与双视角审查生成新版；旧版本仍保留在此浏览器。' : '已生成岗位材料，并完成 HR / 技术主管双视角审查。')
    }
    setKitPanes(current => ({ ...current, [job.id]: current[job.id] || 'resume' }))
    setPanes(current => ({ ...current, [job.id]: { kind: 'application', title: `投递材料 · V${kit.version_no}`, summary: '以下内容可用于简历、ATS 和岗位沟通；全部只来自本人确认资产。内部审查信息不会写入复制内容、DOCX 或 ATS。', evidence: kit.basis.map(item => item.claim), prompts: kit.review.refinement_actions.map(item => `${item.reviewer}：${item.action}`), warnings: kit.review.warnings, kit, review: kit.review } }))
  }
  const copy = async (content: string, label: string) => { try { await navigator.clipboard.writeText(content); setNotice(`${label}已复制。请核对事实后自行编辑、排版和投递。`) } catch { setNotice('复制失败，请手动选择文本复制。') } }
  const exportKit = async (job: Job, kit: Kit) => {
    const readiness = materialReadiness(store.profile, job.title)
    if (!readiness.ready) { setNotice(`未导出正式简历：请先补齐 ${readiness.missing.join('、')}。`); return }
    if (resumeTemplate && resumePhoto) { setNotice('当前自定义 DOCX 模板无法可靠定位证件照。请切回“造途工程技术正式版”后导出含照片简历，或在 Word 中自行调整模板。'); return }
    if (exportingJobId === job.id) return
    setExportingJobId(job.id)
    try {
      const payload = { profile: toFormalProfile(store.profile, job.title, Boolean(resumePhoto)), job: { title: job.title, company_name: job.company_name, location: job.location, salary: job.salary, description: job.description } }
      const response = resumeTemplate
        ? await (() => { const body = new FormData(); body.append('payload', JSON.stringify(payload)); body.append('template', resumeTemplate); return fetch(`${formalApiBase}/public/guest/profile/materials/docx/template`, { method: 'POST', body }) })()
        : resumePhoto
          ? await (() => { const body = new FormData(); body.append('payload', JSON.stringify(payload)); body.append('photo', resumePhoto); return fetch(`${formalApiBase}/public/guest/profile/materials/docx/photo`, { method: 'POST', body }) })()
        : await fetch(`${formalApiBase}/public/guest/profile/materials/docx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(detail.detail || '正式 Word 服务暂时不可用')
      }
      const blob = await response.blob()
      if (!blob.size) throw new Error('正式 Word 文件为空')
      downloadBlob(blob, `造途_${job.title}_岗位专属简历_V${kit.version_no}.docx`)
      setNotice(resumeTemplate ? `已按“${resumeTemplate.name}”填充并下载 DOCX。请用 Word 打开后核对所有占位内容与一页排版，再另存为 PDF。` : resumePhoto ? '已下载含本人证件照的默认正式 DOCX。请重点核对照片裁切、姓名、段落与一页排版，再另存为 PDF。' : '已下载可编辑的工程技术正式版 DOCX。请用 Word 打开后核对一页排版，再使用“另存为 PDF”生成最终投递版。')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setNotice(`正式 DOCX 未生成（${message}）。系统没有输出含占位符的草稿，请稍后重试并保留当前真实资料。`)
    } finally {
      setExportingJobId(null)
    }
  }
  const markApplied = (job: Job) => { updateJob(job.id, item => ({ ...item, status: 'applied', outcome: item.outcome || { status: 'applied', note: '' } })); setNotice('已记录为“已投递”。') }

  const updateAssets = (assets: CareerAsset[]) => { const profile = { ...profileDraft, assets }; setProfileDraft(profile); save({ ...store, profile }); setNotice('职业资产库已保存；之后的匹配和材料只会使用本人确认的资产。') }
  const applyImportedDraft = (draft: ResumeImportDraft) => {
    const currentSkills = splitItems(skillsInput)
    const mergedSkills = Array.from(new Set([...currentSkills, ...draft.skills]))
    const profile = {
      ...profileDraft,
      display_name: profileDraft.display_name.trim() || draft.profile.display_name,
      phone: profileDraft.phone.trim() || draft.profile.phone,
      email: profileDraft.email.trim() || draft.profile.email,
      skills: mergedSkills,
      assets: [...profileDraft.assets, ...draft.assets.map(asset => ({ ...asset, id: crypto.randomUUID(), confirmed: false }))],
    }
    setProfileDraft(profile)
    setSkillsInput(mergedSkills.join(', '))
    save({ ...store, profile })
    setNotice(`已从“${draft.sourceName}”加入 ${draft.assets.length} 条待确认资产；现有资料未被覆盖。请在资产库逐条核对并勾选“本人确认”。`)
  }
  const chooseTemplate = (file: File | null) => { if (!file) return; if (!file.name.toLowerCase().endsWith('.docx')) { setNotice('自定义模板目前只支持 .docx；PDF 只能作为视觉参考，不能直接套版。'); return }; if (file.size > 2 * 1024 * 1024) { setNotice('自定义 DOCX 模板不能超过 2MB。'); return }; setResumeTemplate(file); setNotice(`已选择“${file.name}”。模板仅在当前浏览器标签页暂存，导出时在服务端内存中处理，不会保存到服务器。`) }
  const clearResumePhoto = () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); setPhotoPreviewUrl(''); setResumePhoto(null); setNotice('已移除本次会话的证件照；不会影响已保存的职业资料。') }
  const chooseResumePhoto = (file: File | null) => { if (!file) return; if (!['image/jpeg', 'image/png'].includes(file.type)) { setNotice('证件照仅支持 JPG 或 PNG。'); return }; if (file.size > 2 * 1024 * 1024) { setNotice('证件照不能超过 2MB。'); return }; if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); setResumePhoto(file); setPhotoPreviewUrl(URL.createObjectURL(file)); setNotice('已选择证件照：仅在当前浏览器标签页和本次默认 Word 导出中使用，不会保存到服务器或备份文件。') }
  const startBeta = () => {
    if (beta.started_at) { setNotice(`当前浏览器已加入封测，测试编号为 ${beta.tester_id}。`); return }
    const testerId = `ZT-${Math.random().toString(36).slice(2, 7).toUpperCase()}-${new Date().toISOString().slice(5, 10).replace('-', '')}`
    updateBeta(current => ({ ...current, tester_id: testerId, started_at: new Date().toISOString() }))
    setNotice(`已开启封测任务。你的匿名测试编号是 ${testerId}，不会关联姓名、简历或 JD 内容。`)
  }
  const updateBetaChecklist = (key: keyof BetaState['checklist'], checked: boolean) => updateBeta(current => ({ ...current, checklist: { ...current.checklist, [key]: checked } }))
  const addBetaFeedback = (draft: Omit<BetaFeedback, 'id' | 'created_at'>) => {
    const entry: BetaFeedback = { ...draft, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    updateBeta(current => ({ ...current, feedback: [entry, ...current.feedback] }))
    setNotice('反馈已只保存在当前浏览器。完成后请下载或复制“匿名反馈包”发送给邀请你的测试负责人。')
  }
  const deleteBetaFeedback = (id: string) => { if (!window.confirm('删除这条本地反馈？删除后无法恢复。')) return; updateBeta(current => ({ ...current, feedback: current.feedback.filter(item => item.id !== id) })); setNotice('已删除本地反馈。') }
  const betaPacket = () => JSON.stringify({ product: 'ZAOTU', version: betaVersion, tester_id: beta.tester_id || '未启动封测', exported_at: new Date().toISOString(), checklist: beta.checklist, feedback: beta.feedback, privacy: '不包含职业资料、联系方式、JD、简历文本、Word 文件或其他求职内容。' }, null, 2)
  const exportBetaPacket = () => { downloadBlob(new Blob([betaPacket()], { type: 'application/json' }), `造途_匿名封测反馈包_${beta.tester_id || '未启动'}_${new Date().toISOString().slice(0, 10)}.json`); setNotice('匿名反馈包已下载：其中不含你的职业资料、JD 或简历内容。') }

  return <div className="job-shell">
    <ZaotuMobileNavigation page={page} jobs={store.jobs.length} feedbackCount={beta.feedback.length} onNavigate={navigate} />
    <ShowcaseSidebar brand="造途 · ZAOTU" subtitle="ENGINEERING CAREER OS" homeHref="#workspace" homeLabel="返回造途工作台" brandStyle="zaotu" navigation={[
      { href: '#workspace', label: '工作台', icon: BiGridAlt, active: page === 'workspace', onNavigate: () => navigate('workspace') },
      { href: '#profile', label: '职业资料', icon: BiUser, active: page === 'profile', onNavigate: () => navigate('profile') },
      { href: '#templates', label: '简历模板', icon: BiFile, active: page === 'templates', onNavigate: () => navigate('templates') },
      { href: '#opportunities', label: '职位机会', icon: BiBriefcaseAlt2, active: page === 'opportunities', count: store.jobs.length, onNavigate: () => navigate('opportunities') },
      { href: '#applications', label: '投递复盘', icon: BiHistory, active: page === 'applications', onNavigate: () => navigate('applications') },
      { href: '#beta', label: '封测中心', icon: BiClipboard, active: page === 'beta', count: beta.feedback.length || undefined, onNavigate: () => navigate('beta') },
    ]} captureHref="#capture" onCapture={() => { navigate('workspace'); window.setTimeout(() => document.getElementById('capture')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 50) }} privacy="资料默认保存在此浏览器；导出 Word 时仅一次性内存处理，不作长期保存。" />
    <main className="job-main">
      {page === 'workspace' && <>
        <header className="job-page-header"><div><span className="job-eyebrow">CAREER INTELLIGENCE · LOCAL FIRST</span><h1 className="job-page-title">MAKE THE NEXT MOVE COUNT.</h1></div></header>
        <ShowcaseHero actions={<>{profileReadiness.ready ? <a href="#capture" className="job-primary-btn"><BiPlus />添加职位</a> : <button className="job-primary-btn" onClick={() => navigate('profile')}><BiUser />先完善职业资料</button>}<button className="job-secondary-btn" onClick={() => navigate('opportunities')}>查看机会 <BiArrowToRight /></button></>} dateLabel={today} timeLabel={clock} metrics={[{ value: store.jobs.length, label: 'SAVED' }, { value: ready, label: 'REVIEW' }, { value: applied, label: 'APPLIED' }]} nextMove={profileReadiness.ready ? (ready ? 'REVIEW OPEN OPPORTUNITIES' : 'CAPTURE YOUR NEXT OPPORTUNITY') : 'COMPLETE YOUR CAREER PROFILE'} />
        {notice && <div className="job-notice" role="status" aria-live="polite">{notice}</div>}
        {!profileReadiness.ready && <section className="job-section job-onboarding-gate" aria-label="开始前准备"><div><span className="job-eyebrow">FIRST STEP</span><h2>先完成职业资料，再生成可投递材料</h2><p>职位 JD 可以随时先保存；但正式 Word 只会使用你本人确认的技能与经历。当前还差：{profileReadiness.missing.slice(0, 3).join('、')}。</p></div><button className="job-primary-btn" type="button" onClick={() => navigate('profile')}>去完善资料 <BiArrowToRight /></button></section>}
        <section id="capture" className="job-section">
          <div className="job-section-head"><div><h2 className="job-section-title">捕获一个机会</h2><p className="job-section-note">粘贴完整 JD；系统会用你在“职业资料”中确认的证据分析并生成材料。</p></div></div>
          <div className="job-import-grid">
            <form className="job-panel job-form" onSubmit={event => addJob(event)}>
              <div className="job-form-top"><div className="job-form-title">职位速记</div><span className="job-form-hint">职位名称、公司和完整 JD 必填</span></div>
              <div className="job-form-row"><Field label="职位名称 *" value={jobForm.title} onChange={value => setJobForm({ ...jobForm, title: value })} placeholder="例如：自动化工程师" required /><Field label="公司名称 *" value={jobForm.company_name} onChange={value => setJobForm({ ...jobForm, company_name: value })} placeholder="公司名称" required /></div>
              <Field label="职位链接（可选，用于去重）" value={jobForm.source_url} onChange={value => setJobForm({ ...jobForm, source_url: value })} placeholder="https://..." type="url" />
              <div className="job-form-row"><Field label="地点" value={jobForm.location} onChange={value => setJobForm({ ...jobForm, location: value })} placeholder="深圳 / 远程" /><Field label="薪资" value={jobForm.salary} onChange={value => setJobForm({ ...jobForm, salary: value })} placeholder="20–30K" /></div>
              <Field label="职位描述 *" value={jobForm.description} onChange={value => setJobForm({ ...jobForm, description: value })} placeholder="粘贴完整岗位职责与任职要求…" textarea required />
              <Field label="个人备注（可选）" value={jobForm.notes} onChange={value => setJobForm({ ...jobForm, notes: value })} placeholder="例如：来源、投递计划、想重点确认的问题" textarea />
              <div className="job-focus-actions"><button className="job-primary-btn" type="submit"><BiPlus />保存并分析</button></div>
              {duplicates.length > 0 && <div className="job-duplicate"><strong>疑似已保存</strong>{duplicates.map(item => <p key={item.id}>{item.title} · {item.company_name}</p>)}<div className="job-card-actions"><button type="button" className="job-muted-btn" onClick={() => navigate('opportunities')}>查看已有记录</button><button type="button" className="job-muted-btn" onClick={() => setDuplicates([])}>返回编辑</button><button type="button" className="job-primary-btn !min-h-[33px] !text-xs" onClick={() => addJob({ preventDefault: () => undefined } as FormEvent, true)}>仍保存为独立职位</button></div></div>}
            </form>
            <div className="job-panel job-profile-preview job-flow-guide">
              <div className="job-form-top"><div className="job-form-title">第一次使用，按这 3 步</div><span className="job-form-hint">每一步都可随时回来修改</span></div>
              <button type="button" onClick={() => navigate('profile')}><b>01</b><span><strong>完善职业资料</strong><small>填写联系方式、目标方向和真实职业资产</small></span><BiArrowToRight /></button>
              <button type="button" onClick={() => navigate('templates')}><b>02</b><span><strong>确认简历模板</strong><small>默认版已对齐一页式工程技术简历质量</small></span><BiArrowToRight /></button>
              <button type="button" onClick={() => document.getElementById('capture')?.scrollIntoView({ behavior: 'smooth' })}><b>03</b><span><strong>粘贴完整 JD</strong><small>生成匹配、双审查、简历、ATS 与沟通材料</small></span><BiArrowToRight /></button>
              <p className="job-card-copy">当前完整度：{profileDraft.assets.filter(asset => asset.confirmed).length} 条已确认资产 · {profileDraft.skills.length} 项已保存技能。</p>
            </div>
          </div>
        </section>
        <section id="opportunities" className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">机会雷达</h2><p className="job-section-note">只收录你主动保存的职位；刷新会自动保存当前职业资料并重新计算匹配度。{lastRefresh && ` 最近刷新：${lastRefresh}`}</p></div><button className="job-link-btn" onClick={() => void refresh()} disabled={isRefreshing} aria-busy={isRefreshing}><BiRefresh className={isRefreshing ? 'job-refresh-spin' : ''} />{isRefreshing ? '正在重新分析…' : '按最新资料刷新'}</button></div>{store.jobs.length === 0 ? <Empty text="第一条机会，会从这里开始。" /> : <div className="grid gap-3">{store.jobs.map(job => <WorkspaceCard key={job.id} job={job} pane={panes[job.id]} activePane={kitPanes[job.id] || 'resume'} isExporting={exportingJobId === job.id} onClose={() => setPanes(current => { const next = { ...current }; delete next[job.id]; return next })} onPaneChange={value => setKitPanes(current => ({ ...current, [job.id]: value }))} onDraft={makeDraft} onPlan={openPlan} onInterview={openInterview} onReview={openReview} onKit={openKit} onCopy={copy} onExport={exportKit} onApplied={markApplied} onDelete={deleteJob} onFollowUp={value => updateJob(job.id, item => ({ ...item, follow_up_at: value }))} />)}</div>}</section>
      </>}
      {page === 'profile' && <div className="job-shell">
        <header><span className="job-eyebrow">CAREER EVIDENCE</span><h1 className="job-page-title">职业资料</h1><p className="job-subtitle">先建立真实、可追问的证据底座；只有“本人确认”的资产会进入匹配与正式材料。</p></header>
        {notice && <div className="job-notice">{notice}</div>}
        <section className="job-section"><div className="job-import-grid">
          <div className="job-panel job-form"><div className="job-form-top"><div className="job-form-title">求职画像与联系方式</div><span className="job-form-hint">正式导出前至少填写一种联系方式</span></div>
            <div className="job-form-row"><Field label="称呼 *" value={profileDraft.display_name} onChange={value => setProfileDraft({ ...profileDraft, display_name: value })} placeholder="如何称呼你" /><Field label="目标岗位方向 *" value={targetTitlesInput} onChange={setTargetTitlesInput} placeholder="自动化工程师、机器视觉工程师" /></div>
            <div className="job-form-row"><Field label="手机（与邮箱至少填一项）" value={profileDraft.phone} onChange={value => setProfileDraft({ ...profileDraft, phone: value })} placeholder="用于正式简历" /><Field label="邮箱（与手机至少填一项）" value={profileDraft.email} onChange={value => setProfileDraft({ ...profileDraft, email: value })} placeholder="用于正式简历" type="email" /></div>
            <ResumePhotoField photo={resumePhoto} previewUrl={photoPreviewUrl} inputRef={resumePhotoInputRef} onChoose={chooseResumePhoto} onClear={clearResumePhoto} />
            <Field label="职业概况" value={profileDraft.summary} onChange={value => setProfileDraft({ ...profileDraft, summary: value })} placeholder="真实方向、经历、项目、工具和可展示成果" textarea />
            <Field label="技能标签 *" value={skillsInput} onChange={setSkillsInput} placeholder="Python, PLC, 机器视觉（至少 3 项）" textarea />
            <div className="job-form-row"><Field label="优先地点" value={locationsInput} onChange={setLocationsInput} placeholder="深圳、广州" /><Field label="薪资预期" value={profileDraft.preferences.salary_expectation} onChange={value => setProfileDraft({ ...profileDraft, preferences: { ...profileDraft.preferences, salary_expectation: value } })} placeholder="例如：12–18K（可留空）" /></div>
            <div className="job-form-row"><div className="job-field"><label>出差 / 驻场倾向</label><select className="job-select" value={profileDraft.preferences.travel_preference} onChange={event => setProfileDraft({ ...profileDraft, preferences: { ...profileDraft.preferences, travel_preference: event.target.value } })}><option value="unspecified">暂不设限制</option><option value="open">可接受出差 / 驻场</option><option value="limited">可短期出差，需提前确认</option><option value="not_preferred">尽量不长期出差 / 驻场</option></select></div><Field label="到岗信息" value={profileDraft.preferences.availability} onChange={value => setProfileDraft({ ...profileDraft, preferences: { ...profileDraft.preferences, availability: value } })} placeholder="例如：两周内 / 可协商" /></div>
            <div className="job-focus-actions"><button className="job-primary-btn" type="button" onClick={saveProfile}><BiCheck />保存职业资料</button><button className="job-muted-btn" type="button" onClick={exportBackup}><BiDownload />备份资料</button><button className="job-muted-btn" type="button" onClick={() => backupInputRef.current?.click()}><BiUpload />恢复备份</button><input ref={backupInputRef} className="hidden" type="file" accept="application/json,.json" onChange={event => void restoreBackup(event)} /></div>
          </div>
          <div className="job-panel job-profile-preview"><div className="job-form-top"><div className="job-form-title">正式材料门槛</div><span className="job-form-hint">当前实时检查</span></div>{materialReadiness({ ...profileDraft, skills: splitItems(skillsInput), target_titles: splitItems(targetTitlesInput) }, '').ready ? <div className="job-readiness-ready"><BiCheck /><strong>资料已达到生成门槛</strong><p>还会针对每个 JD 执行 HR / 技术主管双审和最终视觉核对。</p></div> : <div className="job-readiness-list"><strong>还需补齐</strong>{materialReadiness({ ...profileDraft, skills: splitItems(skillsInput), target_titles: splitItems(targetTitlesInput) }, '').missing.map(item => <p key={item}>• {item}</p>)}</div>}</div>
        </div></section>
        <ResumeImportPanel onApply={applyImportedDraft} />
        <AssetLibrary assets={profileDraft.assets} onChange={updateAssets} />
      </div>}
      {page === 'templates' && <div className="job-shell"><header><span className="job-eyebrow">RESUME SYSTEM</span><h1 className="job-page-title">简历模板</h1><p className="job-subtitle">默认模板已按一页式工程技术简历重构；你也可以临时导入自己的 DOCX 版式。</p></header>{notice && <div className="job-notice">{notice}</div>}<ResumeTemplatePicker file={resumeTemplate} inputRef={resumeTemplateInputRef} onChoose={chooseTemplate} onClear={() => { setResumeTemplate(null); setNotice('已切回造途工程技术正式版。') }} /></div>}
      {page === 'opportunities' && <Opportunities jobs={store.jobs} notice={notice} lastRefresh={lastRefresh} isRefreshing={isRefreshing} onRefresh={() => void refresh()} onOpen={() => navigate('workspace')} onDelete={deleteJob} />}
      {page === 'applications' && <Applications jobs={store.jobs.filter(job => job.status === 'applied')} notice={notice} onRefresh={() => setNotice('已刷新本地投递记录。')} onOpen={() => navigate('workspace')} onDelete={deleteJob} onOutcome={(id, status, note) => updateJob(id, job => ({ ...job, outcome: { status, note } }))} />}
      {page === 'beta' && <BetaCenter beta={beta} onStart={startBeta} onChecklist={updateBetaChecklist} onSubmitFeedback={addBetaFeedback} onDeleteFeedback={deleteBetaFeedback} onCopyPacket={() => void copy(betaPacket(), '匿名反馈包')} onDownloadPacket={exportBetaPacket} />}
    </main>
  </div>
}

function ZaotuMobileNavigation({ page, jobs, feedbackCount, onNavigate }: { page: PublicPage; jobs: number; feedbackCount: number; onNavigate: (page: PublicPage) => void }) {
  const [open, setOpen] = useState(false)
  const entries = [
    { page: 'workspace' as const, label: '工作台', icon: BiGridAlt },
    { page: 'profile' as const, label: '职业资料', icon: BiUser },
    { page: 'templates' as const, label: '简历模板', icon: BiFile },
    { page: 'opportunities' as const, label: '职位机会', icon: BiBriefcaseAlt2, count: jobs },
    { page: 'applications' as const, label: '投递复盘', icon: BiHistory },
    { page: 'beta' as const, label: '封测中心', icon: BiClipboard, count: feedbackCount },
  ]
  const current = entries.find(item => item.page === page) || entries[0]
  const CurrentIcon = current.icon
  const select = (next: PublicPage) => { onNavigate(next); setOpen(false) }
  return <nav className="zaotu-mobile-navigation" aria-label="造途移动端导航">
    <div className="zaotu-mobile-topbar"><button type="button" className="zaotu-mobile-brand" onClick={() => select('workspace')} aria-label="返回造途工作台"><span>ZT</span><b>造途 ZAOTU</b></button><span className="zaotu-mobile-current"><CurrentIcon />{current.label}</span><button type="button" className="zaotu-mobile-menu" aria-label={open ? '关闭导航' : '打开导航'} aria-expanded={open} aria-controls="zaotu-mobile-menu" onClick={() => setOpen(value => !value)}>{open ? <BiX /> : <BiMenu />}</button></div>
    {open && <div id="zaotu-mobile-menu" className="zaotu-mobile-sheet">{entries.map(item => { const Icon = item.icon; return <button type="button" key={item.page} className={page === item.page ? 'is-active' : ''} onClick={() => select(item.page)}><Icon /><span>{item.label}</span>{item.count ? <em>{item.count}</em> : null}</button> })}</div>}
  </nav>
}

function BetaCenter({ beta, onStart, onChecklist, onSubmitFeedback, onDeleteFeedback, onCopyPacket, onDownloadPacket }: { beta: BetaState; onStart: () => void; onChecklist: (key: keyof BetaState['checklist'], checked: boolean) => void; onSubmitFeedback: (draft: Omit<BetaFeedback, 'id' | 'created_at'>) => void; onDeleteFeedback: (id: string) => void; onCopyPacket: () => void; onDownloadPacket: () => void }) {
  const [kind, setKind] = useState<BetaFeedbackKind>('bug')
  const [severity, setSeverity] = useState<BetaFeedbackSeverity>('normal')
  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const completeCount = Object.values(beta.checklist).filter(Boolean).length
  const tasks: Array<{ key: keyof BetaState['checklist']; title: string; detail: string }> = [
    { key: 'profile', title: '建立真实职业资料', detail: '填写至少 3 项实际接触的技能，并新增一条本人确认的经历、项目或实训资产。' },
    { key: 'job', title: '粘贴一条真实或公开 JD', detail: '保存后检查匹配线索、机会雷达刷新和 HR / 技术主管审查是否看得懂。' },
    { key: 'material', title: '生成并下载正式 Word', detail: '资料达到门槛后，生成岗位材料并下载 DOCX；不需要把 Word 文件发给测试负责人。' },
    { key: 'visual', title: '完成 Word / PDF 视觉核对', detail: '用本机 Word 打开 DOCX，核对姓名、段落、分页与一页排版；发现问题只描述现象。' },
  ]
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !actual.trim()) return; onSubmitFeedback({ kind, severity, title: title.trim(), steps: steps.trim(), expected: expected.trim(), actual: actual.trim() }); setTitle(''); setSteps(''); setExpected(''); setActual('') }
  return <div className="job-shell">
    <header><span className="job-eyebrow">CLOSED BETA · LOCAL FIRST</span><h1 className="job-page-title">封测中心</h1><p className="job-subtitle">这是 20 人免费封测版。先完整走一次真实求职材料流程，再用不含简历内容的匿名反馈包反馈问题。</p></header>
    <section className="job-section">
      <div className="job-beta-invite"><div><span>20 PEOPLE · FREE BETA</span><h2>让真实工程经历，被岗位需求看见。</h2><p>面向自动化、PLC 电气、机器视觉、工业软件、嵌入式、机械、测试质量和电力能源方向的学生、应届生与 1–5 年从业者。全程约 20–30 分钟；不代投、不虚构经历、不承诺 offer。</p></div><div className="job-beta-invite-points"><div><b>你会完成</b><span>资料 → JD → 双视角预审 → Word</span></div><div><b>你需要交付</b><span>仅匿名反馈包，不发简历或 JD 原文</span></div></div></div>
      <div className="job-beta-hero"><div><span>当前封测版本</span><strong>{betaVersion}</strong><p>{beta.started_at ? `本浏览器测试编号：${beta.tester_id}` : '尚未启动测试；启动后只会在本浏览器生成一个随机测试编号。'}</p></div><button type="button" className="job-primary-btn" onClick={onStart}>{beta.started_at ? <><BiCheck />已加入封测</> : <><BiPlus />启动我的封测</>}</button></div>
      <div className="job-beta-privacy"><BiCheck /><div><strong>资料如何被处理</strong><p>职业资料、JD 与材料默认保存在当前浏览器。点击生成正式 Word 时，本次所需资料会通过一次性 HTTPS 请求在服务端内存处理并返回 DOCX；不建立账户、不做数据库同步或长期保存。匿名反馈包只含版本、任务勾选与问题描述，不带出求职内容。</p></div></div>
    </section>
    <section className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">四步测试任务</h2><p className="job-section-note">完成 {completeCount}/4 项即可交付第一轮反馈；不需要为了测试而编造任何经历。</p></div><span className="job-score">{completeCount}/4 已完成</span></div><div className="job-beta-tasks">{tasks.map((task, index) => <label key={task.key} className={`job-beta-task ${beta.checklist[task.key] ? 'is-complete' : ''}`}><input type="checkbox" checked={beta.checklist[task.key]} onChange={event => onChecklist(task.key, event.target.checked)} /><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{task.title}</strong><small>{task.detail}</small></span><BiCheck /></label>)}</div></section>
    <section className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">匿名问题记录</h2><p className="job-section-note">优先写可复现问题：在哪个页面、做了什么、预期什么、实际发生什么。不要粘贴姓名、电话、邮箱、完整 JD 或简历正文。</p></div><span className="job-score">{beta.feedback.length} 条本地反馈</span></div><div className="job-import-grid"><form className="job-panel job-form" onSubmit={submit}><div className="job-form-top"><div className="job-form-title">记录一条反馈</div><span className="job-form-hint">仅保存于当前浏览器</span></div><div className="job-form-row"><div className="job-field"><label>反馈类型 *</label><select className="job-select" value={kind} onChange={event => setKind(event.target.value as BetaFeedbackKind)}><option value="bug">功能异常</option><option value="usability">操作不清楚</option><option value="material_quality">材料内容质量</option><option value="word_pdf">Word / PDF 视觉问题</option><option value="suggestion">功能建议</option></select></div><div className="job-field"><label>影响程度 *</label><select className="job-select" value={severity} onChange={event => setSeverity(event.target.value as BetaFeedbackSeverity)}><option value="blocker">阻塞：无法继续</option><option value="high">严重：核心流程受影响</option><option value="normal">一般：可绕开</option><option value="idea">建议：体验优化</option></select></div></div><Field label="一句话标题 *" value={title} onChange={setTitle} placeholder="例如：导出 Word 后第二页出现孤立标题" required /><Field label="复现步骤（建议）" value={steps} onChange={setSteps} placeholder="例如：完成职业资料 → 保存一条职位 → 生成材料 → 点击导出 Word" textarea /><Field label="预期结果（建议）" value={expected} onChange={setExpected} placeholder="例如：简历应保持一页，标题与内容不分离" textarea /><Field label="实际结果 *" value={actual} onChange={setActual} placeholder="只描述现象；请不要粘贴个人资料或完整简历内容" textarea required /><div className="job-focus-actions"><button type="submit" className="job-primary-btn"><BiPlus />保存本地反馈</button></div></form><div className="job-panel job-profile-preview"><div className="job-form-top"><div className="job-form-title">交付给测试负责人</div><span className="job-form-hint">不发送求职内容</span></div><p className="job-card-copy">完成任务后，复制或下载匿名反馈包，再将其发送给邀请你参与封测的人。若涉及视觉问题，可另外附一张已打码的界面截图。</p><div className="job-focus-actions"><button type="button" className="job-muted-btn" onClick={onCopyPacket}><BiCopy />复制匿名反馈包</button><button type="button" className="job-muted-btn" onClick={onDownloadPacket}><BiDownload />下载 JSON 反馈包</button></div><p className="job-card-copy">版本追踪：{betaVersion} · 反馈包仅记录测试编号、时间、任务完成情况与问题描述。</p></div></div>{beta.feedback.length > 0 && <div className="job-beta-feedback-list">{beta.feedback.map(item => <article key={item.id} className="job-resume-focus"><div className="flex items-start justify-between gap-3"><div><b>{({ bug: '功能异常', usability: '操作不清楚', material_quality: '材料内容质量', word_pdf: 'Word / PDF 视觉问题', suggestion: '功能建议' })[item.kind]} · {({ blocker: '阻塞', high: '严重', normal: '一般', idea: '建议' })[item.severity]}</b><p>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</p></div><button type="button" className="job-danger-btn" onClick={() => onDeleteFeedback(item.id)}><BiTrash />删除</button></div><strong>{item.title}</strong><p>{item.actual}</p>{item.steps && <p>步骤：{item.steps}</p>}{item.expected && <p>预期：{item.expected}</p>}</article>)}</div>}</section>
  </div>
}

function ResumeTemplatePicker({ file, inputRef, onChoose, onClear }: { file: File | null; inputRef: RefObject<HTMLInputElement | null>; onChoose: (file: File | null) => void; onClear: () => void }) {
  return <section className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">简历版式</h2><p className="job-section-note">默认使用中性、可编辑的“造途工程技术正式版”；也可以在自己的 DOCX 版式上生成岗位专属内容。</p></div><span className="job-score">{file ? '自定义模板' : '默认模板'}</span></div><div className="job-import-grid"><div className="job-panel job-form"><div className="job-form-top"><div className="job-form-title">造途工程技术正式版</div><span className="job-form-hint">默认启用 · 无个人资料</span></div><p className="job-card-copy">适合自动化、视觉、工业软件、嵌入式、机械、测试质量和电力能源岗位。系统按 JD 重排真实证据，输出内容仅保留对招聘方有用的经历、技能与项目亮点。</p><p className="job-card-copy">此版式是公开产品的通用格式，不复制任何用户的私有简历、照片或经历；内部审查和投递前提醒不会写入简历。</p></div><div className="job-panel job-profile-preview"><div className="job-form-top"><div className="job-form-title">导入自己的 DOCX 模板（Beta）</div><span className="job-form-hint">仅本次浏览器会话</span></div><p className="job-card-copy">在 Word 中将以下占位符作为完整连续文字放入模板：<br /><code>{'{{姓名}} {{目标岗位}} {{联系方式}} {{职业概述}} {{核心技能}} {{岗位亮点}} {{工作经历}} {{项目经历}} {{工程作品}} {{教育背景}} {{证书}}'}</code></p><p className="job-card-copy">支持 .docx、最大 2MB。模板仅在导出请求时于服务端内存处理，不保存；PDF、旧版 .doc 和被拆分样式的占位符暂不支持。</p><div className="job-focus-actions"><button type="button" className="job-muted-btn" onClick={() => inputRef.current?.click()}><BiUpload />选择 DOCX 模板</button>{file && <button type="button" className="job-danger-btn" onClick={onClear}><BiTrash />切回默认模板</button>}<input ref={inputRef} className="hidden" type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={event => { const selected = event.target.files?.[0] || null; event.target.value = ''; onChoose(selected) }} /></div>{file && <p className="job-notice">本次将使用：{file.name}</p>}</div></div></section>
}

function ResumeImportPanel({ onApply }: { onApply: (draft: ResumeImportDraft) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<ResumeImportDraft | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState('')
  const chooseFile = async (file: File | null) => {
    if (!file) return
    setError('')
    setDraft(null)
    setIsParsing(true)
    try { setDraft(await parseResumeFile(file)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '解析失败，请改用 DOCX、带文字层的 PDF 或手动填写。') }
    finally { setIsParsing(false) }
  }
  const updateAsset = (index: number, update: Partial<CareerAsset>) => setDraft(current => current ? { ...current, assets: current.assets.map((asset, assetIndex) => assetIndex === index ? { ...asset, ...update, confirmed: false } : asset) } : current)
  return <section className="job-section zaotu-resume-import" aria-labelledby="resume-import-title">
    <div className="job-section-head"><div><h2 id="resume-import-title" className="job-section-title">从旧简历找回工程证据 <span>Beta</span></h2><p className="job-section-note">导入不是终点：先找回真实经历，再用一条 JD 判断哪些证据值得被招聘方看见。</p></div><span className="job-score">本地解析</span></div>
    <div className="zaotu-import-intro"><div><b>01 找回事实</b><p>DOCX / 文字型 PDF 只在本地读取，拆成可核对的项目、经历、技能与教育信息。</p></div><div><b>02 对齐岗位</b><p>确认后结合一条 JD，筛出最相关的工程证据，同时暴露不能硬写的缺口。</p></div><div><b>03 形成可用材料</b><p>同一组真实证据服务于 HR / 技术预审、可编辑 Word、ATS 文本和面试准备。</p></div></div>
    <div className="job-focus-actions"><button type="button" className="job-primary-btn" onClick={() => inputRef.current?.click()} disabled={isParsing}><BiUpload />{isParsing ? '正在本地读取…' : '选择旧简历'}</button>{draft && <button type="button" className="job-muted-btn" onClick={() => { setDraft(null); setError('') }}>放弃本次草稿</button>}<input ref={inputRef} className="hidden" type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { const file = event.target.files?.[0] || null; event.target.value = ''; void chooseFile(file) }} /></div>
    {error && <div className="zaotu-import-error" role="alert"><b>暂时无法读取</b><p>{error}</p></div>}
    {draft && <div className="zaotu-import-result"><div className="zaotu-import-result-head"><div><b>已从「{draft.sourceName}」读到候选内容</b><p>{draft.extractedCharacters} 个文字 · {draft.assets.length} 条待确认资产 · {draft.skills.length} 项候选技能</p></div><span>不自动保存</span></div>
      {(draft.profile.display_name || draft.profile.phone || draft.profile.email || draft.skills.length > 0) && <div className="zaotu-import-profile"><b>只补空白项，不覆盖已有资料</b><p>{[draft.profile.display_name && `称呼：${draft.profile.display_name}`, draft.profile.phone && `手机：${draft.profile.phone}`, draft.profile.email && `邮箱：${draft.profile.email}`, draft.skills.length && `技能：${draft.skills.join('、')}`].filter(Boolean).join(' · ')}</p></div>}
      {draft.warnings.map(warning => <p className="zaotu-import-warning" key={warning}>提示：{warning}</p>)}
      {draft.assets.length > 0 && <div className="zaotu-import-assets">{draft.assets.map((asset, index) => { const suggestion = expressionSuggestion(asset); return <article className="zaotu-import-asset" key={`${asset.id}_${index}`}><div className="zaotu-import-asset-head"><span>{assetKindLabel(asset.kind)} · 待本人确认</span><em>原文完整保留</em></div><Field label="标题（可编辑）" value={asset.title} onChange={value => updateAsset(index, { title: value })} placeholder="项目、岗位或学历名称" /><Field label="场景背景与职责范围（可编辑）" value={asset.description} onChange={value => updateAsset(index, { description: value })} placeholder="请核对原文是否完整" textarea /><Field label="关键动作、交付物与验证（每行一条）" value={asset.highlights.join('\n')} onChange={value => updateAsset(index, { highlights: value.split('\n').map(item => item.trim()).filter(Boolean) })} placeholder="只保留自己能讲清、能核对的内容" textarea /><Field label="使用工具（可编辑）" value={asset.tools.join(', ')} onChange={value => updateAsset(index, { tools: splitItems(value) })} placeholder="例如：PLC、HMI、Python" /><div className="zaotu-expression-note"><b>工程证据检查</b><p>已保留 {suggestion.preservedCount} 段原文；{suggestion.covered.length ? `已识别：${suggestion.covered.join('、')}。` : '暂未识别出可追问的工程动作。'}</p><p>{suggestion.gaps.length ? `如果这些事实确实存在，请补充：${suggestion.gaps.join('、')}。` : '信息已具备基础结构；确认前仍请核对责任边界。'}</p><small>{suggestion.note}</small></div></article> })}</div>}
      <div className="job-focus-actions"><button type="button" className="job-primary-btn" onClick={() => { onApply(draft); setDraft(null) }}><BiCheck />导入为待确认草稿</button><p className="zaotu-import-confirmation">导入后请到“职业资产库”逐条补全并勾选“本人确认”。</p></div>
    </div>}
  </section>
}

function AssetLibrary({ assets, onChange }: { assets: CareerAsset[]; onChange: (assets: CareerAsset[]) => void }) {
  const [draft, setDraft] = useState<Omit<CareerAsset, 'id'>>({ kind: 'project', title: '', organization: '', role: '', period: '', description: '', highlights: [], tools: [], confirmed: false })
  const add = (event: FormEvent) => { event.preventDefault(); if (!draft.title.trim() || !draft.description.trim()) return; onChange([{ ...draft, id: crypto.randomUUID(), title: draft.title.trim(), organization: draft.organization.trim(), role: draft.role.trim(), period: draft.period.trim(), description: draft.description.trim(), highlights: draft.highlights.map(item => item.trim()).filter(Boolean), tools: splitItems(draft.tools.join(', ')) }, ...assets]); setDraft({ kind: 'project', title: '', organization: '', role: '', period: '', description: '', highlights: [], tools: [], confirmed: false }) }
  const update = (id: string, partial: Partial<CareerAsset>) => onChange(assets.map(asset => asset.id === id ? { ...asset, ...partial } : asset))
  const remove = (asset: CareerAsset) => { if (window.confirm(`删除职业资产“${asset.title}”？\n\n这会影响后续岗位匹配和材料草案，但不会影响任何招聘平台操作。`)) onChange(assets.filter(item => item.id !== asset.id)) }
  return <section id="asset-library" className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">职业资产库</h2><p className="job-section-note">按“背景—身份—本人动作—工具—交付物/验证”整理；每行一个关键动作，生成的简历会更接近正式 V6 的内容密度。</p></div><span className="job-score">{assets.filter(asset => asset.confirmed).length}/{assets.length} 已确认</span></div><div className="job-import-grid"><form className="job-panel job-form" onSubmit={add}><div className="job-form-top"><div className="job-form-title">新增一条真实资产</div><span className="job-form-hint">不确定的内容先不勾选确认</span></div><div className="job-form-row"><div className="job-field"><label>资产类型</label><select className="job-select" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as AssetKind })}><option value="education">教育经历</option><option value="experience">工作 / 实习经历</option><option value="project">项目 / 实训</option><option value="skill">技能实践</option></select></div><Field label="标题 *" value={draft.title} onChange={value => setDraft({ ...draft, title: value })} placeholder="岗位名称 / 项目名称 / 学历" required /></div><Field label="学校、公司或项目来源（可选）" value={draft.organization} onChange={value => setDraft({ ...draft, organization: value })} placeholder="例如：某公司 / 个人作品 / 某课程实训" /><div className="job-form-row"><Field label="身份、专业或职责（可选）" value={draft.role} onChange={value => setDraft({ ...draft, role: value })} placeholder="例如：电气工程师 / 自动化专业" /><Field label="时间范围（可选）" value={draft.period} onChange={value => setDraft({ ...draft, period: value })} placeholder="例如：2024.06 - 至今" /></div><Field label="场景背景与职责范围 *" value={draft.description} onChange={value => setDraft({ ...draft, description: value })} placeholder="说明业务/项目场景、你负责的边界，不写空泛自评" textarea required /><Field label="关键动作、交付物与验证（建议每行一条）" value={draft.highlights.join('\n')} onChange={value => setDraft({ ...draft, highlights: value.split('\n').map(item => item.trim()).filter(Boolean) })} placeholder={'例如：独立完成 PLC 顺序控制程序与 I/O 联调\n定位通信超时原因并形成调试记录'} textarea /><Field label="使用工具（可选）" value={draft.tools.join(', ')} onChange={value => setDraft({ ...draft, tools: splitItems(value) })} placeholder="例如：PLC、HMI、Python、CAD" /><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={draft.confirmed} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />我确认这条资产为本人真实经历，可用于求职材料</label><div className="job-focus-actions"><button type="submit" className="job-primary-btn"><BiPlus />保存资产</button></div></form><div className="job-panel job-profile-preview"><div className="job-form-top"><div className="job-form-title">已保存资产</div><span className="job-form-hint">未确认内容只保留给你自己整理</span></div>{assets.length === 0 ? <p className="job-card-copy">还没有资产。可以从课程设计、实训、真实项目、实习或作品开始，一次补一条。</p> : <div className="grid gap-3">{assets.map(asset => <div key={asset.id} className="job-resume-focus"><div className="flex items-start justify-between gap-3"><div><b>{assetKindLabel(asset.kind)} · {asset.title}</b><p>{[asset.organization, asset.role, asset.period].filter(Boolean).join(' · ') || '来源待补充'}</p></div><button type="button" className="job-danger-btn" onClick={() => remove(asset)}><BiTrash />删除</button></div><p>{asset.description}</p>{asset.highlights.map(item => <p key={item}>• {item}</p>)}{asset.tools.length > 0 && <div className="job-profile-skills">{asset.tools.map(tool => <span key={tool} className="job-skill">{tool}</span>)}</div>}<label className="mt-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={asset.confirmed} onChange={event => update(asset.id, { confirmed: event.target.checked })} />本人确认，可用于岗位匹配与材料</label></div>)}</div>}</div></div></section>
}

function Field({ label, value, onChange, placeholder, textarea = false, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; textarea?: boolean; required?: boolean; type?: string }) { return <div className="job-field"><label>{label}</label>{textarea ? <textarea required={required} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /> : <input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />}</div> }
function ResumePhotoField({ photo, previewUrl, inputRef, onChoose, onClear }: { photo: File | null; previewUrl: string; inputRef: RefObject<HTMLInputElement | null>; onChoose: (file: File | null) => void; onClear: () => void }) { return <div className="job-photo-field"><div><label>可选证件照</label><p>默认无照片；仅支持 JPG / PNG、2MB 以内。照片不会保存到服务器或本地备份。</p></div><div className="job-photo-control">{photo && previewUrl ? <Image unoptimized width={90} height={120} src={previewUrl} alt="本次导出的证件照预览" /> : <div className="job-photo-placeholder"><BiImage /></div>}<div className="job-photo-actions"><button type="button" className="job-muted-btn" onClick={() => inputRef.current?.click()}><BiUpload />{photo ? '更换证件照' : '上传证件照'}</button>{photo && <button type="button" className="job-danger-btn" onClick={onClear}><BiTrash />移除</button>}<small>{photo ? `${photo.name} · 仅本次会话` : '不上传也可生成正式简历'}</small></div></div><input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={event => { const selected = event.target.files?.[0] || null; event.target.value = ''; onChoose(selected) }} /></div> }
function Empty({ text }: { text: string }) { return <div className="job-panel job-empty"><div><div className="job-empty-icon"><BiClipboard /></div><strong className="text-[#304137]">{text}</strong><p className="mt-2 text-sm">把值得认真看的职位保存下来，再决定要不要投。</p></div></div> }
function WorkspaceCard({ job, pane, activePane, isExporting, onClose, onPaneChange, onDraft, onPlan, onInterview, onReview, onKit, onCopy, onExport, onApplied, onDelete, onFollowUp }: { job: Job; pane?: Pane; activePane: 'resume' | 'letter'; isExporting: boolean; onClose: () => void; onPaneChange: (value: 'resume' | 'letter') => void; onDraft: (job: Job, variant: Variant) => void; onPlan: (job: Job) => void; onInterview: (job: Job) => void; onReview: (job: Job) => void; onKit: (job: Job, refresh?: boolean) => void; onCopy: (content: string, label: string) => void; onExport: (job: Job, kit: Kit) => void; onApplied: (job: Job) => void; onDelete: (job: Job) => void; onFollowUp: (value: string) => void }) {
  return <ShowcaseJobCard title={job.title} company={job.company_name} meta={[job.location, job.salary, job.status === 'applied' ? '已投递' : '待判断'].filter(Boolean).join('  ·  ')} score={`${job.match_score}% 匹配`} summary={job.analysis_summary} skills={job.matched_skills}>
    <div className="job-decision"><strong>{job.decision.recommendation}</strong><div><b>你的证据</b>{job.decision.evidence.slice(0, 2).map(item => <p key={item}>{item}</p>)}</div><div><b>投前核实</b>{job.decision.checks.map(item => <p key={item}>{item}</p>)}</div></div>
    <div className="job-resume-focus"><b>简历优化重点</b>{job.decision.resume_focus.slice(0, 3).map(item => <p key={item}>{item}</p>)}</div>
    {job.draft && <div className="job-outbound-draft"><div><b>可直接发送 · 岗位招呼语</b><span>仅包含你已确认的岗位与项目事实</span></div><p>{job.draft.content}</p></div>}
    {pane && <ShowcaseWorkbench title={pane.title} headAction={<button className="job-link-btn" onClick={onClose}>收起面板</button>} summary={pane.summary} controls={pane.kind === 'application' && pane.kit ? <><button className={`job-muted-btn ${activePane === 'resume' ? 'is-selected' : ''}`} onClick={() => onPaneChange('resume')}>简历 / ATS</button><button className={`job-muted-btn ${activePane === 'letter' ? 'is-selected' : ''}`} onClick={() => onPaneChange('letter')}>岗位招呼语</button><button className="job-muted-btn" onClick={() => onCopy(activePane === 'letter' ? pane.kit!.cover_letter_content : pane.kit!.resume_content, activePane === 'letter' ? '岗位招呼语' : '简历 / ATS 文本')}><BiCopy />复制可发送内容</button><button className="job-muted-btn" onClick={() => onExport(job, pane.kit!)} disabled={isExporting} aria-busy={isExporting}>{isExporting ? '正在生成 Word…' : '导出正式 Word'}</button><button className="job-muted-btn" onClick={() => onKit(job, true)} disabled={isExporting}>按最新资料再生成</button><button className="job-muted-btn" onClick={() => onApplied(job)}>记录为已投递</button></> : undefined}>
      {pane.kind === 'application' && pane.kit && <pre className="job-workbench-material">{activePane === 'letter' ? pane.kit.cover_letter_content : pane.kit.resume_content}</pre>}
      {pane.review && <ReviewSummary review={pane.review} />}
      {pane.evidence.length > 0 && <div><b>已核实依据</b>{pane.evidence.map(item => <p key={item}>• {item}</p>)}</div>}
      {pane.prompts.length > 0 && <div><b>{pane.kind === 'interview' ? '练习重点 / 建议提问' : pane.kind === 'review' ? '二次优化回写' : 'JD 对齐重点'}</b>{pane.prompts.slice(0, 5).map(item => <p key={item}>• {item}</p>)}</div>}
      {pane.warnings.length > 0 && <div><b>复核提醒</b>{pane.warnings.slice(0, 5).map(item => <p key={item}>• {item}</p>)}</div>}
    </ShowcaseWorkbench>}
    <div className="job-card-actions job-card-actions--workspace"><button className="job-muted-btn" onClick={() => onDraft(job, 'professional')}>生成专业招呼语</button><button className="job-muted-btn" onClick={() => onDraft(job, 'delivery')}>生成交付招呼语</button><button className="job-muted-btn" onClick={() => onDraft(job, 'vision_ai')} disabled={!job.matched_skills.some(item => /视觉|python|opencv|halcon|visionpro/i.test(item))}>生成视觉招呼语</button><button className="job-muted-btn" onClick={() => onReview(job)}>内部 HR / 技术审查</button><button className="job-muted-btn" onClick={() => onPlan(job)}>内部简历策略</button><button className="job-muted-btn" onClick={() => onInterview(job)}>内部面试准备</button><button className="job-muted-btn" onClick={() => onKit(job)}>生成投递材料</button>{job.draft && <button className="job-muted-btn" onClick={() => onCopy(job.draft!.content, '岗位招呼语')}><BiCopy />复制招呼语</button>}{job.status !== 'applied' && <button className="job-primary-btn !min-h-[33px] !text-xs" onClick={() => onApplied(job)}>我已投递</button>}<button className="job-danger-btn" onClick={() => onDelete(job)}><BiTrash />删除本地记录</button></div>
    {job.draft && <p className="job-draft-note">招呼语版本：{job.draft.variant === 'delivery' ? '项目交付' : job.draft.variant === 'vision_ai' ? '视觉技术' : '专业匹配'} · 可直接复制发送</p>}
    {job.status === 'applied' && <div className="job-card-actions"><input className="border rounded px-2 text-xs" type="datetime-local" value={job.follow_up_at || ''} onChange={event => onFollowUp(event.target.value)} /><button type="button" className="job-muted-btn" onClick={() => onFollowUp(job.follow_up_at || '')}>保存跟进</button></div>}
  </ShowcaseJobCard>
}

function ReviewSummary({ review }: { review: EngineeringReview }) {
  return <div className="job-internal-review"><b>仅供本人查看 · 双视角预审（不随复制或导出发送）</b><p>HR：{review.hr_review.strengths[0] || '待补充可读、可核实的职业资料。'}</p><p>技术主管：{review.technical_review.strengths[0] || '尚未形成可追问的技术证据链。'}</p><p>发布门槛：{review.release_gate === 'ready_for_visual_review' ? '可进入 A4 视觉核对' : '需补齐真实资产后再投递'}</p></div>
}
function Opportunities({ jobs, notice, lastRefresh, isRefreshing, onRefresh, onOpen, onDelete }: { jobs: Job[]; notice: string; lastRefresh: string; isRefreshing: boolean; onRefresh: () => void; onOpen: () => void; onDelete: (job: Job) => void }) { return <div className="job-shell"><header><span className="job-eyebrow">OPPORTUNITY LIBRARY</span><h1 className="job-page-title">职位机会</h1><p className="job-subtitle">只呈现你主动保存的职位。先比较匹配线索，再决定是否继续。</p></header><section className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">已收集 {jobs.length} 条</h2><p className="job-section-note">刷新会自动保存当前职业资料并重新计算全部职位。{lastRefresh && ` 最近刷新：${lastRefresh}`}</p></div><button className="job-link-btn" onClick={onRefresh} disabled={isRefreshing}><BiRefresh className={isRefreshing ? 'job-refresh-spin' : ''} />{isRefreshing ? '正在重新分析…' : '按最新资料刷新'}</button></div>{notice && <p className="job-notice">{notice}</p>}{jobs.length === 0 ? <Empty text="机会库还是空的。" /> : <div className="grid gap-3">{jobs.map(job => <ShowcaseJobCard key={job.id} title={job.title} company={job.company_name} meta={[job.location, job.salary, job.status === 'applied' ? '已投递' : '待判断'].filter(Boolean).join('  ·  ')} score={`${job.match_score}% 匹配`} summary={job.analysis_summary} skills={job.matched_skills}><div className="job-card-actions"><button className="job-link-btn inline-flex items-center gap-1" onClick={onOpen}>回到工作台处理 <BiArrowToRight /></button><button className="job-danger-btn inline-flex items-center gap-1" onClick={() => onDelete(job)}><BiTrash />删除本地记录</button></div></ShowcaseJobCard>)}</div>}</section></div> }
function Applications({ jobs, notice, onRefresh, onOpen, onDelete, onOutcome }: { jobs: Job[]; notice: string; onRefresh: () => void; onOpen: () => void; onDelete: (job: Job) => void; onOutcome: (id: string, status: string, note: string) => void }) { return <div className="job-shell"><header><span className="job-eyebrow">APPLICATION REVIEW</span><h1 className="job-page-title">投递复盘</h1><p className="job-subtitle">记录已经由你亲自完成的投递，并在工作台设置下一次跟进时间。</p></header><section className="job-section"><div className="job-section-head"><div><h2 className="job-section-title">已投递 {jobs.length} 条</h2><p className="job-section-note">这里只整理你的进展；不会代替任何招聘平台发送或撤回内容。</p></div><button className="job-link-btn" onClick={onRefresh}>刷新列表</button></div>{notice && <p className="job-notice">{notice}</p>}{jobs.length === 0 ? <Empty text="还没有投递记录。" /> : <div className="grid gap-3">{jobs.map(job => <ShowcaseJobCard key={job.id} title={job.title} company={job.company_name} meta={[job.location, job.salary, '已投递'].filter(Boolean).join(' · ')} score="已记录"><div className="job-card-actions"><button className="job-link-btn inline-flex items-center gap-1" onClick={onOpen}>设置跟进或查看草稿 <BiArrowToRight /></button><button className="job-danger-btn inline-flex items-center gap-1" onClick={() => onDelete(job)}><BiTrash />删除本地记录</button></div><div className="job-outcome-row"><select aria-label={`${job.title} 的投递进展`} value={job.outcome?.status || 'applied'} onChange={event => onOutcome(job.id, event.target.value, job.outcome?.note || '')}>{outcomeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label={`${job.title} 的结果备注`} value={job.outcome?.note || ''} onChange={event => onOutcome(job.id, job.outcome?.status || 'applied', event.target.value)} placeholder="例如：约周三下午一面" /><button type="button" className="job-muted-btn" onClick={() => onOutcome(job.id, job.outcome?.status || 'applied', job.outcome?.note || '')}>保存进展</button></div></ShowcaseJobCard>)}</div>}</section></div> }
