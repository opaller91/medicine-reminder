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
  onBackToCalendar,
}) {
  const medication =
    customer?.medications?.[0] || null;

  const order =
    medication?.latest_order || null;

  const initialDateString =
    order?.confirm_reminder_date ||
    order?.pickup_date ||
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

  if (!medication || !order) {
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

  const year =
    currentDate.getFullYear();

  const month =
    currentDate.getMonth();

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

  const thaiYear =
    year + 543;

  const firstDay =
    new Date(
      year,
      month,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  function prevMonth() {
    setCurrentDate(
      new Date(
        year,
        month - 1,
        1
      )
    );
  }

  function nextMonth() {
    setCurrentDate(
      new Date(
        year,
        month + 1,
        1
      )
    );
  }

  /*
    สร้างช่องปฏิทิน
  */

  const calendarDays = [];

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    calendarDays.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    calendarDays.push(day);
  }

  /*
    วันที่ Event จริงจาก Supabase
  */

  function getEventType(day) {
    const current =
      `${year}-${String(
        month + 1
      ).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

    if (
      current ===
      order.confirm_reminder_date
    ) {
      return "order";
    }

    if (
      current ===
      order.pickup_date
    ) {
      return "pickup";
    }

    return null;
  }

  const pickup =
    parseDateString(
      order.pickup_date
    );

  const daysLeft =
    calculateDaysLeft(
      order.expected_runout_date
    );

  return (
    <>
      {/* NEXT APPOINTMENT */}

      <section className="next-card">
        <div className="next-label">
          นัดครั้งถัดไป
        </div>

        <div className="next-row">
          <div className="date-box">
            <strong>
              {pickup.getDate()}
            </strong>

            <span>
              {shortMonth(
                pickup.getMonth()
              )}
            </span>
          </div>

          <div className="next-info">
            <h2>
              นัดรับยา
            </h2>

            <p>
              {formatThaiDate(
                order.pickup_date
              )}
            </p>

            <small>
              {customer.branch_name ||
                "-"}
            </small>
          </div>
        </div>
      </section>

      {/* CALENDAR */}

      <section className="calendar-card">
        <div className="calendar-heading">
          <button
            onClick={prevMonth}
          >
            ‹
          </button>

          <strong>
            {monthNames[month]}{" "}
            {thaiYear}
          </strong>

          <button
            onClick={nextMonth}
          >
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
                  type={getEventType(
                    day
                  )}
                />
              );
            }
          )}
        </div>

        <div className="legend">
          <span>
            <i className="dot order-dot" />

            ยืนยันสั่งยา
          </span>

          <span>
            <i className="dot pickup-dot" />

            นัดรับยา
          </span>
        </div>
      </section>

      {/* MEDICATION */}

      <section className="medicine-card">
        <div className="medicine-header">
          <span className="medicine-icon">
            +
          </span>

          <div>
            <small>
              ยาประจำของฉัน
            </small>

            <h3>
              {medication.drug_name}

              {medication.strength
                ? ` ${medication.strength}`
                : ""}
            </h3>
          </div>

          <span className="days">
            {daysLeft >= 0
              ? `เหลือ ${daysLeft} วัน`
              : "ถึงรอบรับยา"}
          </span>
        </div>

        <div className="medicine-bottom">
          <span>
            จำนวน{" "}
            {medication.quantity ||
              "-"}
          </span>

          <button>
            ดูรายละเอียด
          </button>
        </div>
      </section>

      {/* STATUS */}

      <OrderStatusCard
        order={order}
        medication={medication}
        idToken={idToken}
        onRefresh={onRefresh}
      />
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
  type,
}) {
  return (
    <div
      className={`day ${
        type
          ? `day-${type}`
          : ""
      }`}
    >
      {value}

      {type && (
        <span className="event-dot" />
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