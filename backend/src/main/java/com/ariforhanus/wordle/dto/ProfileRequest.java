package com.ariforhanus.wordle.dto;

import jakarta.validation.constraints.*;

public record ProfileRequest(
        @Pattern(regexp = "[A-Za-z0-9_-]{2,64}") String username,
        @Size(max = 64) String firstName,
        @Size(max = 64) String lastName,
        @Size(max = 64) String nationality) {}
