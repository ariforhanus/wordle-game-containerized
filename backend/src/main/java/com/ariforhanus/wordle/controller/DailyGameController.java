package com.ariforhanus.wordle.controller;

import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.DailyGameService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/daily/games")
public class DailyGameController {
    private final DailyGameService games;
    private final UserRepository users;

    @org.springframework.beans.factory.annotation.Value("${app.require-verified-email:false}")
    private boolean requireVerification;

    public DailyGameController(DailyGameService games, UserRepository users) {
        this.games = games;
        this.users = users;
    }

    private long userId(Authentication auth) {
        var user = users.findByUsername(auth.getName()).orElseThrow();
        if (requireVerification && !user.isEmailVerified())
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "verify_email_first");
        return user.getId();
    }

    @PostMapping
    public DailyGameService.GameView start(
            Authentication auth, @RequestParam(defaultValue = "en") String lang) {
        return games.start(userId(auth), lang);
    }

    @GetMapping("/{id}")
    public DailyGameService.GameView get(Authentication auth, @PathVariable String id) {
        return games.get(userId(auth), id);
    }

    @PostMapping("/{id}/guesses")
    public DailyGameService.GameView guess(
            Authentication auth, @PathVariable String id, @Valid @RequestBody GuessRequest req) {
        return games.guess(userId(auth), id, req.guess(), req.attempt());
    }

    public record GuessRequest(
            @NotBlank @Size(min = 5, max = 5) String guess, @Min(1) @Max(6) int attempt) {}
}
