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

  const response = await fetch(
    FUNCTION_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${session.access_token}`,
      },

      body: JSON.stringify(payload),
    }
  );

  const result =
    await response.json();

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
// รองรับใบสั่งยาจากแพทย์ Optional
// ==============================

export async function linkCustomer(
  payload
) {
  const medications =
    await Promise.all(
      (payload.medications || []).map(
        async (medication) => {
          const {
            prescription_file,
            ...plainMedication
          } = medication;

          if (!prescription_file) {
            return {
              ...plainMedication,

              prescription_file_base64:
                null,

              prescription_file_name:
                null,

              prescription_content_type:
                null,
            };
          }

          const prescription_file_base64 =
            await fileToBase64(
              prescription_file
            );

          return {
            ...plainMedication,

            prescription_file_base64,

            prescription_file_name:
              prescription_file.name ||
              "prescription.jpg",

            prescription_content_type:
              prescription_file.type ||
              "image/jpeg",
          };
        }
      )
    );

  return callAdminApi({
    action: "link_customer",
    ...payload,
    medications,
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
// รองรับใบสั่งยาจากแพทย์ Optional
// ==============================

export async function addMedication(
  payload
) {
  const {
    prescription_file,
    ...plainPayload
  } = payload;

  let prescriptionPayload = {
    prescription_file_base64:
      null,

    prescription_file_name:
      null,

    prescription_content_type:
      null,
  };

  if (prescription_file) {
    prescriptionPayload = {
      prescription_file_base64:
        await fileToBase64(
          prescription_file
        ),

      prescription_file_name:
        prescription_file.name ||
        "prescription.jpg",

      prescription_content_type:
        prescription_file.type ||
        "image/jpeg",
    };
  }

  return callAdminApi({
    action: "add_medication",
    ...plainPayload,
    ...prescriptionPayload,
  });
}

// ==============================
// งานที่ลูกค้ายืนยันแล้ว
// ==============================

export async function getConfirmedOrders() {
  return callAdminApi({
    action:
      "list_confirmed_orders",
  });
}

// ==============================
// อัปโหลดใบยืนยันสั่งซื้อ
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
// เปลี่ยน ordered → ready
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
// ลูกค้ารับยาแล้ว
// ready -> picked_up
// ต้องมีราคาขายจริง + ใบเสร็จ
// ==============================

export async function markPickedUp({
  order_id,
  actual_price,
  receipt_file,
}) {
  if (!order_id) {
    throw new Error(
      "ไม่พบ order_id"
    );
  }

  if (
    actual_price === "" ||
    actual_price === null ||
    actual_price === undefined
  ) {
    throw new Error(
      "กรุณากรอกราคาขายจริง"
    );
  }

  const price =
    Number(actual_price);

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    throw new Error(
      "กรุณากรอกราคาขายจริงให้ถูกต้อง"
    );
  }

  if (!receipt_file) {
    throw new Error(
      "กรุณาแนบรูปใบเสร็จ"
    );
  }

  const receipt_file_base64 =
    await fileToBase64(
      receipt_file
    );

  return callAdminApi({
    action: "mark_picked_up",

    order_id,

    actual_price:
      price,

    receipt_file_base64,

    receipt_file_name:
      receipt_file.name ||
      "receipt.jpg",

    receipt_content_type:
      receipt_file.type ||
      "image/jpeg",
  });
}

// ==============================
// SAVE PHARMACIST PUSH SUBSCRIPTION
// ==============================

export async function savePushSubscription(
  subscription
) {
  if (!subscription) {
    throw new Error(
      "ไม่พบ Push Subscription"
    );
  }

  const json =
    subscription.toJSON();

  if (
    !json.endpoint ||
    !json.keys?.p256dh ||
    !json.keys?.auth
  ) {
    throw new Error(
      "Push Subscription ไม่ครบถ้วน"
    );
  }

  return callAdminApi({
    action:
      "save_push_subscription",

    subscription: {
      endpoint:
        json.endpoint,

      keys: {
        p256dh:
          json.keys.p256dh,

        auth:
          json.keys.auth,
      },
    },

    user_agent:
      navigator.userAgent,
  });
}

// ==============================
// FILE → BASE64
// ใช้ร่วมกันทั้ง
// - ใบสั่งแพทย์
// - ใบยืนยันการสั่งซื้อ
// - ใบเสร็จ
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