const API_BASE_URL = window.location.hostname === "localhost" && window.location.port === "5500"
    ? "http://localhost:8091"
    : "";
// ── Language detection & i18n messages ──────────────────────────
function detectLang() {
    return window.location.pathname.includes("/tr/") ? "tr" : "en";
}
const MESSAGES = {
    tr: {
        loginSuccess: "Giriş başarılı! Yönlendiriliyorsunuz...",
        loginFail: "Kullanıcı adı veya şifre hatalı.",
        loginError: "Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.",
        registerSuccess: "Kayıt başarılı! Oyuna yönlendiriliyorsunuz...",
        registerFail: "Kayıt sırasında bir hata oluştu.",
        registerError: "Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.",
        passwordMismatch: "Şifreler eşleşmiyor!",
        avatarTooLarge: "Profil fotoğrafı en fazla 512KB olabilir.",
        darkMode: "Koyu Mod",
        lightMode: "Açık Mod",
    },
    en: {
        loginSuccess: "Login successful! Redirecting...",
        loginFail: "Invalid username or password.",
        loginError: "An error occurred during login. Please try again.",
        registerSuccess: "Registration successful! Redirecting to game...",
        registerFail: "An error occurred during registration.",
        registerError: "An error occurred during registration. Please try again.",
        passwordMismatch: "Passwords do not match!",
        avatarTooLarge: "Profile photo must be 512KB or less.",
        darkMode: "Dark Mode",
        lightMode: "Light Mode",
    },
};
function msg(key) {
    return MESSAGES[detectLang()][key];
}
// ── Avatar upload ───────────────────────────────────────────────
async function uploadAvatarIfPresent(form) {
    const fileInput = form.querySelector('input[name="avatar"]');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0)
        return;
    const file = fileInput.files[0];
    const maxBytes = 512 * 1024; // 512KB
    if (file.size > maxBytes) {
        showAlert(msg("avatarTooLarge"));
        return;
    }
    const token = localStorage.getItem("jwtToken");
    if (!token)
        return;
    const fd = new FormData();
    fd.append("file", file);
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/avatar`, {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token,
            },
            body: fd,
        });
        if (!res.ok) {
            console.warn("Avatar upload failed", await res.text());
        }
    }
    catch (err) {
        console.error("Avatar upload error:", err);
    }
}
// ── Alert display (XSS-safe DOM builder) ────────────────────────
function showAlert(message, type = "danger") {
    const alertContainer = document.getElementById("alertContainer");
    if (!alertContainer)
        return;
    const iconClass = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
    alertContainer.innerHTML = "";
    const alertDiv = document.createElement("div");
    alertDiv.className = `custom-alert custom-alert-${type}`;
    alertDiv.setAttribute("role", "alert");
    const icon = document.createElement("i");
    icon.className = `fa-solid ${iconClass}`;
    alertDiv.appendChild(icon);
    const span = document.createElement("span");
    span.textContent = message;
    alertDiv.appendChild(span);
    alertContainer.appendChild(alertDiv);
    if (type === "danger") {
        document.querySelectorAll("form").forEach((form) => {
            form.classList.remove("was-validated");
        });
        document.querySelectorAll(".is-valid, .is-invalid").forEach((el) => {
            el.classList.remove("is-valid", "is-invalid");
        });
    }
}
// ── Form validation (uses browser Constraint Validation API) ────
function validateForm(form) {
    if (form.checkValidity()) {
        return true;
    }
    form.classList.add("was-validated");
    return false;
}
// ── Token helpers ───────────────────────────────────────────────
function saveToken(token, expiresInMs) {
    localStorage.setItem("jwtToken", token);
    // Convert TTL (duration in ms) to absolute timestamp
    localStorage.setItem("tokenExpiry", (Date.now() + expiresInMs).toString());
}
// ── Auth handlers ───────────────────────────────────────────────
function attachAuthHandlers() {
    const loginFormEl = document.getElementById("loginForm");
    if (loginFormEl) {
        loginFormEl.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!validateForm(loginFormEl))
                return;
            const formData = new FormData(loginFormEl);
            const username = formData.get("username");
            const password = formData.get("password");
            if (!username || !password)
                return;
            try {
                const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                });
                if (response.ok) {
                    const data = await response.json();
                    saveToken(data.token, data.expiresIn);
                    showAlert(msg("loginSuccess"), "success");
                    setTimeout(() => {
                        window.location.href = "../game.html";
                    }, 1500);
                }
                else {
                    showAlert(msg("loginFail"));
                }
            }
            catch (error) {
                console.error("Login error:", error);
                showAlert(msg("loginError"));
            }
        });
    }
    const registerFormEl = document.getElementById("registerForm");
    if (registerFormEl) {
        registerFormEl.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!validateForm(registerFormEl))
                return;
            const formData = new FormData(registerFormEl);
            const username = formData.get("username");
            const email = formData.get("email");
            const firstName = formData.get("firstName");
            const lastName = formData.get("lastName");
            const nationality = formData.get("nationality");
            const password = formData.get("password");
            const confirmPassword = formData.get("confirmPassword");
            if (password !== confirmPassword) {
                showAlert(msg("passwordMismatch"));
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password, firstName, lastName, nationality }),
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.token && data.expiresIn) {
                        saveToken(data.token, data.expiresIn);
                    }
                    await uploadAvatarIfPresent(registerFormEl);
                    showAlert(msg("registerSuccess"), "success");
                    setTimeout(() => {
                        window.location.href = "../game.html";
                    }, 1500);
                }
                else {
                    const errorData = await response.json().catch(() => null);
                    showAlert((errorData === null || errorData === void 0 ? void 0 : errorData.message) || msg("registerFail"));
                }
            }
            catch (error) {
                console.error("Register error:", error);
                showAlert(msg("registerError"));
            }
        });
    }
}
// ── Auth status check ───────────────────────────────────────────
function checkAuthStatus() {
    const token = localStorage.getItem("jwtToken");
    const expiry = localStorage.getItem("tokenExpiry");
    if (token && expiry) {
        const expiryMs = parseInt(expiry, 10);
        if (!isNaN(expiryMs) && Date.now() < expiryMs) {
            return true;
        }
        else {
            localStorage.removeItem("jwtToken");
            localStorage.removeItem("tokenExpiry");
        }
    }
    return false;
}
function logout() {
    localStorage.removeItem("jwtToken");
    localStorage.removeItem("tokenExpiry");
    const lang = detectLang();
    window.location.href = `/${lang}/auth/login.html`;
}
// ── Account menu dropdown ───────────────────────────────────────
function setupAccountMenu() {
    var _a;
    const accountBtn = document.getElementById("accountBtn");
    const accountDropdown = document.getElementById("accountDropdown");
    if (accountBtn && accountDropdown) {
        accountBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            accountDropdown.classList.toggle("show");
        });
        document.addEventListener("click", (e) => {
            const target = e.target;
            if (target && !accountBtn.contains(target) && !accountDropdown.contains(target)) {
                accountDropdown.classList.remove("show");
            }
        });
        const logoutBtn = accountDropdown.querySelector(".logout-btn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => {
                logout();
                accountDropdown.classList.remove("show");
            });
        }
        // Dark mode toggle
        const dropdownList = accountDropdown.querySelector("ul");
        if (dropdownList && !accountDropdown.querySelector("#darkModeToggle")) {
            const lang = detectLang();
            const currentTheme = document.documentElement.getAttribute("data-theme");
            const darkModeToggle = document.createElement("li");
            darkModeToggle.innerHTML = `
        <button class="dark-mode-toggle" id="darkModeToggle">
          <span class="dark-mode-switch">
            <span class="dark-mode-slider"></span>
          </span>
          <span class="dark-mode-label">${currentTheme === "dark" ? msg("lightMode") : msg("darkMode")}</span>
        </button>
      `;
            const logoutItem = (_a = dropdownList.querySelector(".logout-btn")) === null || _a === void 0 ? void 0 : _a.closest("li");
            if (logoutItem) {
                dropdownList.insertBefore(darkModeToggle, logoutItem);
            }
            else {
                dropdownList.appendChild(darkModeToggle);
            }
            const darkModeBtn = accountDropdown.querySelector("#darkModeToggle");
            if (darkModeBtn) {
                darkModeBtn.addEventListener("click", () => {
                    const current = document.documentElement.getAttribute("data-theme");
                    const next = current === "dark" ? "light" : "dark";
                    document.documentElement.setAttribute("data-theme", next);
                    localStorage.setItem("theme", next);
                    const label = darkModeBtn.querySelector(".dark-mode-label");
                    if (label) {
                        label.textContent = next === "dark" ? msg("lightMode") : msg("darkMode");
                    }
                });
            }
        }
    }
}
// ── Init ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem("theme");
    document.documentElement.setAttribute("data-theme", savedTheme === "dark" ? "dark" : "light");
    setupAccountMenu();
    attachAuthHandlers();
    if (checkAuthStatus() &&
        (window.location.pathname.includes("login.html") ||
            window.location.pathname.includes("register.html"))) {
        window.location.href = "../game.html";
    }
});
