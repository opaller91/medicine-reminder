import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  getPendingLineUsers,
  getAllCustomers,
  linkCustomer,
  addMedication,
  getConfirmedOrders,
  uploadOrderDocument,
  getOrderDocumentUrl,
  markReady,
  markPickedUp,
} from "./adminApi";

function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [confirmedOrders, setConfirmedOrders] = useState([]);
  const [pharmacist, setPharmacist] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const result = await getPendingLineUsers();

      setUsers(result.users || []);
      setPharmacist(result.pharmacist);
    } catch (err) {
      setError(err?.message || "ไม่สามารถโหลดลูกค้ารอเชื่อมได้");
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      setLoading(true);
      setError("");

      const result = await getAllCustomers();

      setCustomers(result.customers || []);
      setPharmacist(result.pharmacist);
    } catch (err) {
      setError(err?.message || "ไม่สามารถโหลดข้อมูลลูกค้าได้");
    } finally {
      setLoading(false);
    }
  }

  async function loadConfirmedOrders() {
    try {
      setLoading(true);
      setError("");

      const result =
        await getConfirmedOrders();

      setConfirmedOrders(
        result.orders || []
      );

      setPharmacist(
        result.pharmacist
      );
    } catch (err) {
      setError(
        err?.message ||
          "ไม่สามารถโหลดงานรอดำเนินการได้"
      );
    } finally {
      setLoading(false);
    }
  }

  async function changeTab(tab) {
    setActiveTab(tab);

    if (tab === "pending") {
      await loadUsers();
    }

    if (tab === "customers") {
      await loadCustomers();
    }

    if (tab === "orders") {
      await loadConfirmedOrders();
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <small style={styles.muted}>Tata Medication</small>

          <h2 style={{ margin: "2px 0" }}>
            {activeTab === "pending"
              ? "ลูกค้ารอเชื่อม"
              : activeTab === "orders"
              ? "งานรอดำเนินการ"
              : "ลูกค้าทั้งหมด"}
          </h2>

          {pharmacist && (
            <small style={styles.muted}>
              {pharmacist.full_name}
              {pharmacist.branch_name
                ? ` • ${pharmacist.branch_name}`
                : ""}
            </small>
          )}
        </div>

        <button onClick={logout} style={styles.logout}>
          ออกจากระบบ
        </button>
      </header>

      <div style={styles.tabs}>
        <button
          type="button"
          onClick={() => changeTab("pending")}
          style={{
            ...styles.tab,
            ...(activeTab === "pending"
              ? styles.activeTab
              : {}),
          }}
        >
          รอเชื่อม
          {users.length > 0 && (
            <span style={styles.tabBadge}>{users.length}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => changeTab("orders")}
          style={{
            ...styles.tab,
            ...(activeTab === "orders"
              ? styles.activeTab
              : {}),
          }}
        >
          งานรอดำเนินการ

          {confirmedOrders.length > 0 && (
            <span style={styles.tabBadge}>
              {confirmedOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => changeTab("customers")}
          style={{
            ...styles.tab,
            ...(activeTab === "customers"
              ? styles.activeTab
              : {}),
          }}
        >
          ลูกค้าทั้งหมด
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loadingBox}>กำลังโหลดข้อมูล...</div>
      ) : (
        <>
          {activeTab === "pending" && (
            <>
              <div style={styles.summary}>
                <strong style={styles.summaryNumber}>
                  {users.length}
                </strong>
                <span>ลูกค้ารอเภสัชกรเชื่อมข้อมูล</span>
              </div>

              {users.length === 0 ? (
                <div style={styles.empty}>
                  <div style={{ fontSize: 30 }}>✓</div>
                  <strong>ไม่มีลูกค้ารอเชื่อม</strong>
                  <span style={styles.muted}>
                    เมื่อลูกค้าเปิด LIFF รายชื่อจะปรากฏที่นี่
                  </span>
                </div>
              ) : (
                <div style={styles.list}>
                  {users.map((user) => (
                    <div key={user.id} style={styles.customer}>
                      {user.picture_url ? (
                        <img
                          src={user.picture_url}
                          alt=""
                          style={styles.avatar}
                        />
                      ) : (
                        <div style={styles.avatarPlaceholder}>L</div>
                      )}

                      <div style={styles.customerInfo}>
                        <strong>
                          {user.display_name || "ไม่พบชื่อ LINE"}
                        </strong>
                        <span style={styles.pending}>
                          ● รอเชื่อมข้อมูล
                        </span>
                      </div>

                      <button
                        style={styles.linkButton}
                        onClick={() => setSelectedUser(user)}
                      >
                        เชื่อมข้อมูล
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "orders" && (
            <ConfirmedOrderList
              orders={confirmedOrders}
              onRefresh={loadConfirmedOrders}
            />
          )}

          {activeTab === "customers" && (
            <CustomerList
              customers={customers}
              onRefresh={loadCustomers}
            />
          )}
        </>
      )}

      {selectedUser && (
        <CustomerLinkForm
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSaved={async () => {
            setSelectedUser(null);
            await loadUsers();
          }}
        />
      )}
    </div>
  );
}

function ConfirmedOrderList({
  orders,
  onRefresh,
}) {
  if (orders.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={{ fontSize: 30 }}>✓</div>
        <strong>ไม่มีงานรอดำเนินการ</strong>
        <span style={styles.muted}>
          เมื่อลูกค้ายืนยันสั่งยา หรือมีรายการรอยาพร้อมรับ
          รายการจะปรากฏที่นี่
        </span>
      </div>
    );
  }

  const confirmedCount = orders.filter(
    (order) => order.status === "confirmed"
  ).length;

  const orderedCount = orders.filter(
    (order) => order.status === "ordered"
  ).length;

  const readyCount = orders.filter(
    (order) => order.status === "ready"
  ).length;

  return (
    <>
      <div style={styles.summary}>
        <strong style={styles.summaryNumber}>
          {orders.length}
        </strong>
        <span>
          งานรอดำเนินการ • รอสั่งยา {confirmedCount} • รอยาพร้อม {orderedCount} • รอลูกค้ารับ {readyCount}
        </span>
      </div>

      <div style={styles.list}>
        {orders.map((order) => {
          if (order.status === "ready") {
            return (
              <PickupOrderCard
                key={order.id}
                order={order}
                onSaved={onRefresh}
              />
            );
          }

          if (order.status === "ordered") {
            return (
              <ReadyOrderCard
                key={order.id}
                order={order}
                onSaved={onRefresh}
              />
            );
          }

          return (
            <ConfirmedOrderCard
              key={order.id}
              order={order}
              onSaved={onRefresh}
            />
          );
        })}
      </div>
    </>
  );
}

function ReadyOrderCard({
  order,
  onSaved,
}) {
  const customer = getRelatedItem(order.customers);
  const medication = getRelatedItem(order.medications);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submitReady() {
    const confirmed = window.confirm(
      "ยืนยันว่ารายการยานี้พร้อมให้ลูกค้ารับแล้วใช่หรือไม่?"
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");

      const result = await markReady(order.id);

      if (result?.line_notification_sent === false) {
        alert(
          "เปลี่ยนสถานะเป็นยาพร้อมรับแล้ว แต่ส่ง LINE ไม่สำเร็จ" +
            (result?.line_notification_error
              ? `\n${result.line_notification_error}`
              : "")
        );
      } else {
        alert("ยาพร้อมรับแล้ว และแจ้งลูกค้าทาง LINE เรียบร้อย");
      }

      await onSaved();
    } catch (err) {
      console.error("MARK READY ERROR:", err);
      setError(
        err?.message || "ไม่สามารถเปลี่ยนสถานะเป็นยาพร้อมรับได้"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.orderTaskCard}>
      <div style={styles.orderTaskHeader}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <small style={styles.muted}>สั่งยาเรียบร้อยแล้ว</small>
          <h3 style={styles.orderTaskTitle}>
            {customer?.full_name || "ไม่พบชื่อลูกค้า"}
          </h3>
          <div style={styles.muted}>
            {customer?.phone || "-"}
          </div>
        </div>

        <span style={styles.orderedBadge}>
          รอยาพร้อม
        </span>
      </div>

      <div style={styles.orderDrugBox}>
        <strong>
          {medication?.drug_name || "ไม่พบชื่อยา"}
          {medication?.strength
            ? ` ${medication.strength}`
            : ""}
        </strong>
        <span>จำนวน {medication?.quantity ?? "-"}</span>
        <span>
          วิธีใช้ {medication?.dosage_instruction || "-"}
        </span>
      </div>

      <div style={styles.orderTaskDates}>
        <div>
          <span style={styles.orderLabel}>สั่งยาเมื่อ</span>
          <strong>
            {formatThaiDateTime(order.ordered_at)}
          </strong>
        </div>
        <div>
          <span style={styles.orderLabel}>นัดรับยา</span>
          <strong>
            {formatThaiDate(order.pickup_date)}
          </strong>
        </div>
      </div>

      {error && (
        <div style={{ ...styles.error, marginTop: 12 }}>
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={submitReady}
        style={{
          ...styles.readyButton,
          ...(saving ? styles.disabledButton : {}),
        }}
      >
        {saving ? "กำลังบันทึก..." : "✓ ยาพร้อมรับ"}
      </button>
    </div>
  );
}


function PickupOrderCard({
  order,
  onSaved,
}) {
  const customer =
    getRelatedItem(order.customers);

  const medication =
    getRelatedItem(order.medications);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  async function submitPickedUp() {
    const confirmed =
      window.confirm(
        "ยืนยันว่าลูกค้ารับยารายการนี้เรียบร้อยแล้วใช่หรือไม่?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      await markPickedUp(
        order.id
      );

      alert(
        "บันทึกว่าลูกค้ารับยาเรียบร้อยแล้ว"
      );

      await onSaved();
    } catch (err) {
      console.error(
        "MARK PICKED UP ERROR:",
        err
      );

      setError(
        err?.message ||
          "ไม่สามารถบันทึกการรับยาได้"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.orderTaskCard}>
      <div
        style={styles.orderTaskHeader}
      >
        <div
          style={{
            minWidth: 0,
            flex: 1,
          }}
        >
          <small style={styles.muted}>
            ยาพร้อมให้ลูกค้ารับ
          </small>

          <h3
            style={
              styles.orderTaskTitle
            }
          >
            {customer?.full_name ||
              "ไม่พบชื่อลูกค้า"}
          </h3>

          <div style={styles.muted}>
            {customer?.phone || "-"}
          </div>
        </div>

        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "#e8f7f4",
            color: "#238a72",
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          พร้อมรับ
        </span>
      </div>

      <div style={styles.orderDrugBox}>
        <strong>
          {medication?.drug_name ||
            "ไม่พบชื่อยา"}

          {medication?.strength
            ? ` ${medication.strength}`
            : ""}
        </strong>

        <span>
          จำนวน{" "}
          {medication?.quantity ?? "-"}
        </span>

        <span>
          วิธีใช้{" "}
          {medication
            ?.dosage_instruction ||
            "-"}
        </span>
      </div>

      <div
        style={styles.orderTaskDates}
      >
        <div>
          <span
            style={styles.orderLabel}
          >
            ยาพร้อมเมื่อ
          </span>

          <strong>
            {formatThaiDateTime(
              order.ready_at
            )}
          </strong>
        </div>

        <div>
          <span
            style={styles.orderLabel}
          >
            นัดรับยา
          </span>

          <strong>
            {formatThaiDate(
              order.pickup_date
            )}
          </strong>
        </div>
      </div>

      {error && (
        <div
          style={{
            ...styles.error,
            marginTop: 12,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={submitPickedUp}
        style={{
          ...styles.readyButton,
          ...(saving
            ? styles.disabledButton
            : {}),
          background: "#238a72",
        }}
      >
        {saving
          ? "กำลังบันทึก..."
          : "✓ ลูกค้ารับยาแล้ว"}
      </button>
    </div>
  );
}

function ConfirmedOrderCard({
  order,
  onSaved,
}) {
  const customer = getRelatedItem(order.customers);
  const medication = getRelatedItem(order.medications);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function selectFile(e) {
    const selected = e.target.files?.[0] || null;
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (selected.size > maxSize) {
      setError("ไฟล์รูปต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError("");
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function submitDocument() {
    if (!file) {
      setError("กรุณาแนบรูปใบยืนยันสั่งซื้อ");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await uploadOrderDocument({ order_id: order.id, file });

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl("");
      alert("บันทึกใบยืนยันและส่งคำสั่งซื้อเรียบร้อย");
      await onSaved();
    } catch (err) {
      console.error("ORDER DOCUMENT ERROR:", err);
      setError(err?.message || "ไม่สามารถบันทึกเอกสารได้");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.orderTaskCard}>
      <div style={styles.orderTaskHeader}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <small style={styles.muted}>ลูกค้ายืนยันแล้ว</small>
          <h3 style={styles.orderTaskTitle}>
            {customer?.full_name || "ไม่พบชื่อลูกค้า"}
          </h3>
          <div style={styles.muted}>{customer?.phone || "-"}</div>
        </div>
        <span style={styles.confirmedBadge}>ยืนยันแล้ว</span>
      </div>

      <div style={styles.orderDrugBox}>
        <strong>
          {medication?.drug_name || "ไม่พบชื่อยา"}
          {medication?.strength ? ` ${medication.strength}` : ""}
        </strong>
        <span>จำนวน {medication?.quantity ?? "-"}</span>
        <span>วิธีใช้ {medication?.dosage_instruction || "-"}</span>
      </div>

      <div style={styles.orderTaskDates}>
        <div>
          <span style={styles.orderLabel}>ลูกค้ายืนยัน</span>
          <strong>{formatThaiDateTime(order.confirmed_at)}</strong>
        </div>
        <div>
          <span style={styles.orderLabel}>นัดรับยา</span>
          <strong>{formatThaiDate(order.pickup_date)}</strong>
        </div>
      </div>

      <div style={styles.documentArea}>
        <div style={styles.documentHeading}>
          <div>
            <strong>ใบยืนยันสั่งซื้อยา</strong>
            <div style={styles.muted}>ถ่ายรูปหรือเลือกภาพเอกสาร</div>
          </div>
          <label style={styles.uploadButton}>
            {file ? "เปลี่ยนรูป" : "แนบรูป"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={selectFile}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {previewUrl ? (
          <div style={styles.previewWrap}>
            <img
              src={previewUrl}
              alt="ตัวอย่างใบยืนยันสั่งซื้อ"
              style={styles.previewImage}
            />
            <div style={styles.previewName}>{file?.name}</div>
          </div>
        ) : (
          <div style={styles.noDocument}>ยังไม่ได้แนบรูป</div>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <button
        type="button"
        disabled={!file || saving}
        onClick={submitDocument}
        style={{
          ...styles.submitOrderButton,
          ...((!file || saving) ? styles.disabledButton : {}),
        }}
      >
        {saving ? "กำลังบันทึก..." : "ยืนยันส่งคำสั่งซื้อ"}
      </button>
    </div>
  );
}

function getRelatedItem(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function formatThaiDateTime(
  dateString
) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(
    dateString
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      day: "numeric",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone:
        "Asia/Bangkok",
    }
  ).format(date);
}

function CustomerList({
  customers,
  onRefresh,
}) {
  const [
    selectedCustomer,
    setSelectedCustomer,
  ] = useState(null);

  const [
    detailCustomer,
    setDetailCustomer,
  ] = useState(null);

  if (customers.length === 0) {
    return (
      <div style={styles.empty}>
        <strong>ยังไม่มีลูกค้า</strong>
        <span style={styles.muted}>
          เมื่อลูกค้าถูกเชื่อมแล้ว รายชื่อจะปรากฏที่นี่
        </span>
      </div>
    );
  }

  return (
    <>
      <div style={styles.list}>
        {customers.map((customer) => {
          const line =
            customer.line_users?.[0] || null;

          const medications =
            customer.medications || [];

          return (
            <div
              key={customer.id}
              style={styles.customerDetailCard}
            >
              <div style={styles.customerTop}>
                {line?.picture_url ? (
                  <img
                    src={line.picture_url}
                    alt=""
                    style={styles.avatar}
                  />
                ) : (
                  <div style={styles.avatarPlaceholder}>
                    L
                  </div>
                )}

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <strong>
                    {customer.full_name || "-"}
                  </strong>

                  <div style={styles.muted}>
                    LINE:{" "}
                    {line?.display_name || "-"}
                  </div>

                  <div style={styles.muted}>
                    {customer.phone || "-"}
                  </div>
                </div>

                <OrderStatus
                  status={
                    getLatestOrder(
                      medications
                    )?.status
                  }
                />
              </div>

              <div style={styles.customerActions}>
                <button
                  type="button"
                  style={styles.detailButton}
                  onClick={() =>
                    setDetailCustomer(customer)
                  }
                >
                  ดูรายละเอียด
                </button>

                <button
                  type="button"
                  style={styles.addMedicationButton}
                  onClick={() =>
                    setSelectedCustomer(customer)
                  }
                >
                  ＋ เพิ่มยา
                </button>
              </div>

              {medications.length === 0 ? (
                <div style={styles.noMedication}>
                  ยังไม่มีข้อมูลยา
                </div>
              ) : (
                medications.map(
                  (medication) => {
                    const order =
                      medication.latest_order ||
                      null;

                    return (
                      <div
                        key={medication.id}
                        style={
                          styles.medicationSection
                        }
                      >
                        <div
                          style={
                            styles.medicationBox
                          }
                        >
                          <strong>
                            {
                              medication.drug_name
                            }
                            {medication.strength
                              ? ` ${medication.strength}`
                              : ""}
                          </strong>

                          <span>
                            {medication.dosage_instruction ||
                              "-"}
                          </span>
                        </div>

                        {order && (
                          <div
                            style={
                              styles.orderInfo
                            }
                          >
                            <div
                              style={
                                styles.orderInfoItem
                              }
                            >
                              <span
                                style={
                                  styles.orderLabel
                                }
                              >
                                วันเตือนยืนยัน
                              </span>

                              <strong>
                                {formatThaiDate(
                                  order.confirm_reminder_date
                                )}
                              </strong>
                            </div>

                            <div
                              style={
                                styles.orderInfoItem
                              }
                            >
                              <span
                                style={
                                  styles.orderLabel
                                }
                              >
                                วันรับยา
                              </span>

                              <strong>
                                {formatThaiDate(
                                  order.pickup_date
                                )}
                              </strong>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                )
              )}
            </div>
          );
        })}
      </div>

      {detailCustomer && (
        <CustomerDetailModal
          customer={detailCustomer}
          onClose={() =>
            setDetailCustomer(null)
          }
        />
      )}

      {selectedCustomer && (
        <AddMedicationForm
          customer={selectedCustomer}
          onClose={() =>
            setSelectedCustomer(null)
          }
          onSaved={async () => {
            setSelectedCustomer(null);

            if (onRefresh) {
              await onRefresh();
            }
          }}
        />
      )}
    </>
  );
}

function CustomerDetailModal({
  customer,
  onClose,
}) {
  const [
    openingDocument,
    setOpeningDocument,
  ] = useState("");

  const [error, setError] =
    useState("");

  const medications =
    customer.medications || [];

  const history = medications
    .flatMap((medication) => {
      const orders =
        medication.medication_orders ||
        [];

      return orders.map((order) => ({
        ...order,
        medication,
      }));
    })
    .sort((a, b) => {
      const aTime = new Date(
        a.created_at || 0
      ).getTime();

      const bTime = new Date(
        b.created_at || 0
      ).getTime();

      return bTime - aTime;
    });

  async function openDocument(order) {
    if (!order.order_document_url) {
      return;
    }

    try {
      setOpeningDocument(order.id);
      setError("");

      const result =
        await getOrderDocumentUrl(
          order.id
        );

      if (!result?.signed_url) {
        throw new Error(
          "ไม่พบลิงก์เอกสาร"
        );
      }

      window.open(
        result.signed_url,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (err) {
      setError(
        err?.message ||
          "ไม่สามารถเปิดเอกสารได้"
      );
    } finally {
      setOpeningDocument("");
    }
  }

  return (
    <div style={formStyles.overlay}>
      <div style={formStyles.modal}>
        <div style={formStyles.modalHeader}>
          <div>
            <small style={styles.muted}>
              ประวัติลูกค้า
            </small>

            <h2
              style={{
                margin: "3px 0",
              }}
            >
              {customer.full_name}
            </h2>

            <div style={styles.muted}>
              {customer.phone || "-"}
              {customer.branch_name
                ? ` • ${customer.branch_name}`
                : ""}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={formStyles.close}
          >
            ×
          </button>
        </div>

        <SectionTitle>
          ยาปัจจุบัน
        </SectionTitle>

        {medications.length === 0 ? (
          <div style={styles.noMedication}>
            ยังไม่มีข้อมูลยา
          </div>
        ) : (
          medications.map(
            (medication) => {
              const latest =
                medication.latest_order;

              return (
                <div
                  key={medication.id}
                  style={styles.detailMedication}
                >
                  <div>
                    <strong>
                      {medication.drug_name}
                      {medication.strength
                        ? ` ${medication.strength}`
                        : ""}
                    </strong>

                    <div style={styles.muted}>
                      {medication.dosage_instruction ||
                        "-"}
                    </div>
                  </div>

                  <OrderStatus
                    status={latest?.status}
                  />
                </div>
              );
            }
          )
        )}

        <SectionTitle>
          ประวัติการสั่งยา
        </SectionTitle>

        {history.length === 0 ? (
          <div style={styles.noMedication}>
            ยังไม่มีประวัติการสั่งยา
          </div>
        ) : (
          <div style={styles.historyList}>
            {history.map((order) => (
              <div
                key={order.id}
                style={styles.historyItem}
              >
                <div style={styles.historyTop}>
                  <div>
                    <strong>
                      {
                        order.medication
                          .drug_name
                      }
                      {order.medication
                        .strength
                        ? ` ${order.medication.strength}`
                        : ""}
                    </strong>

                    <div style={styles.muted}>
                      นัดรับ{" "}
                      {formatThaiDate(
                        order.pickup_date
                      )}
                    </div>
                  </div>

                  <OrderStatus
                    status={order.status}
                  />
                </div>

                <div style={styles.historyMeta}>
                  <span>
                    สร้างรายการ{" "}
                    {formatThaiDateTime(
                      order.created_at
                    )}
                  </span>

                  {order.confirmed_at && (
                    <span>
                      ยืนยัน{" "}
                      {formatThaiDateTime(
                        order.confirmed_at
                      )}
                    </span>
                  )}

                  {order.ordered_at && (
                    <span>
                      สั่งยา{" "}
                      {formatThaiDateTime(
                        order.ordered_at
                      )}
                    </span>
                  )}
                </div>

                {order.order_document_url && (
                  <button
                    type="button"
                    disabled={
                      openingDocument ===
                      order.id
                    }
                    onClick={() =>
                      openDocument(order)
                    }
                    style={styles.documentViewButton}
                  >
                    {openingDocument ===
                    order.id
                      ? "กำลังเปิด..."
                      : "ดูใบยืนยันสั่งซื้อ"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              ...styles.error,
              marginTop: 12,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function getLatestOrder(medications) {
  const orders = medications
    .map((medication) => medication.latest_order)
    .filter(Boolean);

  if (orders.length === 0) return null;

  return [...orders].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  })[0];
}

function OrderStatus({ status }) {
  const map = {
    waiting_confirmation: {
      text: "รอยืนยัน",
      background: "#fff4dd",
      color: "#b67818",
    },
    confirmed: {
      text: "ยืนยันแล้ว",
      background: "#eaf7f0",
      color: "#25885f",
    },
    ordered: {
      text: "สั่งยาแล้ว",
      background: "#e8f3fb",
      color: "#2a7fa8",
    },
    ready: {
      text: "พร้อมรับ",
      background: "#e8f7f4",
      color: "#238a72",
    },
    picked_up: {
      text: "รับยาแล้ว",
      background: "#eef1f3",
      color: "#68747e",
    },
  };

  const statusStyle =
    map[status] || map.waiting_confirmation;

  return (
    <span
      style={{
        padding: "5px 9px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: statusStyle.background,
        color: statusStyle.color,
      }}
    >
      {statusStyle.text}
    </span>
  );
}

function formatThaiDate(dateString) {
  if (!dateString) return "-";

  const [year, month, day] = dateString.split("-").map(Number);

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function AddMedicationForm({
  customer,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    drug_name: "",
    strength: "",
    quantity: 30,
    dosage_instruction: "",
    start_date: "",
    days_supply: 30,
    pickup_date: "",
    prescription_file: null,
  });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [prescriptionFile, setPrescriptionFile] =
    useState(null);

  const [prescriptionPreviewUrl, setPrescriptionPreviewUrl] =
    useState("");

  function selectPrescriptionFile(e) {
    const selected = e.target.files?.[0] || null;

    if (!selected) {
      setPrescriptionFile(null);

      if (prescriptionPreviewUrl) {
        URL.revokeObjectURL(
          prescriptionPreviewUrl
        );
      }

      setPrescriptionPreviewUrl("");
      return;
    }

    if (!selected.type.startsWith("image/")) {
      setError(
        "ใบสั่งยาจากแพทย์รองรับไฟล์รูปภาพเท่านั้น"
      );
      return;
    }

    const maxSize = 10 * 1024 * 1024;

    if (selected.size > maxSize) {
      setError(
        "ไฟล์ใบสั่งยาต้องมีขนาดไม่เกิน 10 MB"
      );
      return;
    }

    if (prescriptionPreviewUrl) {
      URL.revokeObjectURL(
        prescriptionPreviewUrl
      );
    }

    setError("");
    setPrescriptionFile(selected);
    setPrescriptionPreviewUrl(
      URL.createObjectURL(selected)
    );
  }

  function updateField(e) {
    setForm((current) => ({
      ...current,
      [e.target.name]:
        e.target.value,
    }));
  }

  function calculateDates() {
    if (
      !form.start_date ||
      !form.days_supply
    ) {
      return {
        expectedRunout: "-",
        confirmDate: "-",
      };
    }

    function addDays(
      dateString,
      days
    ) {
      const [
        year,
        month,
        day,
      ] = dateString
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
        date.getUTCDate() +
          Number(days)
      );

      return date
        .toISOString()
        .slice(0, 10);
    }

    function displayDate(
      dateString
    ) {
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

    const expectedRunout =
      addDays(
        form.start_date,
        form.days_supply
      );

    const confirmDate =
      addDays(
        expectedRunout,
        -14
      );

    return {
      expectedRunout:
        displayDate(
          expectedRunout
        ),
      confirmDate:
        displayDate(confirmDate),
    };
  }

  const calculated =
    calculateDates();

  async function submit(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      await addMedication({
        customer_id:
          customer.id,
        drug_name:
          form.drug_name,
        strength:
          form.strength,
        quantity:
          form.quantity === ""
            ? null
            : Number(
                form.quantity
              ),
        dosage_instruction:
          form.dosage_instruction,
        start_date:
          form.start_date,
        days_supply:
          Number(
            form.days_supply
          ),
        pickup_date:
          form.pickup_date,
        prescription_file:
          prescriptionFile,
      });

      alert(
        "เพิ่มยาเรียบร้อย"
      );

      await onSaved();
    } catch (err) {
      console.error(
        "ADD MEDICATION ERROR:",
        err
      );

      setError(
        err?.message ||
          "ไม่สามารถเพิ่มยาได้"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={formStyles.overlay}>
      <div style={formStyles.modal}>
        <div style={formStyles.modalHeader}>
          <div>
            <small style={styles.muted}>
              เพิ่มยาให้ลูกค้า
            </small>

            <h2
              style={{
                margin: "3px 0",
              }}
            >
              {customer.full_name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={formStyles.close}
          >
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <SectionTitle>
            ข้อมูลยา
          </SectionTitle>

          <Field
            label="ชื่อยา"
            name="drug_name"
            value={form.drug_name}
            onChange={updateField}
            placeholder="เช่น Losartan"
            required
          />

          <Field
            label="ความแรง"
            name="strength"
            value={form.strength}
            onChange={updateField}
            placeholder="เช่น 50 mg"
          />

          <Field
            label="จำนวน"
            name="quantity"
            type="number"
            min="1"
            value={form.quantity}
            onChange={updateField}
            required
          />

          <Field
            label="วิธีใช้"
            name="dosage_instruction"
            value={
              form.dosage_instruction
            }
            onChange={updateField}
            placeholder="เช่น 1 เม็ด หลังอาหารเช้า"
          />

          <SectionTitle>
            ใบสั่งยาจากแพทย์
          </SectionTitle>

          <div style={styles.documentArea}>
            <div style={styles.documentHeading}>
              <div>
                <strong>
                  ใบสั่งยาจากแพทย์
                </strong>

                <div style={styles.muted}>
                  ไม่บังคับ • แนบเฉพาะกรณีที่มีเอกสาร
                </div>
              </div>

              <label style={styles.uploadButton}>
                {prescriptionFile
                  ? "เปลี่ยนรูป"
                  : "แนบรูป"}

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={selectPrescriptionFile}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {prescriptionPreviewUrl ? (
              <div style={styles.previewWrap}>
                <img
                  src={prescriptionPreviewUrl}
                  alt="ตัวอย่างใบสั่งยาจากแพทย์"
                  style={styles.previewImage}
                />

                <div style={styles.previewName}>
                  {prescriptionFile?.name}
                </div>
              </div>
            ) : (
              <div style={styles.noDocument}>
                ไม่มีใบสั่งแพทย์ก็สามารถบันทึกยาได้
              </div>
            )}
          </div>

          <SectionTitle>
            รอบการใช้ยา
          </SectionTitle>

          <Field
            label="วันที่เริ่มใช้ยา"
            name="start_date"
            type="date"
            value={form.start_date}
            onChange={updateField}
            required
          />

          <Field
            label="จำนวนวันที่ใช้ได้"
            name="days_supply"
            type="number"
            min="1"
            value={form.days_supply}
            onChange={updateField}
            required
          />

          <Field
            label="วันนัดรับยาครั้งถัดไป"
            name="pickup_date"
            type="date"
            value={form.pickup_date}
            onChange={updateField}
            required
          />

          <div
            style={
              formStyles.calculationBox
            }
          >
            <div>
              <span>
                ยาคาดว่าจะหมด
              </span>

              <strong>
                {
                  calculated.expectedRunout
                }
              </strong>
            </div>

            <div>
              <span>
                แจ้งเตือนยืนยันสั่งยา
              </span>

              <strong>
                {
                  calculated.confirmDate
                }
              </strong>
            </div>

            <small>
              ยารายการนี้จะมี
              Notification และ
              Confirm แยกจากยาอื่น
            </small>
          </div>

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <div style={formStyles.actions}>
            <button
              type="button"
              onClick={onClose}
              style={formStyles.cancel}
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={saving}
              style={formStyles.save}
            >
              {saving
                ? "กำลังบันทึก..."
                : "เพิ่มยา"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerLinkForm({
  user,
  onClose,
  onSaved,
}) {
  const emptyMedication = () => ({
    drug_name: "",
    strength: "",
    quantity: 30,
    dosage_instruction: "",
    start_date: "",
    days_supply: 30,
    pickup_date: "",
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    branch_name: "",
    medications: [emptyMedication()],
  });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  function updateCustomerField(e) {
    setForm((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  }

  function updateMedicationField(index, e) {
    const { name, value } = e.target;

    setForm((current) => ({
      ...current,
      medications: current.medications.map(
        (medication, medicationIndex) =>
          medicationIndex === index
            ? {
                ...medication,
                [name]: value,
              }
            : medication
      ),
    }));
  }

  function updateMedicationPrescription(
    index,
    e
  ) {
    const selected =
      e.target.files?.[0] || null;

    if (
      selected &&
      !selected.type.startsWith("image/")
    ) {
      setError(
        "ใบสั่งยาจากแพทย์รองรับไฟล์รูปภาพเท่านั้น"
      );
      return;
    }

    if (
      selected &&
      selected.size >
        10 * 1024 * 1024
    ) {
      setError(
        "ไฟล์ใบสั่งยาต้องมีขนาดไม่เกิน 10 MB"
      );
      return;
    }

    setError("");

    setForm((current) => ({
      ...current,
      medications:
        current.medications.map(
          (
            medication,
            medicationIndex
          ) =>
            medicationIndex === index
              ? {
                  ...medication,
                  prescription_file:
                    selected,
                }
              : medication
        ),
    }));
  }

  function addMedication() {
    setForm((current) => ({
      ...current,
      medications: [
        ...current.medications,
        emptyMedication(),
      ],
    }));
  }

  function removeMedication(index) {
    setForm((current) => {
      if (current.medications.length === 1) {
        return current;
      }

      return {
        ...current,
        medications: current.medications.filter(
          (_, medicationIndex) =>
            medicationIndex !== index
        ),
      };
    });
  }

  function calculateDates(medication) {
    if (
      !medication.start_date ||
      !medication.days_supply
    ) {
      return {
        expectedRunout: "-",
        confirmDate: "-",
      };
    }

    function addDays(dateString, days) {
      const [year, month, day] = dateString
        .split("-")
        .map(Number);

      const date = new Date(
        Date.UTC(year, month - 1, day)
      );

      date.setUTCDate(
        date.getUTCDate() + Number(days)
      );

      return date.toISOString().slice(0, 10);
    }

    function formatDate(dateString) {
      const [year, month, day] = dateString
        .split("-")
        .map(Number);

      return new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(
        new Date(Date.UTC(year, month - 1, day))
      );
    }

    const expectedRunoutDate = addDays(
      medication.start_date,
      medication.days_supply
    );

    const confirmReminderDate = addDays(
      expectedRunoutDate,
      -14
    );

    return {
      expectedRunout: formatDate(
        expectedRunoutDate
      ),
      confirmDate: formatDate(
        confirmReminderDate
      ),
    };
  }

  async function submit(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      const result = await linkCustomer({
        line_user_row_id: user.id,
        full_name: form.full_name,
        phone: form.phone,
        branch_name: form.branch_name,
        medications: form.medications.map(
          (medication) => ({
            ...medication,
            quantity:
              medication.quantity === ""
                ? null
                : Number(medication.quantity),
            days_supply:
              Number(medication.days_supply),
          })
        ),
      });

      console.log(
        "LINK CUSTOMER RESULT:",
        result
      );

      alert(
        `บันทึกลูกค้าและยา ${form.medications.length} รายการเรียบร้อย`
      );

      onSaved();
    } catch (err) {
      console.error(
        "LINK CUSTOMER ERROR:",
        err
      );

      setError(
        err?.message ||
          "ไม่สามารถบันทึกข้อมูลได้"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={formStyles.overlay}>
      <div style={formStyles.modal}>
        <div style={formStyles.modalHeader}>
          <div>
            <small style={styles.muted}>
              เชื่อมข้อมูล LINE
            </small>

            <h2 style={{ margin: "3px 0" }}>
              {user.display_name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={formStyles.close}
          >
            ×
          </button>
        </div>

        <div style={formStyles.lineCard}>
          {user.picture_url ? (
            <img
              src={user.picture_url}
              alt=""
              style={styles.avatar}
            />
          ) : (
            <div style={styles.avatarPlaceholder}>
              L
            </div>
          )}

          <div>
            <strong>
              {user.display_name}
            </strong>

            <div style={styles.pending}>
              ● LINE เชื่อมแล้ว
            </div>
          </div>
        </div>

        <form onSubmit={submit}>
          <SectionTitle>
            ข้อมูลลูกค้า
          </SectionTitle>

          <Field
            label="ชื่อ-นามสกุล"
            name="full_name"
            value={form.full_name}
            onChange={updateCustomerField}
            placeholder="เช่น สมหญิง ใจดี"
            required
          />

          <Field
            label="เบอร์โทรศัพท์"
            name="phone"
            value={form.phone}
            onChange={updateCustomerField}
            placeholder="เช่น 0812345678"
            required
          />

          <Field
            label="สาขารับยา"
            name="branch_name"
            value={form.branch_name}
            onChange={updateCustomerField}
            placeholder="เช่น eXta Plus ระเบาะไผ่"
          />

          <SectionTitle>
            รายการยา
          </SectionTitle>

          {form.medications.map(
            (medication, index) => {
              const calculated =
                calculateDates(medication);

              return (
                <div
                  key={index}
                  style={formStyles.medicationEditor}
                >
                  <div style={formStyles.medicationEditorHeader}>
                    <strong>
                      ยารายการที่ {index + 1}
                    </strong>

                    {form.medications.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeMedication(index)
                        }
                        style={formStyles.removeMedication}
                      >
                        ลบรายการ
                      </button>
                    )}
                  </div>

                  <Field
                    label="ชื่อยา"
                    name="drug_name"
                    value={medication.drug_name}
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    placeholder="เช่น Metformin"
                    required
                  />

                  <Field
                    label="ความแรง"
                    name="strength"
                    value={medication.strength}
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    placeholder="เช่น 500 mg"
                  />

                  <Field
                    label="จำนวน"
                    name="quantity"
                    type="number"
                    min="1"
                    value={medication.quantity}
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    required
                  />

                  <Field
                    label="วิธีใช้"
                    name="dosage_instruction"
                    value={
                      medication.dosage_instruction
                    }
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    placeholder="เช่น 1 เม็ด หลังอาหารเช้า"
                  />

                  <div style={styles.documentArea}>
                    <div style={styles.documentHeading}>
                      <div>
                        <strong>
                          ใบสั่งยาจากแพทย์
                        </strong>

                        <div style={styles.muted}>
                          ไม่บังคับ
                        </div>
                      </div>

                      <label style={styles.uploadButton}>
                        {medication.prescription_file
                          ? "เปลี่ยนรูป"
                          : "แนบรูป"}

                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) =>
                            updateMedicationPrescription(
                              index,
                              e
                            )
                          }
                          style={{
                            display: "none",
                          }}
                        />
                      </label>
                    </div>

                    {medication.prescription_file ? (
                      <div style={styles.noDocument}>
                        ✓ {medication.prescription_file.name}
                      </div>
                    ) : (
                      <div style={styles.noDocument}>
                        ไม่มีใบสั่งแพทย์ก็สามารถบันทึกยาได้
                      </div>
                    )}
                  </div>

                  <Field
                    label="วันที่เริ่มใช้ยา"
                    name="start_date"
                    type="date"
                    value={medication.start_date}
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    required
                  />

                  <Field
                    label="จำนวนวันที่ใช้ได้"
                    name="days_supply"
                    type="number"
                    min="1"
                    value={medication.days_supply}
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    required
                  />

                  <Field
                    label="วันนัดรับยาครั้งถัดไป"
                    name="pickup_date"
                    type="date"
                    value={medication.pickup_date}
                    onChange={(e) =>
                      updateMedicationField(index, e)
                    }
                    required
                  />

                  <div style={formStyles.calculationBox}>
                    <div>
                      <span>
                        ยาคาดว่าจะหมด
                      </span>

                      <strong>
                        {calculated.expectedRunout}
                      </strong>
                    </div>

                    <div>
                      <span>
                        แจ้งเตือนยืนยันสั่งยา
                      </span>

                      <strong>
                        {calculated.confirmDate}
                      </strong>
                    </div>

                    <small>
                      แต่ละรายการแจ้งเตือนก่อนยาหมด
                      14 วัน และลูกค้ายืนยันแยกยา
                    </small>
                  </div>
                </div>
              );
            }
          )}

          <button
            type="button"
            onClick={addMedication}
            style={formStyles.addMedication}
          >
            ＋ เพิ่มยาอีกหนึ่งรายการ
          </button>

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <div style={formStyles.actions}>
            <button
              type="button"
              onClick={onClose}
              style={formStyles.cancel}
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={saving}
              style={formStyles.save}
            >
              {saving
                ? "กำลังบันทึก..."
                : `บันทึก ${form.medications.length} รายการยา`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  ...props
}) {
  return (
    <label style={formStyles.field}>
      <span>{label}</span>

      <input
        {...props}
        style={formStyles.input}
      />
    </label>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={formStyles.sectionTitle}>
      {children}
    </h3>
  );
}

const styles = {
  page: {
    width: "100%",
    maxWidth: 720,
    minHeight: "100vh",
    margin: "0 auto",
    padding: "22px 18px 40px",
    fontFamily:
      '"Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#18323b",
    background:
      "linear-gradient(180deg, #f2fbfd 0%, #f7fafb 34%, #f7f8f9 100%)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
    padding: "4px 2px 0",
  },

  muted: {
    color: "#81929a",
    fontSize: 12,
    lineHeight: 1.55,
  },

  logout: {
    flexShrink: 0,
    border: "1px solid #e4ecef",
    background: "rgba(255,255,255,0.88)",
    color: "#64757d",
    borderRadius: 999,
    padding: "8px 13px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 11,
    boxShadow: "0 3px 12px rgba(31, 72, 86, 0.05)",
  },

  summary: {
    display: "flex",
    alignItems: "center",
    gap: 13,
    padding: "17px 18px",
    background:
      "linear-gradient(135deg, #e9f8fb 0%, #f2fbf8 100%)",
    border: "1px solid #dceff1",
    borderRadius: 20,
    marginBottom: 16,
    color: "#536a73",
    boxShadow: "0 7px 22px rgba(39, 119, 143, 0.06)",
  },

  summaryNumber: {
    minWidth: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: 14,
    fontSize: 21,
    lineHeight: 1,
    color: "#1689a8",
    background: "rgba(255,255,255,0.82)",
    boxShadow: "0 3px 10px rgba(39, 119, 143, 0.08)",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  customer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,255,255,0.96)",
    padding: 15,
    borderRadius: 20,
    border: "1px solid #e9eff1",
    boxShadow: "0 7px 24px rgba(32, 70, 83, 0.055)",
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid #ffffff",
    boxShadow: "0 3px 12px rgba(33, 83, 99, 0.12)",
  },

  avatarPlaceholder: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #dff4f7, #e9f7f0)",
    color: "#2689a1",
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    border: "3px solid #ffffff",
    boxShadow: "0 3px 12px rgba(33, 83, 99, 0.10)",
  },

  customerInfo: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  pending: {
    color: "#bd8121",
    fontSize: 11,
    fontWeight: 600,
  },

  linkButton: {
    flexShrink: 0,
    border: 0,
    borderRadius: 12,
    padding: "10px 13px",
    background: "linear-gradient(135deg, #238fb2, #43a9bd)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 11,
    boxShadow: "0 5px 14px rgba(37, 143, 187, 0.18)",
  },

  empty: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
    textAlign: "center",
    padding: "46px 24px",
    background: "rgba(255,255,255,0.96)",
    borderRadius: 22,
    border: "1px solid #ebf0f2",
    boxShadow: "0 8px 26px rgba(32, 70, 83, 0.05)",
  },

  error: {
    padding: "11px 13px",
    background: "#fff2f2",
    color: "#b94d4d",
    border: "1px solid #f6dddd",
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 12,
  },

  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 18,
    padding: 5,
    background: "rgba(231, 239, 242, 0.82)",
    borderRadius: 16,
  },

  tab: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "10px 7px",
    border: 0,
    borderRadius: 12,
    background: "transparent",
    color: "#72838b",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 11,
    whiteSpace: "nowrap",
  },

  activeTab: {
    background: "#ffffff",
    color: "#187f9f",
    boxShadow: "0 4px 14px rgba(38, 95, 113, 0.10)",
  },

  tabBadge: {
    minWidth: 19,
    height: 19,
    padding: "0 5px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: "#dff2f7",
    color: "#187f9f",
    fontSize: 9,
    fontWeight: 700,
  },

  loadingBox: {
    padding: 34,
    textAlign: "center",
    color: "#81929a",
    background: "white",
    borderRadius: 20,
    border: "1px solid #eaf0f2",
    boxShadow: "0 7px 24px rgba(32, 70, 83, 0.05)",
  },

  customerDetailCard: {
    background: "rgba(255,255,255,0.97)",
    padding: 17,
    borderRadius: 20,
    border: "1px solid #e8eef0",
    boxShadow: "0 7px 24px rgba(32, 70, 83, 0.055)",
  },

  customerTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  medicationSection: {
    marginTop: 12,
  },

  medicationBox: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 13,
    borderRadius: 14,
    background: "#f5fafb",
    border: "1px solid #edf3f4",
    fontSize: 12,
    color: "#52656d",
  },

  customerActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 7,
    marginTop: 13,
  },

  addMedicationButton: {
    border: 0,
    borderRadius: 11,
    padding: "9px 12px",
    background: "#e7f6f9",
    color: "#1c87a5",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 11,
  },

  detailButton: {
    border: "1px solid #e5ecef",
    borderRadius: 11,
    padding: "9px 12px",
    background: "#ffffff",
    color: "#64767e",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 11,
  },

  detailMedication: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 13,
    marginBottom: 8,
    borderRadius: 14,
    background: "#f6fafb",
    border: "1px solid #edf2f3",
  },

  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  historyItem: {
    padding: 14,
    borderRadius: 15,
    border: "1px solid #e7edef",
    background: "#fbfdfd",
  },

  historyTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },

  historyMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid #edf1f3",
    color: "#89979e",
    fontSize: 10,
  },

  documentViewButton: {
    width: "100%",
    marginTop: 10,
    padding: 10,
    border: 0,
    borderRadius: 11,
    background: "#e8f6f9",
    color: "#1d87a4",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 11,
  },

  noMedication: {
    marginTop: 12,
    padding: 13,
    borderRadius: 13,
    background: "#f6fafb",
    border: "1px dashed #dde8eb",
    color: "#84949b",
    fontSize: 12,
  },

  orderInfo: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 9,
    marginTop: 10,
  },

  orderInfoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 11,
    borderRadius: 12,
    background: "#fbfdfd",
    border: "1px solid #eef2f3",
  },

  orderLabel: {
    color: "#89979e",
    fontSize: 10,
  },

  orderTaskCard: {
    position: "relative",
    overflow: "hidden",
    background: "rgba(255,255,255,0.98)",
    padding: 17,
    borderRadius: 20,
    border: "1px solid #e7eef0",
    boxShadow: "0 8px 26px rgba(32, 70, 83, 0.06)",
  },

  orderTaskHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },

  orderTaskTitle: {
    margin: "3px 0 2px",
    fontSize: 17,
    lineHeight: 1.35,
    color: "#17313a",
    fontWeight: 700,
  },

  confirmedBadge: {
    flexShrink: 0,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#e9f7ef",
    color: "#27855f",
    fontSize: 10,
    fontWeight: 700,
  },

  orderDrugBox: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    background: "linear-gradient(135deg, #f5fafb, #f8fcfb)",
    border: "1px solid #eaf1f2",
    fontSize: 12,
    color: "#566970",
  },

  orderTaskDates: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 9,
    marginTop: 10,
  },

  documentArea: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid #edf1f3",
  },

  documentHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  uploadButton: {
    flexShrink: 0,
    padding: "9px 12px",
    borderRadius: 11,
    background: "#e7f6f9",
    color: "#1b87a5",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },

  previewWrap: {
    marginTop: 12,
  },

  previewImage: {
    display: "block",
    width: "100%",
    maxHeight: 300,
    objectFit: "contain",
    borderRadius: 14,
    background: "#f5f7f8",
    border: "1px solid #edf1f3",
  },

  previewName: {
    marginTop: 7,
    color: "#84939a",
    fontSize: 10,
    overflowWrap: "anywhere",
  },

  noDocument: {
    marginTop: 12,
    padding: 20,
    textAlign: "center",
    border: "1px dashed #cfdfe4",
    borderRadius: 14,
    background: "#f9fcfd",
    color: "#92a1a8",
    fontSize: 11,
  },

  submitOrderButton: {
    width: "100%",
    marginTop: 14,
    padding: 13,
    border: 0,
    borderRadius: 13,
    background: "linear-gradient(135deg, #238fb2, #43a9bd)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(37, 143, 187, 0.18)",
  },

  orderedBadge: {
    flexShrink: 0,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#e8f3fb",
    color: "#287da4",
    fontSize: 10,
    fontWeight: 700,
  },

  readyButton: {
    width: "100%",
    marginTop: 14,
    padding: 13,
    border: 0,
    borderRadius: 13,
    background: "linear-gradient(135deg, #278d74, #42aa8b)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(39, 141, 116, 0.18)",
  },

  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
    boxShadow: "none",
  },
};

const formStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(20, 42, 51, 0.50)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 999,
  },

  modal: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: 24,
    padding: 22,
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 24px 70px rgba(18, 48, 59, 0.22)",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 13,
    borderBottom: "1px solid #edf2f3",
  },

  close: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: 0,
    borderRadius: "50%",
    background: "#f1f5f6",
    color: "#61737b",
    fontSize: 21,
    lineHeight: 1,
    cursor: "pointer",
  },

  lineCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 13,
    background: "linear-gradient(135deg, #f2fafb, #f5fbf8)",
    border: "1px solid #e4f0f1",
    borderRadius: 16,
    marginBottom: 20,
  },

  sectionTitle: {
    margin: "22px 0 11px",
    fontSize: 15,
    lineHeight: 1.4,
    color: "#203b44",
    fontWeight: 700,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 13,
    fontSize: 12,
    color: "#53666e",
    fontWeight: 600,
  },

  input: {
    width: "100%",
    padding: "12px 13px",
    border: "1px solid #dce6e9",
    borderRadius: 12,
    background: "#fbfdfd",
    color: "#213b44",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
  },

  medicationEditor: {
    marginBottom: 16,
    padding: 15,
    border: "1px solid #e3ecee",
    borderRadius: 17,
    background: "#fafcfc",
  },

  medicationEditorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 11,
    color: "#253f48",
    fontSize: 13,
  },

  removeMedication: {
    border: 0,
    background: "#fff0f0",
    color: "#b94e4e",
    borderRadius: 10,
    padding: "7px 10px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },

  addMedication: {
    width: "100%",
    marginTop: 4,
    padding: 12,
    border: "1px dashed #8fc8d6",
    borderRadius: 13,
    background: "#f3fafc",
    color: "#2187a4",
    fontWeight: 700,
    cursor: "pointer",
  },

  calculationBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 16,
    padding: 15,
    borderRadius: 15,
    background: "linear-gradient(135deg, #edf8fb, #f3faf7)",
    border: "1px solid #e0eff1",
    color: "#4f666e",
  },

  actions: {
    display: "flex",
    gap: 10,
    marginTop: 22,
    paddingTop: 16,
    borderTop: "1px solid #edf2f3",
  },

  cancel: {
    flex: 1,
    padding: 13,
    border: "1px solid #e2eaec",
    borderRadius: 12,
    background: "#f5f7f8",
    color: "#687980",
    cursor: "pointer",
    fontWeight: 600,
  },

  save: {
    flex: 2,
    padding: 13,
    border: 0,
    borderRadius: 12,
    background: "linear-gradient(135deg, #238fb2, #43a9bd)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(37, 143, 187, 0.18)",
  },
};

export default AdminDashboard;