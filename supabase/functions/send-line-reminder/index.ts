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
    const { order_id } = await req.json();

    if (!order_id) {
      return json(
        {
          error: "Missing order_id",
        },
        400
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      )!
    );

    // ==============================
    // 1. LOAD ORDER + MEDICATION
    // ==============================

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
        expected_runout_date,
        confirm_reminder_date,
        pickup_date,

        medications (
          id,
          drug_name,
          strength,
          quantity,
          dosage_instruction
        )
      `)
      .eq("id", order_id)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return json(
        {
          error: "ไม่พบ order นี้",
        },
        404
      );
    }

    // Confirm ไปแล้ว ไม่ต้องส่งซ้ำ
    if (order.status === "confirmed") {
      return json(
        {
          error:
            "รายการยานี้ได้รับการยืนยันแล้ว",
        },
        409
      );
    }

    if (
      order.status !==
      "waiting_confirmation"
    ) {
      return json(
        {
          error:
            "รายการยานี้ไม่อยู่ในสถานะรอยืนยัน",
          status: order.status,
        },
        409
      );
    }

    // ==============================
    // 2. FIND LINE USER
    // ==============================

    const {
      data: lineUser,
      error: lineUserError,
    } = await supabase
      .from("line_users")
      .select(`
        line_user_id,
        display_name,
        status
      `)
      .eq(
        "customer_id",
        order.customer_id
      )
      .eq("status", "active")
      .maybeSingle();

    if (lineUserError) {
      throw lineUserError;
    }

    if (!lineUser) {
      return json(
        {
          error:
            "ไม่พบ LINE user ของลูกค้าคนนี้",
        },
        404
      );
    }

    // ==============================
    // 3. LOAD LINE CONFIG
    // ==============================

    const accessToken =
      Deno.env.get(
        "LINE_CHANNEL_ACCESS_TOKEN"
      );

    if (!accessToken) {
      throw new Error(
        "LINE_CHANNEL_ACCESS_TOKEN is missing"
      );
    }

    const liffId =
      Deno.env.get(
        "LINE_LIFF_ID"
      );

    if (!liffId) {
      throw new Error(
        "LINE_LIFF_ID is missing"
      );
    }

    // ==============================
    // 4. NORMALIZE MEDICATION
    // ==============================

    const medication =
      Array.isArray(order.medications)
        ? order.medications[0]
        : order.medications;

    if (!medication) {
      return json(
        {
          error:
            "ไม่พบข้อมูลยาของ order นี้",
        },
        404
      );
    }

    const drugName =
      medication.drug_name ||
      "ยาของคุณ";

    const strength =
      medication.strength
        ? ` ${medication.strength}`
        : "";

    const quantity =
      medication.quantity
        ? `จำนวน ${medication.quantity}`
        : "";

    // ==============================
    // 5. BUILD CONFIRM URL
    // ==============================

    const confirmUrl =
      `https://liff.line.me/${liffId}` +
      `?action=confirm&order=${order.id}`;

    // ==============================
    // 6. SEND LINE PUSH
    // ==============================

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

            messages: [
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
                    `${quantity}\n` +
                    `นัดรับยา ${formatThaiDate(
                      order.pickup_date
                    )}`,

                  actions: [
                    {
                      type: "uri",

                      label:
                        "ยืนยันสั่งยา",

                      uri:
                        confirmUrl,
                    },
                  ],
                },
              },
            ],
          }),
        }
      );

    if (!lineResponse.ok) {
      const detail =
        await lineResponse.text();

      return json(
        {
          error:
            "LINE API error",
          detail,
        },
        500
      );
    }

    return json({
      success: true,

      order_id:
        order.id,

      medication_id:
        medication.id,

      drug:
        `${drugName}${strength}`,

      sent_to:
        lineUser.display_name ||
        lineUser.line_user_id,
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

function formatThaiDate(
  dateString: string | null
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