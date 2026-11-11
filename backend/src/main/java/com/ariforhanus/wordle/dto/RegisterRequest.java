package com.ariforhanus.wordle.dto;

import jakarta.validation.constraints.*;

public record RegisterRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{2,64}") String username,
        @NotBlank @Email @Size(max = 120) String email,
        @NotBlank @Size(min = 12, max = 72) String password,
        @Size(max = 64) String firstName,
        @Size(max = 64) String lastName,
        @Size(max = 64) String nationality) {}
