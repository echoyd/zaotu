import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '..')
const repositoryRoot = path.resolve(frontendRoot, '..')
const output = path.join(frontendRoot, 'out')

if (!fs.existsSync(output)) throw new Error('Next 静态构建目录不存在。请先运行 next build。')

const gitValue = (args) => {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

const manifest = {
  product: '造途 ZAOTU',
  channel: 'closed-beta',
  version: process.env.ZAOTU_RELEASE_VERSION || '0.1.0-beta.1',
  source_revision: gitValue(['rev-parse', 'HEAD']),
  source_dirty: Boolean(gitValue(['status', '--porcelain'])),
  entrypoint: '/start',
  generated_at: new Date().toISOString(),
}

fs.writeFileSync(path.join(output, 'zaotu-release.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`已写入造途版本清单：${manifest.version} · ${manifest.source_revision.slice(0, 7)}`)
