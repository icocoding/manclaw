import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import type {
  ConfigDocument,
  ConfigRevision,
  ConfigValidationResult,
  HealthSnapshot,
  InstalledSkillEntry,
  InstalledSkillsDocument,
  LogEntry,
  LogLevel,
  ManClawConfig,
  ManagerSettingsDocument,
  QuickModelConfig,
  QuickModelConfigDocument,
  QuickModelProvider,
  RecommendedSkill,
  RegistrySkillDetail,
  RestartNoticeDocument,
  ServiceDetail,
  ServiceSummary,
  SkillMutationResult,
  SkillInstallResult,
  ShellAllowedCommand,
  ShellExecutionRecord,
  SkillsCatalogDocument,
  SystemSummary,
} from '@manclaw/shared'

const execFileAsync = promisify(execFile)

const DEFAULT_CONFIG: ManClawConfig = {
  service: {
    command: 'openclaw',
    args: [],
    cwd: '.',
    env: {},
    autoStart: true,
    autoRestart: true,
    processName: 'openclaw',
    configPath: './openclaw.config.json',
    configFlag: '',
    healthcheck: {
      enabled: false,
      url: 'http://127.0.0.1:8080/health',
      timeoutMs: 3_000,
      expectedStatus: 200,
    },
  },
  shell: {
    timeoutMs: 10_000,
  },
  ui: {
    restartNotice: null,
  },
}

interface ManagerPaths {
  dataDir: string
  configPath: string
  revisionsDir: string
  runtimeLogPath: string
  auditLogPath: string
}

type ManagedChildProcess = ChildProcessByStdio<null, Readable, Readable>

interface ServiceState {
  child?: ManagedChildProcess
  status: ServiceDetail
  stopRequested: boolean
  restartTimer?: NodeJS.Timeout
}

interface ConfigRevisionFile extends ConfigRevision {
  content: string
}

interface DetectedProcess {
  pid: number
  command: string
  args: string
  detectedBy: 'managed' | 'process-scan'
}

function tokenizeProcessArgs(args: string): string[] {
  return args
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function matchesProcessSignature(commandName: string, args: string, command: string, processName: string): boolean {
  const commandBaseName = path.basename(command)
  const tokens = tokenizeProcessArgs(args)

  if (commandName === processName || commandName === commandBaseName) {
    return true
  }

  return tokens.some((token) => token === command || token === commandBaseName || token === processName)
}

interface HealthProbeResult {
  status: 'passing' | 'failing' | 'disabled'
  message: string
}

interface SkillOriginFile {
  version: 1
  registry: string
  slug: string
  installedVersion: string
  installedAt: number
}

interface CachedSkillDetail {
  value: RegistrySkillDetail
  cachedAt: number
}

const SKILL_DETAIL_CACHE_TTL_MS = 10 * 60 * 1000

const QUICK_MODEL_PROVIDERS: QuickModelConfigDocument['availableProviders'] = [
  { id: 'openai', label: 'OpenAI', requiresApiKey: true, supportsBaseUrl: false, supportsCustomProviderId: false },
  { id: 'anthropic', label: 'Anthropic', requiresApiKey: true, supportsBaseUrl: false, supportsCustomProviderId: false },
  { id: 'google', label: 'Google Gemini', requiresApiKey: true, supportsBaseUrl: false, supportsCustomProviderId: false },
  { id: 'openrouter', label: 'OpenRouter', requiresApiKey: true, supportsBaseUrl: false, supportsCustomProviderId: false },
  { id: 'ollama', label: 'Ollama', requiresApiKey: false, supportsBaseUrl: false, supportsCustomProviderId: false },
  { id: 'custom-openai', label: 'Custom OpenAI-compatible', requiresApiKey: true, supportsBaseUrl: true, supportsCustomProviderId: true },
]

const CLAWHUB_REGISTRY = 'https://clawhub.ai'

const RECOMMENDED_SKILLS: Array<Omit<RecommendedSkill, 'installed'>> = [
  {
    slug: 'self-improving-agent',
    title: 'Self Improving Agent',
    summary: '为代理增加持续反思、改进和自我迭代能力的默认技能。',
    category: '默认',
    source: 'clawhub',
  },
  {
    slug: 'find-skills',
    title: 'Find Skills',
    summary: '帮助 OpenClaw 快速发现和匹配可用技能的默认技能。',
    category: '默认',
    source: 'clawhub',
  },
  {
    slug: 'summarize',
    title: 'Summarize',
    summary: '提供稳定的摘要整理能力，适合作为默认基础技能。',
    category: '默认',
    source: 'clawhub',
  },
  {
    slug: 'openclaw-cli',
    title: 'OpenClaw CLI',
    summary: '补足 OpenClaw CLI 运维、排障和常见管理命令的使用知识。',
    category: '默认',
    source: 'clawhub',
  },
  {
    slug: 'openclaw-policy-check',
    title: 'OpenClaw Policy Check',
    summary: '执行前快速扫描风险命令、可疑脚本和潜在敏感信息泄漏。',
    category: '默认',
    source: 'clawhub',
  },
]

function getClawhubExecArgs(workspaceDir: string, action: 'install' | 'update', slug: string, force = false): string[] {
  const args = [
    'exec',
    '--yes',
    'clawhub',
    '--',
    '--no-input',
    '--registry',
    CLAWHUB_REGISTRY,
    '--workdir',
    workspaceDir,
    '--dir',
    'skills',
    action,
  ]

  if (force) {
    args.push('--force')
  }

  args.push(slug)
  return args
}

function formatExternalCommandError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }

  const commandError = error as Error & { code?: string; stderr?: string; stdout?: string }
  if (commandError.code === 'ENOENT') {
    return '系统未找到 npm 命令。请先安装 Node.js/npm，并确认 npm 已加入 PATH。'
  }

  const stderr = typeof commandError.stderr === 'string' ? commandError.stderr.trim() : ''
  const stdout = typeof commandError.stdout === 'string' ? commandError.stdout.trim() : ''
  const output = summarizeCommandOutput(stderr || stdout || commandError.message)

  if (/could not determine executable to run/i.test(output) || /clawhub/i.test(output) && /not found/i.test(output)) {
    return 'npm 可用，但无法执行 clawhub。请确认网络正常，或先手动执行 `npm exec --yes clawhub -- --help` 排查。'
  }

  return output || fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

function createLogEntry(level: LogLevel, source: LogEntry['source'], message: string): LogEntry {
  return {
    id: randomUUID(),
    timestamp: nowIso(),
    level,
    source,
    message,
  }
}

function createDefaultServiceStatus(): ServiceDetail {
  return {
    id: 'openclaw',
    name: 'openclaw',
    status: 'stopped',
    message: 'openclaw process was not detected.',
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toEnvPlaceholder(name: string): string {
  return `\${${name}}`
}

function defaultEnvVarForProvider(provider: QuickModelProvider): string | undefined {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'google':
      return 'GEMINI_API_KEY'
    case 'openrouter':
      return 'OPENROUTER_API_KEY'
    case 'custom-openai':
      return 'LLM_API_KEY'
    default:
      return undefined
  }
}

function normalizeProcessName(command: string, processName?: string): string {
  if (processName && processName.trim()) {
    return processName.trim()
  }

  return path.basename(command).trim()
}

function summarizeCommandOutput(text: string): string {
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' ')
    .replace(/\s+/g, ' ')

  if (!normalized) {
    return 'No output.'
  }

  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized
}

function expandHomePath(targetPath: string): string {
  if (targetPath.startsWith('~/')) {
    return path.join(process.env.HOME ?? '~', targetPath.slice(2))
  }

  return targetPath
}

function isDefaultServiceBootstrapConfig(config: ManClawConfig): boolean {
  return (
    config.service.command === DEFAULT_CONFIG.service.command &&
    config.service.args.length === 0 &&
    config.service.cwd === DEFAULT_CONFIG.service.cwd &&
    config.service.processName === DEFAULT_CONFIG.service.processName &&
    config.service.configPath === DEFAULT_CONFIG.service.configPath &&
    config.service.healthcheck.url === DEFAULT_CONFIG.service.healthcheck.url
  )
}

function parseGatewayStatusOutput(output: string): {
  configPath?: string
  port?: number
  args?: string[]
  healthUrl?: string
} {
  const commandLine = output.match(/^Command:\s+(.+)$/m)?.[1]?.trim()
  const configPathRaw = output.match(/^Config \(cli\):\s+(.+)$/m)?.[1]?.trim()
  const listeningRaw = output.match(/^Listening:\s+[^:]+:(\d+)$/m)?.[1]?.trim()
  const probeTarget = output.match(/^Probe target:\s+ws:\/\/[^:]+:(\d+)/m)?.[1]?.trim()

  const result: {
    configPath?: string
    port?: number
    args?: string[]
    healthUrl?: string
  } = {}

  if (configPathRaw) {
    result.configPath = expandHomePath(configPathRaw)
  }

  const portText = listeningRaw || probeTarget
  if (portText) {
    const port = Number(portText)
    if (Number.isFinite(port) && port > 0) {
      result.port = port
      result.healthUrl = `http://127.0.0.1:${port}/health`
    }
  }

  if (commandLine) {
    const gatewayIndex = commandLine.indexOf(' gateway ')
    if (gatewayIndex >= 0) {
      result.args = commandLine
        .slice(gatewayIndex + 1)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    }
  }

  if ((!result.args || result.args.length === 0) && result.port) {
    result.args = ['gateway', '--port', String(result.port)]
  }

  return result
}

function parseSkillFrontmatter(content: string): { title?: string; summary?: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) {
    return {}
  }

  const title = match[1].match(/(?:^|\n)name:\s*(.+)/)?.[1]?.trim()
  const summary = match[1].match(/(?:^|\n)description:\s*(.+)/)?.[1]?.trim()

  return { title, summary }
}

function buildServiceArgs(service: ManClawConfig['service']): string[] {
  const args = [...service.args]
  const hasExplicitConfig = service.configPath && args.includes(service.configPath)

  if (service.configPath && service.configFlag && !hasExplicitConfig) {
    if (service.configFlag) {
      args.push(service.configFlag, service.configPath)
    } else {
      args.push(service.configPath)
    }
  }

  return args
}

function buildServiceEnv(service: ManClawConfig['service']): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...service.env,
  }

  if (service.configPath && !service.configFlag) {
    env.OPENCLAW_CONFIG_PATH = service.configPath
  }

  return env
}

function normalizeConfig(candidate: unknown): ManClawConfig {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Config must be an object.')
  }

  const config = candidate as Partial<ManClawConfig>
  const service = config.service

  if (!service || typeof service !== 'object') {
    throw new Error('Config.service is required.')
  }

  if (typeof service.command !== 'string' || service.command.trim() === '') {
    throw new Error('Config.service.command must be a non-empty string.')
  }

  if (!Array.isArray(service.args) || service.args.some((item) => typeof item !== 'string')) {
    throw new Error('Config.service.args must be an array of strings.')
  }

  if (typeof service.cwd !== 'string' || service.cwd.trim() === '') {
    throw new Error('Config.service.cwd must be a non-empty string.')
  }

  const env = service.env ?? {}
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('Config.service.env must be an object.')
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      throw new Error(`Config.service.env.${key} must be a string.`)
    }
  }

  const shell = config.shell ?? { timeoutMs: 10_000 }
  if (typeof shell !== 'object' || shell === null) {
    throw new Error('Config.shell must be an object.')
  }

  const timeoutMs = shell.timeoutMs ?? 10_000
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Config.shell.timeoutMs must be a positive number.')
  }

  const ui = config.ui ?? { restartNotice: null }
  if (typeof ui !== 'object' || ui === null) {
    throw new Error('Config.ui must be an object.')
  }

  const restartNotice = ui.restartNotice
  if (
    restartNotice !== null &&
    restartNotice !== undefined &&
    (typeof restartNotice !== 'object' ||
      typeof restartNotice.message !== 'string' ||
      typeof restartNotice.status !== 'string' ||
      typeof restartNotice.isError !== 'boolean' ||
      typeof restartNotice.updatedAt !== 'string')
  ) {
    throw new Error('Config.ui.restartNotice is invalid.')
  }

  const healthcheck = service.healthcheck ?? {
    enabled: false,
    url: 'http://127.0.0.1:8080/health',
    timeoutMs: 3_000,
    expectedStatus: 200,
  }

  if (typeof healthcheck !== 'object' || healthcheck === null) {
    throw new Error('Config.service.healthcheck must be an object.')
  }

  if (typeof healthcheck.enabled !== 'boolean') {
    throw new Error('Config.service.healthcheck.enabled must be a boolean.')
  }

  if (typeof healthcheck.url !== 'string') {
    throw new Error('Config.service.healthcheck.url must be a string.')
  }

  if (typeof healthcheck.timeoutMs !== 'number' || !Number.isFinite(healthcheck.timeoutMs) || healthcheck.timeoutMs <= 0) {
    throw new Error('Config.service.healthcheck.timeoutMs must be a positive number.')
  }

  if (typeof healthcheck.expectedStatus !== 'number' || !Number.isFinite(healthcheck.expectedStatus) || healthcheck.expectedStatus <= 0) {
    throw new Error('Config.service.healthcheck.expectedStatus must be a positive number.')
  }

  return {
    service: {
      command: service.command,
      args: service.args,
      cwd: service.cwd,
      env: env as Record<string, string>,
      autoStart: Boolean(service.autoStart),
      autoRestart: typeof service.autoRestart === 'boolean' ? service.autoRestart : true,
      processName: normalizeProcessName(service.command, typeof service.processName === 'string' ? service.processName : undefined),
      configPath: typeof service.configPath === 'string' ? service.configPath : '',
      configFlag: typeof service.configFlag === 'string' ? service.configFlag : '',
      healthcheck: {
        enabled: healthcheck.enabled,
        url: healthcheck.url,
        timeoutMs: healthcheck.timeoutMs,
        expectedStatus: healthcheck.expectedStatus,
      },
    },
    shell: {
      timeoutMs,
    },
    ui: {
      restartNotice: restartNotice ?? null,
    },
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, 'utf8')) as T
}

export class ManClawManager {
  private readonly rootDir: string
  private readonly paths: ManagerPaths
  private readonly serviceState: ServiceState
  private readonly executions = new Map<string, ShellExecutionRecord>()
  private readonly skillDetailCache = new Map<string, CachedSkillDetail>()

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.paths = {
      dataDir: path.join(rootDir, '.manclaw'),
      configPath: path.join(rootDir, '.manclaw', 'config.json'),
      revisionsDir: path.join(rootDir, '.manclaw', 'revisions'),
      runtimeLogPath: path.join(rootDir, '.manclaw', 'runtime.log.jsonl'),
      auditLogPath: path.join(rootDir, '.manclaw', 'audit.log.jsonl'),
    }
    this.serviceState = {
      status: createDefaultServiceStatus(),
      stopRequested: false,
    }
  }

  async initialize(): Promise<void> {
    await mkdir(this.paths.dataDir, { recursive: true })
    await mkdir(this.paths.revisionsDir, { recursive: true })

    if (!(await fileExists(this.paths.configPath))) {
      await writeFile(this.paths.configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
    }

    await this.appendRuntimeLog('info', 'manclaw manager initialized')
    await this.bootstrapFromGatewayStatus()

    const config = await this.readConfigModel()
    if (config.service.autoStart) {
      await this.startService()
    }
  }

  async getHealthSnapshot(): Promise<HealthSnapshot> {
    return {
      generatedAt: nowIso(),
      services: [await this.getServiceSummary()],
    }
  }

  async getSystemSummary(): Promise<SystemSummary> {
    return {
      services: [await this.getServiceSummary()],
    }
  }

  async getServiceSummary(): Promise<ServiceSummary> {
    const status = await this.getServiceStatus()
    return {
      id: status.id,
      name: status.name,
      status: status.status,
      message: status.message,
    }
  }

  async getServiceStatus(): Promise<ServiceDetail> {
    const config = await this.readConfigModel()
    const current = this.serviceState.status
    const runningProcess = await this.findRunningProcess(config)
    const health: HealthProbeResult = runningProcess
      ? await this.probeHealth(config)
      : { status: 'disabled', message: 'Health check skipped because no process was found.' }
    const uptimeSeconds =
      current.startedAt && runningProcess && current.pid === runningProcess.pid
        ? Math.max(0, Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000))
        : undefined
    const args = buildServiceArgs(config.service)
    const cwd = path.resolve(this.rootDir, config.service.cwd)

    if (!runningProcess) {
      this.serviceState.status = {
        ...current,
        status: 'stopped',
        pid: undefined,
        message: `No running ${config.service.processName} process detected.`,
      }
    } else {
      this.serviceState.status = {
        ...current,
        status: health.status === 'failing' ? 'degraded' : 'running',
        pid: runningProcess.pid,
        message:
          health.status === 'failing'
            ? `Process detected but health check failed: ${health.message}`
            : health.status === 'passing'
              ? `Process detected and health check passed: ${health.message}`
              : `Process detected by ${runningProcess.detectedBy}.`,
        command: config.service.command,
        args,
        cwd,
        processName: config.service.processName,
        configPath: config.service.configPath,
        healthUrl: config.service.healthcheck.url,
        healthStatus: health.status,
        detectedBy: runningProcess.detectedBy,
        startedAt: runningProcess.detectedBy === 'managed' ? current.startedAt : undefined,
      }
    }

    return {
      ...this.serviceState.status,
      command: config.service.command,
      args,
      cwd,
      uptimeSeconds,
      processName: config.service.processName,
      configPath: config.service.configPath,
      healthUrl: config.service.healthcheck.url,
      healthStatus: runningProcess ? health.status : 'disabled',
    }
  }

  async startService(): Promise<ServiceDetail> {
    const config = await this.readConfigModel()
    const existingProcess = await this.findRunningProcess(config)
    if (existingProcess) {
      this.serviceState.status = {
        ...this.serviceState.status,
        status: 'running',
        pid: existingProcess.pid,
        message: `openclaw is already running with PID ${existingProcess.pid}.`,
      }
      return this.getServiceStatus()
    }

    const cwd = path.resolve(this.rootDir, config.service.cwd)
    const args = buildServiceArgs(config.service)
    this.serviceState.stopRequested = false
    const child = spawn(config.service.command, args, {
      cwd,
      env: buildServiceEnv(config.service),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.attachChildListeners(child)
    const spawnResult = await new Promise<{ ok: true } | { ok: false; error: Error }>((resolve) => {
      child.once('spawn', () => resolve({ ok: true }))
      child.once('error', (error) => resolve({ ok: false, error }))
    })

    if (!spawnResult.ok) {
      this.serviceState.child = undefined
      this.serviceState.status = {
        ...this.serviceState.status,
        status: 'degraded',
        message: spawnResult.error.message,
      }
      throw spawnResult.error
    }

    this.serviceState.child = child
    this.serviceState.status = {
      id: 'openclaw',
      name: 'openclaw',
      status: 'running',
      message: 'openclaw process started successfully.',
      startedAt: nowIso(),
      pid: child.pid,
      command: config.service.command,
      args,
      cwd,
      processName: config.service.processName,
      configPath: config.service.configPath,
      healthUrl: config.service.healthcheck.url,
      healthStatus: config.service.healthcheck.enabled ? 'failing' : 'disabled',
      detectedBy: 'managed',
    }

    await this.appendAuditLog(`service.start pid=${child.pid ?? 'unknown'}`)
    await this.appendRuntimeLog('info', `openclaw process started with command ${config.service.command}`)

    return this.getServiceStatus()
  }

  async stopService(): Promise<ServiceDetail> {
    const config = await this.readConfigModel()
    const child = this.serviceState.child
    this.serviceState.stopRequested = true
    if (this.serviceState.restartTimer) {
      clearTimeout(this.serviceState.restartTimer)
      this.serviceState.restartTimer = undefined
    }

    if (child && !child.killed && child.pid) {
      await this.terminatePid(child.pid)
      this.serviceState.child = undefined
      this.serviceState.status = {
        ...this.serviceState.status,
        status: 'stopped',
        message: 'Managed openclaw process stopped.',
        pid: undefined,
      }
      await this.appendAuditLog(`service.stop pid=${child.pid}`)
      await this.appendRuntimeLog('warn', 'managed openclaw process stopped')
      return this.getServiceStatus()
    }

    const externalProcess = await this.findRunningProcess(config)
    if (!externalProcess) {
      this.serviceState.status = {
        ...this.serviceState.status,
        status: 'stopped',
        message: 'openclaw is not running.',
      }
      return this.getServiceStatus()
    }

    await this.terminatePid(externalProcess.pid)
    this.serviceState.status = {
      ...this.serviceState.status,
      status: 'stopped',
      message: `External openclaw process ${externalProcess.pid} stopped.`,
      pid: undefined,
    }
    await this.appendAuditLog(`service.stop pid=${externalProcess.pid}`)
    await this.appendRuntimeLog('warn', `external openclaw process ${externalProcess.pid} stopped`)

    return this.getServiceStatus()
  }

  async restartService(): Promise<ServiceDetail> {
    await this.stopService()
    return this.startService()
  }

  async getManagerSettings(): Promise<ManagerSettingsDocument> {
    const fileStat = await stat(this.paths.configPath)
    return {
      path: this.paths.configPath,
      updatedAt: fileStat.mtime.toISOString(),
      config: await this.readConfigModel(),
    }
  }

  async saveManagerSettings(candidate: unknown): Promise<ManagerSettingsDocument> {
    const nextConfig = normalizeConfig(candidate)
    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.settings.save path=${this.paths.configPath}`)
    await this.appendRuntimeLog('info', `manager settings saved to ${this.paths.configPath}`)
    return this.getManagerSettings()
  }

  async getRestartNotice(): Promise<RestartNoticeDocument | null> {
    const config = await this.readConfigModel()
    return config.ui?.restartNotice ?? null
  }

  async saveRestartNotice(candidate: { message: string; status?: string; isError?: boolean }): Promise<RestartNoticeDocument> {
    const config = await this.readConfigModel()
    const notice: RestartNoticeDocument = {
      message: candidate.message.trim(),
      status: candidate.status?.trim() || '配置已更新，建议重启 OpenClaw 以立即生效。',
      isError: Boolean(candidate.isError),
      updatedAt: nowIso(),
    }

    if (!notice.message) {
      throw new Error('Restart notice message is required.')
    }

    config.ui = {
      ...(config.ui ?? {}),
      restartNotice: notice,
    }

    await writeFile(this.paths.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await this.appendAuditLog('ui.restart-notice.save')
    return notice
  }

  async clearRestartNotice(): Promise<void> {
    const config = await this.readConfigModel()
    config.ui = {
      ...(config.ui ?? {}),
      restartNotice: null,
    }
    await writeFile(this.paths.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await this.appendAuditLog('ui.restart-notice.clear')
  }

  async getQuickModelConfig(): Promise<QuickModelConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    return {
      availableProviders: QUICK_MODEL_PROVIDERS,
      current: this.extractQuickModelConfig(config),
    }
  }

  async saveQuickModelConfig(candidate: QuickModelConfig): Promise<ConfigDocument> {
    const provider = candidate.provider
    const model = candidate.model.trim()
    if (!provider) {
      throw new Error('Provider is required.')
    }
    if (!model) {
      throw new Error('Model is required.')
    }

    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const nextConfig = this.applyQuickModelConfig(config, candidate)
    return this.saveConfig(`${JSON.stringify(nextConfig, null, 2)}\n`, `Quick model setup: ${provider}/${model}`)
  }

  async getRecommendedSkillsCatalog(): Promise<SkillsCatalogDocument> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const installDir = path.join(workspaceDir, 'skills')
    const installedSlugs = await this.readInstalledSkillSlugs(workspaceDir)

    return {
      workspaceDir,
      installDir,
      registry: CLAWHUB_REGISTRY,
      items: RECOMMENDED_SKILLS.map((item) => ({
        ...item,
        installed: installedSlugs.has(item.slug),
      })),
    }
  }

  async getInstalledSkills(): Promise<InstalledSkillsDocument> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const installDir = path.join(workspaceDir, 'skills')
    const disabledDir = path.join(workspaceDir, '.manclaw-disabled-skills')

    return {
      workspaceDir,
      installDir,
      disabledDir,
      items: [
        ...(await this.readSkillEntries(installDir, 'installed')),
        ...(await this.readSkillEntries(disabledDir, 'disabled')),
      ].sort((left, right) => left.slug.localeCompare(right.slug)),
    }
  }

  async inspectSkill(slug: string): Promise<RegistrySkillDetail> {
    const normalized = slug.trim()
    if (!normalized) {
      throw new Error('Skill slug is required.')
    }

    const cached = this.skillDetailCache.get(normalized)
    if (cached && Date.now() - cached.cachedAt < SKILL_DETAIL_CACHE_TTL_MS) {
      return cached.value
    }

    const response = await fetch(`${CLAWHUB_REGISTRY}/api/v1/skills/${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status === 429) {
      if (cached) {
        await this.appendRuntimeLog('warn', `skill metadata rate-limited, serving cached entry: ${normalized}`)
        return cached.value
      }
      throw new Error('ClawHub 当前查询过于频繁，请稍后再试。')
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch skill metadata: HTTP ${response.status}`)
    }

    const payload = (await response.json()) as {
      skill?: { slug?: string; displayName?: string; summary?: string | null; updatedAt?: number }
      latestVersion?: { version?: string; license?: string | null } | null
      owner?: { handle?: string | null; displayName?: string | null } | null
      moderation?: {
        isSuspicious?: boolean
        isMalwareBlocked?: boolean
        summary?: string | null
      } | null
    }

    if (!payload.skill?.slug) {
      throw new Error(`Skill ${normalized} was not found.`)
    }

    const detail: RegistrySkillDetail = {
      slug: payload.skill.slug,
      title: payload.skill.displayName ?? payload.skill.slug,
      summary: payload.skill.summary ?? 'No summary.',
      owner: payload.owner?.displayName ?? payload.owner?.handle ?? 'unknown',
      latestVersion: payload.latestVersion?.version,
      updatedAt: typeof payload.skill.updatedAt === 'number' ? new Date(payload.skill.updatedAt).toISOString() : undefined,
      license: payload.latestVersion?.license ?? undefined,
      suspicious: Boolean(payload.moderation?.isSuspicious),
      malwareBlocked: Boolean(payload.moderation?.isMalwareBlocked),
      warning: payload.moderation?.summary ?? undefined,
      source: 'clawhub',
    }

    this.skillDetailCache.set(normalized, {
      value: detail,
      cachedAt: Date.now(),
    })

    return detail
  }

  async installSkill(slug: string, force = false, skipInspect = false): Promise<SkillMutationResult> {
    if (!skipInspect) {
      const detail = await this.inspectSkill(slug)
      if (detail.malwareBlocked) {
        throw new Error(`Skill ${slug} is blocked as malicious and cannot be installed.`)
      }
      if (detail.suspicious && !force) {
        throw new Error('This skill is flagged as suspicious. Confirm and force install to continue.')
      }
    }

    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const installPath = path.join(workspaceDir, 'skills', slug)
    if (!force && (await fileExists(installPath))) {
      return {
        slug,
        state: 'installed',
        message: '已安装，无需重复安装。',
      }
    }
    const args = getClawhubExecArgs(workspaceDir, 'install', slug, force)

    try {
      const { stdout, stderr } = await execFileAsync('npm', args, {
        cwd: this.rootDir,
        timeout: 60 * 1000,
        maxBuffer: 1024 * 1024 * 8,
        env: process.env,
      })
      const message = summarizeCommandOutput(stdout || stderr)
      await this.appendAuditLog(`skills.install slug=${slug} status=completed`)
      await this.appendRuntimeLog('info', `skill installed: ${slug} (${message})`)
      return {
        slug,
        state: 'installed',
        message,
      }
    } catch (error) {
      const message = formatExternalCommandError(error, 'Skill install failed.')
      await this.appendAuditLog(`skills.install slug=${slug} status=failed`)
      await this.appendRuntimeLog('error', `skill install failed: ${slug} (${message})`)
      throw new Error(message)
    }
  }

  async disableSkill(slug: string): Promise<SkillMutationResult> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const sourceDir = path.join(workspaceDir, 'skills', slug)
    const disabledDir = path.join(workspaceDir, '.manclaw-disabled-skills')
    const targetDir = path.join(disabledDir, slug)

    if (!(await fileExists(sourceDir))) {
      throw new Error(`Installed skill ${slug} was not found.`)
    }

    await mkdir(disabledDir, { recursive: true })
    if (await fileExists(targetDir)) {
      await rm(targetDir, { recursive: true, force: true })
    }
    await rename(sourceDir, targetDir)
    await this.removeSkillFromLockfile(workspaceDir, slug)
    await this.appendAuditLog(`skills.disable slug=${slug}`)
    await this.appendRuntimeLog('warn', `skill disabled: ${slug}`)
    return {
      slug,
      state: 'disabled',
      message: 'Skill moved out of the active skills directory.',
    }
  }

  async enableSkill(slug: string): Promise<SkillMutationResult> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const disabledDir = path.join(workspaceDir, '.manclaw-disabled-skills', slug)
    const installDir = path.join(workspaceDir, 'skills')
    const targetDir = path.join(installDir, slug)

    if (!(await fileExists(disabledDir))) {
      throw new Error(`Disabled skill ${slug} was not found.`)
    }

    await mkdir(installDir, { recursive: true })
    if (await fileExists(targetDir)) {
      await rm(targetDir, { recursive: true, force: true })
    }
    await rename(disabledDir, targetDir)
    await this.appendAuditLog(`skills.enable slug=${slug}`)
    await this.appendRuntimeLog('info', `skill enabled: ${slug}`)
    return {
      slug,
      state: 'installed',
      message: 'Skill restored to the active skills directory.',
    }
  }

  async deleteSkill(slug: string): Promise<SkillMutationResult> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const variants = await this.findSkillPathVariants(workspaceDir, slug)

    if (variants.length === 0) {
      throw new Error(`Skill ${slug} was not found.`)
    }

    for (const targetPath of variants) {
      await rm(targetPath, { recursive: true, force: true })
    }

    await this.removeSkillFromLockfile(workspaceDir, slug, { caseInsensitive: true })
    await this.appendAuditLog(`skills.delete slug=${slug}`)
    await this.appendRuntimeLog('warn', `skill deleted: ${slug} (${variants.map((item) => path.basename(item)).join(', ')})`)
    return {
      slug,
      state: 'removed',
      message:
        variants.length > 1
          ? `已删除 ${variants.length} 个同名技能变体：${variants.map((item) => path.basename(item)).join(', ')}。`
          : 'Skill files were removed from the workspace.',
    }
  }

  async updateSkill(slug: string): Promise<SkillMutationResult> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const installPath = path.join(workspaceDir, 'skills', slug)

    if (!(await fileExists(installPath))) {
      throw new Error(`Installed skill ${slug} was not found or is currently disabled.`)
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        'npm',
        getClawhubExecArgs(workspaceDir, 'update', slug),
        {
          cwd: this.rootDir,
          timeout: 60 * 1000,
          maxBuffer: 1024 * 1024 * 8,
          env: process.env,
        },
      )
      const message = summarizeCommandOutput(stdout || stderr)
      await this.appendAuditLog(`skills.update slug=${slug} status=completed`)
      await this.appendRuntimeLog('info', `skill updated: ${slug} (${message})`)
      return {
        slug,
        state: 'installed',
        message,
      }
    } catch (error) {
      const message = formatExternalCommandError(error, 'Skill update failed.')
      await this.appendAuditLog(`skills.update slug=${slug} status=failed`)
      await this.appendRuntimeLog('error', `skill update failed: ${slug} (${message})`)
      throw new Error(message)
    }
  }

  async installRecommendedSkills(slugs: string[]): Promise<SkillInstallResult> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const installDir = path.join(workspaceDir, 'skills')
    const requested = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))]

    if (requested.length === 0) {
      throw new Error('At least one skill slug is required.')
    }

    const allowed = new Set(RECOMMENDED_SKILLS.map((item) => item.slug))
    const results: SkillInstallResult['results'] = []

    await mkdir(installDir, { recursive: true })

    for (const slug of requested) {
      if (!allowed.has(slug)) {
        results.push({
          slug,
          ok: false,
          installed: false,
          message: 'Skill is not in the recommended list.',
        })
        continue
      }

      if (await fileExists(path.join(installDir, slug))) {
        results.push({
          slug,
          ok: true,
          installed: true,
          message: '已安装，无需重复安装。',
        })
        continue
      }

      try {
        const { stdout, stderr } = await execFileAsync('npm', getClawhubExecArgs(workspaceDir, 'install', slug), {
          cwd: this.rootDir,
          timeout: 60 * 1000,
          maxBuffer: 1024 * 1024 * 8,
          env: process.env,
        })

        const message = summarizeCommandOutput(stdout || stderr)
        results.push({
          slug,
          ok: true,
          installed: true,
          message,
        })
        await this.appendAuditLog(`skills.install slug=${slug} status=completed`)
        await this.appendRuntimeLog('info', `recommended skill installed: ${slug} (${message})`)
      } catch (error) {
        const message = formatExternalCommandError(error, 'Skill install failed.')
        results.push({
          slug,
          ok: false,
          installed: false,
          message,
        })
        await this.appendAuditLog(`skills.install slug=${slug} status=failed`)
        await this.appendRuntimeLog('error', `recommended skill install failed: ${slug} (${message})`)
      }
    }

    return {
      workspaceDir,
      installDir,
      results,
    }
  }

  async getCurrentConfig(): Promise<ConfigDocument> {
    const config = await this.readConfigModel()
    const targetPath = this.resolveServiceConfigPath(config)
    const fileStat = await stat(targetPath)
    return {
      format: 'json',
      path: targetPath,
      content: await readFile(targetPath, 'utf8'),
      updatedAt: fileStat.mtime.toISOString(),
    }
  }

  async validateConfig(content: string): Promise<ConfigValidationResult> {
    try {
      const parsed = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Config must be a JSON object.')
      }
      return {
        valid: true,
        errors: [],
      }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown config validation error.'],
      }
    }
  }

  async saveConfig(content: string, comment?: string): Promise<ConfigDocument> {
    const validation = await this.validateConfig(content)
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '))
    }

    const config = await this.readConfigModel()
    const targetPath = this.resolveServiceConfigPath(config)

    const revisionId = new Date().toISOString().replace(/[-:.TZ]/g, '')
    const revisionFile: ConfigRevisionFile = {
      id: revisionId,
      createdAt: nowIso(),
      comment,
      content,
    }

    if (await fileExists(targetPath)) {
      await writeFile(path.join(this.paths.revisionsDir, `${revisionId}.json`), `${JSON.stringify(revisionFile, null, 2)}\n`, 'utf8')
    }

    await writeFile(targetPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
    await this.appendAuditLog(`config.save revision=${revisionId}${comment ? ` comment=${comment}` : ''}`)
    await this.appendRuntimeLog('info', `service configuration saved to ${targetPath}`)

    return this.getCurrentConfig()
  }

  async getConfigRevisions(): Promise<ConfigRevision[]> {
    const filenames = (await readdir(this.paths.revisionsDir)).filter((filename) => filename.endsWith('.json')).sort().reverse()
    const revisions = await Promise.all(
      filenames.map(async (filename) => {
        const revision = await readJsonFile<ConfigRevisionFile>(path.join(this.paths.revisionsDir, filename))
        return {
          id: revision.id,
          createdAt: revision.createdAt,
          comment: revision.comment,
        }
      }),
    )

    return revisions
  }

  async rollbackConfig(revisionId: string): Promise<ConfigDocument> {
    const revisionPath = path.join(this.paths.revisionsDir, `${revisionId}.json`)
    if (!(await fileExists(revisionPath))) {
      throw new Error(`Revision ${revisionId} was not found.`)
    }

    const config = await this.readConfigModel()
    const targetPath = this.resolveServiceConfigPath(config)
    const revision = await readJsonFile<ConfigRevisionFile>(revisionPath)
    await writeFile(targetPath, revision.content.endsWith('\n') ? revision.content : `${revision.content}\n`, 'utf8')
    await this.appendAuditLog(`config.rollback revision=${revisionId}`)
    await this.appendRuntimeLog('warn', `service configuration rolled back to ${revisionId}`)

    return this.getCurrentConfig()
  }

  async getRuntimeLogs(limit = 100): Promise<LogEntry[]> {
    return this.readLogFile(this.paths.runtimeLogPath, limit)
  }

  async getAuditLogs(limit = 100): Promise<LogEntry[]> {
    return this.readLogFile(this.paths.auditLogPath, limit)
  }

  getAllowedCommands(): ShellAllowedCommand[] {
    return [
      {
        id: 'service.status',
        title: 'Show service status',
        description: 'Return the current openclaw process status.',
        riskLevel: 'low',
      },
      {
        id: 'service.start',
        title: 'Start service',
        description: 'Start the managed openclaw process.',
        riskLevel: 'medium',
      },
      {
        id: 'service.stop',
        title: 'Stop service',
        description: 'Stop the managed openclaw process.',
        riskLevel: 'medium',
      },
      {
        id: 'service.restart',
        title: 'Restart service',
        description: 'Restart the managed openclaw process.',
        riskLevel: 'medium',
      },
      {
        id: 'system.pwd',
        title: 'Print working directory',
        description: 'Show the current manager working directory.',
        riskLevel: 'low',
      },
      {
        id: 'system.node-version',
        title: 'Show Node.js version',
        description: 'Run node -v through the controlled executor.',
        riskLevel: 'low',
      },
      {
        id: 'logs.tail-runtime',
        title: 'Tail runtime logs',
        description: 'Read the latest runtime log lines.',
        riskLevel: 'low',
      },
      {
        id: 'openclaw.doctor-fix',
        title: 'Run openclaw doctor --fix',
        description: 'Run the OpenClaw doctor fixer against the current config and workspace.',
        riskLevel: 'medium',
      },
    ]
  }

  async executeAllowedCommand(commandId: string): Promise<ShellExecutionRecord> {
    const record: ShellExecutionRecord = {
      id: randomUUID(),
      commandId,
      status: 'running',
      startedAt: nowIso(),
      output: '',
    }

    this.executions.set(record.id, record)

    try {
      switch (commandId) {
        case 'service.status': {
          record.output = JSON.stringify(await this.getServiceStatus(), null, 2)
          record.exitCode = 0
          break
        }
        case 'service.start': {
          record.output = JSON.stringify(await this.startService(), null, 2)
          record.exitCode = 0
          break
        }
        case 'service.stop': {
          record.output = JSON.stringify(await this.stopService(), null, 2)
          record.exitCode = 0
          break
        }
        case 'service.restart': {
          record.output = JSON.stringify(await this.restartService(), null, 2)
          record.exitCode = 0
          break
        }
        case 'system.pwd': {
          record.output = this.rootDir
          record.exitCode = 0
          break
        }
        case 'system.node-version': {
          const { stdout } = await execFileAsync(process.execPath, ['-v'], {
            cwd: this.rootDir,
            timeout: (await this.readConfigModel()).shell.timeoutMs,
          })
          record.output = stdout.trim()
          record.exitCode = 0
          break
        }
        case 'logs.tail-runtime': {
          const entries = await this.getRuntimeLogs(20)
          record.output = entries.map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`).join('\n')
          record.exitCode = 0
          break
        }
        case 'openclaw.doctor-fix': {
          const config = await this.readConfigModel()
          const cwd = path.resolve(this.rootDir, config.service.cwd)
          const { stdout, stderr } = await execFileAsync(config.service.command, ['doctor', '--fix'], {
            cwd,
            env: buildServiceEnv(config.service),
            timeout: Math.max(config.shell.timeoutMs, 60_000),
            maxBuffer: 1024 * 1024 * 8,
          })
          record.output = `${stdout}${stderr}`.trim() || 'openclaw doctor --fix completed with no output.'
          record.exitCode = 0
          break
        }
        default:
          throw new Error(`Command ${commandId} is not allowed.`)
      }

      record.status = 'completed'
      record.completedAt = nowIso()
      await this.appendAuditLog(`shell.execute command=${commandId} status=completed`)
      return record
    } catch (error) {
      record.status = 'failed'
      record.completedAt = nowIso()
      record.exitCode = 1
      record.output = error instanceof Error ? error.message : 'Unknown shell execution error.'
      await this.appendAuditLog(`shell.execute command=${commandId} status=failed message=${record.output}`)
      return record
    }
  }

  getExecution(executionId: string): ShellExecutionRecord | undefined {
    return this.executions.get(executionId)
  }

  private async readConfigModel(): Promise<ManClawConfig> {
    return normalizeConfig(await readJsonFile<ManClawConfig>(this.paths.configPath))
  }

  private async bootstrapFromGatewayStatus(): Promise<void> {
    const config = await this.readConfigModel()
    if (!isDefaultServiceBootstrapConfig(config)) {
      return
    }

    try {
      const { stdout, stderr } = await execFileAsync('openclaw', ['gateway', 'status'], {
        cwd: this.rootDir,
        timeout: config.shell.timeoutMs,
        env: {
          ...process.env,
          ...config.service.env,
        },
      })
      const output = `${stdout}\n${stderr}`.trim()
      const discovered = parseGatewayStatusOutput(output)

      if (!discovered.configPath && !discovered.port && (!discovered.args || discovered.args.length === 0)) {
        return
      }

      const nextConfig: ManClawConfig = {
        ...config,
        service: {
          ...config.service,
          command: 'openclaw',
          args: discovered.args?.length ? discovered.args : config.service.args,
          cwd: discovered.configPath ? await this.deriveWorkspaceFromConfigPath(discovered.configPath, config.service.cwd) : config.service.cwd,
          configPath: discovered.configPath ?? config.service.configPath,
          healthcheck: {
            ...config.service.healthcheck,
            url: discovered.healthUrl ?? config.service.healthcheck.url,
          },
        },
      }

      await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
      await this.appendRuntimeLog('info', 'bootstrap config updated from `openclaw gateway status`')
    } catch (error) {
      await this.appendRuntimeLog(
        'warn',
        `bootstrap discovery via \`openclaw gateway status\` skipped: ${error instanceof Error ? summarizeCommandOutput(error.message) : 'unknown error'}`,
      )
    }
  }

  private async deriveWorkspaceFromConfigPath(configPath: string, fallbackCwd: string): Promise<string> {
    try {
      const raw = await readFile(configPath, 'utf8')
      const parsed = JSON.parse(raw) as { agents?: { defaults?: { workspace?: unknown } } }
      const workspace = parsed.agents?.defaults?.workspace
      return typeof workspace === 'string' && workspace.trim() ? workspace.trim() : fallbackCwd
    } catch {
      return fallbackCwd
    }
  }

  private async readInstalledSkillSlugs(workspaceDir: string): Promise<Set<string>> {
    const installed = new Set<string>()
    const lockPath = path.join(workspaceDir, '.clawhub', 'lock.json')

    if (await fileExists(lockPath)) {
      try {
        const lock = await readJsonFile<{ skills?: Record<string, unknown> }>(lockPath)
        Object.keys(lock.skills ?? {}).forEach((slug) => installed.add(slug))
      } catch {
        // Ignore malformed lockfiles and fall back to directory scan.
      }
    }

    const skillsDir = path.join(workspaceDir, 'skills')
    if (await fileExists(skillsDir)) {
      try {
        const entries = await readdir(skillsDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            installed.add(entry.name)
          }
        }
      } catch {
        // Ignore directory scan failures; best-effort installed state is enough.
      }
    }

    return installed
  }

  private async readSkillEntries(rootDir: string, state: InstalledSkillEntry['state']): Promise<InstalledSkillEntry[]> {
    if (!(await fileExists(rootDir))) {
      return []
    }

    const entries = await readdir(rootDir, { withFileTypes: true })
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const skillDir = path.join(rootDir, entry.name)
          const origin = await this.readSkillOrigin(skillDir)
          const metadata = await this.readLocalSkillMetadata(skillDir)
          return {
            slug: entry.name,
            title: metadata.title ?? entry.name,
            summary: metadata.summary ?? 'No description.',
            state,
            path: skillDir,
            version: origin?.installedVersion,
            registry: origin?.registry,
            installedAt: typeof origin?.installedAt === 'number' ? new Date(origin.installedAt).toISOString() : undefined,
          } satisfies InstalledSkillEntry
        }),
    )

    return items
  }

  private async readSkillOrigin(skillDir: string): Promise<SkillOriginFile | undefined> {
    const originPath = path.join(skillDir, '.clawhub', 'origin.json')
    if (!(await fileExists(originPath))) {
      return undefined
    }

    try {
      const origin = await readJsonFile<SkillOriginFile>(originPath)
      if (!origin.slug || !origin.installedVersion || typeof origin.installedAt !== 'number') {
        return undefined
      }
      return origin
    } catch {
      return undefined
    }
  }

  private async readLocalSkillMetadata(skillDir: string): Promise<{ title?: string; summary?: string }> {
    const skillPath = path.join(skillDir, 'SKILL.md')
    if (!(await fileExists(skillPath))) {
      return {}
    }

    try {
      const content = await readFile(skillPath, 'utf8')
      return parseSkillFrontmatter(content)
    } catch {
      return {}
    }
  }

  private async findSkillPathVariants(workspaceDir: string, slug: string): Promise<string[]> {
    const lowerSlug = slug.toLowerCase()
    const roots = [path.join(workspaceDir, 'skills'), path.join(workspaceDir, '.manclaw-disabled-skills')]
    const matches = new Set<string>()

    for (const rootDir of roots) {
      if (!(await fileExists(rootDir))) {
        continue
      }

      const entries = await readdir(rootDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }

        if (entry.name.toLowerCase() === lowerSlug) {
          matches.add(path.join(rootDir, entry.name))
        }
      }
    }

    return Array.from(matches)
  }

  private async removeSkillFromLockfile(workspaceDir: string, slug: string, options?: { caseInsensitive?: boolean }): Promise<void> {
    const lockPath = path.join(workspaceDir, '.clawhub', 'lock.json')
    if (!(await fileExists(lockPath))) {
      return
    }

    try {
      const lock = await readJsonFile<{ version?: number; skills?: Record<string, { version?: string | null; installedAt?: number }> }>(lockPath)
      if (!lock.skills) {
        return
      }

      const keysToDelete = Object.keys(lock.skills).filter((key) =>
        options?.caseInsensitive ? key.toLowerCase() === slug.toLowerCase() : key === slug,
      )

      if (keysToDelete.length === 0) {
        return
      }

      for (const key of keysToDelete) {
        delete lock.skills[key]
      }

      await writeFile(lockPath, `${JSON.stringify({ version: lock.version ?? 1, skills: lock.skills }, null, 2)}\n`, 'utf8')
    } catch {
      // Ignore malformed lockfiles.
    }
  }

  private resolveServiceConfigPath(config: ManClawConfig): string {
    const targetPath = config.service.configPath.trim()
    if (!targetPath) {
      throw new Error('Config.service.configPath must be configured.')
    }

    if (path.isAbsolute(targetPath)) {
      return targetPath
    }

    return path.resolve(this.rootDir, targetPath)
  }

  private extractQuickModelConfig(config: Record<string, unknown>): QuickModelConfig {
    const agents = asRecord(config.agents)
    const defaults = asRecord(agents.defaults)
    const modelConfig = asRecord(defaults.model)
    const primary = readString(modelConfig.primary) ?? 'openai/gpt-5.2'
    const separatorIndex = primary.indexOf('/')
    const providerId = separatorIndex >= 0 ? primary.slice(0, separatorIndex) : 'openai'
    const model = separatorIndex >= 0 ? primary.slice(separatorIndex + 1) : primary
    const env = asRecord(config.env)
    const models = asRecord(config.models)
    const providers = asRecord(models.providers)
    const customProvider = asRecord(providers[providerId])

    if (providerId === 'openai' || providerId === 'anthropic' || providerId === 'google' || providerId === 'openrouter') {
      const envVarName = defaultEnvVarForProvider(providerId)
      return {
        provider: providerId,
        model,
        envVarName,
        apiKey: envVarName ? readString(env[envVarName]) : undefined,
      }
    }

    if (providerId === 'ollama') {
      return {
        provider: 'ollama',
        model,
      }
    }

    const apiKeyPlaceholder = readString(customProvider.apiKey)
    const envVarName = apiKeyPlaceholder?.match(/^\$\{(.+)\}$/)?.[1]
    return {
      provider: 'custom-openai',
      model,
      customProviderId: providerId,
      baseUrl: readString(customProvider.baseUrl),
      envVarName,
      apiKey: envVarName ? readString(env[envVarName]) : undefined,
    }
  }

  private applyQuickModelConfig(config: Record<string, unknown>, candidate: QuickModelConfig): Record<string, unknown> {
    const nextConfig = structuredClone(config)
    const agents = asRecord(nextConfig.agents)
    const defaults = asRecord(agents.defaults)
    const modelConfig = asRecord(defaults.model)
    const env = asRecord(nextConfig.env)

    nextConfig.agents = agents
    agents.defaults = defaults
    defaults.model = modelConfig
    nextConfig.env = env

    if (candidate.provider === 'ollama') {
      modelConfig.primary = `ollama/${candidate.model.trim()}`
      return nextConfig
    }

    if (candidate.provider === 'custom-openai') {
      const providerId = candidate.customProviderId?.trim()
      const baseUrl = candidate.baseUrl?.trim()
      const envVarName = candidate.envVarName?.trim() || defaultEnvVarForProvider('custom-openai')
      if (!providerId) {
        throw new Error('Custom provider ID is required.')
      }
      if (!baseUrl) {
        throw new Error('Base URL is required for custom providers.')
      }
      if (!envVarName) {
        throw new Error('Environment variable name is required for custom providers.')
      }
      if (!candidate.apiKey?.trim()) {
        throw new Error('API key is required for custom providers.')
      }

      const models = asRecord(nextConfig.models)
      const providers = asRecord(models.providers)
      nextConfig.models = models
      models.mode = 'merge'
      models.providers = providers
      providers[providerId] = {
        baseUrl,
        apiKey: toEnvPlaceholder(envVarName),
        api: 'openai-completions',
        models: [{ id: candidate.model.trim(), name: candidate.model.trim() }],
      }
      env[envVarName] = candidate.apiKey.trim()
      modelConfig.primary = `${providerId}/${candidate.model.trim()}`
      return nextConfig
    }

    const envVarName = defaultEnvVarForProvider(candidate.provider)
    if (!envVarName) {
      throw new Error(`Unsupported provider: ${candidate.provider}`)
    }
    if (!candidate.apiKey?.trim()) {
      throw new Error('API key is required.')
    }
    env[envVarName] = candidate.apiKey.trim()
    modelConfig.primary = `${candidate.provider}/${candidate.model.trim()}`
    return nextConfig
  }

  private async findRunningProcess(config: ManClawConfig): Promise<DetectedProcess | undefined> {
    const managedChild = this.serviceState.child
    if (managedChild?.pid && !managedChild.killed) {
      const managedAlive = await this.isPidRunning(managedChild.pid)
      if (managedAlive) {
        return {
          pid: managedChild.pid,
          command: config.service.command,
          args: buildServiceArgs(config.service).join(' '),
          detectedBy: 'managed',
        }
      }

      this.serviceState.child = undefined
    }

    try {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,comm=,args='], {
        cwd: this.rootDir,
        timeout: config.shell.timeoutMs,
      })

      const processName = normalizeProcessName(config.service.command, config.service.processName)
      for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) {
          continue
        }

        const match = line.match(/^(\d+)\s+(\S+)\s+(.*)$/)
        if (!match) {
          continue
        }

        const [, pidText, commandName, args] = match
        const pid = Number(pidText)
        if (!Number.isFinite(pid) || pid === process.pid) {
          continue
        }

        const sameCommand = matchesProcessSignature(commandName, args, config.service.command, processName)

        if (sameCommand) {
          return {
            pid,
            command: commandName,
            args,
            detectedBy: 'process-scan',
          }
        }
      }
    } catch (error) {
      await this.appendRuntimeLog('error', `process scan failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }

    return undefined
  }

  private async probeHealth(config: ManClawConfig): Promise<HealthProbeResult> {
    if (!config.service.healthcheck.enabled) {
      return {
        status: 'disabled',
        message: 'Health check disabled.',
      }
    }

    if (!config.service.healthcheck.url.trim()) {
      return {
        status: 'failing',
        message: 'Health check is enabled but no URL is configured.',
      }
    }

    try {
      const response = await fetch(config.service.healthcheck.url, {
        signal: AbortSignal.timeout(config.service.healthcheck.timeoutMs),
      })

      if (response.status === config.service.healthcheck.expectedStatus) {
        return {
          status: 'passing',
          message: `HTTP ${response.status}`,
        }
      }

      return {
        status: 'failing',
        message: `Expected HTTP ${config.service.healthcheck.expectedStatus}, got HTTP ${response.status}.`,
      }
    } catch (error) {
      return {
        status: 'failing',
        message: error instanceof Error ? error.message : 'Health check request failed.',
      }
    }
  }

  private async isPidRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private async terminatePid(pid: number): Promise<void> {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return
    }

    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      if (!(await this.isPidRunning(pid))) {
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      return
    }
  }

  private attachChildListeners(child: ManagedChildProcess): void {
    let stdoutBuffer = ''
    let stderrBuffer = ''

    child.stdout.on('data', async (chunk: Buffer | string) => {
      stdoutBuffer = this.consumeOutputBuffer(stdoutBuffer, String(chunk), 'info')
    })

    child.stderr.on('data', async (chunk: Buffer | string) => {
      stderrBuffer = this.consumeOutputBuffer(stderrBuffer, String(chunk), 'error')
    })

    child.on('error', async (error) => {
      this.serviceState.status = {
        ...this.serviceState.status,
        status: 'degraded',
        message: error.message,
      }
      await this.appendRuntimeLog('error', `service process error: ${error.message}`)
    })

    child.on('exit', async (code, signal) => {
      const shouldRestart = !this.serviceState.stopRequested
      const config = await this.readConfigModel().catch(() => undefined)
      this.serviceState.child = undefined
      this.serviceState.restartTimer = undefined
      this.serviceState.status = {
        ...this.serviceState.status,
        status: 'stopped',
        pid: undefined,
        message: `openclaw exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}.`,
      }
      if (stdoutBuffer.trim()) {
        await this.appendRuntimeLog('info', stdoutBuffer.trim())
      }
      if (stderrBuffer.trim()) {
        await this.appendRuntimeLog('error', stderrBuffer.trim())
      }
      await this.appendRuntimeLog('warn', this.serviceState.status.message ?? 'openclaw exited.')

      if (shouldRestart && config?.service.autoRestart) {
        this.serviceState.status = {
          ...this.serviceState.status,
          status: 'degraded',
          message: 'openclaw exited unexpectedly, restarting in 2 seconds.',
        }
        await this.appendRuntimeLog('warn', 'openclaw exited unexpectedly, auto restart scheduled')
        this.serviceState.restartTimer = setTimeout(() => {
          this.serviceState.restartTimer = undefined
          void this.startService().catch(async (error) => {
            this.serviceState.status = {
              ...this.serviceState.status,
              status: 'degraded',
              message: error instanceof Error ? error.message : 'Auto restart failed.',
            }
            await this.appendRuntimeLog('error', `auto restart failed: ${error instanceof Error ? error.message : 'unknown error'}`)
          })
        }, 2_000)
      } else {
        this.serviceState.stopRequested = false
      }
    })
  }

  private consumeOutputBuffer(buffer: string, chunk: string, level: LogLevel): string {
    const combined = `${buffer}${chunk}`
    const lines = combined.split(/\r?\n/)
    const trailing = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        void this.appendRuntimeLog(level, trimmed)
      }
    }

    return trailing
  }

  private async appendRuntimeLog(level: LogLevel, message: string): Promise<void> {
    await this.appendLog(this.paths.runtimeLogPath, createLogEntry(level, 'service', message))
  }

  private async appendAuditLog(message: string): Promise<void> {
    await this.appendLog(this.paths.auditLogPath, createLogEntry('info', 'audit', message))
  }

  private async appendLog(targetPath: string, entry: LogEntry): Promise<void> {
    const existing = (await fileExists(targetPath)) ? await readFile(targetPath, 'utf8') : ''
    await writeFile(targetPath, `${existing}${JSON.stringify(entry)}\n`, 'utf8')
  }

  private async readLogFile(targetPath: string, limit: number): Promise<LogEntry[]> {
    if (!(await fileExists(targetPath))) {
      return []
    }

    const content = await readFile(targetPath, 'utf8')
    const entries: LogEntry[] = []
    let malformedCount = 0

    for (const line of content.split(/\r?\n/).filter(Boolean)) {
      try {
        entries.push(JSON.parse(line) as LogEntry)
      } catch {
        malformedCount += 1
      }
    }

    const recentEntries = entries.slice(-limit)

    if (malformedCount > 0) {
      recentEntries.push(createLogEntry('warn', 'app', `Skipped ${malformedCount} malformed log line(s) from ${path.basename(targetPath)}.`))
    }

    return recentEntries.slice(-limit).reverse()
  }
}

export function createManager(rootDir: string): ManClawManager {
  return new ManClawManager(rootDir)
}

export function createHealthSnapshot(services: ServiceSummary[]): HealthSnapshot {
  return {
    generatedAt: nowIso(),
    services,
  }
}
