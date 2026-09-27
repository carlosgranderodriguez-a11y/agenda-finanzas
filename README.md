# Agenda · Finanzas

PWA personal: agenda visual sincronizada con Google Calendar + registro de ingresos por cliente (quién paga, cuánto, si ya ha pagado y si ya está facturado) y gastos. No emite facturas. Incluye widget de iPhone (Scriptable).

## Archivos
- `index.html` — la app (GitHub Pages)
- `sw.js` — service worker (sube `CACHE_VERSION` en cada cambio)
- `apps-script/Code.gs` — backend (Google Sheet + Calendar)
- `widget.js` — widget para Scriptable

## Puesta en marcha (≈15 min)
1. **Google Sheet nueva** → Extensiones → Apps Script → pega `apps-script/Code.gs` → guarda.
2. Selecciona la función `setup` → Ejecutar → acepta permisos. En el registro sale tu **CLAVE** (también queda en la hoja *Config*).
3. Implementar → Nueva implementación → tipo *Aplicación web* → Ejecutar como **Yo**, acceso **Cualquier usuario** → copia la URL `/exec`.
4. Abre la app → **Ajustes** → pega URL + clave → *Guardar y probar conexión*.
5. Da de alta tus clientes (con su importe habitual) y empieza a apuntar ingresos con el +.
6. En el iPhone: Safari → abre la app → Compartir → *Añadir a pantalla de inicio*.
7. Widget: instala Scriptable → Ajustes de la app → *Copiar código del widget con mis datos* → pégalo en un script nuevo → añade el widget (pequeño, mediano o grande). En un widget pequeño, Parameter = `finanzas` muestra la facturación del mes.

## Colores de la agenda
Hoja **Categorias**: cada evento se colorea por su calendario (columna `calendario`) o por palabras de su título (`palabras_clave`, separadas por comas). Puedes añadir categorías nuevas con su color.

## Cambios en el backend
Tras editar `Code.gs`: Implementar → Gestionar implementaciones → editar → *Nueva versión* (así la URL no cambia).
