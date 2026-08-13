import { supabase } from "./supabase";

const FUNCTION_URL =
  "https://uhvcakajcdxkykopekgg.supabase.co/functions/v1/pharmacist-admin";

export async function getPendingLineUsers() {
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
    body: JSON.stringify({
      action: "list_pending",
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
        "ไม่สามารถโหลดข้อมูลลูกค้าได้"
    );
  }

  return result;
}

export async function linkCustomer(payload) {
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
    body: JSON.stringify({
      action: "link_customer",
      ...payload,
    }),
  });

  const result = await response.json();

  console.log(
    "LINK CUSTOMER API RESPONSE:",
    result
  );

  if (!response.ok) {
    throw new Error(
      result.error ||
        "ไม่สามารถบันทึกข้อมูลได้"
    );
  }

  return result;
}

export async function getAllCustomers() {
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
    body: JSON.stringify({
      action: "list_customers",
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
        "ไม่สามารถโหลดข้อมูลลูกค้าได้"
    );
  }

  return result;
}