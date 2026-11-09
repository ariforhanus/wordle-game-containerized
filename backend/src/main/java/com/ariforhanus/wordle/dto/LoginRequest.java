package com.ariforhanus.wordle.dto;

public class LoginRequest {
    @jakarta.validation.constraints.NotBlank
    @jakarta.validation.constraints.Size(max = 64)
    private String username;

    @jakarta.validation.constraints.NotBlank
    @jakarta.validation.constraints.Size(max = 72)
    private String password;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
