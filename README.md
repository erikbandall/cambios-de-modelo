# Monitoreo de Cambios de Modelo

Dashboard para monitorear cambios de modelo (SMED) en las líneas **Press** y **Driveshaft**.

**Abrir la app:** https://erikbandall.github.io/cambios-de-modelo/

## Qué incluye
- **Matriz XY (De → A)** con tres vistas: estándar, real promedio y desviación.
- **Filtros** por línea y por periodo.
- **Gráficas** de real contra estándar: por transición, tendencia, por línea o turno, y Pareto de minutos perdidos.
- **Registro de cambios** uno por uno o de forma masiva, desde Excel o CSV (por ejemplo, la exportación de Ignition con Date, Reasons, Location y Qty).
- **Importar y exportar** la configuración completa en Excel: líneas, modelos, tipos de cambio y estándares.
- **Login** con roles: Administrador, Capturista y Solo lectura.

## Plantillas
- [`plantillas/Plantilla_Cambios_de_Modelo.xlsx`](plantillas/Plantilla_Cambios_de_Modelo.xlsx): configuración (líneas, modelos, TiposCambio, estándares y matrices). Se sube con **Importar Excel**.
- [`plantillas/Plantilla_Registros_Cambio.xlsx`](plantillas/Plantilla_Registros_Cambio.xlsx): registros de cambio para carga masiva. Se sube con **Importar registros (masivo)**.

## Importante
- **Datos:** se guardan en el navegador de cada computadora (localStorage). No se comparten entre equipos. Haz respaldo con **Exportar a Excel**.
- **Usuarios y contraseñas:** también son locales a cada navegador. Sirven para identificar quién captura, pero no son una protección fuerte.
- **Gráficas:** necesitan internet, porque Chart.js se carga desde cdnjs.
