/* Gigantografía Seven — CRM  ·  conecta con la base nota-venta-seven (Supabase) */
(function () {
  "use strict";
  const CFG = window.SEVEN_CONFIG;
  const APP_VERSION = "2026-10-03 i";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  if (!window.supabase || !window.supabase.createClient) {
    document.body.innerHTML = '<p style="padding:30px">No se pudo cargar la librería de conexión. Recarga la página.</p>';
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } }
  });

  /* ---------- utilidades ---------- */
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const x = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : 0; };
  const r2 = (x) => Math.round(x * 100) / 100;
  const money = (v) => "Bs " + num(v).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad6 = (n) => String(n).padStart(6, "0");
  const tz = CFG.zonaHoraria;
  function hoyISO() { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
  function hoyDMY() { const [y, m, d] = hoyISO().split("-"); return d + "/" + m + "/" + y; }
  function parseDMY(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }
  function docDate(r) { return parseDMY(r.fecha) || (r.created_at ? new Date(r.created_at) : null); }
  const monthKey = (d) => d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") : "";
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const fmtISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (s || "—"); };
  const items = (r) => (Array.isArray(r.items) ? r.items : []);
  const itemsTotal = (arr) => r2(arr.reduce((a, it) => a + num(it.cant) * num(it.pu), 0));
  const phoneDigits = (t) => String(t || "").replace(/\D/g, "");
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg, kind) {
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    $("#toastStack").appendChild(el);
    setTimeout(() => el.remove(), kind === "err" ? 6000 : 3200);
  }
  function errMsg(e) { return (e && (e.message || e.error_description)) || "Error inesperado"; }

  /* ---------- estado ---------- */
  const S = { user: null, notas: [], cots: [], loaded: false, view: null, ui: {}, charts: [] };
  const ROLES = { administrador: "Administrador", editor: "Editor", cotizador: "Cotizador" };
  const ESTADOS = [
    { id: "pendiente", label: "Pendiente", pill: "p-amber" },
    { id: "produccion", label: "En producción", pill: "p-blue" },
    { id: "terminado", label: "Terminado", pill: "p-teal" },
    { id: "entregado", label: "Entregado", pill: "p-green" }
  ];
  const estadoOf = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0];
  const IVA = 0.13;
  const FORMAS = ["EFECTIVO", "QR", "TRANSFERENCIA", "DEPÓSITO", "TARJETA", "MIXTO"];

  const ICON = {
    panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    notas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    cots: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12.5 12.5 20 4 11.5V4h7.5L20 12.5Z"/><circle cx="8" cy="8" r="1.4"/></svg>',
    clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c1-3.8 3.8-6 6.5-6s5.5 2.2 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15.8 14.3c2.3.4 4.2 2.3 4.9 5.7"/></svg>',
    prod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/></svg>',
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M12 20V4M20 20v-7M2 20h20"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/></svg>',
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
  };
  const MODULES = {
    notas: { label: "Notas de venta", icon: ICON.notas, roles: ["administrador", "editor"] },
    cots: { label: "Cotizaciones", icon: ICON.cots, roles: ["administrador", "editor", "cotizador"] },
    clientes: { label: "Clientes", icon: ICON.clientes, roles: ["administrador", "editor", "cotizador"] },
    prod: { label: "Producción", icon: ICON.prod, roles: ["administrador", "editor"] },
    stats: { label: "Estadísticas", icon: ICON.stats, roles: ["administrador"] },
    users: { label: "Usuarios", icon: ICON.users, roles: ["administrador"] },
    log: { label: "Accesos", icon: ICON.log, roles: ["administrador"] },
    config: { label: "Configurar", icon: ICON.config, roles: ["administrador"] }
  };
  const can = (mod) => S.user && MODULES[mod] && MODULES[mod].roles.includes(S.user.rol);
  const isAdmin = () => S.user && S.user.rol === "administrador";

  /* ---------- modal / confirm ---------- */
  function openModal(title, html, wide) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    $(".modal-box").classList.toggle("wide", !!wide);
    $("#modal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() { $("#modal").hidden = true; $("#modalBody").innerHTML = ""; document.body.style.overflow = ""; }
  function confirmBox(text, okLabel) {
    return new Promise((res) => {
      openModal("Confirmar", '<p style="margin:0 0 6px">' + esc(text) + '</p><div class="modal-actions"><button class="btn" data-act="cf-no">Cancelar</button><button class="btn btn-primary" data-act="cf-yes">' + esc(okLabel || "Aceptar") + "</button></div>");
      const h = (e) => {
        const b = e.target.closest("[data-act]"); if (!b) return;
        if (b.dataset.act === "cf-yes" || b.dataset.act === "cf-no") { document.removeEventListener("click", h, true); closeModal(); res(b.dataset.act === "cf-yes"); }
      };
      document.addEventListener("click", h, true);
    });
  }

  /* ---------- auditoría de accesos ---------- */
  async function logAcceso(accion, detalle, usuario) {
    try { await sb.from("accesos").insert({ usuario: usuario || (S.user && S.user.usuario) || null, accion, detalle: detalle || null }); } catch (e) { /* no bloquear */ }
  }

  /* ---------- autenticación ---------- */
  function saveSession() { try { sessionStorage.setItem("seven-user", JSON.stringify(S.user)); } catch (e) {} }
  function loadSession() { try { return JSON.parse(sessionStorage.getItem("seven-user") || "null"); } catch (e) { return null; } }

  async function doLogin(usuario, password) {
    usuario = String(usuario || "").trim();
    // el nombre de usuario se resuelve sin distinguir mayúsculas/minúsculas
    const like = usuario.replace(/[\\%_]/g, (c) => "\\" + c);
    const { data: cands, error: e0 } = await sb.from("usuarios").select("id,usuario,nombre,rol,activo,bloqueado,intentos_fallidos").ilike("usuario", like);
    if (e0) throw new Error("No se pudo consultar usuarios: " + errMsg(e0));
    const list = cands || [];
    const u = list.find((x) => x.usuario === usuario) || (list.length === 1 ? list[0] : null);
    const real = u ? u.usuario : usuario;
    const { data, error } = await sb.rpc("login_usuario", { p_usuario: real, p_password: password });
    if (error) throw new Error("Error de conexión con la base: " + errMsg(error));
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.ok && u) {
      if (u.intentos_fallidos) await sb.from("usuarios").update({ intentos_fallidos: 0 }).eq("id", u.id);
      return { usuario: u.usuario, nombre: u.nombre || u.usuario, rol: u.rol || "editor", id: u.id };
    }
    if (u && u.bloqueado) throw new Error("Cuenta bloqueada. Contacta al administrador.");
    if (u && u.activo === false) throw new Error("Usuario desactivado. Contacta al administrador.");
    if (u) {
      const n = (u.intentos_fallidos || 0) + 1;
      const patch = { intentos_fallidos: n };
      if (n >= CFG.maxIntentos) { patch.bloqueado = true; patch.activo = false; }
      await sb.from("usuarios").update(patch).eq("id", u.id);
      await logAcceso("login_fallido", "intento " + n, usuario);
      if (n >= CFG.maxIntentos) throw new Error("Demasiados intentos. La cuenta fue bloqueada.");
      throw new Error("Usuario o contraseña incorrectos. Intentos restantes: " + (CFG.maxIntentos - n));
    }
    throw new Error("Usuario o contraseña incorrectos.");
  }

  let idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    if (!S.user) return;
    idleTimer = setTimeout(() => logout("cierre_por_inactividad"), CFG.minutosInactividad * 60000);
  }
  ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, debounce(resetIdle, 400), { passive: true }));

  async function logout(motivo) {
    const u = S.user;
    if (u) await logAcceso(motivo === "cierre_por_inactividad" ? "cierre_por_inactividad" : "logout", null, u.usuario);
    S.user = null; S.loaded = false;
    try { sessionStorage.removeItem("seven-user"); } catch (e) {}
    stopRealtime();
    clearTimeout(idleTimer);
    closeModal();
    showLogin(motivo === "cierre_por_inactividad" ? "Sesión cerrada por inactividad." : "");
  }

  function showLogin(msg) {
    $("#boot").hidden = true; $("#app-view").hidden = true; $("#login-view").hidden = false;
    const e = $("#loginError"); e.hidden = !msg; e.textContent = msg || "";
    $("#uPass").value = "";
    setTimeout(() => $("#uUser").focus(), 50);
  }

  /* ---------- datos ---------- */
  async function loadData() {
    const [n, c] = await Promise.all([
      sb.from("notas").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("cotizaciones").select("*").order("created_at", { ascending: false }).limit(5000)
    ]);
    if (n.error) throw n.error;
    if (c.error) throw c.error;
    S.notas = n.data || []; S.cots = c.data || []; S.loaded = true;
  }
  let rt = null;
  function startRealtime() {
    stopRealtime();
    const reload = debounce(async () => { try { await loadData(); renderView(true); } catch (e) {} }, 700);
    rt = sb.channel("seven-rt-" + Date.now())
      .on("postgres_changes", { event: "*", schema: "public", table: "notas" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "cotizaciones" }, reload)
      .subscribe((st) => {
        const chip = $("#liveChip"); if (!chip) return;
        const on = st === "SUBSCRIBED";
        chip.dataset.state = on ? "on" : "off";
        $(".txt", chip).textContent = on ? "En vivo" : "Sin conexión en vivo";
      });
  }
  function stopRealtime() { if (rt) { sb.removeChannel(rt); rt = null; } }

  /* ---------- shell ---------- */
  async function enterApp() {
    $("#boot").hidden = false; $("#login-view").hidden = true;
    try { await loadData(); } catch (e) { toast("No se pudieron cargar los datos: " + errMsg(e), "err"); }
    $("#boot").hidden = true; $("#app-view").hidden = false;
    $("#userAv").textContent = (S.user.nombre || "?").trim().charAt(0).toUpperCase();
    $("#userName").textContent = S.user.nombre;
    $("#sideFoot").innerHTML = "<b>" + esc(S.user.nombre) + "</b>" + esc(ROLES[S.user.rol] || S.user.rol) + '<div style="margin-top:6px;opacity:.55;font-size:11px">Versión ' + APP_VERSION + "</div>";
    buildNav();
    startRealtime(); resetIdle();
    go(can("notas") ? "notas" : "cots");
  }
  function buildNav() {
    const btn = (k) => '<button class="nav-btn" data-act="nav" data-mod="' + k + '">' + MODULES[k].icon + "<span>" + MODULES[k].label + "</span></button>";
    const main = Object.keys(MODULES).filter((k) => k !== "config" && can(k)).map(btn).join("");
    $("#sideNav").innerHTML = main + (can("config") ? btn("config") : "");
  }
  function go(mod) {
    if (!can(mod)) mod = can("notas") ? "notas" : "cots";
    S.view = mod;
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.mod === mod));
    $("#panelTitle").textContent = MODULES[mod].label;
    $("#sidebar").classList.remove("open"); $("#scrim").hidden = true;
    renderView();
  }
  function destroyCharts() { S.charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); S.charts = []; }
  function renderView(soft) {
    if (!S.user) return;
    // refresco en vivo: no pisar formularios abiertos
    if (soft && !$("#modal").hidden) return;
    destroyCharts();
    const v = { config: vConfig, notas: vNotas, cots: vCots, clientes: vClientes, prod: vProd, stats: vStats, users: vUsers, log: vLog }[S.view];
    if (v) v();
  }
  const content = () => $("#content");

  /* ============================ HELPERS DE ESTADO ============================ */
  const debe = (n) => r2(Math.max(num(n.saldo), num(n.total) - num(n.a_cuenta)));
  function pillEstado(id) { const e = estadoOf(id); return '<span class="pill ' + e.pill + '">' + e.label + "</span>"; }
  function pillPago(n) {
    const total = num(n.total), saldo = debe(n);
    if (total > 0 && saldo <= 0.005) return '<span class="pill p-green">Pagado</span>';
    if (num(n.a_cuenta) > 0) return '<span class="pill p-amber">Abonado</span>';
    return '<span class="pill p-red">Sin pago</span>';
  }
  function isLate(n) { return n.estado_produccion !== "entregado" && n.fecha_entrega && n.fecha_entrega < hoyISO(); }

  const pillEstadoText = (id) => estadoOf(id).label;
  function kpi(l, v, s, cls) { return '<div class="card kpi ' + (cls || "") + '"><div class="k-lbl">' + l + '</div><div class="k-val">' + v + '</div><div class="k-sub">' + s + "</div></div>"; }
  function chartOpts(extra) {
    return Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + money(c.parsed.y != null && c.chart.config.options.indexAxis !== "y" ? c.parsed.y : c.parsed.x != null ? c.parsed.x : c.parsed) } } },
      scales: { y: { beginAtZero: true, grid: { color: "#e5f1f4" }, ticks: { color: "#6b8a92" } }, x: { grid: { display: false }, ticks: { color: "#6b8a92" } } } }, extra || {});
  }

  /* ====================== LISTAS: NOTAS / COTIZACIONES ====================== */
  const searchBox = (id, ph, val) => '<div class="search">' + ICON.search + '<input class="inp" id="' + id + '" type="search" placeholder="' + ph + '" value="' + esc(val || "") + '"></div>';
  const PAGE = 25;
  function pager(total, page) {
    const pages = Math.max(1, Math.ceil(total / PAGE));
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px;font-size:13px;color:var(--text-mute)"><span>' + total + ' registros</span><span><button class="btn btn-sm" data-act="pg" data-d="-1" ' + (page <= 1 ? "disabled" : "") + '>‹</button> Página ' + page + " de " + pages + ' <button class="btn btn-sm" data-act="pg" data-d="1" ' + (page >= pages ? "disabled" : "") + ">›</button></span></div>";
  }

  function vNotas() {
    const u = S.ui.notas = S.ui.notas || { q: "", estado: "", pago: "", page: 1 };
    content().innerHTML =
      '<div class="toolbar">' + searchBox("fQ", "Buscar por cliente, número, teléfono…", u.q) +
      '<select class="inp" id="fEstado" style="width:auto"><option value="">Todos los estados</option>' + ESTADOS.map((e) => '<option value="' + e.id + '"' + (u.estado === e.id ? " selected" : "") + ">" + e.label + "</option>").join("") + "</select>" +
      '<select class="inp" id="fPago" style="width:auto"><option value="">Todo pago</option><option value="pagado"' + (u.pago === "pagado" ? " selected" : "") + '>Pagadas</option><option value="saldo"' + (u.pago === "saldo" ? " selected" : "") + '>Con saldo</option></select>' +
      '<button class="btn btn-primary" data-act="new-nota">+ Nueva nota</button></div><div id="listHost"></div>';
    const draw = () => {
      const q = norm(u.q);
      let rows = S.notas.filter((n) => {
        if (u.estado && n.estado_produccion !== u.estado) return false;
        const pagada = n.pagado_total || (num(n.total) > 0 && num(n.saldo) <= 0);
        if (u.pago === "pagado" && !pagada) return false;
        if (u.pago === "saldo" && pagada) return false;
        if (q && !norm([n.numero, n.cliente, n.telefono, n.nitci, n.usuario, n.observaciones].join(" ")).includes(q)) return false;
        return true;
      });
      const pages = Math.max(1, Math.ceil(rows.length / PAGE)); if (u.page > pages) u.page = pages;
      const total = rows.length; rows = rows.slice((u.page - 1) * PAGE, u.page * PAGE);
      $("#listHost").innerHTML = rows.length
        ? '<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th class="hide-m">Fecha</th><th class="num">Total</th><th class="num hide-m">Saldo</th><th>Pago</th><th>Estado</th><th class="hide-m">Entrega</th><th></th></tr></thead><tbody>' +
          rows.map((n) => '<tr><td class="t-id">' + esc(n.numero) + '</td><td><div class="t-main">' + esc(n.cliente) + '</div><div class="t-sub">' + esc(n.telefono || "") + (n.factura === "CON FACTURA" ? " · Factura" : "") + '</div></td><td class="hide-m">' + esc(n.fecha) + '</td><td class="num"><b>' + money(n.total) + '</b></td><td class="num hide-m ' + (num(n.saldo) > 0 ? "money-neg" : "") + '">' + money(n.saldo) + "</td><td>" + pillPago(n) + "</td><td>" + pillEstado(n.estado_produccion) + '</td><td class="hide-m ' + (isLate(n) ? "late" : "") + '">' + fmtISO(n.fecha_entrega) + '</td><td><div class="row-actions">' +
            '<button class="btn btn-sm" data-act="view-nota" data-id="' + n.id + '">Ver</button><button class="btn btn-sm" data-act="pdf-nota" data-id="' + n.id + '">PDF</button></div></td></tr>').join("") +
          "</tbody></table></div>" + pager(total, u.page)
        : '<div class="table-wrap"><div class="empty">No hay notas con esos filtros.</div></div>';
    };
    S.redraw = draw; draw();
    $("#fQ").addEventListener("input", debounce((e) => { u.q = e.target.value; u.page = 1; draw(); }, 200));
    $("#fEstado").addEventListener("change", (e) => { u.estado = e.target.value; u.page = 1; draw(); });
    $("#fPago").addEventListener("change", (e) => { u.pago = e.target.value; u.page = 1; draw(); });
  }

  function vCots() {
    const u = S.ui.cots = S.ui.cots || { q: "", page: 1 };
    content().innerHTML = '<div class="toolbar">' + searchBox("fQ", "Buscar por cliente, número, teléfono…", u.q) + '<button class="btn btn-primary" data-act="new-cot">+ Nueva cotización</button></div><div id="listHost"></div>';
    const convertidas = new Set(S.notas.map((n) => (/Cotizaci[oó]n N[º°o]\s*(\d+)/i.exec(n.observaciones || "") || [])[1]).filter(Boolean));
    const draw = () => {
      const q = norm(u.q);
      let rows = S.cots.filter((c) => !q || norm([c.numero, c.cliente, c.telefono, c.usuario].join(" ")).includes(q));
      const total = rows.length; const pages = Math.max(1, Math.ceil(total / PAGE)); if (u.page > pages) u.page = pages;
      rows = rows.slice((u.page - 1) * PAGE, u.page * PAGE);
      $("#listHost").innerHTML = rows.length
        ? '<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th class="hide-m">Fecha</th><th class="num">Total</th><th class="hide-m">Entrega</th><th class="hide-m">Validez</th><th>Estado</th><th></th></tr></thead><tbody>' +
          rows.map((c) => { const conv = convertidas.has(c.numero); return '<tr><td class="t-id">' + esc(c.numero) + '</td><td><div class="t-main">' + esc(c.cliente) + '</div><div class="t-sub">' + esc(c.telefono || "") + " · " + esc(c.usuario || "") + '</div></td><td class="hide-m">' + (c.created_at ? fmtISO(c.created_at.slice(0, 10)) : "—") + '</td><td class="num"><b>' + money(c.total) + '</b></td><td class="hide-m">' + esc(c.entrega || "—") + '</td><td class="hide-m">' + (c.validez ? esc(c.validez) + " días" : "—") + "</td><td>" + (conv ? '<span class="pill p-green">Convertida</span>' : '<span class="pill p-gray">Abierta</span>') + '</td><td><div class="row-actions">' +
            '<button class="btn btn-sm" data-act="edit-cot" data-id="' + c.id + '">Editar</button><button class="btn btn-sm" data-act="pdf-cot" data-id="' + c.id + '">PDF</button>' + (can("notas") && !conv ? '<button class="btn btn-sm btn-primary" data-act="conv-cot" data-id="' + c.id + '">→ Nota</button>' : "") + "</div></td></tr>"; }).join("") +
          "</tbody></table></div>" + pager(total, u.page)
        : '<div class="table-wrap"><div class="empty">No hay cotizaciones.</div></div>';
    };
    S.redraw = draw; draw();
    $("#fQ").addEventListener("input", debounce((e) => { u.q = e.target.value; u.page = 1; draw(); }, 200));
  }

  /* ============================ CLIENTES (CRM) ============================ */
  function buildClientes() {
    const map = new Map();
    const keyOf = (r) => { const p = phoneDigits(r.telefono); return p.length >= 6 ? "t" + p : "n" + norm(r.cliente); };
    const touch = (r, kind) => {
      const k = keyOf(r); if (k === "n") return;
      let c = map.get(k);
      if (!c) { c = { key: k, nombre: r.cliente, telefono: r.telefono || "", nitci: "", notas: [], cots: [], ultima: null }; map.set(k, c); }
      const d = docDate(r);
      if (d && (!c.ultima || d > c.ultima)) { c.ultima = d; c.nombre = r.cliente || c.nombre; if (r.telefono) c.telefono = r.telefono; }
      if (r.nitci && !c.nitci) c.nitci = r.nitci;
      (kind === "n" ? c.notas : c.cots).push(r);
    };
    S.notas.forEach((r) => touch(r, "n")); S.cots.forEach((r) => touch(r, "c"));
    return Array.from(map.values()).map((c) => Object.assign(c, {
      comprado: c.notas.reduce((a, n) => a + num(n.total), 0),
      saldo: c.notas.reduce((a, n) => a + Math.max(0, num(n.saldo)), 0)
    }));
  }
  function vClientes() {
    const u = S.ui.cli = S.ui.cli || { q: "", orden: "reciente", page: 1 };
    const all = buildClientes();
    content().innerHTML = '<div class="toolbar">' + searchBox("fQ", "Buscar cliente o teléfono…", u.q) +
      '<select class="inp" id="fOrden" style="width:auto"><option value="comprado"' + (u.orden === "comprado" ? " selected" : "") + '>Mayor compra</option><option value="saldo"' + (u.orden === "saldo" ? " selected" : "") + '>Mayor deuda</option><option value="reciente"' + (u.orden === "reciente" ? " selected" : "") + '>Último cliente primero</option><option value="nombre"' + (u.orden === "nombre" ? " selected" : "") + '>Nombre A–Z</option></select>' +
      '<span class="t-sub">' + all.length + " clientes</span></div><div id=\"listHost\"></div>";
    const draw = () => {
      const q = norm(u.q);
      let rows = all.filter((c) => !q || norm(c.nombre + " " + c.telefono).includes(q));
      const cmp = { comprado: (a, b) => b.comprado - a.comprado, saldo: (a, b) => b.saldo - a.saldo, reciente: (a, b) => (b.ultima || 0) - (a.ultima || 0), nombre: (a, b) => norm(a.nombre).localeCompare(norm(b.nombre)) }[u.orden];
      rows.sort(cmp);
      const total = rows.length; const pages = Math.max(1, Math.ceil(total / PAGE)); if (u.page > pages) u.page = pages;
      rows = rows.slice((u.page - 1) * PAGE, u.page * PAGE);
      $("#listHost").innerHTML = rows.length
        ? '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="hide-m">Teléfono</th><th class="num">Notas</th><th class="num hide-m">Cotiz.</th><th class="num">Total comprado</th><th class="num">Saldo</th><th class="hide-m">Última</th><th></th></tr></thead><tbody>' +
          rows.map((c) => '<tr><td class="t-main">' + esc(c.nombre) + '</td><td class="hide-m">' + esc(c.telefono || "—") + '</td><td class="num">' + c.notas.length + '</td><td class="num hide-m">' + c.cots.length + '</td><td class="num"><b>' + money(c.comprado) + '</b></td><td class="num ' + (c.saldo > 0 ? "money-neg" : "") + '">' + money(c.saldo) + '</td><td class="hide-m">' + (c.ultima ? c.ultima.toLocaleDateString("es-BO") : "—") + '</td><td><div class="row-actions"><button class="btn btn-sm" data-act="cli" data-key="' + esc(c.key) + '">Ficha</button></div></td></tr>').join("") +
          "</tbody></table></div>" + pager(total, u.page)
        : '<div class="table-wrap"><div class="empty">Sin clientes.</div></div>';
    };
    S.redraw = draw; draw();
    $("#fQ").addEventListener("input", debounce((e) => { u.q = e.target.value; u.page = 1; draw(); }, 200));
    $("#fOrden").addEventListener("change", (e) => { u.orden = e.target.value; u.page = 1; draw(); });
  }
  function fichaCliente(key) {
    const c = buildClientes().find((x) => x.key === key); if (!c) return;
    const p = phoneDigits(c.telefono); const wa = p.length === 8 ? "591" + p : p;
    const hist = c.notas.map((n) => ({ t: "Nota", r: n, d: docDate(n) })).concat(c.cots.map((x) => ({ t: "Cotización", r: x, d: docDate(x) }))).sort((a, b) => (b.d || 0) - (a.d || 0));
    openModal("Ficha de cliente",
      '<div class="cli-head"><div class="cli-av">' + esc((c.nombre || "?").charAt(0).toUpperCase()) + '</div><div><h3 style="font-size:20px">' + esc(c.nombre) + '</h3><div class="t-sub">' + esc(c.telefono || "Sin teléfono") + (c.nitci ? " · NIT/CI " + esc(c.nitci) : "") + "</div></div></div>" +
      '<div class="grid g-kpi" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' + kpi("Comprado", money(c.comprado), c.notas.length + " notas") + kpi("Saldo", money(c.saldo), c.saldo > 0 ? "por cobrar" : "al día") + kpi("Cotizaciones", String(c.cots.length), "emitidas") + "</div>" +
      '<div class="hist-list">' + (hist.map((h) => '<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line-2)"><div><span class="t-id">' + esc(h.r.numero) + '</span> <span class="pill p-gray">' + h.t + '</span><div class="t-sub">' + esc(h.r.fecha || (h.r.created_at || "").slice(0, 10)) + " · " + esc(items(h.r).map((i) => i.detalle).join(", ").slice(0, 70)) + '</div></div><b>' + money(h.r.total) + "</b></div>").join("") || '<div class="empty">Sin historial</div>') + "</div>" +
      '<div class="modal-actions">' + (p ? '<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">WhatsApp</a>' : "") + '<button class="btn" data-act="new-cot" data-cli="' + esc(key) + '">+ Cotización</button>' + (can("notas") ? '<button class="btn btn-primary" data-act="new-nota" data-cli="' + esc(key) + '">+ Nota</button>' : "") + "</div>", true);
    S.fichaCli = c;
  }

  /* ====================== FORMULARIO NOTA / COTIZACIÓN ====================== */
  const getNota = (id) => S.notas.find((n) => n.id === id);
  const getCot = (id) => S.cots.find((c) => c.id === id);

  function itemRowHTML(it) {
    it = it || {};
    return '<div class="item-row"><input class="inp it-cant" inputmode="decimal" placeholder="Cant." value="' + esc(it.cant || "") + '"><input class="inp it-det detalle" placeholder="Detalle (ej. Banner 150x100 cm)" value="' + esc(it.detalle || "") + '"><input class="inp it-pu" inputmode="decimal" placeholder="P. unit." value="' + esc(it.pu || "") + '"><div class="sub">Bs 0.00</div><button type="button" class="rm" data-act="rm-item" aria-label="Quitar">×</button></div>';
  }
  function imgField(id, label, url) {
    return '<div class="field"><label>' + label + '</label><input type="file" id="' + id + '" accept="image/*" class="inp">' + (url ? '<img class="thumb" src="' + esc(url) + '" alt="">' : "") + "</div>";
  }

  function openDocForm(kind, rec, prefill) {
    const isNota = kind === "nota";
    const r = rec || prefill || {};
    const nombres = Array.from(new Set(S.notas.concat(S.cots).map((x) => x.cliente).filter(Boolean))).sort();
    const formaVal = r.forma_pago || "";
    const fv = formaVal.toUpperCase(); const formas = FORMAS.concat(formaVal && !FORMAS.includes(fv) ? [formaVal] : []);
    S.form = { kind, id: rec ? rec.id : null, prefill: prefill || null };
    const its = items(r).length ? items(r) : [{}];
    openModal((rec ? "Editar " : "Nueva ") + (isNota ? "nota de venta" : "cotización") + (rec ? " Nº " + rec.numero : ""),
      '<form id="docForm" novalidate><div class="form-grid">' +
      '<div class="field full"><label>Cliente *</label><input class="inp" id="fCliente" list="dlClientes" value="' + esc(r.cliente || "") + '" autocomplete="off"><datalist id="dlClientes">' + nombres.map((n) => '<option value="' + esc(n) + '">').join("") + "</datalist></div>" +
      '<div class="field"><label>Teléfono</label><input class="inp" id="fTel" inputmode="tel" value="' + esc(r.telefono || "") + '"></div>' +
      (isNota ? '<div class="field"><label>NIT / CI</label><input class="inp" id="fNit" value="' + esc(r.nitci || "") + '"></div>'
        : '<div class="field"><label>Validez (días)</label><input class="inp" id="fValidez" inputmode="numeric" value="' + esc(r.validez || "3") + '"></div>') +
      (isNota
        ? '<div class="field"><label>Factura</label><select class="inp" id="fFactura"><option>SIN FACTURA</option><option' + (r.factura === "CON FACTURA" ? " selected" : "") + ">CON FACTURA</option></select></div>" +
          '<div class="field"><label>Forma de pago (a cuenta)</label><select class="inp" id="fForma"><option value="">—</option>' + formas.map((f) => "<option" + (f.toUpperCase() === fv ? " selected" : "") + ">" + esc(f) + "</option>").join("") + "</select></div>" +
          '<div class="field"><label>Fecha de entrega</label><input class="inp" type="date" id="fEntrega" value="' + esc(r.fecha_entrega || "") + '"></div>'
        : '<div class="field"><label>Tiempo de entrega</label><input class="inp" id="fEntregaTxt" placeholder="ej. 5 días hábiles" value="' + esc(r.entrega || "") + '"></div>') +
      "</div>" +
      '<div class="lbl" style="margin-top:6px">Detalle</div><div class="items-head"><span>Cant.</span><span>Descripción</span><span>P. unit.</span><span style="text-align:right">Subtotal</span><span></span></div><div id="itemRows">' + its.map(itemRowHTML).join("") + "</div>" +
      '<button type="button" class="btn btn-sm" data-act="add-item">+ Agregar ítem</button>' +
      '<div class="totals">' + (isNota ? '' : "") + '<div class="tr"><span id="lTotal">Total</span><b id="tTotal">Bs 0.00</b></div>' +
      (isNota ? '<div class="tr"><span>A cuenta</span><input class="inp" id="fACuenta" inputmode="decimal" style="width:130px;text-align:right" value="' + esc(r.a_cuenta == null ? "" : r.a_cuenta) + '"></div><div class="tr big"><span>Saldo</span><span id="tSaldo">Bs 0.00</span></div>' : '<div class="tr big"><span>Total</span><span id="tTotal2">Bs 0.00</span></div>') + "</div>" +
      (isNota ? '<div class="field" style="margin-top:14px"><label>Observaciones</label><textarea class="inp" id="fObs">' + esc(r.observaciones || "") + "</textarea></div>" : "") +
      '<div class="form-grid" style="margin-top:8px">' + imgField("fImgMed", "Imagen de medidas", r.imagen_medidas_url) + imgField("fImgMon", "Imagen de montaje", r.imagen_montaje_url) + "</div>" +
      '<div class="modal-actions"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn btn-primary" id="docSave">Guardar</button></div></form>', true);
    recalc();
    $("#fCliente").addEventListener("change", (e) => {
      const m = S.notas.concat(S.cots).find((x) => x.cliente === e.target.value && x.telefono);
      if (m && !$("#fTel").value) { $("#fTel").value = m.telefono; const nit = $("#fNit"); if (nit && !nit.value && m.nitci) nit.value = m.nitci; }
    });
    $("#docForm").addEventListener("input", recalc);
    $("#docForm").addEventListener("submit", (e) => { e.preventDefault(); saveDoc(); });
  }
  function readItems() {
    return $$("#itemRows .item-row").map((row) => ({ cant: $(".it-cant", row).value.trim(), detalle: $(".it-det", row).value.trim(), pu: $(".it-pu", row).value.trim() })).filter((i) => i.detalle || num(i.cant) || num(i.pu));
  }
  function recalc() {
    let total = 0;
    $$("#itemRows .item-row").forEach((row) => { const s = num($(".it-cant", row).value) * num($(".it-pu", row).value); total += s; $(".sub", row).textContent = money(s); });
    total = r2(total);
    const fa = $("#fFactura");
    if (fa) { const con = fa.value === "CON FACTURA"; const iva = con ? r2(total * IVA) : 0; $("#lTotal").textContent = con ? "CON FACTURA" : "SIN FACTURA"; total = r2(total + iva); }
    const t = $("#tTotal"); if (t) t.textContent = money(total);
    const t2 = $("#tTotal2"); if (t2) t2.textContent = money(total);
    const ac = $("#fACuenta"); if (ac) { const s = $("#tSaldo"); const saldo = r2(total - num(ac.value)); s.textContent = money(saldo); s.style.color = saldo > 0 ? "var(--red)" : "var(--green)"; }
  }
  async function nextNumero(table) {
    const { data, error } = await sb.from(table).select("numero_int").order("numero_int", { ascending: false, nullsFirst: false }).limit(1);
    if (error) throw error;
    return ((data && data[0] && data[0].numero_int) || 0) + 1;
  }
  async function uploadImg(inputId, folder) {
    const f = $("#" + inputId) && $("#" + inputId).files[0]; if (!f) return null;
    if (f.size > 8 * 1024 * 1024) throw new Error("La imagen supera 8 MB.");
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await sb.storage.from(CFG.bucket).upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw error;
    return sb.storage.from(CFG.bucket).getPublicUrl(path).data.publicUrl;
  }

  async function saveDoc() {
    const { kind, id, prefill } = S.form; const isNota = kind === "nota";
    const cliente = $("#fCliente").value.trim();
    const its = readItems();
    if (!cliente) return toast("Escribe el nombre del cliente.", "err");
    if (!its.length || !its.some((i) => i.detalle && num(i.cant) > 0)) return toast("Agrega al menos un ítem con cantidad y detalle.", "err");
    const btn = $("#docSave"); btn.disabled = true; btn.textContent = "Guardando…";
    try {
      let total = itemsTotal(its);
      if (isNota && $("#fFactura").value === "CON FACTURA") total = r2(total + r2(total * IVA));
      const old = id ? (isNota ? getNota(id) : getCot(id)) : null;
      const imgM = await uploadImg("fImgMed", kind + "s"); const imgN = await uploadImg("fImgMon", kind + "s");
      const base = { cliente, telefono: $("#fTel").value.trim(), total, items: its, imagen_medidas_url: imgM || (old ? old.imagen_medidas_url : prefill && prefill.imagen_medidas_url) || null, imagen_montaje_url: imgN || (old ? old.imagen_montaje_url : prefill && prefill.imagen_montaje_url) || null };
      let rec;
      if (isNota) {
        const aCuenta = r2(Math.max(0, num($("#fACuenta").value))); const saldo = r2(total - aCuenta);
        rec = Object.assign(base, { nitci: $("#fNit").value.trim(), factura: $("#fFactura").value, forma_pago: $("#fForma").value, fecha_entrega: $("#fEntrega").value || null, observaciones: $("#fObs").value.trim(), a_cuenta: aCuenta, saldo, pagado_total: total > 0 && saldo <= 0, validez: old ? old.validez : (prefill && prefill.validez) || null });
      } else {
        rec = Object.assign(base, { validez: $("#fValidez").value.trim(), entrega: $("#fEntregaTxt").value.trim() });
      }
      const table = isNota ? "notas" : "cotizaciones";
      if (id) {
        const { error } = await sb.from(table).update(rec).eq("id", id); if (error) throw error;
        await logAcceso(isNota ? "nota_editada" : "cotizacion_editada", "Nº " + old.numero);
      } else {
        const n = await nextNumero(table);
        Object.assign(rec, { numero: pad6(n), numero_int: n, usuario: S.user.usuario });
        if (isNota) Object.assign(rec, { fecha: hoyDMY(), estado_produccion: "pendiente" });
        const { error } = await sb.from(table).insert(rec); if (error) throw error;
        await logAcceso(isNota ? "nota_guardada" : "cotizacion_guardada", "Nº " + pad6(n));
      }
      closeModal(); toast("Guardado correctamente.", "ok");
      await loadData(); renderView();
    } catch (e) {
      toast("No se pudo guardar: " + errMsg(e), "err"); btn.disabled = false; btn.textContent = "Guardar";
    }
  }

  /* ====================== DETALLE / ACCIONES NOTA ====================== */
  function viewNota(id) {
    const n = getNota(id); if (!n) return;
    const its = items(n);
    openModal("Nota de venta Nº " + n.numero,
      '<div class="detail"><dl><dt>Cliente</dt><dd>' + esc(n.cliente) + "</dd><dt>Teléfono</dt><dd>" + esc(n.telefono || "—") + "</dd><dt>NIT / CI</dt><dd>" + esc(n.nitci || "—") + "</dd><dt>Fecha</dt><dd>" + esc(n.fecha) + " · " + esc(n.usuario || "") + "</dd><dt>Factura</dt><dd>" + esc(n.factura || "—") + "</dd><dt>Método a cuenta</dt><dd>" + esc(n.forma_pago || "—") + "</dd>" + (n.forma_pago_saldo ? "<dt>Método del saldo</dt><dd>" + esc(n.forma_pago_saldo) + "</dd>" : "") + "<dt>Entrega</dt><dd class=\"" + (isLate(n) ? "late" : "") + '">' + fmtISO(n.fecha_entrega) + "</dd><dt>Estado</dt><dd>" + pillEstado(n.estado_produccion) + " " + pillPago(n) + "</dd>" + (n.observaciones ? "<dt>Observaciones</dt><dd>" + esc(n.observaciones).replace(/\n/g, "<br>") + "</dd>" : "") + "</dl></div>" +
      '<div class="table-wrap" style="margin:16px 0"><table><thead><tr><th class="num">Cant.</th><th>Detalle</th><th class="num">P. unit.</th><th class="num">Subtotal</th></tr></thead><tbody>' + its.map((i) => '<tr><td class="num">' + esc(i.cant) + "</td><td>" + esc(i.detalle) + '</td><td class="num">' + money(i.pu) + '</td><td class="num">' + money(num(i.cant) * num(i.pu)) + "</td></tr>").join("") + "</tbody></table></div>" +
      '<div class="totals"><div class="tr"><span>Total</span><b>' + money(n.total) + '</b></div><div class="tr"><span>A cuenta</span><span>' + money(n.a_cuenta) + '</span></div><div class="tr big"><span>Saldo</span><span class="' + (num(n.saldo) > 0 ? "money-neg" : "money-ok") + '">' + money(n.saldo) + "</span></div></div>" +
      ((n.imagen_medidas_url || n.imagen_montaje_url) ? '<div class="form-grid" style="margin-top:12px">' + [n.imagen_medidas_url, n.imagen_montaje_url].filter(Boolean).map((u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img class="thumb" style="max-height:200px" src="' + esc(u) + '" alt=""></a>').join("") + "</div>" : "") +
      '<div class="modal-actions"><select class="inp" style="width:auto" data-sel="estado" data-id="' + n.id + '">' + ESTADOS.map((e) => '<option value="' + e.id + '"' + (e.id === n.estado_produccion ? " selected" : "") + ">" + e.label + "</option>").join("") + "</select>" +
      (debe(n) > 0.005 ? '<button class="btn" data-act="pago-nota" data-id="' + n.id + '">Registrar pago</button>' : "") +
      '<button class="btn" data-act="pdf-nota" data-id="' + n.id + '">PDF</button><button class="btn" data-act="edit-nota" data-id="' + n.id + '">Editar</button>' + (isAdmin() ? '<button class="btn btn-danger" data-act="del-nota" data-id="' + n.id + '">Eliminar</button>' : "") + "</div>", true);
  }
  function pagoForm(id, entregar) {
    const n = getNota(id); if (!n) return;
    const deuda = debe(n);
    const fv = String(n.forma_pago || "").toUpperCase();
    const opts = '<option value="">— Selecciona —</option>' + FORMAS.map((f) => "<option>" + esc(f) + "</option>").join("");
    openModal((entregar ? "Entregar nota Nº " : "Registrar pago — Nº ") + n.numero,
      (entregar ? '<div class="login-error" role="alert" style="margin-bottom:14px"><b>No se puede entregar todavía.</b> La nota tiene un saldo pendiente de ' + money(deuda) + ". Cobra el saldo completo para poder marcarla como entregada.</div>" : "") +
      '<div class="table-wrap" style="margin-bottom:16px"><table><tbody>' +
      '<tr><td>Total</td><td class="num"><b>' + money(n.total) + "</b></td><td></td></tr>" +
      '<tr><td>A cuenta</td><td class="num">' + money(n.a_cuenta) + '</td><td><span class="pill p-teal">' + esc(n.forma_pago || "Sin método") + "</span></td></tr>" +
      (n.forma_pago_saldo ? '<tr><td>Pagos posteriores</td><td></td><td><span class="pill p-teal">' + esc(n.forma_pago_saldo) + "</span></td></tr>" : "") +
      '<tr><td>Saldo pendiente</td><td class="num money-neg"><b>' + money(deuda) + "</b></td><td></td></tr></tbody></table></div>" +
      '<form id="pagoForm"><div class="form-grid"><div class="field"><label>Pago del saldo (Bs)</label><input class="inp" id="pMonto" inputmode="decimal" value="' + esc(deuda) + '"></div>' +
      '<div class="field"><label>Método de pago del saldo *</label><select class="inp" id="pForma">' + opts + "</select></div></div>" +
      '<div class="modal-actions"><button type="button" class="btn" data-act="close">Cancelar</button>' +
      '<button class="btn btn-primary" type="submit">' + (entregar ? "Cobrar saldo y entregar" : "Registrar pago") + "</button></div></form>");
    $("#pagoForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = num($("#pMonto").value), met = $("#pForma").value;
      if (m <= 0) return toast("Ingresa un monto válido.", "err");
      if (!met) return toast("Selecciona el método de pago del saldo.", "err");
      if (entregar && m < deuda - 0.005) return toast("Para entregar debes cobrar el saldo completo (" + money(deuda) + ").", "err");
      const aCuenta = r2(num(n.a_cuenta) + m); const saldo = r2(num(n.total) - aCuenta);
      const prev = n.forma_pago_saldo || "";
      const patch = { a_cuenta: aCuenta, saldo: Math.max(0, saldo), pagado_total: saldo <= 0, forma_pago_saldo: prev && !prev.split(" + ").includes(met) ? prev + " + " + met : (prev || met) };
      if (!n.forma_pago) patch.forma_pago = met;
      if (entregar) patch.estado_produccion = "entregado";
      const { error } = await sb.from("notas").update(patch).eq("id", id);
      if (error) return toast("No se pudo registrar: " + errMsg(error), "err");
      await logAcceso("pago_saldo", ["Nº " + n.numero, m.toFixed(2), met, n.cliente, n.id].join(" | "));
      if (entregar) await logAcceso("estado_entregado", "Nº " + n.numero);
      closeModal(); toast(entregar ? "Pago registrado y nota entregada." : "Pago registrado.", "ok"); await loadData(); renderView();
    });
  }
  async function setEstado(id, estado) {
    const n0 = getNota(id);
    if (estado === "entregado" && n0 && debe(n0) > 0.005) return pagoForm(id, true);
    const { error } = await sb.from("notas").update({ estado_produccion: estado }).eq("id", id);
    if (error) return toast("No se pudo cambiar el estado: " + errMsg(error), "err");
    const n = getNota(id); if (n) n.estado_produccion = estado;
    await logAcceso("estado_" + estado, "Nº " + (n ? n.numero : ""));
    toast("Estado: " + estadoOf(estado).label, "ok"); renderView(); if (!$("#modal").hidden && n) viewNota(id);
  }
  async function deleteDoc(kind, id) {
    const r = kind === "nota" ? getNota(id) : getCot(id); if (!r) return;
    if (!(await confirmBox("¿Eliminar " + (kind === "nota" ? "la nota" : "la cotización") + " Nº " + r.numero + " de " + r.cliente + "? Esta acción no se puede deshacer.", "Eliminar"))) return;
    const { error } = await sb.from(kind === "nota" ? "notas" : "cotizaciones").delete().eq("id", id);
    if (error) return toast("No se pudo eliminar: " + errMsg(error), "err");
    await logAcceso(kind + "_eliminada", "Nº " + r.numero + " · " + r.cliente);
    toast("Eliminada.", "ok"); await loadData(); renderView();
  }
  function convertirCot(id) {
    const c = getCot(id); if (!c) return;
    openDocForm("nota", null, { cliente: c.cliente, telefono: c.telefono, items: c.items, validez: c.validez, observaciones: "Convertido desde Cotización Nº " + c.numero, imagen_medidas_url: c.imagen_medidas_url, imagen_montaje_url: c.imagen_montaje_url });
  }

  /* ============================ PRODUCCIÓN ============================ */
  function vProd() {
    const u = S.ui.prod = S.ui.prod || { filtro: "pendiente", orden: "nuevo", q: "" };
    const FILTROS = [
      { id: "pendiente", label: "Pendientes", fn: (n) => (n.estado_produccion || "pendiente") === "pendiente" },
      { id: "produccion", label: "En producción", fn: (n) => n.estado_produccion === "produccion" },
      { id: "terminado", label: "Terminados", fn: (n) => n.estado_produccion === "terminado" },
      { id: "entregado", label: "Entregados", fn: (n) => n.estado_produccion === "entregado" },
      { id: "atrasado", label: "Atrasados", fn: (n) => isLate(n) },
      { id: "todos", label: "Todos", fn: () => true }
    ];
    content().innerHTML =
      '<div class="toolbar">' + searchBox("fQ", "Buscar cliente, número o detalle…", u.q) +
      '<select class="inp" id="fOrden" style="width:auto">' + [["nuevo", "Último creado primero"], ["viejo", "Primero creado primero"], ["asc", "Entrega: más próxima primero"], ["desc", "Entrega: más lejana primero"]].map((o) => '<option value="' + o[0] + '"' + (u.orden === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>" +
      '<div class="chips" id="chips"></div><div id="prodHost"></div>';
    const LIMITE = 30;
    const cmpFecha = (a, b) => String(a.fecha_entrega || "9999-99-99").localeCompare(String(b.fecha_entrega || "9999-99-99")) || (a.numero_int || 0) - (b.numero_int || 0);
    const draw = () => {
      const q = norm(u.q);
      const base = S.notas.filter((n) => !q || norm([n.numero, n.cliente, n.telefono, items(n).map((i) => i.detalle).join(" ")].join(" ")).includes(q));
      $("#chips").innerHTML = FILTROS.map((f) => '<button class="chip' + (u.filtro === f.id ? " on" : "") + (f.id === "atrasado" ? " warn" : "") + '" data-act="prod-f" data-f="' + f.id + '">' + f.label + " <b>" + base.filter(f.fn).length + "</b></button>").join("");
      const f = FILTROS.find((x) => x.id === u.filtro) || FILTROS[0];
      const cmpCreado = (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""));
      let rows = base.filter(f.fn);
      if (u.orden === "nuevo") rows.sort(cmpCreado); else if (u.orden === "viejo") rows.sort((a, b) => cmpCreado(b, a)); else { rows.sort(cmpFecha); if (u.orden === "desc") rows.reverse(); }
      const total = rows.length; rows = rows.slice(0, LIMITE);
      $("#prodHost").innerHTML = total ? '<div class="pgrid">' + rows.map((n) => {
        const i = ESTADOS.findIndex((e) => e.id === (n.estado_produccion || "pendiente"));
        return '<div class="kcard' + (isLate(n) ? " late-card" : "") + '"><div class="kc-top"><span class="t-id">' + esc(n.numero) + '</span><span class="' + (isLate(n) ? "late" : "t-sub") + '">' + (isLate(n) ? "Atrasada · " : "Entrega ") + fmtISO(n.fecha_entrega) + '</span></div><div class="kc-cli">' + esc(n.cliente) + '</div><div class="kc-meta">' + esc(items(n).map((x) => x.detalle).join(" · ").slice(0, 110)) + '</div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:6px"><span>' + pillEstado(n.estado_produccion) + " " + pillPago(n) + "</span><b>" + money(n.total) + '</b></div><div class="kc-btns">' +
          (i > 0 ? '<button class="btn" data-act="mv" data-id="' + n.id + '" data-to="' + ESTADOS[i - 1].id + '" title="Mover a ' + ESTADOS[i - 1].label + '">‹</button>' : "") + '<button class="btn" data-act="view-nota" data-id="' + n.id + '">Ver</button>' + (i < 3 ? '<button class="btn btn-primary" data-act="mv" data-id="' + n.id + '" data-to="' + ESTADOS[i + 1].id + '" title="Mover a ' + ESTADOS[i + 1].label + '">› ' + ESTADOS[i + 1].label + "</button>" : "") + "</div></div>";
      }).join("") + "</div>" + (total > LIMITE ? '<div class="t-sub" style="text-align:center;margin-top:16px">Mostrando las primeras ' + LIMITE + " de " + total + ". El resto sigue guardado en la base de datos; búscalo con el buscador o en Notas de venta.</div>" : "") : '<div class="table-wrap"><div class="empty">No hay notas en esta vista.</div></div>';
    };
    S.redraw = draw; draw();
    $("#fQ").addEventListener("input", debounce((e) => { u.q = e.target.value; draw(); }, 200));
    $("#fOrden").addEventListener("change", (e) => { u.orden = e.target.value; draw(); });
  }

  /* ============================ ESTADÍSTICAS ============================ */
  function vStatsGraficos() {
    const u = S.ui.stats = S.ui.stats || { rango: "12m" };
    const now = new Date(); let desde = null;
    if (u.rango === "12m") desde = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    else if (u.rango === "anio") desde = new Date(now.getFullYear(), 0, 1);
    else if (u.rango === "mes") desde = new Date(now.getFullYear(), now.getMonth(), 1);
    const inR = (r) => { const d = docDate(r); return !desde || (d && d >= desde); };
    const N = S.notas.filter(inR), C = S.cots.filter(inR);
    const ventas = N.reduce((a, n) => a + num(n.total), 0);
    const cobrado = N.reduce((a, n) => a + num(n.a_cuenta), 0);
    const convNums = new Set(S.notas.map((n) => (/Cotizaci[oó]n N[º°o]\s*(\d+)/i.exec(n.observaciones || "") || [])[1]).filter(Boolean));
    const convertidas = C.filter((c) => convNums.has(c.numero)).length;
    $("#stGr").innerHTML =
      '<h3 style="margin:26px 0 12px;font-size:18px">Resumen del período</h3><div class="toolbar"><select class="inp" id="fRango" style="width:auto"><option value="mes">Este mes</option><option value="12m">Últimos 12 meses</option><option value="anio">Este año</option><option value="todo">Todo el historial</option></select></div>' +
      '<div class="grid g-kpi">' + kpi("Ventas", money(ventas), N.length + " notas", "accent") + kpi("Ticket promedio", money(N.length ? ventas / N.length : 0), "por nota") + kpi("Cobrado", money(cobrado), ventas ? Math.round((cobrado / ventas) * 100) + "% de lo vendido" : "—") + kpi("Cotizaciones → nota", C.length ? Math.round((convertidas / C.length) * 100) + "%" : "—", convertidas + " de " + C.length) + "</div>" +
      '<div class="grid g-2"><div class="card"><h3>Ventas por mes</h3><div class="chart-box"><canvas id="c1"></canvas></div></div><div class="card"><h3>Forma de pago</h3><div class="chart-box"><canvas id="c2"></canvas></div></div></div>' +
      '<div class="grid g-2e" style="margin-top:18px"><div class="card"><h3>Top 10 clientes</h3><div class="chart-box"><canvas id="c3"></canvas></div></div><div class="card"><h3>Ventas por usuario</h3><div class="chart-box"><canvas id="c4"></canvas></div></div></div>';
    $("#fRango").value = u.rango; $("#fRango").addEventListener("change", (e) => { u.rango = e.target.value; renderView(); });
    const PAL = ["#28c4d2", "#068094", "#39abc1", "#8fe0ec", "#2b7c88", "#f0b440", "#d6454f", "#7c8fa0"];
    const byM = {}; N.forEach((n) => { const k = monthKey(docDate(n)); if (k) byM[k] = (byM[k] || 0) + num(n.total); });
    const ks = Object.keys(byM).sort();
    S.charts.push(new Chart($("#c1"), { type: "bar", data: { labels: ks.map((k) => MESES[+k.slice(5) - 1] + " " + k.slice(2, 4)), datasets: [{ data: ks.map((k) => r2(byM[k])), backgroundColor: "#28c4d2", borderRadius: 8, maxBarThickness: 40 }] }, options: chartOpts() }));
    const byF = {}; N.forEach((n) => { const k = n.forma_pago || "Sin definir"; byF[k] = (byF[k] || 0) + num(n.total); });
    S.charts.push(new Chart($("#c2"), { type: "doughnut", data: { labels: Object.keys(byF), datasets: [{ data: Object.values(byF).map(r2), backgroundColor: PAL, borderWidth: 2, borderColor: "#fff" }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => " " + c.label + ": " + money(c.parsed) } } } } }));
    const byC = {}; N.forEach((n) => { const k = n.cliente || "—"; byC[k] = (byC[k] || 0) + num(n.total); });
    const top = Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 10);
    S.charts.push(new Chart($("#c3"), { type: "bar", data: { labels: top.map((t) => t[0].slice(0, 22)), datasets: [{ data: top.map((t) => r2(t[1])), backgroundColor: "#068094", borderRadius: 6 }] }, options: chartOpts({ indexAxis: "y", scales: { x: { beginAtZero: true, grid: { color: "#e5f1f4" } }, y: { grid: { display: false } } } }) }));
    const byU = {}; N.forEach((n) => { const k = n.usuario || "—"; byU[k] = (byU[k] || 0) + num(n.total); });
    S.charts.push(new Chart($("#c4"), { type: "bar", data: { labels: Object.keys(byU), datasets: [{ data: Object.values(byU).map(r2), backgroundColor: PAL, borderRadius: 8, maxBarThickness: 50 }] }, options: chartOpts() }));
  }


  /* ============================ ESTADÍSTICAS ============================ */
  const ymdLocal = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ts));
  function docKey(r) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(r.fecha || "").trim());
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return r.created_at ? ymdLocal(r.created_at) : "";
  }
  const addDays = (iso, d) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const metodo = (m) => String(m || "").trim().toUpperCase() || "SIN MÉTODO";
  async function loadPagos() {
    const { data, error } = await sb.from("accesos").select("accion,detalle,fecha_hora,usuario").in("accion", ["pago_saldo", "pago_registrado"]).order("fecha_hora", { ascending: true }).limit(5000);
    if (error) throw error;
    return (data || []).map((r) => {
      let numero = "", monto = 0, met = "", cliente = "", id = "";
      if (r.detalle && r.detalle.includes(" | ")) { const p = r.detalle.split(" | "); numero = (p[0] || "").replace(/^Nº\s*/, ""); monto = num(p[1]); met = p[2] || ""; cliente = p[3] || ""; id = p[4] || ""; }
      else { const m = /Nº\s*(\d+)\s*·\s*Bs\s*([\d.,]+)\s*·\s*(.+)$/.exec(r.detalle || ""); if (m) { numero = m[1]; monto = num(m[2].replace(/\./g, "").replace(",", ".")); met = m[3]; } }
      return { numero, monto, metodo: metodo(met), cliente, id, ts: r.fecha_hora, dia: ymdLocal(r.fecha_hora), usuario: r.usuario };
    }).filter((x) => x.monto > 0);
  }
  const pagosDe = (n, pagos) => pagos.filter((p) => (p.id ? p.id === n.id : p.numero === n.numero));

  async function vStats() {
    const u = S.ui.st = S.ui.st || { modo: "hoy", fecha: "", tipo: "notas", q: "", soloDeuda: false };
    content().innerHTML = '<div class="empty">Cargando estadísticas…</div>';
    let pagos = [], avisoPagos = "";
    try { pagos = await loadPagos(); } catch (e) { avisoPagos = "No se pudo leer el registro de cobros: " + errMsg(e); }
    if (S.view !== "stats") return;
    const hoy = hoyISO(), ayer = addDays(hoy, -1);

    // saldo total por cobrar (todas las notas, estén o no entregadas)
    const deudoras = S.notas.filter((n) => debe(n) > 0.005);
    const totalDeuda = r2(deudoras.reduce((a, n) => a + debe(n), 0));
    const deudaEntregadas = deudoras.filter((n) => n.estado_produccion === "entregado").length;

    // cobros de hoy por método: a cuenta inicial de notas de hoy + saldos cobrados hoy
    const cob = {}; const add = (m, k, v) => { const key = metodo(m); cob[key] = cob[key] || { acuenta: 0, saldo: 0 }; cob[key][k] += v; };
    const notasHoy = S.notas.filter((n) => docKey(n) === hoy);
    notasHoy.forEach((n) => { const cobrado = pagosDe(n, pagos).reduce((a, p) => a + p.monto, 0); const inicial = Math.max(0, num(n.a_cuenta) - cobrado); if (inicial > 0) add(n.forma_pago, "acuenta", inicial); });
    pagos.filter((p) => p.dia === hoy).forEach((p) => add(p.metodo, "saldo", p.monto));
    const filasCob = Object.keys(cob).sort();
    const totCob = filasCob.reduce((a, k) => a + cob[k].acuenta + cob[k].saldo, 0);
    const cotsHoy = S.cots.filter((c) => docKey(c) === hoy).length;

    content().innerHTML =
      (avisoPagos ? '<div class="login-error" style="margin-bottom:14px">' + esc(avisoPagos) + "</div>" : "") +
      '<div class="grid g-kpi">' +
      kpi("Saldo total por cobrar", money(totalDeuda), "de todas las notas de venta", "accent") +
      kpi("Notas con deuda", String(deudoras.length), deudaEntregadas + " ya entregadas · " + (deudoras.length - deudaEntregadas) + " en proceso") +
      kpi("Cobrado hoy", money(totCob), filasCob.length ? filasCob.join(" · ") : "sin cobros hoy") +
      kpi("Hoy se hicieron", notasHoy.length + " notas", cotsHoy + " cotizaciones") + "</div>" +
      '<div class="grid g-2e"><div class="card"><h3>Cobros de hoy por método de pago</h3>' + (filasCob.length ?
        '<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Método</th><th class="num">A cuenta</th><th class="num">Saldo cobrado</th><th class="num">Total</th></tr></thead><tbody>' +
        filasCob.map((k) => '<tr><td><span class="pill p-teal">' + esc(k) + '</span></td><td class="num">' + money(cob[k].acuenta) + '</td><td class="num">' + money(cob[k].saldo) + '</td><td class="num"><b>' + money(cob[k].acuenta + cob[k].saldo) + "</b></td></tr>").join("") +
        '</tbody><tfoot><tr><td><b>Total</b></td><td class="num"><b>' + money(filasCob.reduce((a, k) => a + cob[k].acuenta, 0)) + '</b></td><td class="num"><b>' + money(filasCob.reduce((a, k) => a + cob[k].saldo, 0)) + '</b></td><td class="num"><b>' + money(totCob) + "</b></td></tr></tfoot></table></div>" : '<div class="empty">Todavía no hay cobros registrados hoy.</div>') +
      '<p class="t-sub" style="margin:10px 0 0">A cuenta = lo recibido al hacer la nota hoy. Saldo cobrado = pagos de saldo registrados hoy.</p></div>' +
      '<div class="card"><h3>Consultar por fecha</h3><div class="chips" id="stModo"></div><div class="toolbar" style="margin-bottom:10px"><input class="inp" type="date" id="stFecha" style="width:auto" max="' + hoy + '" value="' + esc(u.fecha || "") + '"><div class="chips" style="margin:0" id="stTipo"></div></div><div id="stFechaRes"></div></div></div>' +
      '<div class="card" style="margin-top:18px"><h3>Buscar nota o cliente (deuda, método de pago y fechas)</h3><div class="toolbar">' + searchBox("stQ", "Número de nota, nombre o teléfono del cliente…", u.q) + '<label style="display:flex;align-items:center;gap:8px;font-size:14px;margin:0"><input type="checkbox" id="stDeuda"' + (u.soloDeuda ? " checked" : "") + '> Solo con deuda</label></div><div id="stBuscarRes"></div></div>' +
      '<div id="stGr"></div>';

    const drawFecha = () => {
      const iso = u.modo === "hoy" ? hoy : u.modo === "ayer" ? ayer : u.fecha;
      $("#stModo").innerHTML = [["hoy", "Hoy"], ["ayer", "Ayer"], ["fecha", "Fecha específica"]].map((m) => '<button class="chip' + (u.modo === m[0] ? " on" : "") + '" data-st-modo="' + m[0] + '">' + m[1] + "</button>").join("");
      $("#stTipo").innerHTML = [["notas", "Notas de venta"], ["cots", "Cotizaciones"]].map((m) => '<button class="chip' + (u.tipo === m[0] ? " on" : "") + '" data-st-tipo="' + m[0] + '">' + m[1] + "</button>").join("");
      if (!iso) return ($("#stFechaRes").innerHTML = '<div class="empty">Elige una fecha.</div>');
      const rows = (u.tipo === "notas" ? S.notas : S.cots).filter((r) => docKey(r) === iso);
      const tot = rows.reduce((a, r) => a + num(r.total), 0);
      const lbl = fmtISO(iso);
      $("#stFechaRes").innerHTML = '<p class="t-sub" style="margin:0 0 8px"><b>' + rows.length + "</b> " + (u.tipo === "notas" ? "notas de venta" : "cotizaciones") + " del " + lbl + " · total <b>" + money(tot) + "</b></p>" + (rows.length ?
        '<div class="table-wrap" style="box-shadow:none;max-height:340px"><table><thead><tr><th>Nº</th><th>Cliente</th><th class="num">Total</th>' + (u.tipo === "notas" ? '<th class="num">Saldo</th><th>Método</th>' : "<th>Entrega</th>") + "<th></th></tr></thead><tbody>" +
        rows.map((r) => '<tr><td class="t-id">' + esc(r.numero) + '</td><td class="t-main">' + esc(r.cliente) + '</td><td class="num">' + money(r.total) + "</td>" + (u.tipo === "notas" ? '<td class="num ' + (debe(r) > 0.005 ? "money-neg" : "") + '">' + money(debe(r)) + "</td><td>" + esc(r.forma_pago || "—") + "</td>" : "<td>" + esc(r.entrega || "—") + "</td>") + '<td><button class="btn btn-sm" data-act="' + (u.tipo === "notas" ? "view-nota" : "edit-cot") + '" data-id="' + r.id + '">Ver</button></td></tr>').join("") + "</tbody></table></div>" : '<div class="empty">No hay registros en esa fecha.</div>');
    };
    const drawBuscar = () => {
      const q = norm(u.q); const host = $("#stBuscarRes");
      if (!q) return (host.innerHTML = '<div class="empty">Escribe un número de nota o el nombre del cliente.</div>');
      const dq = q.replace(/\D/g, "").replace(/^0+/, "");
      let rows = S.notas.filter((n) => norm(n.cliente).includes(q) || (dq && (String(n.numero_int) === dq || String(n.numero).replace(/^0+/, "") === dq)) || (dq.length >= 5 && phoneDigits(n.telefono).includes(dq)));
      if (u.soloDeuda) rows = rows.filter((n) => debe(n) > 0.005);
      rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const clientes = new Set(rows.map((n) => norm(n.cliente)));
      const deuda = r2(rows.reduce((a, n) => a + debe(n), 0));
      const resumen = '<p class="t-sub" style="margin:0 0 8px"><b>' + rows.length + "</b> notas" + (clientes.size === 1 && rows.length ? " de <b>" + esc(rows[0].cliente) + "</b>" : "") + " · deuda total <b class=\"" + (deuda > 0 ? "money-neg" : "money-ok") + '">' + money(deuda) + "</b></p>";
      host.innerHTML = resumen + (rows.length ? '<div class="table-wrap" style="box-shadow:none;max-height:480px"><table><thead><tr><th>Nº</th><th>Cliente</th><th class="num">Total</th><th>A cuenta (monto · método · fecha)</th><th class="num">Saldo debe</th><th>Saldo pagado (monto · método · fecha)</th><th>Estado</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 40).map((n) => {
          const ps = pagosDe(n, pagos); const cobrado = ps.reduce((a, p) => a + p.monto, 0); const inicial = Math.max(0, num(n.a_cuenta) - cobrado);
          const cuenta = inicial > 0 ? money(inicial) + " · " + esc(n.forma_pago || "—") + " · " + fmtISO(docKey(n)) : "Sin pago a cuenta";
          const d = debe(n);
          const pagado = ps.length ? ps.map((p) => money(p.monto) + " · " + esc(p.metodo) + " · " + fmtISO(p.dia)).join("<br>") : (d <= 0.005 ? '<span class="t-sub">Sin registro de cobro (pagado antes de este sistema)</span>' : '<span class="t-sub">Aún no pagó el saldo</span>');
          return '<tr><td class="t-id">' + esc(n.numero) + '</td><td><div class="t-main">' + esc(n.cliente) + '</div><div class="t-sub">' + esc(n.telefono || "") + '</div></td><td class="num">' + money(n.total) + "</td><td>" + cuenta + '</td><td class="num ' + (d > 0.005 ? "money-neg" : "money-ok") + '"><b>' + money(d) + "</b></td><td>" + pagado + "</td><td>" + pillEstado(n.estado_produccion) + '</td><td><button class="btn btn-sm" data-act="view-nota" data-id="' + n.id + '">Ver</button></td></tr>';
        }).join("") + "</tbody></table></div>" + (rows.length > 40 ? '<p class="t-sub">Mostrando 40 de ' + rows.length + ". Afina la búsqueda.</p>" : "") : '<div class="empty">Sin resultados.</div>');
    };
    drawFecha(); drawBuscar();
    $("#stFecha").addEventListener("change", (e) => { u.fecha = e.target.value; u.modo = "fecha"; drawFecha(); });
    $("#stQ").addEventListener("input", debounce((e) => { u.q = e.target.value; drawBuscar(); }, 200));
    $("#stDeuda").addEventListener("change", (e) => { u.soloDeuda = e.target.checked; drawBuscar(); });
    content().onclick = (ev) => {
      const m = ev.target.closest("[data-st-modo]"), t = ev.target.closest("[data-st-tipo]");
      if (m) { u.modo = m.dataset.stModo; drawFecha(); } if (t) { u.tipo = t.dataset.stTipo; drawFecha(); }
    };
    vStatsGraficos();
  }

  /* ============================ USUARIOS / ACCESOS ============================ */
  let usersCache = [];
  async function vUsers() {
    content().innerHTML = '<div class="toolbar"><button class="btn btn-primary" data-act="new-user">+ Nuevo usuario</button></div><div id="listHost"><div class="empty">Cargando…</div></div>';
    const { data, error } = await sb.from("usuarios").select("id,usuario,nombre,rol,activo,bloqueado,intentos_fallidos,created_at").order("created_at");
    if (error) return ($("#listHost").innerHTML = '<div class="empty">' + esc(errMsg(error)) + "</div>");
    usersCache = data || [];
    $("#listHost").innerHTML = '<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>' + usersCache.map((x) =>
      '<tr><td class="t-main">' + esc(x.usuario) + "</td><td>" + esc(x.nombre || "") + "</td><td>" + esc(ROLES[x.rol] || x.rol) + "</td><td>" + (x.bloqueado ? '<span class="pill p-red">Bloqueado</span>' : x.activo ? '<span class="pill p-green">Activo</span>' : '<span class="pill p-gray">Inactivo</span>') + '</td><td><div class="row-actions"><button class="btn btn-sm" data-act="edit-user" data-id="' + x.id + '">Editar</button></div></td></tr>').join("") + "</tbody></table></div>";
  }
  function userForm(id) {
    const x = id ? usersCache.find((u) => u.id === id) : null;
    openModal(x ? "Editar usuario" : "Nuevo usuario",
      '<form id="userForm"><div class="field"><label>Usuario</label><input class="inp" id="xUser" value="' + esc(x ? x.usuario : "") + '" ' + (x ? "disabled" : "") + ' autocapitalize="none"></div><div class="field"><label>Nombre</label><input class="inp" id="xNombre" value="' + esc(x ? x.nombre : "") + '"></div><div class="field"><label>Rol</label><select class="inp" id="xRol">' + Object.keys(ROLES).map((r) => "<option value=\"" + r + "\"" + ((x ? x.rol : "editor") === r ? " selected" : "") + ">" + ROLES[r] + "</option>").join("") + '</select></div><div class="field"><label>' + (x ? "Nueva contraseña (vacío = no cambiar)" : "Contraseña") + '</label><input class="inp" id="xPass" type="text" autocomplete="off"></div>' +
      (x ? '<div class="field"><label><input type="checkbox" id="xActivo" ' + (x.activo && !x.bloqueado ? "checked" : "") + '> Activo (al marcarlo se desbloquea)</label></div>' : "") +
      '<div class="modal-actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div></form>');
    $("#userForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = $("#xNombre").value.trim(), rol = $("#xRol").value, pass = $("#xPass").value;
      try {
        if (x) {
          const act = $("#xActivo").checked; const patch = { nombre, rol, activo: act };
          if (act) { patch.bloqueado = false; patch.intentos_fallidos = 0; }
          if (pass) patch.password = pass;
          const { error } = await sb.from("usuarios").update(patch).eq("id", x.id); if (error) throw error;
        } else {
          const usr = $("#xUser").value.trim();
          if (!usr || pass.length < 6) return toast("Usuario y contraseña (mín. 6 caracteres) son obligatorios.", "err");
          const { data, error } = await sb.rpc("registrar_usuario", { p_usuario: usr, p_password: pass, p_nombre: nombre });
          if (error) throw error; if (data === false) return toast("Ese usuario ya existe.", "err");
          const { error: e2 } = await sb.from("usuarios").update({ rol }).eq("usuario", usr); if (e2) throw e2;
        }
        await logAcceso("usuario_" + (x ? "editado" : "creado"), x ? x.usuario : $("#xUser").value);
        closeModal(); toast("Usuario guardado.", "ok"); vUsers();
      } catch (er) { toast(errMsg(er), "err"); }
    });
  }
  async function vLog() {
    const u = S.ui.log = S.ui.log || { q: "" };
    content().innerHTML = '<div class="toolbar">' + searchBox("fQ", "Filtrar por usuario o acción…", u.q) + '</div><div id="listHost"><div class="empty">Cargando…</div></div>';
    const { data, error } = await sb.from("accesos").select("*").order("fecha_hora", { ascending: false }).limit(500);
    if (error) return ($("#listHost").innerHTML = '<div class="empty">' + esc(errMsg(error)) + "</div>");
    const draw = () => {
      const q = norm(u.q); const rows = data.filter((r) => !q || norm(r.usuario + " " + r.accion + " " + r.detalle).includes(q)).slice(0, 200);
      $("#listHost").innerHTML = '<div class="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>' + rows.map((r) => "<tr><td>" + new Date(r.fecha_hora).toLocaleString("es-BO", { timeZone: tz }) + '</td><td class="t-main">' + esc(r.usuario || "—") + '</td><td><span class="pill p-teal">' + esc(r.accion) + "</span></td><td>" + esc(r.detalle || "") + "</td></tr>").join("") + "</tbody></table></div>";
    };
    draw(); $("#fQ").addEventListener("input", debounce((e) => { u.q = e.target.value; draw(); }, 200));
  }


  /* ---------- datos de la empresa (se guardan como archivo JSON en el almacenamiento) ---------- */
  const EMP_DEF = { nombre: CFG.empresa.nombre, lema: CFG.empresa.lema, telefono: "", whatsapp: "", direccion: "", email: "", logo_url: "" };
  let EMP = Object.assign({}, EMP_DEF);
  const EMP_PATH = "config/empresa.json";
  async function loadEmpresa() {
    try {
      const r = await fetch(CFG.supabaseUrl + "/storage/v1/object/public/" + CFG.bucket + "/" + EMP_PATH + "?v=" + Date.now(), { cache: "no-store" });
      if (r.ok) EMP = Object.assign({}, EMP_DEF, await r.json());
    } catch (e) { /* usa valores por defecto */ }
    applyBranding();
  }
  function applyBranding() {
    const src = EMP.logo_url || "img/logo-seven.png";
    $$("#boot img, .login-logo, .side-brand img").forEach((i) => { i.src = src; i.alt = EMP.nombre; });
    document.title = EMP.nombre + " — CRM";
  }
  async function saveEmpresa(datos) {
    const blob = new Blob([JSON.stringify(datos)], { type: "application/json" });
    const { error } = await sb.storage.from(CFG.bucket).upload(EMP_PATH, blob, { upsert: true, contentType: "application/json", cacheControl: "10" });
    if (error) throw error;
    EMP = Object.assign({}, EMP_DEF, datos); logoCache = { url: null, data: null }; applyBranding();
  }

  /* ============================ CONFIGURAR ============================ */
  function vConfig() {
    content().innerHTML =
      '<div class="grid g-2e">' +
      '<div class="card"><h3>Datos de la empresa</h3><p class="t-sub" style="margin:-6px 0 16px">Estos datos se usan en el encabezado y pie del PDF de notas y cotizaciones, y el logo también se muestra en la web.</p>' +
      '<form id="cfgForm"><div class="field"><label>Nombre de la empresa</label><input class="inp" id="cNombre" value="' + esc(EMP.nombre) + '"></div>' +
      '<div class="field"><label>Lema</label><input class="inp" id="cLema" value="' + esc(EMP.lema) + '"></div>' +
      '<div class="form-grid"><div class="field"><label>Teléfono</label><input class="inp" id="cTel" inputmode="tel" value="' + esc(EMP.telefono) + '"></div>' +
      '<div class="field"><label>WhatsApp</label><input class="inp" id="cWa" inputmode="tel" value="' + esc(EMP.whatsapp) + '"></div></div>' +
      '<div class="field"><label>Dirección</label><input class="inp" id="cDir" value="' + esc(EMP.direccion) + '"></div>' +
      '<div class="field"><label>Correo electrónico</label><input class="inp" id="cMail" type="email" value="' + esc(EMP.email) + '"></div>' +
      '<div class="field"><label>Logo (PNG o JPG)</label><input class="inp" type="file" id="cLogo" accept="image/png,image/jpeg,image/webp"><div style="display:flex;align-items:center;gap:14px;margin-top:10px"><img id="cLogoPrev" src="' + esc(EMP.logo_url || "img/logo-seven.png") + '" alt="" style="width:84px;height:84px;object-fit:contain;border:1px solid var(--line);border-radius:14px;background:#fff"><label style="text-transform:none;letter-spacing:0;font-size:13px;margin:0;display:flex;align-items:center;gap:8px"><input type="checkbox" id="cLogoQuitar" style="width:auto"> Volver al logo original</label></div></div>' +
      '<div class="modal-actions" style="justify-content:flex-start"><button class="btn" type="button" data-act="cfg-preview">Ver cómo queda el PDF</button><button class="btn btn-primary" type="submit" id="cfgSave">Guardar cambios</button></div></form></div>' +
      '<div class="card"><h3>Copia de seguridad</h3><p class="t-sub" style="margin:-6px 0 16px">Descarga toda la información de la base: notas de venta, cotizaciones, usuarios, registro de accesos, datos de la empresa y las demás tablas.</p>' +
      '<div class="modal-actions" style="justify-content:flex-start;margin-top:0"><button class="btn btn-primary" data-act="backup-xlsx">Descargar base completa (Excel)</button><button class="btn" data-act="backup-json">Descargar base completa (JSON)</button></div>' +
      '<p class="t-sub" id="backupMsg" style="margin-top:14px"></p>' +
      '<p class="t-sub" style="margin-top:10px">El Excel es para ver y trabajar los datos. El JSON conserva todo tal cual y sirve para restaurar o migrar la base. Por seguridad, las contraseñas de los usuarios no se incluyen. Las imágenes adjuntas se enlazan por su dirección, no se descargan.</p></div></div>';
    S.cfgPreview = async (tipo) => {
      const E = leerFormEmpresa(); const modelo = (tipo === "cot" ? S.cots : S.notas).find((x) => items(x).length) || ejemploDoc(tipo);
      const { doc, name } = await buildPDF(tipo, modelo, E);
      const url = URL.createObjectURL(doc.output("blob"));
      S.cfgPdfUrl = url; S.cfgPdfName = name; return url;
    };
    $("#cLogo").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) $("#cLogoPrev").src = URL.createObjectURL(f); });
    $("#cfgForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#cfgSave"); btn.disabled = true; btn.textContent = "Guardando…";
      try {
        const datos = { nombre: $("#cNombre").value.trim() || EMP_DEF.nombre, lema: $("#cLema").value.trim(), telefono: $("#cTel").value.trim(), whatsapp: $("#cWa").value.trim(), direccion: $("#cDir").value.trim(), email: $("#cMail").value.trim(), logo_url: EMP.logo_url };
        if ($("#cLogoQuitar").checked) datos.logo_url = "";
        const f = $("#cLogo").files[0];
        if (f) {
          if (f.size > 4 * 1024 * 1024) throw new Error("El logo supera 4 MB.");
          const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
          const path = "config/logo-" + Date.now() + "." + ext;
          const up = await sb.storage.from(CFG.bucket).upload(path, f, { contentType: f.type, upsert: false });
          if (up.error) throw up.error;
          datos.logo_url = sb.storage.from(CFG.bucket).getPublicUrl(path).data.publicUrl;
        }
        await saveEmpresa(datos);
        await logAcceso("configuracion_guardada", datos.nombre);
        toast("Configuración guardada.", "ok"); vConfig();
      } catch (er) { toast("No se pudo guardar: " + errMsg(er), "err"); btn.disabled = false; btn.textContent = "Guardar cambios"; }
    });
  }

  function leerFormEmpresa() {
    const E = { nombre: $("#cNombre").value.trim() || EMP_DEF.nombre, lema: $("#cLema").value.trim(), telefono: $("#cTel").value.trim(), whatsapp: $("#cWa").value.trim(), direccion: $("#cDir").value.trim(), email: $("#cMail").value.trim(), logo_url: EMP.logo_url };
    if ($("#cLogoQuitar").checked) E.logo_url = "";
    const f = $("#cLogo").files[0]; if (f) E.logo_url = URL.createObjectURL(f);
    return E;
  }
  const ejemploDoc = (tipo) => ({ numero: "000001", fecha: hoyDMY(), cliente: "Cliente de ejemplo", telefono: "70000000", nitci: "1234567", factura: "SIN FACTURA", forma_pago: "QR", fecha_entrega: hoyISO(), validez: "3", entrega: "5 días hábiles", total: 450, a_cuenta: 200, saldo: 250, observaciones: "Vista previa con datos de ejemplo", items: [{ cant: "2", detalle: "Banner 150x100 cm con instalación", pu: "150" }, { cant: "1", detalle: "Adhesivo de logo 60x60 cm", pu: "150" }] });
  async function vistaPreviaPDF(tipo) {
    try {
      openModal("Vista previa del PDF", '<div class="chips"><button class="chip' + (tipo === "nota" ? " on" : "") + '" data-act="cfg-preview" data-t="nota">Nota de venta</button><button class="chip' + (tipo === "cot" ? " on" : "") + '" data-act="cfg-preview" data-t="cot">Cotización</button></div><p class="t-sub" style="margin:0 0 10px">Así se verá con los datos que escribiste (todavía sin guardar). Usa una nota real de ejemplo.</p><div id="pdfBox" class="empty">Generando…</div>', true);
      const url = await S.cfgPreview(tipo);
      $("#pdfBox").className = "";
      $("#pdfBox").innerHTML = '<iframe title="Vista previa del PDF" src="' + url + '#toolbar=0&navpanes=0" style="width:100%;height:68vh;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe><div class="modal-actions"><a class="btn" href="' + url + '" target="_blank" rel="noopener">Abrir en pestaña nueva</a><a class="btn" href="' + url + '" download="' + esc(S.cfgPdfName) + '">Descargar esta vista previa</a><button class="btn btn-primary" data-act="close">Cerrar y seguir editando</button></div>';
    } catch (e) { toast("No se pudo generar la vista previa: " + errMsg(e), "err"); }
  }

  /* ============================ RESPALDO COMPLETO ============================ */
  const BACKUP_TABLAS = [
    { t: "notas", cols: "*", orden: "created_at" },
    { t: "cotizaciones", cols: "*", orden: "created_at" },
    { t: "usuarios", cols: "id,usuario,nombre,rol,activo,bloqueado,intentos_fallidos,created_at", orden: "created_at" },
    { t: "accesos", cols: "*", orden: "fecha_hora" },
    { t: "okinawa_detalle", cols: "*", orden: "id" },
    { t: "junior_salvatierra_detalle", cols: "*", orden: "id" }
  ];
  async function fetchAll(def) {
    const out = []; const STEP = 1000;
    for (let from = 0; ; from += STEP) {
      const { data, error } = await sb.from(def.t).select(def.cols).order(def.orden, { ascending: true }).range(from, from + STEP - 1);
      if (error) throw error;
      out.push(...(data || [])); if (!data || data.length < STEP) break;
    }
    return out;
  }
  const itemsTexto = (arr) => (Array.isArray(arr) ? arr : []).map((i) => i.cant + " x " + i.detalle + " @ " + i.pu).join(" | ");
  function descargar(blob, nombre) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function respaldo(formato) {
    const msg = $("#backupMsg"); const btns = $$("[data-act^=backup-]"); btns.forEach((b) => (b.disabled = true));
    try {
      const datos = {}, avisos = [];
      for (const def of BACKUP_TABLAS) {
        if (msg) msg.textContent = "Leyendo " + def.t + "…";
        try { datos[def.t] = await fetchAll(def); } catch (e) { avisos.push(def.t + ": " + errMsg(e)); }
      }
      const stamp = hoyISO(); const resumen = Object.keys(datos).map((k) => k + ": " + datos[k].length).join(" · ");
      if (formato === "json") {
        const out = { generado: new Date().toISOString(), sistema: EMP.nombre, empresa: EMP, nota: "Contraseñas de usuarios excluidas.", tablas: datos };
        descargar(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }), "base-completa-" + stamp + ".json");
      } else {
        if (!window.XLSX) throw new Error("No se cargó la librería de Excel.");
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.keys(EMP).map((k) => ({ campo: k, valor: EMP[k] }))), "empresa");
        Object.keys(datos).forEach((t) => {
          const rows = datos[t].map((r) => { const o = Object.assign({}, r); if (Array.isArray(r.items)) { o.items = itemsTexto(r.items); o.items_json = JSON.stringify(r.items); } return o; });
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t.slice(0, 31));
        });
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        descargar(new Blob([buf], { type: "application/octet-stream" }), "base-completa-" + stamp + ".xlsx");
      }
      await logAcceso("respaldo_descargado", formato + " · " + resumen);
      if (msg) msg.textContent = "Listo. " + resumen + (avisos.length ? " · Avisos: " + avisos.join("; ") : "");
      toast("Copia de seguridad descargada.", "ok");
    } catch (e) { if (msg) msg.textContent = ""; toast("No se pudo descargar: " + errMsg(e), "err"); }
    btns.forEach((b) => (b.disabled = false));
  }

  /* ============================ PDF ============================ */
  let logoCache = { url: null, data: null };
  async function getLogo(E) {
    E = E || EMP;
    const url = E.logo_url || "img/logo-seven-pdf.jpg";
    if (logoCache.url === url && logoCache.data) return logoCache.data;
    const cargar = (u, bust) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = u + (bust ? "?v=" + Date.now() : ""); });
    try {
      let img;
      try { img = await cargar(url, !!E.logo_url && !/^blob:/.test(url)); } catch (e) { img = await cargar("img/logo-seven-pdf.jpg", false); }
      const k = Math.min(1, 500 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      logoCache = { url, data: { d: c.toDataURL("image/jpeg", 0.9), ratio: c.width / c.height } };
    } catch (e) { logoCache = { url, data: null }; }
    return logoCache.data;
  }
  async function buildPDF(kind, r, E) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4" });
    const isNota = kind === "nota"; const W = 210, M = 14;
    const teal = [6, 128, 148], ink = [6, 50, 59];
    const logo = await getLogo(E);
    doc.setFillColor(230, 246, 251); doc.rect(0, 0, W, 42, "F");
    doc.setFillColor(40, 196, 210); doc.rect(0, 42, W, 2.2, "F");
    let lw = 0; const lh = 30;
    if (logo) { lw = Math.min(60, lh * logo.ratio); doc.addImage(logo.d, "JPEG", M, 6, lw, lh); }
    const tx = M + (logo ? lw + 6 : 0);
    doc.setTextColor(...ink); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(doc.splitTextToSize(String(E.nombre || "").toUpperCase(), 100)[0], tx, 16);
    doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...teal); doc.text(E.lema || "", tx, 22);
    const contacto = [E.direccion, E.telefono && "Tel: " + E.telefono, E.whatsapp && "WhatsApp: " + E.whatsapp, E.email].filter(Boolean).join("  ·  ");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(60, 90, 100);
    if (contacto) doc.text(doc.splitTextToSize(contacto, W - M - 62 - tx + M).slice(0, 3), tx, 28);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...ink); doc.text(isNota ? "NOTA DE VENTA" : "COTIZACIÓN", W - M, 15, { align: "right" });
    doc.setFontSize(12); doc.setTextColor(200, 50, 60); doc.text("Nº " + r.numero, W - M, 22, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60, 90, 100);
    doc.text("Fecha: " + (r.fecha || fmtISO((r.created_at || "").slice(0, 10))), W - M, 29, { align: "right" });
    let y = 54; doc.setTextColor(...ink); doc.setFontSize(10);
    const line = (a, b, x) => { doc.setFont("helvetica", "bold"); doc.text(a, x, y); doc.setFont("helvetica", "normal"); doc.text(String(b || "—"), x + 24, y); };
    line("Cliente:", r.cliente, M); line("Teléfono:", r.telefono, 125); y += 6;
    if (isNota) { line("NIT / CI:", r.nitci, M); line("Factura:", r.factura, 125); y += 6; line("Pago a cta.:", r.forma_pago, M); line("Entrega:", fmtISO(r.fecha_entrega), 125); y += 6; if (r.forma_pago_saldo) { line("Pago saldo:", r.forma_pago_saldo, M); y += 6; } }
    else { line("Validez:", (r.validez || "—") + " días", M); line("Entrega:", r.entrega, 125); y += 6; }
    y += 4;
    const head = () => { doc.setFillColor(...teal); doc.rect(M, y, W - 2 * M, 8, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("CANT.", M + 3, y + 5.5); doc.text("DETALLE", M + 24, y + 5.5); doc.text("P. UNIT.", 150, y + 5.5, { align: "right" }); doc.text("SUBTOTAL", W - M - 3, y + 5.5, { align: "right" }); y += 8; doc.setTextColor(...ink); };
    head(); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    items(r).forEach((it, i) => {
      const lines = doc.splitTextToSize(String(it.detalle || ""), 100); const h = Math.max(7, lines.length * 4.6 + 3);
      if (y + h > 262) { doc.addPage(); y = 16; head(); doc.setFont("helvetica", "normal"); doc.setFontSize(10); }
      if (i % 2) { doc.setFillColor(243, 250, 252); doc.rect(M, y, W - 2 * M, h, "F"); }
      doc.text(String(it.cant), M + 3, y + 5); doc.text(lines, M + 24, y + 5); doc.text(num(it.pu).toFixed(2), 150, y + 5, { align: "right" }); doc.text((num(it.cant) * num(it.pu)).toFixed(2), W - M - 3, y + 5, { align: "right" });
      y += h;
    });
    doc.setDrawColor(...teal); doc.line(M, y, W - M, y); y += 8;
    if (y > 240) { doc.addPage(); y = 20; }
    const tot = (a, b, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 12 : 10); doc.text(a, 130, y); doc.text(b, W - M - 3, y, { align: "right" }); y += bold ? 8 : 6; };
    tot(isNota ? (r.factura === "CON FACTURA" ? "CON FACTURA:" : "SIN FACTURA:") : "TOTAL:", "Bs " + num(r.total).toFixed(2), true);
    if (isNota) { tot("A cuenta:", "Bs " + num(r.a_cuenta).toFixed(2)); tot("SALDO:", "Bs " + num(r.saldo).toFixed(2), true); }
    if (isNota && r.observaciones) { y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("Observaciones:", M, y); doc.setFont("helvetica", "normal"); y += 5; doc.text(doc.splitTextToSize(r.observaciones, 100), M, y); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(6, 50, 59); doc.text(String(E.horario || "Horario de atención: Lu a Vi 8:30 am - 7:00 pm. SÁBADO Y DOMINGO (CERRADO)").toUpperCase(), W / 2, 282, { align: "center" }); doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5); doc.setTextColor(110, 138, 146); doc.text([E.nombre, E.lema, E.whatsapp && "WhatsApp " + E.whatsapp].filter(Boolean).join(" · "), W / 2, 288, { align: "center" });
    return { doc, name: (isNota ? "NOTA" : "COTIZACION") + "-" + r.numero + "-" + String(r.cliente || "").replace(/[^\w]+/g, "_").slice(0, 24) + ".pdf" };
  }
  async function makePDF(kind, r) {
    const { doc, name } = await buildPDF(kind, r, EMP);
    doc.save(name);
    await logAcceso(kind === "nota" ? "nota_pdf" : "cotizacion_pdf", "Nº " + r.numero);
  }

  /* ============================ CAMBIO DE CONTRASEÑA ============================ */
  function changePass() {
    openModal("Cambiar mi contraseña", '<form id="cpForm"><div class="field"><label>Contraseña actual</label><input class="inp" type="password" id="cpOld" autocomplete="current-password"></div><div class="field"><label>Nueva contraseña (mín. 6)</label><input class="inp" type="password" id="cpNew" autocomplete="new-password"></div><div class="modal-actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn btn-primary" type="submit">Cambiar</button></div></form>');
    $("#cpForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nu = $("#cpNew").value; if (nu.length < 6) return toast("Mínimo 6 caracteres.", "err");
      const { data, error } = await sb.rpc("login_usuario", { p_usuario: S.user.usuario, p_password: $("#cpOld").value });
      const ok = !error && (Array.isArray(data) ? data[0] : data) && (Array.isArray(data) ? data[0] : data).ok;
      if (!ok) return toast("La contraseña actual no es correcta.", "err");
      const { error: e2 } = await sb.from("usuarios").update({ password: nu }).eq("id", S.user.id);
      if (e2) return toast(errMsg(e2), "err");
      await logAcceso("cambio_password"); closeModal(); toast("Contraseña actualizada.", "ok");
    });
  }

  /* ============================ EVENTOS ============================ */
  document.addEventListener("click", async (ev) => {
    const um = $("#userDropdown");
    if (um && !um.hidden && !ev.target.closest(".user-menu")) { um.hidden = true; $("#userChip").setAttribute("aria-expanded", "false"); }
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    const cliPrefill = () => { const c = b.dataset.cli && buildClientes().find((x) => x.key === b.dataset.cli); return c ? { cliente: c.nombre, telefono: c.telefono, nitci: c.nitci } : null; };
    try {
      switch (a) {
        case "nav": go(b.dataset.mod); break;
        case "cfg-preview": await vistaPreviaPDF(b.dataset.t || "nota"); break;
        case "backup-xlsx": await respaldo("xlsx"); break;
        case "backup-json": await respaldo("json"); break;
        case "close": closeModal(); break;
        case "pg": { const u = S.ui[{ notas: "notas", cots: "cots", clientes: "cli" }[S.view]]; if (u) { u.page += +b.dataset.d; S.redraw(); } break; }
        case "new-nota": openDocForm("nota", null, cliPrefill()); break;
        case "new-cot": openDocForm("cot", null, cliPrefill()); break;
        case "edit-nota": openDocForm("nota", getNota(id)); break;
        case "edit-cot": openDocForm("cot", getCot(id)); break;
        case "view-nota": viewNota(id); break;
        case "pago-nota": pagoForm(id); break;
        case "del-nota": await deleteDoc("nota", id); break;
        case "conv-cot": convertirCot(id); break;
        case "pdf-nota": await makePDF("nota", getNota(id)); break;
        case "pdf-cot": await makePDF("cot", getCot(id)); break;
        case "mv": await setEstado(id, b.dataset.to); break;
        case "prod-f": S.ui.prod.filtro = b.dataset.f; S.redraw(); break;
        case "cli": fichaCliente(b.dataset.key); break;
        case "add-item": $("#itemRows").insertAdjacentHTML("beforeend", itemRowHTML()); $$("#itemRows .it-cant").pop().focus(); break;
        case "rm-item": if ($$("#itemRows .item-row").length > 1) { b.closest(".item-row").remove(); recalc(); } break;
        case "new-user": userForm(null); break;
        case "edit-user": userForm(id); break;
      }
    } catch (e) { toast(errMsg(e), "err"); }
  });
  document.addEventListener("change", (ev) => { const s = ev.target.closest("[data-sel=estado]"); if (s) setEstado(s.dataset.id, s.value); });
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal" && !$("#docForm")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
  $("#menuBtn").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#scrim").hidden = false; });
  $("#scrim").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#scrim").hidden = true; });
  $("#userChip").addEventListener("click", () => { const d = $("#userDropdown"); d.hidden = !d.hidden; $("#userChip").setAttribute("aria-expanded", String(!d.hidden)); });
  $("#logoutBtn").addEventListener("click", () => logout());
  $("#changePassBtn").addEventListener("click", () => { $("#userDropdown").hidden = true; changePass(); });
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usr = $("#uUser").value.trim(), pw = $("#uPass").value; if (!usr || !pw) return;
    const btn = $("#loginBtn"), err = $("#loginError"); btn.disabled = true; btn.textContent = "Verificando…"; err.hidden = true;
    try { S.user = await doLogin(usr, pw); saveSession(); await logAcceso("login"); await enterApp(); }
    catch (ex) { err.textContent = errMsg(ex); err.hidden = false; }
    btn.disabled = false; btn.textContent = "Ingresar";
  });

  /* ---------- arranque ---------- */
  (async function init() {
    await loadEmpresa();
    const s = loadSession();
    if (s && s.usuario) { S.user = s; await enterApp(); } else showLogin("");
  })();
})();
