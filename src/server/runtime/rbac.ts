/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RolePermission, TeamMember, UserRole } from '../../types/nexus.ts';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrátor',
  editor: 'Editor / Tvůrce',
  viewer: 'Pozorovatel (Viewer)',
};

export const PERMISSION_LABELS: Record<RolePermission, string> = {
  manage_team: 'Správa účtů a týmu',
  manage_integrations: 'Správa OAuth & API integrací',
  publish_videos: 'Publikace a plánování videí',
  create_edit_videos: 'Tvorba a generování videí',
  manage_templates: 'Úprava a tvorba šablon',
  view_analytics: 'Přístup k analytice a trendům',
  system_kill_switch: 'Nouzový Kill Switch OS',
};

export const ALL_PERMISSIONS: RolePermission[] = [
  'manage_team',
  'manage_integrations',
  'publish_videos',
  'create_edit_videos',
  'manage_templates',
  'view_analytics',
  'system_kill_switch',
];

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, RolePermission[]> = {
  admin: [
    'manage_team',
    'manage_integrations',
    'publish_videos',
    'create_edit_videos',
    'manage_templates',
    'view_analytics',
    'system_kill_switch',
  ],
  editor: [
    'publish_videos',
    'create_edit_videos',
    'manage_templates',
    'view_analytics',
  ],
  viewer: ['view_analytics'],
};

export function getDefaultPermissionsForRole(role: UserRole): RolePermission[] {
  return [...(ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.viewer)];
}

export function hasPermission(
  member: Pick<TeamMember, 'role' | 'permissions' | 'status'> | undefined | null,
  permission: RolePermission
): boolean {
  if (!member || member.status !== 'active') return false;
  return member.permissions.includes(permission);
}

export function validateInviteInput(input: {
  name?: string;
  email?: string;
  role?: string;
}): { valid: boolean; error?: string } {
  const name = (input.name || '').trim();
  const email = (input.email || '').trim();
  const role = input.role;

  if (name.length < 2) {
    return { valid: false, error: 'Jméno člena musí mít alespoň 2 znaky.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Zadejte platnou e-mailovou adresu.' };
  }
  if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
    return { valid: false, error: 'Neplatná role. Povolené jsou admin, editor nebo viewer.' };
  }
  return { valid: true };
}

export function validateAccountInput(input: {
  name?: string;
  ownerEmail?: string;
}): { valid: boolean; error?: string } {
  const name = (input.name || '').trim();
  const ownerEmail = (input.ownerEmail || '').trim();

  if (name.length < 3) {
    return { valid: false, error: 'Název účtu studia musí mít alespoň 3 znaky.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return { valid: false, error: 'E-mail vlastníka účtu není platný.' };
  }
  return { valid: true };
}
