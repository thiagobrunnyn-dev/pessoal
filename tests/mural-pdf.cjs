// Generated PDFs exercise the real validator entirely in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const { PDFDocument, PDFName, PDFRef, PDFString } = require('pdf-lib');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = id => {
    if (id.startsWith('.')) {
      const dependency = path.resolve(path.dirname(filename), id);
      return load(path.extname(dependency) ? dependency : dependency + '.ts');
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const { readMuralPdf, MURAL_FILE_LIMIT } = load('lib/mural-pdf.ts');
const { RequestError } = load('lib/http-security.ts');
const results = [];

async function test(name, action) {
  try {
    await action();
    results.push({ name, passed: true });
    console.log('PASS', name);
  } catch (error) {
    results.push({ name, passed: false });
    console.error('FAIL', name, error.stack);
  }
}

async function pdf(configure = () => {}) {
  const document = await PDFDocument.create();
  for (let page = 0; page < 4; page++) document.addPage();
  configure(document);
  return document.save();
}

function file(bytes, filename = 'laudo.pdf', type = 'application/pdf') {
  return new File([bytes], filename, { type });
}

function fitDestination(document, page = 0) {
  return document.context.obj([document.getPages()[page].ref, 'Fit']);
}

async function assertPreserved(bytes) {
  const result = await readMuralPdf(file(bytes));
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.size, bytes.length);
  assert.equal(result.pages, 4);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
}

async function assertRejected(configure) {
  const bytes = await pdf(configure);
  await assert.rejects(readMuralPdf(file(bytes)), error => error instanceof RequestError && error.status === 400);
}

(async () => {
  await test('ordinary PDFs retain their exact bytes and hash', async () => {
    await assertPreserved(await pdf());
  });

  await test('catalog OpenAction may fit the first real page without changing the PDF', async () => {
    await assertPreserved(await pdf(document => {
      document.catalog.set(PDFName.of('OpenAction'), fitDestination(document));
    }));
  });

  await test('catalog OpenAction may fit another real page', async () => {
    await assertPreserved(await pdf(document => {
      document.catalog.set(PDFName.of('OpenAction'), fitDestination(document, 3));
    }));
  });

  await test('an indirect Fit destination must still identify a real page', async () => {
    await assertPreserved(await pdf(document => {
      const destination = document.context.register(fitDestination(document));
      document.catalog.set(PDFName.of('OpenAction'), destination);
    }));
  });

  await test('automatic JavaScript action dictionaries remain rejected', async () => {
    await assertRejected(document => {
      document.catalog.set(PDFName.of('OpenAction'), document.context.obj({
        S: 'JavaScript',
        JS: PDFString.of('app.alert("test")'),
      }));
    });
  });

  await test('indirect automatic actions remain rejected', async () => {
    await assertRejected(document => {
      const action = document.context.register(document.context.obj({
        S: 'JavaScript',
        JS: PDFString.of('app.alert("test")'),
      }));
      document.catalog.set(PDFName.of('OpenAction'), action);
    });
  });

  await test('a GoTo action dictionary remains rejected', async () => {
    await assertRejected(document => {
      document.catalog.set(PDFName.of('OpenAction'), document.context.obj({
        S: 'GoTo',
        D: fitDestination(document),
      }));
    });
  });

  await test('empty and incomplete OpenAction arrays remain rejected', async () => {
    for (const incomplete of [false, true]) {
      await assertRejected(document => {
        const destination = document.context.obj(incomplete ? [document.getPages()[0].ref] : []);
        document.catalog.set(PDFName.of('OpenAction'), destination);
      });
    }
  });

  await test('a Fit destination cannot reference an ordinary dictionary', async () => {
    await assertRejected(document => {
      const dictionary = document.context.register(document.context.obj({ Type: 'Example' }));
      document.catalog.set(PDFName.of('OpenAction'), document.context.obj([dictionary, 'Fit']));
    });
  });

  await test('a Fit destination cannot reference a dangling object', async () => {
    await assertRejected(document => {
      document.catalog.set(PDFName.of('OpenAction'), document.context.obj([PDFRef.of(99999), 'Fit']));
    });
  });

  await test('a page outside the document page tree remains rejected', async () => {
    await assertRejected(document => {
      const removed = document.getPages()[3].ref;
      document.removePage(3);
      document.catalog.set(PDFName.of('OpenAction'), document.context.obj([removed, 'Fit']));
    });
  });

  await test('page numbers and page dictionaries cannot replace a page reference', async () => {
    for (const directDictionary of [false, true]) {
      await assertRejected(document => {
        const page = directDictionary ? document.getPages()[0].node : 0;
        document.catalog.set(PDFName.of('OpenAction'), document.context.obj([page, 'Fit']));
      });
    }
  });

  await test('Fit destinations cannot contain extra arguments or action dictionaries', async () => {
    for (const hiddenAction of [false, true]) {
      await assertRejected(document => {
        const destination = fitDestination(document);
        destination.push(hiddenAction ? document.context.obj({ S: 'GoTo' }) : PDFName.of('Fit'));
        document.catalog.set(PDFName.of('OpenAction'), destination);
      });
    }
  });

  await test('other destination modes and named destinations remain rejected', async () => {
    for (const mode of ['FitH', 'XYZ', 'named']) {
      await assertRejected(document => {
        const destination = mode === 'named'
          ? PDFString.of('chapter-one')
          : document.context.obj([document.getPages()[0].ref, mode]);
        document.catalog.set(PDFName.of('OpenAction'), destination);
      });
    }
  });

  await test('OpenAction outside the catalog remains rejected', async () => {
    await assertRejected(document => {
      document.getPages()[0].node.set(PDFName.of('OpenAction'), fitDestination(document));
    });
  });

  await test('a permitted catalog destination does not allow JavaScript elsewhere', async () => {
    await assertRejected(document => {
      document.catalog.set(PDFName.of('OpenAction'), fitDestination(document));
      document.context.register(document.context.obj({ JS: PDFString.of('app.alert("test")') }));
    });
  });

  await test('AcroForm and additional automatic actions remain rejected', async () => {
    for (const key of ['AcroForm', 'AA']) {
      await assertRejected(document => {
        document.catalog.set(PDFName.of('OpenAction'), fitDestination(document));
        document.catalog.set(PDFName.of(key), document.context.obj({}));
      });
    }
  });

  await test('PDF file type, empty input and size limits remain enforced', async () => {
    const valid = await pdf();
    for (const invalid of [file(valid, 'laudo.txt'), file(valid, 'laudo.pdf', 'text/plain'), file(new Uint8Array())]) {
      await assert.rejects(readMuralPdf(invalid), RequestError);
    }
    await assert.rejects(readMuralPdf(file(new Uint8Array(MURAL_FILE_LIMIT + 1))), error => error instanceof RequestError && error.status === 413);
  });

  console.log(JSON.stringify({ passed: results.filter(result => result.passed).length, total: results.length }));
  if (results.some(result => !result.passed)) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
