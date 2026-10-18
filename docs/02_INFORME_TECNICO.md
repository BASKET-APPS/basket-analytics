# INFORME TÉCNICO (TDD) — Plataforma de estadísticas de baloncesto
Versión 1.0 · 18/10/2026 · Guía de implementación para Codex

## 1. Arquitectura propuesta
- Next.js (App Router) + TypeScript estricto + React, Server Components para lectura y Client Components para anotación en directo.
- Tailwind CSS + componentes accesibles (shadcn/ui o Radix), iconos Lucide, Recharts para gráficos.
- PostgreSQL + Prisma ORM; migraciones versionadas. Base de datos relacional como fuente de verdad.
- Auth.js o proveedor de identidad equivalente con sesiones seguras y RBAC por equipo; no construir autenticación casera.
- Almacenamiento compatible S3 para fotos y escudos; URLs firmadas para subida, validación MIME/tamaño, compresión y borrado controlado.
- Actualizaciones en directo mediante servicio realtime/WebSockets o SSE; para MVP de anotador único es viable actualización optimista y refresco periódico, pero definir contrato de eventos desde el inicio.
- Despliegue compatible con Next.js, Postgres gestionado y almacenamiento persistente. Separar secretos por entorno.
- Usar versiones estables compatibles entre sí, fijadas en lockfile, sin asumir una versión exacta de librerías.

## 2. Organización de proyecto
```
src/
  app/(auth)/...
  app/(dashboard)/teams/[teamId]/...
  app/api/...                 # route handlers si son necesarios
  components/ui/
  components/basketball/     # scorer, scoreboard, roster, stat-table, charts
  features/teams/
  features/players/
  features/games/
  features/stats/
  lib/auth/
  lib/db/
  lib/permissions/
  lib/validation/
  lib/time/
  server/services/          # casos de uso transaccionales
  domain/basketball/         # cálculos puros, sin React ni DB
prisma/schema.prisma
prisma/migrations/
tests/unit/
tests/integration/
tests/e2e/
public/club/logo.png
```
No mezclar lógica estadística con JSX ni duplicar fórmulas en cliente/servidor.

## 3. Modelo de datos (mínimo)
- `User(id, email, name, ...)`.
- `Club(id, name, logoUrl, ...)`.
- `Team(id, clubId, name, category, logoUrl, ...)`.
- `Season(id, clubId, name, startsAt, endsAt, ...)`.
- `TeamSeason(id, teamId, seasonId, rulesetId)`.
- `Membership(id, userId, teamId, role)` con índice único por user/team.
- `Player(id, displayName, photoUrl, position?, active, ...)`.
- `RosterEntry(id, teamSeasonId, playerId, jerseyNumber, activeFrom, activeTo)`; validar unicidad del dorsal entre intervalos activos.
- `Opponent(id, name, logoUrl?)`.
- `Game(id, teamSeasonId, opponentId, startsAtUTC, timezone, venue:HOME|AWAY|NEUTRAL, status, competition?, round?, regulationPeriods, periodLengthSeconds, overtimeLengthSeconds, homeScore, awayScore, version, ...)`.
- `GameRoster(id, gameId, rosterEntryId, isStarter, participated)`; unique(gameId, rosterEntryId).
- `GameEvent(id UUID, gameId, period, clockRemainingMs, elapsedGameMs, sequence, type, actorPlayerId?, teamSide:OURS|OPPONENT, points?, payload JSONB, createdBy, createdAt, supersededBy?, voidedAt?, clientMutationId UUID, version)`.
- `LineupInterval(id, gameId, playerId, startElapsedMs, endElapsedMs?)` o materialización derivada de STARTING_LINEUP/SUBSTITUTION; no permitir solapamientos por jugador.
- `GamePlayerStats(gameId, playerId, minutesSeconds, points, twoMade, twoAttempted, threeMade, threeAttempted, freeMade, freeAttempted, defReb, offReb, assists, steals, turnovers, blocksFor, blocksAgainst, fouls, foulsReceived, plusMinus, valuation, updatedAt)` materializada, recalculable.
- `AuditLog(id, actorId, entityType, entityId, action, before JSONB?, after JSONB?, createdAt)`.

Decisión: `GameEvent` es la fuente de verdad para estadísticas y marcador, mientras `GamePlayerStats` es una proyección reconstruible. No almacenar porcentajes como valores independientes. Usar IDs UUID y FK con integridad referencial. Para juegos históricos sin eventos usar tabla `ImportedAggregateStats` con `provenance=IMPORT` y métricas no derivables NULL.

## 4. Tipos de evento
```
SHOT_2_MADE, SHOT_2_MISSED,
SHOT_3_MADE, SHOT_3_MISSED,
FREE_THROW_MADE, FREE_THROW_MISSED,
DEF_REBOUND, OFF_REBOUND, ASSIST, STEAL, TURNOVER,
BLOCK_FOR, BLOCK_AGAINST, FOUL_COMMITTED, FOUL_DRAWN,
OPPONENT_SCORE, LINEUP_SET, SUBSTITUTION,
CLOCK_ADJUSTED, PERIOD_STARTED, PERIOD_ENDED,
SCORE_ADJUSTMENT, EVENT_VOIDED
```
Una anotación propia se representa por el tiro anotado (no por un segundo evento de puntuación). Para rival, `OPPONENT_SCORE(points=1|2|3)` en MVP. `SCORE_ADJUSTMENT` requiere motivo, autorización y auditoría; puede generar diferencial y se debe fijar la alineación que lo recibe.

## 5. Motor de estadísticas (funciones puras)
`reduceGameEvents(events, ruleset) -> { score, playerStats, lineups, warnings }`
1. Ordenar por periodo, reloj descendente y secuencia persistida. La secuencia resuelve eventos en el mismo instante.
2. Aplicar alineación inicial y sustituciones; validar cinco jugadores en pista en cada anotación 5x5.
3. Convertir cada tiro en anotados/intentos/puntos; sumar acciones simples.
4. Para cada evento con puntos propios, incrementar +/- de los cinco en pista en `+points`; para cada canasta rival, en `-points`.
5. Reconstruir intervalos de presencia por tiempo efectivo de partido, no por hora real del dispositivo. Contabilizar prórrogas.
6. Calcular rebotes, porcentajes y valoración; persistir proyección en una transacción.
7. Eventos anulados no contribuyen al resultado; corrección crea nuevo evento y anula el anterior, sin destruir auditoría.
8. En datos incompletos (sin alineación, puntos rivales o reloj), marcar +/- `null` con aviso, nunca 0 inventado.

Fórmulas:
```
PTS = 2*T2A + 3*T3A + T1A
TReb = DReb + OReb
T2pct = T2I ? 100*T2A/T2I : null
T3pct = T3I ? 100*T3A/T3I : null
T1pct = T1I ? 100*T1A/T1I : null
VAL = PTS + TReb + Asis + Rec + TapF + FaltR
      - (T2I-T2A) - (T3I-T3A) - (T1I-T1A)
      - Per - TapC - Falt
PLUS_MINUS(player) = SUM(points ours while on court)
                   - SUM(points opponent while on court)
```
La fórmula VAL es provisional y parametrizable. Un partido con marcador 70–65 tendrá diferencial equipo +5; si los cinco jugadores estuvieron correctamente registrados durante cada anotación, la suma de +/- de jugadores es +25. El equipo tiene 200 minutos-jugador en un partido 4×10 sin prórroga.

## 6. API / acciones servidor
Preferir Server Actions para formularios sencillos y Route Handlers versionados para anotación/sincronización, con Zod en ambos casos:
- `POST /api/teams` / `GET /api/teams/:id`
- `POST /api/team-seasons/:id/players` / `PATCH /api/players/:id`
- `POST /api/games` / `PATCH /api/games/:id` / `POST /api/games/:id/start` / `POST /api/games/:id/finalize`
- `PUT /api/games/:id/lineup`
- `POST /api/games/:id/events` (idempotencia `clientMutationId`, versión esperada)
- `POST /api/games/:id/events/:eventId/void` (motivo)
- `GET /api/games/:id/events?cursor=...`
- `GET /api/games/:id/stats` / `GET /api/teams/:id/stats?seasonId=&venue=&from=&to=`
- `GET /api/players/:id/stats?...` / `GET /api/teams/:id/export?format=csv`

Contratos: errores tipados 400 validación, 401 no autenticado, 403 sin permiso, 404 recurso no accesible, 409 conflicto de versión, 422 incoherencia de estado. Todas las rutas comprueban autorización en servidor y pertenencia del recurso al equipo, nunca confiar en teamId del cliente.

## 7. Concurrencia y sincronización
- `Game.version` para control optimista; cada mutación se valida transaccionalmente y aumenta versión.
- `clientMutationId` único por anotación; reintentos no generan dobles canastas.
- Solo un anotador principal por partido en MVP; otros usuarios lectura. V1: sesiones multi-anotador con conflictos resueltos explícitamente, no last-write-wins sobre eventos.
- UI optimista con indicador `pendiente/sincronizado/error`, reintentos y botón deshacer que crea anulación auditada.
- Cola IndexedDB opcional V1, preservando orden e idempotencia; no usar localStorage como base de datos.

## 8. Diseño y componentes
Tokens CSS:
```
--navy: #101D2F;
--turquoise: #00C4D5;
--cream: #F5F3ED;
--muted: #6C737B;
--border: #DEDFDC;
```
Configurar `next/font/local` para DM Sans y Barlow Condensed usando las rutas reales de los archivos suministrados. **No se han adjuntado los ficheros de fuentes**: crear variables de ruta/documentación y fallback temporal, sin inventar assets. `public/club/logo.png` como logo y favicon; **si no existe en el repositorio**, placeholder explícito y TODO para integrarlo. No reutilizar la foto de la hoja como imagen de interfaz.

Componentes principales: `AppShell`, `TeamSwitcher`, `PlayerCard`, `PlayerAvatar`, `GameCard`, `GameClock`, `Scoreboard`, `LineupCourt`, `PlayerPicker`, `QuickStatPad`, `UndoBar`, `EventTimeline`, `StatsKpi`, `StatTable`, `VenueFilter`, `PlayerCompareChart`, `SyncStatus`.

Responsive: mobile-first, targets 44×44px, safe-area insets, navegación inferior en móvil, barra lateral desktop, grupos de columnas y sticky header/columna en tablas, gráficos adaptativos y tabla accesible alternativa. Probar 375, 768, 1024, 1440 px y orientación landscape.

## 9. Consultas y rendimiento
- Índices: `Game(teamSeasonId, startsAtUTC)`, `Game(teamSeasonId, venue, status)`, `GameEvent(gameId, period, sequence)`, `GameEvent(gameId, clientMutationId)` unique, `GamePlayerStats(gameId, playerId)` unique, `RosterEntry(teamSeasonId, jerseyNumber)` según vigencia.
- Paginación cursor en eventos e históricos; agregados por SQL/Prisma para estadísticas de temporada.
- Cache de lecturas agregadas con invalidación al añadir/anular eventos. No cachear escritura ni marcadores como fuente de verdad.
- Porcentajes calculados sobre sumas de numeradores/denominadores, nunca promedio de porcentajes.
- Fotos optimizadas con `next/image`; virtualizar tablas grandes solo si la accesibilidad lo permite.

## 10. Seguridad, calidad y observabilidad
- Validación Zod, RBAC por equipo, cookies seguras, protección CSRF según estrategia de autenticación, límites de subida, rate limiting, cabeceras seguras.
- Logs estructurados sin datos sensibles; errores y métricas de latencia/sincronización. Copias de seguridad de DB y recuperación probada.
- Pruebas unitarias Vitest del reducer y fórmulas; integración con DB de test y migraciones; Playwright E2E para alta de jugador, partido, anotación, deshacer, filtros y responsive.
- Accesibilidad WCAG 2.2 AA objetivo; navegación teclado, aria-label en botones iconográficos, contraste de turquesa comprobado según fondo.
- CI: typecheck, lint, tests, build, migraciones verificadas; seed de demo reproducible.

## 11. Plan para Codex (entregas pequeñas)
**Fase 0 — Bootstrap:** Next.js, TypeScript, Tailwind, diseño, layout responsive, auth, Prisma/Postgres, seed, README y `.env.example`.
**Fase 1 — Catálogo:** clubes, equipos, temporadas, jugadores, foto/dorsal, RBAC y CRUD con pruebas.
**Fase 2 — Calendario:** rivales, partidos, CASA/FUERA/NEUTRAL, convocados, titulares, reloj y estado.
**Fase 3 — Anotador:** interfaz táctil, motor de eventos, tiros, rebotes, resto de acciones, sustituciones, cronómetro, marcador rival, undo y auditoría.
**Fase 4 — Estadísticas:** reducer, materialización, todos los campos de la imagen, VAL y +/-, totales/medias, filtros y paneles.
**Fase 5 — Pulido:** exportación, gráficos, responsive real, permisos, accesibilidad, rendimiento y pruebas E2E.
Cada fase debe entregar código ejecutable, migraciones, pruebas, capturas de estados clave, documentación y un checklist de aceptación. No comenzar fase posterior si la anterior falla en build o pruebas.

## 12. Ejemplos de pruebas imprescindibles
1. Triple acertado: +3 pts, T3A +1, T3I +1, +3 +/- a los cinco en pista.
2. Triple fallado: T3I +1, sin puntos ni +/-.
3. Canasta rival de dos: marcador rival +2, −2 +/- al quinteto presente.
4. Sustitución A→B, canasta posterior: A no cambia +/-; B sí.
5. Dos eventos al mismo tiempo con secuencia distinta: respetar orden de sustitución/canasta.
6. Reintento de mismo clientMutationId: un solo evento.
7. Anular tiro: marcador, estadísticas y +/- se reconstruyen correctamente.
8. Agregado de porcentajes: 1/1 y 0/9 producen 10%, no 50%.
9. Sin tiros: porcentaje null, visualización «—».
10. Sin lineup o sin registro de puntuación rival: +/- no disponible, no falsear 0.
11. Usuario de equipo A no accede a API de equipo B.
12. 4×10 sin prórroga: suma minutos en pista = 200 si hay alineación completa.

## 13. Prompt inicial recomendado para Codex
> Implementa la Fase 0 del proyecto siguiendo estrictamente `01_INFORME_FUNCIONAL.md` y `02_INFORME_TECNICO.md`. Construye un proyecto Next.js App Router con TypeScript estricto, Tailwind, PostgreSQL y Prisma. Crea el design system y el layout responsive según los tokens indicados. Prepara autenticación, RBAC, estructura de carpetas, esquema Prisma inicial, migraciones, seed, tests, README y `.env.example`. No inventes fuentes ni logo que no estén presentes; deja fallback y documenta las rutas esperadas. Ejecuta lint, typecheck, tests y build, y corrige los errores antes de finalizar. No implementes fases posteriores hasta validar esta fase.

## 14. Definition of Done
Funcionalidad trazable al FRD, migración aplicada, autorización probada, errores tratados, pruebas automatizadas verdes, interfaz móvil/tablet/desktop revisada, sin cálculos inconsistentes, sin secretos en repo, y documentación de decisiones/limitaciones actualizada.
