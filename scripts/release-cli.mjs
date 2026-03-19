#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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
const command = process.argv[2] ?? 'help'

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
  console.log(`Logs: ${outLogFile}`)
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
  }
  console.log(JSON.stringify(summary, null, 2))
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
  help,
}

if (!(command in handlers)) {
  console.error(`Unknown command: ${command}`)
  help()
  process.exit(1)
}

try {
  process.exitCode = handlers[command]()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
