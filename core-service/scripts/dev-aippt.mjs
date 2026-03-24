import { spawn } from 'node:child_process'

const processes = []
let shuttingDown = false
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })

  processes.push({ name, child })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[dev:aippt] ${name} exited with ${reason}`)
    shutdown(code ?? 1)
  })

  child.on('error', (err) => {
    if (shuttingDown) return
    console.error(`[dev:aippt] failed to start ${name}: ${err.message}`)
    shutdown(1)
  })

  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const { child } of processes) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => {
    for (const { child } of processes) {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }
  }, 1200).unref()

  setTimeout(() => process.exit(exitCode), 1400).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('[dev:aippt] starting backend (frontend/server) and frontend (frontend)')

run('backend', npmCmd, ['--prefix', 'frontend/server', 'run', 'dev'])
run('frontend', npmCmd, ['--prefix', 'frontend', 'run', 'dev'])
