
// Use relative path for nginx proxy, fallback to direct backend URL for local development
const API_BASE_URL = (window.location.hostname === 'localhost' && window.location.port === '5500') 
    ? 'http://localhost:8091' 
    : '';

function showAlert(message, type = 'danger') {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.innerHTML = `
        <div class="alert alert-${type} py-2 alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `; 
}

function validateForm(form) {
    if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
    form.classList.add('was-validated');
    return true;
}

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
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('tokenExpiry', data.expiresIn);
                
                showAlert('Giriş başarılı! Yönlendiriliyorsunuz...', 'success');
                
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

if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validateForm(this)) return;
        
        const formData = new FormData(this);
        const username = formData.get('username');
        const email = formData.get('email');
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');
        
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

function checkAuthStatus() {
    const token = localStorage.getItem('jwtToken');
    const expiry = localStorage.getItem('tokenExpiry');
    
    if (token && expiry) {
        const now = Date.now();
        if (now < parseInt(expiry)) {
            return true;
        } else {
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('tokenExpiry');
        }
    }
    return false;
}

function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('tokenExpiry');
    window.location.href = 'auth/login.html';
}

document.addEventListener('DOMContentLoaded', function() {
    if (checkAuthStatus() && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
        window.location.href = '../game.html';
    }
});
