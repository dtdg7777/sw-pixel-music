// PIXEL MUSIC launcher: ensure the server, then open the player in a compact app window.
// No Win32 frame surgery: the window keeps its normal title bar so that moving it between
// monitors with different DPI cannot break rendering. Chromium owns the window, end of story.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')

const PORT = Number(process.env.PORT || 8123)
const TARGET = 'http://127.0.0.1:' + PORT + '/'
const W = 430
const H = 700
const X = +(process.env.PMP_X || 140)
const Y = +(process.env.PMP_Y || 60)

function alive () {
  return new Promise(resolve => {
    const req = http.get(TARGET, r => { r.resume(); resolve(true) })
    req.on('error', () => resolve(false))
    req.setTimeout(800, () => { req.destroy(); resolve(false) })
  })
}

function findBrowser () {
  const list = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ]
  return list.find(p => { try { return fs.existsSync(p) } catch (e) { return false } }) || null
}

;(async () => {
  let server = null
  if (!(await alive())) {
    server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname, stdio: 'ignore', windowsHide: true
    })
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250))
      if (await alive()) break
    }
  }

  const browser = findBrowser()
  if (!browser) {
    spawn('cmd', ['/c', 'start', '', TARGET], { detached: true, stdio: 'ignore' }).unref()
    return
  }

  const app = spawn(browser, [
    '--app=' + TARGET,
    '--window-size=' + W + ',' + H,
    '--window-position=' + X + ',' + Y,
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' })

  app.on('exit', () => {
    if (server) { try { server.kill() } catch (e) {} }
  })
})()
