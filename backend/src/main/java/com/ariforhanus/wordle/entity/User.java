package com.ariforhanus.wordle.entity;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "users",
        uniqueConstraints = {
            @UniqueConstraint(name = "uk_user_username", columnNames = "username"),
            @UniqueConstraint(name = "uk_user_email", columnNames = "email")
        })
public class User {
    @jakarta.persistence.Version private long version;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String username;

    @Column(nullable = false, length = 120)
    private String email;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false, length = 20)
    private String role = "USER";

    @Column(length = 64)
    private String firstName;

    @Column(length = 64)
    private String lastName;

    @Column(length = 64)
    private String nationality;

    // IMPORTANT: Use bytea (not PostgreSQL Large Object/oid). oid requires special handling
    // and breaks authentication queries outside a transaction ("Large Objects may not be used in
    // auto-commit mode").
    @Basic(fetch = FetchType.LAZY)
    @Column(columnDefinition = "bytea")
    private byte[] avatar;

    @Column(length = 64)
    private String avatarContentType;

    @Column private Long avatarSize;

    public static UserBuilder builder() {
        return new UserBuilder();
    }

    public Long getId() {
        return this.id;
    }

    public String getUsername() {
        return this.username;
    }

    public String getEmail() {
        return this.email;
    }

    public String getPasswordHash() {
        return this.passwordHash;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public String getRole() {
        return this.role;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getNationality() {
        return nationality;
    }

    public byte[] getAvatar() {
        return avatar;
    }

    public String getAvatarContentType() {
        return avatarContentType;
    }

    public Long getAvatarSize() {
        return avatarSize;
    }

    public void setId(final Long id) {
        this.id = id;
    }

    public void setUsername(final String username) {
        this.username = username;
    }

    public void setEmail(final String email) {
        this.email = email;
    }

    public void setPasswordHash(final String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void setCreatedAt(final Instant createdAt) {
        this.createdAt = createdAt;
    }

    public void setRole(final String role) {
        this.role = role;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public void setNationality(String nationality) {
        this.nationality = nationality;
    }

    public void setAvatar(byte[] avatar) {
        this.avatar = avatar;
    }

    public void setAvatarContentType(String avatarContentType) {
        this.avatarContentType = avatarContentType;
    }

    public void setAvatarSize(Long avatarSize) {
        this.avatarSize = avatarSize;
    }

    public User() {}

    public User(
            final Long id,
            final String username,
            final String email,
            final String passwordHash,
            final Instant createdAt,
            final String role) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
        this.role = role;
    }

    public static class UserBuilder {
        private Long id;
        private String username;
        private String email;
        private String passwordHash;
        private Instant createdAt;
        private String role;

        UserBuilder() {}

        public UserBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        public UserBuilder username(final String username) {
            this.username = username;
            return this;
        }

        public UserBuilder email(final String email) {
            this.email = email;
            return this;
        }

        public UserBuilder passwordHash(final String passwordHash) {
            this.passwordHash = passwordHash;
            return this;
        }

        public UserBuilder createdAt(final Instant createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public UserBuilder role(final String role) {
            this.role = role;
            return this;
        }

        public User build() {
            return new User(
                    this.id,
                    this.username,
                    this.email,
                    this.passwordHash,
                    this.createdAt,
                    this.role);
        }

        public String toString() {
            Long var10000 = this.id;
            return "User.UserBuilder(id="
                    + var10000
                    + ", username="
                    + this.username
                    + ", email="
                    + this.email
                    + ", createdAt="
                    + String.valueOf(this.createdAt)
                    + ", role="
                    + this.role
                    + ")";
        }
    }
}
