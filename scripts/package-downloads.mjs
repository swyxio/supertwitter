import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = fileURLToPath(new URL('../', import.meta.url))
const license = await readFile(join(root, 'LICENSE'))
async function collect(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true })
  const lists = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith('.') && !e.name.endsWith('.zip'))
      .map((e) => {
        const name = join(dir, e.name)
        return e.isDirectory() ? collect(name) : e.isFile() ? [name] : []
      })
  )
  return lists.flat()
}
async function archive(target, files, base = '') {
  const entries = await Promise.all(
    files.map(async (file) => {
      const name = relative(join(root, base), join(root, file)).replaceAll(
        '\\',
        '/'
      )
      return [name, new Uint8Array(await readFile(join(root, file)))]
    })
  )
  await writeFile(
    join(root, 'public', target),
    zipSync(
      { ...Object.fromEntries(entries), LICENSE: license },
      {
        level: 6,
        mtime: new Date(2000, 0, 1),
      }
    )
  )
}
await mkdir(join(root, 'public'), { recursive: true })
const extension = await collect('extension')
await archive(
  'connector.zip',
  extension.filter(
    (f) => !relative('extension', f).split(sep).includes('tests')
  ),
  'extension'
)
const folders = ['public', 'src', 'scripts', 'tests']
const files = [
  '.gitignore',
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'wrangler.jsonc',
  'playwright.config.ts',
  'README.md',
]
await archive('source.zip', [
  ...files,
  ...extension,
  ...(await Promise.all(folders.map(collect))).flat(),
])
