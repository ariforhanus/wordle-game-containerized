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

    public String generateToken(Long userId){
        Date now= new Date();
        long expirationMs = Long.parseLong(expirationTime);
        Date exp= new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .issuedAt(now)
                .expiration(exp)
                .signWith(signingKey())
                .compact();

    }

    public Long extractUserId(String token){
        String sub = claims(token).getSubject();
        try{
            return Long.parseLong(sub);
        } catch (NumberFormatException e){
            return null;
        }
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
