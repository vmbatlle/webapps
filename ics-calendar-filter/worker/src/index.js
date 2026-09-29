import { CENTROS, ANIOS, fetchOptions, fetchIcs, SiaError } from "./sia-client.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/config") {
        return json(200, { centros: CENTROS, anios: ANIOS });
      }

      if (request.method === "GET" && url.pathname === "/api/opciones") {
        const q = url.searchParams;
        const data = await fetchOptions({
          anio: q.get("anio") || "",
          centro: q.get("centro") || "",
          plan: q.get("plan") || undefined,
          curso: q.get("curso") || undefined,
          trimestre: q.get("trimestre") || undefined,
        });
        return json(200, data);
      }

      if (request.method === "POST" && url.pathname === "/api/horario") {
        const body = await request.json().catch(() => ({}));
        const icsText = await fetchIcs({
          anio: String(body.anio || ""),
          centro: String(body.centro || ""),
          plan: String(body.plan || ""),
          curso: String(body.curso || ""),
          trimestre: String(body.trimestre || ""),
          grupos: (body.grupos || []).map(String),
          asignaturas: (body.asignaturas || []).map(String),
        });
        return new Response(icsText, {
          status: 200,
          headers: { "Content-Type": "text/calendar; charset=utf-8", ...CORS_HEADERS },
        });
      }

      return json(404, { error: "Not found" });
    } catch (err) {
      if (err instanceof SiaError) return json(502, { error: err.message });
      return json(502, { error: `Error consultando el portal: ${err.message}` });
    }
  },
};
