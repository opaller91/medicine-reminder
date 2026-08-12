import liff from "@line/liff";

export async function initializeLiff() {
  await liff.init({
    liffId: "2011081168-vX5joQV5",
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