import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  getPendingLineUsers,
  getAllCustomers,
  linkCustomer,
} from "./adminApi";

function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
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

  async function changeTab(tab) {
    setActiveTab(tab);

    if (tab === "pending") {
      await loadUsers();
    }

    if (tab === "customers") {
      await loadCustomers();
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

          {activeTab === "customers" && (
            <CustomerList customers={customers} />
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

function CustomerList({ customers }) {
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
    <div style={styles.list}>
      {customers.map((customer) => {
        const line = customer.line_users?.[0] || null;
        const medications = customer.medications || [];

        return (
          <div key={customer.id} style={styles.customerDetailCard}>
            <div style={styles.customerTop}>
              {line?.picture_url ? (
                <img
                  src={line.picture_url}
                  alt=""
                  style={styles.avatar}
                />
              ) : (
                <div style={styles.avatarPlaceholder}>L</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{customer.full_name || "-"}</strong>
                <div style={styles.muted}>
                  LINE: {line?.display_name || "-"}
                </div>
                <div style={styles.muted}>
                  {customer.phone || "-"}
                </div>
              </div>

              <OrderStatus
                status={getLatestOrder(medications)?.status}
              />
            </div>

            {medications.length === 0 ? (
              <div style={styles.noMedication}>
                ยังไม่มีข้อมูลยา
              </div>
            ) : (
              medications.map((medication) => {
                const order = medication.latest_order || null;

                return (
                  <div
                    key={medication.id}
                    style={styles.medicationSection}
                  >
                    <div style={styles.medicationBox}>
                      <strong>
                        {medication.drug_name}
                        {medication.strength
                          ? ` ${medication.strength}`
                          : ""}
                      </strong>

                      <span>
                        {medication.dosage_instruction || "-"}
                      </span>
                    </div>

                    {order && (
                      <div style={styles.orderInfo}>
                        <div style={styles.orderInfoItem}>
                          <span style={styles.orderLabel}>
                            วันเตือนยืนยัน
                          </span>
                          <strong>
                            {formatThaiDate(
                              order.confirm_reminder_date
                            )}
                          </strong>
                        </div>

                        <div style={styles.orderInfoItem}>
                          <span style={styles.orderLabel}>
                            วันรับยา
                          </span>
                          <strong>
                            {formatThaiDate(order.pickup_date)}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
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

function CustomerLinkForm({
  user,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    branch_name: "",
    drug_name: "",
    strength: "",
    quantity: 30,
    dosage_instruction: "",
    start_date: "",
    days_supply: 30,
    pickup_date: "",
  });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  function updateField(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  function calculateDates() {
    if (!form.start_date || !form.days_supply) {
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

    function formatThaiDate(dateString) {
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
      form.start_date,
      form.days_supply
    );

    const confirmReminderDate = addDays(
      expectedRunoutDate,
      -14
    );

    return {
      expectedRunout: formatThaiDate(
        expectedRunoutDate
      ),
      confirmDate: formatThaiDate(
        confirmReminderDate
      ),
    };
  }

  const calculated =
    calculateDates();

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
      drug_name: form.drug_name,
      strength: form.strength,
      quantity: form.quantity,
      dosage_instruction: form.dosage_instruction,
      start_date: form.start_date,
      days_supply: form.days_supply,
      pickup_date: form.pickup_date,
    });

    console.log("LINK CUSTOMER RESULT:", result);

    alert("บันทึกข้อมูลลูกค้าเรียบร้อย");

    onSaved();
  } catch (err) {
    console.error("LINK CUSTOMER ERROR:", err);

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
            onChange={updateField}
            placeholder="เช่น สมหญิง ใจดี"
            required
          />

          <Field
            label="เบอร์โทรศัพท์"
            name="phone"
            value={form.phone}
            onChange={updateField}
            placeholder="เช่น 0812345678"
            required
          />

          <Field
            label="สาขารับยา"
            name="branch_name"
            value={form.branch_name}
            onChange={updateField}
            placeholder="เช่น eXta Plus ระเบาะไผ่"
          />

          <SectionTitle>
            ข้อมูลยา
          </SectionTitle>

          <Field
            label="ชื่อยา"
            name="drug_name"
            value={form.drug_name}
            onChange={updateField}
            placeholder="เช่น Metformin"
            required
          />

          <Field
            label="ความแรง"
            name="strength"
            value={form.strength}
            onChange={updateField}
            placeholder="เช่น 500 mg"
          />

          <Field
            label="จำนวน"
            name="quantity"
            type="number"
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

          <div style={formStyles.calculationBox}>
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
                {calculated.confirmDate}
              </strong>
            </div>

            <small>
              ระบบแจ้งเตือนก่อนยาหมด
              14 วัน
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
                : "บันทึกข้อมูล"}
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
    maxWidth: 650,
    margin: "0 auto",
    padding: 24,
    fontFamily:
      "Noto Sans Thai, sans-serif",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: 24,
  },

  muted: {
    color: "#84919c",
    fontSize: 12,
  },

  logout: {
    border: 0,
    background: "#f1f4f6",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
  },

  summary: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 18,
    background: "#eaf6fa",
    borderRadius: 16,
    marginBottom: 16,
  },

  summaryNumber: {
    fontSize: 22,
    color: "#258fbb",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  customer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "white",
    padding: 14,
    borderRadius: 16,
    border:
      "1px solid #edf0f2",
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: "50%",
    objectFit: "cover",
  },

  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: "50%",
    background: "#e8eef1",
    display: "grid",
    placeItems: "center",
  },

  customerInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  pending: {
    color: "#c68a25",
    fontSize: 11,
  },

  linkButton: {
    border: 0,
    borderRadius: 10,
    padding: "9px 12px",
    background: "#258fbb",
    color: "white",
    cursor: "pointer",
  },

  empty: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
    textAlign: "center",
    padding: 40,
    background: "white",
    borderRadius: 18,
  },

  error: {
    padding: 12,
    background: "#fff0f0",
    color: "#bd4747",
    borderRadius: 10,
    marginBottom: 12,
  },
  tabs: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },

  tab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 12px",
    border: 0,
    borderRadius: 12,
    background: "#eef2f4",
    color: "#687580",
    cursor: "pointer",
    fontWeight: 600,
  },

  activeTab: {
    background: "#258fbb",
    color: "white",
  },

  tabBadge: {
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: "rgba(255,255,255,0.24)",
    fontSize: 10,
  },

  loadingBox: {
    padding: 30,
    textAlign: "center",
    color: "#84919c",
    background: "white",
    borderRadius: 16,
  },

  customerDetailCard: {
    background: "white",
    padding: 16,
    borderRadius: 16,
    border: "1px solid #edf0f2",
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
    gap: 3,
    padding: 12,
    borderRadius: 12,
    background: "#f7fafb",
    fontSize: 12,
  },

  noMedication: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "#f7fafb",
    color: "#84919c",
    fontSize: 12,
  },

  orderInfo: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 10,
  },

  orderInfoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: 10,
    borderRadius: 10,
    background: "#fbfcfd",
  },

  orderLabel: {
    color: "#8996a3",
    fontSize: 10,
  },

};

const formStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(17, 35, 52, 0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 999,
  },

  modal: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "white",
    borderRadius: 22,
    padding: 22,
    boxShadow:
      "0 20px 60px rgba(0,0,0,0.18)",
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  close: {
    width: 34,
    height: 34,
    border: 0,
    borderRadius: "50%",
    background: "#f2f5f7",
    fontSize: 20,
    cursor: "pointer",
  },

  lineCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    background: "#f7fafb",
    borderRadius: 14,
    marginBottom: 20,
  },

  sectionTitle: {
    margin: "20px 0 10px",
    fontSize: 15,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 12,
    fontSize: 12,
    color: "#55616d",
  },

  input: {
    width: "100%",
    padding: "11px 12px",
    border:
      "1px solid #dfe5e8",
    borderRadius: 10,
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
  },

  calculationBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    background: "#f4fafc",
  },

  actions: {
    display: "flex",
    gap: 10,
    marginTop: 20,
  },

  cancel: {
    flex: 1,
    padding: 13,
    border: 0,
    borderRadius: 11,
    background: "#eef2f4",
    cursor: "pointer",
  },

  save: {
    flex: 2,
    padding: 13,
    border: 0,
    borderRadius: 11,
    background: "#258fbb",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default AdminDashboard;