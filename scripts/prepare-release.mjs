import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const rootDir = process.cwd()
const rootPackage = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
const releaseName = 'manclaw-release'
const releaseVersion = rootPackage.version
const releaseDir = path.join(rootDir, releaseName)
const artifactsDir = path.join(rootDir, 'release-artifacts')
const zipPath = path.join(artifactsDir, `${releaseName}-v${releaseVersion}.zip`)
const serverSource = path.join(rootDir, 'apps', 'server', 'dist', 'index.js')
const webSource = path.join(rootDir, 'apps', 'web', 'dist')
const serverTargetDir = path.join(releaseDir, 'server')
const webTargetDir = path.join(releaseDir, 'web', 'dist')

await rm(releaseDir, { recursive: true, force: true })
await rm(artifactsDir, { recursive: true, force: true })
await mkdir(serverTargetDir, { recursive: true })
await mkdir(path.dirname(webTargetDir), { recursive: true })
await mkdir(artifactsDir, { recursive: true })

await cp(serverSource, path.join(serverTargetDir, 'index.js'))
await cp(webSource, webTargetDir, { recursive: true })

const releasePackage = {
  name: releaseName,
  version: releaseVersion,
  private: true,
  type: 'module',
  description: 'Standalone ManClaw release package.',
  scripts: {
    start: 'node server/index.js',
  },
  dependencies: {
    '@fastify/cors': '^11.0.0',
    '@fastify/static': '^8.2.0',
    fastify: '^5.2.1',
    pino: '^9.6.0',
  },
}

const releaseReadme = `# ManClaw Release

## Start

\`\`\`bash
npm install --omit=dev
npm start
\`\`\`

Default port: \`18300\`
Override port:

\`\`\`bash
PORT=18301 npm start
\`\`\`
`

await writeFile(path.join(releaseDir, 'package.json'), `${JSON.stringify(releasePackage, null, 2)}\n`, 'utf8')
await writeFile(path.join(releaseDir, 'README.md'), releaseReadme, 'utf8')

await execFileAsync(
  'python3',
  [
    '-c',
    [
      'import os, sys, zipfile',
      'root, source_dir, zip_path = sys.argv[1:4]',
      'source_dir = os.path.abspath(source_dir)',
      'root = os.path.abspath(root)',
      'with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:',
      '    for current_root, _, files in os.walk(source_dir):',
      '        for file_name in files:',
      '            file_path = os.path.join(current_root, file_name)',
      '            archive.write(file_path, os.path.relpath(file_path, root))',
    ].join('\n'),
    rootDir,
    releaseDir,
    zipPath,
  ],
  {
    cwd: rootDir,
  },
)
