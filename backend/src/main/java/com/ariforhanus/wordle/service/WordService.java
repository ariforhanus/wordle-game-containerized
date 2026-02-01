package com.ariforhanus.wordle.service;


import com.ariforhanus.wordle.service.provider.DefinitionApiProvider;
import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;
import org.springframework.stereotype.Service;
import com.ariforhanus.wordle.controller.WordController.WordDto;

@Service
public class WordService {

    private final RandomWordApiProvider randomWord;
    private final DefinitionApiProvider definition;
    
    public WordService(RandomWordApiProvider randomWord, DefinitionApiProvider definition) {
        this.randomWord = randomWord;
        this.definition = definition;
    }

    public WordDto getWord(){
        String word = randomWord.getRandomFiveLetterWord();
        if (word == null || word.isBlank()) {
            throw new IllegalStateException("Word API returned null/empty");
        }
        String definitionText = definition.getDefinition(word);
        if (definitionText == null || definitionText.isBlank()) {
            definitionText = "Definition unavailable.";
        }
        return new WordDto(word, definitionText);
    }
}
