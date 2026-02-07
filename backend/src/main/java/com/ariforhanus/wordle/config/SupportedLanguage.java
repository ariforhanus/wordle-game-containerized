package com.ariforhanus.wordle.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Uygulamada desteklenen diller için küçük yardımcı enum.
 * Şu anda yalnızca "en" ve "tr" var; yeni dil eklemek için enum'a yeni değer eklemek yeterli.
 */
public enum SupportedLanguage {
    EN("en"),
    TR("tr");

    private final String code;

    SupportedLanguage(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    /**
     * URL'den gelen lang parametresini normalize eder.
     * null / boş ise varsayılan "en" döner.
     * Desteklenmeyen bir kod gelirse IllegalArgumentException fırlatır.
     */
    public static SupportedLanguage fromParam(String param) {
        if (param == null || param.isBlank()) {
            return EN;
        }
        String normalized = param.toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(l -> l.code.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unsupported_language"));
    }

    public static List<String> supportedCodes() {
        return Arrays.stream(values())
                .map(SupportedLanguage::getCode)
                .toList();
    }
}

