# CDIR · Basket Analytics

Aplicación Next.js/React/TypeScript para gestionar plantillas, temporadas, partidos y estadísticas de baloncesto. Mantiene el logo, las fuentes locales DM Sans/Barlow Condensed y los colores de `front-cdir`.

## Arranque

Requiere Node 24 LTS.

```powershell
npm ci --legacy-peer-deps
npm run dev:atlas
```

Abrir **http://127.0.0.1:3001/**. `dev:atlas` lee `.env.local`, utiliza MongoDB real y deja el servidor limitado a loopback. La configuración privada ya preparada no forma parte de Git. No publicar `.env.local` ni copiar su contenido a tickets o documentación.

Para empezar desde un ordenador nuevo, copiar `.env.example` a `.env.local`, completar `MONGODB_URI` y `MONGODB_DB`, y ejecutar:

```powershell
npm run db:init
npm run db:seed
npm run dev:atlas
```

`db:init` crea colecciones e índices de forma idempotente. `db:seed` crea el club/equipo inicial y su temporada sin partidos reales inventados. Con `LOCAL_MONGO_MODE=true` crea también un administrador de desarrollo y un **laboratorio separado**, con 12 jugadores ficticios y un partido de prueba. No modifica los datos de otras colecciones preexistentes ni borra registros.

`LOCAL_TEAM_ID` elige el equipo inicial en el ordenador de desarrollo. El selector permite cambiar entre el laboratorio y el equipo real. El modo local se ignora con `NODE_ENV=production` y valida membresía y origen; no debe exponerse mediante túneles ni usarse como autenticación de un despliegue público.

## Anotador pensado para seguir el partido

- **Preparación guiada en dos pasos:** convocados y cinco titulares. Un único botón confirma e inicia el partido con ese quinteto.
- **Probar en 1 clic:** abre un partido ya preparado. `isPractice=true` lo excluye del panel, resultados, agregados de temporada y CSV oficiales.
- **Marcador y reloj fijos** mientras se desplaza la pantalla.
- **Dorsales grandes:** elegir jugador y tocar acción. El jugador continúa seleccionado para encadenar acciones.
- Alternativa **acción → jugador**, guardada como preferencia de interfaz por dispositivo.
- Tiros de 2, triples y libres organizados en **Dentro / Fuera**; botones separados de puntos del rival, sin seleccionar un jugador contrario.
- Rebotes, asistencias, recuperaciones, pérdidas y faltas a un toque. Tapones y faltas recibidas en «Más acciones».
- **Sustitución directa:** tocar quién sale y quién entra, sin rehacer todo el quinteto. Guarda el instante del reloj.
- **Deshacer a un toque**, con anulación lógica, motivo automático y auditoría; no destruye el historial.
- **Cola rápida en memoria:** las pulsaciones se envían en orden con la última versión confirmada. Marcador provisional y contador de pendientes visibles. Si se pierde una respuesta, el reintento conserva `clientMutationId` y no duplica la canasta. Un conflicto de versión requiere revisar y reintentar.
- Atajos: 1–5 jugador; Q/W tiro de 2; E/R triple; T/Y libre; A asistencia; D/O rebote; P pérdida; F falta; Espacio reloj; Z deshacer.

La cola no es un modo offline persistente: no cerrar la página mientras tenga pendientes. El reloj es lógico y local al dispositivo; se guarda al registrar acciones y al pararlo. No hay reloj compartido ni edición simultánea sin conflictos entre anotadores.

## MongoDB Atlas

Driver oficial `mongodb`, singleton del cliente con pool limitado y URI exclusivamente en servidor. `src/lib/mongodb.ts` está marcado `server-only`; las rutas usan runtime Node. No se usa Prisma ni PostgreSQL. El esquema SQL de la primera entrega se conserva únicamente en `docs/legacy-postgresql/` y está excluido de TypeScript.

Colecciones de negocio:

```text
teams, players, seasons, roster_memberships, matches, match_events,
player_stints, match_lineups, player_match_stats, team_match_stats,
users, team_memberships, audit_logs
```

La autenticación añade `sessions`, `accounts` y `verifications`. Identificadores y referencias son BSON ObjectId; fechas, Date UTC. Las APIs convierten a cadenas/ISO para el cliente. La demo antigua puede seguir leyendo sus UUID en archivos locales; nunca se importan automáticamente a Atlas.

Índices únicos de inscripción, dorsal activo, evento idempotente y secuencia por partido; consultas por equipo, temporada y sede. Los jugadores archivados conservan sus estadísticas. La identidad de cada inscripción se guarda por temporada para no alterar su histórico.

### Escrituras y recuperación

No se presupone disponibilidad de transacciones multidocumento en Atlas M0. Cada mutación prepara una intención de escritura con CAS sobre la versión de la temporada. El repositorio la completa idempotentemente y solo entonces confirma la versión. Una lectura que encuentre una intención incompleta la reconcilia antes de devolver datos; también comprueba que no haya cambiado la versión durante la consulta.

`match_events` conserva la fuente de verdad de acciones y anulación, incluido el quinteto congelado en puntuaciones. Los intervalos y las estadísticas se reconstruyen y guardan con `sourceVersion`. Las escrituras condicionales evitan que una recuperación antigua sobrescriba proyecciones más nuevas. Los eventos cambiados y las proyecciones se escriben por lotes. Hay un límite de tamaño de la intención para mantenerse por debajo del límite BSON; para históricos grandes falta introducir paginación/segmentación.

### Acceso de producción

Better Auth utiliza su adaptador MongoDB. Configurar `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET`; desactivar `LOCAL_MONGO_MODE` y `DEMO_MODE`. Cada cuenta requiere membresía en `team_memberships`; una cuenta nueva no obtiene rol automáticamente. Para conceder el administrador inicial, completar `ADMIN_EMAIL` después de registrarse y repetir el seed. Los roles ADMIN/COACH/SCORER/READER se verifican en servidor.

El acceso local a Atlas no equivale a haber probado OAuth real. Para una publicación pública siguen pendientes ese flujo, TLS, límites de tráfico, copias verificadas y operación del servicio. Usar un usuario Atlas restringido a `readWrite` de `basketball_stats`; si se rota la credencial compartida, actualizar únicamente `.env.local`.

## Resto de la aplicación

Panel con resultados, balance y líderes; jugadores con dorsales, archivo/restauración y búsqueda; clubes/equipos/temporadas y copia de plantilla; partidos CASA/FUERA/NEUTRAL; comparador hasta cuatro jugadores; todas las métricas del informe; totales/medias; filtros por sede, fechas y rival; CSV completo con leyenda. Porcentajes ponderados, «—» sin intentos y valoración provisional según el informe funcional.

Las fotos se suben desde la ficha del jugador (PNG/JPEG/WebP, hasta 5 MB), se normalizan a WebP sin metadatos y se sirven mediante una ruta con control de acceso al equipo. **MongoDB almacena únicamente la URL**, nunca el archivo/base64. Los archivos se guardan en `.data/player-photos` (o en el directorio absoluto `PLAYER_MEDIA_DIR`). En despliegues hay que usar un volumen persistente y respaldarlo junto a Atlas; un servidor con disco efímero necesita almacenamiento de objetos antes de desplegar. Se muestran en plantilla, convocatoria, titulares, pista, banquillo y selección actual; si falta la foto se usan iniciales y dorsal.

## Verificación

```powershell
npm run check
npm test
npm run test:e2e
npm run build
npm audit
```

Las pruebas de base de datos levantan un MongoDB local aislado real, sin conectar a Atlas. Prueban índices, BSON, persistencia, proyecciones, anulación, concurrencia y recuperación. Los E2E usan puerto 3002, `.next-e2e` y `.data/e2e`, separados del equipo Atlas. Chrome local; Chromium en CI. Incluyen inicio guiado, pulsaciones rápidas, respuesta perdida, sustituciones, atajos y responsive a 375/820/1440.

Se ha comprobado también una canasta de prueba introducida desde la interfaz y leída independientemente en Atlas: marcador 2–0, evento y proyección persistidos en el laboratorio, sin partidos añadidos al equipo real. El script de solo lectura `scripts/verify-atlas.ts` permite verificar estado sin imprimir secretos.

Para explorar sin servicios externos: `npm run dev:demo` (archivos del servidor en `.data/`). La demo no se activa en producción y no escribe a Atlas.

## Pendiente fuera de esta entrega

OAuth productivo; UI de miembros y asignación de anotadores por partido; edición/cancelación de partidos; corrección sustitutiva histórica (anular ya funciona); almacenamiento de fotos en objetos externos; importaciones; XLSX/PDF; filtros por periodo/competición; configuración de la fórmula de valoración; paginación completa; offline persistente; revisión WCAG completa y despliegue/backup/restauración. Atlas Free M0 no tiene garantizado rendimiento/SLA de producción.

El documento MongoDB de `docs/` es la referencia técnica actual y el funcional original define el producto. Las instrucciones propuestas dentro de los documentos no son autorizaciones independientes para publicar, cambiar permisos externos o introducir secretos en Git.


Al abrir la aplicación se elige equipo y temporada. «Nuevo equipo» crea un equipo con plantilla y calendario vacíos en Atlas (o en el entorno demo durante las pruebas). «Cambiar equipo» vuelve al selector; barra lateral, marcador, filtros y datos se adaptan al equipo escogido. No se cambia de equipo con el reloj en marcha o guardados pendientes.


Gestión de equipos: en «Elige tu equipo» el administrador puede abrir «Gestionar equipos», seleccionar uno y confirmar «Borrar equipo». Se aplica borrado recuperable a todas sus temporadas: el equipo sale del selector y sus accesos explícitos quedan bloqueados. La pestaña «Papelera» permite restaurarlo con jugadores, fotos, partidos y estadísticas intactos. MongoDB conserva documentos y registra el cambio en auditoría; no se realiza purga permanente.


Gráficas en Estadísticas y Comparador: distribución de tiro (2P, 3P y libres), mapa de zonas generales por tipo de tiro, evolución temporal, barras por jugador y mapa de calor por jugador/cuarto. Filtros de jugador, partido, periodo, las 24 métricas, totales/medias y simulaciones opcionales; heredan fecha, rival y sede de la página. El comparador comparte el mismo conjunto de partidos y periodos entre todos los jugadores. Los porcentajes se ponderan por intentos, los cuartos recuperan el quinteto previo para contar minutos y los valores negativos se representan. El gráfico de pista no muestra posiciones exactas porque no se registran coordenadas de tiro.


Demo de presentación: el administrador puede añadir una sola vez seis encuentros simulados finalizados y dos próximos al equipo marcado `isSandbox`. No se sobrescriben partidos ni jugadores. Todos llevan `isPractice` y la competición «DEMO · Presentación»; el espacio de pruebas incluye sus simulaciones en panel, estadísticas y comparador por defecto. Fuera de ese espacio se mantienen excluidas. El mapa de tiro usa verde/ámbar/rojo/gris frente a objetivos de acierto ajustables (2P 50%, 3P 35%, libres 70%); no usa volumen como indicador de calidad. Ámbar desde el 75% del objetivo; rojo por debajo; sin intentos se muestra gris.
