/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Building2,
  Plus,
  UserPlus,
  Check,
  X,
  Trash2,
  ShieldAlert,
  KeyRound,
  UserCheck,
  Sliders,
} from 'lucide-react';
import {
  RolePermission,
  TeamMember,
  UserRole,
  WorkspaceAccount,
} from '../types/nexus.ts';

interface AccountsTeamViewProps {
  accounts: WorkspaceAccount[];
  activeAccountId: string;
  currentActor?: TeamMember;
  onRefreshAuthContext: () => Promise<void>;
}

interface PermissionMeta {
  key: RolePermission;
  label: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrátor',
  editor: 'Editor / Tvůrce',
  viewer: 'Pozorovatel (Viewer)',
};

const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, RolePermission[]> = {
  admin: [
    'manage_team',
    'manage_integrations',
    'publish_videos',
    'create_edit_videos',
    'manage_templates',
    'view_analytics',
    'system_kill_switch',
  ],
  editor: ['publish_videos', 'create_edit_videos', 'manage_templates', 'view_analytics'],
  viewer: ['view_analytics'],
};

const ALL_PERMISSIONS_FALLBACK: PermissionMeta[] = [
  { key: 'manage_team', label: 'Správa účtů a týmu' },
  { key: 'manage_integrations', label: 'Správa OAuth & API integrací' },
  { key: 'publish_videos', label: 'Publikace a plánování videí' },
  { key: 'create_edit_videos', label: 'Tvorba a generování videí' },
  { key: 'manage_templates', label: 'Úprava a tvorba šablon' },
  { key: 'view_analytics', label: 'Přístup k analytice a trendům' },
  { key: 'system_kill_switch', label: 'Nouzový Kill Switch OS' },
];

export const AccountsTeamView: React.FC<AccountsTeamViewProps> = ({
  accounts,
  activeAccountId,
  currentActor,
  onRefreshAuthContext,
}) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [allMembersForSwitch, setAllMembersForSwitch] = useState<TeamMember[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionMeta[]>(ALL_PERMISSIONS_FALLBACK);
  const [filterByActiveWorkspace, setFilterByActiveWorkspace] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Account Modal
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccEmail, setNewAccEmail] = useState('bpcme66@gmail.com');
  const [newAccPlan, setNewAccPlan] = useState<'Creator Starter' | 'Studio Pro' | 'Enterprise Swarm'>('Studio Pro');
  const [newAccRatio, setNewAccRatio] = useState<'9:16' | '16:9'>('9:16');

  // Invite Team Member Modal
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('editor');
  const [invitePermissions, setInvitePermissions] = useState<RolePermission[]>(
    ROLE_DEFAULT_PERMISSIONS.editor
  );

  // Edit Permissions Modal
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<RolePermission[]>([]);

  const canManageTeam = !currentActor || (currentActor.status === 'active' && currentActor.permissions.includes('manage_team'));

  const loadTeam = async () => {
    setIsLoading(true);
    try {
      const [filteredRes, allRes] = await Promise.all([
        fetch(
          filterByActiveWorkspace && activeAccountId
            ? `/v1/team?accountId=${encodeURIComponent(activeAccountId)}`
            : '/v1/team'
        ),
        fetch('/v1/team'),
      ]);
      if (filteredRes.ok) {
        const data = await filteredRes.json();
        setMembers(data.members || []);
        if (Array.isArray(data.allPermissions) && data.allPermissions.length > 0) {
          setAllPermissions(data.allPermissions);
        }
      }
      if (allRes.ok) {
        const allData = await allRes.json();
        setAllMembersForSwitch(allData.members || []);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Nepodařilo se načíst seznam členů týmu.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, [activeAccountId, filterByActiveWorkspace]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleSwitchAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/v1/accounts/${accountId}/switch`, { method: 'POST' });
      if (res.ok) {
        await onRefreshAuthContext();
        showToast('success', 'Aktivní pracovní účet studia byl přepnut.');
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Chyba při přepínání účtu.');
      }
    } catch {
      showToast('error', 'Chyba komunikace se serverem.');
    }
  };

  const handleSwitchActor = async (memberId: string) => {
    if (!memberId) return;
    try {
      const res = await fetch('/v1/team/switch-actor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (res.ok) {
        await onRefreshAuthContext();
        await loadTeam();
        showToast(
          'success',
          `Aktivní relace přepnuta na ${data.currentActor.name} (${ROLE_LABELS[data.currentActor.role as UserRole]}).`
        );
      } else {
        showToast('error', data.error || 'Nepodařilo se přepnout profil.');
      }
    } catch {
      showToast('error', 'Chyba při přepínání aktivní role.');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeam) return;

    try {
      const res = await fetch('/v1/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccName,
          ownerEmail: newAccEmail,
          plan: newAccPlan,
          defaultAspectRatio: newAccRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Vytvoření účtu selhalo.');
        return;
      }

      setNewAccName('');
      setIsCreateAccountOpen(false);
      await onRefreshAuthContext();
      await loadTeam();
      showToast('success', `Nový účet "${data.name}" byl vytvořen.`);
    } catch {
      showToast('error', 'Chyba sítě při vytváření účtu.');
    }
  };

  const handleRolePresetChange = (role: UserRole) => {
    setInviteRole(role);
    setInvitePermissions([...ROLE_DEFAULT_PERMISSIONS[role]]);
  };

  const toggleInvitePermission = (perm: RolePermission) => {
    setInvitePermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeam) return;

    try {
      const res = await fetch('/v1/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
          accountId: activeAccountId,
          permissions: invitePermissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Pozvání člena selhalo.');
        return;
      }

      setInviteName('');
      setInviteEmail('');
      setInviteRole('editor');
      setInvitePermissions([...ROLE_DEFAULT_PERMISSIONS.editor]);
      setIsInviteOpen(false);
      await loadTeam();
      showToast('success', `Člen ${data.name} (${ROLE_LABELS[data.role as UserRole]}) byl přidán do týmu.`);
    } catch {
      showToast('error', 'Chyba při odesílání pozvánky.');
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: UserRole) => {
    if (!canManageTeam) return;
    try {
      const res = await fetch(`/v1/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Změna role selhala.');
        return;
      }
      await loadTeam();
      await onRefreshAuthContext();
      showToast('success', `Role uživatele ${data.name} byla změněna na ${ROLE_LABELS[newRole]}.`);
    } catch {
      showToast('error', 'Chyba při změně role.');
    }
  };

  const handleToggleMemberStatus = async (member: TeamMember) => {
    if (!canManageTeam || member.id === currentActor?.id) return;
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/v1/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await loadTeam();
        showToast(
          'success',
          `Uživatel ${member.name} je nyní ${nextStatus === 'active' ? 'aktivní' : 'pozastaven'}.`
        );
      }
    } catch {
      showToast('error', 'Chyba při aktualizaci stavu uživatele.');
    }
  };

  const handleSaveEditedPermissions = async () => {
    if (!editingMember || !canManageTeam) return;
    try {
      const res = await fetch(`/v1/team/${editingMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: editingPermissions }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Uložení oprávnění selhalo.');
        return;
      }
      setEditingMember(null);
      await loadTeam();
      await onRefreshAuthContext();
      showToast('success', `Oprávnění pro ${data.name} byla aktualizována.`);
    } catch {
      showToast('error', 'Chyba při ukládání oprávnění.');
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!canManageTeam || member.id === currentActor?.id) return;
    try {
      const res = await fetch(`/v1/team/${member.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Odstranění člena selhalo.');
        return;
      }
      await loadTeam();
      showToast('success', `Člen ${member.name} byl odebrán z týmu.`);
    } catch {
      showToast('error', 'Chyba při odebírání člena.');
    }
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  const getRoleBadgeClass = (role: UserRole) => {
    if (role === 'admin') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40';
    if (role === 'editor') return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40';
    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header & Active Session Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 font-mono">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span>Správa účtů, týmů a oprávnění (RBAC)</span>
          </h1>
          <p className="mt-1 text-xs text-zinc-400 font-mono">
            Vytvářejte samostatné pracovní prostory, zvěte členy týmu a vynucujte oprávnění pro Administrátory, Editory i Pozorovatele.
          </p>
        </div>

        {/* Live Session Switcher for Role Verification */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 whitespace-nowrap shrink-0">
            <UserCheck className="h-4 w-4 text-emerald-400" />
            <span>Aktivní relace:</span>
          </div>
          <select
            aria-label="Přepnout aktivního uživatele a roli"
            value={currentActor?.id || ''}
            onChange={(e) => handleSwitchActor(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none max-w-[260px]"
          >
            {allMembersForSwitch
              .filter((m) => m.status === 'active')
              .map((m) => {
                const wsName = accounts.find((a) => a.id === m.accountId)?.name || m.accountId;
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} · {wsName} ({ROLE_LABELS[m.role]})
                  </option>
                );
              })}
          </select>
          {currentActor && (
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-mono font-bold uppercase whitespace-nowrap shrink-0 ${getRoleBadgeClass(
                currentActor.role
              )}`}
            >
              {currentActor.role} · {currentActor.permissions.length} práv
            </span>
          )}
        </div>
      </div>

      {/* RBAC Restriction Alert when signed in as Viewer / Editor without manage_team */}
      {!canManageTeam && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-mono text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              Jste přihlášeni jako <strong>{currentActor?.name} ({currentActor ? ROLE_LABELS[currentActor.role] : ''})</strong> bez oprávnění <code>manage_team</code>. Tvorba účtů, pozvánky a změny rolí jsou chráněny RBAC.
            </span>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs font-mono flex items-center justify-between ${
            feedback.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            aria-label="Zavřít oznámení"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Section 1: Studio Accounts / Workspaces */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-400" />
              <span>Účty AI Video Studia ({accounts.length})</span>
            </h2>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
              Aktivní workspace: <span className="text-emerald-400 font-semibold">{activeAccount?.name}</span> ({activeAccount?.plan} · výchozí formát {activeAccount?.defaultAspectRatio})
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateAccountOpen(true)}
            disabled={!canManageTeam}
            className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-mono font-bold text-black hover:bg-emerald-400 whitespace-nowrap shrink-0 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Vytvořit účet</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acc) => {
            const isActive = acc.id === activeAccountId;
            return (
              <div
                key={acc.id}
                className={`rounded-lg border p-4 flex flex-col justify-between gap-3 transition ${
                  isActive
                    ? 'border-emerald-500/60 bg-emerald-500/5'
                    : 'border-zinc-800 bg-zinc-950/70'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-white truncate">
                      {acc.name}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      {isActive ? 'Aktivní' : acc.plan}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-400 truncate">
                    Vlastník: {acc.ownerEmail}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 tabular-nums">
                    <span>Slug: {acc.slug}</span>
                    <span>·</span>
                    <span>Formát: {acc.defaultAspectRatio}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70">
                  <span className="text-[10px] font-mono text-zinc-500">{acc.plan}</span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      Vybraný účet
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSwitchAccount(acc.id)}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-400 whitespace-nowrap shrink-0 transition"
                    >
                      Přepnout účet
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: Team Members & Invitations */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" />
              <span>Členové týmu & přiřazené role ({members.length})</span>
            </h2>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
              Pozvěte kolegy, přidělte jim role Administrátor / Editor / Viewer a upravte detailní oprávnění.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterByActiveWorkspace((prev) => !prev)}
              className={`rounded border px-3 py-1.5 text-xs font-mono whitespace-nowrap shrink-0 transition ${
                filterByActiveWorkspace
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300'
              }`}
            >
              {filterByActiveWorkspace ? 'Jen aktivní účet' : 'Všechny účty'}
            </button>

            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              disabled={!canManageTeam}
              className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-mono font-bold text-black hover:bg-emerald-400 whitespace-nowrap shrink-0 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Pozvat člena týmu</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/70">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Člen</th>
                <th className="px-4 py-2.5">Účet</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Oprávnění</th>
                <th className="px-4 py-2.5">Stav</th>
                <th className="px-4 py-2.5 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {isLoading && members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    Načítám členy týmu...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    V tomto pracovním prostoru zatím nejsou žádní členové.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const accountName =
                    accounts.find((a) => a.id === member.accountId)?.name || member.accountId;
                  const isCurrentActor = member.id === currentActor?.id;

                  return (
                    <tr key={member.id} className="hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{member.name}</span>
                          {isCurrentActor && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/30">
                              Vy
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">{member.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-zinc-300">{accountName}</td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Změnit roli pro ${member.name}`}
                          value={member.role}
                          disabled={!canManageTeam}
                          onChange={(e) =>
                            handleUpdateMemberRole(member.id, e.target.value as UserRole)
                          }
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                        >
                          <option value="admin">Administrátor</option>
                          <option value="editor">Editor / Tvůrce</option>
                          <option value="viewer">Pozorovatel (Viewer)</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!canManageTeam}
                          onClick={() => {
                            setEditingMember(member);
                            setEditingPermissions([...member.permissions]);
                          }}
                          className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:border-cyan-500/50 hover:text-cyan-300 whitespace-nowrap shrink-0 disabled:opacity-50 tabular-nums"
                        >
                          <Sliders className="h-3 w-3 text-cyan-400" />
                          <span>{member.permissions.length} / {allPermissions.length} práv</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!canManageTeam || isCurrentActor}
                          onClick={() => handleToggleMemberStatus(member)}
                          className={`rounded border px-2 py-0.5 text-[10px] uppercase whitespace-nowrap shrink-0 disabled:opacity-60 ${
                            member.status === 'active'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          }`}
                        >
                          {member.status === 'active' ? 'Aktivní' : 'Pozastaven'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {!isCurrentActor && member.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleSwitchActor(member.id)}
                              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400 whitespace-nowrap shrink-0"
                            >
                              Přepnout jako
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Odebrat člena ${member.name}`}
                            disabled={!canManageTeam || isCurrentActor}
                            onClick={() => handleRemoveMember(member)}
                            className="rounded border border-zinc-800 bg-zinc-900 p-1 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Role Permission Matrix Reference */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
        <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" />
          <span>Matice oprávnění podle rolí (RBAC)</span>
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/70">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-2">Oprávnění</th>
                <th className="px-4 py-2 text-center">Administrátor</th>
                <th className="px-4 py-2 text-center">Editor / Tvůrce</th>
                <th className="px-4 py-2 text-center">Pozorovatel (Viewer)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-[11px]">
              {allPermissions.map((perm) => (
                <tr key={perm.key}>
                  <td className="px-4 py-2 text-zinc-200">
                    {perm.label}{' '}
                    <span className="text-zinc-500">({perm.key})</span>
                  </td>
                  {(['admin', 'editor', 'viewer'] as UserRole[]).map((role) => {
                    const allowed = ROLE_DEFAULT_PERMISSIONS[role].includes(perm.key);
                    return (
                      <td key={role} className="px-4 py-2 text-center">
                        {allowed ? (
                          <span className="inline-flex items-center justify-center text-emerald-400">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Create Studio Account */}
      {isCreateAccountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl font-mono space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-400" />
                <span>Nový pracovní účet studia</span>
              </h3>
              <button
                type="button"
                aria-label="Zavřít modal vytvoření účtu"
                onClick={() => setIsCreateAccountOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Název účtu / studia</label>
                <input
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="Např. E-commerce Brand Studio"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">E-mail vlastníka</label>
                <input
                  type="email"
                  required
                  value={newAccEmail}
                  onChange={(e) => setNewAccEmail(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Tarif</label>
                  <select
                    value={newAccPlan}
                    onChange={(e) =>
                      setNewAccPlan(
                        e.target.value as 'Creator Starter' | 'Studio Pro' | 'Enterprise Swarm'
                      )
                    }
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Creator Starter">Creator Starter</option>
                    <option value="Studio Pro">Studio Pro</option>
                    <option value="Enterprise Swarm">Enterprise Swarm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Výchozí formát</label>
                  <select
                    value={newAccRatio}
                    onChange={(e) => setNewAccRatio(e.target.value as '9:16' | '16:9')}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="9:16">9:16 (Shorts / Reels)</option>
                    <option value="16:9">16:9 (YouTube Video)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreateAccountOpen(false)}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:text-white"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-500 px-4 py-1.5 font-bold text-black hover:bg-emerald-400"
                >
                  Vytvořit účet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invite Team Member */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl font-mono space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-400" />
                <span>Pozvat nového člena týmu</span>
              </h3>
              <button
                type="button"
                aria-label="Zavřít modal pozvání člena"
                onClick={() => setIsInviteOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInviteMember} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Jméno a příjmení</label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Např. Lukáš Král"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">E-mailová adresa</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="lukas@firma.cz"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Výchozí role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => handleRolePresetChange(e.target.value as UserRole)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="admin">Administrátor (plný přístup)</option>
                  <option value="editor">Editor / Tvůrce (tvorba, šablony, publikace)</option>
                  <option value="viewer">Pozorovatel / Viewer (pouze analytika a čtení)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-zinc-400">Granulární oprávnění</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  {allPermissions.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-center gap-2 text-[11px] text-zinc-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={invitePermissions.includes(perm.key)}
                        onChange={() => toggleInvitePermission(perm.key)}
                        className="rounded border-zinc-600 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:text-white"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-500 px-4 py-1.5 font-bold text-black hover:bg-emerald-400"
                >
                  Odeslat pozvánku
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Customize Member Permissions */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl font-mono space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                Oprávnění: {editingMember.name}
              </h3>
              <button
                type="button"
                aria-label="Zavřít úpravu oprávnění"
                onClick={() => setEditingMember(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              {allPermissions.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 cursor-pointer"
                >
                  <span className="text-zinc-200">{perm.label}</span>
                  <input
                    type="checkbox"
                    checked={editingPermissions.includes(perm.key)}
                    onChange={() =>
                      setEditingPermissions((prev) =>
                        prev.includes(perm.key)
                          ? prev.filter((p) => p !== perm.key)
                          : [...prev, perm.key]
                      )
                    }
                    className="rounded border-zinc-600 bg-zinc-950 text-emerald-500"
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:text-white"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSaveEditedPermissions}
                className="rounded bg-emerald-500 px-4 py-1.5 font-bold text-black hover:bg-emerald-400"
              >
                Uložit oprávnění
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
