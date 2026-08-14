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

// ==============================
// งานที่ลูกค้ายืนยันแล้ว
// ==============================

export async function getConfirmedOrders() {
  return callAdminApi({
    action: "list_confirmed_orders",
  });
}

// ==============================
// อัปโหลดใบยืนยันสั่งซื้อผ่าน Edge Function
// ==============================

export async function uploadOrderDocument({
  order_id,
  file,
}) {
  if (!order_id) {
    throw new Error(
      "ไม่พบ order_id"
    );
  }

  if (!file) {
    throw new Error(
      "กรุณาเลือกไฟล์"
    );
  }

  const file_base64 =
    await fileToBase64(file);

  return callAdminApi({
    action:
      "upload_order_document",

    order_id,

    file_base64,

    file_name:
      file.name ||
      "order-document.jpg",

    content_type:
      file.type ||
      "image/jpeg",
  });
}

// ==============================
// เปิดใบยืนยันสั่งซื้อย้อนหลัง
// Private Storage → Signed URL
// ==============================

export async function getOrderDocumentUrl(
  order_id
) {
  if (!order_id) {
    throw new Error(
      "ไม่พบ order_id"
    );
  }

  return callAdminApi({
    action:
      "get_order_document_url",
    order_id,
  });
}

// ==============================
// เปลี่ยนสถานะ ordered -> ready
// และให้ Edge Function ส่ง LINE แจ้งลูกค้า
// ==============================

export async function markReady(
  order_id
) {
  if (!order_id) {
    throw new Error(
      "ไม่พบ order_id"
    );
  }

  return callAdminApi({
    action: "mark_ready",
    order_id,
  });
}

// ==============================
// FILE → BASE64
// ==============================

function fileToBase64(file) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        const result =
          String(
            reader.result || ""
          );

        if (!result) {
          reject(
            new Error(
              "ไม่สามารถอ่านไฟล์ได้"
            )
          );

          return;
        }

        const base64 =
          result.includes(",")
            ? result
                .split(",")
                .pop()
            : result;

        if (!base64) {
          reject(
            new Error(
              "ไม่สามารถแปลงไฟล์ได้"
            )
          );

          return;
        }

        resolve(base64);
      };

      reader.onerror = () => {
        reject(
          new Error(
            "ไม่สามารถอ่านไฟล์ได้"
          )
        );
      };

      reader.readAsDataURL(
        file
      );
    }
  );
}