package com.ariforhanus.wordle.config;

import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seeds an initial ADMIN user on application startup if the environment
 * variables ADMIN_USERNAME, ADMIN_PASSWORD and ADMIN_EMAIL are set.
 *
 * - If the user does not exist yet, it will be created with ADMIN role.
 * - If the user already exists, its role will be promoted to ADMIN (idempotent).
 */
@Component
public class AdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Value("${ADMIN_USERNAME:}")
    private String adminUsername;

    @Value("${ADMIN_PASSWORD:}")
    private String adminPassword;

    @Value("${ADMIN_EMAIL:}")
    private String adminEmail;

    public AdminSeeder(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminUsername == null || adminUsername.isBlank()) {
            log.info("ADMIN_USERNAME not set — skipping admin seed.");
            return;
        }
        if (adminPassword == null || adminPassword.isBlank()) {
            log.warn("ADMIN_PASSWORD not set — skipping admin seed.");
            return;
        }
        if (adminEmail == null || adminEmail.isBlank()) {
            log.warn("ADMIN_EMAIL not set — skipping admin seed.");
            return;
        }

        var existing = users.findByUsername(adminUsername);
        if (existing.isPresent()) {
            User user = existing.get();
            if (!"ADMIN".equals(user.getRole())) {
                user.setRole("ADMIN");
                users.save(user);
                log.info("Promoted existing user '{}' to ADMIN.", adminUsername);
            } else {
                log.info("Admin user '{}' already exists with ADMIN role.", adminUsername);
            }
        } else {
            User admin = new User();
            admin.setUsername(adminUsername);
            admin.setEmail(adminEmail);
            admin.setPasswordHash(encoder.encode(adminPassword));
            admin.setRole("ADMIN");
            users.save(admin);
            log.info("Created new ADMIN user '{}'.", adminUsername);
        }
    }
}
