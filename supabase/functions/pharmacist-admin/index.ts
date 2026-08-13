import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. รับ access token ของเภสัชกร
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // 2. Supabase Admin Client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. ตรวจ user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    // 4. ตรวจว่า user นี้เป็นเภสัชกรจริง
    const { data: pharmacist, error: pharmacistError } =
      await supabase
        .from("pharmacists")
        .select("id, full_name, branch_name")
        .eq("user_id", user.id)
        .maybeSingle();

    if (pharmacistError) {
      throw pharmacistError;
    }

    if (!pharmacist) {
      return json(
        {
          error: "คุณไม่มีสิทธิ์ใช้งานระบบเภสัชกร",
        },
        403
      );
    }

    const body = await req.json();

    // ====================================
    // ACTION 1 : LIST PENDING LINE USERS
    // ====================================

    if (body.action === "list_pending") {
      const { data, error } = await supabase
        .from("line_users")
        .select(
          "id, line_user_id, display_name, picture_url, status, created_at"
        )
        .eq("status", "pending")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      return json({
        success: true,
        pharmacist,
        users: data || [],
      });
    }

    // ====================================
    // ACTION 2 : LINK CUSTOMER
    // ====================================

    if (body.action === "link_customer") {
      const {
        line_user_row_id,
        full_name,
        phone,
        branch_name,
        medications,
      } = body;

      if (
        !line_user_row_id ||
        !full_name ||
        !Array.isArray(medications) ||
        medications.length === 0
      ) {
        return json(
          {
            error:
              "ข้อมูลลูกค้าหรือรายการยาไม่ครบ",
          },
          400
        );
      }

      const invalidMedication =
        medications.find(
          (medication) =>
            !medication?.drug_name ||
            !medication?.start_date ||
            !medication?.days_supply ||
            !medication?.pickup_date
        );

      if (invalidMedication) {
        return json(
          {
            error:
              "กรุณากรอกชื่อยา วันที่เริ่มใช้ จำนวนวันที่ใช้ได้ และวันนัดรับยาให้ครบทุกรายการ",
          },
          400
        );
      }

      // ตรวจว่า LINE user นี้ยัง pending อยู่จริง
      const {
        data: lineUser,
        error: lineUserError,
      } = await supabase
        .from("line_users")
        .select(
          "id, customer_id, status, display_name"
        )
        .eq("id", line_user_row_id)
        .maybeSingle();

      if (lineUserError) {
        throw lineUserError;
      }

      if (!lineUser) {
        return json(
          {
            error: "ไม่พบ LINE user นี้",
          },
          404
        );
      }

      if (
        lineUser.status === "active" ||
        lineUser.customer_id
      ) {
        return json(
          {
            error:
              "LINE user นี้ถูกเชื่อมกับลูกค้าแล้ว",
          },
          409
        );
      }

      // 1. สร้าง CUSTOMER
      const {
        data: customer,
        error: customerError,
      } = await supabase
        .from("customers")
        .insert({
          full_name,
          phone: phone || null,
          branch_name:
            branch_name ||
            pharmacist.branch_name ||
            null,
        })
        .select()
        .single();

      if (customerError) {
        throw customerError;
      }

      // 2. สร้าง MEDICATION + ORDER แยกทีละรายการ
      const createdMedications = [];
      const createdOrders = [];

      for (const item of medications) {
        const {
          data: medication,
          error: medicationError,
        } = await supabase
          .from("medications")
          .insert({
            customer_id: customer.id,
            drug_name: item.drug_name,
            strength:
              item.strength || null,
            quantity:
              item.quantity !== "" &&
              item.quantity !== null &&
              item.quantity !== undefined
                ? Number(item.quantity)
                : null,
            dosage_instruction:
              item.dosage_instruction ||
              null,
            start_date:
              item.start_date,
            days_supply:
              Number(item.days_supply),
          })
          .select()
          .single();

        if (medicationError) {
          throw medicationError;
        }

        const expectedRunoutDate =
          addDaysToDateString(
            item.start_date,
            Number(item.days_supply)
          );

        const confirmReminderDate =
          addDaysToDateString(
            expectedRunoutDate,
            -14
          );

        const {
          data: order,
          error: orderError,
        } = await supabase
          .from("medication_orders")
          .insert({
            customer_id: customer.id,
            medication_id:
              medication.id,
            status:
              "waiting_confirmation",
            expected_runout_date:
              expectedRunoutDate,
            confirm_reminder_date:
              confirmReminderDate,
            pickup_date:
              item.pickup_date,
          })
          .select()
          .single();

        if (orderError) {
          throw orderError;
        }

        createdMedications.push(
          medication
        );

        createdOrders.push(order);
      }

      // 3. ผูก LINE USER กับ CUSTOMER
      const {
        data: updatedLineUser,
        error: lineError,
      } = await supabase
        .from("line_users")
        .update({
          customer_id: customer.id,
          status: "active",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", line_user_row_id)
        .select()
        .single();

      if (lineError) {
        throw lineError;
      }

      return json({
        success: true,
        customer,
        medications:
          createdMedications,
        orders: createdOrders,
        line_user:
          updatedLineUser,
      });
    }

    // ====================================
    // ACTION 3 : ADD MEDICATION
    // ====================================

    if (body.action === "add_medication") {
      const {
        customer_id,
        drug_name,
        strength,
        quantity,
        dosage_instruction,
        start_date,
        days_supply,
        pickup_date,
      } = body;

      if (
        !customer_id ||
        !drug_name ||
        !start_date ||
        !days_supply ||
        !pickup_date
      ) {
        return json(
          {
            error:
              "ข้อมูลยาไม่ครบ",
          },
          400
        );
      }

      const {
        data: customer,
        error: customerError,
      } = await supabase
        .from("customers")
        .select(
          "id, full_name, branch_name"
        )
        .eq("id", customer_id)
        .maybeSingle();

      if (customerError) {
        throw customerError;
      }

      if (!customer) {
        return json(
          {
            error:
              "ไม่พบลูกค้าคนนี้",
          },
          404
        );
      }

      const {
        data: medication,
        error: medicationError,
      } = await supabase
        .from("medications")
        .insert({
          customer_id:
            customer.id,
          drug_name,
          strength:
            strength || null,
          quantity:
            quantity !== "" &&
            quantity !== null &&
            quantity !== undefined
              ? Number(quantity)
              : null,
          dosage_instruction:
            dosage_instruction ||
            null,
          start_date,
          days_supply:
            Number(days_supply),
        })
        .select()
        .single();

      if (medicationError) {
        throw medicationError;
      }

      const expectedRunoutDate =
        addDaysToDateString(
          start_date,
          Number(days_supply)
        );

      const confirmReminderDate =
        addDaysToDateString(
          expectedRunoutDate,
          -14
        );

      const {
        data: order,
        error: orderError,
      } = await supabase
        .from("medication_orders")
        .insert({
          customer_id:
            customer.id,
          medication_id:
            medication.id,
          status:
            "waiting_confirmation",
          expected_runout_date:
            expectedRunoutDate,
          confirm_reminder_date:
            confirmReminderDate,
          pickup_date,
        })
        .select()
        .single();

      if (orderError) {
        throw orderError;
      }

      return json({
        success: true,
        customer,
        medication,
        order,
      });
    }

    // ====================================
    // ACTION 3 : LIST ALL CUSTOMERS
    // ====================================

    if (body.action === "list_customers") {
      const { data, error } = await supabase
        .from("customers")
        .select(`
          id,
          full_name,
          phone,
          branch_name,
          created_at,

          line_users (
            id,
            display_name,
            picture_url,
            status
          ),

          medications (
            id,
            drug_name,
            strength,
            quantity,
            dosage_instruction,
            days_supply,

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
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      const customers = (data || []).map((customer) => {
        const medications = customer.medications || [];

        const normalizedMedications = medications.map(
          (medication) => {
            const orders =
              medication.medication_orders || [];

            orders.sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );

            return {
              ...medication,
              latest_order: orders[0] || null,
            };
          }
        );

        return {
          ...customer,
          medications: normalizedMedications,
        };
      });

      return json({
        success: true,
        pharmacist,
        customers,
      });
    }
    // ====================================
    // UNKNOWN ACTION
    // ====================================

    return json(
      {
        error: "Unknown action",
      },
      400
    );
  } catch (error) {
    console.error(
      "PHARMACIST ADMIN ERROR:",
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

// ====================================
// HELPER : ADD DAYS TO YYYY-MM-DD
// ====================================

function addDaysToDateString(
  dateString: string,
  days: number
) {
  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

// ====================================
// HELPER : JSON RESPONSE
// ====================================

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