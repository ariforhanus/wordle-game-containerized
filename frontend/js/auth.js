
// Use relative path for nginx proxy, fallback to direct backend URL for local development
const API_BASE_URL = (window.location.hostname === 'localhost' && window.location.port === '5500') 
    ? 'http://localhost:8091' 
    : '';

function showAlert(message, type = 'danger') {
    const alertContainer = document.getElementById('alertContainer');
    const icon = type === 'success' 
        ? '<i class="fa-solid fa-circle-check"></i>' 
        : '<i class="fa-solid fa-circle-exclamation"></i>';
    alertContainer.innerHTML = `
        <div class="custom-alert custom-alert-${type}" role="alert">
            ${icon}
            <span>${message}</span>
        </div>
    `;
    
    // Hata durumunda tüm validation stillerini kaldır
    if (type === 'danger') {
        document.querySelectorAll('form').forEach(form => {
            form.classList.remove('was-validated');
        });
        // Input'lardan valid/invalid class'larını kaldır
        document.querySelectorAll('.is-valid, .is-invalid').forEach(el => {
            el.classList.remove('is-valid', 'is-invalid');
        });
    }
}

function validateForm(form) {
    // Sadece boş alan kontrolü yap, Bootstrap validation kullanma
    const inputs = form.querySelectorAll('input[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
        }
    });
    
    return isValid;
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
    // Dile göre login sayfasına yönlendir
    const path = window.location.pathname;
    if (path.includes('/en/')) {
        window.location.href = '/en/auth/login.html';
    } else if (path.includes('/tr/')) {
        window.location.href = '/tr/auth/login.html';
    } else {
        window.location.href = '/';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (checkAuthStatus() && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
        window.location.href = '../game.html';
    }
});
