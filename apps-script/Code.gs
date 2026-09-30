/**
 * AGENDA + FINANZAS — backend (Google Apps Script)
 * Finanzas = registro de ingresos por cliente, facturas en PDF (Drive) y gastos con foto.
 * Permisos: Calendar, Sheets, Drive (facturas y tickets) y Gmail (envío al gestor).
 * ------------------------------------------------
 * 1. Crea una Google Sheet nueva → Extensiones → Apps Script → pega este archivo.
 * 2. Ejecuta la función `setup` una vez (acepta permisos: Calendar + Sheets).
 *    Te crea las hojas y te muestra tu CLAVE (TOKEN) en el registro y en la hoja Config.
 * 3. Implementar → Nueva implementación → Aplicación web
 *      Ejecutar como: Yo      ·   Quién tiene acceso: Cualquier usuario
 *    Copia la URL que acaba en /exec.
 * 4. En la app: Ajustes → pega URL + CLAVE.
 */

var SHEETS = {
  Clientes: ['id', 'nombre', 'nif', 'email', 'tarifa', 'color', 'notas', 'direccion', 'tipo_fiscal', 'iva', 'irpf', 'factura'],
  Ingresos: ['id', 'fecha', 'cliente_id', 'concepto', 'importe', 'cobrado', 'fecha_cobro', 'facturado', 'num_factura', 'notas', 'lineas', 'factura_url', 'factura_datos', 'metodo'],
  Gastos: ['id', 'fecha', 'concepto', 'categoria', 'importe', 'proveedor', 'iva_pct', 'adjunto_url', 'adjunto_nombre', 'metodo'],
  Categorias: ['id', 'nombre', 'fg', 'bg', 'palabras_clave', 'calendario'],
  Config: ['clave', 'valor']
};

var DEFAULT_CATS = [
  ['fut', 'Fútbol', '#1B5E48', '#D6EDE2', 'guadalajara,fútbol,futbol,juvenil,partido,uefa', ''],
  ['esg', 'Esgrima', '#2F3F9E', '#DCE1F6', 'esgrima,federación,federacion,sama,car ', ''],
  ['cli', 'Clientes', '#7A4E00', '#F3E4BF', 'tsg,readaptación,readaptacion,cliente,sesión,sesion,fuerza', ''],
  ['tri', 'Triatlón', '#A8471A', '#F7DDCC', 'triatlón,triatlon,nacho,bici,natación,natacion', ''],
  ['per', 'Personal', '#5E3F82', '#E6DCF1', 'entreno propio,rodaje,tirada,personal,médico,medico,sara', '']
];

var DEFAULT_CONFIG = [
  ['calendarios', ''],           // vacío = todos tus calendarios; o nombres separados por comas
  ['calendario_nuevos', ''],     // calendario donde se crean eventos nuevos (vacío = principal)
  ['emisor_nombre', 'Carlos Grande Rodríguez'], ['emisor_nif', ''], ['emisor_direccion', ''], ['emisor_email', ''], ['emisor_iban', ''],
  ['serie_factura', ''], ['siguiente_numero', '1'], ['iva_defecto', '21'], ['irpf_empresas', '15'], ['nota_factura', ''],
  ['gestor_nombre', ''], ['gestor_email', '']
];

/* ============ SETUP ============ */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = SHEETS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), head.length).setNumberFormat('@');
  });
  var cats = ss.getSheetByName('Categorias');
  if (cats.getLastRow() < 2) cats.getRange(2, 1, DEFAULT_CATS.length, 6).setValues(DEFAULT_CATS);
  var cfg = ss.getSheetByName('Config');
  var existing = readRows_('Config').map(function (r) { return r.clave; });
  DEFAULT_CONFIG.forEach(function (kv) { if (existing.indexOf(kv[0]) < 0) cfg.appendRow(kv); });

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('TOKEN', token);
  }
  setConfig_('TOKEN (no compartir)', token);
  var def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  Logger.log('TU CLAVE (TOKEN): ' + token);
  return token;
}

/* ============ ROUTER ============ */
function doGet(e) { return handle_(e.parameter || {}); }

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents || '{}'); } catch (err) { p = {}; }
  return handle_(p);
}

function handle_(p) {
  var out;
  try {
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || String(p.token) !== token) throw new Error('Clave incorrecta');
    var data = p.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) {} }
    var A = {
      ping: function () { return { ok: true }; },
      agenda: function () {
        // guardado 2 min (Google Calendar es lento); se invalida al crear/editar/borrar desde la app
        var c = CacheService.getScriptCache(), v = c.get('agv') || '0', k = 'ag_' + v + '_' + p.from + '_' + p.to;
        if (!p.fresh) { var hit = c.get(k); if (hit) return JSON.parse(hit); }
        var r = getAgenda_(p.from, p.to);
        try { c.put(k, JSON.stringify(r), 120); } catch (e) {}
        return r;
      },
      createEvent: function () { return createEvent_(data); },
      deleteEvent: function () { return deleteEvent_(data); },
      finanzas: function () { return getFinanzas_(); },
      saveCliente: function () { return upsert_('Clientes', data); },
      deleteCliente: function () { return remove_('Clientes', data.id); },
      saveIngreso: function () { return upsert_('Ingresos', data); },
      deleteIngreso: function () { return remove_('Ingresos', data.id); },
      saveGasto: function () { return upsert_('Gastos', data); },
      crearFactura: function () { return crearFactura_(data); },
      subirAdjunto: function () { return subirAdjunto_(data); },
      enviarGestor: function () { return enviarGestor_(data); },
      previewFactura: function () { return { html: facturaHTML_(data) }; },
      deleteGasto: function () { return remove_('Gastos', data.id); },
      saveConfig: function () { Object.keys(data).forEach(function (k) { setConfig_(k, data[k]); }); return getConfig_(); },
      saveCategoria: function () { return upsert_('Categorias', data); },
      deleteCategoria: function () { return remove_('Categorias', data.id); },
      updateEvent: function () { return updateEvent_(data); },
      widget: function () {
        // guardado 5 min para que el widget del iPhone cargue al instante
        var cache = CacheService.getScriptCache(), hit = cache.get('widget');
        if (hit) return JSON.parse(hit);
        var w = widget_();
        try { cache.put('widget', JSON.stringify(w), 300); } catch (e) {}
        return w;
      }
    };
    if (!A[p.action]) throw new Error('Acción desconocida: ' + p.action);
    if (/^(save|delete|create|update)/.test(p.action)) { try { var cc = CacheService.getScriptCache(); cc.remove('widget'); cc.put('agv', String(Date.now()), 21600); } catch (e) {} }
    out = { ok: true, data: A[p.action]() };
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  var json = JSON.stringify(out);
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ============ SHEET HELPERS ============ */
function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) { setup(); sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
  var head = SHEETS[name];
  if (head) {
    // añade columnas nuevas al final si la hoja es de una versión anterior
    var cur = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0];
    if (cur.join('|') !== head.join('|')) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), head.length).setNumberFormat('@');
    }
  }
  return sh;
}

function readRows_(name) {
  var sh = sheet_(name);
  var vals = sh.getDataRange().getDisplayValues();
  if (vals.length < 2) return [];
  var head = vals[0];
  return vals.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function upsert_(name, obj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_(name);
    var head = SHEETS[name];
    if (!obj.id) obj.id = Utilities.getUuid().slice(0, 8);
    var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
    var row = head.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
    var idx = ids.indexOf(String(obj.id));
    var rng;
    if (idx >= 0) rng = sh.getRange(idx + 2, 1, 1, head.length);
    else rng = sh.getRange(sh.getLastRow() + 1, 1, 1, head.length);
    rng.setNumberFormat('@').setValues([row]);
    return obj;
  } finally { lock.releaseLock(); }
}

function remove_(name, id) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return { removed: 0 };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return { removed: 1 }; }
  }
  return { removed: 0 };
}

function getConfig_() {
  var o = {};
  readRows_('Config').forEach(function (r) { if (r.clave.indexOf('TOKEN') !== 0) o[r.clave] = r.valor; });
  return o;
}

function setConfig_(k, v) {
  var sh = sheet_('Config');
  var vals = sh.getDataRange().getDisplayValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === k) { sh.getRange(i + 1, 2).setNumberFormat('@').setValue(String(v)); return; }
  }
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, 2).setNumberFormat('@').setValues([[k, String(v)]]);
}

/* ============ FINANZAS ============ */
function getFinanzas_() {
  return {
    clientes: readRows_('Clientes'),
    ingresos: readRows_('Ingresos'),
    gastos: readRows_('Gastos'),
    config: getConfig_()
  };
}

/* ============ AGENDA ============ */
function categorias_() { return readRows_('Categorias'); }

function calendars_() {
  var cfg = getConfig_();
  var names = (cfg.calendarios || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  var all = CalendarApp.getAllCalendars();
  if (!names.length) return all.filter(function (c) { return !c.isHidden(); });
  return all.filter(function (c) { return names.indexOf(c.getName().toLowerCase()) >= 0; });
}

function classify_(title, calName, cats) {
  var t = (title || '').toLowerCase();
  var cn = (calName || '').toLowerCase();
  for (var i = 0; i < cats.length; i++) {
    if (cats[i].calendario && cats[i].calendario.toLowerCase() === cn) return cats[i].id;
  }
  for (var j = 0; j < cats.length; j++) {
    var kws = (cats[j].palabras_clave || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
    for (var k = 0; k < kws.length; k++) if (t.indexOf(kws[k]) >= 0) return cats[j].id;
  }
  return 'otro';
}

function iso_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"); }

function parseLocal_(s) {
  // "2026-09-28" o "2026-09-28T10:30"
  var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) throw new Error('Fecha inválida: ' + s);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0);
}

function getAgenda_(from, to) {
  var start = from ? parseLocal_(from) : new Date(new Date().setHours(0, 0, 0, 0));
  var end = to ? parseLocal_(to) : new Date(start.getTime() + 7 * 86400000);
  var cats = categorias_();
  var events = [];
  calendars_().forEach(function (cal) {
    var calName = cal.getName();
    cal.getEvents(start, end).forEach(function (ev) {
      events.push({
        id: ev.getId(),
        cal: calName,
        calId: cal.getId(),
        title: ev.getTitle(),
        start: iso_(ev.getStartTime()),
        end: iso_(ev.getEndTime()),
        allDay: ev.isAllDayEvent(),
        location: ev.getLocation(),
        cat: classify_(ev.getTitle(), calName, cats)
      });
    });
  });
  events.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return { events: events, categorias: cats };
}

function targetCalendar_(catId) {
  var cats = categorias_();
  for (var i = 0; i < cats.length; i++) {
    if (cats[i].id === catId && cats[i].calendario) {
      var c = CalendarApp.getCalendarsByName(cats[i].calendario);
      if (c.length) return c[0];
    }
  }
  var name = getConfig_().calendario_nuevos;
  if (name) { var cs = CalendarApp.getCalendarsByName(name); if (cs.length) return cs[0]; }
  return CalendarApp.getDefaultCalendar();
}

function createEvent_(d) {
  var cal = targetCalendar_(d.cat);
  var opts = { location: d.location || '' };
  if (d.repetir && num_(d.repetir.cada) > 0) {
    // evento semanal (cada 1 o 2 semanas), hasta una fecha o sin fin
    var rule = CalendarApp.newRecurrence().addWeeklyRule().interval(num_(d.repetir.cada));
    if (d.repetir.hasta) { var h = parseLocal_(d.repetir.hasta); h.setHours(23, 59, 0, 0); rule = rule.until(h); }
    var serie = cal.createEventSeries(d.title, parseLocal_(d.start), parseLocal_(d.end), rule, opts);
    return { id: serie.getId(), cal: cal.getName(), serie: true };
  }
  var ev = cal.createEvent(d.title, parseLocal_(d.start), parseLocal_(d.end), opts);
  return { id: ev.getId(), cal: cal.getName() };
}

function updateEvent_(d) {
  var cal = d.calId ? CalendarApp.getCalendarById(d.calId) : CalendarApp.getDefaultCalendar();
  var ev = cal.getEventById(d.id);
  if (!ev) throw new Error('No encuentro el evento');
  if (ev.isRecurringEvent()) throw new Error('Es un evento recurrente: edítalo desde Google Calendar');
  if (d.title) ev.setTitle(d.title);
  if (d.start && d.end) ev.setTime(parseLocal_(d.start), parseLocal_(d.end));
  if (d.location !== undefined) ev.setLocation(d.location || '');
  return { id: ev.getId() };
}

function deleteEvent_(d) {
  var cal = d.calId ? CalendarApp.getCalendarById(d.calId) : CalendarApp.getDefaultCalendar();
  var ev = cal.getEventById(d.id);
  if (ev && ev.isRecurringEvent()) throw new Error('Es un evento recurrente: bórralo desde Google Calendar');
  if (ev) ev.deleteEvent();
  return { deleted: !!ev };
}

/* ============ WIDGET (Scriptable) ============ */
function widget_() {
  var now = new Date();
  var today0 = new Date(now); today0.setHours(0, 0, 0, 0);
  var dow = (today0.getDay() + 6) % 7; // 0 = lunes
  var monday = new Date(today0.getTime() - dow * 86400000);
  var sunday = new Date(monday.getTime() + 7 * 86400000);
  var ag = getAgenda_(Utilities.formatDate(monday, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
                      Utilities.formatDate(sunday, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  var todayStr = Utilities.formatDate(today0, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var nowStr = iso_(now);
  var today = ag.events.filter(function (e) { return e.start.slice(0, 10) === todayStr && !e.allDay; });
  var next = ag.events.filter(function (e) { return !e.allDay && e.start > nowStr; })[0] || null;
  var hours = {};
  var days = [[], [], [], [], [], [], []];
  ag.events.forEach(function (e) {
    if (e.allDay) return;
    var h = (parseLocal_(e.end) - parseLocal_(e.start)) / 3600000;
    hours[e.cat] = (hours[e.cat] || 0) + h;
    var di = Math.round((parseLocal_(e.start.slice(0, 10)) - monday) / 86400000);
    if (di >= 0 && di < 7) days[di].push({ cat: e.cat, s: e.start.slice(11, 16), e: e.end.slice(11, 16) });
  });
  var f = getFinanzas_();
  var ym = todayStr.slice(0, 7);
  var ingresos = 0, pendiente = 0;
  f.ingresos.forEach(function (x) {
    var b = num_(x.importe);
    if ((x.fecha || '').slice(0, 7) === ym) ingresos += b;
    if (x.cobrado !== 'si') pendiente += b;
  });
  return {
    now: nowStr, today: today, next: next, weekHours: hours, days: days,
    categorias: ag.categorias, mes: { ingresos: ingresos, pendiente: pendiente },
    ocultar: (f.config.ocultar_importes || '') === 'si'
  };
}

function num_(v) { var n = parseFloat(String(v || '0').replace(',', '.')); return isNaN(n) ? 0 : n; }


/* ============ DRIVE: carpetas ============ */
function folder_(parts) {
  var f = null, it = DriveApp.getFoldersByName('Agenda Finanzas');
  f = it.hasNext() ? it.next() : DriveApp.createFolder('Agenda Finanzas');
  parts.forEach(function (name) { var i = f.getFoldersByName(name); f = i.hasNext() ? i.next() : f.createFolder(name); });
  return f;
}
function trim_(fecha) { var y = String(fecha).slice(0, 4), m = +String(fecha).slice(5, 7) || 1; return { anio: y, t: 'T' + Math.ceil(m / 3) }; }
function eur_(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
function esc_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ============ FACTURAS ============ */
// d: { ingId, fecha, cliente:{nombre,nif,direccion,email}, lineas:[{concepto, base}], iva, irpf, numero? }
function calcFactura_(d) {
  if (d.totales && d.totales.total !== undefined) return { base: num_(d.totales.base), iva: num_(d.totales.iva), irpf: num_(d.totales.irpf), total: num_(d.totales.total) };
  var base = 0; (d.lineas || []).forEach(function (l) { base += num_(l.base); });
  base = Math.round(base * 100) / 100;
  var iva = Math.round(base * num_(d.iva)) / 100, irpf = Math.round(base * num_(d.irpf)) / 100;
  return { base: base, iva: iva, irpf: irpf, total: Math.round((base + iva - irpf) * 100) / 100 };
}
function facturaHTML_(d) {
  var c = getConfig_(), t = calcFactura_(d), cl = d.cliente || {};
  var f = String(d.fecha || '').split('-'); var fecha = f.length === 3 ? f[2] + '/' + f[1] + '/' + f[0] : d.fecha;
  var rows = (d.lineas || []).map(function (l) { return '<tr><td>' + esc_(l.concepto) + '</td><td class="n">' + eur_(num_(l.base)) + '</td></tr>'; }).join('');
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Helvetica,Arial,sans-serif;color:#17181C;font-size:11pt;margin:36px}' +
    'h1{font-size:26pt;margin:0 0 4px;letter-spacing:-.5px}.m{color:#5C5F66}.row{width:100%}' +
    '.box{background:#F4F2ED;border-radius:8px;padding:12px 14px;margin-top:18px}' +
    'table.l{width:100%;border-collapse:collapse;margin-top:26px}table.l th{text-align:left;font-size:8.5pt;text-transform:uppercase;color:#5C5F66;border-bottom:1.5px solid #17181C;padding:6px 0}' +
    'table.l td{padding:10px 0;border-bottom:1px solid #E2DED5}.n{text-align:right}' +
    'table.t{width:46%;margin-left:54%;border-collapse:collapse;margin-top:14px}table.t td{padding:4px 0}table.t .g td{font-size:14pt;font-weight:bold;border-top:1.5px solid #17181C;padding-top:8px}' +
    '</style></head><body>' +
    '<table class="row"><tr><td style="vertical-align:top"><h1>Factura</h1><div><b>Nº ' + esc_(d.numero || '') + '</b></div><div class="m">Fecha: ' + esc_(fecha) + '</div></td>' +
    '<td style="text-align:right;vertical-align:top;line-height:1.5"><b>' + esc_(c.emisor_nombre) + '</b><br>' + (c.emisor_nif ? 'NIF ' + esc_(c.emisor_nif) + '<br>' : '') + esc_(c.emisor_direccion).replace(/\n/g, '<br>') + (c.emisor_email ? '<br>' + esc_(c.emisor_email) : '') + '</td></tr></table>' +
    '<div class="box"><span class="m" style="font-size:8.5pt;text-transform:uppercase">Cliente</span><br><b>' + esc_(cl.nombre) + '</b>' + (cl.nif ? '<br>NIF/CIF ' + esc_(cl.nif) : '') + (cl.direccion ? '<br>' + esc_(cl.direccion).replace(/\n/g, '<br>') : '') + '</div>' +
    '<table class="l"><tr><th>Concepto</th><th class="n">Importe</th></tr>' + rows + '</table>' +
    '<table class="t"><tr><td>Base imponible</td><td class="n">' + eur_(t.base) + '</td></tr>' +
    '<tr><td>IVA ' + num_(d.iva) + '%</td><td class="n">' + eur_(t.iva) + '</td></tr>' +
    (num_(d.irpf) ? '<tr><td>Retención IRPF ' + num_(d.irpf) + '%</td><td class="n">− ' + eur_(t.irpf) + '</td></tr>' : '') +
    '<tr class="g"><td>Total</td><td class="n">' + eur_(t.total) + '</td></tr></table>' +
    (!num_(d.iva) ? '<p class="m" style="margin-top:22px;font-size:9pt">Operación exenta de IVA.</p>' : '') +
    (c.emisor_iban ? '<p style="margin-top:26px">Forma de pago: transferencia a <b>' + esc_(c.emisor_iban) + '</b></p>' : '') +
    (c.nota_factura ? '<p class="m" style="font-size:9pt;margin-top:14px">' + esc_(c.nota_factura) + '</p>' : '') +
    '</body></html>';
}
function crearFactura_(d) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var c = getConfig_();
    if (!d.numero) {
      var n = parseInt(c.siguiente_numero || '1', 10) || 1;
      var serie = c.serie_factura || (String(d.fecha || '').slice(0, 4) + '-');
      d.numero = serie + ('000' + n).slice(-3);
      setConfig_('siguiente_numero', n + 1);
    }
    var html = facturaHTML_(d);
    var nombre = 'Factura ' + d.numero + ' - ' + ((d.cliente || {}).nombre || '') + '.pdf';
    var blob = Utilities.newBlob(html, 'text/html', 'f.html').getAs('application/pdf').setName(nombre);
    var q = trim_(d.fecha);
    var file = folder_([q.anio, q.t, 'Facturas emitidas']).createFile(blob);
    var t = calcFactura_(d);
    var datos = JSON.stringify({ numero: d.numero, fecha: d.fecha, base: t.base, iva_pct: num_(d.iva), iva: t.iva, irpf_pct: num_(d.irpf), irpf: t.irpf, total: t.total, cliente: d.cliente, lineas: d.lineas, fileId: file.getId() });
    if (d.ingId) {
      var rows = readRows_('Ingresos');
      for (var i = 0; i < rows.length; i++) if (rows[i].id === d.ingId) {
        var o = rows[i]; o.facturado = 'si'; o.num_factura = d.numero; o.factura_url = file.getUrl(); o.factura_datos = datos;
        upsert_('Ingresos', o); break;
      }
    }
    return { numero: d.numero, url: file.getUrl(), datos: datos };
  } finally { lock.releaseLock(); }
}

/* ============ GASTOS: foto / PDF del ticket ============ */
// d: { nombre, mime, base64, fecha }
function subirAdjunto_(d) {
  var bytes = Utilities.base64Decode(String(d.base64).replace(/^data:[^,]+,/, ''));
  var q = trim_(d.fecha || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  var file = folder_([q.anio, q.t, 'Gastos']).createFile(Utilities.newBlob(bytes, d.mime || 'image/jpeg', d.nombre || ('gasto-' + Date.now() + '.jpg')));
  return { url: file.getUrl(), id: file.getId(), nombre: file.getName() };
}

/* ============ ENVIAR TRIMESTRE AL GESTOR ============ */
// d: { anio:'2026', t:'T3', mensaje }
function enviarGestor_(d) {
  var c = getConfig_();
  if (!c.gestor_email) throw new Error('Falta el email del gestor (Ajustes → Datos de facturación)');
  var anio = String(d.anio), t = String(d.t), mq = +t.slice(1), m0 = (mq - 1) * 3 + 1;
  var enQ = function (f) { f = String(f || ''); return f.slice(0, 4) === anio && Math.ceil((+f.slice(5, 7)) / 3) === mq; };
  var clientes = {}; readRows_('Clientes').forEach(function (x) { clientes[x.id] = x; });
  var ing = readRows_('Ingresos').filter(function (x) { return x.facturado === 'si' && x.factura_datos && enQ(JSON.parse(x.factura_datos).fecha); });
  var gas = readRows_('Gastos').filter(function (x) { return enQ(x.fecha); });
  var csv = [['FACTURAS EMITIDAS'], ['numero', 'fecha', 'cliente', 'nif', 'base', 'iva_%', 'iva', 'irpf_%', 'irpf', 'total', 'cobrada', 'pdf']];
  var tb = 0, ti = 0, tr = 0;
  ing.forEach(function (x) { var f = JSON.parse(x.factura_datos), cl = f.cliente || clientes[x.cliente_id] || {}; tb += f.base; ti += f.iva; tr += f.irpf;
    csv.push([f.numero, f.fecha, cl.nombre, cl.nif || '', f.base, f.iva_pct, f.iva, f.irpf_pct, f.irpf, f.total, x.cobrado === 'si' ? 'si' : 'no', x.factura_url]); });
  csv.push([]); csv.push(['GASTOS']); csv.push(['fecha', 'proveedor', 'concepto', 'categoria', 'total', 'iva_%', 'base', 'iva', 'justificante']);
  var tg = 0, tgi = 0;
  gas.forEach(function (x) { var tot = num_(x.importe), p = num_(x.iva_pct), b = p ? tot / (1 + p / 100) : tot; tg += tot; tgi += tot - b;
    csv.push([x.fecha, x.proveedor || '', x.concepto, x.categoria, tot, p, Math.round(b * 100) / 100, Math.round((tot - b) * 100) / 100, x.adjunto_url || 'SIN JUSTIFICANTE']); });
  var txt = csv.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); if (/^-?\d+(\.\d+)?$/.test(v)) v = v.replace('.', ','); return '"' + v.replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
  var qf = folder_([anio, t]);
  var nombreCsv = 'Resumen ' + anio + ' ' + t + '.csv';
  var old = qf.getFilesByName(nombreCsv); while (old.hasNext()) old.next().setTrashed(true);
  var csvFile = qf.createFile(Utilities.newBlob('﻿' + txt, 'text/csv', nombreCsv));
  // compartir carpeta del trimestre con el gestor
  var link = qf.getUrl();
  try { qf.addViewer(c.gestor_email); } catch (e) { qf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  // adjuntos si caben (< 18 MB)
  var att = [csvFile.getBlob()], size = csvFile.getSize(), sinJ = 0;
  var add = function (url) { var m = String(url || '').match(/[-\w]{25,}/); if (!m) return; try { var f = DriveApp.getFileById(m[0]); if (size + f.getSize() < 18 * 1024 * 1024) { att.push(f.getBlob()); size += f.getSize(); } } catch (e) {} };
  ing.forEach(function (x) { add(x.factura_url); });
  gas.forEach(function (x) { if (x.adjunto_url) add(x.adjunto_url); else sinJ++; });
  var body = 'Hola' + (c.gestor_nombre ? ' ' + c.gestor_nombre : '') + ',\n\n' +
    'Te envío la documentación del ' + t + ' de ' + anio + ' de ' + (c.emisor_nombre || '') + (c.emisor_nif ? ' (NIF ' + c.emisor_nif + ')' : '') + ':\n\n' +
    '• Facturas emitidas: ' + ing.length + ' · base ' + eur_(tb) + ' · IVA ' + eur_(ti) + ' · IRPF retenido ' + eur_(tr) + '\n' +
    '• Gastos: ' + gas.length + ' · total ' + eur_(tg) + ' · IVA soportado ' + eur_(tgi) + (sinJ ? ' (' + sinJ + ' sin justificante)' : '') + '\n\n' +
    'Todo está en esta carpeta de Google Drive (facturas en PDF, fotos de tickets y el resumen en CSV):\n' + link + '\n\n' +
    (d.mensaje ? d.mensaje + '\n\n' : '') + 'Un saludo,\n' + (c.emisor_nombre || '');
  MailApp.sendEmail({ to: c.gestor_email, subject: 'Documentación ' + t + ' ' + anio + ' · ' + (c.emisor_nombre || ''), body: body, attachments: att, replyTo: c.emisor_email || undefined });
  setConfig_('enviado_' + anio + t, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
  return { facturas: ing.length, gastos: gas.length, adjuntos: att.length, carpeta: link };
}

// Ejecútalo una vez desde el editor para dar permiso a Drive y Gmail
function autorizar() {
  folder_([]); MailApp.getRemainingDailyQuota(); Logger.log('Permisos OK');
}
