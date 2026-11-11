package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ariforhanus.wordle.config.AuthRateLimitFilter;
import com.ariforhanus.wordle.service.AccountMail;
import com.ariforhanus.wordle.service.AccountService;
import com.ariforhanus.wordle.support.MutableClock;
import com.ariforhanus.wordle.support.TestClockConfiguration;
import tools.jackson.databind.ObjectMapper;

import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletResponseWrapper;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestClockConfiguration.class)
class AuthRateLimitIntegrationTest {
    @Autowired MockMvc http;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired MutableClock clock;
    @MockitoBean AccountMail mail;

    @BeforeEach
    void resetData() {
        db.execute(
                "TRUNCATE"
                    + " auth_rate_limits,security_audit,account_tokens,daily_games,daily_puzzles,scores,users"
                    + " RESTART IDENTITY CASCADE");
        clock.set(DAYTIME);
        reset(mail);
    }

    private ResultActions login(String peer, String username) throws Exception {
        return http.perform(
                post("/api/v1/auth/login")
                        .with(
                                req -> {
                                    req.setRemoteAddr(peer);
                                    return req;
                                })
                        .contentType("application/json")
                        .content(
                                json.writeValueAsString(
                                        Map.of(
                                                "username",
                                                username,
                                                "password",
                                                "wrong-fixture-password"))));
    }

    private void seedBudget(String key, int seconds, int attempts) {
        long window = Math.floorDiv(clock.instant().getEpochSecond(), seconds) * seconds;
        db.update(
                "INSERT INTO auth_rate_limits(bucket_key,window_start,attempts) VALUES (?,?,?)",
                AccountService.digest(key),
                Timestamp.from(java.time.Instant.ofEpochSecond(window)),
                attempts);
    }

    private int budget(String key) {
        return db.queryForObject(
                "SELECT max(attempts) FROM auth_rate_limits WHERE bucket_key=?",
                Integer.class,
                AccountService.digest(key));
    }

    @Test
    void normalizedAccountBudgetSurvivesPeerRotationAndResetsAtTheExactWindowEnd()
            throws Exception {
        String key = "/api/v1/auth/login:missing";
        for (int i = 0; i < 10; i++)
            login("192.0.2." + i, i % 2 == 0 ? " MISSING " : "missing")
                    .andExpect(status().isUnauthorized());
        login("192.0.2.50", "missing")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "900"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.error").value("rate_limited"));
        assertEquals(10, budget(key));
        clock.advance(Duration.ofMinutes(15).minusMillis(500));
        login("192.0.2.51", "missing")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "1"));
        clock.advance(Duration.ofMillis(500));
        login("192.0.2.52", "missing").andExpect(status().isUnauthorized());
        assertEquals(
                List.of(10, 1),
                db.queryForList(
                        "SELECT attempts FROM auth_rate_limits WHERE bucket_key=? ORDER BY"
                            + " window_start",
                        Integer.class,
                        AccountService.digest(key)));
    }

    @Test
    void blockedPeerCannotReadBodiesAllocateRotatingIdentityBucketsOrSpoofItsWayOut()
            throws Exception {
        String peer = "192.0.2.60";
        seedBudget("ip:" + peer, 60, 120);
        var req =
                new MockHttpServletRequest("POST", "/api/v1/auth/login") {
                    @Override
                    public ServletInputStream getInputStream() {
                        throw new AssertionError("Blocked body must not be read");
                    }
                };
        req.setRemoteAddr(peer);
        var response = new MockHttpServletResponse();
        new AuthRateLimitFilter(db, json, clock, true)
                .doFilter(req, response, (request, res) -> fail("Blocked handler invoked"));
        assertEquals(429, response.getStatus());
        for (int i = 0; i < 20; i++)
            http.perform(
                            post("/api/v1/account/forgot-password")
                                    .with(
                                            request -> {
                                                request.setRemoteAddr(peer);
                                                return request;
                                            })
                                    .header("X-Forwarded-For", "198.51.100." + i)
                                    .header("X-Real-IP", "203.0.113." + i)
                                    .header("Forwarded", "for=198.51.100." + i)
                                    .contentType("application/json")
                                    .content("{\"email\":\"rotating-" + i + "@example.test\"}"))
                    .andExpect(status().isTooManyRequests())
                    .andExpect(header().string("Retry-After", "60"));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM auth_rate_limits", Integer.class));
        assertEquals(120, budget("ip:" + peer));
        verifyNoInteractions(mail);
        login("192.0.2.61", "independent").andExpect(status().isUnauthorized());
    }

    @Test
    void malformedAndOversizedBodiesConsumeOnlyThePeerBudget() throws Exception {
        http.perform(
                        post("/api/v1/auth/login")
                                .contentType("application/json")
                                .content("x".repeat(16385)))
                .andExpect(status().isPayloadTooLarge());
        http.perform(post("/api/v1/auth/login").contentType("application/json").content("{invalid"))
                .andExpect(status().isBadRequest());
        assertEquals(1, db.queryForObject("SELECT count(*) FROM auth_rate_limits", Integer.class));
        assertEquals(2, budget("ip:127.0.0.1"));
    }

    private ResultActions register(int index) throws Exception {
        return http.perform(
                post("/api/v1/auth/register")
                        .with(
                                req -> {
                                    req.setRemoteAddr("192.0.2.70");
                                    return req;
                                })
                        .header("X-Forwarded-For", "198.51.100." + index)
                        .contentType("application/json")
                        .content(
                                json.writeValueAsString(
                                        Map.of(
                                                "username",
                                                "fixture_" + index,
                                                "email",
                                                "fixture_" + index + "@example.test",
                                                "password",
                                                "fixture-password-123"))));
    }

    @Test
    void registrationIsPeerBoundedAcrossIdentitiesAndOpensOnlyAtTheNextHour() throws Exception {
        for (int i = 0; i < 20; i++) register(i).andExpect(status().isOk());
        register(20)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "3600"));
        assertEquals(20, db.queryForObject("SELECT count(*) FROM users", Integer.class));
        assertEquals(20, budget("registration:192.0.2.70"));
        assertEquals(
                0,
                db.queryForObject(
                        "SELECT count(*) FROM users WHERE email_verified OR role <> 'USER'",
                        Integer.class));
        clock.advance(Duration.ofHours(1).minusMillis(500));
        register(20)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "1"));
        clock.advance(Duration.ofMillis(500));
        register(20).andExpect(status().isOk());
        assertEquals(21, db.queryForObject("SELECT count(*) FROM users", Integer.class));
    }

    @Test
    void resetUsesOneNormalizedAddressBudgetAcrossPeersWithoutMailOnDenial() throws Exception {
        for (int i = 0; i < 4; i++) {
            final int index = i;
            var result =
                    http.perform(
                            post("/api/v1/account/forgot-password")
                                    .with(
                                            req -> {
                                                req.setRemoteAddr("192.0.2." + index);
                                                return req;
                                            })
                                    .contentType("application/json")
                                    .content(
                                            "{\"email\":\""
                                                    + (i % 2 == 0 ? "MISSING" : "missing")
                                                    + "@example.test\"}"));
            if (i < 3) result.andExpect(status().isOk());
            else
                result.andExpect(status().isTooManyRequests())
                        .andExpect(header().string("Retry-After", "3600"));
        }
        assertEquals(3, budget("/api/v1/account/forgot-password:missing@example.test"));
        verify(mail, times(3)).requireAvailable();
        verify(mail, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void verificationResendBudgetIsPreservedAndCheckedBeforeTheController() throws Exception {
        for (int i = 0; i < 20; i++)
            http.perform(post("/api/v1/account/verification")).andExpect(status().isUnauthorized());
        http.perform(post("/api/v1/account/verification"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "3600"));
        assertEquals(20, budget("verification:127.0.0.1"));
        verifyNoInteractions(mail);
    }

    @Test
    void independentInstancesAtomicallyAdmitTenConcurrentIdentityAttempts() throws Exception {
        var first = new AuthRateLimitFilter(db, json, clock, true);
        var second = new AuthRateLimitFilter(db, json, clock, true);
        var admitted = new AtomicInteger();
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(12)) {
            var tasks = new ArrayList<Future<Integer>>();
            for (int i = 0; i < 12; i++) {
                final int index = i;
                tasks.add(
                        pool.submit(
                                () -> {
                                    var req =
                                            new MockHttpServletRequest(
                                                    "POST", "/api/v1/auth/login");
                                    req.setRemoteAddr("192.0.2." + index);
                                    req.setContent(
                                            "{\"username\":\"concurrent\",\"password\":\"wrong\"}"
                                                    .getBytes(StandardCharsets.UTF_8));
                                    var res = new MockHttpServletResponse();
                                    gate.await();
                                    (index % 2 == 0 ? first : second)
                                            .doFilter(
                                                    req,
                                                    res,
                                                    (request, response) -> {
                                                        admitted.incrementAndGet();
                                                        ((jakarta.servlet.http.HttpServletResponse)
                                                                        response)
                                                                .setStatus(401);
                                                    });
                                    return res.getStatus();
                                }));
            }
            gate.countDown();
            int blocked = 0;
            for (var task : tasks) if (task.get(10, TimeUnit.SECONDS) == 429) blocked++;
            assertEquals(10, admitted.get());
            assertEquals(2, blocked);
        }
        assertEquals(10, budget("/api/v1/auth/login:concurrent"));
    }

    @Test
    void disabledLocalFixtureLimiterDoesNotConsumeQuotas() throws Exception {
        var req = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        var count = new AtomicInteger();
        new AuthRateLimitFilter(db, json, clock, false)
                .doFilter(
                        req,
                        new MockHttpServletResponse(),
                        (request, response) -> count.incrementAndGet());
        assertEquals(1, count.get());
        assertEquals(0, db.queryForObject("SELECT count(*) FROM auth_rate_limits", Integer.class));
    }

    @Test
    void failedRejectionWriteCannotInvokeTheProtectedAction() {
        seedBudget("/api/v1/auth/login:missing", 900, 10);
        var req = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        req.setContent(
                "{\"username\":\"missing\",\"password\":\"wrong\"}"
                        .getBytes(StandardCharsets.UTF_8));
        var response =
                new HttpServletResponseWrapper(new MockHttpServletResponse()) {
                    @Override
                    public PrintWriter getWriter() throws IOException {
                        throw new IOException("Disconnected response fixture");
                    }
                };
        assertThrows(
                IOException.class,
                () ->
                        new AuthRateLimitFilter(db, json, clock, true)
                                .doFilter(
                                        req,
                                        response,
                                        (request, res) -> fail("Rejected action invoked")));
    }

    @Test
    void saturatedRowsFromOlderReleasesStayBlockedWithoutGrowing() throws Exception {
        seedBudget("/api/v1/auth/login:missing", 900, 1000000);
        login("192.0.2.90", "missing").andExpect(status().isTooManyRequests());
        assertEquals(1000000, budget("/api/v1/auth/login:missing"));
    }
}
