export const APP_NAME = 'manclaw'

export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'unknown'
export type ServiceDetectionSource = 'managed' | 'process-scan' | 'systemd' | 'launchctl'
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
  detectedBy?: ServiceDetectionSource
  managerName?: string
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

export interface OpenClawPluginEntry {
  id: string
  name: string
  description: string
  version?: string
  source: string
  origin?: string
  enabled: boolean
  status: string
  toolNames: string[]
  hookNames: string[]
  channelIds: string[]
  providerIds: string[]
  gatewayMethods: string[]
  cliCommands: string[]
  services: string[]
  commands: string[]
  httpRoutes: number
  hookCount: number
  configSchema: boolean
  error?: string
}

export interface OpenClawPluginsDocument {
  workspaceDir?: string
  loadedCount: number
  totalCount: number
  items: OpenClawPluginEntry[]
}

export interface PluginMutationResult {
  pluginId: string
  action: 'enable' | 'disable'
  output: string
}

export interface FeishuToolsConfig {
  doc: boolean
  chat: boolean
  wiki: boolean
  drive: boolean
  perm: boolean
  scopes: boolean
  bitable: boolean
}

export interface FeishuToolsConfigDocument {
  path: string
  updatedAt: string
  defaults: FeishuToolsConfig
  current: FeishuToolsConfig
}

export type QuickModelProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'custom-openai'

export interface QuickModelEntry {
  id: string
  provider: QuickModelProvider
  model: string
  apiKey?: string
  baseUrl?: string
  customProviderId?: string
  envVarName?: string
}

export interface QuickModelConfigPayload {
  defaultModelId: string
  entries: QuickModelEntry[]
}

export interface QuickModelConfigDocument {
  availableProviders: Array<{
    id: QuickModelProvider
    label: string
    requiresApiKey: boolean
    supportsBaseUrl: boolean
    supportsCustomProviderId: boolean
  }>
  defaultModelId: string
  entries: QuickModelEntry[]
}

export interface AgentChannelOption {
  id: string
  label: string
}

export interface ChannelBindingEntry {
  id: string
  agentId: string
  accountId?: string
}

export interface ChannelConfigEntry {
  sourceId: string
  id: string
  type?: string
  configText: string
  bindings: ChannelBindingEntry[]
}

export interface ChannelConfigPayload {
  items: ChannelConfigEntry[]
}

export interface ChannelConfigDocument extends ChannelConfigPayload {
  availableAgents: Array<{
    id: string
    label: string
  }>
}

export interface AgentBindingEntry {
  id: string
  channel: string
  accountId?: string
}

export interface AgentDefaultsConfig {
  workspace: string
  modelPrimary: string
  compactionMode: string
}

export type AgentToolsProfile = 'minimal' | 'coding' | 'messaging' | 'full'

export interface AgentToolsConfig {
  profile?: AgentToolsProfile
  allow: string[]
  deny: string[]
}

export interface AgentConfigEntry {
  sourceId: string
  id: string
  bindings: AgentBindingEntry[]
  workspace?: string
  modelPrimary?: string
  compactionMode?: string
  tools?: AgentToolsConfig
  resolvedWorkspace?: string
  skillsDir?: string
  disabledSkillsDir?: string
  workspaceSkills?: AgentWorkspaceSkillEntry[]
  sessionStorePath?: string
  sessionCount?: number
  transcriptFileCount?: number
}

export interface AgentConfigPayload {
  defaultAgentId: string
  defaults: AgentDefaultsConfig
  items: AgentConfigEntry[]
}

export interface AgentConfigDocument extends AgentConfigPayload {
  availableChannels: AgentChannelOption[]
}

export interface AgentWorkspaceSkillEntry {
  slug: string
  state: InstalledSkillState
  path: string
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

export interface SkillsConfigDocument {
  allowBundled: string[]
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

export interface InstalledSkillMissingRequirements {
  bins: string[]
  anyBins: string[]
  env: string[]
  config: string[]
  os: string[]
}

export interface InstalledSkillEntry {
  slug: string
  title: string
  summary: string
  state: InstalledSkillState
  path?: string
  version?: string
  registry?: string
  installedAt?: string
  source?: string
  bundled?: boolean
  eligible?: boolean
  blockedByAllowlist?: boolean
  manageable?: boolean
  toggleManageable?: boolean
  managementMode?: 'workspace' | 'config'
  missing?: InstalledSkillMissingRequirements
}

export interface InstalledSkillsDocument {
  workspaceDir: string
  installDir: string
  disabledDir: string
  managedSkillsDir?: string
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
