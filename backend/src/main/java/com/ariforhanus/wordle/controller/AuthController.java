package com.ariforhanus.wordle.controller;

import com.ariforhanus.wordle.dto.JwtResponse;
import com.ariforhanus.wordle.dto.LoginRequest;
import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500", "http://localhost", "http://localhost:80", "http://wordle-frontend"})
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;

    private final AuthenticationManager authManager;
    private final JwtUtil jwt;

    public AuthController(UserRepository users, PasswordEncoder encoder, AuthenticationManager authManager, JwtUtil jwt) {
        this.users = users;
        this.encoder = encoder;
        this.authManager = authManager;
        this.jwt = jwt;
    }

    @Value("${jwt.expiration}")
    private long jwtExpMs;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String email = request.get("email");
        String password = request.get("password");

        String firstName = request.get("firstName");
        String lastName = request.get("lastName");
        String nationality = request.get("nationality");

        Map<String, Object> response = new HashMap<>();

        if(username == null || username.isBlank() ||
                email == null || email.isBlank() ||
                password == null || password.isBlank()) {
            response.put("success", false);
            response.put("message", "Kullanıcı adı, e-posta ve şifre zorunlu.");
            return ResponseEntity.badRequest().body(response);
        }

        username = username.trim();

        if (users.existsByUsername(username)) {
            response.put("success", false);
            response.put("message", "Bu kullanıcı adı zaten alınmış.");
            return ResponseEntity.badRequest().body(response);
        }
        if (users.existsByEmail(email)) {
            response.put("success", false);
            response.put("message", "Bu e‑posta zaten kayıtlı.");
            return ResponseEntity.badRequest().body(response);
        }

        User u = new User();
        u.setUsername(username);
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(password));
        u.setRole("USER");
        if (firstName != null && !firstName.isBlank()) {
            u.setFirstName(firstName.trim());
        }
        if (lastName != null && !lastName.isBlank()) {
            u.setLastName(lastName.trim());
        }
        if (nationality != null && !nationality.isBlank()) {
            u.setNationality(nationality.trim());
        }

        try {
            users.save(u);
            String token = jwt.generateToken(u.getId(), u.getUsername(), u.getRole());
            response.put("success", true);
            response.put("message", "Kayıt başarılı!");
            response.put("token", token);
            response.put("expiresIn", jwtExpMs);
            return ResponseEntity.ok(response);
        } catch (DataIntegrityViolationException e) {
            response.put("success", false);
            response.put("message", "Kullanıcı adı veya e-posta zaten kayıtlı.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping(
            path = "/login",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JwtResponse> apiLogin(@RequestBody LoginRequest req){
        try{
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(req.getUsername(),req.getPassword());
            authManager.authenticate(authToken);

            var user = users.findByUsername(req.getUsername())
                    .orElseThrow(() -> new UsernameNotFoundException("Kullanıcı bulunamadı."));
            String token = jwt.generateToken(user.getId(), user.getUsername(), user.getRole());
            return ResponseEntity.ok(new JwtResponse(token, jwtExpMs));

        } catch (BadCredentialsException ex){
            return ResponseEntity.status(401).build();
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader(value = "Authorization", required = false) String authHeader){
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
            }
            String token = authHeader.substring(7);
            Long userId = jwt.extractUserId(token);
            if (userId == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
            }
            var user = users.findById(userId)
                    .orElseThrow(()-> new UsernameNotFoundException("Kullanıcı bulunamadı."));

            Map<String, Object> body = new HashMap<>();
            body.put("username", user.getUsername());
            body.put("email", user.getEmail());
            body.put("role", user.getRole());
            body.put("firstName", user.getFirstName());
            body.put("lastName", user.getLastName());
            body.put("nationality", user.getNationality());
            // Avatar varsa base64 encode edip gönder
            if (user.getAvatar() != null && user.getAvatar().length > 0) {
                String base64Avatar = java.util.Base64.getEncoder().encodeToString(user.getAvatar());
                body.put("avatar", base64Avatar);
                body.put("avatarContentType", user.getAvatarContentType());
            } else {
                body.put("avatar", null);
            }
            return ResponseEntity.ok(body);
        }catch(Exception e){
            return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
        }
    }

    @PostMapping("/profile")
    public ResponseEntity<?> updateProfile(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, String> req
    ) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
            }
            String token = authHeader.substring(7);
            Long userId = jwt.extractUserId(token);
            if (userId == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
            }

            User user = users.findById(userId)
                    .orElseThrow(() -> new UsernameNotFoundException("Kullanıcı bulunamadı."));

            String username = req.get("username");
            String firstName = req.get("firstName");
            String lastName = req.get("lastName");
            String nationality = req.get("nationality");

            // Update username if provided and different
            if (username != null && !username.isBlank()) {
                username = username.trim();
                if (!username.equals(user.getUsername())) {
                    // Check if new username is already taken
                    if (users.existsByUsername(username)) {
                        return ResponseEntity.badRequest().body(Map.of(
                                "error", "username_taken",
                                "message", "Bu kullanıcı adı zaten alınmış."
                        ));
                    }
                    user.setUsername(username);
                }
            }

            if (firstName != null) {
                firstName = firstName.trim();
                user.setFirstName(firstName.isBlank() ? null : firstName);
            }
            if (lastName != null) {
                lastName = lastName.trim();
                user.setLastName(lastName.isBlank() ? null : lastName);
            }
            if (nationality != null) {
                nationality = nationality.trim();
                user.setNationality(nationality.isBlank() ? null : nationality);
            }

            try {
                users.save(user);
            } catch (DataIntegrityViolationException e) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "validation_error",
                        "message", "Kullanıcı adı veya e-posta zaten kullanılıyor."
                ));
            }

            Map<String, Object> body = new HashMap<>();
            body.put("username", user.getUsername());
            body.put("email", user.getEmail());
            body.put("role", user.getRole());
            body.put("firstName", user.getFirstName());
            body.put("lastName", user.getLastName());
            body.put("nationality", user.getNationality());

            return ResponseEntity.ok(body);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("error", "Profil güncellenemedi", "message", e.getMessage()));
        }
    }

    @PostMapping(path = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadAvatar(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @org.springframework.web.bind.annotation.RequestParam("file") MultipartFile file
    ) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
            }
            String token = authHeader.substring(7);
            Long userId = jwt.extractUserId(token);
            if (userId == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
            }

            if (file == null || file.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Boş dosya", "message", "Dosya yüklenemedi."));
            }

            long maxBytes = 512 * 1024; // 512KB
            if (file.getSize() > maxBytes) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "file_too_large",
                        "message", "Profil fotoğrafı en fazla 512KB olabilir."
                ));
            }

            String contentType = file.getContentType();
            if (contentType == null ||
                    !(contentType.equalsIgnoreCase("image/jpeg")
                            || contentType.equalsIgnoreCase("image/png")
                            || contentType.equalsIgnoreCase("image/webp"))) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "invalid_type",
                        "message", "Sadece JPEG, PNG veya WEBP formatındaki resimler kabul edilir."
                ));
            }

            User user = users.findById(userId)
                    .orElseThrow(() -> new UsernameNotFoundException("Kullanıcı bulunamadı."));

            user.setAvatar(file.getBytes());
            user.setAvatarContentType(contentType);
            user.setAvatarSize(file.getSize());
            
            try {
                users.save(user);
            } catch (Exception e) {
                e.printStackTrace();
                return ResponseEntity.status(500).body(Map.of(
                        "error", "save_failed",
                        "message", "Profil fotoğrafı kaydedilemedi: " + e.getMessage()
                ));
            }

            return ResponseEntity.ok(Map.of("success", true));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of(
                    "error", "upload_failed",
                    "message", "Profil fotoğrafı yüklenirken bir hata oluştu: " + e.getMessage()
            ));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of(
                    "error", "upload_failed",
                    "message", "Beklenmeyen bir hata oluştu: " + e.getMessage()
            ));
        }
    }
}
