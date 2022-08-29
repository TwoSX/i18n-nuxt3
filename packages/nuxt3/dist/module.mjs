import { resolveFiles, defineNuxtModule, addTemplate, addWebpackPlugin, addVitePlugin, addPluginTemplate, extendWebpackConfig, extendViteConfig } from '@nuxt/kit';
import { createRequire } from 'module';
import { dirname, parse, resolve } from 'pathe';
import { isBoolean, isObject, isString } from '@intlify/shared';
import VitePlugin from '@intlify/vite-plugin-vue-i18n';
import { fileURLToPath } from 'url';
import { promises } from 'fs';
import createDebug from 'debug';
import { createUnplugin } from 'unplugin';

// -- Unbuild CommonJS Shims --
import __cjs_url__ from 'url';
import __cjs_path__ from 'path';
import __cjs_mod__ from 'module';
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);


const distDir = dirname(fileURLToPath(import.meta.url));

function isViteMode(options) {
  return options.vite != null ? isBoolean(options.vite) ? options.vite : isObject(options.vite) : true;
}
function setupAliasTranspileOptions(nuxt, name, entry) {
  nuxt.options.alias[name] = entry;
  isViteMode(nuxt.options) && nuxt.options.build.transpile.push(name);
}
async function resolveLocales(path) {
  const files = await resolveFiles(path, "**/*{json,json5,yaml,yml}");
  return files.map((file) => {
    const parsed = parse(file);
    return {
      path: file,
      filename: parsed.base,
      locale: parsed.name
    };
  });
}
async function exists(path) {
  try {
    await promises.access(path);
    return true;
  } catch (e) {
    return false;
  }
}

const debug = createDebug("@intlify/nuxt3:loader");
const optionLoader = createUnplugin((options = {}) => ({
  name: "intlify-nuxt3-options-loader",
  enforce: "post",
  transformInclude(id) {
    return false;
  },
  async transform(code) {
    debug("original code -> ", code);
    let loadingCode = `export default () => Promise.resolve({})`;
    if (isObject(options.vueI18n)) {
      loadingCode = `export default () => Promise.resolve(${JSON.stringify(
        options.vueI18n || {}
      )})`;
    } else if (isString(options.vueI18n)) {
      loadingCode = await promises.readFile(options.vueI18n, "utf8");
    }
    debug("injecting code -> ", loadingCode);
    return `${code}
${loadingCode}`;
  }
}));

const INTLIFY_VUEI18N_OPTIONS_VIRTUAL_FILENAME = "intlify.vuei18n.options.mjs";
const INTLIFY_LOCALE_VIRTUAL_FILENAME = "intlify.locales.mjs";

function defineVueI18n(options) {
  return options;
}
const MODULE_DEV_ENTRIES = {
  "@intlify/shared": "@intlify/shared/dist/shared.esm-bundler.js",
  "@intlify/core-base": "@intlify/core-base/dist/core-base.esm-bundler.mjs",
  "@vue/devtools-api": "@vue/devtools-api/lib/esm/index.js",
  "@intlify/devtools-if": "@intlify/devtools-if/dist/devtools-if.esm-bundler.mjs",
  "vue-i18n": "vue-i18n/dist/vue-i18n.esm-bundler.mjs"
};
const MODULE_PROD_ENTRIES = {
  "@intlify/shared": "@intlify/shared/dist/shared.esm-bundler.js",
  "@intlify/core-base": "@intlify/core-base/dist/core-base.esm-bundler.mjs",
  "@vue/devtools-api": "@vue/devtools-api/lib/esm/index.js",
  "@intlify/devtools-if": "@intlify/devtools-if/dist/devtools-if.esm-bundler.mjs",
  "vue-i18n": "vue-i18n/dist/vue-i18n.runtime.esm-bundler.mjs"
};
const IntlifyModule = defineNuxtModule({
  meta: {
    name: "@intlify/nuxt3",
    configKey: "intlify"
  },
  defaults: {},
  async setup(options, nuxt) {
    const _require = createRequire(import.meta.url);
    for (const [name, entry] of Object.entries(
      nuxt.options.dev ? MODULE_DEV_ENTRIES : MODULE_PROD_ENTRIES
    )) {
      setupAliasTranspileOptions(nuxt, name, _require.resolve(entry));
    }
    const localeDir = options.localeDir || "locales";
    const localePath = resolve(nuxt.options.srcDir, localeDir);
    const hasLocaleFiles = await exists(localePath);
    const localeResources = await resolveLocales(localePath) || [];
    addTemplate({
      filename: INTLIFY_VUEI18N_OPTIONS_VIRTUAL_FILENAME,
      write: true,
      getContents: () => {
        return `export default () => Promise.resolve(${JSON.stringify(
          options.vueI18n || {}
        )})`;
      }
    });
    const loaderOptions = {
      vueI18n: isObject(options.vueI18n) ? options.vueI18n : isString(options.vueI18n) ? resolve(nuxt.options.rootDir, options.vueI18n) : void 0
    };
    addWebpackPlugin(optionLoader.webpack(loaderOptions));
    addVitePlugin(optionLoader.vite(loaderOptions));
    addPluginTemplate({
      filename: "plugin.mjs",
      src: resolve(distDir, "runtime/plugin.mjs")
    });
    addTemplate({
      filename: INTLIFY_LOCALE_VIRTUAL_FILENAME,
      getContents: ({ utils }) => {
        const importMapper = /* @__PURE__ */ new Map();
        localeResources.forEach(({ locale }) => {
          importMapper.set(locale, utils.importName(`locale_${locale}`));
        });
        return `
${localeResources.map((l) => `import ${importMapper.get(l.locale)} from '${l.path}'`).join("\n")}
export default { ${[...importMapper].map((i) => `${JSON.stringify(i[0])}:${i[1]}`).join(",")} }
`;
      }
    });
    extendWebpackConfig((config) => {
      if (hasLocaleFiles) {
        config.module?.rules.push({
          test: /\.(json5?|ya?ml)$/,
          type: "javascript/auto",
          loader: "@intlify/vue-i18n-loader",
          include: [resolve(localePath, "./**")]
        });
      }
      config.module?.rules.push({
        resourceQuery: /blockType=i18n/,
        type: "javascript/auto",
        loader: "@intlify/vue-i18n-loader"
      });
      if (!nuxt.options.dev) {
        (config.resolve?.alias)["vue-i18n"] = "vue-i18n/dist/vue-i18n.runtime.esm-bundler.js";
      }
    });
    extendViteConfig((config) => {
      if (!nuxt.options.dev) {
        (config.resolve?.alias)["vue-i18n"] = "vue-i18n/dist/vue-i18n.runtime.esm-bundler.js";
      }
      const viteOptions = {
        compositionOnly: false
      };
      if (hasLocaleFiles) {
        viteOptions["include"] = resolve(localePath, "./**");
      }
      config.plugins?.push(VitePlugin(viteOptions));
    });
  }
});

export { IntlifyModule as default, defineVueI18n };
