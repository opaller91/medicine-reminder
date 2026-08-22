import { createClient } from "@supabase/supabase-js";
import webpush from "npm:web-push@3.6.7";

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
            prescription_document_url,
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
              order_document_url,
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
    // ACTION : GET PRESCRIPTION DOCUMENT
    // ==============================

    if (
      action ===
      "get_prescription_document"
    ) {
      const {
        medication_id,
      } = requestBody;

      if (!medication_id) {
        return json(
          {
            error:
              "Missing medication_id",
          },
          400
        );
      }

      const {
        data: lineUser,
        error: lineUserError,
      } = await supabase
        .from("line_users")
        .select(`
          id,
          customer_id,
          status
        `)
        .eq(
          "line_user_id",
          lineUserId
        )
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
          {
            error:
              "ยังไม่ได้เชื่อมข้อมูลลูกค้า",
          },
          403
        );
      }

      const {
        data: medication,
        error: medicationError,
      } = await supabase
        .from("medications")
        .select(`
          id,
          customer_id,
          drug_name,
          prescription_document_url
        `)
        .eq(
          "id",
          medication_id
        )
        .eq(
          "customer_id",
          lineUser.customer_id
        )
        .maybeSingle();

      if (medicationError) {
        throw medicationError;
      }

      if (!medication) {
        return json(
          {
            error:
              "ไม่พบข้อมูลยานี้",
          },
          404
        );
      }

      if (
        !medication
          .prescription_document_url
      ) {
        return json(
          {
            error:
              "ยารายการนี้ไม่มีใบสั่งยาจากแพทย์",
          },
          404
        );
      }

      const {
        data: signedData,
        error: signedError,
      } = await supabase.storage
        .from("prescriptions")
        .createSignedUrl(
          medication
            .prescription_document_url,
          60 * 10
        );

      if (signedError) {
        throw signedError;
      }

      return json({
        success: true,
        medication_id:
          medication.id,
        drug_name:
          medication.drug_name,
        document_url:
          signedData.signedUrl,
      });
    }

    // ==============================
    // ACTION : GET ORDER DOCUMENT
    // ==============================

    if (action === "get_order_document") {
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

      // สำคัญ: ตรวจว่า order เป็นของลูกค้าคนนี้จริง
      const {
        data: order,
        error: orderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          customer_id,
          status,
          order_document_url
        `)
        .eq("id", order_id)
        .eq(
          "customer_id",
          lineUser.customer_id
        )
        .maybeSingle();

      if (orderError) {
        throw orderError;
      }

      if (!order) {
        return json(
          { error: "ไม่พบรายการยานี้" },
          404
        );
      }

      if (!order.order_document_url) {
        return json(
          {
            error:
              "ยังไม่มีใบยืนยันการสั่งซื้อ",
          },
          404
        );
      }

      // สร้าง URL ชั่วคราวจาก private bucket
      const {
        data: signedData,
        error: signedError,
      } = await supabase.storage
        .from("order-documents")
        .createSignedUrl(
          order.order_document_url,
          60 * 10
        );

      if (signedError) {
        throw signedError;
      }

      return json({
        success: true,
        order_id: order.id,
        document_url:
          signedData.signedUrl,
      });
    }
    
    // ==============================
    // ACTION : CONFIRM ORDER
    // ลูกค้ายืนยันสั่งยา + Push แจ้งเภสัชกรสาขาเดียวกัน
    // ==============================

    if (action === "confirm_order") {
      const { order_id } = requestBody;

      if (!order_id) {
        return json({ error: "Missing order_id" }, 400);
      }

      const { data: lineUser, error: lineUserError } = await supabase
        .from("line_users")
        .select("id, customer_id, status")
        .eq("line_user_id", lineUserId)
        .maybeSingle();

      if (lineUserError) throw lineUserError;

      if (!lineUser || !lineUser.customer_id || lineUser.status !== "active") {
        return json({ error: "ยังไม่ได้เชื่อมข้อมูลลูกค้า" }, 403);
      }

      const { data: order, error: orderError } = await supabase
        .from("medication_orders")
        .select(`
          id,
          customer_id,
          medication_id,
          status,
          confirm_reminder_date,
          pickup_date
        `)
        .eq("id", order_id)
        .eq("customer_id", lineUser.customer_id)
        .maybeSingle();

      if (orderError) throw orderError;

      if (!order) {
        return json({ error: "ไม่พบรอบยานี้" }, 404);
      }

      if (order.status === "confirmed") {
        return json({
          success: true,
          already_confirmed: true,
          order,
        });
      }

      if (order.status !== "waiting_confirmation") {
        return json({ error: "รอบยานี้ไม่อยู่ในสถานะที่ยืนยันได้" }, 409);
      }

      const { data: updatedOrder, error: updateError } = await supabase
        .from("medication_orders")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "waiting_confirmation")
        .select()
        .single();

      if (updateError) throw updateError;

      let pushNotificationSent = false;
      let pushNotificationError: string | null = null;

      try {
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .select("id, full_name, branch_name")
          .eq("id", lineUser.customer_id)
          .maybeSingle();

        if (customerError) throw customerError;
        if (!customer?.branch_name) throw new Error("ไม่พบสาขาของลูกค้า");

        const { data: pharmacists, error: pharmacistError } = await supabase
          .from("pharmacists")
          .select("id, full_name, branch_name")
          .eq("branch_name", customer.branch_name);

        if (pharmacistError) throw pharmacistError;
        if (!pharmacists || pharmacists.length === 0) {
          throw new Error("ไม่พบเภสัชกรของสาขานี้");
        }

        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
        const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "https://uhvcakajcdxkykopekgg.supabase.co";

        if (!vapidPublicKey || !vapidPrivateKey) {
          throw new Error("VAPID keys are missing");
        }

        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

        const pharmacistIds = pharmacists.map((item) => item.id);

        const { data: subscriptions, error: subscriptionError } = await supabase
          .from("pharmacist_push_subscriptions")
          .select("id, pharmacist_id, endpoint, p256dh, auth")
          .in("pharmacist_id", pharmacistIds);

        if (subscriptionError) throw subscriptionError;
        if (!subscriptions || subscriptions.length === 0) {
          throw new Error("ยังไม่มีเครื่องเภสัชกรที่เปิด Push Notification");
        }

        const { data: medication, error: medicationError } = await supabase
          .from("medications")
          .select("drug_name, strength")
          .eq("id", order.medication_id)
          .maybeSingle();

        if (medicationError) throw medicationError;

        const drugName = medication?.drug_name || "รายการยา";
        const strength = medication?.strength ? ` ${medication.strength}` : "";

        const payload = JSON.stringify({
          title: "มีลูกค้ายืนยันสั่งยา",
          body: `${customer.full_name} • ${drugName}${strength}`,
          url: "/admin?tab=orders",
        });

        let successCount = 0;
        const pushErrors: string[] = [];

        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            }, payload);
            successCount += 1;
          } catch (pushError) {
            const statusCode =
              typeof pushError === "object" && pushError && "statusCode" in pushError
                ? Number((pushError as { statusCode?: number }).statusCode)
                : null;

            const message = pushError instanceof Error ? pushError.message : "Push ไม่สำเร็จ";
            pushErrors.push(message);
            console.error("CONFIRM PUSH ERROR:", pushError);

            if (statusCode === 404 || statusCode === 410) {
              await supabase
                .from("pharmacist_push_subscriptions")
                .delete()
                .eq("id", subscription.id);
            }
          }
        }

        pushNotificationSent = successCount > 0;
        if (!pushNotificationSent) {
          pushNotificationError = pushErrors[0] || "ส่ง Push ไม่สำเร็จทุกอุปกรณ์";
        }
      } catch (pushError) {
        pushNotificationError = pushError instanceof Error ? pushError.message : "ส่ง Push ไม่สำเร็จ";
        console.error("CONFIRM ORDER PUSH ERROR:", pushError);
      }

      return json({
        success: true,
        order: updatedOrder,
        push_notification_sent: pushNotificationSent,
        push_notification_error: pushNotificationError,
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