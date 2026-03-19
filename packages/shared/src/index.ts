export const APP_NAME = 'manclaw'

export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'unknown'
export type LogLevel = 'info' | 'warn' | 'error'
export type RiskLevel = 'low' | 'medium' | 'high'
export type ShellExecutionStatus = 'running' | 'completed' | 'failed'

export interface ApiError {
  code: string
  message: string
}

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: ApiError
}

export interface ServiceSummary {
  id: string
  name: string
  status: ServiceStatus
  message?: string
}

export interface ServiceDetail extends ServiceSummary {
  pid?: number
  uptimeSeconds?: number
  startedAt?: string
  command?: string
  args?: string[]
  cwd?: string
  processName?: string
  configPath?: string
  healthUrl?: string
  healthStatus?: 'passing' | 'failing' | 'disabled'
  detectedBy?: 'managed' | 'process-scan'
}

export interface HealthSnapshot {
  generatedAt: string
  services: ServiceSummary[]
}

export interface SystemSummary {
  services: ServiceSummary[]
}

export interface ConfigDocument {
  format: 'json'
  path: string
  content: string
  updatedAt: string
}

export interface ConfigValidationResult {
  valid: boolean
  errors: string[]
}

export interface ConfigRevision {
  id: string
  createdAt: string
  comment?: string
}

export interface ManagerSettingsDocument {
  path: string
  updatedAt: string
  config: ManClawConfig
}

export interface RestartNoticeDocument {
  message: string
  status: string
  isError: boolean
  updatedAt: string
}

export type QuickModelProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'custom-openai'

export interface QuickModelConfig {
  provider: QuickModelProvider
  model: string
  apiKey?: string
  baseUrl?: string
  customProviderId?: string
  envVarName?: string
}

export interface QuickModelConfigDocument {
  availableProviders: Array<{
    id: QuickModelProvider
    label: string
    requiresApiKey: boolean
    supportsBaseUrl: boolean
    supportsCustomProviderId: boolean
  }>
  current: QuickModelConfig
}

export interface RecommendedSkill {
  slug: string
  title: string
  summary: string
  category: string
  source: 'clawhub'
  installed: boolean
}

export interface SkillsCatalogDocument {
  workspaceDir: string
  installDir: string
  registry: string
  items: RecommendedSkill[]
}

export interface SkillInstallItemResult {
  slug: string
  ok: boolean
  installed: boolean
  message: string
}

export interface SkillInstallResult {
  workspaceDir: string
  installDir: string
  results: SkillInstallItemResult[]
}

export type InstalledSkillState = 'installed' | 'disabled'

export interface InstalledSkillEntry {
  slug: string
  title: string
  summary: string
  state: InstalledSkillState
  path: string
  version?: string
  registry?: string
  installedAt?: string
}

export interface InstalledSkillsDocument {
  workspaceDir: string
  installDir: string
  disabledDir: string
  items: InstalledSkillEntry[]
}

export interface RegistrySkillDetail {
  slug: string
  title: string
  summary: string
  owner: string
  latestVersion?: string
  updatedAt?: string
  license?: string
  suspicious: boolean
  malwareBlocked: boolean
  warning?: string
  source: 'clawhub'
}

export interface SkillMutationResult {
  slug: string
  state: InstalledSkillState | 'removed'
  message: string
}

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  source: 'app' | 'service' | 'shell' | 'audit'
  message: string
}

export interface ShellAllowedCommand {
  id: string
  title: string
  description: string
  riskLevel: RiskLevel
}

export interface ShellExecutionRecord {
  id: string
  commandId: string
  status: ShellExecutionStatus
  startedAt: string
  completedAt?: string
  exitCode?: number
  output: string
}

export interface ManagedServiceConfig {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  autoStart: boolean
  autoRestart: boolean
  processName: string
  configPath: string
  configFlag: string
  healthcheck: {
    enabled: boolean
    url: string
    timeoutMs: number
    expectedStatus: number
  }
}

export interface ManClawConfig {
  service: ManagedServiceConfig
  shell: {
    timeoutMs: number
  }
  ui?: {
    restartNotice?: RestartNoticeDocument | null
  }
}
