import { useEffect, useState } from "react";
import { initializeLiff } from "./liff";
import {
  registerLineUser,
  getCalendar,
  confirmOrder,
} from "./api";

import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import { supabase } from "./supabase";

import "./App.css";

function App() {
  const isAdmin =
    window.location.pathname === "/admin";

  if (isAdmin) {
    return <AdminApp />;
  }

  return <CustomerApp />;
}

/* =========================================
   ADMIN
========================================= */

function AdminApp() {
  const [adminSession, setAdminSession] =
    useState(null);

  const [checkingAdmin, setCheckingAdmin] =
    useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setAdminSession(data.session);
        setCheckingAdmin(false);
      });

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setAdminSession(session);
        }
      );

    return () =>
      subscription.unsubscribe();
  }, []);

  if (checkingAdmin) {
    return <div>กำลังโหลด...</div>;
  }

  if (!adminSession) {
    return (
      <AdminLogin
        onLogin={setAdminSession}
      />
    );
  }

  return <AdminDashboard />;
}

/* =========================================
   CUSTOMER LIFF
========================================= */

function CustomerApp() {
  const PREVIEW_MODE = false;
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const orderId = params.get("order");


  const [profile, setProfile] =
    useState(null);

  const [customer, setCustomer] =
    useState(null);

  const [
    calendarStatus,
    setCalendarStatus,
  ] = useState("loading");

  const [loading, setLoading] =
    useState(true);

  const [lineIdToken, setLineIdToken] =
  useState(null);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (PREVIEW_MODE) {
      setLoading(false);
      return;
    }

    async function start() {
      try {
        setLoading(true);
        setError("");

        /* 1. INIT LIFF */

        const result =
        await initializeLiff();

        if (!result) {
          return;
        }

        setProfile(result.profile);
        setLineIdToken(result.idToken);


        /* 2. REGISTER / UPDATE LINE USER */

        const registered =
          await registerLineUser(
            result.idToken
          );

        console.log(
          "REGISTER RESULT:",
          registered
        );

        /* 3. GET REAL CALENDAR */

        const calendar =
          await getCalendar(
            result.idToken
          );

        console.log(
          "CALENDAR RESULT:",
          calendar
        );

        setCalendarStatus(
          calendar.status
        );

        if (
          calendar.status === "active"
        ) {
          setCustomer(
            calendar.customer
          );
        } else {
          setCustomer(null);
        }
      } catch (err) {
        console.error(
          "CUSTOMER APP ERROR:",
          err
        );

        setError(
          err?.message ||
            "ไม่สามารถโหลดข้อมูลได้"
        );
      } finally {
        setLoading(false);
      }
    }

    start();
  }, []);
  async function refreshCalendar() {
    if (!lineIdToken) return;

    const calendar =
      await getCalendar(lineIdToken);

    setCalendarStatus(calendar.status);

    if (calendar.status === "active") {
      setCustomer(calendar.customer);
    } else {
      setCustomer(null);
    }
  }
  async function goToCalendar() {
    try {
      await refreshCalendar();

      // Remove action/order from the LIFF URL so the app renders the calendar.
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      url.searchParams.delete("order");

      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`
      );

      // URLSearchParams above is not React state, so force a lightweight
      // navigation to re-render CustomerApp in calendar mode.
      window.location.reload();
    } catch (err) {
      console.error("RETURN TO CALENDAR ERROR:", err);
      window.location.href = window.location.pathname;
    }
  }

  /* LOADING */

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loader" />

        <span>
          กำลังโหลดปฏิทินยา...
        </span>
      </div>
    );
  }

  /* ERROR */

  if (error) {
    return (
      <main className="app">
        <div className="error">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="header">
        <div>
          <p className="hello">
            สวัสดี
          </p>

          <h1>
            {customer?.full_name ||
              profile?.displayName ||
              "ผู้ใช้งาน"}
          </h1>
        </div>

        {profile?.pictureUrl && (
          <img
            src={profile.pictureUrl}
            className="avatar"
            alt="LINE Profile"
          />
        )}
      </header>

      {calendarStatus === "active" && customer ? (
        action === "confirm" && orderId ? (
          <ConfirmOrderPage
            customer={customer}
            orderId={orderId}
            idToken={lineIdToken}
            onRefresh={refreshCalendar}
            onBackToCalendar={goToCalendar}
          />
        ) : (
          <ActiveCalendar
            customer={customer}
            idToken={lineIdToken}
            onRefresh={refreshCalendar}
          />
        )
      ) : (
        <PendingPage />
      )}
    </main>
  );
}

/* =========================================
   ACTIVE CALENDAR
========================================= */

function ActiveCalendar({
  customer,
  idToken,
  onRefresh,
}) {
  const medications =
    (customer?.medications || []).filter(
      (medication) => medication?.latest_order
    );

  if (medications.length === 0) {
    return (
      <section className="pending-card">
        <div className="pending-icon">
          ✓
        </div>

        <h2>ยังไม่พบข้อมูลรอบยา</h2>

        <p>
          กรุณาติดต่อเภสัชกร
          เพื่อตรวจสอบข้อมูลยา
        </p>
      </section>
    );
  }

  const medicationColors = [
    "#2f8fb8",
    "#d58a2b",
    "#4c9a73",
    "#8b6bb5",
    "#c95f78",
    "#5d7d9a",
  ];

  const allOrders = medications.map(
    (medication, index) => ({
      medication,
      order: medication.latest_order,
      color:
        medicationColors[
          index % medicationColors.length
        ],
      index,
    })
  );

  const nextEvents = allOrders
    .flatMap(
      ({
        medication,
        order,
        color,
      }) => {
        const events = [];

        if (order.confirm_reminder_date) {
          events.push({
            type: "confirm",
            date:
              order.confirm_reminder_date,
            medication,
            order,
            color,
          });
        }

        if (order.pickup_date) {
          events.push({
            type: "pickup",
            date: order.pickup_date,
            medication,
            order,
            color,
          });
        }

        return events;
      }
    )
    .sort((a, b) =>
      a.date.localeCompare(b.date)
    );

  const nextEvent =
    nextEvents[0] || null;

  const initialDateString =
    nextEvent?.date ||
    new Date().toISOString().slice(0, 10);

  const initialCalendarDate =
    parseDateString(initialDateString);

  const [currentDate, setCurrentDate] =
    useState(() =>
      new Date(
        initialCalendarDate.getFullYear(),
        initialCalendarDate.getMonth(),
        1
      )
    );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];

  const thaiYear = year + 543;

  const firstDay = new Date(
    year,
    month,
    1
  ).getDay();

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  function prevMonth() {
    setCurrentDate(
      new Date(year, month - 1, 1)
    );
  }

  function nextMonth() {
    setCurrentDate(
      new Date(year, month + 1, 1)
    );
  }

  const calendarDays = [];

  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    calendarDays.push(day);
  }

  function getDayEvents(day) {
    const current =
      `${year}-${String(
        month + 1
      ).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

    const events = [];

    allOrders.forEach(
      ({
        medication,
        order,
        color,
        index,
      }) => {
        if (
          order.confirm_reminder_date ===
          current
        ) {
          events.push({
            type: "order",
            medication,
            color,
            index,
          });
        }

        if (
          order.pickup_date === current
        ) {
          events.push({
            type: "pickup",
            medication,
            color,
            index,
          });
        }
      }
    );

    return events;
  }

  const nextEventDate =
    nextEvent
      ? parseDateString(nextEvent.date)
      : new Date();

  function getStatusMeta(status) {
    const map = {
      waiting_confirmation: {
        text: "รอยืนยัน",
        background: "#fff5df",
        color: "#b67818",
      },
      confirmed: {
        text: "ยืนยันแล้ว",
        background: "#eaf7f0",
        color: "#25885f",
      },
      ordered: {
        text: "กำลังสั่งยา",
        background: "#e8f3fb",
        color: "#2a7fa8",
      },
      ready: {
        text: "ยาพร้อมรับ",
        background: "#e8f7f4",
        color: "#238a72",
      },
      picked_up: {
        text: "รับยาแล้ว",
        background: "#eef1f3",
        color: "#68747e",
      },
    };

    return (
      map[status] || {
        text: status || "-",
        background: "#eef1f3",
        color: "#68747e",
      }
    );
  }

  return (
    <>
      {/* NEXT EVENT */}

      {nextEvent && (
        <section className="next-card">
          <div className="next-label">
            รายการถัดไป
          </div>

          <div className="next-row">
            <div className="date-box">
              <strong>
                {nextEventDate.getDate()}
              </strong>

              <span>
                {shortMonth(
                  nextEventDate.getMonth()
                )}
              </span>
            </div>

            <div className="next-info">
              <h2>
                {nextEvent.type === "confirm"
                  ? "ยืนยันสั่งยา"
                  : "นัดรับยา"}
              </h2>

              <p>
                {nextEvent.medication.drug_name}

                {nextEvent.medication.strength
                  ? ` ${nextEvent.medication.strength}`
                  : ""}
              </p>

              <small>
                {formatThaiDate(
                  nextEvent.date
                )}

                {" • "}

                {customer.branch_name ||
                  "-"}
              </small>
            </div>
          </div>
        </section>
      )}

      {/* CALENDAR */}

      <section className="calendar-card">
        <div className="calendar-heading">
          <button onClick={prevMonth}>
            ‹
          </button>

          <strong>
            {monthNames[month]}{" "}
            {thaiYear}
          </strong>

          <button onClick={nextMonth}>
            ›
          </button>
        </div>

        <div className="week-days">
          <span>อา</span>
          <span>จ</span>
          <span>อ</span>
          <span>พ</span>
          <span>พฤ</span>
          <span>ศ</span>
          <span>ส</span>
        </div>

        <div className="calendar-grid">
          {calendarDays.map(
            (day, index) => {
              if (!day) {
                return (
                  <span
                    className="empty"
                    key={`empty-${index}`}
                  />
                );
              }

              return (
                <Day
                  key={day}
                  value={day}
                  events={getDayEvents(day)}
                />
              );
            }
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid #f0f2f4",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              marginBottom: 9,
              fontSize: 9,
              color: "#8a949f",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <i
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#6f7d87",
                  display: "inline-block",
                }}
              />
              วันยืนยันสั่งยา
            </span>

            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <i
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  border: "1.5px solid #6f7d87",
                  background: "transparent",
                  display: "inline-block",
                }}
              />
              วันนัดรับยา
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "7px 12px",
            }}
          >
            {allOrders.map(
              ({
                medication,
                color,
              }) => (
                <span
                  key={medication.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 9,
                    color: "#687580",
                  }}
                >
                  <i
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      display: "inline-block",
                    }}
                  />

                  {medication.drug_name}
                  {medication.strength
                    ? ` ${medication.strength}`
                    : ""}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ALL MEDICATIONS */}

      <div
        style={{
          marginTop: 16,
          marginBottom: 8,
          padding: "0 2px",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#263746",
          }}
        >
          ยาประจำของฉัน ({medications.length})
        </div>

        <div
          style={{
            marginTop: 2,
            fontSize: 10,
            color: "#8b98a4",
          }}
        >
          ตรวจสอบสถานะและวันนัดรับยาของแต่ละรายการ
        </div>
      </div>

      {allOrders.map(
        ({
          medication,
          order,
          color,
        }) => {
          const daysLeft =
            calculateDaysLeft(
              order.expected_runout_date
            );

          const statusMeta =
            getStatusMeta(order.status);

          return (
            <section
              key={medication.id}
              className="medicine-card"
              style={{
                position: "relative",
                overflow: "hidden",
                borderLeft: `3px solid ${color}`,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 11,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 13,
                    display: "grid",
                    placeItems: "center",
                    background: `${color}14`,
                    color,
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  ◉
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 15,
                          lineHeight: 1.35,
                          color: "#172334",
                        }}
                      >
                        {medication.drug_name}
                        {medication.strength
                          ? ` ${medication.strength}`
                          : ""}
                      </h3>

                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 10,
                          color: "#8b98a4",
                        }}
                      >
                        {medication.dosage_instruction ||
                          "ไม่มีข้อมูลวิธีใช้"}
                      </div>
                    </div>

                    <span
                      style={{
                        flexShrink: 0,
                        padding: "6px 9px",
                        borderRadius: 999,
                        background:
                          statusMeta.background,
                        color:
                          statusMeta.color,
                        fontSize: 9,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {statusMeta.text}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 9px",
                        borderRadius: 10,
                        background: "#f7fafb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "#97a3ad",
                        }}
                      >
                        วันยืนยัน
                      </div>

                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#52606c",
                        }}
                      >
                        {formatThaiDate(
                          order.confirm_reminder_date
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "8px 9px",
                        borderRadius: 10,
                        background: "#f7fafb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "#97a3ad",
                        }}
                      >
                        นัดรับยา
                      </div>

                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#52606c",
                        }}
                      >
                        {formatThaiDate(
                          order.pickup_date
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 10,
                      paddingTop: 9,
                      borderTop:
                        "1px solid #edf1f3",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "#7f8b95",
                      }}
                    >
                      จำนวน{" "}
                      {medication.quantity || "-"}
                    </span>

                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color:
                          daysLeft <= 7
                            ? "#c46f3a"
                            : "#7f8b95",
                      }}
                    >
                      {daysLeft >= 0
                        ? `เหลือ ${daysLeft} วัน`
                        : "ถึงรอบรับยา"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          );
        }
      )}
    </>
  );
}

/* =========================================
   ORDER STATUS
========================================= */

function OrderStatusCard({
  order,
  medication,
  idToken,
  onRefresh,
}) {
  const [confirming, setConfirming] =
    useState(false);

  const [confirmError, setConfirmError] =
    useState("");

  async function handleConfirm() {
    if (!idToken) {
      setConfirmError(
        "ไม่พบข้อมูล LINE กรุณาเปิดใหม่ผ่าน LINE"
      );
      return;
    }

    try {
      setConfirming(true);
      setConfirmError("");

      await confirmOrder(
        idToken,
        order.id
      );

      await onRefresh();
    } catch (err) {
      console.error(
        "CONFIRM ORDER ERROR:",
        err
      );

      setConfirmError(
        err?.message ||
          "ไม่สามารถยืนยันการสั่งยาได้"
      );
    } finally {
      setConfirming(false);
    }
  }

  if (order.status === "waiting_confirmation") {
    return (
      <section className="medicine-card">
        <small>สถานะรอบยา</small>

        <h3>
          รอการยืนยันสั่งยา
        </h3>

        <p
          style={{
            fontSize: 11,
            color: "#84919c",
          }}
        >
          ระบบจะแจ้งเตือนผ่าน LINE วันที่{" "}
          {formatThaiDate(
            order.confirm_reminder_date
          )}
        </p>
      </section>
    );
  }

  if (order.status === "confirmed") {
    return (
      <section className="medicine-card">
        <strong>
          ✓ ยืนยันสั่งยาแล้ว
        </strong>

        <p
          style={{
            fontSize: 11,
            color: "#84919c",
          }}
        >
          เภสัชกรกำลังดำเนินการเตรียม{" "}
          {medication.drug_name}
        </p>
      </section>
    );
  }

  if (order.status === "ordered") {
    return (
      <section className="medicine-card">
        <strong>
          กำลังดำเนินการสั่งยา
        </strong>
      </section>
    );
  }

  if (order.status === "ready") {
    return (
      <section className="medicine-card">
        <strong>
          ✓ ยาพร้อมรับแล้ว
        </strong>
      </section>
    );
  }

  if (order.status === "picked_up") {
    return (
      <section className="medicine-card">
        <strong>
          ✓ รับยาเรียบร้อยแล้ว
        </strong>
      </section>
    );
  }

  return null;
}

/* =========================================
   DAY
========================================= */

function Day({
  value,
  events = [],
}) {
  return (
    <div
      className="day"
      style={{
        paddingBottom:
          events.length > 0 ? 9 : 0,
      }}
    >
      {value}

      {events.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 3,
            left: "50%",
            transform:
              "translateX(-50%)",
            display: "flex",
            gap: 2,
            alignItems: "center",
            justifyContent: "center",
            maxWidth: "90%",
          }}
        >
          {events.slice(0, 4).map(
            (event, index) => (
              <span
                key={`${event.type}-${event.index}-${index}`}
                title={`${event.medication.drug_name} - ${
                  event.type === "order"
                    ? "ยืนยันสั่งยา"
                    : "นัดรับยา"
                }`}
                style={
                  event.type === "order"
                    ? {
                        width: 7,
                        height: 7,
                        borderRadius:
                          "50%",
                        background:
                          event.color,
                        flexShrink: 0,
                      }
                    : {
                        width: 7,
                        height: 7,
                        borderRadius:
                          "50%",
                        border:
                          `1.5px solid ${event.color}`,
                        background:
                          "transparent",
                        flexShrink: 0,
                      }
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmOrderPage({
  customer,
  orderId,
  idToken,
  onRefresh,
  onBackToCalendar,
}) {
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const medications =
    customer.medications || [];

  let selectedMedication = null;
  let selectedOrder = null;

  for (const medication of medications) {
    const order = medication.latest_order;

    if (order?.id === orderId) {
      selectedMedication = medication;
      selectedOrder = order;
      break;
    }
  }

  if (!selectedMedication || !selectedOrder) {
    return (
      <section className="pending-card">
        <h2>ไม่พบรายการนี้</h2>

        <p>
          กรุณากลับไปที่ปฏิทินยา
          หรือติดต่อเภสัชกร
        </p>
      </section>
    );
  }

  async function handleConfirm() {
    if (!idToken) {
      setError(
        "ไม่พบข้อมูล LINE กรุณาเปิดลิงก์ใหม่ผ่าน LINE"
      );
      return;
    }

    try {
      setConfirming(true);
      setError("");

      await confirmOrder(
        idToken,
        selectedOrder.id
      );

      setSuccess(true);

      await onRefresh();
    } catch (err) {
      console.error(
        "CONFIRM ORDER ERROR:",
        err
      );

      setError(
        err?.message ||
          "ไม่สามารถยืนยันการสั่งยาได้"
      );
    } finally {
      setConfirming(false);
    }
  }

  if (
    success ||
    selectedOrder.status === "confirmed"
  ) {
    return (
      <section className="pending-card">
        <div className="pending-icon">
          ✓
        </div>

        <h2>ยืนยันเรียบร้อย</h2>

        <p>
          เภสัชกรได้รับคำขอสั่งยาแล้ว
          และจะดำเนินการเตรียมยาตามรอบนัดหมาย
        </p>

        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            color: "#687580",
          }}
        >
          นัดรับยา{" "}
          {formatThaiDate(
            selectedOrder.pickup_date
          )}
        </div>

        <button
          type="button"
          onClick={onBackToCalendar}
          style={{
            width: "100%",
            marginTop: 18,
            padding: 13,
            border: 0,
            borderRadius: 12,
            background: "#258fbb",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          กลับไปปฏิทินยา
        </button>
      </section>
    );
  }

  return (
    <section className="medicine-card">
      <small>
        ยืนยันการสั่งยา
      </small>

      <h2
        style={{
          margin: "8px 0 4px",
        }}
      >
        {selectedMedication.drug_name}
        {selectedMedication.strength
          ? ` ${selectedMedication.strength}`
          : ""}
      </h2>

      <p
        style={{
          fontSize: 12,
          color: "#84919c",
        }}
      >
        นัดรับยา{" "}
        {formatThaiDate(
          selectedOrder.pickup_date
        )}
      </p>

      <p
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          color: "#687580",
        }}
      >
        กรุณายืนยันว่าต้องการสั่งยา
        สำหรับรอบนัดหมายนี้
      </p>

      <button
        onClick={handleConfirm}
        disabled={confirming}
        style={{
          width: "100%",
          marginTop: 12,
          padding: 13,
          border: 0,
          borderRadius: 12,
          background: confirming
            ? "#9fc8d8"
            : "#258fbb",
          color: "white",
          fontWeight: 600,
        }}
      >
        {confirming
          ? "กำลังยืนยัน..."
          : "ยืนยันสั่งยา"}
      </button>

      {error && (
        <div
          className="error"
          style={{
            marginTop: 10,
          }}
        >
          {error}
        </div>
      )}
    </section>
  );
}

/* =========================================
   PENDING
========================================= */

function PendingPage() {
  return (
    <section className="pending-card">
      <div className="pending-icon">
        ✓
      </div>

      <h2>
        เปิดใช้งานปฏิทินยาแล้ว
      </h2>

      <p>
        กำลังรอเภสัชกรเชื่อมข้อมูลยา
        และวันนัดรับยาของคุณ
      </p>

      <div className="pending-status">
        <span />

        รอเชื่อมข้อมูล
      </div>
    </section>
  );
}

/* =========================================
   DATE HELPERS
========================================= */

function parseDateString(
  dateString
) {
  if (!dateString) {
    return new Date();
  }

  const [
    year,
    month,
    day,
  ] = dateString
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}

function formatThaiDate(
  dateString
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

function shortMonth(
  monthIndex
) {
  const months = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];

  return months[monthIndex];
}

function calculateDaysLeft(
  runoutDate
) {
  if (!runoutDate) {
    return 0;
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const target =
    parseDateString(
      runoutDate
    );

  target.setHours(
    0,
    0,
    0,
    0
  );

  const difference =
    target.getTime() -
    today.getTime();

  return Math.ceil(
    difference /
      (1000 *
        60 *
        60 *
        24)
  );
}

export default App;