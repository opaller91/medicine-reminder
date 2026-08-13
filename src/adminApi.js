import { supabase } from "./supabase";

const FUNCTION_URL =
  "https://uhvcakajcdxkykopekgg.supabase.co/functions/v1/pharmacist-admin";

async function callAdminApi(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("กรุณาเข้าสู่ระบบ");
  }

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  console.log(
    "PHARMACIST ADMIN API RESPONSE:",
    result
  );

  if (!response.ok) {
    throw new Error(
      result.error ||
        "ไม่สามารถดำเนินการได้"
    );
  }

  return result;
}

// ==============================
// ลูกค้ารอเชื่อม
// ==============================

export async function getPendingLineUsers() {
  return callAdminApi({
    action: "list_pending",
  });
}

// ==============================
// เชื่อมลูกค้าครั้งแรก
// รองรับ medications หลายรายการ
// ==============================

export async function linkCustomer(payload) {
  return callAdminApi({
    action: "link_customer",
    ...payload,
  });
}

// ==============================
// ลูกค้าทั้งหมด
// ==============================

export async function getAllCustomers() {
  return callAdminApi({
    action: "list_customers",
  });
}

// ==============================
// เพิ่มยาให้ลูกค้าที่เชื่อมแล้ว
// ==============================

export async function addMedication(payload) {
  return callAdminApi({
    action: "add_medication",
    ...payload,
  });
}