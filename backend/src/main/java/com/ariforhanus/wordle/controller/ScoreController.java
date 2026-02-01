package com.ariforhanus.wordle.controller;


import com.ariforhanus.wordle.dto.ScoreRequest;
import com.ariforhanus.wordle.dto.ScoreResponse;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.ScoreService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class ScoreController {
    private final ScoreService service;
    private final JwtUtil jwt;
    private final UserRepository users;

    public ScoreController(ScoreService service, JwtUtil jwt, UserRepository users) {
        this.service = service;
        this.jwt = jwt;
        this.users = users;
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
            ScoreResponse saved = service.saveForDaily(userId, username, lang, req);
            return ResponseEntity.ok(saved);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of(
                "error", "already_played",
                "message", "Bugün bu dilde zaten oynadın!"
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

        Optional<ScoreResponse> todayScore = service.getDailyStatus(userId, lang);
        
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
    public ResponseEntity<List<ScoreResponse>> global(
            @RequestParam(value = "lang", defaultValue = "en") String lang){
        return ResponseEntity.ok(service.topGlobal(lang));
    }


    @GetMapping("/leaderboard/daily")
    public ResponseEntity<List<ScoreResponse>> daily(
            @RequestParam(value = "lang", defaultValue = "en") String lang){
        return ResponseEntity.ok(service.dailyTop(lang, 10, ZoneId.of("Europe/Istanbul")));
    }


}
