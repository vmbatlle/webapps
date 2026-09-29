# Filtro de Calendario Académico ICS

Herramienta web interactiva para cargar, filtrar y visualizar calendarios académicos en formato `.ics`.

## Características

- 🔎 **Búsqueda integrada de horarios EINA**: consulta y carga tu horario directamente desde la app, sin pasar por el portal externo.
- 📁 **Carga de archivos ICS**: Procesa eventos directamente en el navegador (alternativa manual).
- 🎯 **Filtros personalizados**: Selección/deselección por asignatura, grupos y tipo de docencia.
- ⏱️ **Carga Lectiva**: Cálculo automático de horas lectivas totales y desglosadas sin decimales.
- 📅 **Vista previa con FullCalendar**: Visualización clara con días seleccionados resaltados.
- 💾 **Exportación**: Descarga un archivo `.ics` actualizado con solo los eventos filtrados.

## Tecnologías Utilizadas

- HTML5 / Vanilla JavaScript (ES6)
- [Tailwind CSS](https://tailwindcss.com/)
- [FullCalendar v6](https://fullcalendar.io/)
- Backend proxy para la búsqueda integrada (dos implementaciones equivalentes, usa la que prefieras):
  - `server/` — Python 3 (`http.server` + `requests`), pensado para desarrollo local.
  - `worker/` — Cloudflare Worker (JavaScript), pensado para producción/despliegue gratuito.

El portal público de horarios de la EINA ([sia.unizar.es](https://sia.unizar.es/pds/consultaPublica/look%5Bconpub%5DInicioPubHora?entradaPublica=true)) no ofrece una API pública: es una aplicación JSP heredada basada en sesión. Ambos backends reproducen la misma secuencia de peticiones que hace el navegador al buscar un horario y pulsar "Descargar" (seleccionar centro/año/plan → `ActualizarCombosPubHora` → `MostrarPubHora` → `mtoGenerarICS`), y devuelven el ICS resultante a la app.

> Nota: al no existir una API pública, ambos backends dependen de la estructura actual del portal `sia.unizar.es`. Si la universidad cambia su web, pueden dejar de funcionar y requerir ajustes en `server/sia_client.py` / `worker/src/sia-client.js`.

## Uso

### Opción A: Desarrollo local (frontend + backend Python en el mismo origen)

1. Instala la dependencia (solo la primera vez):
   ```bash
   pip install requests
   ```
2. Arranca el servidor desde la carpeta del proyecto:
   ```bash
   python3 server/app.py
   ```
3. Abre [http://localhost:8000](http://localhost:8000) en tu navegador. Dejando vacía la "URL del backend" en el diálogo de búsqueda, la app usa el mismo origen (`/api/...`).

### Opción B: Despliegue en producción (frontend en GitHub Pages + backend en Cloudflare Workers)

GitHub Pages solo sirve contenido estático, así que el proxy se despliega por separado como un Cloudflare Worker (capa gratuita).

1. **Desplegar el Worker:**
   ```bash
   cd worker
   npm install
   npx wrangler login      # solo la primera vez, abre el navegador para autenticarte
   npx wrangler deploy --config wrangler.toml
   ```
   Al terminar, `wrangler` imprime la URL pública. `wrangler.toml` ya incluye un Custom Domain (`horario-api.vmbatlle.com`) apuntando al Worker, ya que `vmbatlle.com` está en la misma cuenta de Cloudflare; `wrangler deploy` crea el registro DNS y el certificado TLS automáticamente. Cambia el `pattern` en `wrangler.toml` si prefieras otro subdominio, o elimina el bloque `[[routes]]` para usar solo la URL `*.workers.dev`.
2. **Publicar el frontend en GitHub Pages:** activa GitHub Pages para este repositorio (Settings → Pages → Deploy from branch), sirviendo la raíz del proyecto (`index.html`, `css/`, `js/`). El worker no necesita subirse a Pages.
3. **Configurar la app:** abre tu sitio de GitHub Pages, haz clic en **Buscar horario EINA**, despliega "⚙️ URL del backend", pega `https://horario-api.vmbatlle.com` (o la URL `*.workers.dev` del paso 1) y pulsa **Guardar**. Queda guardada en `localStorage` del navegador, no hace falta tocar el código.
4. A partir de ahí, busca y carga tu horario igual que en local.

### Opción C: Carga manual de un ICS (sin backend)

1. Descarga el `.ics` desde [Horarios EINA](https://sia.unizar.es/pds/consultaPublica/look%5Bconpub%5DInicioPubHora?entradaPublica=true).
2. Abre `index.html` (localmente, o el sitio publicado en GitHub Pages).
3. Haz clic en **Abrir ICS** para cargar tu calendario.
4. Utiliza el panel lateral para filtrar asignaturas y grupos.
5. Exporta tu calendario personalizado mediante el botón **Guardar ICS**.
