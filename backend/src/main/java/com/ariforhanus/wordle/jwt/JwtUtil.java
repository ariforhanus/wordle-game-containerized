package com.ariforhanus.wordle.jwt;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.expiration}")
    private String expirationTime;

    private SecretKey signingKey(){
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, String username, String role){
        Date now = new Date();
        long expirationMs = Long.parseLong(expirationTime);
        Date exp = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("username", username)
                .claim("role", role)
                .issuedAt(now)
                .expiration(exp)
                .signWith(signingKey())
                .compact();
    }

    /** Backward-compatible overload (defaults to USER role) */
    public String generateToken(Long userId, String username){
        return generateToken(userId, username, "USER");
    }

    public Long extractUserId(String token){
        String sub = claims(token).getSubject();
        try{
            return Long.parseLong(sub);
        } catch (NumberFormatException e){
            return null;
        }
    }

    public String extractUsername(String token){
        return claims(token).get("username", String.class);
    }

    public String extractRole(String token){
        String role = claims(token).get("role", String.class);
        return role != null ? role : "USER";
    }

    public boolean isValid(String token){
        try{
            return claims(token).getExpiration().after(new Date());
        } catch (Exception e){
            return false;
        }
    }

    private Claims claims(String token){
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
