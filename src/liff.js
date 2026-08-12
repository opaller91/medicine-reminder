import liff from "@line/liff";

export async function initializeLiff() {
  await liff.init({
    liffId: import.meta.env.VITE_LIFF_ID,
  });

  if (!liff.isLoggedIn()) {
    liff.login();
    return null;
  }

  const profile = await liff.getProfile();
  const idToken = liff.getIDToken();

  return {
    profile,
    idToken,
  };
}

export default liff;