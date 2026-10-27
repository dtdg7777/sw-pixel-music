const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const api = require('NeteaseCloudMusicApi')

const ROOT = __dirname
const PORT = Number(process.env.PORT || 8123)
const COOKIE_FILE = path.join(ROOT, '.cookie.txt')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' }
const ALLOW_HOST = /(^|\.)(music\.126\.net|126\.net|127\.net|netease\.com)$/i

let cookie = ''
let uid = null
let nickname = ''
try { cookie = fs.readFileSync(COOKIE_FILE, 'utf8').trim() } catch (e) {}

async function refreshMe () {
  if (!cookie) { uid = null; nickname = ''; return }
  try {
    const r = await api.login_status({ cookie })
    const d = r.body && r.body.data
    if (d && d.profile) { uid = d.profile.userId; nickname = d.profile.nickname || '' } else { uid = null; nickname = '' }
  } catch (e) { uid = null; nickname = '' }
}
const opts = (o) => (cookie ? Object.assign({}, o, { cookie }) : o)

function json (res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function follow (url, req, res, depth = 0) {
  if (depth > 4) { res.destroy(); return }
  const lib = url.startsWith('https') ? https : http
  const headers = { 'user-agent': 'Mozilla/5.0', referer: 'https://music.163.com/' }
  if (req.headers.range) headers.range = req.headers.range
  const up = lib.get(url, { headers }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume()
      follow(new URL(r.headers.location, url).toString(), req, res, depth + 1)
      return
    }
    const h = {
      'content-type': r.headers['content-type'] || 'application/octet-stream',
      'accept-ranges': r.headers['accept-ranges'] || 'bytes',
      'cache-control': 'no-store'
    }
    if (r.headers['content-length']) h['content-length'] = r.headers['content-length']
    if (r.headers['content-range']) h['content-range'] = r.headers['content-range']
    res.writeHead(r.statusCode, h)
    r.pipe(res)
  })
  up.on('error', () => { try { res.destroy() } catch (e) {} })
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1')
  try {
    if (u.pathname === '/api/status') {
      if (cookie && !uid) await refreshMe()
      return json(res, 200, { loggedIn: !!cookie, uid, nickname })
    }

    // 我的歌单（需要登录）
    if (u.pathname === '/api/playlists') {
      if (!cookie) return json(res, 401, { error: 'not logged in' })
      if (!uid) await refreshMe()
      if (!uid) return json(res, 401, { error: 'cookie 已失效，请重新扫码' })
      const r = await api.user_playlist(opts({ uid, limit: 50, offset: 0 }))
      const raw = (r.body && r.body.playlist) || []
      const playlists = raw.map(p => ({ id: p.id, name: p.name, count: p.trackCount || 0, cover: p.coverImgUrl || '' }))
      return json(res, 200, { playlists })
    }

    // 单个歌单的曲目
    if (u.pathname === '/api/playlist') {
      if (!cookie) return json(res, 401, { error: 'not logged in' })
      const id = u.searchParams.get('id')
      if (!id) return json(res, 400, { error: 'missing id' })
      const r = await api.playlist_track_all(opts({ id, limit: 500 }))
      const raw = (r.body && r.body.songs) || []
      const songs = raw.map(s => ({
        id: s.id,
        name: s.name,
        artist: (s.ar || []).map(a => a.name).join(' / '),
        album: (s.al && s.al.name) || '',
        duration: s.dt || 0,
        cover: (s.al && s.al.picUrl) || ''
      }))
      return json(res, 200, { songs })
    }

    if (u.pathname === '/api/search') {
      const keywords = (u.searchParams.get('q') || '').trim()
      const limit = Math.min(50, Number(u.searchParams.get('limit') || 20))
      if (!keywords) return json(res, 400, { error: 'empty query' })
      const r = await api.cloudsearch(opts({ keywords, limit, type: 1 }))
      const songs = ((r.body.result && r.body.result.songs) || []).map(s => ({
        id: s.id,
        name: s.name,
        artist: (s.ar || []).map(a => a.name).join(' / '),
        album: (s.al && s.al.name) || '',
        duration: s.dt || 0,
        cover: (s.al && s.al.picUrl) || ''
      }))
      return json(res, 200, { songs })
    }

    if (u.pathname === '/api/url') {
      const id = u.searchParams.get('id')
      if (!id) return json(res, 400, { error: 'missing id' })
      const r = await api.song_url_v1(opts({ id, level: u.searchParams.get('level') || 'exhigh' }))
      const d = (r.body.data || [])[0] || {}
      return json(res, 200, { id, url: d.url || null, br: d.br || 0, size: d.size || 0, type: d.type || null, fee: d.fee, code: d.code })
    }

    if (u.pathname === '/stream') {
      const id = u.searchParams.get('id')
      if (!id) return json(res, 400, { error: 'missing id' })
      const r = await api.song_url_v1(opts({ id, level: 'exhigh' }))
      const d = (r.body.data || [])[0] || {}
      if (!d.url) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('no source') }
      return follow(d.url, req, res)
    }

    // ---------- 扫码登录 ----------
    if (u.pathname === '/api/qr/key') {
      const r = await api.login_qr_key({})
      const key = (r.body.data && r.body.data.unikey) || ''
      return json(res, 200, { key })
    }

    if (u.pathname === '/api/qr/create') {
      const key = u.searchParams.get('key')
      if (!key) return json(res, 400, { error: 'missing key' })
      const r = await api.login_qr_create({ key, qrimg: true })
      const d = r.body.data || {}
      return json(res, 200, { qrimg: d.qrimg || '', qrurl: d.qrurl || '' })
    }

    if (u.pathname === '/api/qr/check') {
      const key = u.searchParams.get('key')
      if (!key) return json(res, 400, { error: 'missing key' })
      const r = await api.login_qr_check({ key })
      const b = r.body || {}
      // 801/802 也带 cookie，那是匿名 cookie，只有 803 的才是账号凭证
      if (b.code === 803 && b.cookie) {
        cookie = b.cookie
        fs.writeFileSync(COOKIE_FILE, cookie, { mode: 0o600 })
        await refreshMe()
      }
      return json(res, 200, { code: b.code, message: b.message || '', loggedIn: !!cookie, nickname })
    }

    if (u.pathname === '/api/logout') {
      cookie = ''
      uid = null
      nickname = ''
      try { fs.unlinkSync(COOKIE_FILE) } catch (e) {}
      return json(res, 200, { ok: true, loggedIn: false })
    }

    if (u.pathname === '/api/lyric') {
      const id = u.searchParams.get('id')
      if (!id) return json(res, 400, { error: 'missing id' })
      const r = await api.lyric(opts({ id }))
      const b = r.body || {}
      return json(res, 200, { lrc: (b.lrc && b.lrc.lyric) || '', tlyric: (b.tlyric && b.tlyric.lyric) || '' })
    }

    if (u.pathname === '/img') {
      const target = u.searchParams.get('u')
      if (!target) return json(res, 400, { error: 'missing u' })
      const t = new URL(target)
      if (!ALLOW_HOST.test(t.hostname)) return json(res, 403, { error: 'host not allowed' })
      return follow(t.toString(), req, res)
    }

    // 静态文件
    const rel = u.pathname === '/' ? '/index.html' : u.pathname
    const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('not found') }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(buf)
    })
  } catch (e) {
    json(res, 500, { error: String((e && e.message) || e) })
  }
})

server.listen(PORT, '127.0.0.1', async () => {
  await refreshMe()
  console.log('PIXEL MUSIC on http://127.0.0.1:' + PORT + (cookie ? ' [已登录 ' + (nickname || uid) + ']' : ' [未登录]'))
})
