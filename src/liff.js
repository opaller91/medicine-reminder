import liff from "@line/liff";

export async function initializeLiff() {
  await liff.init({
    liffId: "LIFF_ID_จริงของคุณ",
  });

  if (!liff.isLoggedIn()) {
    liff.login();
    return null;
  }

  const profile = await liff.getProfile();

  return {
    profile,
    idToken: liff.getIDToken(),
  };
}

export default liff;