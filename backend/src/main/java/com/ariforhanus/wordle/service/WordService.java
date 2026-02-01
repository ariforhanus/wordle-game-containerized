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

    public WordDto getWord(String lang){
        String word = randomWord.getRandomFiveLetterWord(lang);
        if (word == null || word.isBlank()) {
            throw new IllegalStateException("No words available for lang=" + lang);
        }
        
        String definitionText;
        if ("en".equals(lang)) {
            // İngilizce için definition API kullan
            definitionText = definition.getDefinition(word);
            if (definitionText == null || definitionText.isBlank()) {
                definitionText = "Definition unavailable.";
            }
        } else {
            // Türkçe için şimdilik definition yok
            definitionText = "Tanım mevcut değil.";
        }
        return new WordDto(word, definitionText);
    }
}
