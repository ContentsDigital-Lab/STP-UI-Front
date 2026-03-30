<script setup>
import Card from '../.vitepress/theme/Card.vue'
import Steps from '../.vitepress/theme/Steps.vue'
import StatusTable from '../.vitepress/theme/StatusTable.vue'

const statuses = [
  { label: 'รอดำเนินการ', desc: 'ชิ้นงานยังไม่ได้เข้าสถานี', color: '#94a3b8' },
  { label: 'กำลังดำเนินการ', desc: 'กำลังถูกดำเนินการที่สถานี', color: '#2956d4' },
  { label: 'รอสแกนออก', desc: 'ทำเสร็จแล้ว รอสแกนส่งต่อ', color: '#e8550a' },
  { label: 'เสร็จสิ้น', desc: 'ผ่านสถานีเรียบร้อยแล้ว', color: '#16a34a' },
]
</script>

# ติดตามการผลิต

ดูสถานะของทุกคำสั่งซื้อและชิ้นงานแบบเรียลไทม์

## วิธีใช้งาน

<Steps>
<div class="step" data-step="1">
<h4>เปิดหน้าติดตามการผลิต</h4>
<p>กดเมนู <strong>ติดตามการผลิต</strong> ที่แถบด้านซ้าย</p>
</div>
<div class="step" data-step="2">
<h4>เลือกคำสั่งซื้อ</h4>
<p>กดที่คำสั่งซื้อที่ต้องการดู จะเห็นรายการ <strong>ชิ้นงาน</strong> ทั้งหมด</p>
</div>
<div class="step" data-step="3">
<h4>ดูรายละเอียด</h4>
<p>แต่ละชิ้นงานจะแสดง: เลขชิ้นงาน, ประเภทกระจก, ขนาด, สถานีปัจจุบัน, สถานะ</p>
</div>
</Steps>

::: tip เคล็ดลับ
ใช้ตัวกรองด้านบนเพื่อกรองตามสถานะ: รอดำเนินการ, กำลังผลิต, เสร็จแล้ว, ยกเลิก
:::

## สถานะชิ้นงาน

<StatusTable :statuses="statuses" />

## พิมพ์ใบงาน

<Card title="พิมพ์ใบงานพร้อม QR Code" variant="blue">

1. เข้าหน้ารายละเอียดคำสั่งซื้อ
2. กดปุ่ม **พิมพ์**
3. ระบบจะสร้างใบงานพร้อม QR Code สำหรับนำไปใช้สแกนที่สถานี

</Card>

<Card title="QR Code บนชิ้นงาน" variant="orange">
ชิ้นงานทุกชิ้นจะมี QR Code เฉพาะตัว ใช้สำหรับสแกนเข้า-ออกสถานีงาน — ดูเพิ่มเติมในหน้า <a href="/guide/stations">การทำงานที่สถานี</a>
</Card>
