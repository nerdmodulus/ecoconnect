/* =========================================================
   EcoConnect · aplicación
   Flujo del storyboard: sin señal -> app offline -> todo
   sincronizado y resuelto.
   La "administración" es simulada: responde a los 15 s de
   recibir cada solicitud (ver RESPONSE_DELAY_MS en config.js).
   ========================================================= */
(() => {
  "use strict";

  const C = window.ECO_CONFIG;
  const Sound = window.EcoSound;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ico = (id, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const lista = a => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1]);
  const hora = t => new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

  // Demora configurable por URL: ?demora=3 (segundos), útil para probar rápido.
  const qs = new URLSearchParams(location.search);
  const demoraQS = parseFloat(qs.get("demora"));
  const DELAY = demoraQS > 0 ? demoraQS * 1000 : C.RESPONSE_DELAY_MS;

  /* ---------- Datos fijos ---------- */
  const ITEMS = {
    lena: { label: "Leña", desc: "Para tu fogón", icon: "ic-flame" },
    carbon: { label: "Carbón", desc: "Para la parrilla", icon: "ic-box" },
    comida: { label: "Comida", desc: "Pan, abarrotes y bebidas", icon: "ic-food" },
    electricidad: { label: "Electricidad", desc: "Extensión o punto de carga", icon: "ic-bolt" }
  };
  const CATS = {
    banos: { label: "Baños", icon: "ic-toilet" },
    agua: { label: "Agua", icon: "ic-drop" },
    luz: { label: "Luz", icon: "ic-bolt" }
  };
  const POIS = {
    admin: { name: "Administración", icon: "ic-building", x: 180, y: 58, label: "Admin.", walk: "3 min",
      desc: "Recepción y consultas. Desde la app puedes pedir y reportar sin ir hasta allá." },
    banos: { name: "Baños y duchas", icon: "ic-toilet", x: 90, y: 118, label: "Baños", walk: "2 min",
      desc: "Baños y duchas con agua caliente. Si algo no funciona, repórtalo en pocos toques.",
      go: { label: "Reportar un problema", tab: "reportar", cat: "banos" } },
    agua: { name: "Agua potable", icon: "ic-drop", x: 272, y: 108, label: "Agua", walk: "4 min",
      desc: "Grifo de agua potable para cargar botellas y bidones.",
      go: { label: "Reportar un problema", tab: "reportar", cat: "agua" } },
    luz: { name: "Conexión eléctrica", icon: "ic-bolt", x: 214, y: 150, label: "Luz", walk: "3 min",
      desc: "Punto de energía para cargar equipos.",
      go: { label: "Reportar un problema", tab: "reportar", cat: "luz" } },
    lena: { name: "Leña y carbón", icon: "ic-flame", x: 54, y: 206, label: "Leña", walk: "5 min",
      desc: "Bodega de leña y carbón. También puedes pedir que te lo lleven a tu parcela.",
      go: { label: "Pedir leña", tab: "pedir", item: "lena" } },
    fogon: { name: "Fogón común", icon: "ic-flame", x: 224, y: 218, label: "Fogón", walk: "2 min",
      desc: "Espacio para compartir en la noche. Pide leña si quieres encender el tuyo." },
    basura: { name: "Reciclaje y basura", icon: "ic-trash", x: 300, y: 252, label: "Reciclaje", walk: "4 min",
      desc: "Punto de reciclaje y basura. Deja todo limpio para el siguiente huésped." }
  };
  const PARCELA_POS = { x: 138, y: 244 };

  /* ---------- Estado (se guarda en el dispositivo) ---------- */
  const KEY = "ecoconnect.v1";
  const base = () => ({ user: null, signal: false, requests: [], tab: "mapa", settings: { sound: true, music: false }, flags: {} });
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      const b = base();
      return s ? { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) }, flags: { ...(s.flags || {}) } } : b;
    } catch (e) { return base(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { // sin espacio: se descartan las fotos y se reintenta
      state.requests.forEach(r => { r.photo = null; });
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* nada más que hacer */ }
    }
  }

  const draft = { items: new Set(), cat: "", text: "", photo: null };
  const ui = { poi: null };
  let route = "mapa";
  let syncing = false;
  let offlineReady = false;
  let installEvt = null;
  let cloud = C.APPS_SCRIPT_URL ? "wait" : "off";

  const app = $("#app"), view = $("#view");

  /* ---------- Enrutado y pintado ---------- */
  const currentRoute = () => (location.hash === "#admin" ? "admin" : state.tab);

  function render() {
    route = currentRoute();
    app.dataset.route = route;
    updateChrome();
    if (!state.user && route !== "admin") view.innerHTML = viewRegistro();
    else view.innerHTML = ({ mapa: viewMapa, pedir: viewPedir, reportar: viewReportar, estado: viewEstado, admin: viewAdmin }[route])();
    if (route === "mapa" && state.user) selectPoi(ui.poi, true);
    updateLive();
  }

  function refresh() { // repinta solo donde los datos cambian solos
    if (route === "estado" || route === "admin") render(); else updateChrome();
  }

  function updateChrome() {
    const r = route, adminMode = r === "admin", hasUser = !!state.user;
    const pill = $("#signalPill");
    pill.hidden = adminMode;
    pill.className = "pill" + (state.signal ? " on" : "");
    pill.innerHTML = ico(state.signal ? "ic-signal" : "ic-signal-off") + (state.signal ? "Con señal" : "Sin conexión");
    pill.title = "Toca para simular que encuentras o pierdes señal";
    pill.setAttribute("aria-label", `Señal simulada: ${state.signal ? "con señal" : "sin conexión"}. Toca para cambiar.`);
    $("#adminTag").hidden = !adminMode;
    $("#tabbar").hidden = adminMode || !hasUser;
    $$(".tab").forEach(t => { if (t.dataset.tab === r) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
    const pend = state.requests.filter(x => x.status === "pendiente").length;
    const badge = $("#badge");
    badge.hidden = !pend;
    badge.textContent = pend;
  }

  /* ---------- Vistas ---------- */
  function viewRegistro() {
    return `
    <section class="welcome">
      <svg class="tent" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#f0a93a"/><path d="M50 22 78 74H22z" fill="#17543a"/><path d="M50 50 62 74H38z" fill="#f0a93a"/></svg>
      <h1>Bienvenida y bienvenido</h1>
      <p class="lead">Regístrate una vez para pedir suministros y reportar problemas desde tu parcela. Funciona aunque no haya señal.</p>
      <form id="formRegistro" novalidate>
        <div class="field"><label for="rName">Nombre</label>
          <input id="rName" name="name" autocomplete="name" required minlength="2" placeholder="Ej: Camila Rojas">
          <span class="err" id="eName" role="alert"></span></div>
        <div class="field"><label for="rMail">Correo</label>
          <input id="rMail" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="nombre@correo.cl">
          <span class="err" id="eMail" role="alert"></span></div>
        <div class="field"><label for="rParcela">N° de parcela</label>
          <input id="rParcela" name="parcela" type="number" inputmode="numeric" min="1" max="${C.PARCELAS_MAX}" required placeholder="Ej: 12">
          <span class="err" id="eParcela" role="alert"></span></div>
        <button class="btn" type="submit">Comenzar mi estadía</button>
        <p class="small muted">Esto es un prototipo: tu nombre y correo se guardan solo para esta prueba.</p>
      </form>
    </section>`;
  }

  function readyBox() {
    if (!("serviceWorker" in navigator)) return "";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
    if (!offlineReady) return `<div class="ready">${ico("ic-download")}<div><strong>Preparando para usar sin señal…</strong>Mantén la app abierta un momento con internet.</div></div>`;
    return `<div class="ready">${ico("ic-check")}<div><strong>Descargada: funciona sin señal</strong>
      ${installEvt ? `<button type="button" data-action="install">Instalar en este equipo</button>` : ""}
      ${ios ? `<span class="small">En iPhone: Compartir y luego "Agregar a pantalla de inicio".</span>` : ""}</div></div>`;
  }

  function mapSVG() {
    const trees = [[24,60],[44,84],[330,60],[310,36],[342,150],[18,150],[120,40],[250,36],[330,205],[18,262],[84,276],[176,276],[250,276],[340,276],[110,160],[290,170]]
      .map(([x, y]) => `<use href="#tree" x="${x - 10}" y="${y - 16}" width="20" height="28"/>`).join("");
    const pois = Object.entries(POIS).map(([id, p]) => `
      <g class="poi" data-action="poi" data-id="${id}" tabindex="0" role="button" aria-label="${esc(p.name)}" transform="translate(${p.x} ${p.y})">
        <circle class="base" r="17"/>
        <use class="ico-map" href="#${p.icon}" x="-10" y="-10" width="20" height="20"/>
        <text y="33">${esc(p.label)}</text>
      </g>`).join("");
    const me = state.user ? `
      <g class="poi me" data-action="poi" data-id="parcela" tabindex="0" role="button" aria-label="Tu parcela, número ${esc(state.user.parcela)}" transform="translate(${PARCELA_POS.x} ${PARCELA_POS.y})">
        <circle class="pulse" r="17"/>
        <circle class="base" r="17"/>
        <use class="ico-map" href="#ic-tent" x="-10" y="-10" width="20" height="20"/>
        <text y="33">Tu parcela ${esc(state.user.parcela)}</text>
      </g>` : "";
    return `
    <svg class="map" viewBox="0 0 360 300" role="group" aria-label="Mapa esquemático del camping">
      <rect width="360" height="300" fill="#cfe3bf"/>
      <path d="M0 74C60 34 120 52 180 38S300 22 360 50V0H0z" fill="#bcd8aa"/>
      <path d="M0 300v-52c70-26 140 14 210-10s110-24 150-2v64z" fill="#bcd8aa"/>
      <path d="M-10 176C50 152 92 194 152 172S252 152 370 192" stroke="#8ec3d4" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="M-10 176C50 152 92 194 152 172S252 152 370 192" stroke="#bfe0ea" stroke-width="7" fill="none" stroke-linecap="round"/>
      <g stroke="#f6f0d8" stroke-width="4" stroke-dasharray="1 8" stroke-linecap="round" fill="none">
        <path d="M180 58C170 90 120 100 90 118"/><path d="M180 58C200 80 250 90 272 108"/>
        <path d="M180 58C196 92 206 120 214 150"/><path d="M90 118C70 150 62 180 54 206"/>
        <path d="M214 150C226 180 228 196 224 218"/><path d="M224 218C250 226 280 236 300 252"/>
        <path d="M138 244C170 238 200 228 224 218"/><path d="M138 244C110 236 78 222 54 206"/>
      </g>
      ${trees}${pois}${me}
    </svg>`;
  }

  function viewMapa() {
    const first = esc(state.user.name.split(" ")[0]);
    return `
    <h1>Hola, ${first}</h1>
    <p class="lead">Parcela ${esc(state.user.parcela)}. Este mapa funciona sin señal.</p>
    ${readyBox()}
    <div class="mapbox">${mapSVG()}</div>
    <div class="card poi-card" id="poiCard" aria-live="polite"></div>
    <h2 class="sec-title">Servicios</h2>
    <div class="services">${Object.entries(POIS).map(([id, p]) =>
      `<button type="button" class="service" data-action="poi" data-id="${id}" aria-pressed="false">${ico(p.icon)}${esc(p.name)}</button>`).join("")}
    </div>`;
  }

  function selectPoi(id, quiet) {
    ui.poi = id && (POIS[id] || id === "parcela") ? id : null;
    $$(".poi").forEach(g => g.classList.toggle("sel", g.dataset.id === ui.poi));
    $$(".service").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === ui.poi)));
    const card = $("#poiCard");
    if (!card) return;
    if (!ui.poi) { card.innerHTML = `<p class="muted" style="margin:0">Toca un punto del mapa para ver qué hay y cómo llegar.</p>`; return; }
    if (ui.poi === "parcela") {
      card.innerHTML = `<h3>Tu parcela ${esc(state.user.parcela)}</h3><p>Aquí llegan tus pedidos de leña, carbón, comida y electricidad.</p>`;
      return;
    }
    const p = POIS[ui.poi];
    card.innerHTML = `<h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><p class="small muted">A ${esc(p.walk)} caminando desde tu parcela</p>
      ${p.go ? `<button type="button" class="btn sec sm" data-action="poi-go" data-id="${ui.poi}">${esc(p.go.label)}</button>` : ""}`;
  }

  function viewPedir() {
    return `
    <h2>Pedir suministros</h2>
    <p class="lead">Elige lo que necesitas. La administración lo asigna al equipo y lo lleva a tu parcela.</p>
    <fieldset class="opts"><legend class="small muted" style="margin-bottom:8px">¿Qué necesitas?</legend>
      ${Object.entries(ITEMS).map(([id, it]) => `
      <label class="opt"><input type="checkbox" data-opt="${id}" ${draft.items.has(id) ? "checked" : ""}>
        ${ico(it.icon)}<span class="txt"><b>${it.label}</b><span>${it.desc}</span></span>
        <span class="tick">${ico("ic-check")}</span></label>`).join("")}
    </fieldset>
    <button class="btn" type="button" id="btnPedido" data-action="enviar-pedido" ${draft.items.size ? "" : "disabled"}>Enviar pedido</button>
    <p class="note">${ico("ic-clock")}<span>Sin señal, el pedido queda pendiente y se envía solo al volver la señal.</span></p>`;
  }

  function viewReportar() {
    return `
    <h2>Reportar un problema</h2>
    <p class="lead">Cuéntanos qué pasó. Con una foto, el equipo llega más rápido.</p>
    <form id="formReporte" novalidate>
      <fieldset class="chips"><legend class="small muted" style="margin-bottom:8px">¿Dónde es el problema?</legend>
        ${Object.entries(CATS).map(([id, c]) => `
        <label class="chipbtn"><input type="radio" name="cat" value="${id}" ${draft.cat === id ? "checked" : ""}>${ico(c.icon)}${c.label}</label>`).join("")}
      </fieldset>
      <div class="field"><label for="rText">¿Qué pasó?</label>
        <textarea id="rText" maxlength="140" placeholder="Ej: ducha sin agua caliente">${esc(draft.text)}</textarea></div>
      <div class="field"><span style="font-weight:700;font-size:.92rem">Foto (opcional)</span>
        <label class="photo" id="photoBox">${photoInner()}<input type="file" id="rPhoto" accept="image/*" capture="environment" aria-label="Agregar foto"></label></div>
      <button class="btn" type="button" id="btnReporte" data-action="enviar-reporte" ${reporteOk() ? "" : "disabled"}>Guardar reporte</button>
    </form>
    <p class="note">${ico("ic-clock")}<span>Sin señal, el reporte queda en cola y se envía solo al volver la señal.</span></p>`;
  }
  const photoInner = () => (draft.photo ? `<img src="${draft.photo}" alt="Foto del problema">` : `${ico("ic-camera")}<span>Agregar foto</span>`);
  const reporteOk = () => !!draft.cat && draft.text.trim().length >= 3;

  function reqIcon(r) {
    if (r.type === "pedido") return (ITEMS[(r.cat || "").split(",")[0]] || ITEMS.lena).icon;
    return (CATS[r.cat] || CATS.banos).icon;
  }
  const CHIP = {
    pendiente: ["pendiente", "ic-clock", "Pendiente"],
    recibido: ["recibido", "ic-check", "Recibido"],
    aprobado: ["aprobado", "ic-check", "Aprobado · asignado a mantención"],
    resuelto: ["resuelto", "ic-check", "Resuelto"]
  };
  const chip = s => `<span class="chip ${CHIP[s][0]}">${ico(CHIP[s][1])}${CHIP[s][2]}</span>`;

  function reqSub(r) {
    if (r.status === "pendiente") return `<p class="sub">Se enviará al volver la señal.</p>`;
    if (r.status === "recibido") {
      return state.signal
        ? `<p class="sub">La administración responde en <b data-count="${r.id}">${Math.ceil(DELAY / 1000)}</b> s</p><div class="bar"><i data-bar="${r.id}"></i></div>`
        : `<p class="sub">Sin señal: verás la respuesta al volver la señal.</p>`;
    }
    return `<p class="sub">${r.type === "pedido" ? "Tu pedido fue aprobado y asignado al equipo de mantención." : "El equipo de mantención resolvió tu reporte."}</p>`;
  }

  function viewEstado() {
    const pend = state.requests.filter(r => r.status === "pendiente").length;
    const list = [...state.requests].sort((a, b) => b.createdAt - a.createdAt);
    const cloudTxt = { off: "No configurado (opcional)", wait: "Se enviará cuando haya señal", ok: "Al día", error: "No se pudo enviar. Reintenta solo." }[cloud];
    return `
    <h2>Mis solicitudes</h2>
    ${pend && !state.signal ? `<div class="banner"><div><b>${pend === 1 ? "Tienes 1 solicitud pendiente" : `Tienes ${pend} solicitudes pendientes`}</b>Se enviarán solas al volver la señal.</div>
      <button type="button" class="btn sm" data-action="toggle-signal">Caminar a un punto con señal</button></div>` : ""}
    <div class="stack" style="margin-top:12px">
    ${list.length ? list.map(r => `
      <article class="req ${r.status}">
        <div class="req-ico">${ico(reqIcon(r))}</div>
        <div><h3>${esc(r.title)}</h3>
          <p class="meta">${r.type === "pedido" ? "Pedido" : "Reporte"} · Parcela ${esc(r.parcela)} · ${hora(r.createdAt)}</p>
          ${chip(r.status)}${reqSub(r)}</div>
        ${r.photo ? `<img class="thumb" src="${r.photo}" alt="Foto adjunta">` : ""}
      </article>`).join("") : `
      <div class="card empty">${ico("ic-list")}<h3>Aún no hay solicitudes</h3>
        <p class="muted">Pide leña o reporta un problema y verás aquí cómo avanza.</p>
        <button type="button" class="btn sm" data-action="tab" data-tab="pedir">Pedir suministros</button></div>`}
    </div>

    <h2 class="sec-title">Ajustes</h2>
    <div class="settings">
      <div class="setrow">${ico(state.settings.sound ? "ic-sound" : "ic-sound-off")}<span class="txt"><b>Sonidos</b><span>Avisos al enviar y al recibir respuesta</span></span>
        <button class="switch" type="button" role="switch" aria-checked="${state.settings.sound}" aria-label="Sonidos" data-action="toggle-sound"></button></div>
      <div class="setrow">${ico("ic-music")}<span class="txt"><b>Música ambiente</b><span>Suave, de fondo</span></span>
        <button class="switch" type="button" role="switch" aria-checked="${state.settings.music}" aria-label="Música ambiente" data-action="toggle-music"></button></div>
      <div class="setrow">${ico("ic-cloud")}<span class="txt"><b>Registro en la nube</b><span>${cloudTxt}</span></span></div>
      <div class="linkrow">
        <a class="btn sec" href="#admin">Ver panel de administración (demo)</a>
        <button type="button" class="btn sec" data-action="reset-demo">Borrar solicitudes y repetir la demo</button>
        <button type="button" class="btn danger" data-action="reset-all">Cambiar de huésped</button>
      </div>
    </div>`;
  }

  function viewAdmin() {
    const rec = state.requests.filter(r => r.receivedAt);
    const done = rec.filter(r => r.adminStatus !== "recibido").length;
    const pend = state.requests.filter(r => r.status === "pendiente").length;
    const list = [...rec].sort((a, b) => b.receivedAt - a.receivedAt);
    return `
    <div class="admin-head">${ico("ic-building")}<h2>Panel de administración</h2></div>
    <div class="admin-body">
      ${list.length ? list.map(r => `
        <div class="arow"><div class="req-ico">${ico(reqIcon(r))}</div>
          <div><h3>${esc(r.title)} · Parcela ${esc(r.parcela)}</h3>
            <p>${esc(r.huesped || "Huésped")} · llegó a las ${hora(r.receivedAt)}</p>
            ${r.adminStatus === "recibido"
              ? `<span class="chip recibido">${ico("ic-clock")}Respondiendo en <b data-count="${r.id}">${Math.ceil(DELAY / 1000)}</b> s</span><div class="bar"><i data-bar="${r.id}"></i></div>`
              : r.adminStatus === "aprobado" ? `<span class="chip aprobado">${ico("ic-check")}Asignado a mantención</span>` : `<span class="chip resuelto">${ico("ic-check")}Resuelto</span>`}
          </div></div>`).join("")
        : `<p class="muted" style="margin:6px 0">Todavía no llegan solicitudes. Envía un pedido o reporte desde la app con señal.</p>`}
    </div>
    <div class="stats">
      <div class="stat"><b>${rec.length}</b><span>Recibidas</span></div>
      <div class="stat"><b>${done}</b><span>Respondidas</span></div>
      <div class="stat"><b>${pend}</b><span>Sin enviar</span></div>
    </div>
    <div class="closing">Menos llamadas · Menos esperas</div>
    <div class="linkrow" style="margin-top:14px"><a class="btn sec" href="#" data-action="admin-back">Volver a la app del huésped</a></div>`;
  }

  /* ---------- Acciones ---------- */
  function toast(msg, ms = 3200) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, ms);
  }

  function setTab(t) {
    state.tab = t; save();
    if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search);
    render();
    view.scrollTop = 0;
    view.focus({ preventScroll: true });
  }

  function toggleSignal() {
    if (syncing) return;
    state.signal = !state.signal; save();
    Sound.play("tap");
    updateChrome();
    if (route === "estado" || route === "admin") render();
    toast(state.signal ? "Encontraste señal" : "Sin señal: la app sigue funcionando");
    tick();
  }

  function newId() { return "EC-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(); }

  function createRequest({ type, title, cat, photo }) {
    const now = Date.now();
    const r = { id: newId(), type, title, cat, photo: photo || null, parcela: state.user.parcela, huesped: state.user.name,
      createdAt: now, status: "pendiente", adminStatus: null, receivedAt: null, resolvedAt: null, rev: 1, sheetRev: 0 };
    if (state.signal) { r.status = "recibido"; r.adminStatus = "recibido"; r.receivedAt = now; Sound.play("recibido"); }
    else Sound.play("pendiente");
    state.requests.push(r); save();
    toast(state.signal
      ? `${type === "pedido" ? "Pedido enviado" : "Reporte enviado"}: la administración lo recibió.`
      : `${type === "pedido" ? "Pedido guardado" : "Reporte guardado"}: se enviará al volver la señal.`);
    pushToSheet(true);
  }

  function enviarPedido() {
    if (!draft.items.size) return;
    const ids = [...draft.items];
    createRequest({ type: "pedido", title: lista(ids.map(i => ITEMS[i].label)), cat: ids.join(",") });
    draft.items.clear();
    setTab("estado");
  }

  function enviarReporte() {
    if (!reporteOk()) return;
    const text = draft.text.trim();
    createRequest({ type: "reporte", title: text.charAt(0).toUpperCase() + text.slice(1), cat: draft.cat, photo: draft.photo });
    Object.assign(draft, { cat: "", text: "", photo: null });
    setTab("estado");
  }

  function fileToThumb(file) {
    return new Promise(ok => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 480 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }

  /* ---------- Sincronización (escena 5) ---------- */
  function showSync(mode, n) {
    const o = $("#syncOverlay"), ring = $("#syncRing");
    o.hidden = false;
    ring.className = "sync-ring " + (mode === "work" ? "spin" : "done");
    ring.innerHTML = ico(mode === "work" ? "ic-sync" : "ic-check");
    $("#syncTitle").textContent = mode === "work" ? "Sincronizando…" : "Sincronizado";
    $("#syncText").textContent = mode === "work"
      ? "Enviando lo que quedó pendiente."
      : `Todo se envió solo, sin que hagas nada.${n ? ` (${n} ${n === 1 ? "solicitud" : "solicitudes"})` : ""}`;
  }

  async function runSync(pend) {
    syncing = true;
    showSync("work");
    await wait(C.SYNC_ANIM_MS);
    const now = Date.now();
    pend.forEach(r => { r.status = "recibido"; r.adminStatus = "recibido"; r.receivedAt = now; r.rev++; });
    save();
    Sound.play("sincronizado");
    showSync("done", pend.length);
    await wait(C.SYNC_ANIM_MS + 200);
    $("#syncOverlay").hidden = true;
    syncing = false;
    refresh();
    pushToSheet(true);
  }

  /* ---------- Reloj de la simulación ---------- */
  function tick() {
    const now = Date.now();
    let dirty = false;

    // Lado de la administración (no depende de la señal del huésped)
    state.requests.forEach(r => {
      if (r.receivedAt && r.adminStatus === "recibido" && now - r.receivedAt >= DELAY) {
        r.adminStatus = r.type === "pedido" ? "aprobado" : "resuelto";
        r.resolvedAt = r.receivedAt + DELAY;
        r.rev++; dirty = true;
      }
    });

    // Lo que ve el huésped (solo se actualiza con señal)
    if (state.signal && !syncing) {
      const pend = state.requests.filter(r => r.status === "pendiente");
      if (pend.length) runSync(pend);
      else state.requests.forEach(r => {
        if (r.adminStatus && r.status !== r.adminStatus) {
          r.status = r.adminStatus; dirty = true;
          Sound.play("respuesta");
          toast(r.type === "pedido" ? "Tu pedido fue aprobado" : "Tu reporte fue resuelto", 4200);
        }
      });
    }
    if (dirty) { save(); refresh(); }
    updateLive();
    pushToSheet();
  }

  function updateLive() {
    const now = Date.now();
    $$("[data-count]").forEach(el => {
      const r = state.requests.find(x => x.id === el.dataset.count);
      if (!r || !r.receivedAt) return;
      const rem = Math.max(0, DELAY - (now - r.receivedAt));
      el.textContent = Math.ceil(rem / 1000);
      const bar = $(`[data-bar="${r.id}"]`);
      if (bar) bar.style.width = Math.min(100, (1 - rem / DELAY) * 100) + "%";
    });
  }

  /* ---------- Registro en Google Sheets (Apps Script) ---------- */
  let pushing = false, lastTry = 0;
  const iso = t => (t ? new Date(t).toISOString() : "");
  async function pushToSheet(force) {
    const url = C.APPS_SCRIPT_URL;
    if (!url || !state.user || pushing || !state.signal) return;
    const now = Date.now();
    if (!force && now - lastTry < 8000) return;
    const dirty = state.requests.filter(r => r.status !== "pendiente" && r.sheetRev < r.rev);
    if (state.user.sheetOk && !dirty.length) { if (cloud !== "ok") { cloud = "ok"; } return; }
    pushing = true; lastTry = now;
    const sent = Object.fromEntries(dirty.map(r => [r.id, r.rev]));
    const u = state.user;
    const payload = {
      action: "sync",
      usuario: { id: u.id, nombre: u.name, correo: u.email, parcela: u.parcela, registrado: iso(u.createdAt) },
      solicitudes: dirty.map(r => ({
        id: r.id, tipo: r.type, titulo: r.title, categoria: r.cat, parcela: r.parcela, huesped: r.huesped,
        creada: iso(r.createdAt), recibida: iso(r.receivedAt), respondida: iso(r.resolvedAt),
        estado: r.adminStatus || "recibido", conFoto: !!r.photo
      }))
    };
    try {
      // text/plain evita el "preflight" CORS, que Apps Script no responde.
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (j && j.ok) {
        state.user.sheetOk = true;
        state.requests.forEach(r => { if (sent[r.id]) r.sheetRev = sent[r.id]; });
        cloud = "ok";
      } else cloud = "error";
    } catch (e) { cloud = "error"; }
    finally { pushing = false; save(); if (route === "estado") render(); }
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("pointerdown", () => Sound.unlock(), { once: true });

  app.addEventListener("click", e => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "home") { e.preventDefault(); if (state.user) { setTab("mapa"); } }
    else if (a === "admin-back") { e.preventDefault(); history.replaceState(null, "", location.pathname + location.search); render(); }
    else if (a === "tab") { Sound.play("tap"); setTab(t.dataset.tab); }
    else if (a === "toggle-signal") toggleSignal();
    else if (a === "poi") { Sound.play("tap"); selectPoi(t.dataset.id); }
    else if (a === "poi-go") {
      const g = POIS[t.dataset.id].go;
      if (g.item) draft.items.add(g.item);
      if (g.cat) draft.cat = g.cat;
      Sound.play("tap"); setTab(g.tab);
    }
    else if (a === "enviar-pedido") enviarPedido();
    else if (a === "enviar-reporte") enviarReporte();
    else if (a === "toggle-sound") {
      state.settings.sound = !state.settings.sound; save(); Sound.setEnabled(state.settings.sound);
      if (state.settings.sound) Sound.play("tap");
      render();
    }
    else if (a === "toggle-music") {
      state.settings.music = !state.settings.music; save();
      if (state.settings.music) { Sound.unlock(); Sound.startMusic(); } else Sound.stopMusic();
      render();
    }
    else if (a === "install" && installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); }
    else if (a === "reset-demo") {
      if (confirm("¿Borrar todas las solicitudes para repetir la demo?")) { state.requests = []; save(); toast("Solicitudes borradas"); render(); }
    }
    else if (a === "reset-all") {
      if (confirm("¿Cambiar de huésped? Se borran tus datos y solicitudes de este dispositivo.")) {
        localStorage.removeItem(KEY); state = load(); Sound.setEnabled(true); Sound.stopMusic();
        draft.items.clear(); Object.assign(draft, { cat: "", text: "", photo: null }); ui.poi = null; history.replaceState(null, "", location.pathname + location.search); render();
      }
    }
  });

  app.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".poi")) { e.preventDefault(); Sound.play("tap"); selectPoi(e.target.dataset.id); }
  });

  app.addEventListener("change", async e => {
    const el = e.target;
    if (el.matches("[data-opt]")) {
      el.checked ? draft.items.add(el.dataset.opt) : draft.items.delete(el.dataset.opt);
      Sound.play("tap");
      const b = $("#btnPedido"); if (b) b.disabled = !draft.items.size;
    } else if (el.name === "cat") {
      draft.cat = el.value; Sound.play("tap");
      const b = $("#btnReporte"); if (b) b.disabled = !reporteOk();
    } else if (el.id === "rPhoto" && el.files && el.files[0]) {
      draft.photo = await fileToThumb(el.files[0]);
      const box = $("#photoBox");
      if (box) box.innerHTML = photoInner() + `<input type="file" id="rPhoto" accept="image/*" capture="environment" aria-label="Cambiar foto">`;
    }
  });

  app.addEventListener("input", e => {
    if (e.target.id === "rText") {
      draft.text = e.target.value;
      const b = $("#btnReporte"); if (b) b.disabled = !reporteOk();
    }
  });

  app.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id !== "formRegistro") return;
    const f = e.target, name = f.name.value.trim(), email = f.email.value.trim().toLowerCase(), parcela = parseInt(f.parcela.value, 10);
    const errs = {
      eName: name.length < 2 ? "Escribe tu nombre." : "",
      eMail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Escribe un correo válido, por ejemplo nombre@correo.cl.",
      eParcela: parcela >= 1 && parcela <= C.PARCELAS_MAX ? "" : `Escribe un número de parcela entre 1 y ${C.PARCELAS_MAX}.`
    };
    Object.entries(errs).forEach(([id, msg]) => {
      const span = $("#" + id); span.textContent = msg;
      const input = span.parentElement.querySelector("input"); input.setAttribute("aria-invalid", String(!!msg));
    });
    const firstBad = Object.keys(errs).find(k => errs[k]);
    if (firstBad) { $("#" + firstBad).parentElement.querySelector("input").focus(); return; }
    state.user = { id: "U-" + Date.now().toString(36).toUpperCase(), name, email, parcela, createdAt: Date.now(), sheetOk: false };
    state.tab = "mapa"; save();
    Sound.unlock(); Sound.play("bienvenida");
    render();
    toast("Listo. Toca la etiqueta naranja de arriba para simular que encuentras o pierdes señal.", 5200);
    pushToSheet(true);
  });

  $("#toast").addEventListener("click", e => { e.currentTarget.hidden = true; }); // un toque lo cierra
  window.addEventListener("hashchange", render);
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (route === "mapa") render(); });

  /* ---------- Inicio ---------- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.ready.then(() => { offlineReady = true; if (route === "mapa" && state.user) { const r = view.querySelector(".ready"); if (r) r.outerHTML = readyBox(); } });
  }
  Sound.setEnabled(state.settings.sound);
  Sound.setWantMusic(state.settings.music);
  render();
  setInterval(tick, 500);
  tick();
})();
