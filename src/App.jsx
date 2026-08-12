import { useEffect, useState } from "react";
import { initializeLiff } from "./liff";
import "./App.css";

function App() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function startLiff() {
      try {
        const result = await initializeLiff();

        if (result) {
          setProfile(result.profile);
        }
      } catch (err) {
        console.error(err);
        setError("ไม่สามารถเชื่อมต่อ LINE ได้");
      } finally {
        setLoading(false);
      }
    }

    startLiff();
  }, []);

  if (loading) {
    return (
      <div className="page">
        <p>กำลังเชื่อมต่อ LINE...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">

        <div className="pill">💊</div>

        <h1>ปฏิทินยา</h1>
        <p className="subtitle">
          ระบบแจ้งเตือนการสั่งยาและเข้ารับยา
        </p>

        {error && <p className="error">{error}</p>}

        {profile && (
          <>
            {profile.pictureUrl && (
              <img
                className="profile"
                src={profile.pictureUrl}
                alt="LINE Profile"
              />
            )}

            <h2>สวัสดี {profile.displayName}</h2>

            <div className="success">
              ✓ เชื่อมต่อบัญชี LINE สำเร็จ
            </div>

            <button className="activate">
              เปิดใช้งานปฏิทินยา
            </button>
          </>
        )}

      </div>
    </div>
  );
}

export default App;