"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { useEditor } from "@craftjs/core";
import { Database, Zap, Settings2, HelpCircle, ChevronDown, Plus, Trash2, GripVertical } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Section  = "props" | "data" | "action";
type FieldDef = {
    label:         string;
    hint?:         string;
    type:          "text" | "number" | "select" | "textarea" | "toggle" | "column-editor" | "text-format";
    options?:      string[];
    optionLabels?: string[];
    placeholder?:  string;
    suggestions?:  string[];              // combo-box suggestions
    section:       Section;
    showWhen?:     { field: string; value: string | string[] | boolean };
};

// ── Shared suggestion banks ───────────────────────────────────────────────────
const FIELD_KEY_SUGGESTIONS = ["customer","material","quantity","notes","deadline","status","description","price","orderId","requestId","workerId","email","phone","address","remark","type"];
const DATA_VAR_SUGGESTIONS   = ["order.status","order.quantity","order.customer.name","order.material.name","order.priority","order.assignedTo.name","request.details.type","request.details.estimatedPrice","request.deadline","request.deliveryLocation","request.customer.name"];
const ENDPOINT_SUGGESTIONS    = ["/orders","/requests","/panes","/materials","/workers","/customers","/inventories","/claims","/withdrawals","/material-logs","/notifications"];
const NAVIGATE_TO_SUGGESTIONS = ["/production","/request","/stations","/inventory","/withdrawals","/claims","/logs","/settings"];
const NAVIGATE_SUGGESTIONS   = ["/production","/request","/stations","/inventory","/withdrawals","/claims","/logs","/settings"];
const LABEL_FIELD_SUGGESTIONS = ["name","customer.name","material.name","details.type","code","username","title","type","status","position"];
const VALUE_FIELD_SUGGESTIONS = ["_id","name","id"];
const CONFIRM_SUGGESTIONS    = ["ต้องการดำเนินการต่อใช่ไหม?","ยืนยันการบันทึกข้อมูล?","ต้องการส่งข้อมูลใช่ไหม?","ยืนยันการลบรายการนี้?"];

// ── Field metadata ─────────────────────────────────────────────────────────────
const FIELD_META: Record<string, Record<string, FieldDef>> = {
    Section: {
        bgColor: { label: "สีพื้นหลัง", type: "select", section: "props", options: ["white","gray","blue","green","yellow"], optionLabels: ["ขาว","เทา","ฟ้า","เขียว","เหลือง"] },
        padding: { label: "ระยะห่างด้านใน", type: "select", section: "props", options: ["none","sm","md","lg"], optionLabels: ["ไม่มี","เล็ก","กลาง","ใหญ่"] },
    },
    "2 Columns": {
        columns:    { label: "จำนวนคอลัมน์",         type: "select", section: "props", options: ["2","3","4"], optionLabels: ["2 คอลัมน์","3 คอลัมน์","4 คอลัมน์"] },
        widthRatio: { label: "สัดส่วนความกว้าง",       type: "select", section: "props", options: ["equal","2/3-1/3","1/3-2/3","3/4-1/4","1/4-3/4"], optionLabels: ["เท่ากัน","ซ้ายกว้าง (2/3 | 1/3)","ขวากว้าง (1/3 | 2/3)","ซ้ายกว้างมาก (3/4 | 1/4)","ขวากว้างมาก (1/4 | 3/4)"], showWhen: { field: "columns", value: "2" } },
        gap:        { label: "ช่องว่างระหว่างคอลัมน์", type: "select", section: "props", options: ["2","4","6","8"], optionLabels: ["แคบมาก","แคบ","กลาง","กว้าง"] },
    },
    Heading: {
        text:      { label: "ข้อความหัวข้อ",  type: "text",   section: "props", placeholder: "พิมพ์หัวข้อที่นี่" },
        level:     { label: "ขนาดหัวข้อ",    type: "select", section: "props", options: ["h1","h2","h3","h4"], optionLabels: ["ใหญ่มาก (H1)","ใหญ่ (H2)","กลาง (H3)","เล็ก (H4)"] },
        align:     { label: "การจัดวาง",     type: "select", section: "props", options: ["left","center","right"], optionLabels: ["ชิดซ้าย","กึ่งกลาง","ชิดขวา"] },
        color:     { label: "สีตัวอักษร",    type: "select", section: "props", options: ["default","primary","muted","blue","green"], optionLabels: ["ปกติ","สีหลัก","เทา","ฟ้า","เขียว"] },
        textStyle: { label: "รูปแบบตัวอักษร", type: "text-format", section: "props" },
        dataVar:   { label: "เชื่อมกับข้อมูล", type: "text", section: "data", hint: "ชื่อตัวแปรที่จะนำมาแสดงแทนข้อความ", placeholder: "เช่น order.customer.name", suggestions: DATA_VAR_SUGGESTIONS },
    },
    Paragraph: {
        text:    { label: "ข้อความ",       type: "textarea", section: "props", placeholder: "พิมพ์ข้อความที่นี่" },
        align:   { label: "การจัดวาง",     type: "select",   section: "props", options: ["left","center","right"], optionLabels: ["ชิดซ้าย","กึ่งกลาง","ชิดขวา"] },
        size:    { label: "ขนาดตัวอักษร",  type: "select",   section: "props", options: ["sm","base","lg"], optionLabels: ["เล็ก","ปกติ","ใหญ่"] },
        dataVar: { label: "เชื่อมกับข้อมูล", type: "text", section: "data", hint: "ชื่อตัวแปรที่จะนำมาแสดงแทนข้อความ", placeholder: "เช่น order.description", suggestions: DATA_VAR_SUGGESTIONS },
    },
    Divider: {
        spacing: { label: "ระยะห่าง", type: "select", section: "props", options: ["sm","md","lg"], optionLabels: ["น้อย","กลาง","มาก"] },
        style:   { label: "รูปแบบเส้น", type: "select", section: "props", options: ["solid","dashed"], optionLabels: ["เส้นทึบ","เส้นประ"] },
    },
    Spacer: {
        height: { label: "ความสูง (px)", type: "number", section: "props" },
    },
    Badge: {
        text:    { label: "ข้อความ",  type: "text",   section: "props", placeholder: "เช่น กำลังดำเนินการ" },
        variant: { label: "สีป้าย",   type: "select", section: "props", options: ["default","success","warning","danger","info"], optionLabels: ["เทา","เขียว (สำเร็จ)","เหลือง (เตือน)","แดง (ผิดพลาด)","ฟ้า (ข้อมูล)"] },
        dataVar: { label: "เชื่อมกับข้อมูล", type: "text", section: "data", hint: "ชื่อตัวแปรที่จะแสดงแทนข้อความในป้าย", placeholder: "เช่น order.status", suggestions: DATA_VAR_SUGGESTIONS },
    },
    "Input Field": {
        label:        { label: "ชื่อช่องกรอก",               type: "text",   section: "props", placeholder: "เช่น ชื่อลูกค้า" },
        placeholder:  { label: "ข้อความใบ้ในช่อง",           type: "text",   section: "props", placeholder: "เช่น กรอกชื่อลูกค้า..." },
        fieldType:    { label: "ประเภทข้อมูล",                type: "select", section: "props", options: ["text","number","date","email","tel"], optionLabels: ["ข้อความ","ตัวเลข","วันที่","อีเมล","เบอร์โทร"] },
        required:     { label: "บังคับกรอก",                  type: "toggle", section: "props" },
        fieldKey:     { label: "ชื่อตัวแปร",                  type: "text",   section: "data", hint: "ชื่อสำหรับข้อมูลในช่องนี้ — ใช้เมื่อกดปุ่มส่งข้อมูล เช่น ถ้าตั้งเป็น 'customer' ข้อมูลจะถูกส่งในชื่อ customer", placeholder: "เช่น customer", suggestions: FIELD_KEY_SUGGESTIONS },
        defaultValue: { label: "ค่าเริ่มต้น",                type: "text",   section: "data", placeholder: "ค่าที่แสดงอยู่แล้วเมื่อเปิดหน้า" },
    },
    "Select Field": {
        label:       { label: "ชื่อช่องเลือก",            type: "text",   section: "props", placeholder: "เช่น เลือกวัสดุ" },
        placeholder: { label: "ข้อความตอนยังไม่เลือก",    type: "text",   section: "props", placeholder: "เช่น -- เลือก --" },
        fieldKey:    { label: "ชื่อตัวแปร",               type: "text",   section: "data", hint: "ชื่อสำหรับสิ่งที่เลือก — ใช้เมื่อกดปุ่มส่งข้อมูล เช่น ตั้งเป็น 'material' ค่าที่เลือกจะถูกส่งในชื่อ material", placeholder: "เช่น material", suggestions: FIELD_KEY_SUGGESTIONS },
        dataSource:  { label: "ดึงตัวเลือกมาจาก",        type: "select", section: "data", options: ["static","/materials","/workers","/customers","/orders","/panes","/inventories","/requests","/claims","/withdrawals"], optionLabels: ["กำหนดเอง","รายการวัสดุ","รายการพนักงาน","รายการลูกค้า","รายการออเดอร์","รายการกระจก (Pane)","คลังสินค้า","รายการคำขอ (บิล)","รายการเคลม","รายการเบิกวัสดุ"] },
        options:     { label: "รายการตัวเลือก",           type: "text",   section: "data", hint: "พิมพ์ตัวเลือกแต่ละอัน คั่นด้วยเครื่องหมายจุลภาค (,)", placeholder: "ตัวเลือก A, ตัวเลือก B, ตัวเลือก C", showWhen: { field: "dataSource", value: "static" } },
        labelField:      { label: "แสดงชื่อจากฟิลด์",    type: "text",   section: "data", hint: "ระบุว่าจะนำฟิลด์ไหนมาเป็นชื่อที่แสดงในรายการ เช่น 'name' คือแสดงชื่อ, 'details.type' คือแสดงประเภท", placeholder: "name", suggestions: LABEL_FIELD_SUGGESTIONS, showWhen: { field: "dataSource", value: ["/materials","/workers","/customers","/orders","/inventories","/requests","/claims","/withdrawals"] } },
        valueField:      { label: "ค่าที่จะส่งเมื่อเลือก", type: "text",  section: "data", hint: "ฟิลด์ที่จะส่งออกไปเมื่อเลือก — ปกติใช้ '_id' (รหัสของรายการ) เพื่อให้ระบบรู้ว่าเลือกอะไร", placeholder: "_id", suggestions: VALUE_FIELD_SUGGESTIONS, showWhen: { field: "dataSource", value: ["/materials","/workers","/customers","/orders","/inventories","/requests","/claims","/withdrawals"] } },
        showAllRequests: { label: "แสดงบิลที่ออกออเดอร์แล้วด้วย", type: "toggle", section: "data", hint: "ปกติจะซ่อนบิลที่ออกออเดอร์ไปแล้ว — เปิดตรงนี้ถ้าต้องการเห็นบิลทุกใบ", showWhen: { field: "dataSource", value: "/requests" } },
        linkedSource: { label: "กรองตามรายการอื่น", type: "select", section: "data", options: ["","/requests","/orders"], optionLabels: ["ไม่กรอง","รายการคำขอ (บิล)","รายการออเดอร์"], hint: "ใช้เพื่อให้ตัวเลือกตรงกับรายการที่แสดงอยู่ เช่น เลือก 'รายการคำขอ (บิล)' + ฟิลด์เชื่อมโยง 'customer' → จะแสดงเฉพาะลูกค้าที่มีบิลค้างอยู่" },
        linkedField:  { label: "ฟิลด์ที่เชื่อมกัน", type: "text", section: "data", hint: "ชื่อฟิลด์ในรายการด้านบนที่บอกว่าเชื่อมกับอะไร เช่น บิลมีฟิลด์ 'customer' → ใส่ customer เพื่อกรองเฉพาะลูกค้าที่มีบิลนั้น", placeholder: "เช่น customer", suggestions: ["customer","material","worker","assignedTo"], showWhen: { field: "linkedSource", value: ["/requests","/orders"] } },
    },
    "Text Area": {
        label:       { label: "ชื่อช่องข้อความ",         type: "text",   section: "props", placeholder: "เช่น หมายเหตุ" },
        placeholder: { label: "ข้อความใบ้ในช่อง",        type: "text",   section: "props", placeholder: "เช่น กรอกรายละเอียด..." },
        rows:        { label: "ความสูงช่อง (จำนวนบรรทัด)", type: "number", section: "props" },
        fieldKey:    { label: "ชื่อตัวแปร (ใช้ในฟอร์ม)", type: "text",   section: "data", hint: "ชื่อที่จะใช้ระบุข้อความนี้เมื่อส่งฟอร์ม", placeholder: "เช่น notes", suggestions: FIELD_KEY_SUGGESTIONS },
    },
    Button: {
        label:     { label: "ข้อความบนปุ่ม",    type: "text",   section: "props", placeholder: "เช่น บันทึก, ยืนยัน" },
        variant:   { label: "รูปแบบปุ่ม",       type: "select", section: "props", options: ["primary","outline","danger","success"], optionLabels: ["สีหลัก (เน้น)","กรอบเส้น","แดง (ลบ/ยกเลิก)","เขียว (ยืนยัน)"] },
        size:      { label: "ขนาดปุ่ม",         type: "select", section: "props", options: ["sm","md","lg"], optionLabels: ["เล็ก","กลาง","ใหญ่"] },
        fullWidth: { label: "ยืดเต็มความกว้าง", type: "toggle", section: "props" },
        align:     { label: "ตำแหน่งปุ่ม",      type: "select", section: "props", options: ["left","center","right"], optionLabels: ["ชิดซ้าย","ตรงกลาง","ชิดขวา"] },
        action:         { label: "เมื่อกดปุ่มจะ...", type: "select", section: "action", options: ["none","submit-form","navigate","api-call","show-confirm"], optionLabels: ["ไม่มีการกระทำ","ส่งข้อมูลฟอร์ม","ไปยังหน้าอื่น","เรียกใช้ API","แสดงการยืนยันก่อน"] },
        actionEndpoint: { label: "ส่งข้อมูลไปที่", type: "text",   section: "action", hint: "URL ที่ต้องการส่งข้อมูลไป เช่น '/orders' คือสร้างออเดอร์ใหม่ — ถามทีมเทคนิคถ้าไม่แน่ใจ", placeholder: "เช่น /orders", suggestions: ENDPOINT_SUGGESTIONS, showWhen: { field: "action", value: ["submit-form","api-call"] } },
        actionMethod:   { label: "ประเภทการกระทำ",           type: "select", section: "action", options: ["POST","PATCH","PUT","DELETE","GET"], optionLabels: ["สร้างข้อมูลใหม่ (POST)","แก้ไขบางส่วน (PATCH)","แทนที่ทั้งหมด (PUT)","ลบข้อมูล (DELETE)","ดึงข้อมูล (GET)"], showWhen: { field: "action", value: ["submit-form","api-call"] } },
        navigateTo:     { label: "หน้าที่ต้องการไป",       type: "text",   section: "action", hint: "URL ของหน้าที่จะเปิด เช่น '/production' คือหน้าคำสั่งผลิต", placeholder: "เช่น /production", suggestions: NAVIGATE_SUGGESTIONS, showWhen: { field: "action", value: "navigate" } },
        confirmText:    { label: "ข้อความถามยืนยัน",            type: "text",   section: "action", hint: "กล่องข้อความที่จะถามก่อนดำเนินการ", placeholder: "เช่น ต้องการดำเนินการต่อใช่ไหม?", suggestions: CONFIRM_SUGGESTIONS, showWhen: { field: "action", value: "show-confirm" } },
    },
    "Info Card": {
        title:       { label: "ชื่อการ์ด",      type: "text",     section: "props", placeholder: "เช่น ข้อมูลออเดอร์" },
        subtitle:    { label: "หัวข้อรอง",      type: "text",     section: "props", placeholder: "หัวข้อย่อย (ไม่บังคับ)" },
        content:     { label: "เนื้อหา",        type: "textarea", section: "props", placeholder: "รายละเอียด..." },
        accentColor: { label: "สีแถบข้าง",     type: "select",   section: "props", options: ["blue","green","orange","purple","red","slate"], optionLabels: ["ฟ้า","เขียว","ส้ม","ม่วง","แดง","เทา"] },
        dataVar:     { label: "เชื่อมกับข้อมูล", type: "text",   section: "data", hint: "ชื่อ object ที่จะนำข้อมูลมาแสดงในการ์ด", placeholder: "เช่น selectedOrder", suggestions: DATA_VAR_SUGGESTIONS },
    },
    "Record Detail": {
        title:      { label: "ชื่อหัวข้อ",   type: "text",          section: "props", placeholder: "เช่น รายละเอียดคำขอ" },
        endpoint:   { label: "แหล่งข้อมูล", type: "select",         section: "data",  options: ["context","static","/orders","/requests","/panes","/materials","/workers","/customers","/inventories","/claims","/withdrawals"], optionLabels: ["จากรายการที่เลือก (RecordList)","ตัวอย่าง (ไม่ต้องการ API)","รายการออเดอร์/คำสั่งผลิต","รายการคำขอ (บิล)","รายการกระจก (Pane)","รายการวัสดุ","รายการพนักงาน","รายการลูกค้า","คลังสินค้า","รายการเคลม","รายการเบิกวัสดุ"] },
        idParam:    { label: "URL Param ของ ID", type: "text",        section: "data",  placeholder: "เช่น requestId, orderId", hint: "ชื่อ URL param ที่ใช้ระบุ ID ของรายการ — ไม่จำเป็นถ้าเลือก 'รายการออเดอร์' หรือ 'รายการคำขอ' (ใช้ข้อมูลจาก context อัตโนมัติ)", suggestions: ["requestId","orderId","id"] },
        fieldsJson: { label: "ฟิลด์ที่แสดง", type: "column-editor", section: "data"  },
    },
    "Station Sequence": {
        title:    { label: "ชื่อหัวข้อ",              type: "text", section: "props", placeholder: "เช่น กำหนดเส้นทางการผลิต" },
        fieldKey: { label: "ชื่อตัวแปร", type: "text", section: "data",  hint: "ชื่อที่ใช้เก็บรายการสถานีที่เลือก — ค่าเริ่มต้นคือ 'stations' ไม่ต้องเปลี่ยนถ้าไม่มีเหตุผลพิเศษ", placeholder: "stations", suggestions: ["stations"] },
    },
    "Station History": {
        title:   { label: "ชื่อหัวข้อ",        type: "text",   section: "props", placeholder: "เช่น ประวัติการผลิต" },
        maxRows: { label: "จำนวนรายการสูงสุด", type: "number", section: "props", placeholder: "20" },
    },
    "QR Scan": {
        label:          { label: "ข้อความกำกับ",           type: "text",   section: "props", placeholder: "เช่น สแกน QR ออเดอร์" },
        placeholder:    { label: "ข้อความในช่องกรอก",      type: "text",   section: "props", placeholder: "วาง QR หรือพิมพ์รหัส แล้วกด Enter..." },
        dataSource:     { label: "แหล่งข้อมูล",             type: "select", section: "data",  options: ["/orders", "/requests", "/panes"], optionLabels: ["รายการออเดอร์", "รายการคำขอ (บิล)", "รายการกระจก (Pane)"], hint: "บล็อกจะค้นหาข้อมูลจากแหล่งนี้เมื่อสแกน QR สำเร็จ — ใช้ '/orders' สำหรับออเดอร์, '/requests' สำหรับบิล, หรือ '/panes' สำหรับกระจก" },
        enableCamera:   { label: "เปิดกล้อง",               type: "toggle", section: "props", hint: "เมื่อเปิด จะมีปุ่มกล้องให้กดสแกน QR ด้วยกล้องโทรศัพท์หรือเว็บแคม" },
        autoAction:     { label: "การกระทำอัตโนมัติ",       type: "select", section: "data",  options: ["none", "patch"], optionLabels: ["ไม่มี", "ส่ง PATCH อัตโนมัติ"], hint: "เมื่อสแกนสำเร็จ — 'ส่ง PATCH' จะส่งข้อมูลใน 'ข้อมูล JSON' ไปยัง PATCH /orders/{id} โดยอัตโนมัติ" },
        autoActionBody: { label: "ข้อมูล JSON (PATCH body)", type: "text",   section: "data",  placeholder: '{"status":"in_progress"}', hint: "ข้อมูลที่จะส่งไปใน PATCH — ใช้เมื่อเลือก 'ส่ง PATCH อัตโนมัติ' เช่น {\"status\":\"in_progress\"}" },
        successMessage: { label: "ข้อความเมื่อสำเร็จ",      type: "text",   section: "props", placeholder: "โหลดข้อมูลสำเร็จ!" },
    },
    "Inventory Stock": {
        title:       { label: "ชื่อหัวข้อ",       type: "text",   section: "props", placeholder: "เช่น สต็อกวัสดุในคลัง" },
        maxItems:    { label: "จำนวนสูงสุด",      type: "number", section: "props", placeholder: "8" },
        stockFilter: { label: "กรองสต็อก",        type: "select", section: "props", options: ["all","low","out"], optionLabels: ["ทั้งหมด","สต็อกต่ำกว่าจุดสั่ง","หมดสต็อก"] },
        showSearch:  { label: "แสดงช่องค้นหา",   type: "toggle", section: "props" },
    },
    "Order Release Panel": {
        title:          { label: "ชื่อหัวข้อ",        type: "text",   section: "props", placeholder: "เช่น ประเมินออเดอร์" },
        maxItems:       { label: "จำนวนออเดอร์สูงสุด", type: "number", section: "props", placeholder: "10" },
        showStockCheck: { label: "ตรวจสอบสต็อกวัสดุ", type: "toggle", section: "props" },
    },
    "Record List": {
        label:       { label: "ชื่อหัวข้อรายการ", type: "text",          section: "props", placeholder: "เช่น รายการบิล" },
        showHeader:  { label: "แสดงหัวรายการ",    type: "toggle",        section: "props" },
        showSearch:  { label: "แสดงช่องค้นหา",   type: "toggle",        section: "props" },
        maxRows:     { label: "จำนวนแถวสูงสุด",  type: "number",        section: "props", placeholder: "5" },
        dataSource:  { label: "แหล่งข้อมูล",     type: "select",        section: "data",  options: ["static","/orders","/requests","/panes","/materials","/workers","/customers","/inventories","/claims","/withdrawals","/material-logs","/notifications"], optionLabels: ["ตัวอย่าง (ไม่ต้องการ API)","รายการออเดอร์/คำสั่งผลิต","รายการคำขอ (บิล)","รายการกระจก (Pane)","รายการวัสดุ","รายการพนักงาน","รายการลูกค้า","คลังสินค้า","รายการเคลม","รายการเบิกวัสดุ","ประวัติการใช้วัสดุ","การแจ้งเตือน"] },
        columnsJson: { label: "คอลัมน์",         type: "column-editor", section: "data" },
        filterByCurrentStation: { label: "เฉพาะงานของสถานีนี้", type: "toggle", section: "data", hint: "แสดงเฉพาะออเดอร์ที่กำลังรอดำเนินการในสถานีนี้อยู่ — ใช้ได้กับรายการออเดอร์เท่านั้น ไม่มีผลกับรายการบิล" },
        selectable:           { label: "คลิกแถวเพื่อดูรายละเอียด",  type: "toggle", section: "action", hint: "เมื่อเปิด: กดที่แถวในรายการจะแสดงรายละเอียดในกล่อง 'รายละเอียด' (RecordDetail) ที่วางไว้ในหน้าเดียวกัน" },
        navigateTo:           { label: "คลิกแถวเพื่อเปิดหน้า", type: "select", section: "action", options: ["","production","request","inventory","withdrawals","claims"], optionLabels: ["ไม่มี (คลิกไม่ได้)","คำสั่งผลิต","คำขอ / บิล","คลังสินค้า","เบิกวัสดุ","เคลม"], hint: "เมื่อกดแถว ระบบจะเปิดหน้าที่เลือกไว้ (ต้องปิด 'คลิกแถวเพื่อดูรายละเอียด' ก่อน)", showWhen: { field: "selectable", value: false } },
        showAllRequests:      { label: "แสดงบิลที่ออกออเดอร์แล้วด้วย", type: "toggle", section: "data", hint: "ปกติจะซ่อนบิลที่ออกออเดอร์ไปแล้ว — เปิดตรงนี้ถ้าต้องการดูบิลทุกใบรวมที่ทำไปแล้ว" },
        showQrColumn:         { label: "แสดงปุ่ม QR Code",   type: "toggle", section: "action", hint: "ใส่ปุ่ม QR ในแต่ละแถว — กดเพื่อดู QR code ของออเดอร์นั้น (ใช้สำหรับสแกนที่โรงงาน)" },
        showWorkOrderColumn:  { label: "แสดงปุ่มใบงาน",      type: "toggle", section: "action", hint: "ใส่ปุ่มในแต่ละแถว — กดเพื่อเปิดใบงาน (หน้าสำหรับพิมพ์ QR และรายการชิ้นงาน)" },
    },
    Status: {
        label:        { label: "ชื่อหัวข้อ",       type: "text",   section: "props", placeholder: "เช่น สถานะงาน" },
        displayStyle: { label: "รูปแบบการแสดง",   type: "select", section: "props", options: ["pill","badge","dot","tag"], optionLabels: ["แถบกลม (Pill)","ป้าย (Badge)","จุด + ข้อความ","แท็กขอบซ้าย"] },
        displayMode:  { label: "โหมดแสดง",         type: "select", section: "data",  options: ["single","list"], optionLabels: ["ค่าเดียว","รายการ (หลายรายการ)"], hint: "เลือก 'รายการ' เมื่อต้องการแสดงหลายออเดอร์พร้อมกัน" },
        dataVar:      { label: "เชื่อมกับข้อมูลสถานะ", type: "text", section: "data", hint: "ชื่อตัวแปรที่มีค่าสถานะ เช่น order.status หรือ orders (array)", placeholder: "เช่น order.status", suggestions: DATA_VAR_SUGGESTIONS },
    },
};

const SECTION_CONFIG: Record<Section, { icon: React.ElementType; label: string; color: string; bg: string }> = {
    props:  { icon: Settings2, label: "รูปแบบ",   color: "text-foreground", bg: "" },
    data:   { icon: Database,  label: "ข้อมูล",   color: "text-blue-600",   bg: "bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-lg" },
    action: { icon: Zap,       label: "การกระทำ", color: "text-orange-600", bg: "bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30 rounded-lg" },
};

function isVisible(def: FieldDef, props: Record<string, unknown>): boolean {
    if (!def.showWhen) return true;
    const { field, value } = def.showWhen;
    if (typeof value === "boolean") return !!props[field] === value;
    const cur = String(props[field] ?? "");
    return Array.isArray(value) ? value.includes(cur) : cur === value;
}

// ── Combo box field ────────────────────────────────────────────────────────────
function ComboField({ value, onChange, placeholder, suggestions, base }: {
    value: unknown; onChange: (v: string) => void; placeholder?: string; suggestions: string[]; base: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(String(value ?? ""));
    const ref = useRef<HTMLDivElement>(null);

    // sync external value → query
    useEffect(() => { setQuery(String(value ?? "")); }, [value]);

    const filtered = query
        ? suggestions.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
        : suggestions;

    const handleSelect = (s: string) => { onChange(s); setQuery(s); setOpen(false); };

    return (
        <div ref={ref} className="relative">
            <div className="flex">
                <input
                    type="text"
                    value={query}
                    placeholder={placeholder}
                    className={`${base} rounded-r-none border-r-0`}
                    onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                />
                <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
                    className="border border-l-0 rounded-r-lg px-2 bg-muted/30 hover:bg-muted/60 transition"
                    tabIndex={-1}
                >
                    <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-lg border bg-popover shadow-lg max-h-44 overflow-y-auto">
                    {filtered.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onMouseDown={() => handleSelect(s)}
                            className={`w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 font-mono truncate ${s === String(value ?? "") ? "bg-primary/10 text-primary font-medium" : ""}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Column editor ─────────────────────────────────────────────────────────────
interface ColDef { key: string; label: string; type: string; width: string; }

const COL_TYPES   = ["text","status","number","currency","date","badge"];
const COL_WIDTHS  = ["auto","sm","md","lg"];
const COL_TYPE_LABELS  = ["ข้อความ","สถานะ (สี)","ตัวเลข","ราคา (฿)","วันที่","ป้าย"];
const COL_WIDTH_LABELS = ["อัตโนมัติ","แคบ","กลาง","กว้าง"];

// Available fields per endpoint — key, Thai label, and auto type
const SOURCE_FIELDS: Record<string, { key: string; label: string; type: string }[]> = {
    "static": [
        { key: "id",     label: "รหัส",   type: "text"     },
        { key: "name",   label: "รายการ", type: "text"     },
        { key: "status", label: "สถานะ",  type: "status"   },
        { key: "amount", label: "จำนวน",  type: "number"   },
        { key: "date",   label: "วันที่", type: "date"     },
        { key: "price",  label: "ราคา",   type: "currency" },
    ],
    "/requests": [
        { key: "details.type",           label: "ประเภทงาน",        type: "text"     },
        { key: "details.estimatedPrice", label: "ราคาประมาณ",       type: "currency" },
        { key: "details.quantity",       label: "จำนวน",            type: "number"   },
        { key: "customer",               label: "ลูกค้า",           type: "text"     },
        { key: "deadline",               label: "กำหนดส่ง",         type: "date"     },
        { key: "deliveryLocation",       label: "สถานที่ส่ง",       type: "text"     },
        { key: "assignedTo",             label: "ผู้รับผิดชอบ",     type: "text"     },
        { key: "expectedDeliveryDate",   label: "วันส่งจริง",       type: "date"     },
        { key: "createdAt",              label: "วันที่สร้าง",      type: "date"     },
    ],
    "/orders": [
        { key: "status",      label: "สถานะ",             type: "status"   },
        { key: "quantity",    label: "จำนวน",             type: "number"   },
        { key: "material",    label: "วัสดุ",             type: "text"     },
        { key: "customer",    label: "ลูกค้า",            type: "text"     },
        { key: "priority",    label: "ลำดับความสำคัญ",  type: "number"   },
        { key: "assignedTo",  label: "ผู้รับผิดชอบ",    type: "text"     },
        { key: "createdAt",   label: "วันที่สร้าง",     type: "date"     },
    ],
    "/materials": [
        { key: "name",              label: "ชื่อวัสดุ",           type: "text"   },
        { key: "unit",              label: "หน่วย",               type: "badge"  },
        { key: "reorderPoint",      label: "จุดสั่งซื้อ",         type: "number" },
        { key: "specDetails.thickness", label: "ความหนา",         type: "text"   },
        { key: "specDetails.color",     label: "สี",              type: "badge"  },
        { key: "specDetails.glassType", label: "ประเภทกระจก",    type: "badge"  },
        { key: "createdAt",         label: "วันที่เพิ่ม",         type: "date"   },
    ],
    "/workers": [
        { key: "name",      label: "ชื่อ",          type: "text"  },
        { key: "username",  label: "ชื่อผู้ใช้",   type: "badge" },
        { key: "position",  label: "ตำแหน่ง",      type: "text"  },
        { key: "role",      label: "สิทธิ์",        type: "badge" },
        { key: "createdAt", label: "วันที่เพิ่ม",  type: "date"  },
    ],
    "/customers": [
        { key: "name",      label: "ชื่อลูกค้า",   type: "text"     },
        { key: "phone",     label: "โทรศัพท์",     type: "text"     },
        { key: "address",   label: "ที่อยู่",       type: "text"     },
        { key: "discount",  label: "ส่วนลด",       type: "number"   },
        { key: "notes",     label: "หมายเหตุ",     type: "text"     },
        { key: "createdAt", label: "วันที่เพิ่ม",  type: "date"     },
    ],
    "/inventories": [
        { key: "material",  label: "วัสดุ",        type: "text"   },
        { key: "stockType", label: "ประเภทสต็อก",  type: "badge"  },
        { key: "quantity",  label: "จำนวน",        type: "number" },
        { key: "location",  label: "ตำแหน่ง",     type: "text"   },
        { key: "createdAt", label: "อัพเดทล่าสุด", type: "date"  },
    ],
    "/withdrawals": [
        { key: "material",      label: "วัสดุ",          type: "text"   },
        { key: "quantity",      label: "จำนวนที่เบิก",  type: "number" },
        { key: "stockType",     label: "ประเภทสต็อก",   type: "badge"  },
        { key: "withdrawnBy",   label: "เบิกโดย",       type: "text"   },
        { key: "withdrawnDate", label: "วันที่เบิก",    type: "date"   },
    ],
    "/claims": [
        { key: "source",      label: "แหล่งที่มา",     type: "badge" },
        { key: "material",    label: "วัสดุ",           type: "text"  },
        { key: "description", label: "รายละเอียด",     type: "text"  },
        { key: "decision",    label: "การตัดสินใจ",   type: "badge" },
        { key: "reportedBy",  label: "รายงานโดย",     type: "text"  },
        { key: "claimDate",   label: "วันที่เคลม",    type: "date"  },
    ],
    "/material-logs": [
        { key: "material",        label: "วัสดุ",       type: "text"   },
        { key: "actionType",      label: "ประเภทการกระทำ", type: "badge" },
        { key: "quantityChanged", label: "จำนวนที่เปลี่ยน", type: "number" },
        { key: "totalPrice",      label: "ราคารวม",    type: "currency" },
        { key: "worker",          label: "พนักงาน",    type: "text"   },
        { key: "createdAt",       label: "วันที่",     type: "date"   },
    ],
    "/notifications": [
        { key: "title",     label: "หัวข้อ",     type: "text"  },
        { key: "message",   label: "ข้อความ",    type: "text"  },
        { key: "priority",  label: "ระดับ",      type: "badge" },
        { key: "type",      label: "ประเภท",     type: "badge" },
        { key: "createdAt", label: "วันที่",     type: "date"  },
    ],
};

// Preset column layouts per endpoint (matching real API field names)
const COLUMN_PRESETS: Record<string, ColDef[]> = {
    "static":         [{ key:"id",label:"รหัส",type:"text",width:"sm"},{ key:"name",label:"รายการ",type:"text",width:"lg"},{ key:"status",label:"สถานะ",type:"status",width:"md"},{ key:"amount",label:"จำนวน",type:"number",width:"sm"},{ key:"price",label:"ราคา",type:"currency",width:"sm"}],
    "/requests":      [{ key:"details.type",label:"ประเภทงาน",type:"text",width:"lg"},{ key:"details.estimatedPrice",label:"ราคาประมาณ",type:"currency",width:"md"},{ key:"customer",label:"ลูกค้า",type:"text",width:"md"},{ key:"deadline",label:"กำหนดส่ง",type:"date",width:"md"}],
    "/orders":        [{ key:"status",label:"สถานะ",type:"status",width:"md"},{ key:"quantity",label:"จำนวน",type:"number",width:"sm"},{ key:"material",label:"วัสดุ",type:"text",width:"lg"},{ key:"customer",label:"ลูกค้า",type:"text",width:"md"}],
    "/materials":     [{ key:"name",label:"ชื่อวัสดุ",type:"text",width:"lg"},{ key:"unit",label:"หน่วย",type:"badge",width:"sm"},{ key:"reorderPoint",label:"จุดสั่งซื้อ",type:"number",width:"sm"}],
    "/workers":       [{ key:"name",label:"ชื่อ",type:"text",width:"lg"},{ key:"position",label:"ตำแหน่ง",type:"text",width:"md"},{ key:"role",label:"สิทธิ์",type:"badge",width:"sm"}],
    "/customers":     [{ key:"name",label:"ชื่อลูกค้า",type:"text",width:"lg"},{ key:"phone",label:"โทร",type:"text",width:"md"},{ key:"address",label:"ที่อยู่",type:"text",width:"lg"}],
    "/inventories":   [{ key:"material",label:"วัสดุ",type:"text",width:"lg"},{ key:"stockType",label:"ประเภท",type:"badge",width:"sm"},{ key:"quantity",label:"จำนวน",type:"number",width:"sm"},{ key:"location",label:"ตำแหน่ง",type:"text",width:"md"}],
    "/withdrawals":   [{ key:"material",label:"วัสดุ",type:"text",width:"lg"},{ key:"quantity",label:"จำนวน",type:"number",width:"sm"},{ key:"stockType",label:"ประเภท",type:"badge",width:"sm"},{ key:"withdrawnDate",label:"วันที่",type:"date",width:"md"}],
    "/claims":        [{ key:"source",label:"จาก",type:"badge",width:"sm"},{ key:"material",label:"วัสดุ",type:"text",width:"lg"},{ key:"description",label:"รายละเอียด",type:"text",width:"lg"},{ key:"claimDate",label:"วันที่",type:"date",width:"md"}],
    "/material-logs": [{ key:"material",label:"วัสดุ",type:"text",width:"lg"},{ key:"actionType",label:"ประเภท",type:"badge",width:"md"},{ key:"quantityChanged",label:"จำนวน",type:"number",width:"sm"},{ key:"createdAt",label:"วันที่",type:"date",width:"md"}],
    "/notifications": [{ key:"title",label:"หัวข้อ",type:"text",width:"lg"},{ key:"message",label:"ข้อความ",type:"text",width:"lg"},{ key:"priority",label:"ระดับ",type:"badge",width:"sm"},{ key:"createdAt",label:"วันที่",type:"date",width:"md"}],
};

function ColumnEditor({ value, onChange, dataSource }: { value: unknown; onChange: (v: string) => void; dataSource?: string }) {
    const cols: ColDef[] = (() => {
        try { return JSON.parse(String(value ?? "[]")); } catch { return []; }
    })();

    const update  = (next: ColDef[]) => onChange(JSON.stringify(next));
    const setCol  = (i: number, patch: Partial<ColDef>) => update(cols.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const delCol  = (i: number) => update(cols.filter((_, idx) => idx !== i));

    const availableFields = dataSource ? (SOURCE_FIELDS[dataSource] ?? []) : [];
    const hasFieldList    = availableFields.length > 0;

    // When user picks a field from the dropdown, auto-fill label + type
    const handleFieldPick = (i: number, key: string) => {
        const found = availableFields.find((f) => f.key === key);
        if (found) setCol(i, { key, label: found.label, type: found.type });
        else       setCol(i, { key });
    };

    const addCol = () => {
        const first = availableFields.find((f) => !cols.some((c) => c.key === f.key));
        if (first) update([...cols, { key: first.key, label: first.label, type: first.type, width: "auto" }]);
        else       update([...cols, { key: "", label: "คอลัมน์ใหม่", type: "text", width: "auto" }]);
    };

    const sel = "rounded border bg-background text-[11px] px-1.5 py-1 outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer";
    const inp = "rounded border bg-background text-xs px-1.5 py-1 outline-none focus:ring-1 focus:ring-primary/40";

    return (
        <div className="space-y-3">
            {/* ── Chip picker (known endpoints) ── */}
            {hasFieldList ? (
                <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide">
                        เลือกคอลัมน์ที่ต้องการแสดง
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {availableFields.map((f) => {
                            const already = cols.some((c) => c.key === f.key);
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => {
                                        if (already) delCol(cols.findIndex((c) => c.key === f.key));
                                        else update([...cols, { key: f.key, label: f.label, type: f.type, width: "auto" }]);
                                    }}
                                    className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all ${
                                        already
                                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                            : "bg-background border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                                    }`}
                                >
                                    {already ? <>✓ {f.label}</> : <>+ {f.label}</>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                cols.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60 italic">ยังไม่มีคอลัมน์ — กด + เพิ่มได้เลย</p>
                )
            )}

            {/* ── Selected columns list ── */}
            {cols.length > 0 && (
                <div className="space-y-1">
                    {hasFieldList && (
                        <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide">
                            คอลัมน์ที่เลือก — แก้ชื่อหัวได้
                        </p>
                    )}
                    {cols.map((col, i) => (
                        <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-1.5 items-center rounded-lg border bg-card px-2.5 py-2">
                            <span className="text-[10px] text-muted-foreground/40 w-4 text-center shrink-0">{i + 1}</span>
                            <input
                                value={col.label}
                                onChange={(e) => setCol(i, { label: e.target.value })}
                                placeholder="ชื่อหัวคอลัมน์"
                                className={`${inp} w-full text-sm font-medium`}
                            />
                            {hasFieldList ? (
                                <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                                    {COL_TYPE_LABELS[COL_TYPES.indexOf(col.type || "text")] ?? col.type ?? "ข้อความ"}
                                </span>
                            ) : (
                                <select
                                    value={col.type || "text"}
                                    onChange={(e) => setCol(i, { type: e.target.value })}
                                    className={`${sel} w-[5.5rem] shrink-0`}
                                >
                                    {COL_TYPES.map((t, ti) => <option key={t} value={t}>{COL_TYPE_LABELS[ti]}</option>)}
                                </select>
                            )}
                            <button type="button" onClick={() => delCol(i)} className="text-muted-foreground/30 hover:text-red-500 transition-colors shrink-0 p-0.5">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add button — only for static/unknown source */}
            {!hasFieldList && (
                <button type="button" onClick={addCol} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                    <Plus className="h-3.5 w-3.5" /> เพิ่มคอลัมน์
                </button>
            )}
        </div>
    );
}

// ── B / I / U buttons (Word-style text format) ────────────────────────────────
function TextFormatButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const hasBold      = value.includes("bold");
    const hasItalic    = value.includes("italic");
    const hasUnderline = value.includes("underline");

    const toggle = (feature: "bold" | "italic" | "underline") => {
        const parts = new Set(value === "normal" ? [] : value.split("-"));
        if (parts.has(feature)) parts.delete(feature);
        else parts.add(feature);
        // keep canonical order: bold → italic → underline
        const result = (["bold", "italic", "underline"] as const).filter((f) => parts.has(f)).join("-");
        onChange(result || "normal");
    };

    const btn = (active: boolean, onClick: () => void, children: ReactNode, extraClass = "") =>
        <button
            type="button"
            onClick={onClick}
            className={`h-7 w-7 rounded border text-sm transition-colors ${extraClass} ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
        >{children}</button>;

    return (
        <div className="flex gap-1">
            {btn(hasBold,      () => toggle("bold"),      <span className="font-bold">B</span>)}
            {btn(hasItalic,    () => toggle("italic"),    <span className="italic">I</span>)}
            {btn(hasUnderline, () => toggle("underline"), <span className="underline">U</span>)}
        </div>
    );
}

// ── Field renderer ────────────────────────────────────────────────────────────
function Field({ label, value, fieldDef, onChange, allProps, suggestionOverride }: {
    label: string; value: unknown; fieldDef: FieldDef; onChange: (v: string | number | boolean) => void;
    allProps?: Record<string, unknown>;
    suggestionOverride?: string[];
}) {
    const base = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition";

    return (
        <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">{label}</label>

            {fieldDef.type === "text-format" ? (
                <TextFormatButtons value={String(value ?? "bold")} onChange={(v) => onChange(v)} />
            ) : fieldDef.type === "column-editor" ? (
                <ColumnEditor value={value} onChange={(v) => onChange(v)} dataSource={String(allProps?.dataSource ?? "")} />
            ) : fieldDef.type === "toggle" ? (
                <button type="button" role="switch" aria-checked={Boolean(value)}
                    onClick={() => onChange(!value)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${Boolean(value) ? "bg-primary" : "bg-muted border"}`}
                >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${Boolean(value) ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
            ) : fieldDef.type === "select" ? (
                <select value={String(value ?? (fieldDef.options?.[0] ?? ""))} onChange={(e) => onChange(e.target.value)} className={base}>
                    {(fieldDef.options ?? []).map((o, i) => (
                        <option key={o} value={o}>{fieldDef.optionLabels?.[i] ?? o}</option>
                    ))}
                </select>
            ) : fieldDef.type === "textarea" ? (
                <textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${base} resize-none`} placeholder={fieldDef.placeholder} />
            ) : fieldDef.type === "number" ? (
                <input type="number" value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} className={base} />
            ) : (suggestionOverride ?? fieldDef.suggestions)?.length ? (
                <ComboField value={value} onChange={(v) => onChange(v)} placeholder={fieldDef.placeholder} suggestions={suggestionOverride ?? fieldDef.suggestions!} base={base} />
            ) : (
                <input type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base} placeholder={fieldDef.placeholder} />
            )}

            {fieldDef.hint && (
                <div className="flex items-start gap-1.5 rounded-md bg-muted/40 px-2.5 py-2 mt-1">
                    <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{fieldDef.hint}</p>
                </div>
            )}
        </div>
    );
}

// ── Section renderer ──────────────────────────────────────────────────────────
function SectionPanel({ section, fields, props, setProp, suggestionOverrides }: {
    section: Section; fields: [string, FieldDef][]; props: Record<string, unknown>; setProp: (key: string, value: string | number | boolean) => void;
    suggestionOverrides?: Record<string, string[]>;
}) {
    const visible = fields.filter(([, def]) => isVisible(def, props));
    if (visible.length === 0) return null;
    const cfg = SECTION_CONFIG[section];
    const Icon = cfg.icon;
    return (
        <div className={`p-3 space-y-3 ${cfg.bg}`}>
            {section !== "props" && (
                <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">{cfg.label}</span>
                </div>
            )}
            {visible.map(([key, def]) => (
                <Field key={key} label={def.label} value={props[key]} fieldDef={def} onChange={(v) => setProp(key, v)} allProps={props} suggestionOverride={suggestionOverrides?.[key]} />
            ))}
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function PropertiesPanel() {
    const { selected, nodes, actions } = useEditor((state) => ({
        selected: [...state.events.selected][0] ?? null,
        nodes:    state.nodes,
    }));

    if (!selected) {
        return (
            <aside className="w-72 shrink-0 border-l bg-card flex flex-col h-full">
                <div className="px-4 py-3 border-b shrink-0"><h2 className="text-sm font-semibold">Properties</h2></div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">คลิก component บน Canvas<br />เพื่อแก้ไข properties</p>
                </div>
            </aside>
        );
    }

    const node      = nodes[selected];
    const props     = (node?.data?.props ?? {}) as Record<string, unknown>;
    const blockName = node?.data?.displayName ?? node?.data?.name ?? "";
    const fieldMeta = FIELD_META[blockName] ?? {};
    const setProp   = (key: string, value: string | number | boolean) => {
        actions.setProp(selected, (p: Record<string, unknown>) => {
            p[key] = value;
            if (key === "dataSource" && typeof value === "string") {
                const preset = COLUMN_PRESETS[value];
                p.columnsJson = JSON.stringify(preset ?? []);
            }
        });
    };

    // ── Scan canvas for form fields → build dynamic dataVar suggestions ────────
    const canvasFormSuggestions: string[] = Object.values(nodes)
        .filter((n) => ["Input Field", "Select Field", "Text Area"].includes(n.data?.displayName ?? n.data?.name ?? ""))
        .map((n) => (n.data?.props as { fieldKey?: string } | undefined)?.fieldKey)
        .filter((k): k is string => !!k)
        .map((k) => `form.${k}`);
    // merge: canvas form.* first, then static order.* suggestions (dedup)
    const dynamicDataVarSuggestions = [
        ...canvasFormSuggestions,
        ...DATA_VAR_SUGGESTIONS.filter((s) => !canvasFormSuggestions.includes(s)),
    ];

    const sections: Record<Section, [string, FieldDef][]> = { props: [], data: [], action: [] };
    const hasMeta = Object.keys(fieldMeta).length > 0;
    if (hasMeta) {
        for (const [key, def] of Object.entries(fieldMeta)) sections[def.section].push([key, def]);
    } else {
        // No FIELD_META — show all raw props as text fields
        for (const key of Object.keys(props)) {
            if (key !== "children") sections.props.push([key, { label: key, type: "text", section: "props" }]);
        }
    }

    const hasData   = sections.data.some(([, def]) => isVisible(def, props));
    const hasAction = sections.action.some(([, def]) => isVisible(def, props));

    return (
        <aside className="w-72 shrink-0 border-l bg-card flex flex-col h-full">
            <div className="px-4 py-3 border-b shrink-0"><h2 className="text-sm font-semibold">Properties</h2></div>
            <div className="flex-1 overflow-y-auto min-h-0">
                <div className="px-4 pt-4 pb-2">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-xs font-bold text-foreground">{blockName || "Component"}</p>
                    </div>
                </div>
                {(hasData || hasAction) && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1">
                        {hasData   && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium"><Database className="h-3 w-3" /> เชื่อมข้อมูล</span>}
                        {hasAction && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] font-medium"><Zap className="h-3 w-3" /> มีการกระทำ</span>}
                    </div>
                )}
                <div className="space-y-2 pb-4">
                    {sections.props.length > 0 && <SectionPanel section="props" fields={sections.props} props={props} setProp={setProp} />}
                    {sections.data.length > 0 && (
                        <>
                            <div className="px-4"><div className="border-t border-blue-200/50 dark:border-blue-800/30" /></div>
                            <div className="px-3">
                                <SectionPanel
                                    section="data"
                                    fields={sections.data}
                                    props={props}
                                    setProp={setProp}
                                    suggestionOverrides={{ dataVar: dynamicDataVarSuggestions }}
                                />
                            </div>
                        </>
                    )}
                    {sections.action.length > 0 && (
                        <>
                            <div className="px-4"><div className="border-t border-orange-200/50 dark:border-orange-800/30" /></div>
                            <div className="px-3"><SectionPanel section="action" fields={sections.action} props={props} setProp={setProp} /></div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
