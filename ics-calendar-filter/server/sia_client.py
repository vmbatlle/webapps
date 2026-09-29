"""
Client for the Universidad de Zaragoza "Consulta Pública de Horarios" (SIA/PDS) portal.

The portal has no public API: it is a legacy session-based JSP app. This module
replicates the exact sequence of requests a browser performs when a user searches
for a course/plan and clicks the "Descargar ICS" button on the calendar page:

  1. GET  the search page          -> establishes a session cookie
  2. POST look[conpub]ActualizarCombosPubHora -> selects centro/año/plan/curso/periodo
     and returns the dependent dropdown options (plan, curso, trimestre, grupos, asignaturas)
  3. POST look[conpub]MostrarPubHora           -> registers the chosen groups/subjects
     for the session and renders the calendar
  4. POST /pds/control/[mtoGenerarICS]         -> returns the generated ICS, base64-encoded,
     for whatever was registered in step 3 (relies purely on session state)
"""
import base64
import re

import requests

BASE = "https://sia.unizar.es/pds/consultaPublica/"
CTRL = "https://sia.unizar.es/pds/control/"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest",
}

CENTROS = [{"value": "110", "label": "110 - Escuela de Ingeniería y Arquitectura"}]
ANIOS = [{"value": str(y), "label": f"{y}/{y + 1}"} for y in (2023, 2024, 2025, 2026)]


def _parse_select_options(html, select_id):
    m = re.search(rf'<select[^>]*id="{re.escape(select_id)}"[^>]*>(.*?)</select>', html, re.S)
    if not m:
        return []
    options = []
    for om in re.finditer(r'<option\s+value="([^"]*)"([^>]*)>([^<]*)</option>', m.group(1), re.S):
        value, attrs, label = om.group(1), om.group(2), om.group(3).strip()
        options.append({
            "value": value,
            "label": re.sub(r"\s+", " ", label),
            "selected": "selected" in attrs,
        })
    return options


class SiaError(Exception):
    pass


def fetch_options(anio, centro, plan=None, curso=None, trimestre=None):
    """Return the dependent dropdown options (plan, curso, trimestre, grupos, asignaturas)."""
    session = requests.Session()
    session.get(BASE + "look[conpub]InicioPubHora", params={"entradaPublica": "true"}, headers=HEADERS, timeout=15)

    data = {
        "planDocente": anio, "centro": centro,
        "idPestana": "1", "ultimoPlanDocente": "", "accesoSecretaria": "null",
    }
    if plan:
        data["planEstudio"] = plan
    if curso:
        data["curso"] = curso
    if trimestre:
        data["trimestre"] = trimestre

    resp = session.post(BASE + "look[conpub]ActualizarCombosPubHora", params={"rnd": "1.0"},
                         data=data, headers=HEADERS, timeout=15)
    resp.encoding = "iso-8859-1"
    if resp.status_code != 200:
        raise SiaError(f"ActualizarCombosPubHora failed with status {resp.status_code}")

    return {
        "planes": _parse_select_options(resp.text, "planEstudio"),
        "cursos": _parse_select_options(resp.text, "curso"),
        "trimestres": _parse_select_options(resp.text, "trimestre"),
        "grupos": _parse_select_options(resp.text, "grupos"),
        "asignaturas": _parse_select_options(resp.text, "asignaturas"),
    }


def fetch_ics(anio, centro, plan, curso, trimestre, grupos, asignaturas):
    """Run the full search + download flow and return the raw ICS text."""
    if not grupos or not asignaturas:
        raise SiaError("Debes seleccionar al menos un grupo y una asignatura")

    session = requests.Session()
    session.get(BASE + "look[conpub]InicioPubHora", params={"entradaPublica": "true"}, headers=HEADERS, timeout=15)

    combos_data = {
        "planDocente": anio, "centro": centro, "planEstudio": plan,
        "curso": curso, "trimestre": trimestre,
        "idPestana": "1", "ultimoPlanDocente": "", "accesoSecretaria": "null",
    }
    r1 = session.post(BASE + "look[conpub]ActualizarCombosPubHora", params={"rnd": "1.0"},
                       data=combos_data, headers=HEADERS, timeout=15)
    if r1.status_code != 200:
        raise SiaError(f"ActualizarCombosPubHora failed with status {r1.status_code}")

    mostrar_data = {
        "planDocente": anio, "centro": centro, "planEstudio": plan,
        "curso": curso, "trimestre": trimestre,
        "grupos": grupos[0], "asignaturas": asignaturas[0],
        "idPestana": "1", "ultimoPlanDocente": "", "accesoSecretaria": "null",
    }
    for g in grupos:
        mostrar_data[f"grupo{g}"] = g
    for a in asignaturas:
        mostrar_data[f"asignatura{a}"] = a

    r2 = session.post(BASE + "look[conpub]MostrarPubHora", params={"rnd": "2.0"},
                       data=mostrar_data, headers=HEADERS, timeout=20)
    if r2.status_code != 200:
        raise SiaError(f"MostrarPubHora failed with status {r2.status_code}")

    r3 = session.post(CTRL + "[mtoGenerarICS]", headers=HEADERS, timeout=20)
    if r3.status_code != 200:
        raise SiaError(f"mtoGenerarICS failed with status {r3.status_code}")

    try:
        payload = r3.json()
    except ValueError as exc:
        raise SiaError("Respuesta inesperada al generar el ICS") from exc

    if payload.get("code") != 200 or "result" not in payload.get("data", {}):
        raise SiaError(payload.get("errors") or "No se pudo generar el ICS")

    ics_bytes = base64.b64decode(payload["data"]["result"])
    try:
        return ics_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return ics_bytes.decode("iso-8859-1")
