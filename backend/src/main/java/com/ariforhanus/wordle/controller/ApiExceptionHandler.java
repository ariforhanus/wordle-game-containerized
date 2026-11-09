package com.ariforhanus.wordle.controller;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<?> malformedJson(Exception ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid_input"));
    }

    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<?> expected(org.springframework.web.server.ResponseStatusException ex) {
        String reason = ex.getReason();
        return ResponseEntity.status(ex.getStatusCode())
                .body(
                        Map.of(
                                "error",
                                reason != null && reason.matches("[a-z_]+")
                                        ? reason
                                        : "request_failed"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> invalid(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid_input"));
    }

    @ExceptionHandler({
        DataIntegrityViolationException.class,
        ObjectOptimisticLockingFailureException.class
    })
    public ResponseEntity<?> conflict(Exception ex) {
        return ResponseEntity.status(409)
                .body(Map.of("error", "conflict", "message", "Reload and retry the operation"));
    }
}
