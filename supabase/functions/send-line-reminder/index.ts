import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req
      .json()
      .catch(() => ({}));

    const {
      order_id,
      notification = "confirm",
      test_date,
      dry_run = false,
      force = false,
    } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const effectiveDate =
      test_date || getBangkokDate();

    // ===================================
    // MANUAL TEST ORDER
    // ===================================

    if (order_id) {
      const result = await processOrder({
        supabase,
        orderId: order_id,
        notification,
        effectiveDate,
        dryRun: Boolean(dry_run),
        force: Boolean(force),
      });

      return json({
        success: true,
        mode: "manual",
        effective_date: effectiveDate,
        result,
      });
    }

    // ===================================
    // AUTOMATIC CONFIRM REMINDER
    // ===================================

    const {
      data: confirmOrders,
      error: confirmError,
    } = await supabase
      .from("medication_orders")
      .select("id")
      .eq(
        "status",
        "waiting_confirmation"
      )
      .eq(
        "confirm_reminder_date",
        effectiveDate
      )
      .is(
        "confirm_reminder_sent_at",
        null
      );

    if (confirmError) {
      throw confirmError;
    }

    // ===================================
    // AUTOMATIC PICKUP REMINDER
    // ===================================

    const {
      data: pickupOrders,
      error: pickupError,
    } = await supabase
      .from("medication_orders")
      .select("id")
      .eq("status", "ready")
      .eq(
        "pickup_date",
        effectiveDate
      )
      .is(
        "pickup_reminder_sent_at",
        null
      );

    if (pickupError) {
      throw pickupError;
    }

    if (dry_run) {
      return json({
        success: true,
        dry_run: true,
        effective_date: effectiveDate,
        confirm_orders:
          confirmOrders || [],
        pickup_orders:
          pickupOrders || [],
      });
    }

    const results = [];

    for (
      const item of confirmOrders || []
    ) {
      try {
        results.push(
          await processOrder({
            supabase,
            orderId: item.id,
            notification: "confirm",
            effectiveDate,
            dryRun: false,
            force: false,
          })
        );
      } catch (error) {
        results.push({
          success: false,
          order_id: item.id,
          notification: "confirm",
          error:
            error instanceof Error
              ? error.message
              : "Unknown error",
        });
      }
    }

    for (
      const item of pickupOrders || []
    ) {
      try {
        results.push(
          await processOrder({
            supabase,
            orderId: item.id,
            notification: "pickup",
            effectiveDate,
            dryRun: false,
            force: false,
          })
        );
      } catch (error) {
        results.push({
          success: false,
          order_id: item.id,
          notification: "pickup",
          error:
            error instanceof Error
              ? error.message
              : "Unknown error",
        });
      }
    }

    return json({
      success: true,
      mode: "scheduled",
      effective_date: effectiveDate,
      confirm_count:
        confirmOrders?.length || 0,
      pickup_count:
        pickupOrders?.length || 0,
      results,
    });
  } catch (error) {
    console.error(
      "SEND LINE REMINDER ERROR:",
      error
    );

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error",
      },
      500
    );
  }
});

async function processOrder({
  supabase,
  orderId,
  notification,
  effectiveDate,
  dryRun,
  force,
}: {
  supabase: any;
  orderId: string;
  notification: string;
  effectiveDate: string;
  dryRun: boolean;
  force: boolean;
}) {
  const {
    data: order,
    error: orderError,
  } = await supabase
    .from("medication_orders")
    .select(`
      id,
      customer_id,
      medication_id,
      status,
      confirm_reminder_date,
      pickup_date,
      confirm_reminder_sent_at,
      pickup_reminder_sent_at,

      customers (
        id,
        full_name,
        branch_name
      ),

      medications (
        id,
        drug_name,
        strength,
        quantity,
        dosage_instruction
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  if (!order) {
    throw new Error(
      "ไม่พบ order นี้"
    );
  }

  if (notification === "confirm") {
    if (
      order.status !==
      "waiting_confirmation"
    ) {
      throw new Error(
        `Confirm reminder ใช้ได้เฉพาะ waiting_confirmation ปัจจุบันคือ ${order.status}`
      );
    }

    if (
      !force &&
      order.confirm_reminder_date !==
        effectiveDate
    ) {
      return {
        success: false,
        skipped: true,
        reason:
          "ยังไม่ถึงวัน Confirm",
        order_id: order.id,
        effective_date:
          effectiveDate,
        confirm_reminder_date:
          order.confirm_reminder_date,
      };
    }

    if (
      !force &&
      order.confirm_reminder_sent_at
    ) {
      return {
        success: false,
        skipped: true,
        reason:
          "Confirm reminder ถูกส่งแล้ว",
        order_id: order.id,
      };
    }
  }

  if (notification === "pickup") {
    if (order.status !== "ready") {
      throw new Error(
        `Pickup reminder ใช้ได้เฉพาะ ready ปัจจุบันคือ ${order.status}`
      );
    }

    if (
      !force &&
      order.pickup_date !==
        effectiveDate
    ) {
      return {
        success: false,
        skipped: true,
        reason:
          "ยังไม่ถึงวันนัดรับยา",
        order_id: order.id,
        effective_date:
          effectiveDate,
        pickup_date:
          order.pickup_date,
      };
    }

    if (
      !force &&
      order.pickup_reminder_sent_at
    ) {
      return {
        success: false,
        skipped: true,
        reason:
          "Pickup reminder ถูกส่งแล้ว",
        order_id: order.id,
      };
    }
  }

  const medication =
    Array.isArray(order.medications)
      ? order.medications[0]
      : order.medications;

  const customer =
    Array.isArray(order.customers)
      ? order.customers[0]
      : order.customers;

  if (!medication) {
    throw new Error(
      "ไม่พบข้อมูลยา"
    );
  }

  const {
    data: lineUser,
    error: lineUserError,
  } = await supabase
    .from("line_users")
    .select(
      "line_user_id, display_name"
    )
    .eq(
      "customer_id",
      order.customer_id
    )
    .eq("status", "active")
    .maybeSingle();

  if (lineUserError) {
    throw lineUserError;
  }

  if (!lineUser?.line_user_id) {
    throw new Error(
      "ไม่พบ LINE user ของลูกค้า"
    );
  }

  const drugName =
    medication.drug_name ||
    "ยาของคุณ";

  const strength =
    medication.strength
      ? ` ${medication.strength}`
      : "";

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      order_id: order.id,
      notification,
      customer:
        customer?.full_name ||
        lineUser.display_name,
      drug:
        `${drugName}${strength}`,
    };
  }

  const accessToken =
    Deno.env.get(
      "LINE_CHANNEL_ACCESS_TOKEN"
    );

  const liffId =
    Deno.env.get(
      "LINE_LIFF_ID"
    );

  if (!accessToken) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN is missing"
    );
  }

  if (!liffId) {
    throw new Error(
      "LINE_LIFF_ID is missing"
    );
  }

  let messages;

  if (notification === "confirm") {
    const confirmUrl =
      `https://liff.line.me/${liffId}` +
      `?action=confirm&order=${order.id}`;

    messages = [
      {
        type: "template",

        altText:
          `ถึงรอบยืนยัน ${drugName}${strength}`,

        template: {
          type: "buttons",

          title:
            "ถึงรอบยืนยันการสั่งยา",

          text:
            `${drugName}${strength}\n` +
            `นัดรับยา ${formatThaiDate(
              order.pickup_date
            )}`,

          actions: [
            {
              type: "uri",
              label:
                "ยืนยันสั่งยา",
              uri: confirmUrl,
            },
          ],
        },
      },
    ];
  } else {
    const customerAppUrl =
      `https://liff.line.me/${liffId}`;

    messages = [
      {
        type: "template",

        altText:
          `วันนี้เป็นวันนัดรับ ${drugName}${strength}`,

        template: {
          type: "buttons",

          title:
            "วันนี้เป็นวันนัดรับยา",

          text:
            `${drugName}${strength}\n` +
            `ยาของคุณพร้อมรับแล้ว\n` +
            `${
              customer?.branch_name
                ? `สาขา ${customer.branch_name}`
                : "กรุณามารับยาตามนัด"
            }`,

          actions: [
            {
              type: "uri",
              label:
                "ดูรายละเอียดนัดรับ",
              uri:
                customerAppUrl,
            },
          ],
        },
      },
    ];
  }

  const lineResponse =
    await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${accessToken}`,
        },

        body: JSON.stringify({
          to:
            lineUser.line_user_id,
          messages,
        }),
      }
    );

  if (!lineResponse.ok) {
    const detail =
      await lineResponse.text();

    throw new Error(
      `LINE API error: ${detail}`
    );
  }

  const sentAt =
    new Date().toISOString();

  if (notification === "confirm") {
    const { error } =
      await supabase
        .from(
          "medication_orders"
        )
        .update({
          confirm_reminder_sent_at:
            sentAt,
        })
        .eq("id", order.id);

    if (error) {
      throw error;
    }
  }

  if (notification === "pickup") {
    const { error } =
      await supabase
        .from(
          "medication_orders"
        )
        .update({
          pickup_reminder_sent_at:
            sentAt,
        })
        .eq("id", order.id);

    if (error) {
      throw error;
    }
  }

  return {
    success: true,
    order_id: order.id,
    notification,
    sent_to:
      lineUser.display_name ||
      lineUser.line_user_id,
    sent_at: sentAt,
  };
}

function getBangkokDate() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const get = (
    type: string
  ) =>
    parts.find(
      (part) =>
        part.type === type
    )?.value || "";

  return (
    `${get("year")}-` +
    `${get("month")}-` +
    `${get("day")}`
  );
}

function formatThaiDate(
  dateString:
    | string
    | null
) {
  if (!dateString) {
    return "-";
  }

  const [
    year,
    month,
    day,
  ] = dateString
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )
  );
}

function json(
  data: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}