/* =========================================================
   EcoConnect · sonido
   - Efectos: Web Audio (funciona sin señal y en Safari).
   - Música ambiente: opcional, se activa desde Estado > Ajustes.
   ========================================================= */
window.EcoSound = (() => {
  const C = window.ECO_CONFIG;
  let ctx = null, enabled = true, wantMusic = false;
  let musicEl = null, musicStarting = false, fadeTimer = null;
  const buffers = {}, loading = {};

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function load(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    if (loading[name]) return loading[name];
    const file = C.SOUNDS[name];
    if (!file || !ctx) return Promise.resolve(null);
    loading[name] = fetch(C.SOUND_DIR + file)
      .then(r => r.arrayBuffer())
      .then(ab => new Promise((ok, fail) => ctx.decodeAudioData(ab, ok, fail)))
      .then(b => (buffers[name] = b))
      .catch(() => null);
    return loading[name];
  }

  async function play(name) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const buf = await load(name);
    if (!buf) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = (C.VOLUME && C.VOLUME[name]) || 0.7;
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  }

  // Se llama en el primer toque del usuario (los navegadores bloquean el audio antes).
  function unlock() {
    if (!ensure()) return;
    Object.keys(C.SOUNDS).forEach(load);
    if (wantMusic) startMusic();
  }

  function fadeTo(target, done) {
    clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
      if (!musicEl) return clearInterval(fadeTimer);
      const d = target - musicEl.volume;
      if (Math.abs(d) < 0.02) {
        musicEl.volume = target;
        clearInterval(fadeTimer);
        if (done) done();
      } else {
        musicEl.volume = Math.min(1, Math.max(0, musicEl.volume + Math.sign(d) * 0.02));
      }
    }, 60);
  }

  async function startMusic() {
    wantMusic = true;
    if (musicStarting) return;
    try {
      if (!musicEl) {
        musicStarting = true;
        const r = await fetch(C.SOUND_DIR + C.MUSIC);
        const blob = await r.blob();           // blob: evita problemas de "Range" al estar sin conexión
        musicEl = new Audio(URL.createObjectURL(blob));
        musicEl.loop = true;
        musicEl.volume = 0;
      }
      await musicEl.play();
      fadeTo(C.MUSIC_VOLUME);
    } catch (e) { /* si el navegador la bloquea, se reintenta con el próximo toque */ }
    finally { musicStarting = false; }
  }

  function stopMusic() {
    wantMusic = false;
    if (!musicEl) return;
    fadeTo(0, () => musicEl && musicEl.pause());
  }

  document.addEventListener("visibilitychange", () => {
    if (!musicEl) return;
    if (document.hidden) musicEl.pause();
    else if (wantMusic && enabled) musicEl.play().catch(() => {});
  });

  return {
    play, unlock, startMusic, stopMusic,
    setEnabled(v) {
      enabled = !!v;
      if (!enabled && musicEl) musicEl.pause();
      else if (enabled && wantMusic) startMusic();
    },
    setWantMusic(v) { wantMusic = !!v; }
  };
})();
