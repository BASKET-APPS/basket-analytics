'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { Shield, ShieldAlert, UserPlus, Trash2, CheckCircle2, UserCheck, RefreshCw } from 'lucide-react';
import {
  listAppUsers,
  addOrUpdateAppUser,
  removeAppUser,
  SUPER_ADMIN_EMAIL,
  type AppUser,
} from '@/lib/firestore-service';

interface UserManagementProps {
  currentUserEmail: string;
}

export default function UserManagement({ currentUserEmail }: UserManagementProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'NORMAL'>('NORMAL');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listAppUsers();
      setUsers(list);
    } catch (e) {
      setError((e as Error).message || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail.includes('@') || !newEmail.includes('.')) {
      setError('Introduce un correo electrónico de Google válido');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await addOrUpdateAppUser(newEmail, newRole, newName, currentUserEmail);
      setSuccess(`Usuario ${newEmail} dado de alta correctamente como ${newRole === 'ADMIN' ? 'Administrador' : 'Normal'}`);
      setNewEmail('');
      setNewName('');
      setNewRole('NORMAL');
      await load();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError((e as Error).message || 'Error al guardar usuario');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRole = async (user: AppUser) => {
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return;
    const targetRole = user.role === 'ADMIN' ? 'NORMAL' : 'ADMIN';
    setBusy(true);
    setError('');
    try {
      await addOrUpdateAppUser(user.email, targetRole, user.name, currentUserEmail);
      setSuccess(`Rol de ${user.email} actualizado a ${targetRole === 'ADMIN' ? 'Administrador' : 'Normal'}`);
      await load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError((e as Error).message || 'Error al cambiar rol');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return;
    if (!confirm(`¿Estás seguro de retirar el acceso a ${email}?`)) return;

    setBusy(true);
    setError('');
    try {
      await removeAppUser(email);
      setSuccess(`Acceso retirado a ${email}`);
      await load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError((e as Error).message || 'Error al eliminar usuario');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      <div className="panel-heading" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Shield size={24} color="var(--turquoise)" /> Gestión de Usuarios y Permisos
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Solo los usuarios con su cuenta de Google registrada aquí pueden acceder a la aplicación.
          </p>
        </div>
        <button className="secondary" onClick={load} disabled={loading || busy} title="Recargar lista">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.8rem 1rem', borderRadius: 8, marginBottom: '1.2rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#86efac', padding: '0.8rem 1rem', borderRadius: 8, marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {success}
        </div>
      )}

      {/* Formulario para añadir usuario */}
      <form onSubmit={handleAddUser} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.2rem', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserPlus size={18} color="var(--turquoise)" /> Dar de alta nuevo usuario (Gmail)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
            Correo Gmail:
            <input
              type="email"
              placeholder="companero@gmail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              disabled={busy}
              style={{ padding: '0.6rem 0.8rem', background: '#0a1320', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
            Nombre (opcional):
            <input
              type="text"
              placeholder="Ej. Carlos Anotador"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={busy}
              style={{ padding: '0.6rem 0.8rem', background: '#0a1320', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
            Rol del usuario:
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'ADMIN' | 'NORMAL')}
              disabled={busy}
              style={{ padding: '0.6rem 0.8rem', background: '#0a1320', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
            >
              <option value="NORMAL">Normal (Anotador / Técnico)</option>
              <option value="ADMIN">Administrador (Control total)</option>
            </select>
          </label>

          <button type="submit" className="primary" disabled={busy} style={{ height: 42 }}>
            <UserPlus size={16} /> Dar de alta
          </button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.8rem' }}>
          💡 <strong>Administrador:</strong> Puede crear y borrar equipos, y gestionar otros usuarios. <br />
          💡 <strong>Normal:</strong> Puede registrar jugadores, convocar, cambiar quintetos, apuntar estadísticas en vivo y ver todos los informes.
        </p>
      </form>

      {/* Tabla de usuarios existentes */}
      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <UserCheck size={18} color="var(--turquoise)" /> Usuarios Autorizados ({users.length})
      </h3>

      <div className="table-scroll">
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th scope="col">Usuario</th>
              <th scope="col">Email de Google</th>
              <th scope="col">Rol</th>
              <th scope="col">Alta</th>
              <th scope="col" style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSuper = u.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
              return (
                <tr key={u.email}>
                  <td>
                    <strong>{u.name || u.email.split('@')[0]}</strong>
                    {isSuper && <span style={{ marginLeft: 6, fontSize: '0.72rem', background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', padding: '2px 6px', borderRadius: 4 }}>Principal</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: u.role === 'ADMIN' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                        color: u.role === 'ADMIN' ? '#38bdf8' : '#cbd5e1',
                      }}
                    >
                      {u.role === 'ADMIN' ? 'Administrador' : 'Normal'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-ES') : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!isSuper ? (
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleToggleRole(u)}
                          disabled={busy}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          title={`Cambiar a ${u.role === 'ADMIN' ? 'Normal' : 'Administrador'}`}
                        >
                          Cambiar a {u.role === 'ADMIN' ? 'Normal' : 'Admin'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(u.email)}
                          disabled={busy}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          title="Eliminar acceso"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inmutable</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!users.length && !loading && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
