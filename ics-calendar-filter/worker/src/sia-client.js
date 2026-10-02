/**
 * Client for the Universidad de Zaragoza "Consulta Pública de Horarios" (SIA/PDS) portal.
 *
 * The portal has no public API: it is a legacy session-based JSP app. This module
 * replicates the exact sequence of requests a browser performs when a user searches
 * for a course/plan and clicks the "Descargar ICS" button on the calendar page:
 *
 *   1. GET  the search page                      -> establishes a session cookie
 *   2. POST look[conpub]ActualizarCombosPubHora   -> selects centro/año/plan/curso/periodo
 *      and returns the dependent dropdown options (plan, curso, trimestre, grupos, asignaturas)
 *   3. POST look[conpub]MostrarPubHora            -> registers the chosen groups/subjects
 *      for the session and renders the calendar
 *   4. POST /pds/control/[mtoGenerarICS]          -> returns the generated ICS, base64-encoded,
 *      for whatever was registered in step 3 (relies purely on session state)
 */

const BASE = "https://sia.unizar.es/pds/consultaPublica/";
const CTRL = "https://sia.unizar.es/pds/control/";

export const CENTROS = [{ value: "110", label: "110 - Escuela de Ingeniería y Arquitectura" }];

// Last 4 academic years up to the current one, most recent last.
export function buildAnios(currentYear) {
  const years = [];
  for (let y = currentYear - 3; y <= currentYear; y++) years.push(y);
  return years.map((y, i, arr) => ({
    value: String(y),
    label: `${y}/${y + 1}`,
    selected: i === arr.length - 1,
  }));
}

export class SiaError extends Error {}

/** Minimal cookie jar: Workers' fetch does not persist cookies across requests on its own. */
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  store(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")]
          : [];
    for (const sc of setCookies) {
      const pair = sc.split(";", 1)[0];
      const idx = pair.indexOf("=");
      if (idx > -1) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

async function siaFetch(jar, url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("User-Agent", "Mozilla/5.0");
  headers.set("X-Requested-With", "XMLHttpRequest");
  const cookie = jar.header();
  if (cookie) headers.set("Cookie", cookie);

  const resp = await fetch(url, { ...options, headers });
  jar.store(resp);
  return resp;
}

function decodeLatin1Html(buffer) {
  return new TextDecoder("iso-8859-1").decode(buffer);
}

function parseSelectOptions(html, selectId) {
  const selectRe = new RegExp(`<select[^>]*id="${selectId}"[^>]*>([\\s\\S]*?)</select>`);
  const selectMatch = selectRe.exec(html);
  if (!selectMatch) return [];

  const options = [];
  const optionRe = /<option\s+value="([^"]*)"([^>]*)>([^<]*)</g;
  let m;
  while ((m = optionRe.exec(selectMatch[1])) !== null) {
    const [, value, attrs, rawLabel] = m;
    options.push({
      value,
      label: rawLabel.trim().replace(/\s+/g, " "),
      selected: attrs.includes("selected"),
    });
  }
  return options;
}

function base64ToText(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

/** Extracts a bracket-balanced JSON array literal starting at `marker` (e.g. "source: ["), respecting quoted strings. */
function extractJsonArray(text, marker) {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = text.indexOf("[", markerIdx);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

async function fetchAsignaturaTabHtml(jar, anio) {
  await siaFetch(jar, `${BASE}look[conpub]InicioPubHora?entradaPublica=true`);
  const data = new URLSearchParams({
    jsonBusquedaAsignaturas: "{}",
    limpiarParametrosBusqueda: "N",
    idPestana: "0",
    ultimoPlanDocente: anio,
    accesoSecretaria: "null",
  });
  const resp = await siaFetch(jar, `${BASE}look[conpub]ActualizarPestanaPubHora?rnd=1.0`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: data.toString(),
  });
  if (!resp.ok) throw new SiaError(`ActualizarPestanaPubHora failed with status ${resp.status}`);
  return decodeLatin1Html(await resp.arrayBuffer());
}

/** Full, university-wide subject list for a given academic year (independent of plan/curso). */
export async function fetchAllSubjects(anio, jar = new CookieJar()) {
  const html = await fetchAsignaturaTabHtml(jar, anio);
  const arrayText = extractJsonArray(html, "source:");
  if (!arrayText) throw new SiaError("No se pudo obtener el listado de asignaturas");

  let raw;
  try {
    raw = JSON.parse(arrayText);
  } catch {
    throw new SiaError("Respuesta inesperada al listar asignaturas");
  }
  return raw.map((item) => ({ value: item.value, label: item.text }));
}

/** Resolves the plan/centro/período/grupo options for one specific subject code. */
export async function fetchSubjectDetail(anio, asignatura, jar = new CookieJar(), { skipInit = false } = {}) {
  if (!skipInit) await fetchAsignaturaTabHtml(jar, anio);

  const params = new URLSearchParams({
    rnd: "1.0",
    planDocente: anio,
    asignaturaModal: asignatura,
    planDocenteSeleccionadoAnteriormente: anio,
    jsonBusquedaAsignaturas: "{}",
    limpiarParametrosBusqueda: "N",
    idPestana: "0",
    ultimoPlanDocente: "",
    accesoSecretaria: "null",
  });
  const resp = await siaFetch(jar, `${BASE}look[conpub]ActualizarModalBusquedaAsignatura?${params}`);
  if (!resp.ok) throw new SiaError(`ActualizarModalBusquedaAsignatura failed with status ${resp.status}`);

  let detail;
  try {
    detail = await resp.json();
  } catch {
    throw new SiaError("Respuesta inesperada al consultar la asignatura");
  }
  if (!detail.selecteds) throw new SiaError("Asignatura no encontrada para ese curso académico");

  return {
    centro: detail.selecteds.centro,
    plan: detail.selecteds.plan,
    estudio: detail.selecteds.estudio,
    periodos: (detail.periodo || []).map((p) => ({ value: p.codigo, label: p.descripcion })),
    grupos: (detail.grupo || []).map((g) => ({ value: g.codigo, label: g.descripcion })),
  };
}

const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Mirrors the portal's autocomplete (a client-side substring match over "code - name"),
 * optionally enriching each hit with plan/periodos/grupos. Details are capped because
 * each one is a subrequest to SIA.
 */
export async function searchSubjects(anio, query, { detalle = false, limit = 10 } = {}) {
  const term = normalize(query.trim());
  if (!term) throw new SiaError("Falta el texto de búsqueda");

  const jar = new CookieJar();
  const all = await fetchAllSubjects(anio, jar);
  const matches = all.filter((s) => normalize(`${s.value} - ${s.label}`).includes(term));
  const total = matches.length;
  const page = matches.slice(0, limit);

  if (detalle) {
    for (const s of page) {
      try {
        Object.assign(s, await fetchSubjectDetail(anio, s.value, jar, { skipInit: true }));
      } catch (err) {
        s.error = err.message;
      }
    }
  }
  return { total, asignaturas: page };
}

async function generateIcsFromSession(jar) {
  const resp = await siaFetch(jar, `${CTRL}[mtoGenerarICS]`, { method: "POST" });
  if (!resp.ok) throw new SiaError(`mtoGenerarICS failed with status ${resp.status}`);

  let payload;
  try {
    payload = await resp.json();
  } catch {
    throw new SiaError("Respuesta inesperada al generar el ICS");
  }
  if (payload.code !== 200 || !payload.data?.result) {
    throw new SiaError(payload.errors || "No se pudo generar el ICS");
  }
  return base64ToText(payload.data.result);
}

/**
 * Generates an ICS from a free list of subject selections (the "Buscar por asignatura" flow),
 * each one independently resolved via fetchSubjectDetail: { asignatura, centro, plan, estudio, periodo, grupo }.
 */
export async function fetchIcsBySubjects(anio, selections) {
  if (!selections?.length) throw new SiaError("Debes seleccionar al menos una asignatura y un grupo");

  const jsonBusqueda = {};
  selections.forEach((sel, i) => {
    jsonBusqueda[`hash${i}`] = {
      anoAcademico: anio,
      asignatura: sel.asignatura,
      asignaturaDesc: sel.asignaturaDesc || sel.asignatura,
      centro: sel.centro,
      centroDesc: sel.centroDesc || "",
      plan: sel.plan,
      planDesc: sel.planDesc || "",
      estudio: sel.estudio,
      estudioDesc: sel.estudioDesc || "",
      periodo: sel.periodo,
      periodoDesc: sel.periodoDesc || "",
      grupo: sel.grupo,
      grupoDesc: sel.grupoDesc || "",
    };
  });

  const jar = new CookieJar();
  await fetchAsignaturaTabHtml(jar, anio);

  const mostrarData = new URLSearchParams({
    planDocente: anio,
    asignaturaModal: "",
    jsonBusquedaAsignaturas: JSON.stringify(jsonBusqueda),
    limpiarParametrosBusqueda: "N",
    idPestana: "0",
    ultimoPlanDocente: anio,
    accesoSecretaria: "null",
  });
  const resp = await siaFetch(jar, `${BASE}look[conpub]MostrarPubHora?rnd=1.0`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: mostrarData.toString(),
  });
  if (!resp.ok) throw new SiaError(`MostrarPubHora failed with status ${resp.status}`);

  return generateIcsFromSession(jar);
}

export async function fetchOptions({ anio, centro, plan, curso, trimestre }) {
  const jar = new CookieJar();
  await siaFetch(jar, `${BASE}look[conpub]InicioPubHora?entradaPublica=true`);

  const data = new URLSearchParams({
    planDocente: anio,
    centro,
    idPestana: "1",
    ultimoPlanDocente: "",
    accesoSecretaria: "null",
  });
  if (plan) data.set("planEstudio", plan);
  if (curso) data.set("curso", curso);
  if (trimestre) data.set("trimestre", trimestre);

  const resp = await siaFetch(jar, `${BASE}look[conpub]ActualizarCombosPubHora?rnd=1.0`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: data.toString(),
  });
  if (!resp.ok) throw new SiaError(`ActualizarCombosPubHora failed with status ${resp.status}`);
  const html = decodeLatin1Html(await resp.arrayBuffer());

  return {
    planes: parseSelectOptions(html, "planEstudio"),
    cursos: parseSelectOptions(html, "curso"),
    trimestres: parseSelectOptions(html, "trimestre"),
    grupos: parseSelectOptions(html, "grupos"),
    asignaturas: parseSelectOptions(html, "asignaturas"),
  };
}

export async function fetchIcs({ anio, centro, plan, curso, trimestre, grupos, asignaturas }) {
  if (!grupos?.length || !asignaturas?.length) {
    throw new SiaError("Debes seleccionar al menos un grupo y una asignatura");
  }

  const jar = new CookieJar();
  await siaFetch(jar, `${BASE}look[conpub]InicioPubHora?entradaPublica=true`);

  const combosData = new URLSearchParams({
    planDocente: anio,
    centro,
    planEstudio: plan,
    curso,
    trimestre,
    idPestana: "1",
    ultimoPlanDocente: "",
    accesoSecretaria: "null",
  });
  const r1 = await siaFetch(jar, `${BASE}look[conpub]ActualizarCombosPubHora?rnd=1.0`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: combosData.toString(),
  });
  if (!r1.ok) throw new SiaError(`ActualizarCombosPubHora failed with status ${r1.status}`);

  const mostrarData = new URLSearchParams({
    planDocente: anio,
    centro,
    planEstudio: plan,
    curso,
    trimestre,
    grupos: grupos[0],
    asignaturas: asignaturas[0],
    idPestana: "1",
    ultimoPlanDocente: "",
    accesoSecretaria: "null",
  });
  for (const g of grupos) mostrarData.set(`grupo${g}`, g);
  for (const a of asignaturas) mostrarData.set(`asignatura${a}`, a);

  const r2 = await siaFetch(jar, `${BASE}look[conpub]MostrarPubHora?rnd=2.0`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: mostrarData.toString(),
  });
  if (!r2.ok) throw new SiaError(`MostrarPubHora failed with status ${r2.status}`);

  return generateIcsFromSession(jar);
}
