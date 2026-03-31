/**
 * Permission Ontology
 * Standard keys for all actions in the system.
 */
export type Permission = 
  | 'users:view'
  | 'users:manage'
  | 'roles:manage'
  | 'inventory:view'
  | 'inventory:manage'
  | 'production:view'
  | 'production:manage'
  | 'orders:view'
  | 'orders:create'
  | 'orders:manage'
  | 'settings:view'
  | 'settings:manage';

export interface Role {
  _id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

/**
 * Helper to check if a user has a specific permission.
 *
 * System roles (admin, manager, worker) use HARDCODED whitelists that always
 * take priority over dynamic permissions. This prevents any DB configuration
 * from accidentally granting system roles unintended access.
 *
 * Custom roles (any slug that isn't a system role) use the permissions array
 * stored on their role object.
 */
export const hasPermission = (user: any, permission: Permission): boolean => {
  if (!user) return false;

  const role = user.role;

  // Resolve slug — works for both string and object role
  const slug: string = typeof role === 'string' ? role : (role?.slug ?? '');

  // ── System role: Admin ──────────────────────────────────────────────────────
  if (slug === 'admin') return true;

  // ── System role: Manager ───────────────────────────────────────────────────
  if (slug === 'manager') {
    const allowed: Permission[] = [
      'users:view',
      'inventory:view',
      'inventory:manage',
      'production:view',
      'production:manage',
      'orders:view',
      'orders:create',
      'orders:manage',
      'settings:view',
    ];
    return allowed.includes(permission);
  }

  // ── System role: Worker ────────────────────────────────────────────────────
  // Workers have a fixed, minimal set of permissions.
  // The dynamic permissions on the DB role object are intentionally ignored here
  // so admin cannot accidentally grant workers manager-level access.
  if (slug === 'worker') {
    const allowed: Permission[] = [
      'production:view',  // can see their own work / station tasks
    ];
    return allowed.includes(permission);
  }

  // ── Custom / dynamic role ──────────────────────────────────────────────────
  // For roles that are not system roles, respect whatever is in the DB.
  if (role && typeof role === 'object' && Array.isArray(role.permissions)) {
    return role.permissions.includes('*') || role.permissions.includes(permission);
  }

  // Flat permissions array directly on user (legacy fallback)
  if (user.permissions && Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }

  return false;
};



// Label mapping for UI display
export const PERMISSION_LABELS: Record<Permission, { label: string, group: string }> = {
  'users:view': { label: 'ดูรายชื่อผู้ใช้', group: 'จัดการผู้ใช้' },
  'users:manage': { label: 'จัดการผู้ใช้ (สร้าง/ลบ/แก้ไข)', group: 'จัดการผู้ใช้' },
  'roles:manage': { label: 'จัดการบทบาทและสิทธิ์', group: 'จัดการผู้ใช้' },
  'inventory:view': { label: 'ดูคลังสินค้า', group: 'คลังสินค้า' },
  'inventory:manage': { label: 'จัดการคลังสินค้า (เพิ่ม/ลด/แก้ไข)', group: 'คลังสินค้า' },
  'production:view': { label: 'ดูสถานะการผลิต', group: 'การผลิต' },
  'production:manage': { label: 'จัดการการผลิต (อัปเดตสถานี)', group: 'การผลิต' },
  'orders:view': { label: 'ดูคำสั่งซื้อ', group: 'คำสั่งซื้อ' },
  'orders:create': { label: 'สร้างคำสั่งซื้อใหม่', group: 'คำสั่งซื้อ' },
  'orders:manage': { label: 'จัดการคำสั่งซื้อ (แก้ไข/ยกเลิก)', group: 'คำสั่งซื้อ' },
  'settings:view': { label: 'ดูการตั้งค่า', group: 'ตั้งค่า' },
  'settings:manage': { label: 'แก้ไขการตั้งค่าระบบ', group: 'ตั้งค่า' },
};
