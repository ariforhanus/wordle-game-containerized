package com.ariforhanus.wordle.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class wordleController {

    @GetMapping("/")
    public String game() {
        return "game";
    }
}

