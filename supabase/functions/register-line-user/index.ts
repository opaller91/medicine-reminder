import { createClient } from "@supabase/supabase-js";

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
    // อ่าน request body แค่ครั้งเดียว
    const requestBody = await req.json();

    const {
      idToken,
      action = "register",
    } = requestBody;

    if (!idToken) {
      return json(
        {
          error: "Missing idToken",
        },
        400
      );
    }

    // ==============================
    // 1. VERIFY LINE ID TOKEN
    // ==============================

    const channelId =
      Deno.env.get("LINE_CHANNEL_ID");

    if (!channelId) {
      throw new Error(
        "LINE_CHANNEL_ID is missing"
      );
    }

    const verifyBody =
      new URLSearchParams();

    verifyBody.set(
      "id_token",
      idToken
    );

    verifyBody.set(
      "client_id",
      channelId
    );

    const verifyRes = await fetch(
      "https://api.line.me/oauth2/v2.1/verify",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: verifyBody,
      }
    );

    if (!verifyRes.ok) {
      const detail =
        await verifyRes.text();

      return json(
        {
          error:
            "Invalid LINE ID token",
          detail,
        },
        401
      );
    }

    const lineProfile =
      await verifyRes.json();

    const lineUserId =
      lineProfile.sub;

    const displayName =
      lineProfile.name ?? null;

    const pictureUrl =
      lineProfile.picture ?? null;

    // ==============================
    // 2. SUPABASE ADMIN CLIENT
    // ==============================

    const supabase =
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        )!
      );

    // ==============================
    // ACTION : GET CALENDAR
    // ==============================

    if (action === "get_calendar") {
      const {
        data: lineUser,
        error: lineUserError,
      } = await supabase
        .from("line_users")
        .select(`
          id,
          line_user_id,
          display_name,
          picture_url,
          status,
          customer_id
        `)
        .eq(
          "line_user_id",
          lineUserId
        )
        .maybeSingle();

      if (lineUserError) {
        throw lineUserError;
      }

      // ยังไม่เคย register
      if (!lineUser) {
        return json({
          success: true,
          status:
            "not_registered",
        });
      }

      // register แล้ว แต่เภสัชยังไม่เชื่อม
      if (
        lineUser.status !==
          "active" ||
        !lineUser.customer_id
      ) {
        return json({
          success: true,
          status: "pending",
          line_user: lineUser,
        });
      }

      // ==============================
      // ACTIVE → LOAD CUSTOMER
      // ==============================

      const {
        data: customer,
        error: customerError,
      } = await supabase
        .from("customers")
        .select(`
          id,
          full_name,
          phone,
          branch_name,
          created_at,

          medications (
            id,
            drug_name,
            strength,
            quantity,
            dosage_instruction,
            start_date,
            days_supply,
            created_at,

            medication_orders (
              id,
              status,
              expected_runout_date,
              confirm_reminder_date,
              pickup_date,
              confirmed_at,
              ordered_at,
              ready_at,
              picked_up_at,
              created_at
            )
          )
        `)
        .eq(
          "id",
          lineUser.customer_id
        )
        .single();

      if (customerError) {
        throw customerError;
      }

      // ==============================
      // หา order ล่าสุดของแต่ละยา
      // ==============================

      const medications =
        customer.medications || [];

      const normalizedMedications =
        medications.map(
          (medication) => {
            const orders =
              medication.medication_orders ||
              [];

            orders.sort(
              (a, b) =>
                new Date(
                  b.created_at
                ).getTime() -
                new Date(
                  a.created_at
                ).getTime()
            );

            return {
              ...medication,
              latest_order:
                orders[0] || null,
            };
          }
        );

      return json({
        success: true,
        status: "active",

        line_user: lineUser,

        customer: {
          ...customer,
          medications:
            normalizedMedications,
        },
      });
    }

    // ==============================
    // ACTION : CONFIRM ORDER
    // ==============================

    if (action === "confirm_order") {
    const { order_id } = requestBody;

    if (!order_id) {
        return json(
        { error: "Missing order_id" },
        400
        );
    }

    // หา LINE user ที่กำลังเปิด LIFF
    const {
        data: lineUser,
        error: lineUserError,
    } = await supabase
        .from("line_users")
        .select("id, customer_id, status")
        .eq("line_user_id", lineUserId)
        .maybeSingle();

    if (lineUserError) {
        throw lineUserError;
    }

    if (
        !lineUser ||
        !lineUser.customer_id ||
        lineUser.status !== "active"
    ) {
        return json(
        { error: "ยังไม่ได้เชื่อมข้อมูลลูกค้า" },
        403
        );
    }

    // ตรวจว่า order นี้เป็นของ customer คนนี้จริง
    const {
        data: order,
        error: orderError,
    } = await supabase
        .from("medication_orders")
        .select(`
        id,
        customer_id,
        status,
        confirm_reminder_date,
        pickup_date
        `)
        .eq("id", order_id)
        .eq("customer_id", lineUser.customer_id)
        .maybeSingle();

    if (orderError) {
        throw orderError;
    }

    if (!order) {
        return json(
        { error: "ไม่พบรอบยานี้" },
        404
        );
    }

    if (order.status === "confirmed") {
        return json({
        success: true,
        already_confirmed: true,
        order,
        });
    }

    if (order.status !== "waiting_confirmation") {
        return json(
        {
            error:
            "รอบยานี้ไม่อยู่ในสถานะที่ยืนยันได้",
        },
        409
        );
    }

    // update จริง
    const {
        data: updatedOrder,
        error: updateError,
    } = await supabase
        .from("medication_orders")
        .update({
        status: "confirmed",
        confirmed_at:
            new Date().toISOString(),
        })
        .eq("id", order.id)
        .select()
        .single();

    if (updateError) {
        throw updateError;
    }

    return json({
        success: true,
        order: updatedOrder,
    });
    }
    // ==============================
    // ACTION : REGISTER LINE USER
    // ==============================

    if (
      action === "register" ||
      !action
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("line_users")
        .upsert(
          {
            line_user_id:
              lineUserId,

            display_name:
              displayName,

            picture_url:
              pictureUrl,

            updated_at:
              new Date()
                .toISOString(),
          },
          {
            onConflict:
              "line_user_id",
          }
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      return json({
        success: true,
        status:
          data.status ||
          "pending",
        user: data,
      });
    }

    return json(
      {
        error:
          "Unknown action",
      },
      400
    );
  } catch (err) {
    console.error(
      "REGISTER LINE USER ERROR:",
      err
    );

    return json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unknown error",
      },
      500
    );
  }
});

// ==============================
// JSON RESPONSE HELPER
// ==============================

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