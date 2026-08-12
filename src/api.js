export async function registerLineUser(idToken) {
  const response = await fetch(
    "https://uhvcakajcdxkykopekgg.supabase.co/functions/v1/register-line-user",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
        result.detail || result.error || "ลงทะเบียนไม่สำเร็จ"
    );
  }

  return result;
}