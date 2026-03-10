export const th = {
    dashboard: {
        label: "แดชบอร์ด",
        welcome: "ยินดีต้อนรับ",
        total_stock: "สต็อกทั้งหมด",
        low_stock_alerts: "การแจ้งเตือนสต็อกต่ำ",
        pending_requests: "คำขอที่รอนุมัติ",
        completed_today: "ทำรายการวันนี้",
        inventory_flow: "กระแสการหมุนเวียนวัสดุ",
        recent_activity: "กิจกรรมล่าสุด",
    },
    orders: "รายการสั่งซื้อ",
    production: "ฝ่ายผลิต",
    inventory: "คลังกระจก",
    settings: "ตั้งค่า",
    totalOrders: "รายการสั่งซื้อทั้งหมด",
    inProgress: "กำลังดำเนินการ",
    completed: "เสร็จสิ้น",
    revenue: "ยอดขายประจำเดือน",
    recentActivity: "กิจกรรมล่าสุด",
    welcomeMessage: "ยินดีต้อนรับสู่ระบบจัดการ Standard Plus",
    quickActions: "เมนูด่วน",
    theme: {
        light: "โหมดสว่าง",
        dark: "โหมดมืด",
        system: "ตามระบบ"
    },
    language: "ภาษา",
    inventory_dashboard: {
        title: "คลังกระจก",
        subtitle: "ระบบติดตามสต็อกและจัดการคลังสินค้าแบบเรียลไทม์",
        totalItems: "รายการวัสดุทั้งหมด",
        lowStock: "รายการที่ใกล้หมด",
        totalQuantity: "จำนวนทั้งหมด",
        mostStocked: "มีสต็อกมากที่สุด",
        searchPlaceholder: "ค้นหาอัจฉริยะ (เช่น 'กระจก' หรือ 'สต็อก A1')...",
        filterLabel: "กรองโดย",
        type: "ประเภท",
        area: "พื้นที่จัดเก็บ",
        glassType: "ประเภทกระจก",
        clearFilters: "ล้างตัวกรอง",
        manageMaterials: "จัดการวัสดุ",
        importStock: "นำเข้าสต็อก",
        table: {
            identity: "ข้อมูลวัสดุ",
            area: "พื้นที่จัดเก็บ",
            health: "สถานะสต็อก",
            type: "ประเภท",
            quantity: "จำนวน",
            unknown: "ไม่พบข้อมูลวัสดุ",
            healthy: "ปกติ",
            warning: "ควรระวัง",
            lowStock: "สต็อกต่ำ"
        },
        detail: {
            technical: "ข้อมูลทางเทคนิค",
            logs: "ประวัติการทำรายการ",
            last30: "30 วันล่าสุด",
            update: "แก้ไขข้อมูล",
            addQuantity: "เพิ่มจำนวนวัสดุ",
            currentStock: "จำนวนที่มีอยู่ปัจจุบัน",
            status: "สถานะการไหลเวียน",
            actionRequired: "น้อย - ควรเติมของ",
            noLogs: "ไม่พบประวัติการทำรายการ"
        }
    }
};

export type Dictionary = typeof th;
