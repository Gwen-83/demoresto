document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("access_token");

  if (!token) {
    alert("Vous devez être connecté pour accéder à cette page.");
    window.location.href = "login.html"; // remplace par ton vrai login si besoin
    return;
  }

  try {
    const res = await fetch("/api/verify-token", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error("Token invalide");
    }

    const data = await res.json();
    document.getElementById("user-info").textContent = `Connecté en tant que ${data.username} (${data.role})`;

  } catch (err) {
    alert("Accès refusé. Veuillez vous reconnecter.");
    localStorage.removeItem("access_token");
    window.location.href = "login.html"; // remplace par ton vrai login
  }
});

function logout() {
  localStorage.removeItem("access_token");
  window.location.href = "login.html"; // remplace par ton vrai login
}