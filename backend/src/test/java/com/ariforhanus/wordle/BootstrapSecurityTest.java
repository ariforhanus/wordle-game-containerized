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

    private AdminSeeder shortPasswordSeeder(UserRepository users, boolean enabled) {
        var seeder =
                new AdminSeeder(
                        users,
                        new BCryptPasswordEncoder(),
                        java.time.Clock.fixed(
                                com.ariforhanus.wordle.support.TestTimes.DAYTIME,
                                java.time.ZoneOffset.UTC));
        ReflectionTestUtils.setField(seeder, "adminUsername", "admin");
        ReflectionTestUtils.setField(seeder, "adminPassword", "123456");
        ReflectionTestUtils.setField(seeder, "adminEmail", "admin@example.test");
        ReflectionTestUtils.setField(seeder, "allowInsecureLocalPassword", enabled);
        ReflectionTestUtils.setField(
                seeder, "corsOrigins", "http://localhost:8080,http://127.0.0.1:8080");
        return seeder;
    }

    @Test
    void shortLocalPasswordRemainsRejectedByDefault() {
        var users = mock(UserRepository.class);
        assertThrows(
                IllegalStateException.class, () -> shortPasswordSeeder(users, false).run(null));
        verifyNoInteractions(users);
    }

    @Test
    void explicitLocalOptInCreatesAnAdminWithAHashedShortPassword() {
        var users = mock(UserRepository.class);
        when(users.findByUsername("admin")).thenReturn(Optional.empty());
        shortPasswordSeeder(users, true).run(null);
        verify(users)
                .save(
                        argThat(
                                user ->
                                        "ADMIN".equals(user.getRole())
                                                && "admin".equals(user.getUsername())
                                                && new BCryptPasswordEncoder()
                                                        .matches(
                                                                "123456", user.getPasswordHash())));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {
                "https://game.example.test",
                "http://localhost.evil.test",
                "http://0.0.0.0:8080",
                "http://localhost@evil.test",
                "not a URL"
            })
    void localOptInRejectsPublicOrMalformedUrls(String url) {
        var users = mock(UserRepository.class);
        var seeder = shortPasswordSeeder(users, true);
        ReflectionTestUtils.setField(seeder, "publicUrl", url);
        assertThrows(IllegalStateException.class, () -> seeder.run(null));
        verifyNoInteractions(users);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"", "*", "http://localhost:8080,https://game.example.test"})
    void localOptInRejectsEmptyWildcardAndRemoteCors(String origins) {
        var users = mock(UserRepository.class);
        var seeder = shortPasswordSeeder(users, true);
        ReflectionTestUtils.setField(seeder, "corsOrigins", origins);
        assertThrows(IllegalStateException.class, () -> seeder.run(null));
        verifyNoInteractions(users);
    }

    @Test
    void localOptInDoesNotPromoteOrResetAnExistingAccount() {
        var users = mock(UserRepository.class);
        var user = new User();
        user.setRole("USER");
        when(users.findByUsername("admin")).thenReturn(Optional.of(user));
        assertThrows(IllegalStateException.class, () -> shortPasswordSeeder(users, true).run(null));
        verify(users, never()).save(any());
    }
}
