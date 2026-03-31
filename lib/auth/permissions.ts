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
 * Extract the role slug from either a string or populated Role object.
 */
function resolveRoleSlug(role: unknown): string {
  if (!role) return "";
  if (typeof role === "string") return role;
  if (typeof role === "object" && role !== null) {
    return (role as Record<string, unknown>).slug as string ?? "";
  }
  return "";
}

/**
 * Extract the permissions array from a populated Role object.
 */
function resolvePermissions(role: unknown): string[] {
  if (!role || typeof role !== "object" || role === null) return [];
  const perms = (role as Record<string, unknown>).permissions;
  return Array.isArray(perms) ? perms as string[] : [];
}

/**
 * Helper to check if a user has a specific permission.
 * Supports:
 * 1. Legacy string roles ("admin", "manager", "worker")
 * 2. Populated Role objects ({ _id, slug, permissions[] })
 */
export const hasPermission = (user: any, permission: Permission): boolean => {
  if (!user) return false;

  const role = user.role;
  const slug = resolveRoleSlug(role);

  // Admin gets everything (works for both string "admin" and object { slug: "admin" })
  if (slug === "admin") return true;

  // Check permissions array from the populated Role object
  const rolePerms = resolvePermissions(role);
  if (rolePerms.includes("*") || rolePerms.includes(permission)) return true;

  // Manager fallback (legacy hardcoded permissions)
  if (slug === "manager") {
    const managerPermissions: Permission[] = [
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
    return managerPermissions.includes(permission);
  }

  // Check user-level permissions (if any)
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
