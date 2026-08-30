import { engineeringKeywords, type EngineeringAsset, type EngineeringAssetKind } from './engineering-materials'
import * as mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// Keep PDF.js entirely in the visitor's browser.  Next emits this worker as a
// public static module, so text extraction does not require an API request.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()

export type ResumeImportDraft = {
  sourceName: string
  profile: Pick<EngineeringProfileHint, 'display_name' | 'phone' | 'email'>
  skills: string[]
  assets: EngineeringAsset[]
  warnings: string[]
  extractedCharacters: number
}

type EngineeringProfileHint = { display_name: string; phone: string; email: string }
type PdfTextItem = { str?: unknown; transform?: unknown }
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> }
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage>; destroy?: () => void }
type PdfModule = { getDocument: (source: { data: Uint8Array; disableWorker: boolean }) => { promise: Promise<PdfDocument>; destroy?: () => void } }

const maxFileBytes = 6 * 1024 * 1024
const maxPdfPages = 12
const headingKinds: Array<{ pattern: RegExp; kind: EngineeringAssetKind }> = [
  { pattern: /^(工作经历|工作经验|实习经历|任职经历|职业经历|workexperience|employmenthistory|experience)\s*[:：]?$/i, kind: 'experience' },
  { pattern: /^(项目经历|项目经验|项目实践|实训经历|校园经历|projectexperience|projects|project)\s*[:：]?$/i, kind: 'project' },
  { pattern: /^(教育经历|教育背景|学历背景|education|educationbackground)\s*[:：]?$/i, kind: 'education' },
]
const kindName = (kind: EngineeringAssetKind) => ({ education: '教育经历', experience: '工作 / 实习经历', project: '项目 / 实训', skill: '技能实践' })[kind]
const unique = (items: string[]) => [...new Set(items.map(item => item.trim()).filter(Boolean))]
const compact = (value: string, limit = 220) => value.replace(/\s+/g, ' ').trim().slice(0, limit)
const cleanText = (value: string) => value.replace(/\r/g, '').replace(/[\t　]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
const matchesTerm = (text: string, term: string) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase())

function kindForHeading(line: string) {
  const compactLine = line.replace(/[\s·•\-—_]+/g, '').trim()
  return headingKinds.find(item => item.pattern.test(compactLine))?.kind
}

function makeAsset(kind: EngineeringAssetKind, lines: string[], index: number): EngineeringAsset | null {
  const useful = lines.map(line => compact(line, 260)).filter(line => line.length > 1)
  if (!useful.length) return null
  const nonBullet = useful.find(line => !/^[•·\-*—]/.test(line)) || useful[0]
  const title = compact(nonBullet.replace(/^[•·\-*—]\s*/, ''), 70) || `导入的${kindName(kind)} ${index + 1}`
  const detailLines = useful.filter(line => line !== nonBullet)
  const description = compact(detailLines.join('；') || nonBullet, 280)
  const highlights = unique(detailLines
    .filter(line => line.length >= 8)
    .flatMap(line => line.split(/[；;。]/).map(item => item.trim()))
    .filter(line => line.length >= 8)
    .slice(0, 4))
  const source = useful.join(' ')
  const tools = engineeringKeywords.filter(term => matchesTerm(source, term)).slice(0, 10)
  return { id: `import_${kind}_${index}`, kind, title, organization: '', role: '', period: '', description, highlights, tools, confirmed: false }
}

function extractAssets(lines: string[]) {
  const sections: Array<{ kind: EngineeringAssetKind; lines: string[] }> = []
  let current: { kind: EngineeringAssetKind; lines: string[] } | null = null
  for (const line of lines) {
    const kind = kindForHeading(line)
    if (kind) { current = { kind, lines: [] }; sections.push(current); continue }
    if (current) current.lines.push(line)
  }
  return sections.flatMap((section, sectionIndex) => {
    const chunks = section.lines.join('\n').split(/\n(?=(?:\d{4}[./年-]|20\d{2}|19\d{2}|[•·]))/).map(chunk => chunk.split('\n').filter(Boolean)).filter(chunk => chunk.length)
    return chunks.map((chunk, index) => makeAsset(section.kind, chunk, sectionIndex + index)).filter((asset): asset is EngineeringAsset => Boolean(asset))
  }).slice(0, 8)
}

function extractName(lines: string[]) {
  const ignored = /^(简历|个人简历|求职简历|基本信息|个人信息|联系方式|工作经历|项目经历|教育经历|技能|专业技能)$/
  return lines.slice(0, 8).map(line => compact(line, 48)).find(line => {
    if (ignored.test(line) || /[@\d]|[:：]/.test(line)) return false
    return /^[\u4e00-\u9fff]{2,4}$/.test(line) || /^[A-Za-z][A-Za-z .'’-]{1,42}$/.test(line)
  }) || ''
}

function extractSkills(text: string, lines: string[]) {
  const keywords = engineeringKeywords.filter(term => matchesTerm(text, term))
  const skillLines = lines.filter(line => /^(技能|专业技能|核心技能|工具|技术栈)\s*[:：]?$/i.test(line.replace(/[\s·•\-—_]+/g, '').trim()))
  const nearby = skillLines.flatMap(line => {
    const position = lines.indexOf(line)
    return lines.slice(position + 1, position + 4).flatMap(value => value.split(/[,，、/|；;]/).map(item => compact(item, 32)))
  }).filter(value => value.length >= 2 && value.length <= 32 && !/^\d/.test(value))
  return unique([...keywords, ...nearby]).slice(0, 18)
}

export function expressionSuggestion(asset: EngineeringAsset) {
  const sourceLines = unique([asset.description, ...asset.highlights].flatMap(value => value.split(/[\n；;。]/).map(item => compact(item, 160))).filter(value => value.length >= 6))
  const source = [asset.title, ...sourceLines, ...asset.tools].join(' ')
  const hasAction = /(负责|完成|主导|独立|参与|设计|开发|调试|联调|编写|搭建|优化|解决|分析|测试|维护|实施|协助|处理)/.test(source)
  const hasTool = asset.tools.length > 0 || engineeringKeywords.some(term => matchesTerm(source, term))
  const hasVerification = /(交付|上线|验收|验证|测试|复盘|报告|记录|成果|通过|改善|解决|完成)/.test(source)
  const covered = [hasAction && '本人动作', hasTool && '工具 / 方法', hasVerification && '交付 / 验证'].filter((item): item is string => Boolean(item))
  const gaps = [!hasAction && '本人具体做了什么', !hasTool && '使用的工具 / 方法', !hasVerification && '交付物或验证方式'].filter((item): item is string => Boolean(item))
  return {
    preservedCount: sourceLines.length,
    covered,
    gaps,
    note: `这是证据检查，不会改写或删减原文。导入后请只补充你本人能核对的事实。`,
  }
}

export function parseResumeText(text: string, sourceName: string): ResumeImportDraft {
  const normalized = cleanText(text)
  if (normalized.length < 20) throw new Error('没有读到足够的文字。若这是扫描件 PDF，请使用文字版 PDF 或改为手动填写。')
  const lines = normalized.split('\n').map(line => compact(line, 300)).filter(line => Boolean(line) && !/^file:\/\//i.test(line) && !/^20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}/.test(line))
  const phone = normalized.match(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/)?.[0]?.replace(/(?:\+?86[- ]?)/, '') || ''
  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
  const assets = extractAssets(lines)
  const warnings: string[] = []
  if (!assets.length) warnings.push('已读到文字，但未能可靠识别工作、项目或教育分区；可先导入技能与联系方式，再在资产库手动补一条。')
  if (assets.length >= 8) warnings.push('为避免一次导入过多内容，当前仅保留前 8 条候选资产。')
  return { sourceName, profile: { display_name: extractName(lines), phone, email }, skills: extractSkills(normalized, lines), assets, warnings, extractedCharacters: normalized.length }
}

async function readPdf(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = (pdfjs as unknown as PdfModule).getDocument({ data: bytes, disableWorker: true })
  const document = await loadingTask.promise
  try {
    const pageCount = Math.min(document.numPages, maxPdfPages)
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      let previousY: number | null = null
      const pageText = content.items.map(item => {
        const value = typeof item.str === 'string' ? item.str : ''
        const transform = Array.isArray(item.transform) ? item.transform : []
        const y = typeof transform[5] === 'number' ? transform[5] : null
        const separator = y !== null && previousY !== null && Math.abs(y - previousY) > 1.5 ? '\n' : ' '
        if (y !== null) previousY = y
        return `${separator}${value}`
      }).join('')
      pages.push(pageText)
    }
    return { text: pages.join('\n'), capped: document.numPages > maxPdfPages }
  } finally { document.destroy?.(); loadingTask.destroy?.() }
}

export async function parseResumeFile(file: File): Promise<ResumeImportDraft> {
  if (file.size > maxFileBytes) throw new Error('文件超过 6MB。为保护本机性能，请先压缩或改用不超过 6MB 的 DOCX / PDF。')
  const name = file.name.toLocaleLowerCase()
  if (name.endsWith('.doc')) throw new Error('旧版 .doc 暂不支持。请在 Word 中另存为 .docx，或手动填写。')
  if (name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    const draft = parseResumeText(result.value, file.name)
    if (result.messages.length) draft.warnings.push('DOCX 中有部分版式未参与读取；请在导入后核对候选内容。')
    return draft
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const result = await readPdf(file)
    const draft = parseResumeText(result.text, file.name)
    if (result.capped) draft.warnings.push(`为避免浏览器卡顿，只读取前 ${maxPdfPages} 页。`)
    return draft
  }
  throw new Error('仅支持 .docx 或带文字层的 PDF。扫描件 PDF、加密文件和图片暂不支持。')
}
