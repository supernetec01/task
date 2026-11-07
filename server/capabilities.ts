import { canViewAccount } from './account-sharing.js';
import { type DB, type Actor, rows, isAdmin, management, hasJob, moduleAllowed } from './base.js';
export async function capabilities(c: DB, a: Actor) {
  const admin = isAdmin(a),
    manager = management(a),
    worker = a.grants.some((g) => g.kind === 'JOB');
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
      ],
    },
    {
      id: 'professional',
      label: 'Chuyên môn',
      items: ['content', 'business', 'ads', 'hr', 'warehouse', 'finance', 'issues'].filter((m) =>
        moduleAllowed(a, m),
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
        ...(manager ? ['users'] : []),
        ...(admin ? ['templates', 'settings', 'history'] : []),
        'profile',
      ],
    },
  ].filter((g) => g.items.length);
  return { menu_groups: groups, task_templates_admin: admin, create_task: worker || manager };
}
