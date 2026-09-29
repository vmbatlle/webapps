# Filtro de Calendario Académico ICS

Herramienta web interactiva para cargar, filtrar y visualizar calendarios académicos en formato `.ics`.

## Características

- � **Búsqueda integrada de horarios EINA**: consulta y carga tu horario directamente desde la app, sin pasar por el portal externo.
- 📁 **Carga de archivos ICS**: Procesa eventos directamente en el navegador (alternativa manual).
- 🎯 **Filtros personalizados**: Selección/deselección por asignatura, grupos y tipo de docencia.
- ⏱️ **Carga Lectiva**: Cálculo automático de horas lectivas totales y desglosadas sin decimales.
- 📅 **Vista previa con FullCalendar**: Visualización clara con días seleccionados resaltados.
- 💾 **Exportación**: Descarga un archivo `.ics` actualizado con solo los eventos filtrados.

## Tecnologías Utilizadas

- HTML5 / Vanilla JavaScript (ES6)
- [Tailwind CSS](https://tailwindcss.com/)
- [FullCalendar v6](https://fullcalendar.io/)
- Python 3 (`http.server` + `requests`) para el proxy local que consulta el portal de horarios

## Uso

### Opción A: Búsqueda integrada (recomendada)

El portal público de horarios de la EINA ([sia.unizar.es](https://sia.unizar.es/pds/consultaPublica/look%5Bconpub%5DInicioPubHora?entradaPublica=true)) no ofrece una API, así que se incluye un pequeño servidor local (`server/app.py`) que reproduce la misma secuencia de peticiones que hace el navegador al buscar un horario y pulsar "Descargar", y expone el resultado a la app.

1. Instala la dependencia (solo la primera vez):
   ```bash
   pip install requests
   ```
2. Arranca el servidor desde la carpeta del proyecto:
   ```bash
   python3 server/app.py
   ```
3. Abre [http://localhost:8000](http://localhost:8000) en tu navegador.
4. Haz clic en **Buscar horario EINA**, elige curso académico, plan de estudio, curso, periodo, asignaturas y grupos, y pulsa **Cargar horario**. El horario se carga directamente, sin descargar ni subir ningún archivo.

> Nota: al no existir una API pública, este servidor depende de la estructura actual del portal `sia.unizar.es`. Si la universidad cambia su web, puede dejar de funcionar y requerir ajustes en `server/sia_client.py`.

### Opción B: Carga manual de un ICS

1. Descarga el `.ics` desde [Horarios EINA](https://sia.unizar.es/pds/consultaPublica/look%5Bconpub%5DInicioPubHora?entradaPublica=true).
2. Abre `index.html` en un navegador web (puede servirse igualmente con `python3 server/app.py`, o abrirse directamente como archivo).
3. Haz clic en **Abrir ICS** para cargar tu calendario.
4. Utiliza el panel lateral para filtrar asignaturas y grupos.
5. Exporta tu calendario personalizado mediante el botón **Guardar ICS**.
