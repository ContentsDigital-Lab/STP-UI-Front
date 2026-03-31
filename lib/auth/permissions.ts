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
 * Currently supports:
 * 1. Hardcoded legacy roles (Admin gets everything, Manager gets most).
 * 2. New dynamic roles (using the permissions array).
 */
export const hasPermission = (user: any, permission: Permission): boolean => {
  if (!user) return false;

  // Legacy Hardcoded Rules (Fallback)
  if (user.role === 'admin') return true;
  
  if (user.role === 'manager') {
    const managerPermissions: Permission[] = [
      'users:view',
      'inventory:view',
      'inventory:manage',
      'production:view',
      'production:manage',
      'orders:view',
      'orders:create',
      'orders:manage',
      'settings:view'
    ];
    if (managerPermissions.includes(permission)) return true;
  }

  // Dynamic Role Rules (Future Proofing)
  if (user.permissions && Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }

  // If the role itself is an object containing permissions
  if (user.role && typeof user.role === 'object' && user.role.permissions) {
    return user.role.permissions.includes(permission);
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
