package com.ariforhanus.wordle.jwt;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import javax.crypto.SecretKey;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.expiration}")
    private String expirationTime;

    @jakarta.annotation.PostConstruct
    public void validateConfiguration() {
        if (secretKey == null
                || secretKey.getBytes(StandardCharsets.UTF_8).length < 32
                || secretKey.contains("changeme")) {
            throw new IllegalStateException(
                    "JWT_SECRET must contain at least 32 bytes of random secret material");
        }
        signingKey();
    }

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, String username, String role) {
        return generateToken(userId, username, role, 0);
    }

    public String generateToken(Long userId, String username, String role, long authVersion) {
        Date now = new Date();
        long expirationMs = Long.parseLong(expirationTime);
        Date exp = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("username", username)
                .claim("role", role)
                .claim("authVersion", authVersion)
                .issuedAt(now)
                .expiration(exp)
                .signWith(signingKey())
                .compact();
    }

    /** Backward-compatible overload (defaults to USER role) */
    public String generateToken(Long userId, String username) {
        return generateToken(userId, username, "USER");
    }

    public Long extractUserId(String token) {
        String sub = claims(token).getSubject();
        try {
            return Long.parseLong(sub);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public String extractUsername(String token) {
        return claims(token).get("username", String.class);
    }

    public String extractRole(String token) {
        String role = claims(token).get("role", String.class);
        return role != null ? role : "USER";
    }

    public long extractAuthVersion(String token) {
        Number version = claims(token).get("authVersion", Number.class);
        return version == null ? 0 : version.longValue();
    }

    public boolean isValid(String token) {
        try {
            return claims(token).getExpiration().after(new Date());
        } catch (Exception e) {
            return false;
        }
    }

    private Claims claims(String token) {
        return Jwts.parser().verifyWith(signingKey()).build().parseSignedClaims(token).getPayload();
    }
}
