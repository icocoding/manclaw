#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const currentFilePath = fileURLToPath(import.meta.url)
const releaseRoot = path.dirname(currentFilePath)
const appHome = process.env.MANCLAW_HOME
  ? path.resolve(process.env.MANCLAW_HOME)
  : path.join(os.homedir(), '.manclaw-home')
const runtimeDir = path.join(appHome, 'runtime')
const pidFile = path.join(runtimeDir, 'manclaw.pid')
const outLogFile = path.join(runtimeDir, 'manclaw.out.log')
const errLogFile = path.join(runtimeDir, 'manclaw.err.log')
const serverEntry = path.join(releaseRoot, 'server', 'index.js')
const defaultPort = process.env.PORT ?? '18300'
const packageName = 'manclaw'
const defaultRepo = 'icocoding/manclaw'
const packageVersion = readPackageVersion()
const command = process.argv[2] ?? 'help'

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(releaseRoot, 'package.json'), 'utf8'))
    return String(packageJson.version ?? '0.0.0')
  } catch {
    return '0.0.0'
  }
}

function ensureRuntimeDir() {
  mkdirSync(appHome, { recursive: true })
  mkdirSync(runtimeDir, { recursive: true })
}

function readPid() {
  try {
    const value = readFileSync(pidFile, 'utf8').trim()
    if (!value) {
      return null
    }

    const pid = Number(value)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function isProcessRunning(pid) {
  if (!pid) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function clearPidFile() {
  rmSync(pidFile, { force: true })
}

function statusMessage() {
  const pid = readPid()
  if (pid && isProcessRunning(pid)) {
    return {
      running: true,
      pid,
      message: `manclaw is running on port ${defaultPort} (pid ${pid}).`,
    }
  }

  if (pid) {
    clearPidFile()
  }

  return {
    running: false,
    pid: null,
    message: 'manclaw is stopped.',
  }
}

function start() {
  const current = statusMessage()
  if (current.running) {
    console.log(current.message)
    return 0
  }

  ensureRuntimeDir()

  const outFd = openSync(outLogFile, 'a')
  const errFd = openSync(errLogFile, 'a')
  const child = spawn(process.execPath, [serverEntry], {
    cwd: appHome,
    env: {
      ...process.env,
      PORT: defaultPort,
    },
    detached: true,
    stdio: ['ignore', outFd, errFd],
  })

  child.unref()
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8')

  console.log(`manclaw started on port ${defaultPort}.`)
  console.log(`PID: ${child.pid}`)
  console.log(`stdout: ${outLogFile}`)
  console.log(`stderr: ${errLogFile}`)
  return 0
}

function stop() {
  const pid = readPid()
  if (!pid) {
    console.log('manclaw is already stopped.')
    return 0
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (error) {
    clearPidFile()
    console.log(`manclaw was not running (stale pid ${pid} removed).`)
    return 0
  }

  clearPidFile()
  console.log(`manclaw stopped (pid ${pid}).`)
  return 0
}

function restart() {
  stop()
  return start()
}

function status() {
  const current = statusMessage()
  console.log(current.message)
  return current.running ? 0 : 1
}

function logs() {
  ensureRuntimeDir()
  console.log(`stdout: ${outLogFile}`)
  console.log(`stderr: ${errLogFile}`)
  return 0
}

function info() {
  ensureRuntimeDir()
  const current = statusMessage()
  const summary = {
    releaseRoot,
    appHome,
    runtimeDir,
    pidFile,
    port: defaultPort,
    running: current.running,
    pid: current.pid,
    version: packageVersion,
  }
  console.log(JSON.stringify(summary, null, 2))
  return 0
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'manclaw-release-cli',
        },
      },
      (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          const error = new Error(`Request failed: ${response.statusCode ?? 'unknown status'}`)
          error.statusCode = response.statusCode ?? null
          reject(error)
          response.resume()
          return
        }

        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (error) {
            reject(error)
          }
        })
      },
    )

    request.on('error', reject)
  })
}

function compareVersions(left, right) {
  const normalize = (value) =>
    value
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)

  const leftParts = normalize(left)
  const rightParts = normalize(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }

  return 0
}

async function fetchLatestRelease() {
  try {
    return await requestJson(`https://api.github.com/repos/${defaultRepo}/releases/latest`)
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 404) {
      throw new Error('No published GitHub release found yet.')
    }
    throw error
  }
}

function selectZipAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : []
  return (
    assets.find((asset) => typeof asset.name === 'string' && asset.name.startsWith('manclaw-release-') && asset.name.endsWith('.zip')) ??
    assets.find((asset) => typeof asset.name === 'string' && asset.name.endsWith('.zip')) ??
    null
  )
}

async function checkUpdate() {
  const release = await fetchLatestRelease()
  const latestVersion = String(release.tag_name ?? '').replace(/^v/, '') || packageVersion
  const delta = compareVersions(latestVersion, packageVersion)

  if (delta > 0) {
    console.log(`Update available: ${packageVersion} -> ${latestVersion}`)
    return 0
  }

  console.log(`ManClaw is up to date (${packageVersion}).`)
  return 0
}

async function update() {
  const release = await fetchLatestRelease()
  const latestVersion = String(release.tag_name ?? '').replace(/^v/, '') || packageVersion
  const delta = compareVersions(latestVersion, packageVersion)

  if (delta <= 0) {
    console.log(`ManClaw is already up to date (${packageVersion}).`)
    return 0
  }

  const zipAsset = selectZipAsset(release)
  if (!zipAsset?.browser_download_url || !zipAsset?.name) {
    throw new Error('No downloadable release zip found in the latest release.')
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'manclaw-update-'))
  const zipPath = path.join(tempRoot, zipAsset.name)
  const wasRunning = statusMessage().running

  try {
    if (wasRunning) {
      stop()
    }

    await execFileAsync('curl', ['-fsSL', zipAsset.browser_download_url, '-o', zipPath])
    await execFileAsync('unzip', ['-oq', zipPath, '-d', tempRoot])

    const releaseDir = path.join(tempRoot, 'manclaw-release')
    await execFileAsync('npm', ['install', '--omit=dev', '--prefix', releaseDir], {
      env: process.env,
    })
    await execFileAsync('npm', ['install', '-g', releaseDir], {
      env: process.env,
    })

    console.log(`ManClaw updated: ${packageVersion} -> ${latestVersion}`)
    if (wasRunning) {
      console.log('The background server was stopped before update. Run `manclaw start` to start the new version.')
    }
    return 0
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function uninstall() {
  stop()
  await execFileAsync('npm', ['uninstall', '-g', packageName], {
    env: process.env,
  })
  console.log('ManClaw CLI uninstalled.')
  return 0
}

function help() {
  console.log(`Usage: manclaw <command>

Commands:
  start      Start the ManClaw server in the background
  stop       Stop the background server
  restart    Restart the background server
  status     Print current server status
  logs       Show log file locations
  info       Show runtime paths and current status
  check-update  Check whether a newer release is available
  update     Download and install the latest release package
  uninstall  Stop the server and uninstall the global CLI
  help       Show this help message

Environment:
  MANCLAW_HOME  Override the runtime home directory
  PORT          Override the default port (18300)
`)
  return 0
}

const handlers = {
  start,
  stop,
  restart,
  status,
  logs,
  info,
  'check-update': checkUpdate,
  update,
  uninstall,
  help,
}

if (!(command in handlers)) {
  console.error(`Unknown command: ${command}`)
  help()
  process.exit(1)
}

try {
  process.exitCode = await handlers[command]()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
