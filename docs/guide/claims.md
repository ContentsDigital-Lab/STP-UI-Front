<script setup>
import Card from '../.vitepress/theme/Card.vue'
import Steps from '../.vitepress/theme/Steps.vue'
import Flow from '../.vitepress/theme/Flow.vue'

const claimFlow = [
  { label: 'พบปัญหา' },
  { label: 'แจ้งเคลม' },
  { label: 'ผู้จัดการตรวจสอบ' },
  { label: 'ตัดสินใจ' },
]
</script>

# แจ้งเคลม

เมื่อพบปัญหากับชิ้นงาน สามารถแจ้งเคลมได้ที่นี่

## ขั้นตอนโดยรวม

<Flow :items="claimFlow" />

## วิธีแจ้งเคลม

<Steps>
<div class="step" data-step="1">
<h4>เปิดหน้าเคลม</h4>
<p>กดเมนู <strong>เคลม</strong> ที่แถบด้านซ้าย แล้วกดปุ่ม <strong>แจ้งเคลม</strong></p>
</div>
<div class="step" data-step="2">
<h4>เลือกชิ้นงานที่มีปัญหา</h4>
<p>เลือกคำสั่งซื้อและชิ้นงานที่พบปัญหา</p>
</div>
<div class="step" data-step="3">
<h4>ระบุแหล่งที่มา</h4>
<p><strong>ลูกค้า</strong> — ลูกค้าแจ้งปัญหากลับมา หรือ <strong>พนักงาน</strong> — พบปัญหาระหว่างผลิต</p>
</div>
<div class="step" data-step="4">
<h4>อธิบายปัญหา</h4>
<p>ระบุรายละเอียดว่าเกิดอะไรขึ้น ชิ้นงานเสียหายอย่างไร</p>
</div>
<div class="step" data-step="5">
<h4>แนบรูปถ่าย</h4>
<p>ถ่ายรูปชิ้นงานที่มีปัญหาแล้วแนบเข้ามา (ถ้ามี)</p>
</div>
<div class="step" data-step="6">
<h4>ส่งเคลม</h4>
<p>กดปุ่ม <strong>ส่งเคลม</strong> — ผู้จัดการจะได้รับแจ้งเตือนทันที</p>
</div>
</Steps>

## การตัดสินใจ

หลังจากแจ้งเคลม ผู้จัดการจะตรวจสอบและตัดสินใจ:

<Card title="ทำลาย" variant="red">
ทิ้งชิ้นงาน ตัดออกจากระบบ — ใช้กรณีชิ้นงานเสียหายจนใช้ไม่ได้
</Card>

<Card title="เก็บไว้ใช้" variant="green">
เก็บเป็นวัสดุเหลือใช้ (Reuse) กลับเข้าคลัง — นำไปใช้ในงานอื่นได้
</Card>
