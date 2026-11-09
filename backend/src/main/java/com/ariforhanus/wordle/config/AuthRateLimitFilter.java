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
import java.util.*;

@Component
@Order(-101)
public class AuthRateLimitFilter extends OncePerRequestFilter {
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

    private boolean allow(String key, int seconds, int limit) {
        long start = clock.instant().getEpochSecond() / seconds * seconds;
        Integer attempts =
                db.queryForObject(
                        "INSERT INTO auth_rate_limits(bucket_key,window_start,attempts) VALUES"
                            + " (?,?,1) ON CONFLICT(bucket_key,window_start) DO UPDATE SET"
                            + " attempts=LEAST(auth_rate_limits.attempts+1,1000000) RETURNING"
                            + " attempts",
                        Integer.class,
                        AccountService.digest(key),
                        Timestamp.from(java.time.Instant.ofEpochSecond(start)));
        return attempts != null && attempts <= limit;
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
        boolean allowed = allow("ip:" + req.getRemoteAddr(), 60, 120);
        if (path.endsWith("/register"))
            allowed = allow("registration:" + req.getRemoteAddr(), 3600, 20) && allowed;
        byte[] body = req.getInputStream().readNBytes(16385);
        if (body.length > 16384) {
            res.sendError(413);
            return;
        }
        if (path.endsWith("/login") || path.endsWith("/forgot-password")) {
            try {
                var node = json.readTree(body);
                String field = path.endsWith("/login") ? "username" : "email";
                String identity =
                        node == null
                                ? ""
                                : node.path(field).asText("").trim().toLowerCase(Locale.ROOT);
                if (!identity.isEmpty())
                    allowed =
                            allow(
                                            path + ":" + identity,
                                            path.endsWith("/login") ? 900 : 3600,
                                            path.endsWith("/login") ? 10 : 3)
                                    && allowed;
            } catch (IOException ignored) {
                /* Validation returns a controlled error later. */
            }
        }
        if (path.endsWith("/verification"))
            allowed = allow("verification:" + req.getRemoteAddr(), 3600, 20) && allowed;
        if (!allowed) {
            res.setStatus(429);
            res.setHeader("Retry-After", "60");
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"rate_limited\"}");
            return;
        }
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
