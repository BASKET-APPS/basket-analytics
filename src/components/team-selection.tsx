'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Plus, Users, X, Trash2, RotateCcw, Check } from 'lucide-react';
import type { CatalogEntry } from '@/server/catalog';

export default function TeamSelection({
  entries,
  canCreate,
  demo,
  busy,
  error,
  onSelect,
  onCreate,
  onDelete,
  onRestore,
}: {
  entries: CatalogEntry[];
  canCreate: boolean;
  demo: boolean;
  busy: boolean;
  error: string;
  onSelect: (target: string) => Promise<void>;
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onDelete: (team: CatalogEntry) => Promise<boolean>;
  onRestore: (team: CatalogEntry) => Promise<boolean>;
}) {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'teams' | 'manage' | 'trash'>('teams');
  const [selected, setSelected] = useState('');
  const [confirmTeam, setConfirmTeam] = useState<CatalogEntry | null>(null);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmTeam) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmTeam]);
  const visibleEntries = entries.filter((entry) =>
    tab === 'trash' ? entry.deletedAt && entry.role === 'ADMIN' : !entry.deletedAt,
  );
  const trashCount = new Set(
    entries
      .filter((entry) => entry.deletedAt && entry.role === 'ADMIN')
      .map((entry) => entry.teamId),
  ).size;
  const selectedTeam = visibleEntries.find((entry) => entry.teamId === selected);

  const year = new Date().getFullYear();
  const teams = [...new Set(visibleEntries.map((e) => e.teamId))];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onCreate({ ...Object.fromEntries(form), type: 'team', carryRoster: false });
  };
  return (
    <main className="team-selection" id="contenido">
      <header className="team-selection-brand">
        <img src="/club/logo.png" alt="CDI Rozasbasket" />
        <span>
          CDIR <small>BASKET ANALYTICS</small>
        </span>
        <span className="connection-label">
          {demo ? 'Demo local' : 'Conectado a Firestore'}
        </span>
      </header>
      <div className="team-selection-heading">
        <div>
          <p className="eyebrow">TU CLUB · TU ESPACIO</p>
          <h1>Elige tu equipo.</h1>
          <p>Entra en su plantilla, sus partidos y sus estadísticas.</p>
        </div>
        {canCreate && (
          <button className="primary" disabled={busy} onClick={() => setCreating(true)}>
            <Plus size={18} />
            Nuevo equipo
          </button>
        )}
      </div>
      {canCreate && !creating && (
        <div className="team-management-tabs" role="group" aria-label="Administrar equipos">
          {(
            [
              ['teams', 'Equipos'],
              ['manage', 'Gestionar equipos'],
              ['trash', `Papelera (${trashCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              disabled={busy}
              onClick={() => {
                setTab(id);
                setSelected('');
                setMessage('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {message && (
        <p className="team-management-message" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {creating ? (
        <section className="create-team-panel" aria-label="Crear equipo">
          <div className="team-form-heading">
            <h2>Un nuevo equipo empieza aquí.</h2>
            <button
              aria-label="Cancelar creación"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p>Crearás una plantilla vacía y una temporada propia.</p>
          <form onSubmit={submit} className="team-create-form">
            <label>
              Nombre del equipo
              <input
                autoFocus
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="Ej. Infantil femenino"
              />
            </label>
            <label>
              Club
              <input
                name="clubName"
                required
                maxLength={100}
                defaultValue={entries.find((e) => !e.isSandbox)?.club || 'CDI Rozasbasket'}
              />
            </label>
            <label>
              Categoría
              <input
                name="category"
                required
                maxLength={80}
                placeholder="Ej. Infantil · Femenino"
              />
            </label>
            <label>
              Temporada
              <input
                name="season"
                required
                minLength={2}
                maxLength={50}
                defaultValue={`${year} / ${year + 1}`}
              />
            </label>
            <label>
              Inicio de temporada
              <input name="startsAt" type="date" required defaultValue={`${year}-09-01`} />
            </label>
            <label>
              Fin de temporada
              <input name="endsAt" type="date" required defaultValue={`${year + 1}-07-31`} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Creando equipo…' : 'Crear y entrar'}
              <ArrowRight size={18} />
            </button>
          </form>
        </section>
      ) : (
        <>
          <label className="team-search">
            Buscar equipo
            <input
              type="search"
              placeholder="Nombre o club…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {tab === 'manage' && (
            <div className="team-delete-toolbar">
              <p>
                Selecciona el equipo que quieres enviar a la papelera. Su historial se conservará.
              </p>
              <button
                className="team-delete-button"
                disabled={busy || !selectedTeam || selectedTeam.role !== 'ADMIN'}
                onClick={() => setConfirmTeam(selectedTeam!)}
              >
                <Trash2 size={17} />
                Borrar equipo
              </button>
            </div>
          )}
          {tab === 'trash' && (
            <p className="team-trash-note">
              Los equipos de la papelera no aparecen en el selector. Puedes restaurarlos con todas
              sus temporadas y datos.
            </p>
          )}
          <div className="team-selection-grid">
            {teams.map((id) => {
              const seasons = visibleEntries.filter((e) => e.teamId === id),
                team = seasons[0];
              if (
                !`${team.team} ${team.club}`
                  .toLocaleLowerCase('es')
                  .includes(search.toLocaleLowerCase('es'))
              )
                return null;
              return (
                <TeamCard
                  key={id}
                  entries={seasons}
                  busy={busy}
                  onSelect={onSelect}
                  mode={tab}
                  selected={selected === id}
                  onChoose={() => setSelected(id)}
                  onRestore={async () => {
                    if (await onRestore(team)) setMessage(`Equipo «${team.team}» restaurado.`);
                  }}
                />
              );
            })}
          </div>
          {!visibleEntries.length && (
            <p>
              {tab === 'trash' ? 'La papelera está vacía.' : 'Todavía no hay equipos disponibles.'}
            </p>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="team-delete-dialog"
        aria-labelledby="team-delete-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setConfirmTeam(null);
        }}
      >
        {confirmTeam && (
          <>
            <span className="team-delete-icon">
              <Trash2 size={25} />
            </span>
            <h2 id="team-delete-title">¿Borrar este equipo?</h2>
            <strong>{confirmTeam.team}</strong>
            <p>
              Se enviará a la papelera con todas sus temporadas. Sus jugadores, fotos, partidos y
              estadísticas se conservarán y podrás restaurarlo.
            </p>
            <div className="team-delete-dialog-actions">
              <button
                className="secondary"
                autoFocus
                disabled={busy}
                onClick={() => setConfirmTeam(null)}
              >
                Cancelar
              </button>
              <button
                className="team-delete-button"
                disabled={busy}
                onClick={async () => {
                  if (await onDelete(confirmTeam)) {
                    setMessage(`Equipo «${confirmTeam.team}» enviado a la papelera.`);
                    setConfirmTeam(null);
                    setSelected('');
                  }
                }}
              >
                {busy ? 'Borrando…' : 'Mover a la papelera'}
              </button>
            </div>
          </>
        )}
      </dialog>
      <footer>
        <Users size={16} />
        Cada equipo tiene su propia plantilla, calendario y estadísticas.
      </footer>
    </main>
  );
}
function TeamCard({
  entries,
  busy,
  onSelect,
  mode,
  selected,
  onChoose,
  onRestore,
}: {
  entries: CatalogEntry[];
  busy: boolean;
  onSelect: (target: string) => Promise<void>;
  mode: 'teams' | 'manage' | 'trash';
  selected: boolean;
  onChoose: () => void;
  onRestore: () => Promise<void>;
}) {
  const [seasonId, setSeason] = useState(entries[0].seasonId);
  const team = entries.find((e) => e.seasonId === seasonId) || entries[0];
  return (
    <article
      className={`team-choice-card ${selected ? 'team-to-delete' : ''}`}
      data-team-id={team.teamId}
    >
      <div className="team-choice-icon">
        {team.team
          .split(' ')
          .slice(0, 2)
          .map((n) => n[0])
          .join('')}
      </div>
      <span className="team-choice-tag">{team.isSandbox ? 'EQUIPO DE PRUEBAS' : team.club}</span>
      <h2>{team.team}</h2>
      <p>{team.category || 'Tu equipo de baloncesto'}</p>
      <label>
        Temporada
        <select
          aria-label={`Temporada de ${team.team}`}
          value={team.seasonId}
          disabled={busy}
          onChange={(e) => setSeason(e.target.value)}
        >
          {entries.map((e) => (
            <option key={e.seasonId} value={e.seasonId}>
              {e.season}
            </option>
          ))}
        </select>
      </label>
      {mode === 'trash' ? (
        <button className="primary" disabled={busy} onClick={() => void onRestore()}>
          <RotateCcw size={17} />
          Restaurar equipo
        </button>
      ) : mode === 'manage' ? (
        <button
          className="primary"
          aria-pressed={selected}
          aria-label={`Seleccionar equipo ${team.team}`}
          disabled={busy || team.role !== 'ADMIN'}
          onClick={onChoose}
        >
          {selected ? <Check size={18} /> : <Trash2 size={17} />}
          {selected
            ? 'Equipo seleccionado'
            : team.role === 'ADMIN'
              ? 'Seleccionar equipo'
              : 'Solo administrador'}
        </button>
      ) : (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void onSelect(`${team.teamId}:${team.seasonId}`)}
        >
          Entrar en {team.team}
          <ArrowRight size={18} />
        </button>
      )}
    </article>
  );
}
