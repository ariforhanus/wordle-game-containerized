package com.ariforhanus.wordle.controller;

import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.MailOutbox;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/mail-outbox")
public class MailOutboxAdminController {
    private final MailOutbox outbox;
    private final UserRepository users;

    public MailOutboxAdminController(MailOutbox outbox, UserRepository users) {
        this.outbox = outbox;
        this.users = users;
    }

    @GetMapping
    public Object jobs(@RequestParam(defaultValue = "0") int page) {
        return outbox.jobs(page);
    }

    @PostMapping("/{id}/retry")
    public Object retry(Authentication auth, @PathVariable UUID id) {
        outbox.retryBlocked(id, users.findByUsername(auth.getName()).orElseThrow().getId());
        return Map.of("accepted", true);
    }
}
