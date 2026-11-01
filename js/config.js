/* =========================================================
   EcoConnect · configuración
   Es lo único que necesitas editar para publicar la app.
   ========================================================= */
window.ECO_CONFIG = {

  // 1) Pega aquí la URL de tu Apps Script (termina en /exec).
  //    Si la dejas vacía, la app funciona igual pero sin registro en Google Sheets.
  APPS_SCRIPT_URL: "",

  // 2) Segundos que tarda la "administración" en responder una solicitud
  //    desde que llega (simulación). Para probar rápido: agrega ?demora=3 a la URL.
  RESPONSE_DELAY_MS: 15000,

  // Duración de la animación de sincronización (milisegundos).
  SYNC_ANIM_MS: 1700,

  // 3) Sonidos. Para cambiar un sonido, cambia el nombre del archivo
  //    (están en assets/sounds/). Disponibles: tap, pendiente, recibido,
  //    respuesta, sincronizado, bienvenida, extra-2, extra-4.
  SOUND_DIR: "assets/sounds/",
  SOUNDS: {
    tap: "tap.mp3",                     // toques y cambio de señal
    pendiente: "pendiente.mp3",         // pedido o reporte queda en cola (sin señal)
    recibido: "recibido.mp3",           // solicitud enviada con señal
    sincronizado: "sincronizado.mp3",   // termina la sincronización
    respuesta: "respuesta.mp3",         // la administración aprobó o resolvió
    bienvenida: "bienvenida.mp3"        // registro del huésped
  },
  VOLUME: {
    tap: 0.6, pendiente: 0.55, recibido: 0.55,
    sincronizado: 0.7, respuesta: 0.7, bienvenida: 0.7
  },
  MUSIC: "ambiente.mp3",
  MUSIC_VOLUME: 0.15,

  // Datos de la demo
  PARCELAS_MAX: 40
};
