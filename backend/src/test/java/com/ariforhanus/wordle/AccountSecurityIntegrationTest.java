package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

@SpringBootTest(properties = "app.require-verified-email=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(SecurityAndGameIntegrationTest.TimeConfig.class)
class AccountSecurityIntegrationTest {
    @Autowired MockMvc http;
    @Autowired JdbcTemplate db;
    @Autowired UserRepository users;
    @Autowired JwtUtil jwt;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean PasswordEncoder encoder;
    @Autowired ObjectMapper json;
    @Autowired AccountService accounts;
    @Autowired SecurityAndGameIntegrationTest.MutableClock clock;
    @MockitoBean AccountMail mail;
    User user;
    String token;
    List<String> delivered;

    @BeforeEach
    void setup() {
        db.execute(
                "TRUNCATE auth_rate_limits, security_audit, daily_games, daily_puzzles, scores,"
                        + " users RESTART IDENTITY CASCADE");
        clock.now.set(Instant.parse("2026-11-09T20:59:00Z"));
        user = new User();
        user.setUsername("player");
        user.setEmail("player@example.com");
        user.setPasswordHash(encoder.encode("original-password-123"));
        user = users.save(user);
        token = jwt.generateToken(user.getId(), user.getUsername(), "USER");
        reset(mail);
        delivered = new ArrayList<>();
        doAnswer(
                        inv -> {
                            delivered.add(inv.getArgument(2));
                            return null;
                        })
                .when(mail)
                .send(anyString(), anyString(), anyString());
    }

    @Test
    void passwordChangeRevokesEveryOldToken() throws Exception {
        http.perform(
                        post("/api/v1/account/password")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content(
                                        "{\"currentPassword\":\"wrong\",\"password\":\"next-password-123\"}"))
                .andExpect(status().isBadRequest());
        http.perform(
                        post("/api/v1/account/password")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content(
                                        "{\"currentPassword\":\"original-password-123\",\"password\":\"next-password-123\"}"))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        var result =
                http.perform(
                                post("/api/v1/auth/login")
                                        .contentType("application/json")
                                        .content(
                                                "{\"username\":\"player\",\"password\":\"next-password-123\"}"))
                        .andExpect(status().isOk())
                        .andReturn();
        String next =
                json.readTree(result.getResponse().getContentAsString()).path("token").asText();
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + next))
                .andExpect(status().isOk());
    }

    @Test
    void logoutAllRevokesCopiedTokens() throws Exception {
        http.perform(post("/api/v1/account/logout-all").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void resetIsPrivateSingleUseAndRevokesSessions() throws Exception {
        var unknown =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"unknown@example.com\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertTrue(delivered.isEmpty());
        var known =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"player@example.com\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertEquals(unknown, known);
        String raw = delivered.getFirst();
        assertFalse(known.contains(raw));
        assertEquals(
                AccountService.digest(raw),
                db.queryForObject("SELECT token_hash FROM account_tokens", String.class));
        accounts.consume(raw, "RESET", "reset-password-123");
        assertThrows(Exception.class, () -> accounts.consume(raw, "RESET", "again-password-123"));
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertTrue(
                encoder.matches(
                        "reset-password-123",
                        users.findById(user.getId()).orElseThrow().getPasswordHash()));
    }

    @Test
    void resetExpiresAndOlderLinksAreInvalidated() {
        accounts.requestReset(user.getEmail());
        String first = delivered.getFirst();
        accounts.requestReset(user.getEmail());
        String second = delivered.getLast();
        assertThrows(Exception.class, () -> accounts.consume(first, "RESET", "next-password-123"));
        clock.now.set(clock.instant().plusSeconds(1801));
        assertThrows(Exception.class, () -> accounts.consume(second, "RESET", "next-password-123"));
    }

    @Test
    void verificationCannotBeUsedAsAPasswordResetAndUnlocksRankedPlay() throws Exception {
        http.perform(post("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        accounts.requestVerification(user.getId());
        String link = delivered.getFirst();
        assertThrows(Exception.class, () -> accounts.consume(link, "RESET", "next-password-123"));
        accounts.consume(link, "VERIFY", null);
        assertTrue(users.findById(user.getId()).orElseThrow().isEmailVerified());
        http.perform(post("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        assertThrows(Exception.class, () -> accounts.consume(link, "VERIFY", null));
    }

    @Test
    void concurrentResetConsumesTokenOnce() throws Exception {
        accounts.requestReset(user.getEmail());
        String link = delivered.getFirst();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<Boolean> action =
                    () -> {
                        start.await();
                        try {
                            accounts.consume(link, "RESET", "reset-password-123");
                            return true;
                        } catch (org.springframework.web.server.ResponseStatusException ex) {
                            return false;
                        }
                    };
            var a = pool.submit(action);
            var b = pool.submit(action);
            start.countDown();
            assertNotEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
        }
        assertEquals(1L, users.findById(user.getId()).orElseThrow().getAuthVersion());
    }

    @Test
    void loginLimitsFollowAccountAcrossDifferentAddresses() throws Exception {
        for (int i = 0; i < 10; i++) {
            final int index = i;
            http.perform(
                            post("/api/v1/auth/login")
                                    .with(
                                            req -> {
                                                req.setRemoteAddr("192.0.2." + index);
                                                return req;
                                            })
                                    .contentType("application/json")
                                    .content("{\"username\":\"player\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized());
        }
        http.perform(
                        post("/api/v1/auth/login")
                                .contentType("application/json")
                                .content("{\"username\":\"player\",\"password\":\"wrong\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }

    @Test
    void resetRequestRateLimitDoesNotRevealAccountExistence() throws Exception {
        for (int i = 0; i < 3; i++)
            http.perform(
                            post("/api/v1/account/forgot-password")
                                    .contentType("application/json")
                                    .content("{\"email\":\"unknown@example.com\"}"))
                    .andExpect(status().isOk());
        http.perform(
                        post("/api/v1/account/forgot-password")
                                .contentType("application/json")
                                .content("{\"email\":\"unknown@example.com\"}"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void deletionRequiresPasswordAndErasesLinkedData() throws Exception {
        accounts.requestReset(user.getEmail());
        http.perform(
                        post("/api/v1/account/delete")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"password\":\"wrong\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(1, users.count());
        http.perform(
                        post("/api/v1/account/delete")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"password\":\"original-password-123\"}"))
                .andExpect(status().isOk());
        assertEquals(0, users.count());
        assertEquals(0, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
        assertNull(
                db.queryForMap("SELECT actor_id FROM security_audit WHERE action='ACCOUNT_DELETED'")
                        .get("actor_id"));
    }

    @Test
    void adminRoleChangesAreAuditedAndRevokeTargetSessions() throws Exception {
        User admin = new User();
        admin.setUsername("admin");
        admin.setEmail("admin@example.com");
        admin.setPasswordHash("unused");
        admin.setRole("ADMIN");
        admin = users.save(admin);
        String adminToken = jwt.generateToken(admin.getId(), "admin", "ADMIN");
        http.perform(
                        put("/api/v1/admin/users/" + user.getId() + "/role")
                                .header("Authorization", "Bearer " + adminToken)
                                .contentType("application/json")
                                .content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        http.perform(get("/api/v1/admin/audit").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("ADMIN_ROLE_ADMIN"));
    }

    @Test
    void passwordResetDuringLoginCannotMintANewerSessionVersion() throws Exception {
        doAnswer(
                        invocation -> {
                            db.update(
                                    "UPDATE users SET auth_version=auth_version+1,"
                                        + " version=version+1 WHERE id=?",
                                    user.getId());
                            return invocation.callRealMethod();
                        })
                .when(encoder)
                .matches(eq("original-password-123"), anyString());
        var result =
                http.perform(
                                post("/api/v1/auth/login")
                                        .contentType("application/json")
                                        .content(
                                                "{\"username\":\"player\",\"password\":\"original-password-123\"}"))
                        .andExpect(status().isOk())
                        .andReturn();
        String stale =
                json.readTree(result.getResponse().getContentAsString()).path("token").asText();
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + stale))
                .andExpect(status().isUnauthorized());
    }
}
