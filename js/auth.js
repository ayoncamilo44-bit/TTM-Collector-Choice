import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const SUPABASE_URL = "https://blpptyfncuxyygmumvok.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_LeX35BABY67D8qcmHXdI2g_dV2w_Odp";

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
window.supabase = supabase;

window.loginWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) alert("Sign in failed: " + error.message);
};

window.logout = async () => {
  await supabase.auth.signOut();
  location.reload();
};

function updateButtons(session) {
  document.querySelectorAll("#signin, [data-auth-btn]").forEach(b => {
    if (session) {
      const name = session.user.user_metadata?.name || session.user.email || "Account";
      b.textContent = "Sign out (" + name.split(" ")[0] + ")";
      b.onclick = window.logout;
    } else {
      b.textContent = "Sign In";
      b.onclick = window.loginWithGoogle;
    }
  });
}

supabase.auth.getSession().then(({ data }) => updateButtons(data.session));
supabase.auth.onAuthStateChange((_e, session) => updateButtons(session));
