import { useEffect, useState } from "react";
import { initializeLiff } from "./liff";
import { registerLineUser } from "./api";
import "./App.css";

function App() {
  const PREVIEW_MODE = false;

  const mockProfile = {
    displayName: "สมหญิง ใจดี",
    pictureUrl: "https://placehold.co/100x100",
  };

  const mockCustomer = {
    status: "active",
    nextPickupDate: "30 ส.ค. 2569",
    branch: "eXta Plus สาขาระเบาะไผ่",
    medication: "Metformin 500 mg",
    quantity: "60 เม็ด",
    daysLeft: 18,
  };

  const [profile, setProfile] = useState(
    PREVIEW_MODE ? mockProfile : null
  );

  const [customer] = useState(
    PREVIEW_MODE ? mockCustomer : null
  );

  const [loading, setLoading] = useState(!PREVIEW_MODE);
  const [error, setError] = useState("");

  useEffect(() => {
    if (PREVIEW_MODE) return;

    async function start() {
      try {
        const result = await initializeLiff();

        if (result) {
          setProfile(result.profile);

          const registered = await registerLineUser(
            result.idToken
          );

          console.log(
            "REGISTERED USER:",
            registered.user
          );
        }
      } catch (err) {
        console.error(err);
        setError(
          err?.message || "ไม่สามารถเชื่อมต่อ LINE ได้"
        );
      } finally {
        setLoading(false);
      }
    }

    start();
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loader" />
        <span>กำลังโหลดปฏิทินยา...</span>
      </div>
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
            {profile?.displayName || "ผู้ใช้งาน"}
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

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {!customer || customer.status === "pending" ? (
        <PendingPage />
      ) : (
        <ActiveCalendar customer={customer} />
      )}
    </main>
  );
}

function ActiveCalendar({ customer }) {
  const [currentDate, setCurrentDate] = useState(
    new Date(2026, 7, 1)
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

  const firstDay = new Date(year, month, 1).getDay();
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

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  function getEventType(day) {
    if (
      year === 2026 &&
      month === 7 &&
      day === 16
    ) {
      return "order";
    }

    if (
      year === 2026 &&
      month === 7 &&
      day === 30
    ) {
      return "pickup";
    }

    return null;
  }

  return (
    <>
      <section className="next-card">
        <div className="next-label">
          นัดครั้งถัดไป
        </div>

        <div className="next-row">
          <div className="date-box">
            <strong>30</strong>
            <span>ส.ค.</span>
          </div>

          <div className="next-info">
            <h2>นัดรับยา</h2>
            <p>{customer.nextPickupDate}</p>
            <small>{customer.branch}</small>
          </div>
        </div>
      </section>

      <section className="calendar-card">
        <div className="calendar-heading">
          <button onClick={prevMonth}>
            ‹
          </button>

          <strong>
            {monthNames[month]} {thaiYear}
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
          {calendarDays.map((day, index) => {
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
                type={getEventType(day)}
              />
            );
          })}
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
              {customer.medication}
            </h3>
          </div>

          <span className="days">
            เหลือ {customer.daysLeft} วัน
          </span>
        </div>

        <div className="medicine-bottom">
          <span>
            จำนวน {customer.quantity}
          </span>

          <button>
            ดูรายละเอียด
          </button>
        </div>
      </section>
    </>
  );
}

function Day({ value, type }) {
  return (
    <div
      className={`day ${
        type ? `day-${type}` : ""
      }`}
    >
      {value}

      {type && (
        <span className="event-dot" />
      )}
    </div>
  );
}

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

export default App;