import fastifyStatic from '@fastify/static'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createManager } from '@manclaw/core'
import {
  APP_NAME,
  type AgentConfigPayload,
  type ApiResponse,
  type ChannelConfigPayload,
  type CreateProfilePayload,
  type DeleteProfilePayload,
  type FeishuToolsConfig,
  type QuickModelConfigPayload,
} from '@manclaw/shared'

const QUIET_LOG_PATHS = new Set([
  '/health',
  '/api/system/summary',
  '/api/openclaw/status',
  '/api/openclaw/statuses',
  '/api/logs/runtime',
  '/api/logs/audit',
  '/api/skills/installed',
  '/api/model-setup/current',
  '/api/agents/current',
  '/api/channels/current',
  '/api/openclaw/plugins',
  '/api/shell/allowed-commands',
])

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      remove: true,
    },
  },
  disableRequestLogging: true,
})

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const webDistCandidates = [
  path.resolve(currentDirPath, '../web/dist'),
  path.resolve(currentDirPath, '../../web/dist'),
  path.resolve(currentDirPath, '../../../web/dist'),
]
const manager = createManager(process.cwd())
await manager.initialize()

app.addHook('onRequest', async (request) => {
  request.headers['x-manclaw-started-at'] = String(Date.now())
})

app.addHook('onResponse', async (request, reply) => {
  const startedAt = Number(request.headers['x-manclaw-started-at'] ?? Date.now())
  const durationMs = Date.now() - startedAt
  const path = request.url.split('?')[0]
  const shouldLog = !QUIET_LOG_PATHS.has(path) || request.method !== 'GET' || reply.statusCode >= 400

  if (!shouldLog) {
    return
  }

  app.log.info(
    {
      reqId: request.id,
      method: request.method,
      path,
      statusCode: reply.statusCode,
      durationMs,
    },
    'request completed',
  )
})

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
})

function ok<T>(data: T): ApiResponse<T> {
  return {
    ok: true,
    data,
  }
}

function fail(code: string, message: string): ApiResponse<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

app.get('/health', async () => ({
  ok: true,
  app: APP_NAME,
  snapshot: await manager.getHealthSnapshot(),
}))

app.get('/api/system/summary', async () => ok(await manager.getSystemSummary()))
app.get('/api/openclaw/status', async () => ok(await manager.getServiceStatus()))
app.get('/api/openclaw/statuses', async () => ok(await manager.getServiceStatuses()))
app.get('/api/openclaw/plugins', async (request, reply) => {
  try {
    return ok(await manager.getOpenClawPlugins())
  } catch (error) {
    app.log.error(
      {
        err: error,
        reqId: request.id,
        method: request.method,
        path: request.url.split('?')[0],
      },
      'openclaw plugins list failed',
    )
    return reply.code(500).send(fail('OPENCLAW_PLUGINS_LIST_FAILED', error instanceof Error ? error.message : 'OpenClaw plugins list failed.'))
  }
})
app.get<{ Params: { id: string } }>('/api/openclaw/plugins/:id', async (request, reply) => {
  try {
    return ok(await manager.getOpenClawPlugin(request.params.id))
  } catch (error) {
    return reply.code(404).send(fail('PLUGIN_NOT_FOUND', error instanceof Error ? error.message : 'Plugin not found.'))
  }
})
app.get('/api/openclaw/plugins/feishu-tools', async () => ok(await manager.getFeishuToolsConfig()))
app.post('/api/openclaw/start', async () => ok(await manager.startService()))
app.post('/api/openclaw/stop', async () => ok(await manager.stopService()))
app.post('/api/openclaw/restart', async () => ok(await manager.restartService()))

app.get('/api/manager/settings', async () => ok(await manager.getManagerSettings()))
app.get('/api/restart-notice', async () => ok(await manager.getRestartNotice()))
app.post<{ Body: { message?: string; status?: string; isError?: boolean } }>('/api/restart-notice', async (request, reply) => {
  if (typeof request.body?.message !== 'string' || request.body.message.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.message must be a non-empty string.'))
  }

  try {
    return ok(
      await manager.saveRestartNotice({
        message: request.body.message,
        status: request.body.status,
        isError: request.body.isError,
      }),
    )
  } catch (error) {
    return reply.code(400).send(fail('RESTART_NOTICE_FAILED', error instanceof Error ? error.message : 'Restart notice save failed.'))
  }
})
app.delete('/api/restart-notice', async () => {
  await manager.clearRestartNotice()
  return ok({ cleared: true })
})
app.post<{ Body: unknown }>('/api/manager/settings', async (request, reply) => {
  try {
    return ok(await manager.saveManagerSettings(request.body))
  } catch (error) {
    return reply.code(400).send(fail('CONFIG_VALIDATION_FAILED', error instanceof Error ? error.message : 'Manager settings save failed.'))
  }
})
app.post<{ Body: CreateProfilePayload }>('/api/manager/profiles', async (request, reply) => {
  if (typeof request.body?.id !== 'string' || request.body.id.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.id must be a non-empty string.'))
  }
  if (
    request.body.port !== undefined &&
    (!Number.isInteger(request.body.port) || request.body.port <= 0)
  ) {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.port must be a positive integer.'))
  }

  try {
    return ok(await manager.createProfile(request.body))
  } catch (error) {
    return reply.code(400).send(fail('PROFILE_CREATE_FAILED', error instanceof Error ? error.message : 'Profile create failed.'))
  }
})
app.post<{ Body: DeleteProfilePayload }>('/api/manager/profiles/delete', async (request, reply) => {
  if (typeof request.body?.id !== 'string' || request.body.id.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.id must be a non-empty string.'))
  }

  try {
    return ok(await manager.deleteProfile(request.body))
  } catch (error) {
    return reply.code(400).send(fail('PROFILE_DELETE_FAILED', error instanceof Error ? error.message : 'Profile delete failed.'))
  }
})

app.get('/api/config/current', async () => ok(await manager.getCurrentConfig()))
app.get('/api/config/revisions', async () => ok(await manager.getConfigRevisions()))
app.get('/api/skills/recommended', async () => ok(await manager.getRecommendedSkillsCatalog()))
app.get('/api/skills/installed', async () => ok(await manager.getInstalledSkills()))
app.get('/api/skills/config', async () => ok(await manager.getSkillsConfig()))
app.get<{ Params: { slug: string } }>('/api/skills/inspect/:slug', async (request, reply) => {
  try {
    return ok(await manager.inspectSkill(request.params.slug))
  } catch (error) {
    return reply.code(404).send(fail('NOT_FOUND', error instanceof Error ? error.message : 'Skill not found.'))
  }
})
app.post<{ Body: { allowBundled?: string[] } }>('/api/skills/config', async (request, reply) => {
  if (!Array.isArray(request.body?.allowBundled) || request.body.allowBundled.some((item) => typeof item !== 'string')) {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.allowBundled must be an array of strings.'))
  }

  try {
    return ok(await manager.saveSkillsConfig({ allowBundled: request.body.allowBundled }))
  } catch (error) {
    return reply.code(400).send(fail('SKILLS_CONFIG_SAVE_FAILED', error instanceof Error ? error.message : 'Skills config save failed.'))
  }
})
app.get('/api/model-setup/current', async () => ok(await manager.getQuickModelConfig()))
app.get('/api/agents/current', async () => ok(await manager.getAgentConfig()))
app.get('/api/channels/current', async () => ok(await manager.getChannelConfig()))
app.delete<{ Params: { id: string } }>('/api/agents/:id/sessions', async (request, reply) => {
  try {
    return ok(await manager.clearAgentSessions(request.params.id))
  } catch (error) {
    return reply.code(400).send(fail('AGENT_SESSIONS_CLEAR_FAILED', error instanceof Error ? error.message : 'Agent sessions clear failed.'))
  }
})
app.post<{ Params: { id: string }; Body: { slug?: string; force?: boolean; skipInspect?: boolean } }>(
  '/api/agents/:id/skills/install-one',
  async (request, reply) => {
    if (typeof request.body?.slug !== 'string' || request.body.slug.trim() === '') {
      return reply.code(400).send(fail('INVALID_INPUT', 'Body.slug must be a non-empty string.'))
    }

    try {
      return ok(
        await manager.installAgentSkill(
          request.params.id,
          request.body.slug,
          Boolean(request.body.force),
          Boolean(request.body.skipInspect),
        ),
      )
    } catch (error) {
      return reply.code(400).send(fail('AGENT_SKILL_INSTALL_FAILED', error instanceof Error ? error.message : 'Agent skill install failed.'))
    }
  },
)
app.delete<{ Params: { id: string; slug: string } }>(
  '/api/agents/:id/skills/:slug',
  async (request, reply) => {
    try {
      return ok(await manager.deleteAgentSkill(request.params.id, request.params.slug))
    } catch (error) {
      return reply.code(400).send(fail('AGENT_SKILL_DELETE_FAILED', error instanceof Error ? error.message : 'Agent skill delete failed.'))
    }
  },
)
app.post<{ Body: { slugs?: string[] } }>('/api/skills/install', async (request, reply) => {
  if (!Array.isArray(request.body?.slugs) || request.body.slugs.some((slug) => typeof slug !== 'string')) {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.slugs must be an array of strings.'))
  }

  try {
    return ok(await manager.installRecommendedSkills(request.body.slugs))
  } catch (error) {
    return reply.code(400).send(fail('SKILL_INSTALL_FAILED', error instanceof Error ? error.message : 'Skill install failed.'))
  }
})
app.post<{ Body: { slug?: string; force?: boolean; skipInspect?: boolean } }>('/api/skills/install-one', async (request, reply) => {
  if (typeof request.body?.slug !== 'string' || request.body.slug.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.slug must be a non-empty string.'))
  }

  try {
    return ok(await manager.installSkill(request.body.slug, Boolean(request.body.force), Boolean(request.body.skipInspect)))
  } catch (error) {
    return reply.code(400).send(fail('SKILL_INSTALL_FAILED', error instanceof Error ? error.message : 'Skill install failed.'))
  }
})
app.post<{ Params: { slug: string } }>('/api/skills/:slug/disable', async (request, reply) => {
  try {
    return ok(await manager.disableSkill(request.params.slug))
  } catch (error) {
    return reply.code(400).send(fail('SKILL_DISABLE_FAILED', error instanceof Error ? error.message : 'Skill disable failed.'))
  }
})
app.post<{ Params: { slug: string } }>('/api/skills/:slug/enable', async (request, reply) => {
  try {
    return ok(await manager.enableSkill(request.params.slug))
  } catch (error) {
    return reply.code(400).send(fail('SKILL_ENABLE_FAILED', error instanceof Error ? error.message : 'Skill enable failed.'))
  }
})
app.post<{ Params: { slug: string } }>('/api/skills/:slug/update', async (request, reply) => {
  try {
    return ok(await manager.updateSkill(request.params.slug))
  } catch (error) {
    return reply.code(400).send(fail('SKILL_UPDATE_FAILED', error instanceof Error ? error.message : 'Skill update failed.'))
  }
})
app.delete<{ Params: { slug: string } }>('/api/skills/:slug', async (request, reply) => {
  try {
    return ok(await manager.deleteSkill(request.params.slug))
  } catch (error) {
    return reply.code(400).send(fail('SKILL_DELETE_FAILED', error instanceof Error ? error.message : 'Skill delete failed.'))
  }
})

app.post<{ Body: QuickModelConfigPayload }>(
  '/api/model-setup/apply',
  async (request, reply) => {
    if (!request.body || !Array.isArray(request.body.entries) || typeof request.body.defaultModelId !== 'string') {
      return reply.code(400).send(fail('INVALID_INPUT', 'Body.entries must be an array and body.defaultModelId must be a string.'))
    }

    try {
      return ok(await manager.saveQuickModelConfig(request.body))
    } catch (error) {
      return reply.code(400).send(fail('MODEL_SETUP_FAILED', error instanceof Error ? error.message : 'Model setup failed.'))
    }
  },
)
app.post<{ Body: AgentConfigPayload }>(
  '/api/agents/save',
  async (request, reply) => {
    if (
      !request.body ||
      typeof request.body.defaultAgentId !== 'string' ||
      !request.body.defaults ||
      !Array.isArray(request.body.items)
    ) {
      return reply.code(400).send(fail('INVALID_INPUT', 'Body.defaultAgentId, body.defaults and body.items are required.'))
    }

    try {
      return ok(await manager.saveAgentConfig(request.body))
    } catch (error) {
      return reply.code(400).send(fail('AGENT_SETUP_FAILED', error instanceof Error ? error.message : 'Agent setup failed.'))
    }
  },
)
app.post<{ Body: ChannelConfigPayload }>(
  '/api/channels/save',
  async (request, reply) => {
    if (!request.body || !Array.isArray(request.body.items)) {
      return reply.code(400).send(fail('INVALID_INPUT', 'Body.items is required and must be an array.'))
    }

    try {
      return ok(await manager.saveChannelConfig(request.body))
    } catch (error) {
      return reply.code(400).send(fail('CHANNEL_SETUP_FAILED', error instanceof Error ? error.message : 'Channel setup failed.'))
    }
  },
)

app.post<{
  Body: { doc?: boolean; chat?: boolean; wiki?: boolean; drive?: boolean; perm?: boolean; scopes?: boolean; bitable?: boolean }
}>('/api/openclaw/plugins/feishu-tools', async (request, reply) => {
  if (
    typeof request.body?.doc !== 'boolean' ||
    typeof request.body?.chat !== 'boolean' ||
    typeof request.body?.wiki !== 'boolean' ||
    typeof request.body?.drive !== 'boolean' ||
    typeof request.body?.perm !== 'boolean' ||
    typeof request.body?.scopes !== 'boolean' ||
    typeof request.body?.bitable !== 'boolean'
  ) {
    return reply.code(400).send(fail('INVALID_INPUT', 'Feishu tools body must contain boolean doc/chat/wiki/drive/perm/scopes/bitable fields.'))
  }

  try {
    const candidate: FeishuToolsConfig = {
      doc: request.body.doc,
      chat: request.body.chat,
      wiki: request.body.wiki,
      drive: request.body.drive,
      perm: request.body.perm,
      scopes: request.body.scopes,
      bitable: request.body.bitable,
    }
    return ok(await manager.saveFeishuToolsConfig(candidate))
  } catch (error) {
    return reply.code(400).send(fail('FEISHU_TOOLS_SAVE_FAILED', error instanceof Error ? error.message : 'Feishu tools save failed.'))
  }
})

app.post<{ Params: { id: string } }>('/api/openclaw/plugins/:id/enable', async (request, reply) => {
  if (typeof request.params?.id !== 'string' || request.params.id.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Plugin id must be a non-empty string.'))
  }

  try {
    return ok(await manager.setPluginEnabled(request.params.id, true))
  } catch (error) {
    return reply.code(400).send(fail('PLUGIN_ENABLE_FAILED', error instanceof Error ? error.message : 'Plugin enable failed.'))
  }
})

app.post<{ Params: { id: string } }>('/api/openclaw/plugins/:id/disable', async (request, reply) => {
  if (typeof request.params?.id !== 'string' || request.params.id.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Plugin id must be a non-empty string.'))
  }

  try {
    return ok(await manager.setPluginEnabled(request.params.id, false))
  } catch (error) {
    return reply.code(400).send(fail('PLUGIN_DISABLE_FAILED', error instanceof Error ? error.message : 'Plugin disable failed.'))
  }
})

app.post<{ Body: { command?: string } }>('/api/openclaw/plugins/install-command', async (request, reply) => {
  if (typeof request.body?.command !== 'string' || request.body.command.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Plugin install body.command must be a non-empty string.'))
  }

  try {
    return ok(await manager.executePluginInstallCommand(request.body.command))
  } catch (error) {
    return reply.code(400).send(fail('PLUGIN_INSTALL_COMMAND_FAILED', error instanceof Error ? error.message : 'Plugin install command failed.'))
  }
})

app.post<{ Body: { content?: string } }>('/api/config/validate', async (request, reply) => {
  if (typeof request.body?.content !== 'string') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.content must be a string.'))
  }

  return ok(await manager.validateConfig(request.body.content))
})

app.post<{ Body: { content?: string; comment?: string } }>('/api/config/save', async (request, reply) => {
  if (typeof request.body?.content !== 'string') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.content must be a string.'))
  }

  try {
    return ok(await manager.saveConfig(request.body.content, request.body.comment))
  } catch (error) {
    return reply.code(400).send(fail('CONFIG_VALIDATION_FAILED', error instanceof Error ? error.message : 'Config save failed.'))
  }
})

app.post<{ Body: { revisionId?: string } }>('/api/config/rollback', async (request, reply) => {
  if (typeof request.body?.revisionId !== 'string' || request.body.revisionId.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.revisionId must be a non-empty string.'))
  }

  try {
    return ok(await manager.rollbackConfig(request.body.revisionId))
  } catch (error) {
    return reply.code(404).send(fail('NOT_FOUND', error instanceof Error ? error.message : 'Revision not found.'))
  }
})

app.post('/api/config/undo-last', async (_request, reply) => {
  try {
    return ok(await manager.undoLastConfigChange())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Undo failed.'
    const statusCode = /No config revision available/i.test(message) ? 400 : 404
    return reply.code(statusCode).send(fail('UNDO_FAILED', message))
  }
})

app.get<{ Querystring: { limit?: string } }>('/api/logs/runtime', async (request) => {
  const limit = Number(request.query.limit ?? 50)
  return ok(await manager.getRuntimeLogs(Number.isFinite(limit) ? limit : 50))
})

app.get<{ Querystring: { limit?: string } }>('/api/logs/audit', async (request) => {
  const limit = Number(request.query.limit ?? 50)
  return ok(await manager.getAuditLogs(Number.isFinite(limit) ? limit : 50))
})

app.get('/api/shell/allowed-commands', async () => ok({ items: manager.getAllowedCommands() }))

app.post<{ Body: { commandId?: string } }>('/api/shell/execute', async (request, reply) => {
  if (typeof request.body?.commandId !== 'string' || request.body.commandId.trim() === '') {
    return reply.code(400).send(fail('INVALID_INPUT', 'Body.commandId must be a non-empty string.'))
  }

  const allowedCommands = manager.getAllowedCommands().map((command) => command.id)
  if (!allowedCommands.includes(request.body.commandId)) {
    return reply.code(403).send(fail('SHELL_NOT_ALLOWED', `Command ${request.body.commandId} is not allowed.`))
  }

  return ok(await manager.executeAllowedCommand(request.body.commandId))
})

app.get<{ Params: { executionId: string } }>('/api/shell/executions/:executionId', async (request, reply) => {
  const execution = manager.getExecution(request.params.executionId)
  if (!execution) {
    return reply.code(404).send(fail('NOT_FOUND', `Execution ${request.params.executionId} was not found.`))
  }

  return ok(execution)
})

try {
  const webDistDir = await (async () => {
    for (const candidate of webDistCandidates) {
      try {
        await access(candidate, constants.R_OK)
        return candidate
      } catch {
        continue
      }
    }

    throw new Error('web dist not found')
  })()

  await app.register(fastifyStatic, {
    root: webDistDir,
    prefix: '/',
    index: ['index.html'],
    wildcard: false,
  })

  app.setNotFoundHandler(async (request, reply) => {
    const routePath = request.url.split('?')[0]
    if (routePath === '/health' || routePath.startsWith('/api/')) {
      return reply.code(404).send(fail('NOT_FOUND', `Route ${routePath} was not found.`))
    }

    return reply.type('text/html; charset=utf-8').sendFile('index.html')
  })
} catch {
  app.log.warn({ webDistCandidates }, 'web dist not found, static UI serving disabled')
}

app.setErrorHandler((error, request, reply) => {
  app.log.error(
    {
      err: error,
      reqId: request.id,
      method: request.method,
      path: request.url.split('?')[0],
    },
    'request failed',
  )
  void reply.code(500).send(fail('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal error.'))
})

const port = Number(process.env.PORT ?? 18300)
const host = process.env.HOST ?? '127.0.0.1'

try {
  await app.listen({ port, host })
  app.log.info({ app: APP_NAME, host, port }, 'server ready')
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
