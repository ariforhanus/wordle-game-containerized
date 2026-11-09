package com.ariforhanus.wordle.repository;

import com.ariforhanus.wordle.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    @org.springframework.data.jpa.repository.Query(
            "select u from User u where lower(u.username) like lower(concat('%', :search, '%')) or"
                + " lower(u.email) like lower(concat('%', :search, '%')) or lower(u.firstName) like"
                + " lower(concat('%', :search, '%')) or lower(u.lastName) like lower(concat('%',"
                + " :search, '%'))")
    org.springframework.data.domain.Page<User> search(
            @org.springframework.data.repository.query.Param("search") String search,
            org.springframework.data.domain.Pageable page);
}
