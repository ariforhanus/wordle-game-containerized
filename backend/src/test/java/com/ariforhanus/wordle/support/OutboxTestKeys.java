package com.ariforhanus.wordle.support;

/** Public deterministic test material, never production configuration. */
public final class OutboxTestKeys {
    public static final String FIRST = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
    public static final String SECOND = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";
    public static final String RING = "test-v1:" + FIRST;

    private OutboxTestKeys() {}
}
