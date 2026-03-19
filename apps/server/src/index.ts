import fastifyStatic from '@fastify/static'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createManager } from '@manclaw/core'
import { APP_NAME, type ApiResponse } from '@manclaw/shared'

const QUIET_LOG_PATHS = new Set([
  '/health',
  '/api/system/summary',
  '/api/openclaw/status',
  '/api/logs/runtime',
  '/api/logs/audit',
  '/api/skills/installed',
  '/api/model-setup/current',
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

app.get('/api/config/current', async () => ok(await manager.getCurrentConfig()))
app.get('/api/config/revisions', async () => ok(await manager.getConfigRevisions()))
app.get('/api/skills/recommended', async () => ok(await manager.getRecommendedSkillsCatalog()))
app.get('/api/skills/installed', async () => ok(await manager.getInstalledSkills()))
app.get<{ Params: { slug: string } }>('/api/skills/inspect/:slug', async (request, reply) => {
  try {
    return ok(await manager.inspectSkill(request.params.slug))
  } catch (error) {
    return reply.code(404).send(fail('NOT_FOUND', error instanceof Error ? error.message : 'Skill not found.'))
  }
})
app.get('/api/model-setup/current', async () => ok(await manager.getQuickModelConfig()))
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

app.post<{ Body: { provider?: string; model?: string; apiKey?: string; baseUrl?: string; customProviderId?: string; envVarName?: string } }>(
  '/api/model-setup/apply',
  async (request, reply) => {
    if (typeof request.body?.provider !== 'string' || typeof request.body?.model !== 'string') {
      return reply.code(400).send(fail('INVALID_INPUT', 'Body.provider and body.model must be strings.'))
    }

    try {
      return ok(await manager.saveQuickModelConfig({
        provider: request.body.provider as never,
        model: request.body.model,
        apiKey: request.body.apiKey,
        baseUrl: request.body.baseUrl,
        customProviderId: request.body.customProviderId,
        envVarName: request.body.envVarName,
      }))
    } catch (error) {
      return reply.code(400).send(fail('MODEL_SETUP_FAILED', error instanceof Error ? error.message : 'Model setup failed.'))
    }
  },
)

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
const host = process.env.HOST ?? '0.0.0.0'

try {
  await app.listen({ port, host })
  app.log.info({ app: APP_NAME, host, port }, 'server ready')
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
