# INFORME FUNCIONAL (FRD) — Plataforma de estadísticas de baloncesto
Versión 1.0 · 18/10/2026 · Especificación para Codex

## 1. Objetivo
Aplicación web responsive para administrar clubes/equipos, temporadas, jugadores y partidos, registrar eventos estadísticos en directo desde móvil/tablet/PC y explotar estadísticas individuales y colectivas. Debe sustituir hojas de cálculo sin perder ninguna métrica mostrada en la referencia.

## 2. Usuarios y permisos
- Administrador del club: administra equipos, temporadas, usuarios y permisos.
- Entrenador: gestiona plantillas, partidos, alineaciones, revisa estadísticas y exporta.
- Anotador: registra eventos en los partidos asignados y corrige registros con trazabilidad.
- Lector: consulta paneles y reportes sin poder editar.
Un usuario puede tener distintos roles según equipo. No permitir escritura a equipos ajenos.

## 3. Entidades y flujos
### 3.1 Club, equipo y temporada
- Crear club (nombre, logo opcional); crear uno o varios equipos (nombre, categoría, escudo, temporada).
- Definir temporada con fecha de inicio/fin, estado y equipos participantes.
- Mantener históricos: mover jugador de temporada no altera partidos previos.
- Panel de equipo: foto/escudo, plantilla, calendario, resultados, resumen estadístico.

### 3.2 Jugadores
- Alta con nombre visible, dorsal y foto (obligatorios nombre y dorsal; foto opcional con avatar sustituto mientras se sube).
- Campos opcionales: apellidos, posición, altura, fecha nacimiento, estado activo, notas.
- Un dorsal es único dentro del equipo y temporada entre jugadores activos; puede cambiar entre temporadas.
- Editar, archivar y restaurar; no borrar en cascada estadísticas históricas.
- Ficha: datos, foto, medias, totales, evolución, desglose casa/fuera, partidos y comparativa.

### 3.3 Partidos
- Crear partido: equipo, temporada, rival, fecha/hora local y zona horaria, competición/jornada, sede (CASA/FUERA/NEUTRAL), estado (PROGRAMADO/EN_DIRECTO/FINALIZADO/CANCELADO), duración reglamentaria por periodo (configurable), prórrogas.
- La condición casa/fuera se define desde la perspectiva del equipo monitorizado; neutral es categoría independiente.
- Lista de convocados; cinco titulares; suplentes; oponentes y marcador.
- Posibilidad de preparar calendario de múltiples partidos mediante importación CSV y alta manual.
- Finalizar solo tras confirmar coherencia de marcador y minutos; permitir reapertura con permiso y auditoría.

### 3.4 Registro en directo
- Pantalla operativa centrada en rapidez: marcador, periodo, cronómetro, cinco en pista, banquillo, acciones de un toque, deshacer última acción, historial y edición de eventos.
- Seleccionar jugador y tocar acción; alternativa seleccionar acción y jugador; guardar última preferencia por dispositivo.
- Acciones: tiro 2 anotado/fallado; tiro 3 anotado/fallado; tiro libre anotado/fallado; rebote defensivo/ofensivo; asistencia; recuperación; pérdida; tapón a favor; tapón recibido; falta cometida; falta recibida; sustitución; puntos del rival; corrección.
- Para tiros anotados sumar automáticamente 2/3/1 puntos al marcador del equipo; no introducir Pts manualmente salvo ajuste auditado.
- Para +/- es obligatorio conocer quinteto y secuencia de anotaciones de ambos equipos. Un evento de canasta rival puede registrar solo puntos y tiempo, sin identidad del rival.
- Cronómetro por periodo con iniciar/parar/ajustar, pero los tiempos oficiales deben poder corregirse manualmente; el registro de eventos guarda periodo, reloj restante y tiempo transcurrido normalizado.
- Sustituciones simultáneas, registro de quinteto inicial y restauración tras recarga. Avisos de quinteto inválido (distinto de cinco en juego 5x5).
- Soporte de eventos pendientes y cola local ante corte de conexión; mostrar estado de sincronización y conflictos; evitar duplicados mediante ID único de evento. No prometer funcionamiento offline completo sin implementar pruebas.
- Botones táctiles >=44px, confirmación para acciones destructivas, vibración opcional donde esté disponible, teclado accesible y modo apaisado.

## 4. Diccionario completo de estadísticas de la imagen
La imagen de referencia contiene estas columnas (nombres preservados para exportar):

| Columna | Significado | Regla |
|---|---|---|
| Min | Minutos disputados | Suma de intervalos de presencia en pista; mostrar mm:ss y decimal en exportación opcional |
| Pts | Puntos | 2×T2A + 3×T3A + T1A |
| T2A | Tiros de 2 anotados | Conteo de tiros de 2 convertidos |
| T2I | Tiros de 2 intentados | Convertidos + fallados |
| T2% | % de tiros de 2 | 100×T2A/T2I, si intentos > 0; si 0, mostrar «—» |
| T3A | Tiros de 3 anotados | Conteo de triples convertidos |
| T3I | Tiros de 3 intentados | Convertidos + fallados |
| T3% | % de triples | 100×T3A/T3I, si intentos > 0; si 0, «—» |
| T1A | Tiros libres anotados | Conteo de libres convertidos |
| T1I | Tiros libres intentados | Convertidos + fallados |
| T1% | % de libres | 100×T1A/T1I, si intentos > 0; si 0, «—» |
| DReb | Rebotes defensivos | Conteo |
| OReb | Rebotes ofensivos | Conteo |
| TReb | Rebotes totales | DReb + OReb |
| Asis | Asistencias | Conteo |
| Rec | Recuperaciones | Conteo |
| Per | Pérdidas | Conteo |
| TapF | Tapones a favor | Conteo |
| TapC | Tapones recibidos/en contra | Conteo |
| Falt | Faltas cometidas | Conteo |
| FaltR | Faltas recibidas | Conteo |
| Val | Valoración | Pts + TReb + Asis + Rec + TapF + FaltR − (T2I−T2A) − (T3I−T3A) − (T1I−T1A) − Per − TapC − Falt; fórmula configurable si la competición aplica otra convención |
| Partidos | Partidos disputados | Número de encuentros con participación registrada (tiempo > 0 o evento individual) |
| +/- | Diferencial en pista | Puntos equipo mientras jugador está en pista − puntos rival mientras jugador está en pista |

**Nota:** La columna «Val» se definirá con la fórmula indicada como criterio inicial; debe validarse con el club antes de migrar datos históricos, ya que las competiciones pueden emplear criterios distintos. No deducir +/- a partir de puntos y minutos agregados: exige cronología y alineaciones.

### 4.1 Totales, medias y porcentajes
- Total por jugador/partido/temporada y equipo; media por partido (suma / partidos disputados), y opcional por 40 minutos (si minutos > 0).
- Los porcentajes agregados se calculan como suma anotados / suma intentados, NUNCA como promedio simple de porcentajes por partido.
- «Partidos» no se suma como si fuera una acción. Para la fila total de equipo de un partido debe valer 1, no 5.
- Minutos de equipo en un partido 5x5 = 5 × duración real de juego, incluidas prórrogas; discrepancias deben alertarse.
- +/- agregado del equipo no es suma de +/- de jugadores: el diferencial oficial es puntos a favor menos puntos en contra. Suma de +/- individuales = 5 × diferencial si los cinco en pista están correctamente registrados durante todos los puntos.
- Para informes CASA/FUERA/NEUTRAL, filtros excluyentes; «Todos» combina todas las sedes. Permitir temporada, rango fechas, rival, competición, jugador, periodo.

## 5. Pantallas y navegación
1. Acceso / selección de club y equipo.
2. Dashboard: próximos partidos, últimos resultados, puntos a favor/en contra, balance, líderes por métrica, evolución y accesos rápidos.
3. Plantilla: tarjetas con foto/dorsal, búsqueda, filtros, alta/edición.
4. Perfil de jugador: cabecera con foto, KPIs, tendencias, tabla por partido, split casa/fuera, minutos, valoración y +/-.
5. Calendario y listado: crear/editar partidos, calendario y vista tabla; etiqueta CASA/FUERA/NEUTRAL.
6. Centro de partido: previa/convocados, anotación en directo, cronología, quintetos, resumen y cierre.
7. Estadísticas de equipo: tabla completa de columnas de la imagen, totales/medias, ranking, gráficas, comparativa de sedes y filtros.
8. Comparador: hasta 4 jugadores, mismas unidades y periodos, radar opcional sin sustituir tablas accesibles.
9. Exportaciones: CSV/XLSX/PDF, con filtros aplicados, fecha, zona horaria y leyenda de métricas.
10. Administración: roles, competición, reglas, auditoría y preferencias visuales.

### 5.1 Responsive
- Escritorio >=1200px: navegación lateral, múltiples paneles, tabla ancha con cabeceras fijas y primera columna anclada.
- Tablet 768–1199px: navegación compacta, registro de acciones en rejilla de botones grandes, estadísticas con desplazamiento horizontal y vistas por grupos.
- Móvil <768px: navegación inferior, tarjetas de KPIs, selector de jugador y acciones en panel táctil, botones grandes, tabla descompuesta por pestañas (Tiro / Rebotes / Juego / Disciplina / Impacto); permitir exportación completa.
- No ocultar métricas definitivamente en móvil; ofrecer vista completa con desplazamiento.
- Contraste AA, estados sin color exclusivo, lectores de pantalla, foco visible, textos alternativos para fotos.

## 6. Identidad visual obligatoria
- DM Sans para texto, formularios y navegación; Barlow Condensed para titulares, números grandes y KPIs. Cargar desde fuentes locales, no depender de CDN.
- Azul marino #101D2F; turquesa #00C4D5; crema #F5F3ED; gris secundario #6C737B; borde #DEDFDC.
- Logotipo `public/club/logo.png` como identidad y favicon; si falta, mostrar placeholder durante desarrollo sin inventar logo definitivo.
- Estilo deportivo contemporáneo: grandes titulares, fotos de jugadores, bloques navy y acentos turquoise, sin sacrificar legibilidad de tablas.

## 7. Reglas y casos límite
- No permitir acciones individuales de un jugador no convocado; el jugador puede estar en banquillo, pero para acciones de juego debe estar en pista (salvo correcciones autorizadas).
- Un tiro convertido crea un único evento atómico con su puntuación y estadísticas derivadas; deshacer revierte todo.
- Correcciones de eventos históricos recalculan proyecciones, marcador, +/- y tiempo sin duplicados.
- Anotar canasta rival sin jugador identificado, con reloj y quinteto en pista, para mantener +/- correcto.
- Diferenciar «no intentó» de «0%»: usar «—» en denominador cero.
- Una sustitución en el mismo instante que una canasta exige orden explícito (secuencia de eventos).
- Definir tiempo reglamentario configurable (por ejemplo 10 o 12 min por cuarto) y número de periodos; no asumir siempre FIBA.
- Los partidos cancelados no cuentan en promedios.
- Importación de históricos desde hojas con datos agregados: conservar métricas, pero marcar +/- y cronología como «no disponibles» si no existen eventos/quintetos.

## 8. Criterios de aceptación verificables
- Crear equipo, temporada, 12 jugadores con foto y dorsal; consultar desde móvil y escritorio.
- Crear partido CASA y otro FUERA; filtros muestran cada uno correctamente y «Todos» los agrega.
- Registrar 2 triples anotados, 1 triple fallado y 1 libre anotado: T3A=2, T3I=3, T3%=66,7%, T1A=1, Pts=7.
- Con quinteto A en pista, anotar +2 propio y +3 rival: +/- de cada jugador de ese quinteto = −1; tras sustitución solo los presentes reciben eventos posteriores.
- Deshacer una canasta recalcula marcador, puntos, intentos, valoración y +/-.
- Un jugador sin intentos muestra «—», nunca NaN ni Infinity.
- Los porcentajes de temporada se calculan ponderados por intentos.
- Abrir en 375px, 820px y 1440px sin solapamientos, pérdida de acciones ni elementos táctiles diminutos.
- Usuario lector no puede crear eventos; cambios de anotador quedan auditados.
- Exportar tabla con todas las columnas de la imagen y +/-; abrir el CSV/XLSX sin columnas omitidas.

## 9. Alcance por fases
**MVP:** autenticación, clubes/equipos/temporadas, jugadores/fotos, partidos casa/fuera, convocatoria/quinteto, anotación por eventos, marcador, estadísticas completas, +/-, dashboards básicos, responsive, CSV.
**V1:** exportación XLSX/PDF, importación CSV, comparador, visualizaciones avanzadas, modo conexión inestable, permisos granulares, auditoría completa.
**Futuro:** play-by-play del rival completo, posesiones/eficiencia avanzada, mapas de tiro, scouting, integraciones externas, PWA offline integral.

## 10. Preguntas a confirmar antes de producción
¿Competición FIBA 4×10 o distinta? ¿Solo un equipo o múltiples clubes? ¿Necesidad de estadística completa del rival? ¿La fórmula exacta de valoración de la liga coincide con la indicada? ¿Se exige modo sin conexión total? Estos puntos son configurables o diferibles; no deben bloquear la construcción del MVP.
