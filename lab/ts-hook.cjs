/**
 * Lets Node require the product's TypeScript as it is, through the `typescript` devDependency the
 * gate already installs: no build step, no new dependency (#63). Each file is transpiled alone,
 * so an import used only as a type is dropped, as Babel drops it in the app.
 */
const fs = require('node:fs');
const ts = require('typescript');

const OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
};

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const {outputText} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: OPTIONS,
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
