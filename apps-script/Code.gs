/**
 * AGENDA + FINANZAS — backend (Google Apps Script)
 * Finanzas = registro de ingresos por cliente (NO emite facturas).
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
  Clientes: ['id', 'nombre', 'nif', 'email', 'tarifa', 'color', 'notas'],
  Ingresos: ['id', 'fecha', 'cliente_id', 'concepto', 'importe', 'cobrado', 'fecha_cobro', 'facturado', 'num_factura', 'notas', 'lineas'],
  Gastos: ['id', 'fecha', 'concepto', 'categoria', 'importe'],
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
  ['calendario_nuevos', '']      // calendario donde se crean eventos nuevos (vacío = principal)
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
  sh.appendRow([k, String(v)]);
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
  var ev = cal.createEvent(d.title, parseLocal_(d.start), parseLocal_(d.end), { location: d.location || '' });
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
