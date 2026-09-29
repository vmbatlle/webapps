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
export const ANIOS = [2023, 2024, 2025, 2026].map((y) => ({ value: String(y), label: `${y}/${y + 1}` }));

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

  const r3 = await siaFetch(jar, `${CTRL}[mtoGenerarICS]`, { method: "POST" });
  if (!r3.ok) throw new SiaError(`mtoGenerarICS failed with status ${r3.status}`);

  let payload;
  try {
    payload = await r3.json();
  } catch {
    throw new SiaError("Respuesta inesperada al generar el ICS");
  }

  if (payload.code !== 200 || !payload.data?.result) {
    throw new SiaError(payload.errors || "No se pudo generar el ICS");
  }

  return base64ToText(payload.data.result);
}
