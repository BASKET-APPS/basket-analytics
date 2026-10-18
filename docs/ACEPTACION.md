# Verificación de la entrega MongoDB y nuevo anotador

- [x] Inicio guiado: convocados → cinco titulares → comenzar.
- [x] Prueba en un clic separada de estadísticas oficiales.
- [x] Captura jugador/acción y acción/jugador.
- [x] Marcador y reloj fijos; dentro/fuera y rival sin selección de jugador.
- [x] Pulsaciones en cola sin bloqueo por cada respuesta del servidor.
- [x] Reintento con mismo identificador, incluso tras perder una respuesta ya guardada.
- [x] Deshacer directo con auditoría; cambios por saliente/entrante.
- [x] Atajos y responsive a 375/820/1440.
- [x] MongoDB oficial: BSON, fechas UTC, índices idempotentes, control de versión y recuperación.
- [x] Persistencia y permisos comprobados con MongoDB aislado real.
- [x] Conexión real al Atlas `basketball_stats` autorizada por el usuario.
- [x] Colecciones e índices creados; equipo CDIR real y laboratorio separados.
- [x] Canasta desde la web guardada y leída en Atlas: 2–0; equipo real sin contaminación de pruebas.
- [x] URI en `.env.local` ignorado por Git; no llega al cliente ni se imprime en verificaciones.

Pendientes: OAuth productivo, almacenamiento de fotos en objetos externos, administración avanzada de miembros, importaciones, XLSX/PDF, paginación/segmentación extensiva, offline persistente, accesibilidad completa y operación/backup del despliegue. El acceso actual de desarrollo a Atlas está limitado a loopback y no funciona en producción.


Selección de equipo obligatoria al entrar, alta desde el selector y navegación contextual. Fotos de jugadores disponibles en pista, banquillo y preparación; dorsal visible, iniciales sin imagen. Subida con permiso de edición, origen validado y normalización WebP; URL en Atlas y archivos en disco persistente del servidor. El banquillo permite iniciar un cambio tocando al jugador entrante y luego al saliente.

Anotador: panel «Quinteto», sustitución al arrastrar entre titular y suplente (ratón o puntero táctil; alternativa por clic), validación de destino y conservación de cinco jugadores. Puntos del rival en el marcador. Contador de cuartos/prórrogas y avance rápido exclusivo de la simulación. El reloj real guarda el fin del cuarto sin agotar automáticamente el siguiente.

Estadísticas del partido integradas bajo el anotador y acceso directo. Tabla por jugador con foto/dorsal, estado pista/banquillo, minutos en vivo, resumen y métricas completas; filtro de quinteto y totales ponderados del equipo. Proyección de acciones pendientes identificada visualmente; anular acciones actualiza cifras y los cambios conservan las estadísticas de los suplentes.

El acceso al anotador abre primero tarjetas de partidos, con filtros por estado y simulación, rival, fecha, marcador, cuarto y convocados. Elegir una tarjeta abre únicamente ese encuentro. Volver a partidos está bloqueado con reloj en marcha o guardados pendientes; el calendario también abre directamente el partido elegido.


Gestión de equipos: en «Elige tu equipo» el administrador puede abrir «Gestionar equipos», seleccionar uno y confirmar «Borrar equipo». Se aplica borrado recuperable a todas sus temporadas: el equipo sale del selector y sus accesos explícitos quedan bloqueados. La pestaña «Papelera» permite restaurarlo con jugadores, fotos, partidos y estadísticas intactos. MongoDB conserva documentos y registra el cambio en auditoría; no se realiza purga permanente.

Arrastre de jugadores: tarjetas con agarre visible y arrastre nativo para ratón, tarjeta flotante que sigue al cursor y destinos resaltados. En táctil se usan eventos de puntero con vista flotante. Soltar sobre un jugador del grupo opuesto guarda el cambio; un destino inválido no registra eventos. Se mantienen los cambios por clic. Pruebas con arrastre real de ratón y eventos táctiles de Chrome, además de persistencia y cinco jugadores únicos.


Gráficas en Estadísticas y Comparador: distribución de tiro (2P, 3P y libres), mapa de zonas generales por tipo de tiro, evolución temporal, barras por jugador y mapa de calor por jugador/cuarto. Filtros de jugador, partido, periodo, las 24 métricas, totales/medias y simulaciones opcionales; heredan fecha, rival y sede de la página. El comparador comparte el mismo conjunto de partidos y periodos entre todos los jugadores. Los porcentajes se ponderan por intentos, los cuartos recuperan el quinteto previo para contar minutos y los valores negativos se representan. El gráfico de pista no muestra posiciones exactas porque no se registran coordenadas de tiro.


Demo de presentación: el administrador puede añadir una sola vez seis encuentros simulados finalizados y dos próximos al equipo marcado `isSandbox`. No se sobrescriben partidos ni jugadores. Todos llevan `isPractice` y la competición «DEMO · Presentación»; el espacio de pruebas incluye sus simulaciones en panel, estadísticas y comparador por defecto. Fuera de ese espacio se mantienen excluidas. El mapa de tiro usa verde/ámbar/rojo/gris frente a objetivos de acierto ajustables (2P 50%, 3P 35%, libres 70%); no usa volumen como indicador de calidad. Ámbar desde el 75% del objetivo; rojo por debajo; sin intentos se muestra gris.
