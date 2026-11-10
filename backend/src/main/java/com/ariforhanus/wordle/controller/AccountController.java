package com.ariforhanus.wordle.controller;

import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.AccountService;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/account")
public class AccountController {
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(AccountController.class);
    private final AccountService accounts;
    private final UserRepository users;
    private final Counter resetFailures;
    private final Counter verificationFailures;

    public AccountController(AccountService accounts, UserRepository users, MeterRegistry metrics) {
        this.accounts = accounts;
        this.users = users;
        resetFailures = metrics.counter("wordle.mail.delivery.failures", "purpose", "reset");
        verificationFailures =
                metrics.counter("wordle.mail.delivery.failures", "purpose", "verification");
    }

    private long id(Authentication auth) {
        return users.findByUsername(auth.getName()).orElseThrow().getId();
    }

    private Map<String, Boolean> accepted() {
        return Map.of("accepted", true);
    }

    @PostMapping("/forgot-password")
    public Object forgot(@Valid @RequestBody EmailRequest req) {
        try {
            accounts.requestReset(req.email());
        } catch (MailException ex) {
            // Service rollback has completed, preserving the old link.
            // Keep response status/body neutral; SMTP timing can still differ.
            resetFailures.increment();
            log.warn("Account email submission failed (purpose=reset)");
        }
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
        try {
            accounts.requestVerification(id(auth));
        } catch (MailException ex) {
            verificationFailures.increment();
            log.warn("Account email submission failed (purpose=verification)");
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "mail_unavailable");
        }
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
