import en from "../locales/en.json";
import tr from "../locales/tr.json";

// Re-export individual languages for backward compat
export { en, tr };

/**
 * All translation resources keyed by language code.
 * To add a new language:
 *  1. Create locales/<code>.json
 *  2. Import it above
 *  3. Add it to this map
 */
export const translationResources: Record<string, Record<string, unknown>> = {
  en,
  tr,
};
