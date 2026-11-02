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

## Resumen del mes
Finanzas → **Sesiones del mes**: calendario del mes con las sesiones de cada día (verde = pagada, rojo = hecha y sin pagar, ámbar = pendiente), lista por cliente y ficha de cada día/cliente. Las sesiones salen de los eventos de la agenda con el nombre del cliente y se cruzan con bonos y cobros apuntados.

## Datos de facturación de los clientes
En la ficha de cada cliente: nombre fiscal, NIF/CIF, dirección y email. Al generar una factura, lo que cambies en esos campos se guarda en la ficha y se rellena solo en las siguientes.

## Forma de pago en las facturas
Al generar una factura eliges Transferencia, Bizum o Efectivo. Con transferencia sale tu IBAN (el de Ajustes → Datos de facturación, editable en esa factura). Para que el PDF y el email lo reflejen hay que actualizar el backend (ver «Cambios en el backend»).

## Editar facturas hechas
Facturas → botón **Editar** en cada factura (también desde «Factura creada» y «Enviar»). Puedes **cambiar el cliente**: al elegirlo se rellenan nombre fiscal, NIF, dirección, email e IVA/IRPF de su ficha, y opcionalmente se pasa el cobro a ese cliente. Además puedes cambiar: cambia conceptos, importes, fecha, datos del cliente, IVA/IRPF o forma de pago. Conserva el número y genera un PDF nuevo; el anterior pasa a la papelera de Drive (requiere el backend actualizado; si no, se crea el PDF nuevo y el viejo se queda en Drive).

## Unir clientes duplicados
Ajustes → Clientes → abre el cliente que quieres conservar → **Unir con un cliente duplicado…** → elige el duplicado. Sus cobros (con sus facturas) pasan al cliente que te quedas, se rellenan sus datos vacíos (CIF, dirección, email) con los del duplicado y el duplicado se borra.

## Precio por sesión y sesiones al mes
En la ficha del cliente: **precio por sesión** y **sesiones al mes** (para clubes y grupos, donde el precio cambia con el nº de deportistas). El importe del mes se calcula solo (precio × sesiones), se propone al «Apuntar el mes» y sale en la factura como «12 sesiones × 25 €». En «Sesiones del mes» se ve cuántas sesiones llevas frente a las del contrato.

## Sesiones y precio por sesión en el PDF
Al generar o editar una factura hay una casilla **«Mostrar en el PDF el nº de sesiones y el precio por sesión»** (desactivada por defecto). Si la marcas, el PDF añade las columnas *Sesiones* y *Precio/sesión*; el nº de sesiones se propone solo (contrato, bono o concepto) y puedes cambiarlo por línea. El precio por sesión se calcula sobre la base sin IVA. La opción se recuerda para ese cliente. Requiere actualizar `Code.gs` en Apps Script.

## Tipos de cliente y facturación por cobro
Cada cliente es de una clase (Ajustes → Clientes, agrupados por clase): **Empresa / club** (+ IVA − IRPF), **Particular facturado** (IVA incluido) o **Efectivo** (sin factura). Además, cada cobro tiene su interruptor **«¿Va a facturación?»** (en el cobro, en «Editar cobro» y en «Entrenamiento puntual»): los de efectivo van por defecto fuera y los mandas a facturación uno a uno; los demás van dentro salvo que digas que no. Todo cuenta en tus totales; solo lo que se factura aparece en «Hacer facturas» y llega al gestor. «Mes» muestra el dinero por tipo de cliente. Los cobros de clientes **Efectivo** se apuntan ya **cobrados en mano**, y van a la **lista de efectivo** (Mes → «Ver lista de efectivo» o Ingresos → «Efectivo»): por mes, con lo que va a facturación y lo que queda sin factura. No requiere cambios en Apps Script.

Un cliente de efectivo puede pagar **en mano o por Bizum** («¿Cómo te paga?» en su ficha): sus cobros nacen pagados con ese método. Al guardar el cliente, si tiene cobros sin cobrar, la app pregunta si los marca como pagados.

La lista **Efectivo y Bizum** también muestra las **sesiones de la agenda** de esos clientes (los de tipo Efectivo y los que han pagado en mano o por Bizum en los últimos meses), con «cobrada» o «sin cobrar», y un botón **Cobrar sesiones** para apuntar lo que te han pagado hasta un día concreto.

### Efectivo «a final de mes»
En la ficha de un cliente de efectivo, **¿Cuándo te paga? → A final de mes**: sus cobros no nacen pagados y sus sesiones de la agenda cuentan como «por cobrar». En la ficha del mes del cliente, **Cobrar sesiones** paga las hechas hasta la fecha que elijas (propone nº de sesiones × precio); las siguientes siguen contando como por cobrar hasta el próximo pago. Cada pago guarda «hasta el día X».

## Factura a un cliente con varios conceptos
«Factura a un cliente» ahora tiene un selector de cliente (agrupado por tipo) y una lista de **conceptos**, cada uno con su cantidad y su precio por unidad (valoración, entrenamientos, planificación…), con «+ Añadir concepto» y × para quitar. Se apunta como cobro pendiente y pasa a la factura, donde se puede seguir editando. La cantidad sirve para las columnas «Sesiones» y «Precio/sesión» del PDF.

## Quitar cobros de «Hacer facturas» sin borrarlos
En «Hacer facturas», cada cliente tiene **No facturar…**: los cobros marcados salen de la lista, siguen contando como ingreso y, si estaban sin cobrar, se apuntan como cobrados en mano, Bizum, transferencia o tarjeta. No llegan al gestor. Se puede deshacer desde el cobro («¿Va a facturación?»).

## Cobro ya incluido en una factura hecha
En un cobro sin facturar, **«Ya va incluido en una factura hecha…»** deja elegir la factura (p. ej. la mensual de una empresa) y lo enlaza a ella: queda facturado con ese número, sin crear otra factura ni duplicar importes para el gestor; opcionalmente pasa el cobro al cliente de esa factura y lo marca como pagado.

## Lo cobrado en mano o por Bizum no se factura
Un cobro pagado **en mano o por Bizum** queda **sin factura** y no sale en «Hacer facturas», aunque el cliente sea de los que se facturan. Si quieres facturarlo, ábrelo y pulsa «Mandar a facturación». Transferencia, tarjeta y cobros aún sin pagar siguen saliendo como por facturar.

## Resumen del mes por cómo se cobra
En **Resumen** y en **Mes** hay una tarjeta que reparte el dinero del mes en: **Facturado** (con lo cobrado y lo pendiente), **Por facturar**, **Cobrado en efectivo**, **Cobrado por Bizum** y **Otros sin factura** (transferencia, tarjeta o sin cobrar). Cada cobro cuenta en un solo sitio y la suma da el total del mes.

## Colores de la agenda
Hoja **Categorias**: cada evento se colorea por su calendario (columna `calendario`) o por palabras de su título (`palabras_clave`, separadas por comas). Puedes añadir categorías nuevas con su color.

## Cambios en el backend
Tras editar `Code.gs`: Implementar → Gestionar implementaciones → editar → *Nueva versión* (así la URL no cambia).

## El resumen del cobro coincide con la factura (v70)
Al generar o editar una factura, si cambias precios o conceptos, el cobro se actualiza con ellos (líneas e importe). Antes el PDF salía bien pero el detalle del cobro conservaba los precios antiguos. Para una factura ya hecha con precios distintos: ábrela, «Editar la factura» → «Guardar cambios». Solo se sincroniza si la factura es de un único cobro.

## Cómo pagó cada cliente (v71)
En «Efectivo y Bizum», toca el nombre de un cliente en «Sesiones de la agenda»: ves sus cobros del mes y eliges En mano o Bizum para cada uno (se guarda al momento), y si tiene sesiones sin cobrar puedes apuntarlas desde ahí.

## Clientes que forman parte de otro (v72)
En la ficha de un cliente, «¿Forma parte de otro cliente?» (p. ej. Diego Aguado y Hugo Llanos dentro de Alberto Santamaría). Sus sesiones de la agenda pasan a contar en el cliente principal, y lo que pague ese cliente las cubre. La ficha del principal muestra «Incluye a…» y la lista de clientes lo indica.

## Efectivo y Bizum por cliente (v79)
Una sola lista: una tarjeta por cliente con el total cobrado, sus cobros del mes (etiqueta En mano o Bizum), las sesiones de la agenda plegadas en «Ver sesiones» y el botón de cobrar si quedan sin cobrar.

## Cobrar sesiones en un solo paso (v73)
Desde una sesión de la agenda, «Cobrar sesiones» pregunta lo mínimo: por cuántas sesiones es el pago (1, el bono, el doble u otro número; el importe se calcula solo), cómo pagó (En mano · Bizum · Transferencia · Aún no) y desde qué día. En mano y Bizum van a «Efectivo y Bizum» sin facturar; transferencia se puede facturar. Concepto y sesiones previas quedan en «Más opciones». Los cobros por Bizum de cualquier cliente salen ahora también en «Efectivo y Bizum».

## Fecha de la factura y mes del cobro (v74)
Los resúmenes cuentan cada cobro en el mes de su fecha. Si al crear o editar una factura su fecha cae en otro mes que el cobro (p. ej. la pusiste el 1/11 y la corriges al 30/10), la app pregunta si pasar el cobro a ese mes.
En el detalle de un cobro facturado, si la factura es de otro mes, sale un aviso con el botón «Pasar el cobro a <mes>» (sin regenerar el PDF) (v75).

## Una sola regla de sesiones pagadas y un solo botón de cobro (v80)
Todas las pantallas (agenda, resumen de sesiones, Efectivo y Bizum, ficha, bonos) usan la misma regla para saber si una sesión está pagada:
1. Un cobro vinculado a esa sesión la cubre.
2. Un cobro «hasta una fecha» cubre todas las sesiones hasta ese día.
3. Bonos y sesiones sueltas se gastan por orden desde el día en que empiezan («Desde el día»).
Lo que no cubre nada sale «Sin pagar» (ya pasó) o «Por cobrar» (futura). Antes la agenda ignoraba los cobros «hasta una fecha» y decía que Alvaro tenía sesiones sin pagar.

Para cobrar siempre se usa la misma hoja («Cobrar sesiones»): nº de sesiones, cómo pagó (En mano · Bizum · Transferencia · Aún no) e importe. Desde Efectivo y Bizum o la ficha del mes, las sesiones sin pagar ya vienen contadas. Avisa si apuntas un cobro igual a otro ya apuntado.
