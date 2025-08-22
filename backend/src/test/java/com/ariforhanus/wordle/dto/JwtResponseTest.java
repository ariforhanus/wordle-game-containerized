package com.ariforhanus.wordle.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JwtResponseTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void jsonSerialization_shouldProduceExceptedFields() throws Exception{

        JwtResponse jwt = new JwtResponse(
                "header.payload.signature",
                3600L
        );

        String json = mapper.writeValueAsString(jwt);
        var node = mapper.readTree(json);

        assertEquals("header.payload.signature", node.get("token").asText());
        assertEquals(3600L, node.get("expiresIn").asLong());
    }
}
