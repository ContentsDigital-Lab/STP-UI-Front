// Shared station catalog — used in StationSequencePicker and /stations page

export interface StationInfo {
    id:    string;
    label: string;
    desc:  string;
    /** Tailwind bg+text classes for the color badge */
    color: string;
}

export const STATION_CATALOG: StationInfo[] = [
    { id: "cutting",    label: "ตัดกระจก",       desc: "ตัดตามขนาดที่กำหนด",       color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"           },
    { id: "grinding",   label: "เจียร/ลบคม",     desc: "เจียรขอบให้เรียบ",          color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
    { id: "drilling",   label: "เจาะรู",          desc: "เจาะรูตามแบบ",              color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
    { id: "tempering",  label: "เทมเปอร์",        desc: "อบความร้อนเพิ่มความแข็ง",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"             },
    { id: "laminating", label: "ลามิเนต",          desc: "เคลือบฟิล์มกันแตก",        color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"     },
    { id: "coating",    label: "เคลือบผิว",       desc: "เคลือบสีหรือกันรังสี UV",  color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
    { id: "framing",    label: "ใส่กรอบ/ประกอบ", desc: "ประกอบชิ้นส่วนและใส่กรอบ", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"         },
    { id: "inspection", label: "ตรวจสอบคุณภาพ",  desc: "QC ก่อนส่งมอบ",            color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"         },
    { id: "packing",    label: "บรรจุ/แพ็ค",      desc: "บรรจุหีบห่อป้องกันแตก",    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"         },
    { id: "delivery",   label: "จัดส่ง",          desc: "ส่งมอบให้ลูกค้า",          color: "bg-slate-100 text-slate-700 dark:bg-slate-700/30 dark:text-slate-300"     },
];
