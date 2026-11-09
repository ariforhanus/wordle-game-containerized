package com.ariforhanus.wordle.controller;

import com.ariforhanus.wordle.config.SupportedLanguage;
import com.ariforhanus.wordle.dto.WordDto;
import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.repository.ScoreRepository;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.WordService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;

/** Admin-only endpoints. Protected by ROLE_ADMIN in SecurityConfig. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final UserRepository userRepo;
    private final ScoreRepository scoreRepo;
    private final WordService wordService;
    private final ZoneId appZone;

    public AdminController(
            UserRepository userRepo,
            ScoreRepository scoreRepo,
            WordService wordService,
            @org.springframework.beans.factory.annotation.Value("${app.timezone:Europe/Istanbul}")
                    String timezone) {
        this.userRepo = userRepo;
        this.scoreRepo = scoreRepo;
        this.wordService = wordService;
        this.appZone = ZoneId.of(timezone);
    }

    // ── Dashboard stats ─────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<?> dashboardStats() {
        long totalUsers = userRepo.count();
        long totalGames = scoreRepo.count();

        LocalDate today = ZonedDateTime.now(appZone).toLocalDate();

        long todayPlayers = scoreRepo.countPlayersOn(today);
        long activeUsers = scoreRepo.countPlayersSince(today.minusDays(6));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalUsers", totalUsers);
        stats.put("totalGames", totalGames);
        stats.put("todayPlayers", todayPlayers);
        stats.put("activeUsers", activeUsers);

        return ResponseEntity.ok(stats);
    }

    // ── User management ─────────────────────────────────────

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(
            @RequestParam(value = "search", required = false) String search,
            @RequestParam(value = "page", defaultValue = "0") int page) {
        var pageable =
                org.springframework.data.domain.PageRequest.of(
                        Math.max(0, page), 50, org.springframework.data.domain.Sort.by("id"));
        List<User> allUsers =
                (search == null || search.isBlank()
                                ? userRepo.findAll(pageable)
                                : userRepo.search(search.trim(), pageable))
                        .getContent();

        // Map to DTOs (exclude sensitive fields like passwordHash, avatar bytes)
        List<Map<String, Object>> result =
                allUsers.stream()
                        .map(
                                u -> {
                                    Map<String, Object> m = new LinkedHashMap<>();
                                    m.put("id", u.getId());
                                    m.put("username", u.getUsername());
                                    m.put("email", u.getEmail());
                                    m.put("role", u.getRole());
                                    m.put("firstName", u.getFirstName());
                                    m.put("lastName", u.getLastName());
                                    m.put("nationality", u.getNationality());
                                    m.put(
                                            "createdAt",
                                            u.getCreatedAt() != null
                                                    ? u.getCreatedAt().toString()
                                                    : null);
                                    // Count games for this user
                                    long gameCount = scoreRepo.countByUserId(u.getId());
                                    m.put("totalGames", gameCount);
                                    return m;
                                })
                        .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<?> getUser(@PathVariable Long id) {
        var opt = userRepo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        User u = opt.get();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("email", u.getEmail());
        m.put("role", u.getRole());
        m.put("firstName", u.getFirstName());
        m.put("lastName", u.getLastName());
        m.put("nationality", u.getNationality());
        m.put("createdAt", u.getCreatedAt() != null ? u.getCreatedAt().toString() : null);
        m.put("totalGames", scoreRepo.countByUserId(u.getId()));
        return ResponseEntity.ok(m);
    }

    @PutMapping("/users/{id}/role")
    public ResponseEntity<?> changeRole(
            @PathVariable Long id, @RequestBody Map<String, String> body) {
        String newRole = body.get("role");
        if (newRole == null || (!newRole.equals("USER") && !newRole.equals("ADMIN"))) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_role"));
        }

        var opt = userRepo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = opt.get();
        user.setRole(newRole);
        userRepo.save(user);

        return ResponseEntity.ok(
                Map.of(
                        "id", user.getId(),
                        "username", user.getUsername(),
                        "role", user.getRole()));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        var opt = userRepo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        userRepo.deleteById(id);
        return ResponseEntity.ok(Map.of("deleted", true, "id", id));
    }

    // ── Daily word info ─────────────────────────────────────

    @GetMapping("/daily-word")
    public ResponseEntity<?> dailyWord() {
        List<String> langs = SupportedLanguage.supportedCodes();
        Map<String, Object> result = new LinkedHashMap<>();
        for (String lang : langs) {
            try {
                WordDto dto = wordService.getDailyWord(lang);
                Map<String, String> wordInfo = new LinkedHashMap<>();
                wordInfo.put("word", dto.word());
                wordInfo.put("definition", dto.definition());
                result.put(lang, wordInfo);
            } catch (Exception e) {
                result.put(lang, Map.of("error", e.getMessage()));
            }
        }
        return ResponseEntity.ok(result);
    }
}
