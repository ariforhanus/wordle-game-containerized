// API base URL
const API_BASE_URL = 'http://localhost:8091';

// Alert gösterme fonksiyonu
function showAlert(message, type = 'danger') {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.innerHTML = `
        <div class="alert alert-${type} py-2 alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `; 
}

// Form validation
function validateForm(form) {
    if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
    form.classList.add('was-validated');
    return true;
}

// Login form işlemi
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validateForm(this)) return;
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                // JWT token'ı localStorage'a kaydet
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('tokenExpiry', data.expiresIn);
                
                showAlert('Giriş başarılı! Yönlendiriliyorsunuz...', 'success');
                
                // Ana sayfaya yönlendir
                setTimeout(() => {
                    window.location.href = '../game.html';
                }, 1500);
            } else {
                showAlert('Kullanıcı adı veya şifre hatalı.');
            }
        } catch (error) {
            console.error('Login error:', error);
            showAlert('Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.');
        }
    });
}

// Register form işlemi
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validateForm(this)) return;
        
        const formData = new FormData(this);
        const username = formData.get('username');
        const email = formData.get('email');
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');
        
        // Şifre kontrolü
        if (password !== confirmPassword) {
            showAlert('Şifreler eşleşmiyor!');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password
                })
            });
            
            if (response.ok) {
                showAlert('Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...', 'success');
                
                // Login sayfasına yönlendir
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } else {
                const errorData = await response.json();
                showAlert(errorData.message || 'Kayıt sırasında bir hata oluştu.');
            }
        } catch (error) {
            console.error('Register error:', error);
            showAlert('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
        }
    });
}

// JWT token kontrolü
function checkAuthStatus() {
    const token = localStorage.getItem('jwtToken');
    const expiry = localStorage.getItem('tokenExpiry');
    
    if (token && expiry) {
        const now = Date.now();
        if (now < parseInt(expiry)) {
            return true; // Token geçerli
        } else {
            // Token süresi dolmuş, temizle
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('tokenExpiry');
        }
    }
    return false;
}

// Logout fonksiyonu
function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('tokenExpiry');
    window.location.href = 'auth/login.html';
}

// Sayfa yüklendiğinde auth durumunu kontrol et
document.addEventListener('DOMContentLoaded', function() {
    // Eğer kullanıcı zaten giriş yapmışsa ve login/register sayfalarındaysa ana sayfaya yönlendir
    if (checkAuthStatus() && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
        window.location.href = '../game.html';
    }
});
