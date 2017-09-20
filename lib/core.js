'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _pruneNonCriticalCss = require('./browser-sandbox/pruneNonCriticalCss');

var _pruneNonCriticalCss2 = _interopRequireDefault(_pruneNonCriticalCss);

var _replacePageCss = require('./browser-sandbox/replacePageCss');

var _replacePageCss2 = _interopRequireDefault(_replacePageCss);

var _postformatting = require('./postformatting/');

var _postformatting2 = _interopRequireDefault(_postformatting);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function blockinterceptedRequests(interceptedRequest) {
  const isJsRequest = /\.js(\?.*)?$/.test(interceptedRequest.url);
  if (isJsRequest) {
    interceptedRequest.abort();
  } else {
    interceptedRequest.continue();
  }
}

async function blockJsRequests(page) {
  await page.setRequestInterceptionEnabled(true);
  page.on('request', blockinterceptedRequests);
}

async function pruneNonCriticalCssLauncher({
  browser,
  url,
  astRules,
  width,
  height,
  forceInclude,
  userAgent,
  timeout,
  renderWaitTime,
  blockJSRequests,
  customPageHeaders,
  maxEmbeddedBase64Length,
  screenshots,
  debuglog
}) {
  let _hasExited = false;
  const takeScreenshots = screenshots && screenshots.basePath;
  const screenshotExtension = takeScreenshots && screenshots.type === 'jpeg' ? '.jpg' : '.png';

  return new Promise(async (resolve, reject) => {
    debuglog('Penthouse core start');
    let page;
    let killTimeout;
    async function cleanupAndExit({ error, returnValue }) {
      if (_hasExited) {
        return;
      }
      _hasExited = true;

      clearTimeout(killTimeout);
      // page.close will error if page/browser has already been closed;
      // try to avoid
      if (page && !(error && error.toString().indexOf('Target closed' > -1))) {
        // must await here, otherwise will receive errors if closing
        // browser before page is properly closed
        await page.close();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(returnValue);
    }
    killTimeout = setTimeout(() => {
      cleanupAndExit({
        error: new Error('Penthouse timed out after ' + timeout / 1000 + 's. ')
      });
    }, timeout);

    try {
      page = await browser.newPage();
      debuglog('new page opened in browser');

      await page.setViewport({ width, height });
      debuglog('viewport set');

      await page.setUserAgent(userAgent);

      if (customPageHeaders) {
        try {
          await page.setExtraHTTPHeaders(customPageHeaders);
        } catch (e) {
          debuglog('failed setting extra http headers: ' + e);
        }
      }

      if (blockJSRequests) {
        // NOTE: with JS disabled we cannot use JS timers inside page.evaluate
        // (setTimeout, setInterval), however requestAnimationFrame works.
        await page.setJavaScriptEnabled(false);
        await blockJsRequests(page);
        debuglog('blocking js requests');
      }
      page.on('console', msg => {
        // pass through log messages
        // - the ones sent by penthouse for debugging has 'debug: ' prefix.
        if (/^debug: /.test(msg)) {
          debuglog(msg.replace(/^debug: /, ''));
        }
      });

      // NOTE: have to set a timeout here,
      // even though we have our own timeout above,
      // just to override the default puppeteer timeout of 30s
      debuglog('page load start');
      await page.goto(url, { timeout });
      debuglog('page load DONE');

      if (!page) {
        // in case we timed out
        return;
      }

      // grab a "before" screenshot - of the page fully loaded, without JS
      // TODO: could potentially do in parallel with the page.evaluate
      if (takeScreenshots) {
        debuglog('take before screenshot');
        const beforePath = screenshots.basePath + '-before' + screenshotExtension;
        await page.screenshot(_extends({}, screenshots, {
          path: beforePath
        }));
        debuglog('take before screenshot DONE: ' + beforePath);
      }

      const criticalAstRules = await page.evaluate(_pruneNonCriticalCss2.default, {
        astRules,
        forceInclude,
        renderWaitTime
      });
      debuglog('generateCriticalCss done, now postformat');

      const formattedCss = (0, _postformatting2.default)({
        criticalAstRules,
        maxEmbeddedBase64Length,
        debuglog
      });
      debuglog('postformatting done');

      if (takeScreenshots) {
        debuglog('inline critical styles for after screenshot');
        await page.evaluate(_replacePageCss2.default, {
          css: formattedCss
        });
        debuglog('take after screenshot');
        const afterPath = screenshots.basePath + '-after' + screenshotExtension;
        await page.screenshot(_extends({}, screenshots, {
          path: afterPath
        }));
        debuglog('take after screenshot DONE: ' + afterPath);
      }

      cleanupAndExit({ returnValue: formattedCss });
    } catch (e) {
      cleanupAndExit({ error: e });
    }
  });
}

exports.default = pruneNonCriticalCssLauncher;