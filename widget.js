// Agenda · Finanzas — widget para Scriptable (iPhone)
// 1) Instala Scriptable (App Store) → + nuevo script → pega esto.
// 2) Rellena API y TOKEN (los mismos que en Ajustes de la app).
// 3) Pantalla de inicio → mantener pulsado → + → Scriptable → tamaño pequeño, mediano o grande
//    → toca el widget → Script: este. (En "Parameter" puedes poner "finanzas" en un widget pequeño.)

const API = ''
const TOKEN = ''
const APP_URL = 'https://carlosgranderodriguez-a11y.github.io/agenda-finanzas/'

const C = {
  bg: new Color('#F4F2ED'), dark: new Color('#17181C'), ink: new Color('#17181C'),
  muted: new Color('#5C5F66'), dmuted: new Color('#A9ACB4'), now: new Color('#D9412B'),
  green: new Color('#7FD1AE'), amber: new Color('#F0C866'), track: new Color('#ECE9E3')
}
// color principal del área: el fondo si lo eligió el usuario (no es un pastel muy claro); si no, el color de texto
function lum(h) { const n = parseInt(String(h || '').replace('#', ''), 16); return isNaN(n) ? 0 : (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
function mix(a, b, t) { const p = h => { const n = parseInt(String(h || '').replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255] }, x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('') }
// los pasteles de la app, un punto más marcados para que se distingan en el widget; un color elegido a mano se usa tal cual
function main(c) { try { return lum(c.bg) > 0.85 ? mix(c.bg, c.fg, 0.3) : c.bg } catch (e) { return c.fg } }
const OTRO = { id: 'otro', nombre: 'Otros', fg: '#4A4D55', bg: '#E6E3DC' }
const DL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const FM = FileManager.local()
const CACHE = FM.joinPath(FM.documentsDirectory(), 'agenda-finanzas-cache.json')
function readCache() {
  if (!FM.fileExists(CACHE)) return null
  try {
    const d = JSON.parse(FM.readString(CACHE))
    if (d._savedAt) { const t = new Date(d._savedAt); d._age = (Date.now() - t) / 60000; d._saved = (t.toDateString() === new Date().toDateString() ? '' : t.getDate() + '/' + (t.getMonth() + 1) + ' ') + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') }
    return d
  } catch (e) { return null }
}
async function fetchData(timeout) {
  const url = API + '?action=widget&token=' + encodeURIComponent(TOKEN)
  const r = new Request(url); r.timeoutInterval = timeout || 20
  const txt = await r.loadString()
  let j; try { j = JSON.parse(txt) } catch (e) { throw new Error('Google no ha devuelto datos (¿está desplegado el Apps Script como «Cualquier usuario»?)') }
  if (!j.ok) throw new Error(j.error)
  j.data._savedAt = new Date().toISOString(); FM.writeString(CACHE, JSON.stringify(j.data))
  return j.data
}
// maxAge: minutos que damos por buenos los datos guardados sin volver a pedirlos
async function getData(timeout, maxAge) {
  const c = readCache()
  if (c && maxAge && c._age < maxAge) return c
  try { return await fetchData(timeout) }
  catch (e) { if (c) { c._offline = true; c._err = e.message; return c } throw e }
}

const eurVis = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'
let HIDE = true  // importes ocultos SIEMPRE; para verlos en el widget pon «visible» en Parameter
const eur = n => HIDE ? '•••• €' : eurVis(n)
const hrs = s => { const [h, m] = s.slice(11, 16).split(':').map(Number); return h + m / 60 }
const hstr = h => (Math.round(h * 10) / 10).toString().replace('.', ',')

function cat(d, id) { return (d.categorias || []).find(c => c.id === id) || OTRO }

function txt(stack, s, size, color, weight) {
  const t = stack.addText(String(s))
  t.font = weight === 'heavy' ? Font.heavyRoundedSystemFont(size) : weight === 'bold' ? Font.boldSystemFont(size) : Font.mediumSystemFont(size)
  t.textColor = color || C.ink
  t.lineLimit = 1
  return t
}

function relTime(from, to) {
  const m = Math.round((new Date(to) - new Date(from)) / 60000)
  if (m < 60) return 'en ' + m + ' min'
  const h = Math.floor(m / 60), r = m % 60
  if (h >= 24) return ''
  return 'en ' + h + ' h' + (r ? ' ' + r : '')
}

// barra del día (07–21 h) dibujada
function dayBar(d, events, w, h) {
  const ctx = new DrawContext(); ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true
  const H0 = 7, H1 = 21, sx = x => (x - H0) / (H1 - H0) * w
  const p = new Path(); p.addRoundedRect(new Rect(0, 0, w, h), 7, 7); ctx.addPath(p); ctx.setFillColor(C.track); ctx.fillPath()
  events.forEach(e => {
    const a = Math.max(H0, hrs(e.start)), b = Math.min(H1, hrs(e.end) || 24)
    if (b <= a) return
    ctx.setFillColor(new Color(main(cat(d, e.cat)))); ctx.fillRect(new Rect(sx(a), 0, Math.max(sx(b) - sx(a), 2), h))
  })
  const now = hrs(d.now)
  if (now > H0 && now < H1) { ctx.setFillColor(C.now); ctx.fillRect(new Rect(sx(now) - 1, 0, 2.5, h)) }
  return ctx.getImage()
}

function weekBars(d, w, rowH) {
  const ctx = new DrawContext(); ctx.size = new Size(w, rowH * 7 + 6 * 6); ctx.opaque = false; ctx.respectScreenScale = true
  const H0 = 7, H1 = 22, lab = 18, sx = x => lab + (x - H0) / (H1 - H0) * (w - lab)
  const todayIdx = (new Date(d.now).getDay() + 6) % 7
  ctx.setFont(Font.boldSystemFont(11))
  d.days.forEach((evs, i) => {
    const y = i * (rowH + 6)
    ctx.setTextColor(i === todayIdx ? C.now : C.ink); ctx.drawText(DL[i], new Point(0, y + rowH / 2 - 7))
    const bg = new Path(); bg.addRoundedRect(new Rect(lab, y, w - lab, rowH), 4, 4); ctx.addPath(bg); ctx.setFillColor(C.track); ctx.fillPath()
    evs.forEach(e => {
      const [ah, am] = e.s.split(':').map(Number), [bh, bm] = e.e.split(':').map(Number)
      const a = Math.max(H0, ah + am / 60), b = Math.min(H1, (bh + bm / 60) || 24)
      if (b <= a) return
      const r = new Path(); r.addRoundedRect(new Rect(sx(a), y, Math.max(sx(b) - sx(a), 3), rowH), 4, 4); ctx.addPath(r)
      ctx.setFillColor(new Color(main(cat(d, e.cat)))); ctx.fillPath()
    })
  })
  return ctx.getImage()
}

function small(d, w) {
  w.backgroundColor = C.bg
  const top = w.addStack(); txt(top, 'SIGUIENTE', 10, C.muted, 'bold'); top.addSpacer()
  if (d.next) txt(top, relTime(d.now, d.next.start), 10, C.now, 'bold')
  w.addSpacer(6)
  if (d.next) {
    const c = cat(d, d.next.cat)
    const box = w.addStack(); box.layoutVertically(); box.backgroundColor = new Color(c.bg); box.cornerRadius = 12; box.setPadding(8, 10, 8, 10)
    txt(box, d.next.start.slice(11, 16), 22, new Color(c.fg), 'heavy')
    const t = txt(box, d.next.title, 13, C.ink, 'bold'); t.lineLimit = 2
    box.addSpacer()
  } else txt(w, 'Nada más hoy', 15, C.ink, 'bold')
  w.addSpacer()
  const after = d.today.filter(e => d.next && e.start > d.next.start)[0]
  if (after) txt(w, 'Después: ' + after.start.slice(11, 16) + ' ' + after.title, 10, C.muted)
}

function smallFin(d, w) {
  w.backgroundColor = C.dark
  const m = new Date(d.now).getMonth()
  txt(w, MES[m].toUpperCase(), 10, C.dmuted, 'bold')
  w.addSpacer()
  txt(w, eur(d.mes.ingresos), 26, Color.white(), 'heavy')
  txt(w, 'ingresos del mes', 11, C.dmuted)
  w.addSpacer()
  txt(w, 'te deben ' + eur(d.mes.pendiente), 11, C.amber, 'bold')
}

function medium(d, w) {
  w.backgroundColor = C.bg
  const now = new Date(d.now)
  const head = w.addStack(); head.centerAlignContent()
  txt(head, ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][now.getDay()] + ' ' + now.getDate(), 17, C.ink, 'heavy')
  head.addSpacer()
  const work = d.today.filter(e => e.cat !== 'per' && e.cat !== 'otro').reduce((s, e) => s + (hrs(e.end) - hrs(e.start)), 0)
  txt(head, hstr(work) + ' h · ' + d.today.length + ' bloques', 11, C.muted)
  w.addSpacer(8)
  w.addImage(dayBar(d, d.today, 300, 22)).imageSize = new Size(300, 22)
  const lab = w.addStack(); ['7h', '10h', '13h', '16h', '19h', '21h'].forEach((l, i) => { if (i) lab.addSpacer(); txt(lab, l, 9, C.muted) })
  w.addSpacer(8)
  const row = w.addStack(); row.spacing = 6
  const upcoming = d.today.filter(e => e.end > d.now).slice(0, 2)
  if (!upcoming.length) txt(row, 'Día terminado', 12, C.muted, 'bold')
  upcoming.forEach(e => {
    const c = cat(d, e.cat)
    const s = row.addStack(); s.backgroundColor = new Color(c.bg); s.cornerRadius = 10; s.setPadding(5, 8, 5, 8)
    txt(s, e.start.slice(11, 16) + ' ' + e.title, 11, new Color(c.fg), 'bold')
  })
}

function large(d, w) {
  medium(d, w)
  w.addSpacer(12)
  const head = w.addStack(); txt(head, 'Esta semana', 15, C.ink, 'heavy'); head.addSpacer()
  const tot = Object.values(d.weekHours || {}).reduce((a, b) => a + b, 0)
  txt(head, hstr(tot) + ' h', 11, C.muted)
  w.addSpacer(6)
  w.addImage(weekBars(d, 300, 14)).imageSize = new Size(300, 14 * 7 + 36)
  w.addSpacer(6)
  const leg = w.addStack(); leg.spacing = 8
  Object.keys(d.weekHours || {}).slice(0, 5).forEach(k => { const c = cat(d, k); txt(leg, '● ' + c.nombre + ' ' + hstr(d.weekHours[k]), 9, new Color(c.fg), 'bold') })
}

// ---------- vista al tocar el widget (dentro de Scriptable, funciona sin internet) ----------
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function inAppHTML(d) {
  const now = new Date(d.now)
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const nowS = d.now
  const ev = d.today.map(e => {
    const c = cat(d, e.cat), past = e.end < nowS, cur = e.start <= nowS && e.end > nowS
    return `<div class="ev" style="background:${c.bg};color:${c.fg};opacity:${past ? .55 : 1};${cur ? 'outline:2px solid ' + c.fg : ''}">
      <div class="k">${esc(e.cat === 'otro' ? 'Sin área' : c.nombre)} · ${e.start.slice(11, 16)}–${e.end.slice(11, 16)}${cur ? ' · AHORA' : ''}</div>
      <div class="t">${esc(e.title)}</div>${e.location ? `<div class="s">${esc(e.location)}</div>` : ''}</div>`
  }).join('') || '<div class="empty">Nada más en la agenda de hoy</div>'
  const H0 = 7, H1 = 22, pct = h => ((Math.max(H0, Math.min(H1, h)) - H0) / (H1 - H0) * 100).toFixed(2)
  const todayIdx = (now.getDay() + 6) % 7
  const week = d.days.map((evs, i) => `<div class="wr"><b style="color:${i === todayIdx ? '#D9412B' : '#17181C'}">${DL[i]}</b><div class="tr">${evs.map(e => {
    const [ah, am] = e.s.split(':').map(Number), [bh, bm] = e.e.split(':').map(Number)
    const a = ah + am / 60, b = (bh + bm / 60) || 24
    return `<i style="left:${pct(a)}%;width:${Math.max(pct(b) - pct(a), 1)}%;background:${main(cat(d, e.cat))}"></i>`
  }).join('')}</div></div>`).join('')
  const wh = d.weekHours || {}
  const leg = Object.keys(wh).map(k => `<span><i style="background:${main(cat(d, k))}"></i>${esc(cat(d, k).nombre)} <b>${hstr(wh[k])} h</b></span>`).join('')
  const work = d.today.filter(e => e.cat !== 'per' && e.cat !== 'otro').reduce((s, e) => s + (hrs(e.end) - hrs(e.start)), 0)
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
  body{margin:0;background:#F4F2ED;color:#17181C;font:15px -apple-system,system-ui,sans-serif;padding:max(20px,env(safe-area-inset-top)) 16px 40px}
  h1{font-size:30px;margin:0;letter-spacing:-.02em} .e{font-size:12px;font-weight:700;color:#5C5F66;text-transform:uppercase;letter-spacing:.06em}
  .row{display:flex;justify-content:space-between;align-items:flex-end} .card{background:#fff;border-radius:18px;padding:14px 16px;margin-top:14px}
  .ev{border-radius:14px;padding:10px 12px;margin-top:8px} .k{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .t{font-size:15px;font-weight:700;color:#17181C;margin-top:2px} .s{font-size:12px;margin-top:2px} .empty{color:#5C5F66;padding:16px 0;text-align:center}
  .wr{display:flex;align-items:center;gap:10px;margin-top:7px} .wr b{width:16px;font-size:12px} .tr{position:relative;flex:1;height:16px;background:#E6E2D9;border-radius:5px;overflow:hidden}
  .tr i{position:absolute;top:0;bottom:0;border-radius:4px} .leg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin-top:10px}
  .leg i{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:4px}
  .fin{background:#17181C;color:#fff} .big{font-size:34px;font-weight:800;letter-spacing:-.03em} .m{color:#A9ACB4;font-size:12px}
  .off{background:#E6E3DC;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:600;margin-bottom:12px}
  a.btn{display:block;text-align:center;background:#2F3F9E;color:#fff;text-decoration:none;font-weight:700;border-radius:16px;padding:15px;margin-top:18px}
  </style></head><body>
  ${d._loading ? `<div class="off">Actualizando… (datos de las ${d._saved || '—'})</div>` : d._offline ? `<div class="off">Sin conexión · datos guardados${d._saved ? ' de las ' + d._saved : ''}${d._err ? '<br><span style="font-weight:400">' + esc(d._err) + '</span>' : ''}</div>` : ''}
  <div class="row"><div><div class="e">${DIAS[now.getDay()]} · hoy</div><h1>${now.getDate()} ${MESL[now.getMonth()]}</h1></div><div style="text-align:right"><div style="font-size:22px;font-weight:800">${hstr(work)} h</div><div class="m" style="color:#5C5F66">${d.today.length} bloques</div></div></div>
  <div>${ev}</div>
  <div class="card"><div class="row"><b>Esta semana</b><span class="m" style="color:#5C5F66">${hstr(Object.values(wh).reduce((a, b) => a + b, 0))} h</span></div>${week}<div class="leg">${leg}</div></div>
  <div class="card fin" ${true ? 'onclick="document.querySelectorAll(\'[data-v]\').forEach(e=>{const t=e.textContent;e.textContent=e.dataset.v;e.dataset.v=t})"' : ''}><div class="m">${MESL[now.getMonth()]}${' · toca para ver'}</div><div class="big" data-v="${eurVis(d.mes.ingresos || 0)}">•••• €</div><div class="m">ingresos del mes</div>
    <div style="margin-top:10px;color:#F0C866;font-weight:700;font-size:13px">Te deben <span data-v="${eurVis(d.mes.pendiente || 0)}">•••• €</span></div></div>
  <a class="btn" href="${APP_URL}">Abrir la app completa</a>
  </body></html>`
}

function loadingHTML() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#F4F2ED;color:#17181C;font:15px -apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:14px}.s{width:28px;height:28px;border:3px solid #E2DED5;border-top-color:#17181C;border-radius:50%;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div class="s"></div><div>Cargando tu agenda… <span id="t">0</span> s</div><script>let n=0;setInterval(()=>document.getElementById('t').textContent=++n,1000)</script></body></html>`
}
function errorHTML(msg) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#F4F2ED;color:#17181C;font:15px -apple-system,system-ui,sans-serif;padding:60px 20px}h1{font-size:24px}p{color:#5C5F66;line-height:1.45}code{background:#fff;padding:2px 6px;border-radius:6px}</style></head><body>
  <h1>No he podido cargar tus datos</h1><p><b>${esc(msg)}</b></p>
  <p>Comprueba que tienes internet y que en la línea <code>const TOKEN</code> de arriba del script está tu clave (la de la hoja Config de tu Google Sheet).</p>
  <p>Si el error dice «Clave incorrecta», vuelve a copiar el código desde la app → Ajustes.</p></body></html>`
}

// Se actualiza solo: al abrirlo desde Scriptable descarga la última versión de la app
async function autoUpdate() {
  try {
    const r = new Request(APP_URL + 'widget.js?t=' + Date.now()); r.timeoutInterval = 8
    let code = await r.loadString()
    if (!code.includes('const API = ') || !code.includes('async function run()')) return false
    code = code.replace("const API = ''", "const API = '" + API + "'").replace("const TOKEN = ''", "const TOKEN = '" + TOKEN + "'")
    const fm = FileManager.iCloud().isFileStoredIniCloud(module.filename) ? FileManager.iCloud() : FileManager.local()
    const cur = fm.readString(module.filename)
    if (cur && cur.trim() !== code.trim()) { fm.writeString(module.filename, code); return true }
  } catch (e) {}
  return false
}

async function run() {
  const inApp = !config.runsInWidget
  let d = null, err = null
  if (!inApp) {
    try {
      if (!API || !TOKEN) throw new Error('Falta tu clave. Abre la app → Ajustes → Copiar código del widget (con la app ya conectada) y pégalo aquí de nuevo.')
      d = await getData(12, 10)
      HIDE = !(args.widgetParameter || '').toLowerCase().includes('visible')
    } catch (e) { err = e }
  }

  if (inApp) {
    autoUpdate()
    // abierto tocando el widget o desde Scriptable: se muestra al momento lo guardado y luego se actualiza
    const wv = new WebView()
    const c = readCache()
    await wv.loadHTML(c ? inAppHTML(Object.assign(c, { _offline: false, _loading: true })) : loadingHTML())
    const shown = wv.present(true)
    try {
      if (!API || !TOKEN) throw new Error('Falta tu clave. Abre la app → Ajustes → Copiar código del widget (con la app ya conectada) y pégalo aquí de nuevo.')
      const t0 = Date.now()
      const d = await fetchData(25)
      d._secs = Math.round((Date.now() - t0) / 1000)
      await wv.loadHTML(inAppHTML(d))
    } catch (e) {
      if (c) { c._offline = true; c._err = e.message; await wv.loadHTML(inAppHTML(c)) }
      else await wv.loadHTML(errorHTML(e.message))
    }
    await shown
    Script.complete()
    return
  }

  const w = new ListWidget()
  w.setPadding(14, 14, 14, 14)
  w.url = 'scriptable:///run/' + encodeURIComponent(Script.name())
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  try {
    if (err) throw err
    const fam = config.widgetFamily || 'large'
    const param = (args.widgetParameter || '').toLowerCase()
    if (fam === 'small') param.includes('finanzas') ? smallFin(d, w) : small(d, w)
    else if (fam === 'medium') medium(d, w)
    else large(d, w)
    if (d._offline) { w.addSpacer(2); txt(w, 'sin conexión', 8, C.muted) }
  } catch (e) {
    w.backgroundColor = C.bg
    txt(w, 'Agenda', 14, C.ink, 'heavy'); w.addSpacer(4)
    const t = txt(w, e.message, 11, C.muted); t.lineLimit = 4
  }
  Script.setWidget(w)
  await autoUpdate()   // también se pone al día sola desde la pantalla de inicio
  Script.complete()
}
await run()
