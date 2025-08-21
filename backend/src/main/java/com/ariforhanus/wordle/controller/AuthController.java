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
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500"})
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

        try {
            users.save(u);
            response.put("success", true);
            response.put("message", "Kayıt başarılı!");
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

            String token = jwt.generateToken(req.getUsername());
            return ResponseEntity.ok(new JwtResponse(token, jwtExpMs));

        } catch (BadCredentialsException ex){
            return ResponseEntity.status(401).build();
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader("Authorization") String authHeader){
        try {
            String token = authHeader.replace("bearer ", "");

            String username = jwt.extractUsername(token);

            var user = users.findByUsername(username)
                    .orElseThrow(()-> new UsernameNotFoundException("Kullanıcı bulunamadı."));

            Map<String, Object> body = Map.of(
                    "username", user.getUsername(),
                    "email", user.getEmail(),
                    "role", user.getRole()
            );
            return ResponseEntity.ok(body);
        }catch(Exception e){
            return ResponseEntity.status(401).body(Map.of("error", "Geçersiz token"));
        }
    }
}
