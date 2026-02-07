package com.ariforhanus.wordle.controller;


import com.ariforhanus.wordle.config.SupportedLanguage;
import com.ariforhanus.wordle.dto.ScoreRequest;
import com.ariforhanus.wordle.dto.ScoreResponse;
import com.ariforhanus.wordle.dto.UserStatsResponse;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.ScoreService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1")
public class ScoreController {
    private final ScoreService service;
    private final JwtUtil jwt;
    private final UserRepository users;
    private final ZoneId appZone;

    public ScoreController(ScoreService service, JwtUtil jwt, UserRepository users,
                           @Value("${app.timezone:Europe/Istanbul}") String timezone) {
        this.service = service;
        this.jwt = jwt;
        this.users = users;
        this.appZone = ZoneId.of(timezone);
    }

    /**
     * Daily Challenge skor kaydetme
     * Kullanıcı her dilde günde 1 kez oynayabilir
     */
    @PostMapping("/scores")
    public ResponseEntity<?> submit(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(value = "lang", defaultValue = "en") String lang,
            @Valid @RequestBody ScoreRequest req) {

        String normalizedLang;
        try {
            normalizedLang = SupportedLanguage.fromParam(lang).getCode();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_lang",
                    "supported", SupportedLanguage.supportedCodes()
            ));
        }

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).build();
        }

        String token = authHeader.substring(7);

        if (!jwt.isValid(token)) {
            return ResponseEntity.status(401).build();
        }

        Long userId = jwt.extractUserId(token);
        if (userId == null){
            return ResponseEntity.status(401).build();
        }
        var user = users.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).build();
        }
        String username = user.getUsername();

        try {
            ScoreResponse saved = service.saveForDaily(userId, username, normalizedLang, req);
            return ResponseEntity.ok(saved);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of(
                "error", "already_played",
                "message", "already_played"
            ));
        }
    }

    /**
     * Daily Challenge status: Bugün bu dilde oynayıp oynamadığını kontrol et
     */
    @GetMapping("/daily/status")
    public ResponseEntity<?> getDailyStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(value = "lang", defaultValue = "en") String lang) {

        String normalizedLang;
        try {
            normalizedLang = SupportedLanguage.fromParam(lang).getCode();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_lang",
                    "supported", SupportedLanguage.supportedCodes()
            ));
        }

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).build();
        }

        String token = authHeader.substring(7);

        if (!jwt.isValid(token)) {
            return ResponseEntity.status(401).build();
        }

        Long userId = jwt.extractUserId(token);
        if (userId == null){
            return ResponseEntity.status(401).build();
        }

        Optional<ScoreResponse> todayScore = service.getDailyStatus(userId, normalizedLang);
        
        if (todayScore.isPresent()) {
            return ResponseEntity.ok(Map.of(
                "played", true,
                "score", todayScore.get()
            ));
        } else {
            return ResponseEntity.ok(Map.of(
                "played", false
            ));
        }
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<?> global(
            @RequestParam(value = "lang", defaultValue = "en") String lang){
        String normalizedLang;
        try {
            normalizedLang = SupportedLanguage.fromParam(lang).getCode();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_lang",
                    "supported", SupportedLanguage.supportedCodes()
            ));
        }
        return ResponseEntity.ok(service.topGlobal(normalizedLang));
    }


    @GetMapping("/leaderboard/daily")
    public ResponseEntity<?> daily(
            @RequestParam(value = "lang", defaultValue = "en") String lang){
        String normalizedLang;
        try {
            normalizedLang = SupportedLanguage.fromParam(lang).getCode();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_lang",
                    "supported", SupportedLanguage.supportedCodes()
            ));
        }
        return ResponseEntity.ok(service.dailyTop(normalizedLang, 10, appZone));
    }

    @GetMapping("/leaderboard/weekly")
    public ResponseEntity<?> weekly(
            @RequestParam(value = "lang", defaultValue = "en") String lang){
        String normalizedLang;
        try {
            normalizedLang = SupportedLanguage.fromParam(lang).getCode();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_lang",
                    "supported", SupportedLanguage.supportedCodes()
            ));
        }
        return ResponseEntity.ok(service.weeklyTop(normalizedLang, 10, appZone));
    }

    @GetMapping("/leaderboard/monthly")
    public ResponseEntity<?> monthly(
            @RequestParam(value = "lang", defaultValue = "en") String lang){
        String normalizedLang;
        try {
            normalizedLang = SupportedLanguage.fromParam(lang).getCode();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_lang",
                    "supported", SupportedLanguage.supportedCodes()
            ));
        }
        return ResponseEntity.ok(service.monthlyTop(normalizedLang, 10, appZone));
    }

    /**
     * Giriş yapmış kullanıcının basic istatistikleri.
     */
    @GetMapping("/stats/me")
    public ResponseEntity<?> myStats(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).build();
        }
        String token = authHeader.substring(7);
        if (!jwt.isValid(token)) {
            return ResponseEntity.status(401).build();
        }
        Long userId = jwt.extractUserId(token);
        if (userId == null) {
            return ResponseEntity.status(401).build();
        }

        UserStatsResponse stats = service.statsForUser(userId);
        return ResponseEntity.ok(stats);
    }


}
