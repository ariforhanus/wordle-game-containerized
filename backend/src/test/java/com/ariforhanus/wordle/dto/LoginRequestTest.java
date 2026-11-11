package com.ariforhanus.wordle.dto;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LoginRequestTest {

    private final ObjectMapper mapper = tools.jackson.databind.json.JsonMapper.builder().build();

    @Test
    void setterAndGetters_shouldWork(){
        LoginRequest dto = new LoginRequest();

        dto.setUsername("test");
        dto.setPassword("12345");

        assertEquals("test", dto.getUsername());
        assertEquals("12345", dto.getPassword());
    }

    @Test
    void jsonDeserialization_shouldMapFieldsCorrectly() throws Exception{
        String json = "{\"username\": \"test\", \"password\": \"12345\"}";

        LoginRequest dto = mapper.readValue(json, LoginRequest.class);

        assertEquals("test", dto.getUsername());
        assertEquals("12345", dto.getPassword());
    }


}
