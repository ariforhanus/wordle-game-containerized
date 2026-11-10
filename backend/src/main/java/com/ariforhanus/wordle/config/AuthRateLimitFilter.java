package com.ariforhanus.wordle.config;

import com.ariforhanus.wordle.service.AccountService;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.*;
import jakarta.servlet.http.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

@Component
@Order(-101)
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private record Policy(int seconds, int limit) {}

    private static final Policy PEER = new Policy(60, 120);
    private static final Policy REGISTRATION = new Policy(3600, 20);
    private static final Policy LOGIN = new Policy(900, 10);
    private static final Policy RESET = new Policy(3600, 3);
    private static final Policy VERIFICATION = new Policy(3600, 20);
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;
    private final boolean enabled;

    public AuthRateLimitFilter(
            JdbcTemplate db,
            ObjectMapper json,
            Clock clock,
            @Value("${app.auth-rate-limit.enabled:true}") boolean enabled) {
        this.db = db;
        this.json = json;
        this.clock = clock;
        this.enabled = enabled;
    }

    private boolean admit(String key, Policy policy, Instant now, HttpServletResponse res)
            throws IOException {
        long epoch = now.getEpochSecond();
        long start = Math.floorDiv(epoch, policy.seconds()) * policy.seconds();
        // Once full, keep the row bounded without creating more heap versions for denials.
        // The conditional UPSERT is atomic across all application instances.
        boolean allowed =
                !db.queryForList(
                                "INSERT INTO auth_rate_limits(bucket_key,window_start,attempts)"
                                    + " VALUES (?,?,1) ON CONFLICT(bucket_key,window_start) DO"
                                    + " UPDATE SET attempts=auth_rate_limits.attempts+1 WHERE"
                                    + " auth_rate_limits.attempts < ? RETURNING attempts",
                                Integer.class,
                                AccountService.digest(key),
                                Timestamp.from(Instant.ofEpochSecond(start)),
                                policy.limit())
                        .isEmpty();
        if (!allowed) {
            res.setStatus(429);
            // Ceiling seconds to this fixed window's end, using the same request instant.
            res.setHeader(
                    "Retry-After",
                    Long.toString(policy.seconds() - Math.floorMod(epoch, policy.seconds())));
            res.setHeader("Cache-Control", "no-store");
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"rate_limited\"}");
        }
        return allowed;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String path = req.getRequestURI();
        if (!enabled
                || path.equals("/api/v1/auth/avatar")
                || !req.getMethod().equals("POST")
                || !(path.startsWith("/api/v1/auth/") || path.startsWith("/api/v1/account/"))) {
            chain.doFilter(req, res);
            return;
        }
        // Never trust client-supplied X-Forwarded-For for authentication controls.
        Instant now = clock.instant();
        if (!admit("ip:" + req.getRemoteAddr(), PEER, now, res)) return;
        if (path.endsWith("/register")
                && !admit("registration:" + req.getRemoteAddr(), REGISTRATION, now, res)) return;
        byte[] body = req.getInputStream().readNBytes(16385);
        if (body.length > 16384) {
            res.sendError(413);
            return;
        }
        if (path.endsWith("/login") || path.endsWith("/forgot-password")) {
            String identity = "";
            try {
                var node = json.readTree(body);
                String field = path.endsWith("/login") ? "username" : "email";
                identity =
                        node == null
                                ? ""
                                : node.path(field).asText("").trim().toLowerCase(Locale.ROOT);
            } catch (IOException ignored) {
                /* Validation returns a controlled error later. */
            }
            if (!identity.isEmpty()
                    && !admit(
                            path + ":" + identity,
                            path.endsWith("/login") ? LOGIN : RESET,
                            now,
                            res)) return;
        }
        if (path.endsWith("/verification")
                && !admit("verification:" + req.getRemoteAddr(), VERIFICATION, now, res)) return;
        chain.doFilter(
                new HttpServletRequestWrapper(req) {
                    @Override
                    public ServletInputStream getInputStream() {
                        var input = new ByteArrayInputStream(body);
                        return new ServletInputStream() {
                            public int read() {
                                return input.read();
                            }

                            public boolean isFinished() {
                                return input.available() == 0;
                            }

                            public boolean isReady() {
                                return true;
                            }

                            public void setReadListener(ReadListener listener) {
                                throw new UnsupportedOperationException();
                            }
                        };
                    }

                    @Override
                    public BufferedReader getReader() {
                        return new BufferedReader(
                                new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
                    }
                },
                res);
    }
}
