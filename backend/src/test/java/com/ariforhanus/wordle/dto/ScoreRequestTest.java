package com.ariforhanus.wordle.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ScoreRequestTest {

    private final Validator validator =
            Validation.buildDefaultValidatorFactory().getValidator();


    @Test
    void jsonDeserialization_shouldMapFieldsCorrectly() throws Exception{
        String json = """
                {
                "username": "test",
                "attempts": 1,
                "durationMs": 1500,
                "word": "TESTS"
                }
                """;

        var  mapper = new ObjectMapper();
        ScoreRequest dto = mapper.readValue(json, ScoreRequest.class);

        assertEquals("test", dto.getUsername());
        assertEquals(1, dto.getAttempts());
        assertEquals(1500L, dto.getDurationMs());
        assertEquals("TESTS", dto.getWord());

    }

    @Test
    void ValidInput_shouldPassValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("test");
        dto.setAttempts(1);
        dto.setDurationMs(1500L);
        dto.setWord("TESTS");

        var violations = validator.validate(dto);
        assertTrue(violations.isEmpty());
    }

    @Test
    void blankUsername_shouldFailValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("");
        dto.setAttempts(1);
        dto.setDurationMs(1500L);
        dto.setWord("TESTS");

        var violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
    }

    @Test
    void usernameTooLong_shouldFailValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("ABCDEFGHIJKLMNOPQRSTU");
        dto.setAttempts(1);
        dto.setDurationMs(1500L);
        dto.setWord("TESTS");

        var violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
    }

    @Test
    void attemptsZero_shouldFailValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("test");
        dto.setAttempts(0);
        dto.setDurationMs(1500L);
        dto.setWord("TESTS");

        var violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
    }

    @Test
    void attemptsTooHigh_shouldFailValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("test");
        dto.setAttempts(7);
        dto.setDurationMs(1500L);
        dto.setWord("TESTS");

        var violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
    }

    @Test
    void durationNegative_shouldFailValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("test");
        dto.setAttempts(1);
        dto.setDurationMs(-1L);
        dto.setWord("TESTS");

        var violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
    }

    @Test
    void wordTooLong_shouldFailValidation(){
        ScoreRequest dto = new ScoreRequest();
        dto.setUsername("test");
        dto.setAttempts(1);
        dto.setDurationMs(1500L);
        dto.setWord("ABCDEFGHIJKLMNOPQRSTU");

        var violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
    }

}
