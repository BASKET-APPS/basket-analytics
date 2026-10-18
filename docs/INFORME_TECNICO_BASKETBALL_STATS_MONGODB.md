# BASKETBALL STATS — INFORME TÉCNICO DE ARQUITECTURA E IMPLEMENTACIÓN

**Versión:** 2.0 · **Fecha:** 18/10/2026 · **Destinatario:** Codex / equipo de desarrollo  
**Estado:** Especificación objetivo; no implica que el software esté implementado.

## 1. Objetivo y alcance

Construir una aplicación responsive (web, tablet y móvil) de gestión y registro de estadísticas de baloncesto, con Next.js y MongoDB Atlas. Permite gestionar equipos, jugadores con fotografía y dorsal, temporadas, partidos en casa/fuera, captura de acciones en directo, quintetos, tiempos de participación, +/- y dashboards individuales y colectivos. La hoja de cálculo de referencia define las columnas estadísticas obligatorias.

### 1.1 Infraestructura existente, comprobada por capturas

| Recurso | Valor | Estado |
|---|---|---|
| Proveedor | MongoDB Atlas | Creado |
| Clúster | `basketball-stats` | Activo, Free M0 |
| Capacidad mostrada | 512 MB | Plan gratuito |
| Host SRV | `basketball-stats.wg39q6z.mongodb.net` | Visible en Atlas |
| MongoDB Compass | Conexión `Basketball Stats` | Conectada |
| Nombre previsto de BD | `basketball_stats` | Formulario preparado; confirmar pulsación Create Database |
| Primera colección | `teams` | Formulario preparado; confirmar creación |
| Región | AWS París `eu-west-3` | Seleccionada durante configuración; verificar en Atlas |
| Usuario de aplicación | `basketball_app` | Recomendado; no se ha confirmado su creación |

**Seguridad crítica:** una credencial administrativa fue compartida durante la configuración. **Rotarla inmediatamente** en Atlas y no reutilizarla en código, documentación, tickets o mensajes. No se incluye en este informe ninguna contraseña ni URI autenticada. Si Compass conserva la antigua credencial, actualizar su conexión después de rotarla.

## 2. Stack de referencia

- Next.js App Router, TypeScript estricto, React y Node.js runtime para acceso a MongoDB.
- MongoDB Atlas Free M0; driver oficial `mongodb` (no PostgreSQL, no SQL, no Prisma relacional).
- Zod para validación de entradas y modelos DTO.
- Tailwind CSS y componentes accesibles reutilizables; gráficos con biblioteca compatible con React.
- Autenticación con proveedor compatible con Next.js (p. ej. Auth.js) y autorización de equipo en servidor.
- Fotografías de jugadores en almacenamiento de objetos externo; guardar URL y metadatos, no binarios en MongoDB.
- Pruebas unitarias e integración con Vitest o equivalente; E2E con Playwright.
- No introducir dependencias que requieran un plan de pago sin aprobación.

## 3. Configuración de conexiones y secretos

### 3.1 MongoDB Atlas

1. En Atlas, `Database & Network Access` → crear un usuario `basketball_app` con autenticación por contraseña.
2. Conceder **readWrite solo sobre `basketball_stats`**. Usar temporalmente un usuario administrador únicamente para tareas de creación de índices si fuera necesario.
3. En Network Access, autorizar la IP del desarrollador; para despliegue revisar IP de salida del hosting. Evitar `0.0.0.0/0` salvo necesidad justificada y con controles adicionales.
4. Verificar que TLS/SRV funciona. Si se despliega en una plataforma con IP de salida dinámica, documentar la estrategia de conectividad antes de abrir la red.
5. Las contraseñas con caracteres reservados deben codificarse con `encodeURIComponent` al construir la URI; no registrar secretos en logs.

### 3.2 Variables de entorno

Archivo **`.env.local`**, exclusivamente local y fuera de Git:

```dotenv
MONGODB_URI="mongodb+srv://basketball_app:<PASSWORD_URL_ENCODED>@basketball-stats.wg39q6z.mongodb.net/basketball_stats?retryWrites=true&w=majority"
MONGODB_DB="basketball_stats"
```

Archivo **`.env.example`**: únicamente marcadores de posición, nunca secretos. Configurar los mismos valores en el gestor de secretos del hosting para producción. No utilizar prefijo `NEXT_PUBLIC_`.

### 3.3 Cliente singleton de MongoDB

```ts
// src/lib/mongodb.ts (server-only)
import 'server-only';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI no configurada');

const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

const clientPromise =
  globalForMongo._mongoClientPromise ?? new MongoClient(uri).connect();

if (process.env.NODE_ENV !== 'production') {
  globalForMongo._mongoClientPromise = clientPromise;
}

export async function getDb() {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB ?? 'basketball_stats');
}
```

No llamar al driver desde Client Components. Las operaciones deben ejecutarse en Route Handlers / Server Actions, siempre con sesión y permisos verificados. Desactivar runtime Edge en las rutas que dependan del driver de Node.js.

## 4. Esquema lógico y relaciones

**Convención:** `_id` y referencias (`teamId`, `playerId`, `seasonId`, `matchId`, `userId`) son `ObjectId`; fechas son `Date` UTC; duraciones enteros en ms o segundos según campo; enums controlados. Las relaciones se verifican desde la capa de servicios porque MongoDB no aplica claves foráneas. Usar `createdAt`, `updatedAt` y, cuando proceda, `version`.

```text
teams ──< seasons ──< matches ──< match_events
  │          │             ├──< player_stints
  │          │             ├──< match_lineups
  │          │             ├──< player_match_stats (derivada)
  │          │             └─── team_match_stats (derivada)
  │          └──< roster_memberships >── players
  └──< team_memberships >── users
                                  audit_logs (transversal)
```

### 4.1 Catálogo de colecciones (13)

| Colección | Campos principales | Uso |
|---|---|---|
| `teams` | `name`, `shortName`, `logoUrl`, `category`, `homeVenue`, `isActive` | Club/equipo |
| `players` | `fullName`, `photoUrl`, `birthDate?`, `preferredNumber?`, `position?`, `isActive` | Identidad del jugador |
| `seasons` | `teamId`, `name`, `startDate`, `endDate`, `competition?`, `periods`, `periodDurationSeconds`, `overtimeDurationSeconds`, `status` | Configuración de temporada y reglamento |
| `roster_memberships` | `teamId`, `seasonId`, `playerId`, `jerseyNumber`, `activeFrom`, `activeTo?`, `status` | Inscripción y dorsal por temporada |
| `matches` | `seasonId`, `teamId`, `opponentName`, `startsAt`, `venueType`, `status`, `period`, `clockSecondsRemaining`, `scoreFor`, `scoreAgainst`, `lineupPlayerIds`, `version` | Calendario y estado del partido |
| `match_events` | `matchId`, `clientEventId`, `sequence`, `period`, `elapsedMs`, `side`, `playerId?`, `type`, `points?`, `shotValue?`, `result?`, `onCourtPlayerIds`, `voidedAt?` | Registro auditable de acciones |
| `player_stints` | `matchId`, `playerId`, `startElapsedMs`, `endElapsedMs?`, `startPeriod`, `endPeriod?` | Intervalos en pista |
| `match_lineups` | `matchId`, `playerIds[5]`, `startElapsedMs`, `endElapsedMs?` | Quintetos e intervalos |
| `player_match_stats` | `matchId`, `playerId`, estadísticas, `plusMinus`, `valuation`, `computedAt`, `sourceVersion` | Proyección individual |
| `team_match_stats` | `matchId`, `teamId`, estadísticas, `computedAt`, `sourceVersion` | Proyección colectiva |
| `users` | `authProviderId`, `email`, `displayName` | Usuarios autenticados |
| `team_memberships` | `teamId`, `userId`, `role` | Autorización por equipo |
| `audit_logs` | `actorUserId`, `entityType`, `entityId`, `action`, `before?`, `after?`, `createdAt` | Trazabilidad |

### 4.2 Ejemplos documentales

**Equipo**
```json
{"_id":"ObjectId(...)","name":"Liceo Francés","shortName":"Liceo","category":"Senior","logoUrl":null,"isActive":true}
```

**Jugador**
```json
{"_id":"ObjectId(...)","fullName":"Jugador de ejemplo","photoUrl":null,"position":"BASE","isActive":true}
```

**Partido**
```json
{"_id":"ObjectId(...)","teamId":"ObjectId(...)","seasonId":"ObjectId(...)","opponentName":"Rival","venueType":"HOME","status":"SCHEDULED","scoreFor":0,"scoreAgainst":0,"lineupPlayerIds":[],"version":0}
```

**Evento de canasta**
```json
{"_id":"ObjectId(...)","matchId":"ObjectId(...)","clientEventId":"uuid-v4","sequence":42,"period":2,"elapsedMs":735000,"side":"FOR","type":"SHOT","shotValue":3,"result":"MADE","points":3,"playerId":"ObjectId(...)","onCourtPlayerIds":["id1","id2","id3","id4","id5"],"voidedAt":null}
```

Los ejemplos usan marcadores para `ObjectId`; el código debe guardar valores BSON reales, no cadenas literales `ObjectId(...)`.

### 4.3 Eventos admitidos

`SHOT`, `FREE_THROW`, `REBOUND`, `ASSIST`, `STEAL`, `TURNOVER`, `BLOCK_FOR`, `BLOCK_AGAINST`, `FOUL_COMMITTED`, `FOUL_DRAWN`, `SUBSTITUTION`, `PERIOD_START`, `PERIOD_END`, `SCORE_ADJUSTMENT`.

Campos complementarios: `assistPlayerId`, `reboundKind`, `foulKind`, `playerOutId`, `playerInId`, `relatedEventId`, `createdBy`, `createdAt`. `side='AGAINST'` permite capturar anotaciones rivales sin dar de alta la plantilla contraria. La captura del quinteto en cada evento de puntuación es obligatoria para +/-.

**Importante:** no contar doble una asistencia si se registra tanto como evento separado como referencia del tiro; elegir una única convención de cálculo. Los eventos anulados deben permanecer para auditoría, pero excluirse de agregados.

## 5. Índices recomendados

- `roster_memberships`: único `{seasonId:1, playerId:1}`; índice `{teamId:1, seasonId:1, jerseyNumber:1}`. Validar unicidad del dorsal activo por temporada (la simple unicidad sin filtro impediría reutilizaciones históricas).
- `matches`: `{seasonId:1, startsAt:-1}`, `{teamId:1, venueType:1, startsAt:-1}`.
- `match_events`: únicos `{matchId:1, clientEventId:1}` y `{matchId:1, sequence:1}`; consulta `{matchId:1, period:1, elapsedMs:1}`.
- `player_stints`: `{matchId:1, playerId:1, startElapsedMs:1}`.
- `match_lineups`: `{matchId:1, startElapsedMs:1}`.
- `player_match_stats`: único `{matchId:1, playerId:1}`.
- `team_match_stats`: único `{matchId:1, teamId:1}`.
- `users`: único `{authProviderId:1}`; email único normalizado si aplica.
- `team_memberships`: único `{teamId:1, userId:1}`.
- `audit_logs`: `{entityType:1, entityId:1, createdAt:-1}`.

El script `init-mongodb.mjs` adjunto crea colecciones e índices iniciales; **no incluye validadores JSON Schema exhaustivos ni garantiza todas las invariantes de negocio**. Codex debe completar validaciones con Zod y servicios y revisar índices contra los patrones de consulta reales. Ejecutarlo con un usuario autorizado para crear colecciones/índices; posteriormente usar el usuario restringido de la app.

## 6. Reglas de cálculo estadístico

La tabla de la captura original incluye: `Min`, `Pts`, `T2A`, `T2I`, `T2%`, `T3A`, `T3I`, `T3%`, `T1A`, `T1I`, `T1%`, `DReb`, `OReb`, `TReb`, `Asis`, `Rec`, `Per`, `TapF`, `TapC`, `Falt`, `FaltR`, `Val`, `Partidos`. Añadir `+/-` y filtros casa/fuera.

- `A` = aciertos; `I` = intentos (NO fallos). `Pts = 2*T2A + 3*T3A + T1A`.
- `% tiro = 100*sum(aciertos)/sum(intentos)`; si no hay intentos, mostrar `—`.
- `TReb = DReb + OReb`.
- `Min = suma de duración de player_stints` (mostrar `mm:ss` por partido y `hh:mm:ss` acumulado si procede).
- `Partidos = nº de partidos con tiempo efectivo positivo`, no nº de convocatorias.
- `+/- jugador = suma de puntos propios anotados mientras está en pista − suma de puntos rivales anotados mientras está en pista`.
- Valoración provisional: `Pts + TReb + Asis + Rec + TapF + FaltR − (T2I−T2A) − (T3I−T3A) − (T1I−T1A) − Per − TapC − Falt`. **Confirmar fórmula exacta con el club**.
- Los porcentajes de temporada se calculan ponderados por intentos, nunca como media aritmética de porcentajes por partido.
- Totales individuales y de equipo deben derivarse de eventos activos; las colecciones de estadísticas son cachés recalculables.

### 6.1 Algoritmo +/- y minutos

1. Al iniciar el partido, exigir exactamente 5 titulares; abrir `player_stints` y un `match_lineups`.
2. Al sustituir, cerrar el stint del saliente y abrir el del entrante con el mismo `elapsedMs`; cerrar/abrir quinteto. Registrar evento con identificador idempotente.
3. Al anotar un tiro propio o rival, congelar `onCourtPlayerIds` (5 IDs válidos) en el evento y sumar/restar puntos al +/- de esos cinco jugadores.
4. Corregir acciones mediante anulación lógica y sustitución auditada; recalcular marcador, valoración, minutos y +/- desde eventos e intervalos válidos.
5. Controlar el tiempo con reloj lógico monotónico de partido (incluidas prórrogas). Las pausas entre periodos no deben incrementar minutos efectivos.
6. No permitir seis jugadores simultáneos, intervalos solapados ni sustituciones de jugadores que no estén donde corresponde.

**Concurrencia:** en M0 no dar por supuesta la disponibilidad de transacciones multidocumento. Implementar operaciones idempotentes, control de versión optimista, recuperación/reconciliación de estados y verificar expresamente las capacidades del clúster antes de depender de transacciones. El evento debe poder reprocesarse sin duplicarse.

## 7. Arquitectura de aplicación y API

```text
src/
  app/
    (auth)/login/
    (dashboard)/teams/[teamId]/
    (dashboard)/matches/[matchId]/live/
    (dashboard)/analytics/
    api/teams/route.ts
    api/players/route.ts
    api/seasons/route.ts
    api/matches/route.ts
    api/matches/[matchId]/events/route.ts
    api/matches/[matchId]/substitutions/route.ts
    api/analytics/route.ts
  components/{ui,live,analytics,roster}/
  lib/{mongodb,auth,validation}/
  server/{repositories,services,stats}/
  types/
scripts/init-mongodb.mjs
```

**Operaciones REST orientativas:** `GET/POST /api/teams`, `GET/POST /api/players`, `GET/POST /api/seasons`, `GET/POST /api/matches`, `POST /api/matches/:id/start`, `POST /api/matches/:id/events`, `POST /api/matches/:id/substitutions`, `POST /api/matches/:id/finalize`, `GET /api/analytics?teamId=...&seasonId=...&venueType=HOME`.

Cada escritura exige: autenticación, autorización por equipo, Zod, verificación de pertenencia de jugador, `clientEventId` único, límites de tamaño, respuesta con versión actualizada y logging sin secretos. Validar parámetros y ObjectId para evitar inyección de operadores MongoDB. No aceptar filtros Mongo arbitrarios desde el cliente.

## 8. UI/UX y responsive

- Identidad: **DM Sans** texto y navegación, **Barlow Condensed** títulos; fuentes locales del proyecto.
- Colores: `#101D2F` azul marino, `#00C4D5` turquesa, `#F5F3ED` crema, `#6C737B` secundario, `#DEDFDC` bordes.
- Logo: `public/club/logo.png` como marca y favicon.
- Móvil: panel de captura con botones grandes, jugador activo visible, confirmación visual inmediata, undo/corrección, indicador de conexión y sincronización.
- Tablet: plantilla y botones de eventos en dos columnas; quinteto siempre visible.
- Escritorio: tabla estadística completa con columnas fijadas, filtros, exportación CSV y dashboards.
- Filtros: equipo, temporada, jugador, partido, rival, fecha, local/visitante, periodo; vistas total, media/partido y métricas porcentuales.
- Accesibilidad: áreas táctiles suficientes, navegación por teclado, contraste, estados no expresados solo por color.

## 9. Disponibilidad, almacenamiento y operación

- Atlas Free M0 es adecuado para MVP y uso limitado, **no garantizar rendimiento o SLA de producción**.
- Mantener índices controlados y no guardar fotografías ni archivos grandes en MongoDB.
- Paginación de eventos, consultas con proyección, agregados precalculados y caché invalidable por `sourceVersion`.
- Backups: el plan gratuito puede carecer de backups gestionados; implementar exportaciones periódicas verificadas y documentar restauración.
- Monitorizar almacenamiento, número de conexiones, latencia y errores de sincronización.
- Política de retención y privacidad: mínimo dato personal de jugadores, acceso por rol y borrado/anonimización conforme a requisitos aplicables.
- Si se usa cola offline en móvil, cifrar/proteger datos locales cuando proceda y resolver conflictos de forma explícita.

## 10. Pruebas y criterios de aceptación

1. Crear equipo, temporada, jugadores con foto y dorsales; impedir duplicidades activas de dorsal.
2. Crear partidos HOME/AWAY y consultar estadísticas filtradas sin mezclas.
3. Capturar tiro de 2/3/1 anotado/fallado y comprobar intentos, aciertos y porcentajes.
4. Capturar robos, pérdidas, rebotes, asistencias, tapones y faltas.
5. Cambiar quinteto y comprobar minutos y +/- ante anotaciones de ambos equipos.
6. Corregir tiro y verificar recálculo sin doble conteo.
7. Reintentar el mismo `clientEventId` y verificar que solo se aplica una vez.
8. Dos dispositivos simultáneos: detectar versiones obsoletas y evitar estados inconsistentes.
9. Validar estadísticas totales y ponderadas frente a la hoja de referencia.
10. Comprobar que un usuario de otro equipo no puede leer/escribir datos ajenos.
11. Verificar diseño en móvil, tablet y escritorio y que ninguna credencial llega al bundle cliente.
12. Ejecutar script de índices dos veces sin duplicar ni destruir información.

## 11. Plan de trabajo para Codex

**Fase 0 — Seguridad:** rotar credencial expuesta; crear usuario `basketball_app`; revisar IP allowlist; preparar `.env.local` y `.env.example`.

**Fase 1 — Fundaciones:** Next.js, diseño, conexión singleton, autenticación, autorización, Zod, script de índices y health check de BD protegido.

**Fase 2 — Catálogos:** equipos, jugadores, fotografías, temporadas, plantillas, dorsales, partidos.

**Fase 3 — Captura en directo:** inicio, quintetos, eventos, marcador rival, sustituciones, cronómetro, deshacer, idempotencia y recuperación.

**Fase 4 — Motor estadístico:** proyecciones, fórmulas, +/- y valoración configurable, filtros HOME/AWAY, CSV.

**Fase 5 — Analítica:** panel individual/colectivo, tablas, gráficos, comparaciones y responsive.

**Fase 6 — Calidad y despliegue:** pruebas, seguridad, observabilidad, exportación de respaldo y despliegue con secretos del proveedor.

## 12. Instrucción maestra para Codex

> Implementa Basketball Stats usando este documento como especificación técnica principal y el informe funcional existente como fuente de requisitos de producto. Sustituye cualquier mención anterior de PostgreSQL/Prisma SQL por MongoDB Atlas con driver oficial Node.js. Mantén como fuente de verdad `match_events` y `player_stints`. No inventes credenciales ni las escribas en el repositorio. Implementa por fases, con pruebas y criterios de aceptación, y detente ante decisiones funcionales ambiguas (por ejemplo, fórmula exacta de valoración). Antes de desarrollar, revisa el script de inicialización y la seguridad del clúster.

## 13. Pendientes que requieren confirmación

- Confirmar que se pulsó **Create Database** y que existen `basketball_stats.teams`.
- Confirmar rotación de contraseña del usuario anterior.
- Confirmar usuario restringido `basketball_app` y acceso de red para entorno de desarrollo/despliegue.
- Confirmar reglamento de duración de periodos/prórrogas y fórmula de valoración del club.
- Elegir proveedor de autenticación, alojamiento Next.js y almacenamiento de fotografías.

---
**Anexo:** acompañar con `MODELO_MONGODB.md`, `init-mongodb.mjs` y la imagen de la hoja estadística de referencia. No ejecutar el script en producción sin revisar los permisos, índices y estrategia de migraciones.
