package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.repository.UserRepository;
import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository users;

    public AppUserDetailsService(UserRepository users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        var u = users.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Kullanıcı bulunamadı"));

        return org.springframework.security.core.userdetails.User
                .withUsername(u.getUsername())
                .password(u.getPasswordHash())
                .roles("USER")
                .build();
    }
}
