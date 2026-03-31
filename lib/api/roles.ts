import { Role, Permission } from "../auth/permissions";

// Initial mock data
let mockRoles: Role[] = [
  { _id: '1', name: 'Admin', description: 'ผู้ดูแลระบบสูงสุด เข้าถึงได้ทุกส่วน', permissions: ['users:view', 'users:manage', 'roles:manage', 'inventory:view', 'inventory:manage', 'production:view', 'production:manage', 'orders:view', 'orders:create', 'orders:manage', 'settings:view', 'settings:manage'] },
  { _id: '2', name: 'Manager', description: 'ผู้จัดการโรงงาน จัดการการผลิตและสินค้า', permissions: ['users:view', 'inventory:view', 'inventory:manage', 'production:view', 'production:manage', 'orders:view', 'orders:create', 'orders:manage', 'settings:view'] },
  { _id: '3', name: 'Worker', description: 'พนักงานทั่วไป เข้าถึงเครื่องมือปฏิบัติงาน', permissions: ['production:view', 'orders:view'] },
];

export const rolesApi = {
  getAll: async (): Promise<{ success: boolean, data: Role[] }> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true, data: [...mockRoles] };
  },

  create: async (data: Partial<Role>): Promise<{ success: boolean, data: Role }> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newRole: Role = {
      _id: Math.random().toString(36).substr(2, 9),
      name: data.name || 'New Role',
      description: data.description || '',
      permissions: data.permissions || [],
    };
    mockRoles.push(newRole);
    return { success: true, data: newRole };
  },

  update: async (id: string, data: Partial<Role>): Promise<{ success: boolean, data: Role }> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = mockRoles.findIndex(r => r._id === id);
    if (index !== -1) {
      mockRoles[index] = { ...mockRoles[index], ...data };
      return { success: true, data: mockRoles[index] };
    }
    throw new Error('Role not found');
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    mockRoles = mockRoles.filter(r => r._id !== id);
    return { success: true };
  }
};
