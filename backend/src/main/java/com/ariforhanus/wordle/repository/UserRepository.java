package com.ariforhanus.wordle.repository;

import com.ariforhanus.wordle.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    // Match the outbox retry path: acquire actor/target locks in one stable order.
    @org.springframework.data.jpa.repository.Lock(
            jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
            "select u from User u where u.id in :ids order by u.id")
    java.util.List<User> lockForAdministration(
            @org.springframework.data.repository.query.Param("ids") java.util.Collection<Long> ids);

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
