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


    @PostMapping("/scores")
    public ResponseEntity<ScoreResponse> submit(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
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

        ScoreResponse saved = service.saveFor(username, req);
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<List<ScoreResponse>> global(){
        return ResponseEntity.ok(service.topGlobal());
    }


    @GetMapping("/leaderboard/daily")
    public ResponseEntity<List<ScoreResponse>> daily(){
        return ResponseEntity.ok(service.dailyTop(10, ZoneId.of("Europe/Istanbul")));
    }


}
