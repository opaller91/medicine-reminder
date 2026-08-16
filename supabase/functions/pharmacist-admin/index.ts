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
            pharmacist.branch_name || null,
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

        // OPTIONAL : ใบสั่งยาจากแพทย์
        if (item.prescription_file_base64) {
          const prescriptionPath =
            await uploadPrescriptionDocument({
              supabase,
              customerId: customer.id,
              medicationId: medication.id,
              fileBase64:
                item.prescription_file_base64,
              fileName:
                item.prescription_file_name,
              contentType:
                item.prescription_content_type,
            });

          const {
            error: prescriptionUpdateError,
          } = await supabase
            .from("medications")
            .update({
              prescription_document_url:
                prescriptionPath,
            })
            .eq("id", medication.id);

          if (prescriptionUpdateError) {
            await supabase.storage
              .from("prescriptions")
              .remove([prescriptionPath]);

            throw prescriptionUpdateError;
          }

          medication.prescription_document_url =
            prescriptionPath;
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
        prescription_file_base64,
        prescription_file_name,
        prescription_content_type,
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

      // OPTIONAL : ใบสั่งยาจากแพทย์
      if (prescription_file_base64) {
        const prescriptionPath =
          await uploadPrescriptionDocument({
            supabase,
            customerId: customer.id,
            medicationId: medication.id,
            fileBase64:
              prescription_file_base64,
            fileName:
              prescription_file_name,
            contentType:
              prescription_content_type,
          });

        const {
          error: prescriptionUpdateError,
        } = await supabase
          .from("medications")
          .update({
            prescription_document_url:
              prescriptionPath,
          })
          .eq("id", medication.id);

        if (prescriptionUpdateError) {
          await supabase.storage
            .from("prescriptions")
            .remove([prescriptionPath]);

          throw prescriptionUpdateError;
        }

        medication.prescription_document_url =
          prescriptionPath;
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
            prescription_document_url,

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
              actual_price,
              receipt_document_url,
              order_document_url,
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
    // ACTION 5 : LIST CONFIRMED ORDERS
    // งานที่ลูกค้ากดยืนยันแล้ว รอเภสัชกรดำเนินการ
    // ====================================

    if (body.action === "list_confirmed_orders") {
      const { data, error } = await supabase
        .from("medication_orders")
        .select(`
          id,
          customer_id,
          medication_id,
          status,
          expected_runout_date,
          confirm_reminder_date,
          pickup_date,
          confirmed_at,
          ordered_at,
          created_at,

          customers (
            id,
            full_name,
            phone,
            branch_name
          ),

          medications (
            id,
            drug_name,
            strength,
            quantity,
            dosage_instruction,
            start_date,
            days_supply,
            prescription_document_url
          )
        `)
        .in("status", [
          "confirmed",
          "ordered",
          "ready",
        ])
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      const orders = (data || []).filter((order) => {
        if (!pharmacist.branch_name) {
          return true;
        }

        const customer = getRelatedCustomer(
          order.customers
        ) as {
          branch_name?: string | null;
        } | null;

        return (
          customer?.branch_name ===
          pharmacist.branch_name
        );
      });

      return json({
        success: true,
        pharmacist,
        orders,
      });
    }

    // ====================================
    // ACTION 6 : UPLOAD ORDER DOCUMENT
    // รับรูปเป็น base64 -> upload ด้วย service role
    // -> บันทึก path -> confirmed -> ordered
    // ====================================

    if (body.action === "upload_order_document") {
      const {
        order_id,
        file_base64,
        file_name,
        content_type,
      } = body;

      if (!order_id || !file_base64) {
        return json(
          {
            error:
              "กรุณาระบุ order_id และไฟล์เอกสาร",
          },
          400
        );
      }

      const {
        data: existingOrder,
        error: existingOrderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          status,
          customer_id,
          pickup_date,
          customers (
            full_name,
            branch_name
          ),
          medications (
            drug_name,
            strength
          )
        `)
        .eq("id", order_id)
        .maybeSingle();

      if (existingOrderError) {
        throw existingOrderError;
      }

      if (!existingOrder) {
        return json(
          { error: "ไม่พบรายการสั่งยานี้" },
          404
        );
      }

      const relatedCustomer =
        getRelatedCustomer(
          existingOrder.customers
        ) as {
          branch_name?: string | null;
        } | null;

      if (
        pharmacist.branch_name &&
        relatedCustomer?.branch_name !==
          pharmacist.branch_name
      ) {
        return json(
          {
            error:
              "คุณไม่มีสิทธิ์ดำเนินการรายการของสาขาอื่น",
          },
          403
        );
      }

      if (existingOrder.status !== "confirmed") {
        return json(
          {
            error:
              "รายการนี้ไม่ได้อยู่ในสถานะ confirmed",
          },
          409
        );
      }

      const normalizedBase64 =
        String(file_base64).includes(",")
          ? String(file_base64).split(",").pop()!
          : String(file_base64);

      let fileBytes: Uint8Array;

      try {
        fileBytes =
          decodeBase64ToUint8Array(
            normalizedBase64
          );
      } catch {
        return json(
          {
            error:
              "ไม่สามารถอ่านไฟล์รูปภาพได้",
          },
          400
        );
      }

      // จำกัด 10 MB
      if (
        fileBytes.byteLength >
        10 * 1024 * 1024
      ) {
        return json(
          {
            error:
              "ไฟล์รูปต้องมีขนาดไม่เกิน 10 MB",
          },
          400
        );
      }

      const safeExtension =
        getSafeExtension(
          file_name,
          content_type
        );

      const storagePath =
        `${order_id}/` +
        `${Date.now()}.${safeExtension}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from("order-documents")
        .upload(
          storagePath,
          fileBytes,
          {
            contentType:
              content_type ||
              "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: order,
        error: updateError,
      } = await supabase
        .from("medication_orders")
        .update({
          order_document_url:
            storagePath,
          status: "ordered",
          ordered_at:
            new Date().toISOString(),
        })
        .eq("id", order_id)
        .eq("status", "confirmed")
        .select()
        .single();

      if (updateError) {
        // ถ้า update DB ไม่สำเร็จ ลบไฟล์ที่เพิ่ง upload
        await supabase.storage
          .from("order-documents")
          .remove([storagePath]);

        throw updateError;
      }

      // 4. แจ้งลูกค้าทาง LINE หลังเปลี่ยนเป็น ordered สำเร็จ
      // ถ้า LINE ส่งไม่สำเร็จ จะไม่ rollback order/เอกสาร
      let lineNotificationSent = false;
      let lineNotificationError: string | null = null;

      try {
        const {
          data: lineUser,
          error: lineUserError,
        } = await supabase
          .from("line_users")
          .select(
            "line_user_id, display_name, status"
          )
          .eq(
            "customer_id",
            existingOrder.customer_id
          )
          .eq("status", "active")
          .maybeSingle();

        if (lineUserError) {
          throw lineUserError;
        }

        if (!lineUser?.line_user_id) {
          throw new Error(
            "ไม่พบ LINE user ของลูกค้าคนนี้"
          );
        }

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
          Deno.env.get("LINE_LIFF_ID");

        if (!liffId) {
          throw new Error(
            "LINE_LIFF_ID is missing"
          );
        }

        const relatedMedication =
          getRelatedMedication(
            existingOrder.medications
          );

        const drugName =
          typeof relatedMedication?.drug_name ===
          "string"
            ? relatedMedication.drug_name
            : "ยาของคุณ";

        const strength =
          typeof relatedMedication?.strength ===
            "string" &&
          relatedMedication.strength
            ? ` ${relatedMedication.strength}`
            : "";

        const pickupDate =
          typeof existingOrder.pickup_date ===
          "string"
            ? formatThaiDate(
                existingOrder.pickup_date
              )
            : "-";

        const customerAppUrl =
          `https://liff.line.me/${liffId}`;

        const lineResponse = await fetch(
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
              to: lineUser.line_user_id,
              messages: [
                {
                  type: "template",
                  altText:
                    `ดำเนินการสั่ง ${drugName}${strength} แล้ว`,
                  template: {
                    type: "buttons",
                    title:
                      "ดำเนินการสั่งยาแล้ว",
                    text:
                      `${drugName}${strength}\n` +
                      `นัดรับยา ${pickupDate}`,
                    actions: [
                      {
                        type: "uri",
                        label:
                          "ดูปฏิทินยา",
                        uri:
                          customerAppUrl,
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

          throw new Error(
            `LINE API error: ${detail}`
          );
        }

        lineNotificationSent = true;
      } catch (lineError) {
        lineNotificationError =
          lineError instanceof Error
            ? lineError.message
            : "ส่ง LINE ไม่สำเร็จ";

        console.error(
          "ORDERED LINE NOTIFICATION ERROR:",
          lineError
        );
      }

      return json({
        success: true,
        order,
        document_path:
          storagePath,
        line_notification_sent:
          lineNotificationSent,
        line_notification_error:
          lineNotificationError,
      });
    }

    // ====================================
    // ACTION 6 : SAVE ORDER DOCUMENT
    // ผูก URL/Path รูปใบยืนยันสั่งซื้อกับ order
    // ====================================

    if (body.action === "save_order_document") {
      const {
        order_id,
        document_url,
      } = body;

      if (!order_id || !document_url) {
        return json(
          {
            error:
              "กรุณาระบุ order_id และ document_url",
          },
          400
        );
      }

      const {
        data: existingOrder,
        error: existingOrderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          status,
          customer_id,
          customers (
            branch_name
          )
        `)
        .eq("id", order_id)
        .maybeSingle();

      if (existingOrderError) {
        throw existingOrderError;
      }

      if (!existingOrder) {
        return json(
          {
            error: "ไม่พบรายการสั่งยานี้",
          },
          404
        );
      }

      const relatedCustomer =
        getRelatedCustomer(
          existingOrder.customers
        ) as {
          branch_name?: string | null;
        } | null;

      if (
        pharmacist.branch_name &&
        relatedCustomer?.branch_name !==
          pharmacist.branch_name
      ) {
        return json(
          {
            error:
              "คุณไม่มีสิทธิ์ดำเนินการรายการของสาขาอื่น",
          },
          403
        );
      }

      if (existingOrder.status !== "confirmed") {
        return json(
          {
            error:
              "บันทึกเอกสารได้เฉพาะรายการที่ลูกค้ายืนยันแล้ว",
          },
          409
        );
      }

      const {
        data: order,
        error,
      } = await supabase
        .from("medication_orders")
        .update({
          order_document_url:
            document_url,
        })
        .eq("id", order_id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return json({
        success: true,
        order,
      });
    }

    // ====================================
    // ACTION 7 : MARK ORDERED
    // confirmed -> ordered
    // ====================================

    if (body.action === "mark_ordered") {
      const { order_id } = body;

      if (!order_id) {
        return json(
          {
            error: "Missing order_id",
          },
          400
        );
      }

      const {
        data: existingOrder,
        error: existingOrderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          status,
          customer_id,
          order_document_url,
          customers (
            branch_name
          )
        `)
        .eq("id", order_id)
        .maybeSingle();

      if (existingOrderError) {
        throw existingOrderError;
      }

      if (!existingOrder) {
        return json(
          {
            error: "ไม่พบรายการสั่งยานี้",
          },
          404
        );
      }

      const relatedCustomer =
        getRelatedCustomer(
          existingOrder.customers
        ) as {
          branch_name?: string | null;
        } | null;

      if (
        pharmacist.branch_name &&
        relatedCustomer?.branch_name !==
          pharmacist.branch_name
      ) {
        return json(
          {
            error:
              "คุณไม่มีสิทธิ์ดำเนินการรายการของสาขาอื่น",
          },
          403
        );
      }

      if (existingOrder.status !== "confirmed") {
        return json(
          {
            error:
              "รายการนี้ไม่ได้อยู่ในสถานะ confirmed",
          },
          409
        );
      }

      if (!existingOrder.order_document_url) {
        return json(
          {
            error:
              "กรุณาแนบใบยืนยันสั่งซื้อก่อน",
          },
          400
        );
      }

      const {
        data: order,
        error,
      } = await supabase
        .from("medication_orders")
        .update({
          status: "ordered",
          ordered_at:
            new Date().toISOString(),
        })
        .eq("id", order_id)
        .eq("status", "confirmed")
        .select()
        .single();

      if (error) {
        throw error;
      }

      return json({
        success: true,
        order,
      });
    }

    // ====================================
    // ACTION 8 : MARK READY
    // ordered -> ready + แจ้งลูกค้าทาง LINE
    // ====================================

    if (body.action === "mark_ready") {
      const { order_id } = body;

      if (!order_id) {
        return json(
          { error: "Missing order_id" },
          400
        );
      }

      const {
        data: existingOrder,
        error: existingOrderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          status,
          customer_id,
          pickup_date,
          customers (
            branch_name
          ),
          medications (
            drug_name,
            strength
          )
        `)
        .eq("id", order_id)
        .maybeSingle();

      if (existingOrderError) {
        throw existingOrderError;
      }

      if (!existingOrder) {
        return json(
          { error: "ไม่พบรายการสั่งยานี้" },
          404
        );
      }

      const relatedCustomer =
        getRelatedCustomer(
          existingOrder.customers
        ) as {
          branch_name?: string | null;
        } | null;

      if (
        pharmacist.branch_name &&
        relatedCustomer?.branch_name !==
          pharmacist.branch_name
      ) {
        return json(
          {
            error:
              "คุณไม่มีสิทธิ์ดำเนินการรายการของสาขาอื่น",
          },
          403
        );
      }

      if (existingOrder.status !== "ordered") {
        return json(
          {
            error:
              "รายการนี้ไม่ได้อยู่ในสถานะ ordered",
          },
          409
        );
      }

      const {
        data: order,
        error: updateError,
      } = await supabase
        .from("medication_orders")
        .update({
          status: "ready",
          ready_at:
            new Date().toISOString(),
        })
        .eq("id", order_id)
        .eq("status", "ordered")
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      let lineNotificationSent = false;
      let lineNotificationError:
        string | null = null;

      try {
        const {
          data: lineUser,
          error: lineUserError,
        } = await supabase
          .from("line_users")
          .select(
            "line_user_id, display_name, status"
          )
          .eq(
            "customer_id",
            existingOrder.customer_id
          )
          .eq("status", "active")
          .maybeSingle();

        if (lineUserError) {
          throw lineUserError;
        }

        if (!lineUser?.line_user_id) {
          throw new Error(
            "ไม่พบ LINE user ของลูกค้าคนนี้"
          );
        }

        const accessToken =
          Deno.env.get(
            "LINE_CHANNEL_ACCESS_TOKEN"
          );

        const liffId =
          Deno.env.get("LINE_LIFF_ID");

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

        const medication =
          getRelatedMedication(
            existingOrder.medications
          );

        const drugName =
          typeof medication?.drug_name ===
          "string"
            ? medication.drug_name
            : "ยาของคุณ";

        const strength =
          typeof medication?.strength ===
            "string" &&
          medication.strength
            ? ` ${medication.strength}`
            : "";

        const pickupDate =
          typeof existingOrder.pickup_date ===
          "string"
            ? formatThaiDate(
                existingOrder.pickup_date
              )
            : "-";

        const lineResponse = await fetch(
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
              to: lineUser.line_user_id,
              messages: [
                {
                  type: "template",
                  altText:
                    `${drugName}${strength} พร้อมรับแล้ว`,
                  template: {
                    type: "buttons",
                    title:
                      "ยาพร้อมรับแล้ว",
                    text:
                      `${drugName}${strength}\n` +
                      `นัดรับยา ${pickupDate}`,
                    actions: [
                      {
                        type: "uri",
                        label:
                          "ดูรายละเอียด",
                        uri:
                          `https://liff.line.me/${liffId}`,
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

          throw new Error(
            `LINE API error: ${detail}`
          );
        }

        lineNotificationSent = true;
      } catch (lineError) {
        lineNotificationError =
          lineError instanceof Error
            ? lineError.message
            : "ส่ง LINE ไม่สำเร็จ";

        console.error(
          "READY LINE NOTIFICATION ERROR:",
          lineError
        );
      }

      return json({
        success: true,
        order,
        line_notification_sent:
          lineNotificationSent,
        line_notification_error:
          lineNotificationError,
      });
    }
    // ====================================
    // ACTION 9 : MARK PICKED UP
    // ready -> picked_up
    // ต้องมีราคาขายจริง + ใบเสร็จ
    // ====================================

    if (body.action === "mark_picked_up") {
      const {
        order_id,
        actual_price,
        receipt_file_base64,
        receipt_file_name,
        receipt_content_type,
      } = body;

      if (!order_id) {
        return json(
          {
            error: "Missing order_id",
          },
          400
        );
      }

      const parsedPrice =
        Number(actual_price);

      if (
        actual_price === undefined ||
        actual_price === null ||
        actual_price === "" ||
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0
      ) {
        return json(
          {
            error:
              "กรุณากรอกราคาขายจริงให้ถูกต้อง",
          },
          400
        );
      }

      if (!receipt_file_base64) {
        return json(
          {
            error:
              "กรุณาแนบรูปใบเสร็จ",
          },
          400
        );
      }

      const {
        data: existingOrder,
        error: existingOrderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          status,
          customer_id,
          medication_id,
          customers (
            branch_name
          )
        `)
        .eq("id", order_id)
        .maybeSingle();

      if (existingOrderError) {
        throw existingOrderError;
      }

      if (!existingOrder) {
        return json(
          {
            error:
              "ไม่พบรายการสั่งยานี้",
          },
          404
        );
      }

      const relatedCustomer =
        getRelatedCustomer(
          existingOrder.customers
        ) as {
          branch_name?: string | null;
        } | null;

      if (
        pharmacist.branch_name &&
        relatedCustomer?.branch_name !==
          pharmacist.branch_name
      ) {
        return json(
          {
            error:
              "คุณไม่มีสิทธิ์ดำเนินการรายการของสาขาอื่น",
          },
          403
        );
      }

      if (
        existingOrder.status !== "ready"
      ) {
        return json(
          {
            error:
              "รายการนี้ไม่ได้อยู่ในสถานะยาพร้อมรับ",
            status:
              existingOrder.status,
          },
          409
        );
      }

      const normalizedBase64 =
        String(receipt_file_base64)
          .replace(
            /^data:.*?;base64,/,
            ""
          );

      let fileBytes: Uint8Array;

      try {
        fileBytes =
          decodeBase64ToUint8Array(
            normalizedBase64
          );
      } catch {
        return json(
          {
            error:
              "ไฟล์ใบเสร็จไม่ถูกต้อง",
          },
          400
        );
      }

      if (
        fileBytes.byteLength >
        10 * 1024 * 1024
      ) {
        return json(
          {
            error:
              "ไฟล์ใบเสร็จต้องมีขนาดไม่เกิน 10 MB",
          },
          400
        );
      }

      const safeExtension =
        getSafeExtension(
          receipt_file_name ||
            "receipt.jpg",
          receipt_content_type ||
            "image/jpeg"
        );

      const storagePath =
        `${existingOrder.customer_id}/` +
        `${order_id}/` +
        `receipt-${Date.now()}.${safeExtension}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from("receipts")
        .upload(
          storagePath,
          fileBytes,
          {
            contentType:
              receipt_content_type ||
              "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: order,
        error: updateError,
      } = await supabase
        .from("medication_orders")
        .update({
          status: "picked_up",
          picked_up_at:
            new Date().toISOString(),
          actual_price:
            parsedPrice,
          receipt_document_url:
            storagePath,
        })
        .eq("id", order_id)
        .eq("status", "ready")
        .select()
        .maybeSingle();

      if (updateError) {
        await supabase.storage
          .from("receipts")
          .remove([storagePath]);

        throw updateError;
      }

      if (!order) {
        await supabase.storage
          .from("receipts")
          .remove([storagePath]);

        return json(
          {
            error:
              "สถานะรายการมีการเปลี่ยนแปลง กรุณาโหลดใหม่อีกครั้ง",
          },
          409
        );
      }

      // ====================================
      // แจ้งลูกค้าทาง LINE หลังรับยาเรียบร้อย
      // ====================================

      let lineNotificationSent = false;
      let lineNotificationError:
        string | null = null;

      try {
        const {
          data: lineUser,
          error: lineUserError,
        } = await supabase
          .from("line_users")
          .select(
            "line_user_id, display_name, status"
          )
          .eq(
            "customer_id",
            existingOrder.customer_id
          )
          .eq("status", "active")
          .maybeSingle();

        if (lineUserError) {
          throw lineUserError;
        }

        if (!lineUser?.line_user_id) {
          throw new Error(
            "ไม่พบ LINE user ของลูกค้าคนนี้"
          );
        }

        const accessToken =
          Deno.env.get(
            "LINE_CHANNEL_ACCESS_TOKEN"
          );

        const liffId =
          Deno.env.get("LINE_LIFF_ID");

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

        const {
          data: medication,
          error: medicationError,
        } = await supabase
          .from("medications")
          .select(
            "drug_name, strength"
          )
          .eq(
            "id",
            existingOrder.medication_id
          )
          .maybeSingle();

        if (medicationError) {
          throw medicationError;
        }

        const drugName =
          medication?.drug_name ||
          "ยาของคุณ";

        const strength =
          medication?.strength
            ? ` ${medication.strength}`
            : "";

        const customerAppUrl =
          `https://liff.line.me/${liffId}`;

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
                      `รับ ${drugName}${strength} เรียบร้อยแล้ว`,

                    template: {
                      type: "buttons",

                      title:
                        "รับยาเรียบร้อยแล้ว",

                      text:
                        `${drugName}${strength}\n` +
                        `รับยาเรียบร้อยแล้ว\n` +
                        `ติดตามรอบถัดไปในปฏิทินยา`,

                      actions: [
                        {
                          type: "uri",

                          label:
                            "ดูปฏิทินยา",

                          uri:
                            customerAppUrl,
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

          throw new Error(
            `LINE API error: ${detail}`
          );
        }

        lineNotificationSent = true;
      } catch (lineError) {
        lineNotificationError =
          lineError instanceof Error
            ? lineError.message
            : "ส่ง LINE ไม่สำเร็จ";

        console.error(
          "PICKED UP LINE NOTIFICATION ERROR:",
          lineError
        );
      }

      return json({
        success: true,

        message:
          "บันทึกการรับยาเรียบร้อย",

        order,

        line_notification_sent:
          lineNotificationSent,

        line_notification_error:
          lineNotificationError,
      });
    }

    // ====================================
    // ACTION 9 : GET ORDER DOCUMENT SIGNED URL
    // สร้าง signed URL ชั่วคราวสำหรับดูเอกสารย้อนหลัง
    // ====================================

    if (body.action === "get_order_document_url") {
      const { order_id } = body;

      if (!order_id) {
        return json(
          { error: "Missing order_id" },
          400
        );
      }

      const {
        data: existingOrder,
        error: existingOrderError,
      } = await supabase
        .from("medication_orders")
        .select(`
          id,
          customer_id,
          order_document_url,
          customers (
            branch_name
          )
        `)
        .eq("id", order_id)
        .maybeSingle();

      if (existingOrderError) {
        throw existingOrderError;
      }

      if (!existingOrder) {
        return json(
          { error: "ไม่พบรายการสั่งยานี้" },
          404
        );
      }

      if (!existingOrder.order_document_url) {
        return json(
          { error: "รายการนี้ยังไม่มีเอกสาร" },
          404
        );
      }

      const relatedCustomer =
        getRelatedCustomer(
          existingOrder.customers
        ) as {
          branch_name?: string | null;
        } | null;

      if (
        pharmacist.branch_name &&
        relatedCustomer?.branch_name !==
          pharmacist.branch_name
      ) {
        return json(
          {
            error:
              "คุณไม่มีสิทธิ์ดูเอกสารของสาขาอื่น",
          },
          403
        );
      }

      const {
        data: signedData,
        error: signedError,
      } = await supabase.storage
        .from("order-documents")
        .createSignedUrl(
          existingOrder.order_document_url,
          60 * 10
        );

      if (signedError) {
        throw signedError;
      }

      return json({
        success: true,
        signed_url:
          signedData.signedUrl,
      });
    }
    // ====================================
    // ACTION : SAVE PUSH SUBSCRIPTION
    // ====================================

    if (body.action === "save_push_subscription") {
      const {
        subscription,
        user_agent,
      } = body;

      if (
        !subscription?.endpoint ||
        !subscription?.keys?.p256dh ||
        !subscription?.keys?.auth
      ) {
        return json(
          {
            error:
              "Push subscription ไม่ครบถ้วน",
          },
          400
        );
      }

      const {
        data: savedSubscription,
        error: saveError,
      } = await supabase
        .from(
          "pharmacist_push_subscriptions"
        )
        .upsert(
          {
            pharmacist_id:
              pharmacist.id,

            endpoint:
              subscription.endpoint,

            p256dh:
              subscription.keys.p256dh,

            auth:
              subscription.keys.auth,

            user_agent:
              user_agent || null,

            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          }
        )
        .select()
        .single();

      if (saveError) {
        throw saveError;
      }

      return json({
        success: true,
        subscription:
          savedSubscription,
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
function getRelatedCustomer(
  customers: unknown
): Record<string, unknown> | null {
  if (Array.isArray(customers)) {
    return (
      (customers[0] as Record<string, unknown>) ||
      null
    );
  }

  if (
    customers &&
    typeof customers === "object"
  ) {
    return customers as Record<string, unknown>;
  }

  return null;
}

function decodeBase64ToUint8Array(
  base64: string
) {
  const binary = atob(base64);
  const bytes =
    new Uint8Array(binary.length);

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

function getSafeExtension(
  fileName?: string,
  contentType?: string
) {
  const fromName =
    fileName
      ?.split(".")
      .pop()
      ?.toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        ""
      );

  if (
    fromName &&
    fromName.length <= 5
  ) {
    return fromName;
  }

  const map: Record<
    string,
    string
  > = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  return (
    map[contentType || ""] ||
    "jpg"
  );
}

function getRelatedMedication(
  medications: unknown
): Record<string, unknown> | null {
  if (Array.isArray(medications)) {
    return (
      (medications[0] as Record<
        string,
        unknown
      >) || null
    );
  }

  if (
    medications &&
    typeof medications === "object"
  ) {
    return medications as Record<
      string,
      unknown
    >;
  }

  return null;
}

function formatThaiDate(
  dateString: string
) {
  const [year, month, day] =
    dateString
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

async function uploadPrescriptionDocument({
  supabase,
  customerId,
  medicationId,
  fileBase64,
  fileName,
  contentType,
}: {
  supabase: any;
  customerId: string;
  medicationId: string;
  fileBase64: string;
  fileName?: string | null;
  contentType?: string | null;
}) {
  const normalizedBase64 =
    String(fileBase64).includes(",")
      ? String(fileBase64)
          .split(",")
          .pop()!
      : String(fileBase64);

  let fileBytes: Uint8Array;

  try {
    fileBytes =
      decodeBase64ToUint8Array(
        normalizedBase64
      );
  } catch {
    throw new Error(
      "ไม่สามารถอ่านไฟล์ใบสั่งแพทย์ได้"
    );
  }

  if (
    fileBytes.byteLength >
    10 * 1024 * 1024
  ) {
    throw new Error(
      "ไฟล์ใบสั่งแพทย์ต้องมีขนาดไม่เกิน 10 MB"
    );
  }

  const safeExtension =
    getSafeExtension(
      fileName || "prescription.jpg",
      contentType || "image/jpeg"
    );

  const storagePath =
    `${customerId}/${medicationId}/` +
    `${Date.now()}.${safeExtension}`;

  const {
    error: uploadError,
  } = await supabase.storage
    .from("prescriptions")
    .upload(
      storagePath,
      fileBytes,
      {
        contentType:
          contentType ||
          "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      }
    );

  if (uploadError) {
    throw uploadError;
  }

  return storagePath;
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