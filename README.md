# Monitoreo de Cambios de Modelo

Tablero para monitorear cambios de modelo (SMED) en las líneas **Press** y **Driveshaft**. Tiene login y una base de datos en vivo compartida por todo el equipo.

## Qué incluye
- **Página de inicio con login.** Roles: **Administrador**, **Capturista** y **Solo lectura**. Los permisos se validan en el servidor.
- **Matriz XY (De → A)** con tres vistas: estándar, real promedio y desviación. Se puede filtrar por línea y por periodo.
- **Gráficas de real vs estándar:** por transición, tendencia, por línea o turno, y Pareto de minutos perdidos.
- **Registro de cambios** uno por uno o masivo desde Excel/CSV, incluida la exportación de Ignition (Date, Reasons, Location, Qty).
- **Importar y exportar** la configuración completa en Excel: líneas, modelos, TiposCambio y estándares.
- **Datos en vivo.** Todos ven lo mismo y la pantalla se actualiza sola cada 10 segundos.

| Rol | Puede |
|---|---|
| Administrador | Todo: usuarios, líneas, modelos, estándares, importar plantilla, borrar registros |
| Capturista | Registrar cambios e importar registros (masivo / Ignition) |
| Solo lectura | Ver matriz, gráficas y registros |

## Desplegar en Vercel con base de datos en Turso (una sola vez)

### 1. Crear la base de datos en Turso
1. Entra a [turso.tech](https://turso.tech) con tu cuenta de GitHub.
2. Crea una base de datos nueva, por ejemplo `cambios-de-modelo`. La región puede ser la más cercana, por ejemplo AWS us-east o Dallas.
3. Dentro de la base copia la **URL**. Empieza con `libsql://…`.
4. Genera un **token**: en *Create Token*, con permiso de lectura y escritura y sin expiración. Cópialo.

Si prefieres la CLI: `turso db create cambios-de-modelo`, luego `turso db show cambios-de-modelo --url` y `turso db tokens create cambios-de-modelo`.

### 2. Importar el repositorio en Vercel
1. Entra a [vercel.com/new](https://vercel.com/new) y elige el repositorio **cambios-de-modelo**.
2. Antes de darle *Deploy*, abre **Environment Variables** y agrega:

| Variable | Valor |
|---|---|
| `TURSO_DATABASE_URL` | La URL `libsql://…` del paso 1 |
| `TURSO_AUTH_TOKEN` | El token del paso 1 |
| `SESSION_SECRET` | Una frase larga y aleatoria que tú inventes, de 40 caracteres o más. Firma las sesiones; no la compartas. |

3. Dale **Deploy**. Vercel te da una dirección como `https://cambios-de-modelo.vercel.app`.

### 3. Primer uso
1. Abre la dirección. La primera vez te pide **crear el usuario administrador**.
2. Sube [`plantillas/Plantilla_Cambios_de_Modelo.xlsx`](plantillas/Plantilla_Cambios_de_Modelo.xlsx) con **Importar Excel** para cargar líneas, modelos y estándares.
3. En la tarjeta **Usuarios**, al final de la página, da de alta a cada ingeniero con su rol.
4. Comparte la dirección. Cada persona entra con su usuario y contraseña.

Cada `git push` a `main` vuelve a publicar la app en Vercel automáticamente. Los datos en Turso no se pierden.

## Plantillas
- [`plantillas/Plantilla_Cambios_de_Modelo.xlsx`](plantillas/Plantilla_Cambios_de_Modelo.xlsx): configuración. Se sube con **Importar Excel**.
- [`plantillas/Plantilla_Registros_Cambio.xlsx`](plantillas/Plantilla_Registros_Cambio.xlsx): registros para carga masiva. Se sube con **Importar registros (masivo)**.

También se pueden descargar desde la app en `/plantillas/…`.

## Correr en tu computadora (opcional)
```bash
npm install
npm start        # http://localhost:3000
```
Sin `TURSO_DATABASE_URL`, los datos se guardan en `data/cambios.db`.

## GitHub Pages
`index.html` en la raíz del repo sigue funcionando en GitHub Pages en **modo local**: no tiene servidor, los datos y usuarios se guardan en el navegador de cada computadora. Para el equipo usa la dirección de **Vercel**.

## Estructura
```
server.js          Servidor (API + archivos estáticos). En Vercel corre como función.
lib/db.js          Conexión a Turso (o SQLite local) y creación de tablas
lib/auth.js        Contraseñas (scrypt) y sesión firmada en cookie httpOnly
public/index.html  La app
public/plantillas  Plantillas de Excel descargables
vercel.json        Configuración de Vercel
```
