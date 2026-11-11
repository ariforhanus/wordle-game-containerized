package com.ariforhanus.wordle.config;

import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.service.AppUserDetailsService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@Configuration
public class SecurityConfig {

    private final AppUserDetailsService uds;
    private final JwtUtil jwtUtil;
    private final com.ariforhanus.wordle.repository.UserRepository users;

    public SecurityConfig(
            AppUserDetailsService uds,
            JwtUtil jwtUtil,
            com.ariforhanus.wordle.repository.UserRepository users) {
        this.users = users;
        this.uds = uds;
        this.jwtUtil = jwtUtil;
    }

    @Bean
    public PasswordEncoder PasswordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filter(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(
                        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        reg ->
                                reg.requestMatchers("/api/v1/admin/**")
                                        .hasRole("ADMIN")
                                        .requestMatchers(
                                                org.springframework.http.HttpMethod.POST,
                                                "/api/v1/auth/login",
                                                "/api/v1/auth/register",
                                                "/api/v1/account/forgot-password",
                                                "/api/v1/account/reset-password",
                                                "/api/v1/account/verify-email")
                                        .permitAll()
                                        .requestMatchers(
                                                org.springframework.http.HttpMethod.GET,
                                                "/api/v1/word/random",
                                                "/api/v1/leaderboard/**",
                                                "/api/v1/leaderboard",
                                                "/actuator/health",
                                                "/actuator/health/**")
                                        .permitAll()
                                        .requestMatchers("/api/**")
                                        .authenticated()
                                        .anyRequest()
                                        .denyAll())
                .exceptionHandling(
                        ex -> ex.authenticationEntryPoint((req, res, err) -> res.sendError(401)))
                .addFilterBefore(jwtAuthFilter(), UsernamePasswordAuthenticationFilter.class)
                .userDetailsService(uds);
        return http.build();
    }

    /**
     * JWT filter that extracts the role from the token and sets Spring Security context. This
     * enables role-based access control for admin endpoints.
     */
    @Bean
    public OncePerRequestFilter jwtAuthFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(
                    HttpServletRequest request,
                    HttpServletResponse response,
                    FilterChain filterChain)
                    throws ServletException, IOException {
                String authHeader = request.getHeader("Authorization");
                if (authHeader != null && authHeader.startsWith("Bearer ")) {
                    String token = authHeader.substring(7);
                    try {
                        if (jwtUtil.isValid(token)) {
                            Long userId = jwtUtil.extractUserId(token);
                            var user = userId == null ? null : users.findById(userId).orElse(null);
                            String username = user == null ? null : user.getUsername();
                            String role = user == null ? null : user.getRole();

                            if (user != null
                                    && jwtUtil.extractAuthVersion(token) == user.getAuthVersion()) {
                                // Spring Security expects ROLE_ prefix
                                var authorities =
                                        List.of(new SimpleGrantedAuthority("ROLE_" + role));
                                var auth =
                                        new UsernamePasswordAuthenticationToken(
                                                username, null, authorities);
                                SecurityContextHolder.getContext().setAuthentication(auth);
                            }
                        }
                    } catch (Exception ignored) {
                        // Invalid token — continue without authentication
                    }
                }
                filterChain.doFilter(request, response);
            }
        };
    }

    @org.springframework.beans.factory.annotation.Value("${app.cors-origins:}")
    private String allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(
                Arrays.stream(allowedOrigins.split(","))
                        .map(String::trim)
                        .filter(v -> !v.isEmpty())
                        .toList());
        configuration.setAllowedMethods(
                Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setExposedHeaders(Arrays.asList("*"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config)
            throws Exception {
        return config.getAuthenticationManager();
    }
}
