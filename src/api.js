const FUNCTION_URL =
  "https://uhvcakajcdxkykopekgg.supabase.co/functions/v1/register-line-user";

// ==============================
// REGISTER LINE USER
// ==============================

export async function registerLineUser(idToken) {
  const response = await fetch(
    FUNCTION_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        action: "register",
        idToken,
      }),
    }
  );

  const result = await response.json();

  console.log(
    "REGISTER RESULT:",
    result
  );

  if (!response.ok) {
    throw new Error(
      result.detail ||
        result.error ||
        "ลงทะเบียนไม่สำเร็จ"
    );
  }

  return result;
}


// ==============================
// GET CUSTOMER CALENDAR
// ==============================

export async function getCalendar(idToken) {
  const response = await fetch(
    FUNCTION_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        action: "get_calendar",
        idToken,
      }),
    }
  );

  const result = await response.json();

  console.log(
    "CALENDAR RESULT:",
    result
  );

  if (!response.ok) {
    throw new Error(
      result.detail ||
        result.error ||
        "ไม่สามารถโหลดปฏิทินยาได้"
    );
  }

  return result;
}

export async function confirmOrder(
  idToken,
  orderId
) {
  const response = await fetch(
    FUNCTION_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        action: "confirm_order",
        idToken,
        order_id: orderId,
      }),
    }
  );

  const result =
    await response.json();

  console.log(
    "CONFIRM ORDER RESULT:",
    result
  );

  if (!response.ok) {
    throw new Error(
      result.error ||
        "ไม่สามารถยืนยันการสั่งยาได้"
    );
  }

  return result;
}