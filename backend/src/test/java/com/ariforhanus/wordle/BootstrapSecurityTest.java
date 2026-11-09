package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.ariforhanus.wordle.config.AdminSeeder;
import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

class BootstrapSecurityTest {
    @Test
    void existingRegularUserCannotBePromotedByBootstrap() {
        var users = mock(UserRepository.class);
        var encoder = new BCryptPasswordEncoder();
        var user = new User();
        user.setRole("USER");
        user.setEmail("attacker@example.com");
        when(users.findByUsername("admin")).thenReturn(Optional.of(user));
        var seeder =
                new AdminSeeder(
                        users,
                        encoder,
                        java.time.Clock.fixed(
                                com.ariforhanus.wordle.support.TestTimes.DAYTIME,
                                java.time.ZoneOffset.UTC));
        ReflectionTestUtils.setField(seeder, "adminUsername", "admin");
        ReflectionTestUtils.setField(seeder, "adminPassword", "unique-bootstrap-password");
        ReflectionTestUtils.setField(seeder, "adminEmail", "owner@example.com");
        assertThrows(IllegalStateException.class, () -> seeder.run(null));
        verify(users, never()).save(any());
    }

    @Test
    void newBootstrapAdminUsesTheInjectedCreationTime() {
        var users = mock(UserRepository.class);
        when(users.findByUsername("admin")).thenReturn(Optional.empty());
        var time = com.ariforhanus.wordle.support.TestTimes.DAYTIME;
        var seeder =
                new AdminSeeder(
                        users,
                        new BCryptPasswordEncoder(),
                        java.time.Clock.fixed(time, java.time.ZoneOffset.UTC));
        ReflectionTestUtils.setField(seeder, "adminUsername", "admin");
        ReflectionTestUtils.setField(seeder, "adminPassword", "unique-bootstrap-password");
        ReflectionTestUtils.setField(seeder, "adminEmail", "owner@example.com");
        seeder.run(null);
        verify(users)
                .save(
                        argThat(
                                user ->
                                        time.equals(user.getCreatedAt())
                                                && "ADMIN".equals(user.getRole())));
    }

    @Test
    void signingKeyConfigurationFailsBeforeServingRequests() {
        var jwt =
                new JwtUtil(
                        java.time.Clock.fixed(
                                com.ariforhanus.wordle.support.TestTimes.DAYTIME,
                                java.time.ZoneOffset.UTC));
        ReflectionTestUtils.setField(jwt, "secretKey", "short");
        assertThrows(IllegalStateException.class, jwt::validateConfiguration);
    }
}
