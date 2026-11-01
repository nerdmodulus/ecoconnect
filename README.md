# EcoConnect · prototipo (PMV)

App web para campings rurales: mapa, pedidos de suministros y reportes de problemas.
**Funciona sin señal**: una vez abierta con internet, queda guardada en el dispositivo.
Los pedidos y reportes hechos sin señal quedan *pendientes* y se envían solos al volver la señal.

Es el flujo del storyboard: sin señal → app offline → todo sincronizado y resuelto.

---

## 1. Qué hay en cada carpeta

```
index.html               pantalla de la app
css/styles.css           estilos
js/config.js             ← lo único que tienes que editar (URL de Apps Script y demora)
js/sound.js              sonidos
js/app.js                lógica de la app y de la simulación
sw.js, manifest.webmanifest   hacen que funcione sin señal y se pueda instalar
assets/                  íconos, tipografías y sonidos (mp3)
apps-script/Code.gs      código para Google Apps Script (registro en Google Sheets)
```

## 2. Subir a GitHub y publicarla (GitHub Pages)

1. Crea un repositorio en GitHub (por ejemplo `ecoconnect`). Para Pages gratis, debe ser **público**.
2. Descomprime el zip. Dentro del repositorio: **Add file → Upload files** y arrastra **el contenido** de la carpeta
   (index.html, css, js, assets…), no la carpeta completa. Luego **Commit changes**.
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, carpeta `/ (root)` → **Save**.
4. En 1 o 2 minutos aparece la dirección: `https://TU-USUARIO.github.io/ecoconnect/`

Para que quede "descargada" el usuario debe abrir esa dirección **una vez con internet** (escena 2 del storyboard).
En Android/Chrome aparece el botón *Instalar*. En iPhone: Compartir → *Agregar a pantalla de inicio*.

## 3. Registro de usuarios con Google Apps Script

1. Crea una **hoja de cálculo de Google** nueva (nómbrala, por ejemplo, "EcoConnect registro").
2. Dentro de la hoja: **Extensiones → Apps Script**. Borra lo que haya y pega todo `apps-script/Code.gs`. Guarda.
3. En la barra superior elige la función `configurar` y presiona **Ejecutar**. Acepta los permisos
   (si dice "Google no verificó esta aplicación": *Avanzado → Ir a … (no seguro)*; es tu propio script).
   Esto crea las hojas **Usuarios** y **Solicitudes**.
4. **Implementar → Nueva implementación → Tipo: Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - **Implementar** y copia la URL que termina en `/exec`.
5. Abre `js/config.js` en tu repositorio (lápiz de editar en GitHub) y pega la URL en `APPS_SCRIPT_URL: "…"`. Commit.
6. Prueba: abre la URL `/exec` en el navegador; debe mostrar `{"ok":true,"servicio":"EcoConnect",…}`.

Si después modificas `Code.gs`, tienes que publicar una **nueva versión**:
Implementar → Administrar implementaciones → ✏️ → Versión: *Nueva versión* → Implementar.

**Qué se guarda en la hoja** (te sirve como evidencia del piloto):
- *Usuarios*: nombre, correo, parcela y fecha de registro.
- *Solicitudes*: tipo, título, categoría, hora de creación, hora en que llegó, hora de respuesta,
  estado, **tiempo de respuesta en segundos** y si llevaba foto.

## 4. La respuesta a los 15 segundos

- Cada solicitud que **llega** a la administración (con señal) recibe respuesta automática a los **15 s**:
  los pedidos pasan a **Aprobado · asignado a mantención** y los reportes a **Resuelto**.
- Si se hizo sin señal, el reloj parte cuando se sincroniza.
- Para cambiar el tiempo: `RESPONSE_DELAY_MS` en `js/config.js`.
  Para probar rápido sin editar nada, agrega `?demora=3` a la dirección.
- La señal también es simulada: se alterna tocando la etiqueta naranja *Sin conexión* / *Con señal* de la barra superior
  (o el botón *Caminar a un punto con señal* en la pestaña Estado).
- El **panel de administración (demo)** está en Estado → Ajustes → *Ver panel de administración*.
  Solo muestra lo que se envió desde ese mismo dispositivo.

### Texto para declarar en el Word

> La aplicación es un prototipo funcional. La respuesta de la administración es simulada: cada solicitud
> (pedido o reporte) recibe una respuesta automática 15 segundos después de ser recibida por el sistema,
> es decir, una vez que el dispositivo recupera la señal y sincroniza. El pedido pasa a "Aprobado" y el reporte
> a "Resuelto". La señal también se simula con un interruptor visible en la aplicación. Esto permite observar
> cómo comprenden y reaccionan los usuarios ante el flujo completo, sin depender de un equipo real de administración.

## 5. Sonidos

Asignados según su duración (no pude escucharlos, así que cámbialos si alguno no calza):

| Momento | Archivo | Original |
|---|---|---|
| Toques y cambio de señal | `tap.mp3` | App Interface Sound – Smooth Tech 23 |
| Solicitud en cola (sin señal) | `pendiente.mp3` | App Notification 1 |
| Solicitud enviada con señal | `recibido.mp3` | App Notification 2 |
| Termina la sincronización | `sincronizado.mp3` | App UI Sound 1 |
| La administración responde | `respuesta.mp3` | App Reminder Sound |
| Registro del huésped | `bienvenida.mp3` | App UI Sound 3 |
| Música ambiente (opcional, apagada por defecto) | `ambiente.mp3` | TheGreatStillLake_108_Loop |
| Sin usar por ahora | `extra-2.mp3`, `extra-4.mp3` | App UI Sound 2 y 4 |

Para cambiar uno, edita el nombre del archivo en `SOUNDS` dentro de `js/config.js`.
Los mp3 son versiones comprimidas de tus .wav (la música pasó de 15 MB a 1 MB).
Si subes el repositorio como público, esos audios quedan descargables: revisa que su licencia lo permita.

## 6. Cosas a tener en cuenta

- Los datos de cada persona (solicitudes, fotos) quedan **en su propio dispositivo**. Lo único compartido es el registro en Google Sheets.
- Las fotos no se suben a la hoja (solo se registra si había foto).
- La hoja solo se actualiza cuando el dispositivo tiene "señal" en la app **y** conexión real a internet.
- Si cambias archivos del repositorio, sube el número de `VERSION` en `sw.js` (por ejemplo `ecoconnect-v3`) para que los celulares ya instalados reciban la actualización.
- Los datos del registro (nombre y correo) son personales: avisa a quienes participen en la prueba para qué se usan.
