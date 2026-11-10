import { canViewAccount } from './account-sharing.js';
import { teamWork, displayRoles } from './handoff-access.js';
import { type DB, type Actor, rows, isAdmin, management, hasJob, moduleAllowed } from './base.js';
export async function capabilities(c: DB, a: Actor) {
  const admin = isAdmin(a),
    manager = teamWork(a),
    worker = ['CONTENT', 'MARKETPLACE', 'HR'].some((j) => hasJob(a, j));
  let sharedAccount = false;
  for (const r of await rows(c, 'SELECT id FROM platform_accounts'))
    if (await canViewAccount(c, a.id, r.id)) {
      sharedAccount = true;
      break;
    }
  const groups = [
    {
      id: 'work',
      label: 'Công việc',
      items: [
        ...(worker || manager ? ['dashboard', 'mine'] : []),
        ...(manager ? ['team'] : []),
        ...(worker ? ['plans'] : []),
        ...(worker || manager ? ['reports'] : []),
        ...(a.grants.length ? ['legacy'] : []),
        ...(admin ? ['legacy-users'] : []),
        ...(moduleAllowed(a, 'business') ? ['legacy-business'] : []),
        ...(moduleAllowed(a, 'content') ? ['legacy-content'] : []),
      ],
    },
    {
      id: 'professional',
      label: 'Chuyên môn',
      items: ['content', 'business', 'hr'].filter(
        (m) =>
          admin || hasJob(a, ({ content: 'CONTENT', business: 'MARKETPLACE', hr: 'HR' } as any)[m]),
      ),
    },
    {
      id: 'requests',
      label: 'Đề nghị & tài khoản',
      items: [
        ...(a.grants.length ? ['requests'] : []),
        ...(admin || sharedAccount ? ['accounts'] : []),
      ],
    },
    {
      id: 'administration',
      label: 'Quản trị',
      items: [
        ...(admin || hasJob(a, 'HR') ? ['users'] : []),
        ...(admin ? ['templates', 'settings', 'history'] : []),
        'profile',
      ],
    },
  ].filter((g) => g.items.length);
  return {
    menu_groups: groups,
    task_templates_admin: admin,
    create_task: worker || manager,
    team_work: manager,
    display_roles: displayRoles(a),
  };
}
