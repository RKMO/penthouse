'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _jsesc = require('jsesc');

var _jsesc2 = _interopRequireDefault(_jsesc);

var _normalizeCss = require('./browser-sandbox/normalizeCss');

var _normalizeCss2 = _interopRequireDefault(_normalizeCss);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function unEscapeCss(css) {
  return css.replace(/(['"])\\\\/g, `$1\\`);
}

function escapeHexRefences(css) {
  return css.replace(/(content\s*:\s*)(['"])([^'"]*)(['"])/g, function (match, pre, quote, innerContent, quote2) {
    if (quote !== quote2) {
      return;
    }
    return pre + quote + (0, _jsesc2.default)(innerContent) + quote;
  })
  // .. however it's not perfect for our needs,
  // as we need to be able to convert back to CSS acceptable format.
  // i.e. need to go from `\f` to `\\f` (and then back afterwards),
  // and need to use `\2022` rather than `u2022`...
  // this is not rigourously tested and not following any spec, needs to be improved.
  .replace(/(['"])(\\)([^\\])/g, function (match, quote, slash, firstInnerContentChar) {
    if (firstInnerContentChar === 'u') {
      return quote + slash + slash;
    }
    return quote + slash + slash + firstInnerContentChar;
  });
}

async function normalizeCssLauncher({ browser, css, debuglog }) {
  debuglog('normalizeCss: ' + css.length);

  // escape hex referenced unicode chars in content:'' declarations,
  // i.e. \f091'
  // so they stay in the same format
  const escapedCss = escapeHexRefences(css);
  debuglog('normalizeCss: escaped hex');

  const page = await browser.newPage();
  debuglog('normalizeCss: new page opened in browser');

  page.on('console', msg => {
    // pass through log messages
    debuglog(msg.replace(/^debug: /, ''));
  });

  const html = '<html><head><style>' + escapedCss + '</style></head><body></body></html>';
  await page.setContent(html);

  const normalized = await page.evaluate(_normalizeCss2.default, { css });

  // cleanup
  await page.close();

  return unEscapeCss(normalized);
}

exports.default = normalizeCssLauncher;