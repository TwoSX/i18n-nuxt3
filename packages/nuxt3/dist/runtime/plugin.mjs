import { createI18n } from "vue-i18n";
import { defineNuxtPlugin } from "#app";
import optionsLoader from "#build/intlify.vuei18n.options.mjs";
import messages from "#build/intlify.locales.mjs";
const isEmpty = (obj) => Object.keys(obj).length === 0;
export default defineNuxtPlugin(async (nuxt) => {
  const { vueApp: app } = nuxt;
  const loadedOptions = await optionsLoader();
  if (!isEmpty(messages)) {
    loadedOptions.messages = messages;
  }
  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: "en",
    ...loadedOptions
  });
  app.use(i18n);
});
