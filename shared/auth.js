import { supabaseClient } from "./supabase.js";
import { flash, getErrorMessage } from "./utils.js";

export let currentUser = null;
export let isAdmin = false;

export function setCurrentUser(user) {
  currentUser = user;
}

export function updateAccessRights() {
  const meta = currentUser && currentUser.user_metadata;
  isAdmin = !!(meta && meta.role === "admin");
  document.body.classList.toggle("read-only-mode", !isAdmin);
}

export function getFakeEmail(username) {
  return username.trim().toLowerCase() + "@ezz-gestion.app";
}

export function initAuth({ onAuthenticated, onSignedOut, onBeforeShowApp }) {
  async function handleSession(user) {
    setCurrentUser(user);
    updateAccessRights();
    const mustChange = user.user_metadata && user.user_metadata.must_change_password;
    if (mustChange) {
      document.getElementById("auth-overlay").style.display = "none";
      document.getElementById("change-pwd-overlay").style.display = "flex";
    } else {
      if (onBeforeShowApp) await onBeforeShowApp();
      document.getElementById("auth-overlay").style.display = "none";
      document.getElementById("change-pwd-overlay").style.display = "none";
      document.getElementById("logout-btn").style.display = "block";
      document.getElementById("bottom-nav").style.display = "flex";
      await onAuthenticated(user);
    }
  }

  async function initSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      await handleSession(session.user);
    } else {
      document.getElementById("auth-overlay").style.display = "flex";
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) await handleSession(session.user);
      else if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        updateAccessRights();
        if (onSignedOut) onSignedOut();
        document.getElementById("auth-overlay").style.display = "flex";
        document.getElementById("change-pwd-overlay").style.display = "none";
        document.getElementById("logout-btn").style.display = "none";
        document.getElementById("bottom-nav").style.display = "none";
      }
    });
  }

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("auth-username").value;
    const email = getFakeEmail(username);
    const password = document.getElementById("auth-password").value;
    const msgEl = document.getElementById("auth-msg");
    msgEl.textContent = "Connexion en cours...";
    const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      msgEl.textContent = getErrorMessage(error, "Nom d'utilisateur ou mot de passe incorrect.");
    } else if (authData.session?.user) {
      msgEl.textContent = "";
      try {
        await handleSession(authData.session.user);
      } catch (err) {
        msgEl.textContent = getErrorMessage(err, "Erreur lors de la connexion.");
      }
    } else {
      msgEl.textContent = "Connexion impossible. Réessayez.";
    }
  });

  document.getElementById("change-pwd-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPwd = document.getElementById("new-pwd").value;
    const confirmPwd = document.getElementById("confirm-pwd").value;
    const msgEl = document.getElementById("change-pwd-msg");
    if (newPwd !== confirmPwd) {
      msgEl.textContent = "Les mots de passe ne correspondent pas.";
      return;
    }
    msgEl.textContent = "Mise à jour en cours...";
    const { error } = await supabaseClient.auth.updateUser({
      password: newPwd,
      data: { must_change_password: false },
    });
    if (error) {
      msgEl.textContent = getErrorMessage(error, "Erreur lors du changement de mot de passe.");
    } else {
      const { data: { user } } = await supabaseClient.auth.getUser();
      setCurrentUser(user);
      flash("Mot de passe modifié ! Bienvenue 🎉");
      if (onBeforeShowApp) await onBeforeShowApp();
      document.getElementById("change-pwd-overlay").style.display = "none";
      document.getElementById("logout-btn").style.display = "block";
      document.getElementById("bottom-nav").style.display = "flex";
      await onAuthenticated(user);
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
  });

  document.getElementById("back-to-login-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    document.getElementById("change-pwd-overlay").style.display = "none";
    document.getElementById("auth-overlay").style.display = "flex";
    document.getElementById("auth-username").value = "";
    document.getElementById("auth-password").value = "";
    document.getElementById("auth-msg").textContent = "";
  });

  initSession();
}
