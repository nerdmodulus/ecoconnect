/**
 * EcoConnect · registro de huéspedes y solicitudes en Google Sheets
 *
 * CÓMO USAR (resumen; el detalle está en README.md):
 * 1. Crea una hoja de cálculo de Google y abre Extensiones > Apps Script.
 * 2. Pega este archivo completo en Code.gs y guarda.
 * 3. Ejecuta una vez la función "configurar" y acepta los permisos.
 * 4. Implementar > Nueva implementación > Aplicación web
 *      Ejecutar como: Yo
 *      Quién tiene acceso: Cualquier persona
 * 5. Copia la URL que termina en /exec y pégala en js/config.js (APPS_SCRIPT_URL).
 *
 * Si editas este código después, crea una NUEVA versión en
 * Implementar > Administrar implementaciones > Editar > Nueva versión.
 */

// Déjalo vacío si el script se creó desde la hoja (Extensiones > Apps Script).
// Si es un script independiente, pega aquí el ID de la hoja (lo que va entre /d/ y /edit en su URL).
const ID_HOJA = "";

const HOJA_USUARIOS = "Usuarios";
const HOJA_SOLICITUDES = "Solicitudes";
const ZONA = "America/Santiago";

const CAB_USUARIOS = ["ID", "Nombre", "Correo", "Parcela", "Registrado en la app", "Última sincronización"];
const CAB_SOLICITUDES = [
  "ID", "Huésped", "Parcela", "Tipo", "Título", "Categoría / ítems",
  "Creada en la app", "Recibida por la administración", "Respondida",
  "Estado", "Tiempo de respuesta (s)", "Con foto", "Última sincronización"
];

/** Ejecútala una vez a mano: crea las hojas y pide los permisos. */
function configurar() {
  hoja_(HOJA_USUARIOS, CAB_USUARIOS);
  hoja_(HOJA_SOLICITUDES, CAB_SOLICITUDES);
  Logger.log("Listo: hojas creadas.");
}

/** Sirve para comprobar en el navegador que la implementación funciona. */
function doGet() {
  return json_({ ok: true, servicio: "EcoConnect", hora: new Date().toISOString() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const datos = JSON.parse(e.postData.contents);
    if (datos.action === "ping") return json_({ ok: true });
    if (datos.action === "sync") return json_(sincronizar_(datos));
    return json_({ ok: false, error: "Acción desconocida" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function sincronizar_(d) {
  const ahora = fecha_(new Date().toISOString());
  let usuarios = 0, solicitudes = 0;

  if (d.usuario && d.usuario.id) {
    const u = d.usuario;
    upsert_(hoja_(HOJA_USUARIOS, CAB_USUARIOS), limpiar_(u.id), [
      limpiar_(u.id), limpiar_(u.nombre), limpiar_(u.correo), Number(u.parcela) || "",
      fecha_(u.registrado), ahora
    ]);
    usuarios = 1;
  }

  (d.solicitudes || []).slice(0, 50).forEach(function (s) {
    if (!s || !s.id) return;
    const creada = s.creada ? new Date(s.creada) : null;
    const recibida = s.recibida ? new Date(s.recibida) : null;
    const respondida = s.respondida ? new Date(s.respondida) : null;
    const segundos = recibida && respondida ? Math.round((respondida - recibida) / 1000) : "";
    upsert_(hoja_(HOJA_SOLICITUDES, CAB_SOLICITUDES), limpiar_(s.id), [
      limpiar_(s.id), limpiar_(s.huesped), Number(s.parcela) || "", limpiar_(s.tipo),
      limpiar_(s.titulo), limpiar_(s.categoria),
      fecha_(s.creada), fecha_(s.recibida), fecha_(s.respondida),
      limpiar_(s.estado), segundos, s.conFoto ? "Sí" : "No", ahora
    ]);
    solicitudes++;
  });

  return { ok: true, usuarios: usuarios, solicitudes: solicitudes };
}

/* ---------- Utilidades ---------- */

function hoja_(nombre, cabecera) {
  const libro = ID_HOJA ? SpreadsheetApp.openById(ID_HOJA) : SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.appendRow(cabecera);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, cabecera.length).setFontWeight("bold").setBackground("#17543a").setFontColor("#ffffff");
    h.autoResizeColumns(1, cabecera.length);
  }
  return h;
}

/** Actualiza la fila con ese ID (columna A) o agrega una nueva. */
function upsert_(h, id, fila) {
  const ultima = h.getLastRow();
  let n = -1;
  if (ultima > 1) {
    const ids = h.getRange(2, 1, ultima - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) { n = i + 2; break; }
    }
  }
  if (n === -1) h.appendRow(fila);
  else h.getRange(n, 1, 1, fila.length).setValues([fila]);
}

/** Texto seguro: corta el largo y evita que Sheets lo interprete como fórmula. */
function limpiar_(v) {
  let t = String(v == null ? "" : v).trim().slice(0, 300);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return t;
}

function fecha_(iso) {
  if (!iso) return "";
  const f = new Date(iso);
  return isNaN(f) ? "" : Utilities.formatDate(f, ZONA, "yyyy-MM-dd HH:mm:ss");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
