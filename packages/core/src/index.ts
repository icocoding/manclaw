import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { randomBytes, randomUUID } from 'node:crypto'
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import type {
  AgentConfigDocument,
  AgentConfigEntry,
  AgentConfigPayload,
  AgentSubagentsConfig,
  AgentToolsProfile,
  AgentWorkspaceSkillEntry,
  ChannelConfigDocument,
  ChannelConfigPayload,
  ChannelBindingEntry,
  ConfigDocument,
  ConfigRevision,
  ConfigValidationResult,
  CreateProfilePayload,
  DeleteProfilePayload,
  FeishuToolsConfig,
  FeishuToolsConfigDocument,
  HealthSnapshot,
  InstalledSkillEntry,
  InstalledSkillsDocument,
  LogEntry,
  LogLevel,
  ManClawConfig,
  ManagerSettingsDocument,
  OpenClawPluginEntry,
  OpenClawPluginsDocument,
  PluginMutationResult,
  QuickModelConfigPayload,
  QuickModelConfigDocument,
  QuickModelEntry,
  QuickModelProvider,
  RecommendedSkill,
  RegistrySkillDetail,
  RestartNoticeDocument,
  ServiceDetail,
  ServiceDetectionSource,
  ServiceSummary,
  SkillsConfigDocument,
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
    id: 'default',
    label: 'Default',
    profileMode: 'default',
    profileName: undefined,
    command: 'openclaw',
    port: undefined,
    args: [],
    cwd: '.',
    env: {},
    autoStart: true,
    autoRestart: true,
    processName: 'openclaw-gateway',
    configPath: '',
    healthcheck: {
      enabled: false,
      url: 'http://127.0.0.1:8080/health',
      timeoutMs: 3_000,
      expectedStatus: 200,
    },
  },
  services: {
    items: [],
  },
  shell: {
    timeoutMs: 10_000,
  },
  ui: {
    accessToken: '',
    restartNotice: null,
  },
}

interface ManagerPaths {
  dataDir: string
  configPath: string
  revisionsDir: string
  runtimeLogPath: string
  auditLogPath: string
  runtimeStatePath: string
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
  detectedBy: ServiceDetectionSource
  managerName?: string
  startedAt?: string
  uptimeSeconds?: number
}

interface GatewayStatusCacheEntry {
  value: ReturnType<typeof parseGatewayStatusOutput>
  cachedAt: number
}

interface PersistedRuntimeState {
  pid: number
  serviceId: string
  startedAt?: string
}

interface PersistedRuntimeStateDocument {
  items: PersistedRuntimeState[]
}

function tokenizeProcessArgs(args: string): string[] {
  return args
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function createProcessNameCandidates(command: string, processName: string, serviceArgs: string[] = []): string[] {
  const candidates = new Set<string>()
  const commandBaseName = path.basename(command).trim()
  const normalizedProcessName = processName.trim()
  const primaryArg = serviceArgs[0]?.trim()

  if (normalizedProcessName) {
    candidates.add(normalizedProcessName)
  }

  if (commandBaseName) {
    candidates.add(commandBaseName)
  }

  if (primaryArg) {
    if (normalizedProcessName) {
      candidates.add(`${normalizedProcessName}-${primaryArg}`)
    }

    if (commandBaseName) {
      candidates.add(`${commandBaseName}-${primaryArg}`)
    }
  }

  return Array.from(candidates)
}

function matchesProcessSignature(commandName: string, args: string, command: string, processName: string, serviceArgs: string[] = []): boolean {
  const candidates = createProcessNameCandidates(command, processName, serviceArgs)
  const tokens = tokenizeProcessArgs(args)
  const expectedTokens = serviceArgs.filter((token) => token !== 'gateway')

  if (candidates.includes(commandName)) {
    if (expectedTokens.length === 0) {
      return true
    }

    let matched = 0
    for (const token of tokens) {
      if (token === expectedTokens[matched]) {
        matched += 1
        if (matched === expectedTokens.length) {
          return true
        }
      }
    }

    return false
  }

  if (expectedTokens.length > 0) {
    return false
  }

  return tokens.some((token) => token === command || candidates.includes(token))
}

function createServiceManagerCandidates(command: string, processName: string, serviceArgs: string[] = []): string[] {
  const values = createProcessNameCandidates(command, processName, serviceArgs)
  const candidates = new Set<string>()

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) {
      continue
    }

    candidates.add(normalized)
    candidates.add(`${normalized}.service`)
  }

  return Array.from(candidates)
}

function parseInteger(value: string): number | undefined {
  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parsePsElapsed(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const dayMatch = normalized.match(/^(\d+)-(\d{1,2}):(\d{2}):(\d{2})$/)
  if (dayMatch) {
    const [, days, hours, minutes, seconds] = dayMatch
    return Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
  }

  const hourMatch = normalized.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (hourMatch) {
    const [, hours, minutes, seconds] = hourMatch
    return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
  }

  const minuteMatch = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (minuteMatch) {
    const [, minutes, seconds] = minuteMatch
    return Number(minutes) * 60 + Number(seconds)
  }

  const integerValue = parseInteger(normalized)
  return integerValue
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

const DEFAULT_FEISHU_TOOLS_CONFIG: FeishuToolsConfig = {
  doc: true,
  chat: true,
  wiki: true,
  drive: true,
  perm: false,
  scopes: true,
  bitable: true,
}

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
    if (/openclaw/i.test(fallback)) {
      return '系统未找到 openclaw 命令。请先安装 openclaw，并确认它已加入 PATH，或在接入设置中填写正确的命令路径。'
    }
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

function createDefaultServiceStatus(service?: Pick<ManClawConfig['service'], 'id' | 'label'>): ServiceDetail {
  return {
    id: service?.id ?? 'openclaw',
    name: service?.label ?? service?.id ?? 'openclaw',
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

function deriveCustomProviderEnvVarName(providerId: string): string {
  const normalized = providerId
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return `${normalized || 'CUSTOM_OPENAI'}_API_KEY`
}

function isKnownQuickModelProvider(providerId: string): providerId is Exclude<QuickModelProvider, 'custom-openai'> {
  return providerId === 'openai' || providerId === 'anthropic' || providerId === 'google' || providerId === 'openrouter' || providerId === 'ollama'
}

function createModelEntryId(providerId: string, model: string, index: number): string {
  const providerSegment = providerId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const modelSegment = model.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  return `${providerSegment || 'model'}-${modelSegment || 'entry'}-${index + 1}`
}

function resolveQuickModelProviderKey(entry: {
  provider: QuickModelProvider
  customProviderId?: string
}): string {
  return entry.provider === 'custom-openai' ? entry.customProviderId?.trim() || 'custom-openai' : entry.provider
}

function createQuickModelRef(providerKey: string, model: string): string {
  return `${providerKey}/${model.trim()}`
}

function hasOwnKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0
}

function createAccessToken(): string {
  return randomBytes(24).toString('base64url')
}

function createAgentSourceId(agentId: string, index: number): string {
  const normalizedId = agentId.trim() || 'agent'
  return `${normalizedId}::${index + 1}`
}

function createAgentBindingId(agentId: string, index: number): string {
  const normalizedId = agentId.trim() || 'binding'
  return `${normalizedId}::binding::${index + 1}`
}

function createChannelSourceId(channelId: string, index: number): string {
  const normalizedId = channelId.trim() || 'channel'
  return `${normalizedId}::${index + 1}`
}

function createChannelBindingId(channelId: string, index: number): string {
  const normalizedId = channelId.trim() || 'binding'
  return `${normalizedId}::channel-binding::${index + 1}`
}

function normalizeAgentChannels(channels: string[]): string[] {
  return Array.from(
    new Set(
      channels
        .map((channel) => channel.trim())
        .filter(Boolean),
    ),
  )
}

function normalizeAgentBindings(
  agentId: string,
  bindings: Array<{
    id?: string
    channel?: string
    accountId?: string
  }>,
): Array<{
  id: string
  channel: string
  accountId?: string
}> {
  const seen = new Set<string>()

  return bindings
    .map((binding, index) => {
      const channel = binding.channel?.trim() ?? ''
      const accountId = binding.accountId?.trim() || undefined
      const id = binding.id?.trim() || createAgentBindingId(agentId, index)
      return {
        id,
        channel,
        accountId,
      }
    })
    .filter((binding) => {
      if (!binding.channel) {
        return false
      }

      const key = `${binding.channel}::${binding.accountId ?? ''}`
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function normalizeChannelBindings(
  channelId: string,
  bindings: Array<{
    id?: string
    agentId?: string
    accountId?: string
  }>,
): ChannelBindingEntry[] {
  const seen = new Set<string>()

  return bindings
    .map((binding, index) => {
      const agentId = binding.agentId?.trim() ?? ''
      const accountId = binding.accountId?.trim() || undefined
      const id = binding.id?.trim() || createChannelBindingId(channelId, index)
      return {
        id,
        agentId,
        accountId,
      }
    })
    .filter((binding) => {
      if (!binding.agentId) {
        return false
      }

      const key = `${binding.agentId}::${binding.accountId ?? ''}`
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean),
        ),
      )
    : []
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : undefined
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  const normalized = Math.floor(value)
  return normalized >= 0 ? normalized : undefined
}

function readModelPrimarySelection(value: unknown): string | undefined {
  const direct = readString(value)
  if (direct) {
    return direct
  }

  return readString(asRecord(value).primary)
}

function readAgentSubagents(value: unknown): AgentSubagentsConfig {
  const subagents = asRecord(value)
  return {
    modelPrimary: readModelPrimarySelection(subagents.model),
    thinking: readString(subagents.thinking),
    maxConcurrent: readPositiveInteger(subagents.maxConcurrent),
    maxSpawnDepth: readPositiveInteger(subagents.maxSpawnDepth),
    maxChildrenPerAgent: readPositiveInteger(subagents.maxChildrenPerAgent),
    archiveAfterMinutes: readNonNegativeInteger(subagents.archiveAfterMinutes),
    runTimeoutSeconds: readNonNegativeInteger(subagents.runTimeoutSeconds),
    announceTimeoutMs: readPositiveInteger(subagents.announceTimeoutMs),
    allowAgents: readStringList(subagents.allowAgents),
  }
}

function isEmptyAgentSubagents(value: AgentSubagentsConfig | undefined): boolean {
  if (!value) {
    return true
  }

  return !(
    value.modelPrimary ||
    value.thinking ||
    typeof value.maxConcurrent === 'number' ||
    typeof value.maxSpawnDepth === 'number' ||
    typeof value.maxChildrenPerAgent === 'number' ||
    typeof value.archiveAfterMinutes === 'number' ||
    typeof value.runTimeoutSeconds === 'number' ||
    typeof value.announceTimeoutMs === 'number' ||
    value.allowAgents.length > 0
  )
}

function parseOptionalIntegerField(
  value: unknown,
  fieldName: string,
  options: {
    min: number
    max?: number
  },
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`)
  }

  if (value < options.min) {
    throw new Error(`${fieldName} must be >= ${options.min}.`)
  }

  if (typeof options.max === 'number' && value > options.max) {
    throw new Error(`${fieldName} must be <= ${options.max}.`)
  }

  return value
}

const AGENT_TOOLS_PROFILE_VALUES = new Set(['minimal', 'coding', 'messaging', 'full'])

function readAgentToolsProfile(value: unknown): AgentToolsProfile | undefined {
  const profile = readString(value)
  if (!profile || !AGENT_TOOLS_PROFILE_VALUES.has(profile)) {
    return undefined
  }

  return profile as AgentToolsProfile
}

function extractBalancedJsonValue(output: string, startIndex: number): string | null {
  const opening = output[startIndex]
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : ''

  if (!closing) {
    return null
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < output.length; index += 1) {
    const char = output[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === opening) {
      depth += 1
      continue
    }

    if (char === closing) {
      depth -= 1
      if (depth === 0) {
        return output.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

function parseJsonObjectFromMixedOutput<T>(output: string): T {
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index]
    if (char !== '{' && char !== '[') {
      continue
    }

    const candidate = extractBalancedJsonValue(output, index)
    if (!candidate) {
      continue
    }

    try {
      return JSON.parse(candidate) as T
    } catch {
      continue
    }
  }

  throw new Error('Command did not return parseable JSON output.')
}

function buildProfileSuffix(profileMode?: ManClawConfig['service']['profileMode'], profileName?: string, serviceId?: string): string {
  if (profileMode === 'profile' && profileName?.trim()) {
    return profileName.trim()
  }

  if (profileMode === 'dev') {
    return 'dev'
  }

  if (serviceId?.trim()) {
    return serviceId.trim()
  }

  return 'default'
}

function buildProfileHomeDir(
  profileMode?: ManClawConfig['service']['profileMode'],
  profileName?: string,
  serviceId?: string,
): string {
  const homeDir = process.env.HOME ?? ''
  if (!homeDir) {
    return `.openclaw-${buildProfileSuffix(profileMode, profileName, serviceId)}`
  }

  if (profileMode === 'default') {
    return path.join(homeDir, '.openclaw')
  }

  return path.join(homeDir, `.openclaw-${buildProfileSuffix(profileMode, profileName, serviceId)}`)
}

function buildDefaultProfileWorkspace(
  profileMode?: ManClawConfig['service']['profileMode'],
  profileName?: string,
  serviceId?: string,
): string {
  return path.join(buildProfileHomeDir(profileMode, profileName, serviceId), 'workspace')
}

function normalizeProcessName(
  command: string,
  processName?: string,
  serviceArgs: string[] = [],
  profileMode?: ManClawConfig['service']['profileMode'],
  profileName?: string,
  serviceId?: string,
): string {
  if (processName && processName.trim()) {
    return processName.trim()
  }

  const commandBaseName = path.basename(command).trim()
  const primaryArg = serviceArgs[0]?.trim()
  if (commandBaseName && primaryArg) {
    return `${commandBaseName}-${primaryArg}-${buildProfileSuffix(profileMode, profileName, serviceId)}`
  }

  return commandBaseName ? `${commandBaseName}-${buildProfileSuffix(profileMode, profileName, serviceId)}` : 'openclaw-default'
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
    config.service.profileMode === DEFAULT_CONFIG.service.profileMode &&
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

  if (configPathRaw && !configPathRaw.includes('(missing)')) {
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

function parseOnboardOutput(output: string): {
  configPath?: string
  workspace?: string
} {
  const configPathRaw = output.match(/^Updated\s+(.+openclaw\.json)$/m)?.[1]?.trim()
  const workspaceRaw = output.match(/^Workspace OK:\s+(.+)$/m)?.[1]?.trim()

  return {
    configPath: configPathRaw ? expandHomePath(configPathRaw) : undefined,
    workspace: workspaceRaw ? expandHomePath(workspaceRaw) : undefined,
  }
}

function parseConfigFileOutput(output: string): string | undefined {
  const normalized = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.endsWith('openclaw.json'))

  return normalized ? expandHomePath(normalized) : undefined
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

function buildServiceProfileArgs(service: ManClawConfig['service']): string[] {
  if (service.profileMode === 'dev') {
    return ['--dev']
  }

  if (service.profileMode === 'profile' && service.profileName?.trim()) {
    return ['--profile', service.profileName.trim()]
  }

  return []
}

function buildServicePortArgs(service: ManClawConfig['service']): string[] {
  return typeof service.port === 'number' && Number.isFinite(service.port) && service.port > 0
    ? ['--port', String(service.port)]
    : []
}

function buildServiceArgs(service: ManClawConfig['service']): string[] {
  return [...buildServiceProfileArgs(service), ...service.args, ...buildServicePortArgs(service)]
}

function buildServiceEnv(service: ManClawConfig['service'], options?: { includeConfigPath?: boolean }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
  }

  delete env.http_proxy
  delete env.https_proxy
  delete env.all_proxy
  delete env.no_proxy
  delete env.HTTP_PROXY
  delete env.HTTPS_PROXY
  delete env.ALL_PROXY
  delete env.NO_PROXY

  Object.assign(env, service.env)

  if (options?.includeConfigPath !== false && service.configPath) {
    env.OPENCLAW_CONFIG_PATH = service.configPath
  }

  return env
}

function extractOpenClawGlobalArgs(serviceArgs: string[]): string[] {
  const prefix: string[] = []

  for (let index = 0; index < serviceArgs.length; index += 1) {
    const current = serviceArgs[index]?.trim()
    if (!current) {
      continue
    }

    if (current === '--dev' || current === '--no-color') {
      prefix.push(current)
      continue
    }

    if (current === '--profile' || current === '--log-level') {
      prefix.push(current)
      const next = serviceArgs[index + 1]?.trim()
      if (next) {
        prefix.push(next)
        index += 1
      }
      continue
    }

    if (current.startsWith('--profile=') || current.startsWith('--log-level=')) {
      prefix.push(current)
      continue
    }

    break
  }

  return prefix
}

function buildOpenClawCliArgs(service: ManClawConfig['service'], commandArgs: string[]): string[] {
  return [...buildServiceProfileArgs(service), ...extractOpenClawGlobalArgs(service.args), ...commandArgs]
}

function extractProfileSettings(service: Partial<ManClawConfig['service']>): {
  profileMode: ManClawConfig['service']['profileMode']
  profileName?: string
  args: string[]
} {
  const explicitMode = service.profileMode
  const explicitName = typeof service.profileName === 'string' ? service.profileName.trim() : ''
  const rawArgs = Array.isArray(service.args) ? service.args.map((item) => item.trim()).filter(Boolean) : []

  if (explicitMode === 'dev') {
    return {
      profileMode: 'dev',
      profileName: undefined,
      args: rawArgs,
    }
  }

  if (explicitMode === 'profile') {
    return {
      profileMode: 'profile',
      profileName: explicitName || undefined,
      args: rawArgs,
    }
  }

  if (rawArgs[0] === '--dev') {
    return {
      profileMode: 'dev',
      profileName: undefined,
      args: rawArgs.slice(1),
    }
  }

  if (rawArgs[0] === '--profile' && rawArgs[1]) {
    return {
      profileMode: 'profile',
      profileName: rawArgs[1],
      args: rawArgs.slice(2),
    }
  }

  if (rawArgs[0]?.startsWith('--profile=')) {
    return {
      profileMode: 'profile',
      profileName: rawArgs[0].slice('--profile='.length) || undefined,
      args: rawArgs.slice(1),
    }
  }

  return {
    profileMode: 'default',
    profileName: undefined,
    args: rawArgs,
  }
}

function extractPortSettings(service: Partial<ManClawConfig['service']>): {
  port?: number
  args: string[]
} {
  const explicitPort = service.port
  const rawArgs = Array.isArray(service.args) ? service.args.map((item) => item.trim()).filter(Boolean) : []

  if (typeof explicitPort === 'number' && Number.isFinite(explicitPort) && explicitPort > 0) {
    return {
      port: explicitPort,
      args: rawArgs.filter((item, index) => {
        if (item === '--port') {
          return false
        }
        if (index > 0 && rawArgs[index - 1] === '--port') {
          return false
        }
        return !item.startsWith('--port=')
      }),
    }
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const current = rawArgs[index]
    if (current === '--port') {
      const next = Number(rawArgs[index + 1])
      return {
        port: Number.isFinite(next) && next > 0 ? next : undefined,
        args: rawArgs.filter((item, itemIndex) => itemIndex !== index && itemIndex !== index + 1),
      }
    }

    if (current.startsWith('--port=')) {
      const parsed = Number(current.slice('--port='.length))
      return {
        port: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
        args: rawArgs.filter((_, itemIndex) => itemIndex !== index),
      }
    }
  }

  return {
    port: undefined,
    args: rawArgs,
  }
}

function normalizeManagedService(
  candidate: unknown,
  fallback: ManClawConfig['service'],
  index = 0,
): ManClawConfig['service'] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`Config.services.items[${index}] must be an object.`)
  }

  const service = candidate as Partial<ManClawConfig['service']> & { configFlag?: unknown }
  if (typeof service.command !== 'string' || service.command.trim() === '') {
    throw new Error(`Config.services.items[${index}].command must be a non-empty string.`)
  }
  if (!Array.isArray(service.args) || service.args.some((item) => typeof item !== 'string')) {
    throw new Error(`Config.services.items[${index}].args must be an array of strings.`)
  }
  if (typeof service.cwd !== 'string' || service.cwd.trim() === '') {
    throw new Error(`Config.services.items[${index}].cwd must be a non-empty string.`)
  }

  const env = service.env ?? {}
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error(`Config.services.items[${index}].env must be an object.`)
  }
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      throw new Error(`Config.services.items[${index}].env.${key} must be a string.`)
    }
  }

  const healthcheck = service.healthcheck ?? fallback.healthcheck
  if (typeof healthcheck !== 'object' || healthcheck === null) {
    throw new Error(`Config.services.items[${index}].healthcheck must be an object.`)
  }
  if (typeof healthcheck.enabled !== 'boolean') {
    throw new Error(`Config.services.items[${index}].healthcheck.enabled must be a boolean.`)
  }
  if (typeof healthcheck.url !== 'string') {
    throw new Error(`Config.services.items[${index}].healthcheck.url must be a string.`)
  }
  if (typeof healthcheck.timeoutMs !== 'number' || !Number.isFinite(healthcheck.timeoutMs) || healthcheck.timeoutMs <= 0) {
    throw new Error(`Config.services.items[${index}].healthcheck.timeoutMs must be a positive number.`)
  }
  if (
    typeof healthcheck.expectedStatus !== 'number' ||
    !Number.isFinite(healthcheck.expectedStatus) ||
    healthcheck.expectedStatus <= 0
  ) {
    throw new Error(`Config.services.items[${index}].healthcheck.expectedStatus must be a positive number.`)
  }

  const id = typeof service.id === 'string' && service.id.trim()
    ? service.id.trim()
    : index === 0
      ? 'default'
      : `service-${index + 1}`
  const profileSettings = extractProfileSettings(service)
  const portSettings = extractPortSettings({
    ...service,
    args: profileSettings.args,
  })
  const effectivePort = portSettings.port
  const normalizedHealthUrl = typeof service.healthcheck?.url === 'string' && service.healthcheck.url.trim()
    ? service.healthcheck.url
    : effectivePort
      ? `http://127.0.0.1:${effectivePort}/health`
      : fallback.healthcheck.url

  return {
    id,
    label: typeof service.label === 'string' && service.label.trim() ? service.label.trim() : undefined,
    profileMode: profileSettings.profileMode,
    profileName: profileSettings.profileName,
    command: service.command.trim(),
    port: effectivePort,
    args: portSettings.args,
    cwd: service.cwd.trim(),
    env: env as Record<string, string>,
    autoStart: typeof service.autoStart === 'boolean' ? service.autoStart : fallback.autoStart,
    autoRestart: typeof service.autoRestart === 'boolean' ? service.autoRestart : fallback.autoRestart,
    processName: normalizeProcessName(
      service.command.trim(),
      typeof service.processName === 'string' ? service.processName : undefined,
      buildServiceArgs({
        ...fallback,
        ...service,
        command: service.command.trim(),
        profileMode: profileSettings.profileMode,
        profileName: profileSettings.profileName,
        port: effectivePort,
        args: portSettings.args,
      }),
      profileSettings.profileMode,
      profileSettings.profileName,
      id,
    ),
    configPath: typeof service.configPath === 'string' ? service.configPath.trim() : fallback.configPath,
    healthcheck: {
      enabled: healthcheck.enabled,
      url: normalizedHealthUrl,
      timeoutMs: healthcheck.timeoutMs,
      expectedStatus: healthcheck.expectedStatus,
    },
  }
}

function normalizeConfig(candidate: unknown): ManClawConfig {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Config must be an object.')
  }

  const config = candidate as Partial<ManClawConfig>
  const shell = config.shell ?? { timeoutMs: 10_000 }
  if (typeof shell !== 'object' || shell === null) {
    throw new Error('Config.shell must be an object.')
  }

  const timeoutMs = shell.timeoutMs ?? 10_000
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Config.shell.timeoutMs must be a positive number.')
  }

  const ui = config.ui ?? { accessToken: '', restartNotice: null }
  if (typeof ui !== 'object' || ui === null) {
    throw new Error('Config.ui must be an object.')
  }

  const accessToken = ui.accessToken
  if (accessToken !== undefined && (typeof accessToken !== 'string' || !accessToken.trim())) {
    throw new Error('Config.ui.accessToken must be a non-empty string when provided.')
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

  const legacyServiceCandidate = config.service ?? DEFAULT_CONFIG.service
  const normalizedLegacyService = normalizeManagedService(legacyServiceCandidate, DEFAULT_CONFIG.service)
  const servicesCandidate = (config as Partial<ManClawConfig> & { services?: { items?: unknown } }).services
  const rawItems = Array.isArray(servicesCandidate?.items) && servicesCandidate.items.length > 0
    ? servicesCandidate.items
    : [legacyServiceCandidate]
  const normalizedItems = rawItems.map((item, index) =>
    normalizeManagedService(item, index === 0 ? normalizedLegacyService : normalizedLegacyService, index),
  )
  const seenServiceIds = new Set<string>()
  normalizedItems.forEach((item) => {
    if (seenServiceIds.has(item.id)) {
      throw new Error(`Config.services.items contains duplicated id "${item.id}".`)
    }
    seenServiceIds.add(item.id)
  })

  const requestedActiveId = normalizedLegacyService.id
  const activeService = normalizedItems.find((item) => item.id === requestedActiveId) ?? normalizedItems[0]

  return {
    service: activeService,
    services: {
      items: normalizedItems,
    },
    shell: {
      timeoutMs,
    },
    ui: {
      accessToken: typeof accessToken === 'string' ? accessToken.trim() : '',
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
  private readonly serviceStates = new Map<string, ServiceState>()
  private readonly executions = new Map<string, ShellExecutionRecord>()
  private readonly skillDetailCache = new Map<string, CachedSkillDetail>()
  private readonly gatewayStatusCache = new Map<string, GatewayStatusCacheEntry>()

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.paths = {
      dataDir: path.join(rootDir, '.manclaw'),
      configPath: path.join(rootDir, '.manclaw', 'config.json'),
      revisionsDir: path.join(rootDir, '.manclaw', 'revisions'),
      runtimeLogPath: path.join(rootDir, '.manclaw', 'runtime.log.jsonl'),
      auditLogPath: path.join(rootDir, '.manclaw', 'audit.log.jsonl'),
      runtimeStatePath: path.join(rootDir, '.manclaw', 'runtime-state.json'),
    }
  }

  async initialize(): Promise<void> {
    await mkdir(this.paths.dataDir, { recursive: true })
    await mkdir(this.paths.revisionsDir, { recursive: true })

    if (!(await fileExists(this.paths.configPath))) {
      await writeFile(this.paths.configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
    }

    await this.ensureAccessToken()
    await this.appendRuntimeLog('info', 'manclaw manager initialized')
    await this.bootstrapFromGatewayStatus()
    await this.restoreManagedRuntimeState()

    const config = await this.readConfigModel()
    const services = config.services.items.length > 0 ? config.services.items : [config.service]
    for (const service of services) {
      if (!service.autoStart) {
        continue
      }

      const scopedConfig: ManClawConfig = {
        ...config,
        service,
      }
      await this.startService(scopedConfig).catch(() => undefined)
    }
  }

  async getHealthSnapshot(): Promise<HealthSnapshot> {
    const services = await this.getServiceStatuses()
    return {
      generatedAt: nowIso(),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        status: service.status,
        message: service.message,
      })),
    }
  }

  async getSystemSummary(): Promise<SystemSummary> {
    return {
      services: await this.getServiceSummaries(),
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

  async getServiceSummaries(): Promise<ServiceSummary[]> {
    const services = await this.getServiceStatuses()
    return services.map((service) => ({
      id: service.id,
      name: service.name,
      status: service.status,
      message: service.message,
    }))
  }

  async getServiceStatus(): Promise<ServiceDetail> {
    const config = await this.readConfigModel()
    return this.readServiceStatus(config, config.service)
  }

  async getServiceStatuses(): Promise<ServiceDetail[]> {
    const config = await this.readConfigModel()
    const services = config.services.items.length > 0 ? config.services.items : [config.service]
    const results: ServiceDetail[] = []

    for (const item of services) {
      results.push(await this.readServiceStatus(config, item))
    }

    return results
  }

  private async readServiceStatus(
    config: ManClawConfig,
    service: ManClawConfig['service'],
  ): Promise<ServiceDetail> {
    const state = this.getServiceState(service)
    const current = state.status
    const scopedConfig: ManClawConfig = {
      ...config,
      service,
    }
    const runningProcess = await this.findRunningProcess(scopedConfig, { serviceId: service.id, useManagedChild: true })
    const processTiming = runningProcess ? await this.readProcessTiming(scopedConfig, runningProcess.pid) : undefined
    const health: HealthProbeResult = runningProcess
      ? await this.probeHealth(scopedConfig)
      : { status: 'disabled', message: 'Health check skipped because no process was found.' }
    const uptimeSeconds =
      processTiming?.uptimeSeconds ??
      (current.startedAt && runningProcess && current.pid === runningProcess.pid
        ? Math.max(0, Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000))
        : undefined)
    const args = buildServiceArgs(service)
    const cwd = path.resolve(this.rootDir, service.cwd)
    const needsBootstrap = await this.serviceNeedsProfileBootstrap(service)

    const nextStatus: ServiceDetail = !runningProcess
      ? {
          ...current,
          id: service.id,
          name: service.label ?? service.id,
          status: 'stopped',
          pid: undefined,
          message: needsBootstrap
            ? `Profile ${service.id} 尚未初始化，启动时会先执行 OpenClaw onboard。`
            : `No running ${service.processName} process detected.`,
        }
      : {
          ...current,
          id: service.id,
          name: service.label ?? service.id,
          status: health.status === 'failing' ? 'degraded' : 'running',
          pid: runningProcess.pid,
          message:
            health.status === 'failing'
              ? `Process detected but health check failed: ${health.message}`
              : health.status === 'passing'
                ? `Process detected and health check passed: ${health.message}`
                : runningProcess.managerName
                  ? `Process detected by ${runningProcess.detectedBy} (${runningProcess.managerName}).`
                  : `Process detected by ${runningProcess.detectedBy}.`,
          command: service.command,
          args,
          cwd,
          processName: service.processName,
          configPath: service.configPath,
          healthUrl: service.healthcheck.url,
          healthStatus: health.status,
          detectedBy: runningProcess.detectedBy,
          managerName: runningProcess.managerName,
          startedAt:
            (runningProcess.detectedBy === 'managed' ? current.startedAt : undefined) ??
            runningProcess.startedAt ??
            processTiming?.startedAt,
        }

    state.status = nextStatus

    return {
      ...nextStatus,
      id: service.id,
      name: service.label ?? service.id,
      command: service.command,
      args,
      cwd,
      uptimeSeconds,
      processName: service.processName,
      configPath: service.configPath,
      healthUrl: service.healthcheck.url,
      healthStatus: runningProcess ? health.status : 'disabled',
      detectedBy: runningProcess?.detectedBy,
      managerName: runningProcess?.managerName,
    }
  }

  async startService(configOverride?: ManClawConfig): Promise<ServiceDetail> {
    let config = configOverride ?? await this.readConfigModel()
    config = await this.ensureCurrentServiceReady(config)
    const state = this.getServiceState(config.service)
    const existingProcess = await this.findRunningProcess(config, { serviceId: config.service.id, useManagedChild: true })
    if (existingProcess) {
      await this.saveRuntimeState(config.service.id, {
        pid: existingProcess.pid,
        serviceId: config.service.id,
        startedAt: state.status.startedAt ?? nowIso(),
      })
      state.status = {
        ...state.status,
        status: 'running',
        pid: existingProcess.pid,
        message: `openclaw is already running with PID ${existingProcess.pid}.`,
      }
      return this.readServiceStatus(config, config.service)
    }

    const cwd = path.resolve(this.rootDir, config.service.cwd)
    const args = buildServiceArgs(config.service)
    state.stopRequested = false
    const child = spawn(config.service.command, args, {
      cwd,
      env: buildServiceEnv(config.service),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.attachChildListeners(config.service, child)
    const spawnResult = await new Promise<{ ok: true } | { ok: false; error: Error }>((resolve) => {
      child.once('spawn', () => resolve({ ok: true }))
      child.once('error', (error) => resolve({ ok: false, error }))
    })

    if (!spawnResult.ok) {
      state.child = undefined
      state.status = {
        ...state.status,
        status: 'degraded',
        message: spawnResult.error.message,
      }
      throw spawnResult.error
    }

    state.child = child
    state.status = {
      id: config.service.id,
      name: config.service.label ?? config.service.id,
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
    if (child.pid) {
      await this.saveRuntimeState(config.service.id, {
        pid: child.pid,
        serviceId: config.service.id,
        startedAt: state.status.startedAt,
      })
    }

    await this.appendAuditLog(`service.start pid=${child.pid ?? 'unknown'}`)
    await this.appendRuntimeLog('info', `openclaw process started with command ${config.service.command}`)

    return this.readServiceStatus(config, config.service)
  }

  async stopService(configOverride?: ManClawConfig): Promise<ServiceDetail> {
    const config = configOverride ?? await this.readConfigModel()
    const state = this.getServiceState(config.service)
    const child = state.child
    state.stopRequested = true
    if (state.restartTimer) {
      clearTimeout(state.restartTimer)
      state.restartTimer = undefined
    }

    if (child && !child.killed && child.pid) {
      await this.terminatePid(child.pid)
      state.child = undefined
      await this.clearRuntimeState(config.service.id)
      state.status = {
        ...state.status,
        status: 'stopped',
        message: 'Managed openclaw process stopped.',
        pid: undefined,
      }
      await this.appendAuditLog(`service.stop pid=${child.pid}`)
      await this.appendRuntimeLog('warn', 'managed openclaw process stopped')
      return this.readServiceStatus(config, config.service)
    }

    const externalProcess = await this.findRunningProcess(config, { serviceId: config.service.id, useManagedChild: true })
    if (!externalProcess) {
      state.status = {
        ...state.status,
        status: 'stopped',
        message: 'openclaw is not running.',
      }
      return this.readServiceStatus(config, config.service)
    }

    await this.terminatePid(externalProcess.pid)
    await this.clearRuntimeState(config.service.id)
    state.status = {
      ...state.status,
      status: 'stopped',
      message: `External openclaw process ${externalProcess.pid} stopped.`,
      pid: undefined,
    }
    await this.appendAuditLog(`service.stop pid=${externalProcess.pid}`)
    await this.appendRuntimeLog('warn', `external openclaw process ${externalProcess.pid} stopped`)

    return this.readServiceStatus(config, config.service)
  }

  async restartService(configOverride?: ManClawConfig): Promise<ServiceDetail> {
    const config = configOverride ?? await this.readConfigModel()
    await this.stopService(config)
    return this.startService(config)
  }

  async getManagerSettings(): Promise<ManagerSettingsDocument> {
    const fileStat = await stat(this.paths.configPath)
    let config = await this.readConfigModel()
    config = await this.ensureCurrentServiceConfigPath(config)
    const currentWorkspace = await this.readWorkspaceFromCurrentConfig(config)
    const currentService = currentWorkspace
      ? {
          ...config.service,
          cwd: currentWorkspace,
        }
      : config.service

    return {
      path: this.paths.configPath,
      updatedAt: fileStat.mtime.toISOString(),
      config: {
        ...config,
        service: currentService,
        services: {
          ...config.services,
          items: config.services.items.map((item) =>
            item.id === currentService.id
              ? {
                  ...item,
                  cwd: currentService.cwd,
                }
              : item,
          ),
        },
        ui: {
          restartNotice: config.ui?.restartNotice ?? null,
        },
      },
    }
  }

  async saveManagerSettings(candidate: unknown): Promise<ManagerSettingsDocument> {
    const currentConfig = await this.readConfigModel()
    const nextConfig = normalizeConfig(candidate)
    nextConfig.ui = {
      accessToken: nextConfig.ui?.accessToken?.trim() || currentConfig.ui?.accessToken?.trim() || '',
      restartNotice: nextConfig.ui?.restartNotice ?? currentConfig.ui?.restartNotice ?? null,
    }
    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.settings.save path=${this.paths.configPath}`)
    await this.appendRuntimeLog('info', `manager settings saved to ${this.paths.configPath}`)
    return this.getManagerSettings()
  }

  async ensureAccessToken(): Promise<string> {
    const config = await this.readConfigModel()
    const existingToken = config.ui?.accessToken?.trim()
    if (existingToken) {
      return existingToken
    }

    const nextToken = createAccessToken()
    const nextConfig: ManClawConfig = {
      ...config,
      ui: {
        accessToken: nextToken,
        restartNotice: config.ui?.restartNotice ?? null,
      },
    }

    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.access-token.generated path=${this.paths.configPath}`)
    await this.appendRuntimeLog('info', `manager access token generated at ${this.paths.configPath}`)
    return nextToken
  }

  async getAccessToken(): Promise<string | undefined> {
    const config = await this.readConfigModel()
    const token = config.ui?.accessToken?.trim()
    return token || undefined
  }

  async createProfile(candidate: CreateProfilePayload): Promise<ManagerSettingsDocument> {
    const nextId = candidate.id.trim()
    if (!nextId) {
      throw new Error('Profile id is required.')
    }

    const config = await this.readConfigModel()
    const profiles = config.services.items.length > 0 ? [...config.services.items] : [config.service]
    if (profiles.some((item) => item.id === nextId)) {
      throw new Error(`Profile ${nextId} 已存在。`)
    }

    if (candidate.port !== undefined && (!Number.isInteger(candidate.port) || candidate.port <= 0)) {
      throw new Error('端口必须是正整数。')
    }

    const baseService = config.service
    const sourceId = candidate.sourceId?.trim()
    const workspaceSourceId = candidate.workspaceSourceId?.trim()
    if (sourceId && workspaceSourceId) {
      throw new Error('复制 Profile 与共享 workspace 不能同时启用。')
    }

    const sourceService = sourceId
      ? profiles.find((item) => item.id === sourceId)
      : undefined
    if (sourceId && !sourceService) {
      throw new Error(`Source profile ${sourceId} 不存在。`)
    }

    const workspaceSourceService = workspaceSourceId
      ? profiles.find((item) => item.id === workspaceSourceId)
      : undefined
    if (workspaceSourceId && !workspaceSourceService) {
      throw new Error(`Workspace source profile ${workspaceSourceId} 不存在。`)
    }

    const nextPort = candidate.port ?? this.suggestNextServicePort(profiles)
    const nextWorkspace = workspaceSourceService
      ? (await this.readWorkspaceForService(workspaceSourceService)) ?? workspaceSourceService.cwd
      : buildDefaultProfileWorkspace('profile', nextId, nextId)
    const nextService = normalizeManagedService(
      {
        ...baseService,
        id: nextId,
        label: nextId,
        profileMode: 'profile',
        profileName: nextId,
        port: nextPort,
        args: [...baseService.args],
        cwd: nextWorkspace,
        processName: `openclaw-gateway-${nextId}`,
        configPath: '',
        autoStart: false,
        healthcheck: {
          ...baseService.healthcheck,
          url: `http://127.0.0.1:${nextPort}/health`,
        },
      },
      baseService,
      profiles.length,
    )

    let initializedService = await this.initializeServiceProfile(config, nextService)
    if (sourceService) {
      initializedService = await this.copyProfileState(config, sourceService, initializedService)
    }
    const nextConfig = normalizeConfig({
      ...config,
      services: {
        items: [...profiles, initializedService],
      },
    })

    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.profiles.create id=${nextId} port=${nextPort}`)
    await this.appendRuntimeLog('info', `profile initialized: ${nextId}`)
    return this.getManagerSettings()
  }

  async deleteProfile(candidate: DeleteProfilePayload): Promise<ManagerSettingsDocument> {
    const profileId = candidate.id.trim()
    if (!profileId) {
      throw new Error('Profile id is required.')
    }

    const config = await this.readConfigModel()
    const profiles = config.services.items.length > 0 ? [...config.services.items] : [config.service]
    const target = profiles.find((item) => item.id === profileId)
    if (!target) {
      throw new Error(`Profile ${profileId} 不存在。`)
    }

    const remaining = profiles.filter((item) => item.id !== profileId)
    if (remaining.length === 0) {
      throw new Error('至少保留一个 Profile。')
    }

    const targetScopedConfig: ManClawConfig = {
      ...config,
      service: target,
    }
    if (await this.findRunningProcess(targetScopedConfig, { serviceId: target.id, useManagedChild: true })) {
      await this.stopService(targetScopedConfig).catch(() => undefined)
    }

    if (candidate.removeWorkspace) {
      await this.deleteProfileWorkspace(target, remaining)
    }

    const nextCurrentService = config.service.id === profileId ? remaining[0] : config.service
    const nextConfig = normalizeConfig({
      ...config,
      service: nextCurrentService,
      services: {
        items: remaining,
      },
    })

    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.profiles.delete id=${profileId} removeWorkspace=${candidate.removeWorkspace ? 'yes' : 'no'}`)
    await this.appendRuntimeLog('info', `profile deleted: ${profileId}`)
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
    const current = this.extractQuickModelConfig(config)
    return {
      availableProviders: QUICK_MODEL_PROVIDERS,
      defaultModelId: current.defaultModelId,
      entries: current.entries,
    }
  }

  async getAgentConfig(): Promise<AgentConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    return this.extractAgentConfig(config)
  }

  async saveAgentConfig(candidate: AgentConfigPayload): Promise<AgentConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    await this.ensureAgentWorkspaces(config, candidate)
    const refreshedDocument = await this.getCurrentConfig()
    const refreshedConfig = JSON.parse(refreshedDocument.content) as Record<string, unknown>
    const nextConfig = this.applyAgentConfig(refreshedConfig, candidate)
    await this.saveConfig(`${JSON.stringify(nextConfig, null, 2)}\n`, `Agent setup: ${candidate.defaultAgentId.trim()}`)
    return this.getAgentConfig()
  }

  async getChannelConfig(): Promise<ChannelConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    return this.extractChannelConfig(config)
  }

  async saveChannelConfig(candidate: ChannelConfigPayload): Promise<ChannelConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const nextConfig = this.applyChannelConfig(config, candidate)
    await this.saveConfig(`${JSON.stringify(nextConfig, null, 2)}\n`, 'Channels setup')
    return this.getChannelConfig()
  }

  async clearAgentSessions(agentId: string): Promise<{ agentId: string; storePath: string; clearedFiles: number }> {
    const normalizedAgentId = agentId.trim()
    if (!normalizedAgentId) {
      throw new Error('Agent id is required.')
    }

    const sessionStore = await this.getAgentSessionStoreInfo(normalizedAgentId)
    const sessionDir = path.dirname(sessionStore.path)
    if (!(await fileExists(sessionDir))) {
      throw new Error(`Session directory was not found for agent ${normalizedAgentId}.`)
    }

    const entries = await readdir(sessionDir, { withFileTypes: true })
    const filesToDelete = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(sessionDir, entry.name))

    await Promise.all(filesToDelete.map((targetPath) => rm(targetPath, { force: true })))
    await this.appendAuditLog(`agents.sessions.clear agent=${normalizedAgentId} files=${filesToDelete.length}`)
    await this.appendRuntimeLog('warn', `agent sessions cleared: agent=${normalizedAgentId} files=${filesToDelete.length}`)

    return {
      agentId: normalizedAgentId,
      storePath: sessionStore.path,
      clearedFiles: filesToDelete.length,
    }
  }

  async installAgentSkill(agentId: string, slug: string, force = false, skipInspect = false): Promise<SkillMutationResult> {
    const normalizedAgentId = agentId.trim()
    const normalizedSlug = slug.trim()
    if (!normalizedAgentId) {
      throw new Error('Agent id is required.')
    }
    if (!normalizedSlug) {
      throw new Error('Skill slug is required.')
    }
    if (!skipInspect) {
      const detail = await this.inspectSkill(normalizedSlug)
      if (detail.malwareBlocked) {
        throw new Error(`Skill ${normalizedSlug} is blocked as malicious and cannot be installed.`)
      }
      if (detail.suspicious && !force) {
        throw new Error('This skill is flagged as suspicious. Confirm and force install to continue.')
      }
    }

    const workspaceDir = await this.resolveWorkspaceDirForAgent(normalizedAgentId)
    const installPath = path.join(workspaceDir, 'skills', normalizedSlug)
    if (!force && (await fileExists(installPath))) {
      return {
        slug: normalizedSlug,
        state: 'installed',
        message: '已安装到该 Agent workspace，无需重复安装。',
      }
    }

    try {
      const { stdout, stderr } = await execFileAsync('npm', getClawhubExecArgs(workspaceDir, 'install', normalizedSlug, force), {
        cwd: this.rootDir,
        timeout: 60 * 1000,
        maxBuffer: 1024 * 1024 * 8,
        env: process.env,
      })
      const message = summarizeCommandOutput(stdout || stderr)
      await this.appendAuditLog(`agents.skills.install agent=${normalizedAgentId} slug=${normalizedSlug} status=completed`)
      await this.appendRuntimeLog('info', `agent skill installed: agent=${normalizedAgentId} slug=${normalizedSlug} (${message})`)
      return {
        slug: normalizedSlug,
        state: 'installed',
        message,
      }
    } catch (error) {
      const message = formatExternalCommandError(error, 'Agent skill install failed.')
      await this.appendAuditLog(`agents.skills.install agent=${normalizedAgentId} slug=${normalizedSlug} status=failed`)
      await this.appendRuntimeLog('error', `agent skill install failed: agent=${normalizedAgentId} slug=${normalizedSlug} (${message})`)
      throw new Error(message)
    }
  }

  async deleteAgentSkill(agentId: string, slug: string): Promise<SkillMutationResult> {
    const normalizedAgentId = agentId.trim()
    const normalizedSlug = slug.trim()
    if (!normalizedAgentId) {
      throw new Error('Agent id is required.')
    }
    if (!normalizedSlug) {
      throw new Error('Skill slug is required.')
    }

    const workspaceDir = await this.resolveWorkspaceDirForAgent(normalizedAgentId)
    const variants = await this.findSkillPathVariants(workspaceDir, normalizedSlug)

    if (variants.length === 0) {
      throw new Error(`Skill ${normalizedSlug} was not found in agent ${normalizedAgentId} workspace.`)
    }

    for (const targetPath of variants) {
      await rm(targetPath, { recursive: true, force: true })
    }

    await this.removeSkillFromLockfile(workspaceDir, normalizedSlug, { caseInsensitive: true })
    await this.appendAuditLog(`agents.skills.delete agent=${normalizedAgentId} slug=${normalizedSlug}`)
    await this.appendRuntimeLog('warn', `agent skill deleted: agent=${normalizedAgentId} slug=${normalizedSlug}`)
    return {
      slug: normalizedSlug,
      state: 'removed',
      message:
        variants.length > 1
          ? `已从 agent ${normalizedAgentId} 删除 ${variants.length} 个同名技能变体：${variants.map((item) => path.basename(item)).join(', ')}。`
          : `已从 agent ${normalizedAgentId} 的 workspace 删除技能。`,
    }
  }

  async saveQuickModelConfig(candidate: QuickModelConfigPayload): Promise<ConfigDocument> {
    if (!candidate.defaultModelId.trim()) {
      throw new Error('Default model is required.')
    }
    if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) {
      throw new Error('At least one model entry is required.')
    }

    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    this.assertRemovedModelsAreNotReferencedElsewhere(config, candidate)
    const nextConfig = this.applyQuickModelConfig(config, candidate)
    const defaultEntry = candidate.entries.find((entry) => entry.id === candidate.defaultModelId)
    const commentTarget = defaultEntry ? `${defaultEntry.provider}/${defaultEntry.modelId.trim()}` : candidate.defaultModelId
    return this.saveConfig(`${JSON.stringify(nextConfig, null, 2)}\n`, `Quick model setup: ${commentTarget}`)
  }

  async getOpenClawPlugins(): Promise<OpenClawPluginsDocument> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const command = config.service.command.trim() || 'openclaw'

    try {
      const { stdout, stderr } = await execFileAsync(command, buildOpenClawCliArgs(config.service, ['plugins', 'list', '--json']), {
        cwd: workspaceDir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 16,
        env: buildServiceEnv(config.service),
      })
      const payload = parseJsonObjectFromMixedOutput<{
        workspaceDir?: string
        plugins?: Array<{
          id?: string
          name?: string
          description?: string
          version?: string
          source?: string
          origin?: string
          enabled?: boolean
          status?: string
          toolNames?: string[]
          hookNames?: string[]
          channelIds?: string[]
          providerIds?: string[]
          gatewayMethods?: string[]
          cliCommands?: string[]
          services?: string[]
          commands?: string[]
          httpRoutes?: number
          hookCount?: number
          configSchema?: boolean
          error?: string
        }>
      }>(stdout || stderr)

      const items: OpenClawPluginEntry[] = (payload.plugins ?? []).map((plugin) => ({
        id: plugin.id ?? 'unknown',
        name: plugin.name ?? plugin.id ?? 'unknown',
        description: plugin.description ?? '',
        version: plugin.version,
        source: plugin.source ?? '',
        origin: plugin.origin,
        enabled: Boolean(plugin.enabled),
        status: plugin.status ?? 'unknown',
        toolNames: Array.isArray(plugin.toolNames) ? plugin.toolNames : [],
        hookNames: Array.isArray(plugin.hookNames) ? plugin.hookNames : [],
        channelIds: Array.isArray(plugin.channelIds) ? plugin.channelIds : [],
        providerIds: Array.isArray(plugin.providerIds) ? plugin.providerIds : [],
        gatewayMethods: Array.isArray(plugin.gatewayMethods) ? plugin.gatewayMethods : [],
        cliCommands: Array.isArray(plugin.cliCommands) ? plugin.cliCommands : [],
        services: Array.isArray(plugin.services) ? plugin.services : [],
        commands: Array.isArray(plugin.commands) ? plugin.commands : [],
        httpRoutes: typeof plugin.httpRoutes === 'number' ? plugin.httpRoutes : 0,
        hookCount: typeof plugin.hookCount === 'number' ? plugin.hookCount : 0,
        configSchema: Boolean(plugin.configSchema),
        error: plugin.error,
      }))

      return {
        workspaceDir: payload.workspaceDir ?? workspaceDir,
        loadedCount: items.filter((item) => item.status === 'loaded').length,
        totalCount: items.length,
        items,
      }
    } catch (error) {
      throw new Error(formatExternalCommandError(error, 'OpenClaw plugins list failed.'))
    }
  }

  async getOpenClawPlugin(pluginId: string): Promise<OpenClawPluginEntry> {
    const normalizedPluginId = pluginId.trim()
    if (!normalizedPluginId) {
      throw new Error('Plugin id is required.')
    }

    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const command = config.service.command.trim() || 'openclaw'

    try {
      const { stdout, stderr } = await execFileAsync(command, buildOpenClawCliArgs(config.service, ['plugins', 'info', normalizedPluginId, '--json']), {
        cwd: workspaceDir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 16,
        env: buildServiceEnv(config.service),
      })
      const plugin = parseJsonObjectFromMixedOutput<{
        id?: string
        name?: string
        description?: string
        version?: string
        source?: string
        origin?: string
        enabled?: boolean
        status?: string
        toolNames?: string[]
        hookNames?: string[]
        channelIds?: string[]
        providerIds?: string[]
        gatewayMethods?: string[]
        cliCommands?: string[]
        services?: string[]
        commands?: string[]
        httpRoutes?: number
        hookCount?: number
        configSchema?: boolean
        error?: string
      }>(stdout || stderr)

      return {
        id: plugin.id ?? normalizedPluginId,
        name: plugin.name ?? plugin.id ?? normalizedPluginId,
        description: plugin.description ?? '',
        version: plugin.version,
        source: plugin.source ?? '',
        origin: plugin.origin,
        enabled: Boolean(plugin.enabled),
        status: plugin.status ?? 'unknown',
        toolNames: Array.isArray(plugin.toolNames) ? plugin.toolNames : [],
        hookNames: Array.isArray(plugin.hookNames) ? plugin.hookNames : [],
        channelIds: Array.isArray(plugin.channelIds) ? plugin.channelIds : [],
        providerIds: Array.isArray(plugin.providerIds) ? plugin.providerIds : [],
        gatewayMethods: Array.isArray(plugin.gatewayMethods) ? plugin.gatewayMethods : [],
        cliCommands: Array.isArray(plugin.cliCommands) ? plugin.cliCommands : [],
        services: Array.isArray(plugin.services) ? plugin.services : [],
        commands: Array.isArray(plugin.commands) ? plugin.commands : [],
        httpRoutes: typeof plugin.httpRoutes === 'number' ? plugin.httpRoutes : 0,
        hookCount: typeof plugin.hookCount === 'number' ? plugin.hookCount : 0,
        configSchema: Boolean(plugin.configSchema),
        error: plugin.error,
      }
    } catch (error) {
      throw new Error(formatExternalCommandError(error, `OpenClaw plugin info failed for ${normalizedPluginId}.`))
    }
  }

  async getFeishuToolsConfig(): Promise<FeishuToolsConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const channels = asRecord(config.channels)
    const feishu = asRecord(channels.feishu)
    const tools = asRecord(feishu.tools)

    return {
      path: document.path,
      updatedAt: document.updatedAt,
      defaults: structuredClone(DEFAULT_FEISHU_TOOLS_CONFIG),
      current: {
        doc: typeof tools.doc === 'boolean' ? tools.doc : DEFAULT_FEISHU_TOOLS_CONFIG.doc,
        chat: typeof tools.chat === 'boolean' ? tools.chat : DEFAULT_FEISHU_TOOLS_CONFIG.chat,
        wiki: typeof tools.wiki === 'boolean' ? tools.wiki : DEFAULT_FEISHU_TOOLS_CONFIG.wiki,
        drive: typeof tools.drive === 'boolean' ? tools.drive : DEFAULT_FEISHU_TOOLS_CONFIG.drive,
        perm: typeof tools.perm === 'boolean' ? tools.perm : DEFAULT_FEISHU_TOOLS_CONFIG.perm,
        scopes: typeof tools.scopes === 'boolean' ? tools.scopes : DEFAULT_FEISHU_TOOLS_CONFIG.scopes,
        bitable: typeof tools.bitable === 'boolean' ? tools.bitable : DEFAULT_FEISHU_TOOLS_CONFIG.bitable,
      },
    }
  }

  async saveFeishuToolsConfig(candidate: FeishuToolsConfig): Promise<ConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const channels = asRecord(config.channels)
    const feishu = asRecord(channels.feishu)

    config.channels = channels
    channels.feishu = feishu
    feishu.tools = {
      doc: Boolean(candidate.doc),
      chat: Boolean(candidate.chat),
      wiki: Boolean(candidate.wiki),
      drive: Boolean(candidate.drive),
      perm: Boolean(candidate.perm),
      scopes: Boolean(candidate.scopes),
      bitable: Boolean(candidate.bitable),
    }

    return this.saveConfig(`${JSON.stringify(config, null, 2)}\n`, 'Feishu tools setup')
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<PluginMutationResult> {
    const trimmedPluginId = pluginId.trim()
    if (!trimmedPluginId) {
      throw new Error('Plugin id is required.')
    }

    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const command = config.service.command.trim() || 'openclaw'
    const action = enabled ? 'enable' : 'disable'

    try {
      const { stdout, stderr } = await execFileAsync(command, buildOpenClawCliArgs(config.service, ['plugins', action, trimmedPluginId]), {
        cwd: workspaceDir,
        timeout: Math.max(config.shell.timeoutMs, 120_000),
        maxBuffer: 1024 * 1024 * 16,
        env: buildServiceEnv(config.service),
      })

      const output = summarizeCommandOutput(`${stdout}${stderr}`)
      await this.appendAuditLog(`plugins.${action} id=${JSON.stringify(trimmedPluginId)} status=completed`)
      await this.appendRuntimeLog('info', `plugin ${action} completed: ${trimmedPluginId}`)
      return {
        pluginId: trimmedPluginId,
        action,
        output,
      }
    } catch (error) {
      const commandError = error as Error & { stdout?: string; stderr?: string }
      const stdout = typeof commandError.stdout === 'string' ? commandError.stdout : ''
      const stderr = typeof commandError.stderr === 'string' ? commandError.stderr : ''
      const message = summarizeCommandOutput(`${stdout}${stderr}`) || (error instanceof Error ? error.message : `Plugin ${action} failed.`)
      await this.appendAuditLog(`plugins.${action} id=${JSON.stringify(trimmedPluginId)} status=failed message=${JSON.stringify(message)}`)
      await this.appendRuntimeLog('error', `plugin ${action} failed: ${trimmedPluginId}`)
      throw new Error(message)
    }
  }

  async getRecommendedSkillsCatalog(): Promise<SkillsCatalogDocument> {
    const config = await this.readConfigModel()
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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

  async getSkillsConfig(): Promise<SkillsConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const skills = asRecord(config.skills)
    const allowBundled = Array.isArray(skills.allowBundled)
      ? Array.from(
          new Set(
            skills.allowBundled
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        )
      : []

    return {
      allowBundled,
    }
  }

  async saveSkillsConfig(candidate: SkillsConfigDocument): Promise<SkillsConfigDocument> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const skills = asRecord(config.skills)
    const normalizedAllowBundled = Array.from(
      new Set(
        candidate.allowBundled
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    )

    config.skills = skills
    skills.allowBundled = normalizedAllowBundled

    await this.saveConfig(`${JSON.stringify(config, null, 2)}\n`, 'Skills allowBundled setup')
    return {
      allowBundled: normalizedAllowBundled,
    }
  }

  async getInstalledSkills(): Promise<InstalledSkillsDocument> {
    const config = await this.readConfigModel()
    const workspaceDir = path.resolve(this.rootDir, config.service.cwd)
    const command = config.service.command.trim() || 'openclaw'
    const currentConfig = JSON.parse((await this.getCurrentConfig()).content) as Record<string, unknown>
    const configuredDefaultWorkspace = this.extractAgentConfigBase(currentConfig).defaults.workspace.trim()
    const defaultWorkspace = configuredDefaultWorkspace
      ? this.resolveWorkspacePath(configuredDefaultWorkspace)
      : buildDefaultProfileWorkspace(config.service.profileMode, config.service.profileName, config.service.id)

    try {
      const { stdout, stderr } = await execFileAsync(command, buildOpenClawCliArgs(config.service, ['skills', 'list', '--json']), {
        cwd: workspaceDir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 16,
        env: buildServiceEnv(config.service),
      })
      const payload = parseJsonObjectFromMixedOutput<{
        workspaceDir?: string
        managedSkillsDir?: string
        skills?: Array<{
          name?: string
          description?: string
          eligible?: boolean
          disabled?: boolean
          blockedByAllowlist?: boolean
          source?: string
          bundled?: boolean
          missing?: {
            bins?: string[]
            anyBins?: string[]
            env?: string[]
            config?: string[]
            os?: string[]
          }
        }>
      }>(stdout || stderr)

      const runtimeWorkspaceDir =
        typeof payload.workspaceDir === 'string' && payload.workspaceDir.trim()
          ? path.resolve(workspaceDir, payload.workspaceDir.trim())
          : defaultWorkspace
      const runtimeInstallDir = runtimeWorkspaceDir ? path.join(runtimeWorkspaceDir, 'skills') : undefined
      const runtimeDisabledDir = runtimeWorkspaceDir ? path.join(runtimeWorkspaceDir, '.manclaw-disabled-skills') : undefined
      const managedEntries = runtimeWorkspaceDir
        ? [
            ...(await this.readSkillEntries(runtimeInstallDir!, 'installed')),
            ...(await this.readSkillEntries(runtimeDisabledDir!, 'disabled')),
          ]
        : []
      const managedEntriesBySlug = new Map(managedEntries.map((item) => [item.slug, item]))

      const runtimeItems = (payload.skills ?? [])
        .filter((skill) => typeof skill.name === 'string' && skill.name.trim() !== '')
        .map((skill) => {
          const slug = skill.name!.trim()
          const managed = managedEntriesBySlug.get(slug)

          managedEntriesBySlug.delete(slug)

          return {
            slug,
            title: managed?.title ?? slug,
            summary: managed?.summary ?? skill.description ?? 'No description.',
            state: skill.disabled ? 'disabled' : 'installed',
            path: managed?.path,
            version: managed?.version,
            registry: managed?.registry,
            installedAt: managed?.installedAt,
            source: skill.source ?? managed?.registry,
            bundled: Boolean(skill.bundled),
            eligible: Boolean(skill.eligible),
            blockedByAllowlist: Boolean(skill.blockedByAllowlist),
            manageable: Boolean(managed),
            toggleManageable: true,
            managementMode: managed ? 'workspace' : 'config',
            missing: {
              bins: Array.isArray(skill.missing?.bins) ? skill.missing.bins : [],
              anyBins: Array.isArray(skill.missing?.anyBins) ? skill.missing.anyBins : [],
              env: Array.isArray(skill.missing?.env) ? skill.missing.env : [],
              config: Array.isArray(skill.missing?.config) ? skill.missing.config : [],
              os: Array.isArray(skill.missing?.os) ? skill.missing.os : [],
            },
          } satisfies InstalledSkillEntry
        })

      const localOnlyItems = Array.from(managedEntriesBySlug.values()).map((item) => ({
        ...item,
        manageable: true,
        toggleManageable: true,
        managementMode: 'workspace' as const,
      }))

      return {
        workspaceDir: runtimeWorkspaceDir,
        installDir: runtimeInstallDir,
        disabledDir: runtimeDisabledDir,
        managedSkillsDir: payload.managedSkillsDir,
        items: [...runtimeItems, ...localOnlyItems].sort((left, right) => left.slug.localeCompare(right.slug)),
      }
    } catch {
      const runtimeInstallDir = defaultWorkspace ? path.join(defaultWorkspace, 'skills') : undefined
      const runtimeDisabledDir = defaultWorkspace ? path.join(defaultWorkspace, '.manclaw-disabled-skills') : undefined
      const managedEntries = defaultWorkspace
        ? [
            ...(await this.readSkillEntries(runtimeInstallDir!, 'installed')),
            ...(await this.readSkillEntries(runtimeDisabledDir!, 'disabled')),
          ]
        : []
      return {
        workspaceDir: defaultWorkspace,
        installDir: runtimeInstallDir,
        disabledDir: runtimeDisabledDir,
        managedSkillsDir: undefined,
        items: managedEntries
          .map((item) => ({
            ...item,
            manageable: true,
          }))
          .sort((left, right) => left.slug.localeCompare(right.slug)),
      }
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
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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
    const installedSkills = await this.getInstalledSkills()
    const targetSkill = installedSkills.items.find((item) => item.slug === slug)
    if (!targetSkill) {
      throw new Error(`Skill ${slug} was not found.`)
    }

    if (!targetSkill.manageable && targetSkill.toggleManageable) {
      await this.setSkillEnabledInConfig(slug, false)
      await this.appendAuditLog(`skills.disable slug=${slug} mode=config`)
      await this.appendRuntimeLog('warn', `skill disabled via config: ${slug}`)
      return {
        slug,
        state: 'disabled',
        message: 'Skill disabled via openclaw.json `skills.entries`.',
      }
    }

    const config = await this.readConfigModel()
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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
    const installedSkills = await this.getInstalledSkills()
    const targetSkill = installedSkills.items.find((item) => item.slug === slug)
    if (!targetSkill) {
      throw new Error(`Skill ${slug} was not found.`)
    }

    if (!targetSkill.manageable && targetSkill.toggleManageable) {
      await this.setSkillEnabledInConfig(slug, true)
      await this.appendAuditLog(`skills.enable slug=${slug} mode=config`)
      await this.appendRuntimeLog('info', `skill enabled via config: ${slug}`)
      return {
        slug,
        state: 'installed',
        message: 'Skill enabled via openclaw.json `skills.entries`.',
      }
    }

    const config = await this.readConfigModel()
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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
    const workspaceDir = await this.resolveServiceWorkspaceDir(config.service)
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
    const targetPath = await this.resolveServiceConfigPath(config)
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
    const targetPath = await this.resolveServiceConfigPath(config)
    const revisionId = await this.createConfigRevisionSnapshot(targetPath, comment)

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
    const targetPath = await this.resolveServiceConfigPath(config)
    const revision = await readJsonFile<ConfigRevisionFile>(revisionPath)
    const backupRevisionId = await this.createConfigRevisionSnapshot(targetPath, `Before rollback to ${revisionId}`)
    await writeFile(targetPath, revision.content.endsWith('\n') ? revision.content : `${revision.content}\n`, 'utf8')
    await this.appendAuditLog(`config.rollback revision=${revisionId} backup=${backupRevisionId}`)
    await this.appendRuntimeLog('warn', `service configuration rolled back to ${revisionId}`)

    return this.getCurrentConfig()
  }

  async undoLastConfigChange(): Promise<ConfigDocument> {
    const [latestRevision] = await this.getConfigRevisions()
    if (!latestRevision) {
      throw new Error('No config revision available to undo.')
    }

    return this.rollbackConfig(latestRevision.id)
  }

  private async createConfigRevisionSnapshot(targetPath: string, comment?: string): Promise<string> {
    const revisionId = new Date().toISOString().replace(/[-:.TZ]/g, '')

    if (!(await fileExists(targetPath))) {
      return revisionId
    }

    const revisionFile: ConfigRevisionFile = {
      id: revisionId,
      createdAt: nowIso(),
      comment,
      content: await readFile(targetPath, 'utf8'),
    }

    await writeFile(path.join(this.paths.revisionsDir, `${revisionId}.json`), `${JSON.stringify(revisionFile, null, 2)}\n`, 'utf8')
    return revisionId
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
          const { stdout, stderr } = await execFileAsync(
            config.service.command,
            buildOpenClawCliArgs(config.service, ['doctor', '--fix']),
            {
            cwd,
            env: buildServiceEnv(config.service),
            timeout: Math.max(config.shell.timeoutMs, 60_000),
            maxBuffer: 1024 * 1024 * 8,
            },
          )
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

  async executePluginInstallCommand(command: string): Promise<ShellExecutionRecord> {
    const trimmedCommand = command.trim()
    if (!trimmedCommand) {
      throw new Error('Plugin install command is required.')
    }

    const config = await this.readConfigModel()
    const cwd = path.resolve(this.rootDir, config.service.cwd)
    const record: ShellExecutionRecord = {
      id: randomUUID(),
      commandId: 'plugins.install-custom',
      status: 'running',
      startedAt: nowIso(),
      output: '',
    }

    this.executions.set(record.id, record)

    try {
      const { stdout, stderr } = await execFileAsync('bash', ['-lc', trimmedCommand], {
        cwd,
        env: process.env,
        timeout: Math.max(config.shell.timeoutMs, 120_000),
        maxBuffer: 1024 * 1024 * 16,
      })

      record.status = 'completed'
      record.completedAt = nowIso()
      record.exitCode = 0
      record.output = `${stdout}${stderr}`.trim() || 'Command completed with no output.'
      await this.appendAuditLog(`plugins.install-command status=completed command=${JSON.stringify(trimmedCommand)}`)
      await this.appendRuntimeLog('info', `plugin install command completed: ${trimmedCommand}`)
      return record
    } catch (error) {
      record.status = 'failed'
      record.completedAt = nowIso()
      const commandError = error as Error & { stdout?: string; stderr?: string; code?: string }
      record.exitCode = typeof commandError.code === 'number' ? commandError.code : 1
      const stdout = typeof commandError.stdout === 'string' ? commandError.stdout : ''
      const stderr = typeof commandError.stderr === 'string' ? commandError.stderr : ''
      record.output = `${stdout}${stderr}`.trim() || (error instanceof Error ? error.message : 'Plugin install command failed.')
      await this.appendAuditLog(`plugins.install-command status=failed command=${JSON.stringify(trimmedCommand)} message=${JSON.stringify(record.output)}`)
      await this.appendRuntimeLog('error', `plugin install command failed: ${trimmedCommand}`)
      return record
    }
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
      const { stdout, stderr } = await this.runOpenClawGatewayStatus(config, config.service)
      const output = `${stdout}\n${stderr}`.trim()
      const discovered = parseGatewayStatusOutput(output)
      const discoveredPortSettings = extractPortSettings({
        args: discovered.args,
        port: discovered.port,
      })

      if (!discovered.configPath && !discovered.port && (!discovered.args || discovered.args.length === 0)) {
        return
      }

      const nextConfig: ManClawConfig = {
        ...config,
        service: {
          ...config.service,
          id: config.service.id,
          label: config.service.label,
          command: config.service.command,
          port: discoveredPortSettings.port ?? config.service.port,
          args: discoveredPortSettings.args.length > 0 ? discoveredPortSettings.args : config.service.args,
          cwd: config.service.cwd,
          configPath: discovered.configPath ?? config.service.configPath,
          processName: normalizeProcessName(
            config.service.command,
            config.service.processName,
            buildServiceArgs({
              ...config.service,
              port: discoveredPortSettings.port ?? config.service.port,
              args: discoveredPortSettings.args.length > 0 ? discoveredPortSettings.args : config.service.args,
            }),
            config.service.profileMode,
            config.service.profileName,
            config.service.id,
          ),
          healthcheck: {
            ...config.service.healthcheck,
            url: discovered.healthUrl ?? config.service.healthcheck.url,
          },
        },
        services: {
          ...config.services,
          items: config.services.items.map((item) =>
            item.id === config.service.id
              ? {
                  ...item,
                  command: config.service.command,
                  port: discoveredPortSettings.port ?? item.port,
                  args: discoveredPortSettings.args.length > 0 ? discoveredPortSettings.args : item.args,
                  cwd: item.cwd,
                  configPath: discovered.configPath ?? item.configPath,
                  processName: normalizeProcessName(
                    item.command,
                    item.processName,
                    buildServiceArgs({
                      ...item,
                      port: discoveredPortSettings.port ?? item.port,
                      args: discoveredPortSettings.args.length > 0 ? discoveredPortSettings.args : item.args,
                    }),
                    item.profileMode,
                    item.profileName,
                    item.id,
                  ),
                  healthcheck: {
                    ...item.healthcheck,
                    url: discovered.healthUrl ?? item.healthcheck.url,
                  },
                }
              : item,
          ),
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

  private async getAgentSessionStoreInfo(agentId: string): Promise<{ path: string; count: number }> {
    const config = await this.readConfigModel()
    const command = config.service.command.trim() || 'openclaw'

    try {
      const { stdout, stderr } = await execFileAsync(command, buildOpenClawCliArgs(config.service, ['sessions', '--agent', agentId, '--json']), {
        cwd: this.rootDir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 8,
        env: buildServiceEnv(config.service),
      })
      const payload = parseJsonObjectFromMixedOutput<{
        path?: string
        count?: number
      }>(stdout || stderr)
      const storePath = readString(payload.path)
      if (!storePath) {
        throw new Error('Session store path was not returned.')
      }

      return {
        path: storePath,
        count: typeof payload.count === 'number' ? payload.count : 0,
      }
    } catch (error) {
      throw new Error(formatExternalCommandError(error, `Failed to query sessions for agent ${agentId}.`))
    }
  }

  private resolveWorkspacePath(workspace: string): string {
    return path.isAbsolute(workspace) ? workspace : path.resolve(this.rootDir, workspace)
  }

  private async resolveWorkspaceDirForAgent(agentId: string): Promise<string> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const managerConfig = await this.readConfigModel()
    const agentConfig = this.extractAgentConfigBase(config)
    const target = agentConfig.items.find((item) => item.id === agentId)

    if (!target) {
      throw new Error(`Agent ${agentId} was not found.`)
    }

    const configuredDefaultWorkspace = agentConfig.defaults.workspace.trim()
    const fallbackWorkspace =
      (await this.readWorkspaceForService(managerConfig.service)) ??
      buildDefaultProfileWorkspace(managerConfig.service.profileMode, managerConfig.service.profileName, managerConfig.service.id)

    return this.resolveWorkspacePath(target.workspace?.trim() || configuredDefaultWorkspace || fallbackWorkspace)
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

  private async readAgentWorkspaceSkillEntries(workspaceDir: string): Promise<AgentWorkspaceSkillEntry[]> {
    const installedDir = path.join(workspaceDir, 'skills')
    const disabledDir = path.join(workspaceDir, '.manclaw-disabled-skills')
    const [installedEntries, disabledEntries] = await Promise.all([
      this.readSkillEntries(installedDir, 'installed'),
      this.readSkillEntries(disabledDir, 'disabled'),
    ])

    return [...installedEntries, ...disabledEntries]
      .map((entry) => ({
        slug: entry.slug,
        state: entry.state,
        path: entry.path ?? '',
      }))
      .sort((left, right) => left.slug.localeCompare(right.slug))
  }

  private async countAgentTranscriptFiles(storePath: string): Promise<number> {
    const sessionDir = path.dirname(storePath)
    if (!(await fileExists(sessionDir))) {
      return 0
    }

    const entries = await readdir(sessionDir, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() && entry.name !== path.basename(storePath)).length
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

  private async setSkillEnabledInConfig(slug: string, enabled: boolean): Promise<void> {
    const document = await this.getCurrentConfig()
    const config = JSON.parse(document.content) as Record<string, unknown>
    const skills = asRecord(config.skills)
    const entries = asRecord(skills.entries)
    const currentEntry = asRecord(entries[slug])

    config.skills = skills
    skills.entries = entries
    entries[slug] = {
      ...currentEntry,
      enabled,
    }

    await this.saveConfig(
      `${JSON.stringify(config, null, 2)}\n`,
      `${enabled ? 'Enable' : 'Disable'} skill via config: ${slug}`,
    )
  }

  private async runOpenClawGatewayStatus(
    config: ManClawConfig,
    service: ManClawConfig['service'],
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const cwd = path.resolve(this.rootDir, service.cwd)

    return new Promise((resolve, reject) => {
      const child = spawn(
        service.command,
        buildOpenClawCliArgs(service, ['gateway', 'status']),
        {
          cwd,
          env: buildServiceEnv(service, { includeConfigPath: false }),
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        },
      )

      let stdout = ''
      let stderr = ''
      let settled = false

      const cleanup = (): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
      }

      const forceKillGroup = (): void => {
        if (!child.pid) {
          return
        }

        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          try {
            child.kill('SIGKILL')
          } catch {
            // Ignore cleanup errors.
          }
        }
      }

      const timeoutHandle = setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        forceKillGroup()
        cleanup()
        reject(new Error('openclaw gateway status timed out.'))
      }, config.shell.timeoutMs)

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })

      child.once('error', (error) => {
        if (settled) {
          return
        }

        settled = true
        forceKillGroup()
        cleanup()
        reject(error)
      })

      child.once('close', (code) => {
        if (settled) {
          return
        }

        settled = true
        forceKillGroup()
        cleanup()
        resolve({ stdout, stderr, exitCode: code })
      })
    })
  }

  private async discoverGatewayStatus(
    config: ManClawConfig,
    service: ManClawConfig['service'],
  ): Promise<ReturnType<typeof parseGatewayStatusOutput>> {
    try {
      const { stdout, stderr } = await this.runOpenClawGatewayStatus(config, service)
      const value = parseGatewayStatusOutput(`${stdout}\n${stderr}`.trim())
      this.gatewayStatusCache.set(service.id, {
        value,
        cachedAt: Date.now(),
      })
      return value
    } catch {
      return {}
    }
  }

  private async discoverConfigPathViaCli(service: ManClawConfig['service']): Promise<string | undefined> {
    try {
      const { stdout, stderr } = await execFileAsync(
        service.command.trim() || 'openclaw',
        buildOpenClawCliArgs(service, ['config', 'file']),
        {
          cwd: this.rootDir,
          env: buildServiceEnv(
            {
              ...service,
              configPath: '',
            },
            { includeConfigPath: false },
          ),
          timeout: 10_000,
        },
      )

      return parseConfigFileOutput(`${stdout}\n${stderr}`.trim())
    } catch {
      return undefined
    }
  }

  private readCachedGatewayStatus(service: ManClawConfig['service']): ReturnType<typeof parseGatewayStatusOutput> {
    const entry = this.gatewayStatusCache.get(service.id)
    if (!entry) {
      return {}
    }

    if (Date.now() - entry.cachedAt > 60_000) {
      this.gatewayStatusCache.delete(service.id)
      return {}
    }

    return entry.value
  }

  private suggestNextServicePort(services: ManClawConfig['service'][]): number {
    const usedPorts = services
      .map((item) => item.port)
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0)

    if (usedPorts.length === 0) {
      return 18789
    }

    return Math.max(...usedPorts) + 1
  }

  private async ensureCurrentServiceConfigPath(config: ManClawConfig): Promise<ManClawConfig> {
    if (config.service.configPath.trim()) {
      return config
    }

    const discoveredPath = await this.discoverConfigPathViaCli(config.service)
    if (!discoveredPath) {
      return config
    }

    const nextService = normalizeManagedService(
      {
        ...config.service,
        configPath: discoveredPath,
      },
      config.service,
    )
    const nextConfig = normalizeConfig({
      ...config,
      service: nextService,
      services: {
        items: config.services.items.map((item) => (item.id === nextService.id ? { ...item, configPath: discoveredPath } : item)),
      },
    })

    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.config-path.discover id=${nextService.id}`)
    await this.appendRuntimeLog('info', `config path discovered via openclaw config file: ${nextService.id}`)
    return nextConfig
  }

  private async serviceNeedsProfileBootstrap(service: ManClawConfig['service']): Promise<boolean> {
    if (service.profileMode !== 'profile' || !service.profileName?.trim()) {
      return false
    }

    if (!service.configPath.trim()) {
      return true
    }

    const targetPath = path.isAbsolute(service.configPath)
      ? service.configPath
      : path.resolve(this.rootDir, service.configPath)

    return !(await fileExists(targetPath))
  }

  private async ensureCurrentServiceReady(config: ManClawConfig): Promise<ManClawConfig> {
    if (!(await this.serviceNeedsProfileBootstrap(config.service))) {
      return config
    }

    const initializedService = await this.initializeServiceProfile(config, config.service)
    const nextConfig = normalizeConfig({
      ...config,
      service: initializedService,
      services: {
        items: config.services.items.map((item) => (item.id === initializedService.id ? initializedService : item)),
      },
    })

    await writeFile(this.paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.appendAuditLog(`manager.profiles.repair id=${initializedService.id}`)
    await this.appendRuntimeLog('info', `profile auto-initialized before start: ${initializedService.id}`)
    return nextConfig
  }

  private async resolveServiceConfigPath(config: ManClawConfig): Promise<string> {
    const targetPath = config.service.configPath.trim()
    if (!targetPath) {
      throw new Error('Config.service.configPath must be configured.')
    }

    if (path.isAbsolute(targetPath)) {
      return targetPath
    }

    return path.resolve(this.rootDir, targetPath)
  }

  private async readWorkspaceFromCurrentConfig(config: ManClawConfig): Promise<string | undefined> {
    try {
      const targetPath = await this.resolveServiceConfigPath(config)
      const raw = await readFile(targetPath, 'utf8')
      const parsed = JSON.parse(raw) as { agents?: { defaults?: { workspace?: unknown } } }
      const workspace = parsed.agents?.defaults?.workspace
      return typeof workspace === 'string' && workspace.trim() ? workspace.trim() : undefined
    } catch {
      return undefined
    }
  }

  private async initializeServiceProfile(
    config: ManClawConfig,
    service: ManClawConfig['service'],
  ): Promise<ManClawConfig['service']> {
    if (service.profileMode !== 'profile' || !service.profileName?.trim()) {
      throw new Error(`Service "${service.id}" is not a named profile.`)
    }

    const workspace = service.cwd.trim()
    if (!workspace) {
      throw new Error(`Profile ${service.id} 缺少默认 workspace，无法执行 onboard。`)
    }

    const port = typeof service.port === 'number' && Number.isFinite(service.port) && service.port > 0 ? service.port : 18789
    const args = [
      ...buildServiceProfileArgs(service),
      'onboard',
      '--mode',
      'local',
      '--non-interactive',
      '--accept-risk',
      '--auth-choice',
      'skip',
      '--gateway-bind',
      'loopback',
      '--gateway-port',
      String(port),
      '--skip-health',
      '--skip-search',
      '--skip-channels',
      '--skip-skills',
      '--skip-ui',
      '--workspace',
      workspace,
      '--json',
    ]

    try {
      const { stdout, stderr } = await execFileAsync(service.command.trim() || 'openclaw', args, {
        cwd: this.rootDir,
        env: buildServiceEnv(
          {
            ...service,
            configPath: '',
          },
          { includeConfigPath: false },
        ),
        timeout: 30_000,
      })
      const discovered = parseOnboardOutput(`${stdout}\n${stderr}`.trim())
      const configPath = discovered.configPath?.trim()
      if (!configPath) {
        throw new Error('OpenClaw onboard completed, but config path was not reported.')
      }

      return normalizeManagedService(
        {
          ...service,
          cwd: discovered.workspace?.trim() || workspace,
          configPath,
          port,
          healthcheck: {
            ...service.healthcheck,
            url: `http://127.0.0.1:${port}/health`,
          },
        },
        config.service,
      )
    } catch (error) {
      const message = error instanceof Error ? summarizeCommandOutput(error.message) : 'Unknown error.'
      throw new Error(`Profile ${service.id} 初始化失败：${message}`)
    }
  }

  private async copyProfileState(
    config: ManClawConfig,
    sourceService: ManClawConfig['service'],
    targetService: ManClawConfig['service'],
  ): Promise<ManClawConfig['service']> {
    const sourceConfigPath = await this.resolveConfigPathForService(sourceService)
    if (!sourceConfigPath) {
      throw new Error(`Source profile ${sourceService.id} 缺少可读取的 openclaw.json。`)
    }

    const targetConfigPath = targetService.configPath.trim()
    if (!targetConfigPath) {
      throw new Error(`Target profile ${targetService.id} 缺少可写入的 openclaw.json。`)
    }

    const raw = await readFile(sourceConfigPath, 'utf8')
    const sourceConfig = JSON.parse(raw) as Record<string, unknown>
    const nextConfig = structuredClone(sourceConfig)
    const agents = asRecord(nextConfig.agents)
    const defaults = asRecord(agents.defaults)
    defaults.workspace = targetService.cwd
    agents.defaults = defaults
    nextConfig.agents = agents

    const gateway = asRecord(nextConfig.gateway)
    gateway.port = targetService.port
    nextConfig.gateway = gateway

    await writeFile(targetConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await this.copyProfileWorkspace(sourceService, targetService)
    await this.appendAuditLog(`manager.profiles.copy from=${sourceService.id} to=${targetService.id}`)
    await this.appendRuntimeLog('info', `profile copied: ${sourceService.id} -> ${targetService.id}`)
    return normalizeManagedService(
      {
        ...targetService,
        configPath: targetConfigPath,
      },
      config.service,
    )
  }

  private async copyProfileWorkspace(
    sourceService: ManClawConfig['service'],
    targetService: ManClawConfig['service'],
  ): Promise<void> {
    const sourceWorkspace = await this.readWorkspaceForService(sourceService)
    const targetWorkspace = targetService.cwd.trim()
    if (!sourceWorkspace || !targetWorkspace || sourceWorkspace === targetWorkspace) {
      return
    }

    if (!(await fileExists(sourceWorkspace))) {
      return
    }

    await rm(targetWorkspace, { recursive: true, force: true })
    await mkdir(path.dirname(targetWorkspace), { recursive: true })
    await cp(sourceWorkspace, targetWorkspace, {
      recursive: true,
      force: true,
    })
  }

  private async deleteProfileWorkspace(
    service: ManClawConfig['service'],
    remainingServices: ManClawConfig['service'][],
  ): Promise<void> {
    const targetWorkspace = await this.readWorkspaceForService(service)
    if (!targetWorkspace) {
      return
    }

    const sharedBy = await Promise.all(remainingServices.map((item) => this.readWorkspaceForService(item)))
    if (sharedBy.some((item) => item === targetWorkspace)) {
      throw new Error(`Workspace ${targetWorkspace} 仍被其他 profile 使用，不能删除。`)
    }

    await rm(targetWorkspace, { recursive: true, force: true })
  }

  private async readWorkspaceForService(service: ManClawConfig['service']): Promise<string | undefined> {
    const configPath = await this.resolveConfigPathForService(service)
    if (configPath) {
      try {
        const raw = await readFile(configPath, 'utf8')
        const parsed = JSON.parse(raw) as { agents?: { defaults?: { workspace?: unknown } } }
        const workspace = parsed.agents?.defaults?.workspace
        if (typeof workspace === 'string' && workspace.trim()) {
          return workspace.trim()
        }
      } catch {
        // Fall through to service.cwd.
      }
    }

    const cwd = service.cwd.trim()
    if (cwd && cwd !== '.') {
      return cwd
    }

    return buildDefaultProfileWorkspace(service.profileMode, service.profileName, service.id)
  }

  private async resolveServiceWorkspaceDir(service: ManClawConfig['service']): Promise<string> {
    const workspace =
      (await this.readWorkspaceForService(service)) ??
      buildDefaultProfileWorkspace(service.profileMode, service.profileName, service.id)

    return this.resolveWorkspacePath(workspace)
  }

  private async resolveConfigPathForService(service: ManClawConfig['service']): Promise<string | undefined> {
    const savedPath = service.configPath.trim()
    if (savedPath) {
      return path.isAbsolute(savedPath) ? savedPath : path.resolve(this.rootDir, savedPath)
    }

    const discoveredPath = await this.discoverConfigPathViaCli(service)
    if (!discoveredPath?.trim()) {
      return undefined
    }

    return path.isAbsolute(discoveredPath) ? discoveredPath : path.resolve(this.rootDir, discoveredPath)
  }

  private buildOpenClawAgentsUrl(config: Record<string, unknown>, service: ManClawConfig['service']): string {
    const port = typeof service.port === 'number' && Number.isFinite(service.port) && service.port > 0 ? service.port : 18789
    const baseUrl = `http://127.0.0.1:${port}/agents`
    const gateway = asRecord(config.gateway)
    const auth = asRecord(gateway.auth)
    const authMode = readString(auth.mode)?.trim()
    const authToken = readString(auth.token)?.trim()

    if (authMode === 'token' && authToken) {
      return `${baseUrl}#token=${encodeURIComponent(authToken)}`
    }

    return baseUrl
  }

  private extractQuickModelConfig(config: Record<string, unknown>): QuickModelConfigPayload {
    const agents = asRecord(config.agents)
    const defaults = asRecord(agents.defaults)
    const modelConfig = asRecord(defaults.model)
    const primary = readString(modelConfig.primary) ?? 'openai/gpt-5.2'
    const separatorIndex = primary.indexOf('/')
    const defaultProviderId = separatorIndex >= 0 ? primary.slice(0, separatorIndex) : 'openai'
    const defaultModel = separatorIndex >= 0 ? primary.slice(separatorIndex + 1) : primary
    const env = asRecord(config.env)
    const models = asRecord(config.models)
    const providers = asRecord(models.providers)
    const entries: QuickModelEntry[] = []
    let defaultModelId = ''

    const pushEntry = (
      providerId: string,
      providerConfig: Record<string, unknown>,
      modelId: string,
      configuredName: string | undefined,
      index: number,
    ): void => {
      const trimmedModelId = modelId.trim()
      if (!trimmedModelId) {
        return
      }
      const trimmedConfiguredName = configuredName?.trim()

      const providerType: QuickModelProvider = isKnownQuickModelProvider(providerId) ? providerId : 'custom-openai'
      const apiKeyPlaceholder = readString(providerConfig.apiKey)
      const hasManagedApiKeyConfig = providerConfig.apiKey !== undefined && !apiKeyPlaceholder
      const resolvedEnvVarName =
        providerType === 'custom-openai'
          ? apiKeyPlaceholder?.match(/^\$\{(.+)\}$/)?.[1]
          : defaultEnvVarForProvider(providerType)
      const directApiKey =
        providerType === 'custom-openai' && apiKeyPlaceholder && !resolvedEnvVarName
          ? apiKeyPlaceholder
          : undefined
      const entry: QuickModelEntry = {
        id: createModelEntryId(providerId, trimmedModelId, entries.length + index),
        provider: providerType,
        modelId: trimmedModelId,
        apiKeyConfigured: Boolean(apiKeyPlaceholder || hasManagedApiKeyConfig || (resolvedEnvVarName && env[resolvedEnvVarName] !== undefined)),
      }
      if (trimmedConfiguredName && trimmedConfiguredName !== trimmedModelId) {
        entry.name = trimmedConfiguredName
      }

      if (providerType === 'custom-openai') {
        entry.customProviderId = providerId
        entry.baseUrl = readString(providerConfig.baseUrl)
        if (directApiKey) {
          entry.envVarName = deriveCustomProviderEnvVarName(providerId)
          entry.apiKey = directApiKey
        }
      }
      if (resolvedEnvVarName) {
        entry.envVarName = resolvedEnvVarName
        entry.apiKey = readString(env[resolvedEnvVarName])
      }

      entries.push(entry)
      if (providerId === defaultProviderId && trimmedModelId === defaultModel && !defaultModelId) {
        defaultModelId = entry.id
      }
    }

    for (const [providerId, rawProviderConfig] of Object.entries(providers)) {
      const providerConfig = asRecord(rawProviderConfig)
      const providerModels = Array.isArray(providerConfig.models) ? providerConfig.models : []

      if (providerModels.length > 0) {
        providerModels.forEach((item, index) => {
          const modelRecord = asRecord(item)
          const modelId = readString(modelRecord.id) ?? readString(modelRecord.name)
          if (modelId) {
            pushEntry(
              providerId,
              providerConfig,
              modelId,
              readString(modelRecord.name),
              index,
            )
          }
        })
        continue
      }

      if (providerId === defaultProviderId) {
        pushEntry(providerId, providerConfig, defaultModel, undefined, 0)
      }
    }

    if (entries.length === 0) {
      pushEntry(defaultProviderId, asRecord(providers[defaultProviderId]), defaultModel, undefined, 0)
    }

    if (!defaultModelId) {
      const fallbackIndex = entries.findIndex((entry) => {
        const providerId = entry.provider === 'custom-openai' ? entry.customProviderId?.trim() : entry.provider
        return providerId === defaultProviderId && entry.modelId === defaultModel
      })
      defaultModelId = entries[fallbackIndex >= 0 ? fallbackIndex : 0]?.id ?? ''
    }

    return {
      defaultModelId,
      entries,
    }
  }

  private async extractAgentConfig(config: Record<string, unknown>): Promise<AgentConfigDocument> {
    const base = this.extractAgentConfigBase(config)
    const managerConfig = await this.readConfigModel()
    const openClawAgentsUrl = this.buildOpenClawAgentsUrl(config, managerConfig.service)
    const configuredDefaultWorkspace = base.defaults.workspace.trim()
    const fallbackWorkspace =
      (await this.readWorkspaceForService(managerConfig.service)) ??
      buildDefaultProfileWorkspace(managerConfig.service.profileMode, managerConfig.service.profileName, managerConfig.service.id)
    const resolvedDefaultWorkspace = configuredDefaultWorkspace || fallbackWorkspace
    const items = await Promise.all(
      base.items.map(async (item) => {
        const resolvedWorkspace = this.resolveWorkspacePath(item.workspace?.trim() || resolvedDefaultWorkspace)
        const skillsDir = path.join(resolvedWorkspace, 'skills')
        const disabledSkillsDir = path.join(resolvedWorkspace, '.manclaw-disabled-skills')
        const sessionStore = await this.getAgentSessionStoreInfo(item.id).catch(() => undefined)
        const transcriptFileCount = sessionStore ? await this.countAgentTranscriptFiles(sessionStore.path).catch(() => undefined) : undefined
        return {
          ...item,
          resolvedWorkspace,
          skillsDir,
          disabledSkillsDir,
          workspaceSkills: await this.readAgentWorkspaceSkillEntries(resolvedWorkspace),
          sessionStorePath: sessionStore?.path,
          sessionCount: sessionStore?.count,
          transcriptFileCount,
        }
      }),
    )

    return {
      ...base,
      openClawAgentsUrl,
      items,
    }
  }

  private extractAgentConfigBase(config: Record<string, unknown>): AgentConfigDocument {
    const agents = asRecord(config.agents)
    const defaults = asRecord(agents.defaults)
    const defaultModel = asRecord(defaults.model)
    const defaultCompaction = asRecord(defaults.compaction)
    const defaultSubagents = asRecord(defaults.subagents)
    const list = Array.isArray(agents.list) ? agents.list : []
    const bindings = Array.isArray(config.bindings) ? config.bindings : []
    const channelOptions = new Set<string>(Object.keys(asRecord(config.channels)).map((channelId) => channelId.trim()).filter(Boolean))

    const items: AgentConfigEntry[] = list.map((entry, index) => {
      const agent = asRecord(entry)
      const agentId = readString(agent.id) ?? `agent-${index + 1}`
      const model = asRecord(agent.model)
      const compaction = asRecord(agent.compaction)
      const tools = asRecord(agent.tools)
      const subagents = asRecord(agent.subagents)
      const agentBindings = bindings.flatMap((binding, bindingIndex) => {
        const bindingRecord = asRecord(binding)
        if (readString(bindingRecord.agentId) !== agentId) {
          return []
        }

        const match = asRecord(bindingRecord.match)
        const channelId = readString(match.channel)
        if (!channelId) {
          return []
        }

        return [
          {
            id: createAgentBindingId(agentId, bindingIndex),
            channel: channelId,
            accountId: readString(match.accountId),
          },
        ]
      })

      agentBindings.forEach((binding) => channelOptions.add(binding.channel))

      return {
        sourceId: createAgentSourceId(agentId, index),
        id: agentId,
        bindings: normalizeAgentBindings(agentId, agentBindings),
        workspace: readString(agent.workspace),
        modelPrimary: readString(model.primary),
        compactionMode: readString(compaction.mode),
        tools: {
          profile: readAgentToolsProfile(tools.profile),
          allow: readStringList(tools.allow),
          deny: readStringList(tools.deny),
        },
        subagents: readAgentSubagents(subagents),
      }
    })

    if (items.length === 0) {
      items.push({
        sourceId: createAgentSourceId('main', 0),
        id: 'main',
        bindings: [],
        tools: {
          allow: [],
          deny: [],
        },
      })
    }

    return {
      defaultAgentId: items[0]?.id ?? '',
      defaults: {
        workspace: readString(defaults.workspace) ?? '',
        modelPrimary: readString(defaultModel.primary) ?? '',
        compactionMode: readString(defaultCompaction.mode) ?? '',
        subagents: readAgentSubagents(defaultSubagents),
      },
      availableChannels: Array.from(channelOptions)
        .sort()
        .map((channelId) => ({
          id: channelId,
          label: channelId,
        })),
      items,
    }
  }

  private extractChannelConfig(config: Record<string, unknown>): ChannelConfigDocument {
    const channels = asRecord(config.channels)
    const bindings = Array.isArray(config.bindings) ? config.bindings : []
    const agentList = Array.isArray(asRecord(config.agents).list) ? (asRecord(config.agents).list as unknown[]) : []

    const availableAgents = agentList
      .map((entry: unknown, index: number) => {
        const agentId = readString(asRecord(entry).id) ?? `agent-${index + 1}`
        return {
          id: agentId,
          label: agentId,
        }
      })
      .sort((left: { label: string }, right: { label: string }) => left.label.localeCompare(right.label))

    const items = Object.entries(channels)
      .map(([channelId, value], index) => {
        const channelRecord = asRecord(value)
        const channelBindings = bindings.flatMap((binding, bindingIndex) => {
          const bindingRecord = asRecord(binding)
          const match = asRecord(bindingRecord.match)
          if (readString(match.channel) !== channelId) {
            return []
          }

          const agentId = readString(bindingRecord.agentId)
          if (!agentId) {
            return []
          }

          return [
            {
              id: createChannelBindingId(channelId, bindingIndex),
              agentId,
              accountId: readString(match.accountId),
            },
          ]
        })

        return {
          sourceId: createChannelSourceId(channelId, index),
          id: channelId,
          type: readString(channelRecord.type),
          configText: JSON.stringify(channelRecord, null, 2),
          bindings: normalizeChannelBindings(channelId, channelBindings),
        }
      })
      .sort((left, right) => left.id.localeCompare(right.id))

    return {
      availableAgents,
      items,
    }
  }

  private applyQuickModelConfig(config: Record<string, unknown>, candidate: QuickModelConfigPayload): Record<string, unknown> {
    const nextConfig = structuredClone(config)
    const agents = asRecord(nextConfig.agents)
    const defaults = asRecord(agents.defaults)
    const modelConfig = asRecord(defaults.model)
    const env = asRecord(nextConfig.env)
    const models = asRecord(nextConfig.models)
    const existingProviders = asRecord(models.providers)

    nextConfig.agents = agents
    agents.defaults = defaults
    defaults.model = modelConfig
    nextConfig.env = env
    nextConfig.models = models
    models.mode = 'merge'

    interface NormalizedQuickModelEntry extends QuickModelEntry {
      providerKey: string
      apiKey?: string
      baseUrl?: string
      customProviderId?: string
      envVarName?: string
      preserveExistingApiKeyConfig?: boolean
    }

    const normalizedEntries: NormalizedQuickModelEntry[] = candidate.entries.map((entry, index) => {
      const modelId = entry.modelId.trim()
      const name = entry.name?.trim() || modelId
      if (!modelId) {
        throw new Error(`Model ID is required for entry #${index + 1}.`)
      }

      if (entry.provider === 'custom-openai') {
        const providerId = entry.customProviderId?.trim()
        const currentProvider = asRecord(existingProviders[providerId ?? ''])
        const baseUrl = entry.baseUrl?.trim() || readString(currentProvider.baseUrl)
        const envVarName = entry.envVarName?.trim()
        const apiKey = entry.apiKey?.trim()
        if (!providerId) {
          throw new Error(`Custom provider ID is required for entry #${index + 1}.`)
        }
        if (!baseUrl) {
          throw new Error(`Base URL is required for entry #${index + 1}.`)
        }

        if (apiKey) {
          if (!envVarName) {
            throw new Error(`Environment variable name is required for entry #${index + 1}.`)
          }

          return {
            ...entry,
            modelId,
            name,
            customProviderId: providerId,
            baseUrl,
            envVarName,
            apiKey,
            providerKey: providerId,
          }
        }

        if (envVarName) {
          throw new Error(`API key is required for entry #${index + 1}.`)
        }

        if (currentProvider.apiKey === undefined) {
          throw new Error(`API key is required for entry #${index + 1}.`)
        }

        return {
          ...entry,
          modelId,
          name,
          customProviderId: providerId,
          baseUrl,
          providerKey: providerId,
          preserveExistingApiKeyConfig: true,
        }
      }

      if (entry.provider !== 'ollama') {
        const envVarName = defaultEnvVarForProvider(entry.provider)
        const currentProvider = asRecord(existingProviders[entry.provider])
        const apiKey = entry.apiKey?.trim()
        if (!envVarName) {
          throw new Error(`Unsupported provider: ${entry.provider}`)
        }

        if (apiKey) {
          return {
            ...entry,
            modelId,
            name,
            envVarName,
            apiKey,
            providerKey: entry.provider,
          }
        }

        if (currentProvider.apiKey === undefined && env[envVarName] === undefined) {
          throw new Error(`API key is required for entry #${index + 1}.`)
        }

        return {
          ...entry,
          modelId,
          name,
          envVarName,
          providerKey: entry.provider,
          preserveExistingApiKeyConfig: true,
        }
      }

      return {
        ...entry,
        modelId,
        name,
        providerKey: entry.provider,
      }
    })

    const defaultEntry = normalizedEntries.find((entry) => entry.id === candidate.defaultModelId)
    if (!defaultEntry) {
      throw new Error('Default model must point to an existing entry.')
    }

    const nextProviders: Record<string, Record<string, unknown>> = {}
    const entriesByProvider = new Map<string, NormalizedQuickModelEntry[]>()

    for (const entry of normalizedEntries) {
      const items = entriesByProvider.get(entry.providerKey) ?? []
      items.push(entry)
      entriesByProvider.set(entry.providerKey, items)
    }

    for (const [providerKey, providerEntries] of entriesByProvider) {
      const currentProvider: Record<string, unknown> = {
        ...structuredClone(asRecord(existingProviders[providerKey])),
      }
      const currentProviderModels = Array.isArray(currentProvider.models) ? currentProvider.models : []
      const existingModelRecords = new Map<string, Record<string, unknown>>()
      for (const item of currentProviderModels) {
        const modelRecord = structuredClone(asRecord(item))
        const existingModelId = readString(modelRecord.id) ?? readString(modelRecord.name)
        if (existingModelId && !existingModelRecords.has(existingModelId)) {
          existingModelRecords.set(existingModelId, modelRecord)
        }
      }
      const uniqueModels = Array.from(
        new Map(
          providerEntries.map((entry) => [
            entry.modelId,
            (() => {
              const currentModel = existingModelRecords.get(entry.modelId)
              if (currentModel) {
                currentModel.id = entry.modelId
                currentModel.name = entry.name || entry.modelId
                return currentModel
              }

              return {
                id: entry.modelId,
                name: entry.name || entry.modelId,
              }
            })(),
          ]),
        ).values(),
      )
      currentProvider.models = uniqueModels

      const firstEntry = providerEntries[0]
      if (firstEntry.provider === 'custom-openai') {
        const baseUrl = firstEntry.baseUrl
        if (!baseUrl) {
          throw new Error(`Custom provider ${providerKey} is missing required settings.`)
        }

        for (const entry of providerEntries) {
          if (
            entry.baseUrl !== baseUrl ||
            entry.preserveExistingApiKeyConfig !== firstEntry.preserveExistingApiKeyConfig ||
            (!entry.preserveExistingApiKeyConfig && (entry.envVarName !== firstEntry.envVarName || entry.apiKey !== firstEntry.apiKey))
          ) {
            throw new Error(`Custom provider ${providerKey} has inconsistent settings across entries.`)
          }
        }

        const existingApi = readString(currentProvider.api)
        currentProvider.baseUrl = baseUrl
        currentProvider.api = existingApi || 'openai-completions'
        if (firstEntry.preserveExistingApiKeyConfig) {
          if (currentProvider.apiKey === undefined) {
            throw new Error(`Custom provider ${providerKey} is missing API key config.`)
          }
        } else {
          const envVarName = firstEntry.envVarName
          const apiKey = firstEntry.apiKey
          if (!envVarName || !apiKey) {
            throw new Error(`Custom provider ${providerKey} is missing required settings.`)
          }

          currentProvider.apiKey = toEnvPlaceholder(envVarName)
          env[envVarName] = apiKey
        }
      } else if (firstEntry.provider !== 'ollama' && firstEntry.envVarName) {
        if (!firstEntry.preserveExistingApiKeyConfig) {
          env[firstEntry.envVarName] = firstEntry.apiKey
        }
      }

      nextProviders[providerKey] = currentProvider
    }

    models.providers = nextProviders
    modelConfig.primary = `${defaultEntry.providerKey}/${defaultEntry.modelId}`
    return nextConfig
  }

  private applyAgentConfig(config: Record<string, unknown>, candidate: AgentConfigPayload): Record<string, unknown> {
    const defaultAgentId = candidate.defaultAgentId.trim()
    if (!defaultAgentId) {
      throw new Error('Default agent is required.')
    }
    if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
      throw new Error('At least one agent is required.')
    }

    const nextConfig = structuredClone(config)
    const agents = asRecord(nextConfig.agents)
    const defaults = asRecord(agents.defaults)
    const defaultModel = asRecord(defaults.model)
    const defaultCompaction = asRecord(defaults.compaction)
    const defaultSubagents = asRecord(defaults.subagents)
    const currentList = Array.isArray(agents.list) ? agents.list : []
    const currentDocument = this.extractAgentConfigBase(config)
    const rawBySourceId = new Map<string, Record<string, unknown>>(
      currentDocument.items.map((item, index) => [item.sourceId, asRecord(currentList[index])]),
    )
    const rawById = new Map<string, Record<string, unknown>>(
      currentDocument.items.map((item, index) => [item.id, asRecord(currentList[index])]),
    )

    const seenIds = new Set<string>()
    const normalizedItems = candidate.items.map((item, index) => {
      const agentId = item.id.trim()
      if (!agentId) {
        throw new Error(`Agent ID is required for item #${index + 1}.`)
      }
      if (seenIds.has(agentId)) {
        throw new Error(`Agent ID "${agentId}" is duplicated.`)
      }

      const toolsProfile = item.tools?.profile?.trim()
      if (toolsProfile && !AGENT_TOOLS_PROFILE_VALUES.has(toolsProfile)) {
        throw new Error(`Tools profile "${toolsProfile}" is invalid for agent "${agentId}".`)
      }

      const normalizedBindings = normalizeAgentBindings(
        agentId,
        Array.isArray(item.bindings)
          ? item.bindings
          : Array.isArray((item as { channels?: string[] }).channels)
            ? normalizeAgentChannels((item as { channels?: string[] }).channels ?? []).map((channel, bindingIndex) => ({
                id: createAgentBindingId(agentId, bindingIndex),
                channel,
              }))
            : [],
      )

      const normalizedSubagents: AgentSubagentsConfig = {
        modelPrimary: item.subagents?.modelPrimary?.trim() || undefined,
        thinking: item.subagents?.thinking?.trim() || undefined,
        maxConcurrent: parseOptionalIntegerField(item.subagents?.maxConcurrent, `Subagents maxConcurrent for agent "${agentId}"`, { min: 1 }),
        maxSpawnDepth: parseOptionalIntegerField(item.subagents?.maxSpawnDepth, `Subagents maxSpawnDepth for agent "${agentId}"`, { min: 1, max: 5 }),
        maxChildrenPerAgent: parseOptionalIntegerField(item.subagents?.maxChildrenPerAgent, `Subagents maxChildrenPerAgent for agent "${agentId}"`, { min: 1, max: 20 }),
        archiveAfterMinutes: parseOptionalIntegerField(item.subagents?.archiveAfterMinutes, `Subagents archiveAfterMinutes for agent "${agentId}"`, { min: 0 }),
        runTimeoutSeconds: parseOptionalIntegerField(item.subagents?.runTimeoutSeconds, `Subagents runTimeoutSeconds for agent "${agentId}"`, { min: 0 }),
        announceTimeoutMs: parseOptionalIntegerField(item.subagents?.announceTimeoutMs, `Subagents announceTimeoutMs for agent "${agentId}"`, { min: 1 }),
        allowAgents: readStringList(item.subagents?.allowAgents),
      }

      seenIds.add(agentId)
      return {
        sourceId: item.sourceId.trim(),
        id: agentId,
        bindings: normalizedBindings,
        workspace: item.workspace?.trim(),
        modelPrimary: item.modelPrimary?.trim(),
        compactionMode: item.compactionMode?.trim(),
        toolsProfile,
        toolsAllow: readStringList(item.tools?.allow),
        toolsDeny: readStringList(item.tools?.deny),
        subagents: normalizedSubagents,
      }
    })

    if (!normalizedItems.some((item) => item.id === defaultAgentId)) {
      throw new Error('Default agent must point to an existing item.')
    }

    const defaultWorkspace = candidate.defaults.workspace.trim()
    const defaultModelPrimary = candidate.defaults.modelPrimary.trim()
    if (!defaultModelPrimary) {
      throw new Error('Default model is required.')
    }
    const defaultSubagentsCandidate: AgentSubagentsConfig = {
      modelPrimary: candidate.defaults.subagents.modelPrimary?.trim() || undefined,
      thinking: candidate.defaults.subagents.thinking?.trim() || undefined,
      maxConcurrent: parseOptionalIntegerField(candidate.defaults.subagents.maxConcurrent, 'Default subagents maxConcurrent', { min: 1 }),
      maxSpawnDepth: parseOptionalIntegerField(candidate.defaults.subagents.maxSpawnDepth, 'Default subagents maxSpawnDepth', { min: 1, max: 5 }),
      maxChildrenPerAgent: parseOptionalIntegerField(candidate.defaults.subagents.maxChildrenPerAgent, 'Default subagents maxChildrenPerAgent', { min: 1, max: 20 }),
      archiveAfterMinutes: parseOptionalIntegerField(candidate.defaults.subagents.archiveAfterMinutes, 'Default subagents archiveAfterMinutes', { min: 0 }),
      runTimeoutSeconds: parseOptionalIntegerField(candidate.defaults.subagents.runTimeoutSeconds, 'Default subagents runTimeoutSeconds', { min: 0 }),
      announceTimeoutMs: parseOptionalIntegerField(candidate.defaults.subagents.announceTimeoutMs, 'Default subagents announceTimeoutMs', { min: 1 }),
      allowAgents: readStringList(candidate.defaults.subagents.allowAgents),
    }

    const orderedItems = [
      ...normalizedItems.filter((item) => item.id === defaultAgentId),
      ...normalizedItems.filter((item) => item.id !== defaultAgentId),
    ]

    nextConfig.agents = agents
    agents.defaults = defaults
    defaults.model = defaultModel
    defaults.compaction = defaultCompaction
    if (defaultWorkspace) {
      defaults.workspace = defaultWorkspace
    } else {
      delete defaults.workspace
    }
    defaultModel.primary = defaultModelPrimary

    const defaultCompactionMode = candidate.defaults.compactionMode.trim()
    if (defaultCompactionMode) {
      defaultCompaction.mode = defaultCompactionMode
    } else {
      delete defaultCompaction.mode
      if (Object.keys(defaultCompaction).length === 0) {
        delete defaults.compaction
      }
    }

    const nextDefaultSubagents = asRecord(defaultSubagents)
    const nextDefaultSubagentModel = asRecord(nextDefaultSubagents.model)
    if (defaultSubagentsCandidate.modelPrimary) {
      nextDefaultSubagentModel.primary = defaultSubagentsCandidate.modelPrimary
      nextDefaultSubagents.model = nextDefaultSubagentModel
    } else {
      delete nextDefaultSubagentModel.primary
      if (hasOwnKeys(nextDefaultSubagentModel)) {
        nextDefaultSubagents.model = nextDefaultSubagentModel
      } else {
        delete nextDefaultSubagents.model
      }
    }

    if (defaultSubagentsCandidate.thinking) {
      nextDefaultSubagents.thinking = defaultSubagentsCandidate.thinking
    } else {
      delete nextDefaultSubagents.thinking
    }

    if (typeof defaultSubagentsCandidate.maxConcurrent === 'number') {
      nextDefaultSubagents.maxConcurrent = defaultSubagentsCandidate.maxConcurrent
    } else {
      delete nextDefaultSubagents.maxConcurrent
    }

    if (typeof defaultSubagentsCandidate.maxSpawnDepth === 'number') {
      nextDefaultSubagents.maxSpawnDepth = defaultSubagentsCandidate.maxSpawnDepth
    } else {
      delete nextDefaultSubagents.maxSpawnDepth
    }

    if (typeof defaultSubagentsCandidate.maxChildrenPerAgent === 'number') {
      nextDefaultSubagents.maxChildrenPerAgent = defaultSubagentsCandidate.maxChildrenPerAgent
    } else {
      delete nextDefaultSubagents.maxChildrenPerAgent
    }

    if (typeof defaultSubagentsCandidate.archiveAfterMinutes === 'number') {
      nextDefaultSubagents.archiveAfterMinutes = defaultSubagentsCandidate.archiveAfterMinutes
    } else {
      delete nextDefaultSubagents.archiveAfterMinutes
    }

    if (typeof defaultSubagentsCandidate.runTimeoutSeconds === 'number') {
      nextDefaultSubagents.runTimeoutSeconds = defaultSubagentsCandidate.runTimeoutSeconds
    } else {
      delete nextDefaultSubagents.runTimeoutSeconds
    }

    if (typeof defaultSubagentsCandidate.announceTimeoutMs === 'number') {
      nextDefaultSubagents.announceTimeoutMs = defaultSubagentsCandidate.announceTimeoutMs
    } else {
      delete nextDefaultSubagents.announceTimeoutMs
    }

    if (defaultSubagentsCandidate.allowAgents.length > 0) {
      nextDefaultSubagents.allowAgents = defaultSubagentsCandidate.allowAgents
    } else {
      delete nextDefaultSubagents.allowAgents
    }

    if (hasOwnKeys(nextDefaultSubagents)) {
      defaults.subagents = nextDefaultSubagents
    } else {
      delete defaults.subagents
    }

    const existingBindings = Array.isArray(nextConfig.bindings) ? nextConfig.bindings : []
    const rawAgentBindingsById = new Map<string, Record<string, unknown>>()
    existingBindings.forEach((binding, bindingIndex) => {
      const bindingRecord = asRecord(binding)
      const agentId = readString(bindingRecord.agentId)
      if (!agentId) {
        return
      }
      rawAgentBindingsById.set(createAgentBindingId(agentId, bindingIndex), structuredClone(bindingRecord))
    })

    agents.list = orderedItems.map((item) => {
      const nextAgent = structuredClone(rawBySourceId.get(item.sourceId) ?? rawById.get(item.sourceId) ?? rawById.get(item.id) ?? {})
      const nextModel = asRecord(nextAgent.model)
      const nextCompaction = asRecord(nextAgent.compaction)
      const nextTools = asRecord(nextAgent.tools)
      const nextSubagents = asRecord(nextAgent.subagents)
      const nextSubagentModel = asRecord(nextSubagents.model)

      nextAgent.id = item.id
      delete nextAgent.enabled

      if (item.workspace) {
        nextAgent.workspace = item.workspace
      } else {
        delete nextAgent.workspace
      }

      if (item.modelPrimary) {
        nextModel.primary = item.modelPrimary
        nextAgent.model = nextModel
      } else {
        delete nextModel.primary
        if (Object.keys(nextModel).length > 0) {
          nextAgent.model = nextModel
        } else {
          delete nextAgent.model
        }
      }

      if (item.compactionMode) {
        nextCompaction.mode = item.compactionMode
        nextAgent.compaction = nextCompaction
      } else {
        delete nextCompaction.mode
        if (Object.keys(nextCompaction).length > 0) {
          nextAgent.compaction = nextCompaction
        } else {
          delete nextAgent.compaction
        }
      }

      if (item.toolsProfile) {
        nextTools.profile = item.toolsProfile
      } else {
        delete nextTools.profile
      }

      if (item.toolsAllow.length > 0) {
        nextTools.allow = item.toolsAllow
      } else {
        delete nextTools.allow
      }

      if (item.toolsDeny.length > 0) {
        nextTools.deny = item.toolsDeny
      } else {
        delete nextTools.deny
      }

      if (Object.keys(nextTools).length > 0) {
        nextAgent.tools = nextTools
      } else {
        delete nextAgent.tools
      }

      if (item.subagents.modelPrimary) {
        nextSubagentModel.primary = item.subagents.modelPrimary
        nextSubagents.model = nextSubagentModel
      } else {
        delete nextSubagentModel.primary
        if (hasOwnKeys(nextSubagentModel)) {
          nextSubagents.model = nextSubagentModel
        } else {
          delete nextSubagents.model
        }
      }

      if (item.subagents.thinking) {
        nextSubagents.thinking = item.subagents.thinking
      } else {
        delete nextSubagents.thinking
      }

      if (typeof item.subagents.maxConcurrent === 'number') {
        nextSubagents.maxConcurrent = item.subagents.maxConcurrent
      } else {
        delete nextSubagents.maxConcurrent
      }

      if (typeof item.subagents.maxSpawnDepth === 'number') {
        nextSubagents.maxSpawnDepth = item.subagents.maxSpawnDepth
      } else {
        delete nextSubagents.maxSpawnDepth
      }

      if (typeof item.subagents.maxChildrenPerAgent === 'number') {
        nextSubagents.maxChildrenPerAgent = item.subagents.maxChildrenPerAgent
      } else {
        delete nextSubagents.maxChildrenPerAgent
      }

      if (typeof item.subagents.archiveAfterMinutes === 'number') {
        nextSubagents.archiveAfterMinutes = item.subagents.archiveAfterMinutes
      } else {
        delete nextSubagents.archiveAfterMinutes
      }

      if (typeof item.subagents.runTimeoutSeconds === 'number') {
        nextSubagents.runTimeoutSeconds = item.subagents.runTimeoutSeconds
      } else {
        delete nextSubagents.runTimeoutSeconds
      }

      if (typeof item.subagents.announceTimeoutMs === 'number') {
        nextSubagents.announceTimeoutMs = item.subagents.announceTimeoutMs
      } else {
        delete nextSubagents.announceTimeoutMs
      }

      if (item.subagents.allowAgents.length > 0) {
        nextSubagents.allowAgents = item.subagents.allowAgents
      } else {
        delete nextSubagents.allowAgents
      }

      if (hasOwnKeys(nextSubagents)) {
        nextAgent.subagents = nextSubagents
      } else {
        delete nextAgent.subagents
      }

      return nextAgent
    })

    const managedAgentIds = new Set(currentDocument.items.map((item) => item.id))
    const preservedBindings = existingBindings.filter((binding) => {
      const bindingRecord = asRecord(binding)
      const agentId = readString(bindingRecord.agentId)
      const channelId = readString(asRecord(bindingRecord.match).channel)
      return !agentId || !channelId || !managedAgentIds.has(agentId)
    })

    nextConfig.bindings = [
      ...preservedBindings,
      ...orderedItems.flatMap((item) =>
        item.bindings.map((binding) => {
          const nextBinding = structuredClone(rawAgentBindingsById.get(binding.id) ?? {})
          const nextMatch = asRecord(nextBinding.match)
          nextBinding.agentId = item.id
          nextMatch.channel = binding.channel
          if (binding.accountId) {
            nextMatch.accountId = binding.accountId
          } else {
            delete nextMatch.accountId
          }
          nextBinding.match = nextMatch
          return nextBinding
        }),
      ),
    ]

    return nextConfig
  }

  private async ensureAgentWorkspaces(config: Record<string, unknown>, candidate: AgentConfigPayload): Promise<void> {
    const currentDocument = this.extractAgentConfigBase(config)
    const currentAgentIds = new Set(currentDocument.items.map((item) => item.id))
    const managerConfig = await this.readConfigModel()
    const fallbackWorkspace =
      (await this.readWorkspaceForService(managerConfig.service)) ??
      buildDefaultProfileWorkspace(managerConfig.service.profileMode, managerConfig.service.profileName, managerConfig.service.id)
    const normalizedItems = candidate.items
      .map((item) => ({
        id: item.id.trim(),
        workspace: this.resolveWorkspacePath(item.workspace?.trim() || candidate.defaults.workspace.trim() || fallbackWorkspace),
        modelPrimary: item.modelPrimary?.trim() || candidate.defaults.modelPrimary.trim(),
      }))
      .filter((item) => item.id)

    if (normalizedItems.length === 0) {
      return
    }
    const command = managerConfig.service.command.trim() || 'openclaw'
    const cwd = path.resolve(this.rootDir, managerConfig.service.cwd)
    const env = buildServiceEnv(managerConfig.service)

    for (const item of normalizedItems) {
      const agentId = item.id
      const workspace = item.workspace
      const existsInConfig = currentAgentIds.has(agentId)
      const workspaceExists = await fileExists(workspace)

      if (existsInConfig && workspaceExists) {
        continue
      }

      if (!existsInConfig) {
        const args = buildOpenClawCliArgs(managerConfig.service, ['agents', 'add', agentId, '--workspace', workspace, '--non-interactive', '--json'])
        if (item.modelPrimary) {
          args.push('--model', item.modelPrimary)
        }

        try {
          await mkdir(path.dirname(workspace), { recursive: true })
          await execFileAsync(command, args, {
            cwd,
            env,
            timeout: 20_000,
          })
          await this.appendAuditLog(`agent.add id=${agentId} workspace=${workspace}`)
          await this.appendRuntimeLog('info', `agent scaffold created for ${agentId} at ${workspace}`)
        } catch (error) {
          const message = error instanceof Error ? summarizeCommandOutput(error.message) : 'Unknown error.'
          throw new Error(`Failed to initialize workspace for agent "${agentId}": ${message}`)
        }
        continue
      }

      try {
        await this.seedWorkspaceScaffold(command, cwd, workspace)
        await this.appendAuditLog(`agent.workspace.reseed id=${agentId} workspace=${workspace}`)
        await this.appendRuntimeLog('info', `agent workspace scaffold restored for ${agentId} at ${workspace}`)
      } catch (error) {
        const message = error instanceof Error ? summarizeCommandOutput(error.message) : 'Unknown error.'
        throw new Error(`Failed to restore workspace for agent "${agentId}": ${message}`)
      }
    }
  }

  private async seedWorkspaceScaffold(command: string, cwd: string, workspace: string): Promise<void> {
    const seedId = `manclaw-seed-${randomUUID().slice(0, 8)}`
    const seedProfile = `manclaw-scaffold-${randomUUID().slice(0, 8)}`
    const tempRoot = path.join(this.paths.dataDir, 'tmp', seedId)
    const tempWorkspace = path.join(tempRoot, 'workspace')
    const homeDir = process.env.HOME ?? path.dirname(this.rootDir)
    const profileDir = path.join(homeDir, `.openclaw-${seedProfile}`)

    try {
      await rm(tempRoot, { recursive: true, force: true })
      await mkdir(path.dirname(workspace), { recursive: true })
      await mkdir(tempRoot, { recursive: true })

      await execFileAsync(command, ['--profile', seedProfile, 'agents', 'add', seedId, '--workspace', tempWorkspace, '--non-interactive', '--json'], {
        cwd,
        env: {
          ...process.env,
        },
        timeout: 20_000,
      })

      await cp(tempWorkspace, workspace, {
        recursive: true,
        force: false,
        errorOnExist: false,
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(profileDir, { recursive: true, force: true })
    }
  }

  private applyChannelConfig(config: Record<string, unknown>, candidate: ChannelConfigPayload): Record<string, unknown> {
    if (!Array.isArray(candidate.items)) {
      throw new Error('Channels payload must contain items[].')
    }

    const nextConfig = structuredClone(config)
    const currentDocument = this.extractChannelConfig(config)
    const currentAgents = this.extractAgentConfigBase(config)
    const rawChannels = asRecord(nextConfig.channels)
    const sourceChannelIds = new Map<string, string>(currentDocument.items.map((item) => [item.sourceId, item.id]))
    const managedAgentIds = new Set(currentAgents.items.map((item) => item.id))
    const seenIds = new Set<string>()
    const normalizedItems = candidate.items.map((item, index) => {
      const channelId = item.id.trim()
      if (!channelId) {
        throw new Error(`Channel ID is required for item #${index + 1}.`)
      }
      if (seenIds.has(channelId)) {
        throw new Error(`Channel ID "${channelId}" is duplicated.`)
      }

      let parsedConfig: Record<string, unknown>
      try {
        const parsed = JSON.parse(item.configText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Channel config must be a JSON object.')
        }
        parsedConfig = asRecord(parsed)
      } catch (error) {
        throw new Error(`Channel "${channelId}" config is invalid: ${error instanceof Error ? error.message : 'invalid JSON'}`)
      }

      const bindings = normalizeChannelBindings(channelId, Array.isArray(item.bindings) ? item.bindings : [])
      for (const binding of bindings) {
        if (!managedAgentIds.has(binding.agentId)) {
          throw new Error(`Channel "${channelId}" references unknown agent "${binding.agentId}".`)
        }
      }

      seenIds.add(channelId)
      return {
        sourceId: item.sourceId.trim(),
        previousId: sourceChannelIds.get(item.sourceId.trim()) ?? item.sourceId.trim() ?? channelId,
        id: channelId,
        config: parsedConfig,
        bindings,
      }
    })

    nextConfig.channels = normalizedItems.reduce<Record<string, unknown>>((result, item) => {
      result[item.id] = structuredClone(rawChannels[item.previousId] ?? item.config)
      const channelConfig = asRecord(result[item.id])
      for (const key of Object.keys(channelConfig)) {
        delete channelConfig[key]
      }
      Object.assign(channelConfig, item.config)
      result[item.id] = channelConfig
      return result
    }, {})

    const existingBindings = Array.isArray(nextConfig.bindings) ? nextConfig.bindings : []
    const rawChannelBindingsById = new Map<string, Record<string, unknown>>()
    existingBindings.forEach((binding, bindingIndex) => {
      const bindingRecord = asRecord(binding)
      const channelId = readString(asRecord(bindingRecord.match).channel)
      if (!channelId) {
        return
      }
      rawChannelBindingsById.set(createChannelBindingId(channelId, bindingIndex), structuredClone(bindingRecord))
    })
    const managedChannelIds = new Set(currentDocument.items.map((item) => item.id))
    const preservedBindings = existingBindings.filter((binding) => {
      const bindingRecord = asRecord(binding)
      const agentId = readString(bindingRecord.agentId)
      const channelId = readString(asRecord(bindingRecord.match).channel)
      return !channelId || !agentId || !managedChannelIds.has(channelId) || !managedAgentIds.has(agentId)
    })

    nextConfig.bindings = [
      ...preservedBindings,
      ...normalizedItems.flatMap((item) =>
        item.bindings.map((binding) => {
          const nextBinding = structuredClone(rawChannelBindingsById.get(binding.id) ?? {})
          const nextMatch = asRecord(nextBinding.match)
          nextBinding.agentId = binding.agentId
          nextMatch.channel = item.id
          if (binding.accountId) {
            nextMatch.accountId = binding.accountId
          } else {
            delete nextMatch.accountId
          }
          nextBinding.match = nextMatch
          return nextBinding
        }),
      ),
    ]

    return nextConfig
  }

  private assertRemovedModelsAreNotReferencedElsewhere(config: Record<string, unknown>, candidate: QuickModelConfigPayload): void {
    const current = this.extractQuickModelConfig(config)
    const nextEntries = candidate.entries
      .map((entry) => ({
        providerKey: resolveQuickModelProviderKey(entry),
        modelId: entry.modelId.trim(),
      }))
      .filter((entry) => entry.modelId)
    const nextRefs = new Set(nextEntries.map((entry) => createQuickModelRef(entry.providerKey, entry.modelId)))
    const remainingModelIds = new Set(nextEntries.map((entry) => entry.modelId))
    const removedEntries = current.entries
      .map((entry) => ({
        providerKey: resolveQuickModelProviderKey(entry),
        modelId: entry.modelId.trim(),
      }))
      .filter((entry) => entry.modelId)
      .filter((entry) => !nextRefs.has(createQuickModelRef(entry.providerKey, entry.modelId)))

    if (removedEntries.length === 0) {
      return
    }

    const removedQualifiedRefs = new Set(removedEntries.map((entry) => createQuickModelRef(entry.providerKey, entry.modelId)))
    const removedRawModelIds = new Set(
      removedEntries.filter((entry) => !remainingModelIds.has(entry.modelId)).map((entry) => entry.modelId),
    )
    const referencePaths: string[] = []

    const visit = (value: unknown, currentPath: string): void => {
      if (referencePaths.length >= 10) {
        return
      }

      if (
        currentPath === 'agents.defaults.model.primary' ||
        currentPath.startsWith('models.providers.') ||
        currentPath.startsWith('models.providers[')
      ) {
        return
      }

      if (typeof value === 'string') {
        const normalized = value.trim()
        if (!normalized) {
          return
        }

        if (removedQualifiedRefs.has(normalized) || removedRawModelIds.has(normalized)) {
          referencePaths.push(currentPath || '$')
        }
        return
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${currentPath}[${index}]`))
        return
      }

      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          const nextPath = currentPath ? `${currentPath}.${key}` : key
          visit(nested, nextPath)
          if (referencePaths.length >= 10) {
            return
          }
        }
      }
    }

    visit(config, '')

    if (referencePaths.length === 0) {
      return
    }

    const removedLabels = removedEntries.map((entry) => createQuickModelRef(entry.providerKey, entry.modelId))
    throw new Error(
      `以下模型仍被其他配置引用，无法删除：${removedLabels.join(', ')}。引用位置：${referencePaths.join(', ')}`,
    )
  }

  private async findRunningProcess(config: ManClawConfig, options?: { serviceId?: string; useManagedChild?: boolean }): Promise<DetectedProcess | undefined> {
    const serviceId = options?.serviceId ?? config.service.id
    const state = this.getServiceState(config.service)
    const managedChild = options?.useManagedChild === false ? undefined : state.child
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

      state.child = undefined
    }

    const persistedManaged = await this.readPersistedManagedProcess(config.service, serviceId)
    if (persistedManaged) {
      return persistedManaged
    }

    const processName = normalizeProcessName(
      config.service.command,
      config.service.processName,
      buildServiceArgs(config.service),
      config.service.profileMode,
      config.service.profileName,
      config.service.id,
    )
    const managerDetected = await this.findRunningProcessViaServiceManager(config, processName)
    if (managerDetected) {
      return managerDetected
    }

    const portDetected = await this.findRunningProcessViaPort(config)
    if (portDetected) {
      return portDetected
    }

    try {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,comm=,args='], {
        cwd: this.rootDir,
        timeout: config.shell.timeoutMs,
      })

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

        const sameCommand = matchesProcessSignature(
          commandName,
          args,
          config.service.command,
          processName,
          buildServiceArgs(config.service),
        )

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

  private async findRunningProcessViaPort(config: ManClawConfig): Promise<DetectedProcess | undefined> {
    const port = config.service.port
    if (typeof port !== 'number' || !Number.isFinite(port) || port <= 0) {
      return undefined
    }

    if (process.platform !== 'linux') {
      return undefined
    }

    try {
      const pid = await this.findListeningPidByPort(port, config.shell.timeoutMs)
      if (!pid || pid === process.pid) {
        return undefined
      }

      const detected = await this.readDetectedProcessByPid(config.service, pid)
      if (detected) {
        return {
          ...detected,
          detectedBy: 'process-scan',
        }
      }

      return {
        pid,
        command: config.service.processName,
        args: buildServiceArgs(config.service).join(' '),
        detectedBy: 'process-scan',
      }
    } catch {
      return undefined
    }

    return undefined
  }

  private async findListeningPidByPort(port: number, timeoutMs: number): Promise<number | undefined> {
    const timeout = Math.min(timeoutMs, 5_000)

    try {
      const { stdout } = await execFileAsync('ss', ['-ltnp'], {
        timeout,
        maxBuffer: 1024 * 1024,
      })
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !line.includes('pid=')) {
          continue
        }

        const pidMatch = line.match(/pid=(\d+)/)
        if (pidMatch) {
          const pid = Number(pidMatch[1])
          if (Number.isFinite(pid) && pid > 0) {
            return pid
          }
        }
      }
    } catch {
      // Fall through to lsof.
    }

    try {
      const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        timeout,
        maxBuffer: 1024 * 1024,
      })
      const lines = stdout.split(/\r?\n/).slice(1)
      for (const line of lines) {
        const match = line.trim().match(/^\S+\s+(\d+)\s+/)
        if (!match) {
          continue
        }

        const pid = Number(match[1])
        if (Number.isFinite(pid) && pid > 0) {
          return pid
        }
      }
    } catch {
      return undefined
    }

    return undefined
  }

  private async restoreManagedRuntimeState(): Promise<void> {
    const config = await this.readConfigModel().catch(() => undefined)
    if (!config) {
      return
    }

    const persistedItems = await this.readPersistedRuntimeState()
    if (persistedItems.length === 0) {
      return
    }

    const services = config.services.items.length > 0 ? config.services.items : [config.service]
    const validItems: PersistedRuntimeState[] = []

    for (const persisted of persistedItems) {
      const targetService = services.find((item) => item.id === persisted.serviceId)
      if (!targetService) {
        continue
      }

      const matched = await this.readDetectedProcessByPid(targetService, persisted.pid)
      if (!matched) {
        continue
      }

      const state = this.getServiceState(targetService)
      state.status = {
        ...state.status,
        id: targetService.id,
        name: targetService.label ?? targetService.id,
        status: 'running',
        pid: matched.pid,
        startedAt: persisted.startedAt ?? state.status.startedAt,
        command: targetService.command,
        args: buildServiceArgs(targetService),
        cwd: path.resolve(this.rootDir, targetService.cwd),
        processName: targetService.processName,
        configPath: targetService.configPath,
        healthUrl: targetService.healthcheck.url,
        healthStatus: 'disabled',
        detectedBy: 'managed',
        message: `Recovered managed PID ${matched.pid} from runtime state.`,
      }
      validItems.push(persisted)
    }

    await this.writeRuntimeStateDocument(validItems)
  }

  private async readPersistedManagedProcess(
    service: ManClawConfig['service'],
    serviceId = service.id,
  ): Promise<DetectedProcess | undefined> {
    const persisted = (await this.readPersistedRuntimeState()).find((item) => item.serviceId === serviceId)
    if (!persisted || persisted.serviceId !== service.id) {
      return undefined
    }

    return this.readDetectedProcessByPid(service, persisted.pid)
  }

  private async readPersistedRuntimeState(): Promise<PersistedRuntimeState[]> {
    if (!(await fileExists(this.paths.runtimeStatePath))) {
      return []
    }

    try {
      const raw = await readFile(this.paths.runtimeStatePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedRuntimeStateDocument> | Partial<PersistedRuntimeState>
      const items = Array.isArray((parsed as Partial<PersistedRuntimeStateDocument>)?.items)
        ? (parsed as Partial<PersistedRuntimeStateDocument>).items ?? []
        : [parsed as Partial<PersistedRuntimeState>]
      const normalized: PersistedRuntimeState[] = []

      for (const item of items) {
        if (!item || typeof item !== 'object') {
          continue
        }
        const pid = item.pid
        const rawServiceId = item.serviceId
        if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
          continue
        }
        if (typeof rawServiceId !== 'string' || !rawServiceId.trim()) {
          continue
        }

        normalized.push({
          pid,
          serviceId: rawServiceId.trim(),
          startedAt: typeof item.startedAt === 'string' && item.startedAt.trim() ? item.startedAt.trim() : undefined,
        })
      }

      return normalized
    } catch {
      return []
    }
  }

  private async saveRuntimeState(serviceId: string, state: PersistedRuntimeState): Promise<void> {
    const items = (await this.readPersistedRuntimeState()).filter((item) => item.serviceId !== serviceId)
    items.push(state)
    await this.writeRuntimeStateDocument(items)
  }

  private async clearRuntimeState(serviceId?: string): Promise<void> {
    if (!serviceId) {
      await rm(this.paths.runtimeStatePath, { force: true })
      return
    }

    const items = (await this.readPersistedRuntimeState()).filter((item) => item.serviceId !== serviceId)
    await this.writeRuntimeStateDocument(items)
  }

  private async writeRuntimeStateDocument(items: PersistedRuntimeState[]): Promise<void> {
    if (items.length === 0) {
      await rm(this.paths.runtimeStatePath, { force: true })
      return
    }

    const document: PersistedRuntimeStateDocument = {
      items,
    }
    await writeFile(this.paths.runtimeStatePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  }

  private async readDetectedProcessByPid(
    service: ManClawConfig['service'],
    pid: number,
  ): Promise<DetectedProcess | undefined> {
    try {
      const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'pid=,comm=,args='], {
        timeout: 5_000,
        maxBuffer: 1024 * 1024,
      })
      const match = stdout.match(/^\s*(\d+)\s+(\S+)\s+(.+)$/m)
      if (!match) {
        return undefined
      }

      const foundPid = Number(match[1])
      const commandName = match[2]
      const args = match[3]
      if (!Number.isFinite(foundPid) || foundPid <= 0) {
        return undefined
      }

      const processName = normalizeProcessName(
        service.command,
        service.processName,
        buildServiceArgs(service),
        service.profileMode,
        service.profileName,
        service.id,
      )
      if (!matchesProcessSignature(commandName, args, service.command, processName, buildServiceArgs(service))) {
        return undefined
      }

      return {
        pid: foundPid,
        command: commandName,
        args,
        detectedBy: 'managed',
      }
    } catch {
      return undefined
    }
  }

  private async findRunningProcessViaServiceManager(
    config: ManClawConfig,
    processName: string,
  ): Promise<DetectedProcess | undefined> {
    const candidates = createServiceManagerCandidates(config.service.command, processName, buildServiceArgs(config.service))

    if (process.platform === 'linux') {
      for (const candidate of candidates) {
        try {
          const { stdout } = await execFileAsync(
            'systemctl',
            ['show', candidate, '--property=Id,MainPID,SubState,LoadState', '--value'],
            {
              cwd: this.rootDir,
              timeout: config.shell.timeoutMs,
            },
          )

          const lines = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)

          const [unitId = candidate, mainPidText = '', subState = '', loadState = ''] = lines
          const mainPid = parseInteger(mainPidText)
          if (loadState === 'loaded' && mainPid && subState !== 'dead' && subState !== 'failed') {
            return {
              pid: mainPid,
              command: unitId,
              args: `systemd unit ${unitId}`,
              detectedBy: 'systemd',
              managerName: unitId,
            }
          }
        } catch {
          continue
        }
      }
    }

    if (process.platform === 'darwin') {
      try {
        const { stdout } = await execFileAsync('launchctl', ['list'], {
          cwd: this.rootDir,
          timeout: config.shell.timeoutMs,
        })

        for (const rawLine of stdout.split(/\r?\n/)) {
          const line = rawLine.trim()
          if (!line || line.startsWith('PID') || line.startsWith('-\t')) {
            continue
          }

          const parts = line.split(/\s+/)
          if (parts.length < 3) {
            continue
          }

          const pid = parseInteger(parts[0])
          const label = parts.slice(2).join(' ')
          if (!pid) {
            continue
          }

          const matches = candidates.some((candidate) => label === candidate || label.endsWith(`.${candidate}`))
          if (!matches) {
            continue
          }

          return {
            pid,
            command: label,
            args: `launchctl service ${label}`,
            detectedBy: 'launchctl',
            managerName: label,
          }
        }
      } catch {
        return undefined
      }
    }

    return undefined
  }

  private async readProcessTiming(
    config: ManClawConfig,
    pid: number,
  ): Promise<{ startedAt?: string; uptimeSeconds?: number } | undefined> {
    try {
      const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'etimes=,lstart='], {
        cwd: this.rootDir,
        timeout: config.shell.timeoutMs,
      })
      const line = stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean)

      if (!line) {
        return undefined
      }

      const match = line.match(/^(\S+)\s+(.+)$/)
      if (!match) {
        return undefined
      }

      const [, elapsedText, startedText] = match
      const uptimeSeconds = parsePsElapsed(elapsedText)
      const startedAt =
        uptimeSeconds !== undefined
          ? new Date(Date.now() - uptimeSeconds * 1000).toISOString()
          : (() => {
              const parsed = new Date(startedText)
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
            })()

      return {
        startedAt,
        uptimeSeconds,
      }
    } catch {
      return undefined
    }
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

    if (await this.waitForPidExit(pid, 3_000)) {
      return
    }

    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      return
    }

    await this.waitForPidExit(pid, 2_000)
  }

  private async waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!(await this.isPidRunning(pid))) {
        return true
      }

      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    return !(await this.isPidRunning(pid))
  }

  private attachChildListeners(service: ManClawConfig['service'], child: ManagedChildProcess): void {
    const state = this.getServiceState(service)
    let stdoutBuffer = ''
    let stderrBuffer = ''

    child.stdout.on('data', async (chunk: Buffer | string) => {
      stdoutBuffer = this.consumeOutputBuffer(stdoutBuffer, String(chunk), 'info')
    })

    child.stderr.on('data', async (chunk: Buffer | string) => {
      stderrBuffer = this.consumeOutputBuffer(stderrBuffer, String(chunk), 'error')
    })

    child.on('error', async (error) => {
      state.status = {
        ...state.status,
        status: 'degraded',
        message: error.message,
      }
      await this.appendRuntimeLog('error', `service process error: ${error.message}`)
    })

    child.on('exit', async (code, signal) => {
      const shouldRestart = !state.stopRequested
      const config = await this.readConfigModel().catch(() => undefined)
      state.child = undefined
      state.restartTimer = undefined
      await this.clearRuntimeState(service.id)
      state.status = {
        ...state.status,
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
      await this.appendRuntimeLog('warn', state.status.message ?? 'openclaw exited.')

      const latestService =
        config?.service.id === service.id ? config.service : config?.services.items.find((item) => item.id === service.id)

      if (shouldRestart && latestService?.autoRestart) {
        state.status = {
          ...state.status,
          status: 'degraded',
          message: 'openclaw exited unexpectedly, restarting in 2 seconds.',
        }
        await this.appendRuntimeLog('warn', 'openclaw exited unexpectedly, auto restart scheduled')
        state.restartTimer = setTimeout(() => {
          state.restartTimer = undefined
          if (!config || !latestService) {
            return
          }
          void this.startService({
            ...config,
            service: latestService,
          }).catch(async (error) => {
            state.status = {
              ...state.status,
              status: 'degraded',
              message: error instanceof Error ? error.message : 'Auto restart failed.',
            }
            await this.appendRuntimeLog('error', `auto restart failed: ${error instanceof Error ? error.message : 'unknown error'}`)
          })
        }, 2_000)
      } else {
        state.stopRequested = false
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

  private getServiceState(service: Pick<ManClawConfig['service'], 'id' | 'label'>): ServiceState {
    const existing = this.serviceStates.get(service.id)
    if (existing) {
      existing.status.id = service.id
      existing.status.name = service.label ?? service.id
      return existing
    }

    const created: ServiceState = {
      status: createDefaultServiceStatus(service),
      stopRequested: false,
    }
    this.serviceStates.set(service.id, created)
    return created
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
