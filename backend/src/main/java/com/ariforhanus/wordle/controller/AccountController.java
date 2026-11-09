package com.ariforhanus.wordle.controller;

import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.AccountService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/account")
public class AccountController {
    private final AccountService accounts;
    private final UserRepository users;

    public AccountController(AccountService accounts, UserRepository users) {
        this.accounts = accounts;
        this.users = users;
    }

    private long id(Authentication auth) {
        return users.findByUsername(auth.getName()).orElseThrow().getId();
    }

    private Map<String, Boolean> accepted() {
        return Map.of("accepted", true);
    }

    @PostMapping("/forgot-password")
    public Object forgot(@Valid @RequestBody EmailRequest req) {
        accounts.requestReset(req.email());
        return accepted();
    }

    @PostMapping("/reset-password")
    public Object reset(@Valid @RequestBody ResetRequest req) {
        accounts.consume(req.token(), "RESET", req.password());
        return accepted();
    }

    @PostMapping("/verify-email")
    public Object verify(@Valid @RequestBody TokenRequest req) {
        accounts.consume(req.token(), "VERIFY", null);
        return accepted();
    }

    @PostMapping("/verification")
    public Object requestVerification(Authentication auth) {
        accounts.requestVerification(id(auth));
        return accepted();
    }

    @PostMapping("/password")
    public Object password(Authentication auth, @Valid @RequestBody PasswordRequest req) {
        accounts.changePassword(id(auth), req.currentPassword(), req.password());
        return accepted();
    }

    @PostMapping("/logout-all")
    public Object logout(Authentication auth) {
        accounts.logoutAll(id(auth));
        return accepted();
    }

    @PostMapping("/delete")
    public Object delete(Authentication auth, @Valid @RequestBody DeleteRequest req) {
        accounts.delete(id(auth), req.password());
        return accepted();
    }

    public record EmailRequest(@NotBlank @Email @Size(max = 120) String email) {}

    public record TokenRequest(@NotBlank @Size(min = 43, max = 43) String token) {}

    public record ResetRequest(
            @NotBlank @Size(min = 43, max = 43) String token,
            @NotBlank @Size(min = 12, max = 72) String password) {}

    public record PasswordRequest(
            @NotBlank @Size(max = 72) String currentPassword,
            @NotBlank @Size(min = 12, max = 72) String password) {}

    public record DeleteRequest(@NotBlank @Size(max = 72) String password) {}
}
