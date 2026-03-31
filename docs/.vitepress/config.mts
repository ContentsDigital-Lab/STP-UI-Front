import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "STP Documentation",
  description: "เอกสารประกอบระบบจัดการ Standard Plus",
  lang: 'th-TH',
  themeConfig: {
    logo: '/logonotname.png',
    nav: [
      { text: 'หน้าแรก', link: '/' },
      { text: 'คู่มือ', link: '/guide/getting-started' },
    ],

    sidebar: [
      {
        text: 'เริ่มต้นใช้งาน',
        items: [
          { text: 'แนะนำระบบ', link: '/guide/getting-started' },
          { text: 'หน้าแดชบอร์ด', link: '/guide/dashboard' },
        ]
      },
      {
        text: 'การสั่งซื้อและผลิต',
        items: [
          { text: 'รับออเดอร์', link: '/guide/order-requests' },
          { text: 'ติดตามการผลิต', link: '/guide/production' },
          { text: 'การทำงานที่สถานี', link: '/guide/stations' },
        ]
      },
      {
        text: 'คลังสินค้า',
        items: [
          { text: 'ดูสต็อกกระจก', link: '/guide/inventory' },
          { text: 'เบิกวัสดุ', link: '/guide/withdrawals' },
          { text: 'แจ้งเคลม', link: '/guide/claims' },
        ]
      },
      {
        text: 'สถานีงาน',
        items: [
          { text: 'จัดการสถานี', link: '/guide/station-management' },
          { text: 'ออกแบบสถานี', link: '/guide/station-designer' },
          { text: 'ออกแบบสติกเกอร์', link: '/guide/sticker-designer' },
        ]
      },
      {
        text: 'ระบบและตั้งค่า',
        items: [
          { text: 'ประวัติการทำรายการ', link: '/guide/logs' },
          { text: 'ตั้งค่า', link: '/guide/settings' },
        ]
      },
    ],

    outline: {
      label: 'ในหน้านี้',
    },

    docFooter: {
      prev: 'หน้าก่อนหน้า',
      next: 'หน้าถัดไป',
    },
  }
})
