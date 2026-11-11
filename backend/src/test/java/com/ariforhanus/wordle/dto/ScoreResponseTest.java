package com.ariforhanus.wordle.dto;

import tools.jackson.databind.ObjectMapper;


import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ScoreResponseTest {


    @Test
    void jsonSerialization_shouldProduceExceptedFields() throws Exception{
        ObjectMapper mapper = tools.jackson.databind.json.JsonMapper.builder().build();

        Instant wonAt = Instant.parse("2025-08-22T08:00:00Z");

        ScoreResponse dto = new ScoreResponse(
                1,
                1,
                "test",
                1L,
                1500L,
                "TESTS",
                wonAt,
                3
        );

        String json = mapper.writeValueAsString(dto);

        assertTrue(json.contains("\"id\":1"));
        assertTrue(json.contains("\"username\":\"test\""));
        assertTrue(json.contains("\"attempts\":1"));
        assertTrue(json.contains("\"durationMs\":1500"));
        assertTrue(json.contains("\"score\":1"));
        assertTrue(json.contains("\"word\":\"TESTS\""));
        assertTrue(json.contains("\"wonAt\":\"2025-08-22T08:00:00Z\""));
        assertTrue(json.contains("\"currentStreak\":3"));



    }
}
