import type { Role } from "@/lib/api/types";

type RoleValue = Role | string | null | undefined;

export function getRoleSlug(role: RoleValue): string {
    if (!role) return "";
    if (typeof role === "string") return role;
    return role.slug ?? "";
}

export function getRoleName(role: RoleValue): string {
    if (!role) return "";
    if (typeof role === "string") return role;
    return role.name ?? role.slug ?? "";
}

export function getRoleId(role: RoleValue): string {
    if (!role) return "";
    if (typeof role === "string") return role;
    return role._id ?? "";
}

export function hasPermission(role: RoleValue, perm: string): boolean {
    if (!role || typeof role === "string") return false;
    return role.permissions?.includes("*") || role.permissions?.includes(perm);
}

export function isManagerOrAbove(role: RoleValue): boolean {
    const slug = getRoleSlug(role);
    return slug === "admin" || slug === "manager";
}

export function isAdmin(role: RoleValue): boolean {
    return getRoleSlug(role) === "admin";
}
