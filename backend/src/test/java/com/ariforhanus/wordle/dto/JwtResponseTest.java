package com.ariforhanus.wordle.dto;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JwtResponseTest {

    private final ObjectMapper mapper = tools.jackson.databind.json.JsonMapper.builder().build();

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
