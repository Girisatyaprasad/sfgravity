(function () {
  'use strict';

  if (window.__GRAVITY__) return;

  var SITE_ORIGIN = 'https://sfgravity.online';

  var ROUTES = {
    '/instagram-reel-downloader': 'instagram',
    '/instagram-video-downloader': 'instagram',
    '/youtube-shorts-downloader': 'youtube',
    '/youtube-video-downloader': 'youtube',
    '/facebook-video-downloader': 'facebook',
    '/fb-shorts-downloader': 'facebook',
    '/download': 'generic',
    '/': 'generic'
  };

  var CLUSTER = {
    US: 'US', CA: 'US', GB: 'US', AU: 'US', DE: 'US',
    IN: 'IN', PK: 'IN', BD: 'IN', LK: 'IN',
    BR: 'LATAM', MX: 'LATAM', AR: 'LATAM', CO: 'LATAM',
    ID: 'SEA', PH: 'SEA', VN: 'SEA', TH: 'SEA', MY: 'SEA',
    FR: 'EU', IT: 'EU', ES: 'EU', NL: 'EU', PL: 'EU', SE: 'EU',
    JP: 'EU', KR: 'EU'
  };

  var TIER = {
    US: 'T1', CA: 'T1', GB: 'T1', AU: 'T1', DE: 'T1', CH: 'T1', NO: 'T1', DK: 'T1',
    FR: 'T2', IT: 'T2', ES: 'T2', NL: 'T2', JP: 'T2', KR: 'T2', SE: 'T2',
    IN: 'T3', ID: 'T3', PH: 'T3', BR: 'T3', MX: 'T3', NG: 'T3', PK: 'T3', BD: 'T3',
    VN: 'T3', TH: 'T3', AR: 'T3', CO: 'T3'
  };

  var LANG = {
    US: 'en-US', CA: 'en-CA', GB: 'en-GB', AU: 'en-AU', DE: 'de-DE',
    IN: 'en-IN', PK: 'en-PK', BD: 'bn-BD', BR: 'pt-BR', MX: 'es-MX',
    FR: 'fr-FR', JP: 'ja-JP', KR: 'ko-KR', ID: 'id-ID', PH: 'en-PH'
  };

  var ADS = {
    T1: { cls: 'ad-tier-t1', unit: 'sfgravity-t1-premium' },
    T2: { cls: 'ad-tier-t2', unit: 'sfgravity-t2-standard' },
    T3: { cls: 'ad-tier-t3', unit: 'sfgravity-t3-volume' },
    T4: { cls: 'ad-tier-t4', unit: 'sfgravity-t4-house' }
  };

  var DURATION_ERRORS = {
    US: 'This video is longer than 3 minutes and cannot be downloaded.',
    IN: 'Videos over 3 minutes are not supported on SaveFromGravity.',
    DEFAULT: 'Video length exceeds the 180 second limit.'
  };

  var STREAM_ERRORS = {
    US: 'Stream restricted by platform security. Please attempt download using lower resolution parameters.',
    IN: 'Download restricted by network policy. Retrying link compilation or select alternate quality.',
    DEFAULT: 'Stream restricted by platform security. Please attempt download using lower resolution parameters.'
  };

  var COPY = {
    instagram: {
      US: {
        lang: 'en-US',
        title: 'SaveFromGravity — Instagram Reel Downloader',
        metaDescription: 'Download Instagram Reels and videos in HD with SaveFromGravity. Paste a link, pick quality, save instantly.',
        metaKeywords: 'savefromgravity, instagram reel downloader, ig video download, sfgravity',
        ogTitle: 'SaveFromGravity — Instagram Reel Downloader',
        ogDescription: 'Save Instagram Reels in HD — free, fast, no signup.',
        'welcome-title': 'Paste an Instagram Reel link',
        'input.placeholder': 'Paste Instagram link…',
        'input.aria': 'Instagram video link',
        'button.send.aria': 'Download Instagram video',
        'composer.aria': 'Instagram video link form',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Premium placement',
        'error.stream_protected': STREAM_ERRORS.US
      },
      IN: {
        lang: 'en-IN',
        title: 'SaveFromGravity — Instagram Reel Downloader HD',
        metaDescription: 'Download Instagram Reels and IG videos in HD with SaveFromGravity. Paste link, select quality, save to device.',
        metaKeywords: 'savefromgravity, instagram reel downloader india, sfgravity, reel download hd',
        ogTitle: 'SaveFromGravity — Instagram HD',
        ogDescription: 'Download Instagram Reels in HD. Simple and free.',
        'welcome-title': 'Paste Instagram Reel link here',
        'input.placeholder': 'Paste Instagram link here…',
        'input.aria': 'Instagram video URL',
        'button.send.aria': 'Download video',
        'composer.aria': 'Video download form',
        'ad.label': 'Sponsored',
        'ad.title': 'Advertisement',
        'ad.desc': 'Supported by ads',
        'error.stream_protected': STREAM_ERRORS.IN
      },
      DEFAULT: {
        lang: 'en',
        title: 'SaveFromGravity — Instagram Reel Downloader',
        metaDescription: 'Download Instagram Reels and videos with SaveFromGravity. Paste a link and save in your preferred quality.',
        metaKeywords: 'savefromgravity, instagram downloader, reel download, sfgravity',
        ogTitle: 'SaveFromGravity — Instagram Downloader',
        ogDescription: 'Download Instagram Reels and videos for free.',
        'welcome-title': 'Paste an Instagram link',
        'input.placeholder': 'Paste Instagram link…',
        'input.aria': 'Instagram link',
        'button.send.aria': 'Send',
        'composer.aria': 'Paste video link',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Standard placement',
        'error.stream_protected': STREAM_ERRORS.DEFAULT
      }
    },
    youtube: {
      US: {
        lang: 'en-US',
        title: 'SaveFromGravity — YouTube Video Downloader',
        metaDescription: 'Download YouTube videos and Shorts in MP4 with SaveFromGravity. Paste a link, choose quality, save instantly.',
        metaKeywords: 'savefromgravity, youtube downloader, youtube mp4, youtube shorts download, sfgravity',
        ogTitle: 'SaveFromGravity — YouTube Downloader',
        ogDescription: 'Save YouTube videos and Shorts — fast and free.',
        'welcome-title': 'Paste a YouTube link',
        'input.placeholder': 'Paste YouTube link…',
        'input.aria': 'YouTube video link',
        'button.send.aria': 'Download YouTube video',
        'composer.aria': 'YouTube video link form',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Premium placement',
        'error.stream_protected': STREAM_ERRORS.US
      },
      IN: {
        lang: 'en-IN',
        title: 'SaveFromGravity — YouTube HD Downloader',
        metaDescription: 'Download YouTube videos and Shorts in HD with SaveFromGravity. Paste link, select quality, save to phone.',
        metaKeywords: 'savefromgravity, youtube downloader india, youtube video download hd, sfgravity',
        ogTitle: 'SaveFromGravity — YouTube HD',
        ogDescription: 'Download YouTube videos in HD quality.',
        'welcome-title': 'Paste YouTube video link here',
        'input.placeholder': 'Paste YouTube link here…',
        'input.aria': 'YouTube video URL',
        'button.send.aria': 'Download video',
        'composer.aria': 'Video download form',
        'ad.label': 'Sponsored',
        'ad.title': 'Advertisement',
        'ad.desc': 'Supported by ads',
        'error.stream_protected': STREAM_ERRORS.IN
      },
      DEFAULT: {
        lang: 'en',
        title: 'SaveFromGravity — YouTube Video Downloader',
        metaDescription: 'Download YouTube videos and Shorts with SaveFromGravity. Paste a link and pick your quality.',
        metaKeywords: 'savefromgravity, youtube downloader, video download, sfgravity',
        ogTitle: 'SaveFromGravity — YouTube Downloader',
        ogDescription: 'Download YouTube videos for free.',
        'welcome-title': 'Paste a YouTube link',
        'input.placeholder': 'Paste YouTube link…',
        'input.aria': 'YouTube link',
        'button.send.aria': 'Send',
        'composer.aria': 'Paste video link',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Standard placement',
        'error.stream_protected': STREAM_ERRORS.DEFAULT
      }
    },
    facebook: {
      US: {
        lang: 'en-US',
        title: 'SaveFromGravity — Facebook Video Downloader',
        metaDescription: 'Download Facebook videos and Reels in HD with SaveFromGravity. Paste a link and save instantly.',
        metaKeywords: 'savefromgravity, facebook video downloader, fb reel download, sfgravity',
        ogTitle: 'SaveFromGravity — Facebook Downloader',
        ogDescription: 'Save Facebook videos and Reels — free and fast.',
        'welcome-title': 'Paste a Facebook video link',
        'input.placeholder': 'Paste Facebook link…',
        'input.aria': 'Facebook video link',
        'button.send.aria': 'Download Facebook video',
        'composer.aria': 'Facebook video link form',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Premium placement',
        'error.stream_protected': STREAM_ERRORS.US
      },
      IN: {
        lang: 'en-IN',
        title: 'SaveFromGravity — Facebook Video Downloader HD',
        metaDescription: 'Download Facebook videos and Reels in HD with SaveFromGravity. Paste link, select quality, save to device.',
        metaKeywords: 'savefromgravity, facebook video downloader india, fb download hd, sfgravity',
        ogTitle: 'SaveFromGravity — Facebook HD',
        ogDescription: 'Download Facebook videos in HD. Simple and free.',
        'welcome-title': 'Paste Facebook video link here',
        'input.placeholder': 'Paste Facebook link here…',
        'input.aria': 'Facebook video URL',
        'button.send.aria': 'Download video',
        'composer.aria': 'Video download form',
        'ad.label': 'Sponsored',
        'ad.title': 'Advertisement',
        'ad.desc': 'Supported by ads',
        'error.stream_protected': STREAM_ERRORS.IN
      },
      DEFAULT: {
        lang: 'en',
        title: 'SaveFromGravity — Facebook Video Downloader',
        metaDescription: 'Download Facebook videos and Reels with SaveFromGravity. Paste a link and choose quality.',
        metaKeywords: 'savefromgravity, facebook downloader, fb video download, sfgravity',
        ogTitle: 'SaveFromGravity — Facebook Downloader',
        ogDescription: 'Download Facebook videos for free.',
        'welcome-title': 'Paste a Facebook link',
        'input.placeholder': 'Paste Facebook link…',
        'input.aria': 'Facebook link',
        'button.send.aria': 'Send',
        'composer.aria': 'Paste video link',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Standard placement',
        'error.stream_protected': STREAM_ERRORS.DEFAULT
      }
    },
    generic: {
      US: {
        lang: 'en-US',
        title: 'SaveFromGravity — Video Downloader',
        metaDescription: 'Download videos from Instagram, YouTube, and Facebook with SaveFromGravity. Paste a link, pick quality, save.',
        metaKeywords: 'savefromgravity, video downloader, social video saver, sfgravity',
        ogTitle: 'SaveFromGravity — Video Downloader',
        ogDescription: 'Download social videos — Instagram, YouTube, Facebook.',
        'welcome-title': 'Paste a video link',
        'input.placeholder': 'Paste video link…',
        'input.aria': 'Video link',
        'button.send.aria': 'Send',
        'composer.aria': 'Paste video link',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Premium placement',
        'error.stream_protected': STREAM_ERRORS.US
      },
      IN: {
        lang: 'en-IN',
        title: 'SaveFromGravity — HD Video Downloader',
        metaDescription: 'Download videos from Instagram, YouTube, and Facebook in HD with SaveFromGravity.',
        metaKeywords: 'savefromgravity, video downloader india, hd video download, sfgravity',
        ogTitle: 'SaveFromGravity — HD Downloader',
        ogDescription: 'Download social media videos in HD.',
        'welcome-title': 'Paste video link here',
        'input.placeholder': 'Paste video link here…',
        'input.aria': 'Video URL',
        'button.send.aria': 'Download video',
        'composer.aria': 'Video download form',
        'ad.label': 'Sponsored',
        'ad.title': 'Advertisement',
        'ad.desc': 'Supported by ads',
        'error.stream_protected': STREAM_ERRORS.IN
      },
      DEFAULT: {
        lang: 'en',
        title: 'SaveFromGravity — Video Downloader',
        metaDescription: 'Download videos from Instagram, YouTube, and Facebook with SaveFromGravity.',
        metaKeywords: 'savefromgravity, video downloader, social video saver, sfgravity',
        ogTitle: 'SaveFromGravity',
        ogDescription: 'Download social videos for free.',
        'welcome-title': 'Paste a video link',
        'input.placeholder': 'Paste video link…',
        'input.aria': 'Video link',
        'button.send.aria': 'Send',
        'composer.aria': 'Paste video link',
        'ad.label': 'Sponsored',
        'ad.title': 'Your ad here',
        'ad.desc': 'Standard placement',
        'error.stream_protected': STREAM_ERRORS.DEFAULT
      }
    }
  };

  function normPath(path) {
    var p = (path || '/').toLowerCase();
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return p;
  }

  function parseGeoQuery() {
    var match = location.search.match(/[?&]geo=([A-Za-z]{2})/);
    if (!match) return '';
    var code = match[1].toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : '';
  }

  function resolvePathname() {
    var path = normPath(location.pathname);
    if (ROUTES[path]) return path;
    var hash = location.hash || '';
    if (hash.indexOf('#/') === 0) {
      var slug = normPath(hash.slice(1));
      if (ROUTES[slug]) return slug;
    }
    return '/';
  }

  function resolvePlatform(pathname) {
    return ROUTES[pathname] || 'generic';
  }

  function parseCookieCountry() {
    var match = document.cookie.match(/(?:^|;\s*)gravity_country=([^;]*)/);
    if (!match) return '';
    var code = match[1].trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : '';
  }

  function parseLanguageCountry() {
    var list = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || 'en-US'];
    var i;
    for (i = 0; i < list.length; i++) {
      var tag = list[i];
      if (!tag) continue;
      var parts = tag.split('-');
      if (parts.length > 1) {
        var region = parts[parts.length - 1].toUpperCase();
        if (/^[A-Z]{2}$/.test(region)) return region;
      }
      var lang = parts[0].toLowerCase();
      if (lang === 'hi' || lang === 'bn' || lang === 'ta' || lang === 'te') return 'IN';
      if (lang === 'pt') return 'BR';
      if (lang === 'ja') return 'JP';
      if (lang === 'ko') return 'KR';
      if (lang === 'id') return 'ID';
    }
    return 'US';
  }

  function resolveCountry() {
    return parseGeoQuery() || parseCookieCountry() || parseLanguageCountry() || 'US';
  }

  function resolveCluster(countryCode) {
    return CLUSTER[countryCode] || 'DEFAULT';
  }

  function resolveTier(countryCode) {
    return TIER[countryCode] || 'T4';
  }

  function resolveLanguage(countryCode, copy) {
    if (copy && copy.lang) return copy.lang;
    return LANG[countryCode] || 'en-US';
  }

  function lookupCopy(platformKey, cluster) {
    var platform = COPY[platformKey] || COPY.generic;
    return platform[cluster] || platform.DEFAULT || COPY.generic.DEFAULT;
  }

  function buildCanonical(pathname) {
    if (location.protocol === 'file:') return SITE_ORIGIN + (pathname === '/' ? '/' : pathname);
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return SITE_ORIGIN + (pathname === '/' ? '/' : pathname);
    }
    var origin = location.origin || SITE_ORIGIN;
    return origin + (pathname === '/' ? '/' : pathname);
  }

  function buildSchema(copy, canonical) {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'SaveFromGravity',
      description: copy.metaDescription,
      url: canonical,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      }
    });
  }

  function copyValue(copy, key) {
    if (key === 'meta.description') return copy.metaDescription;
    if (key === 'meta.keywords') return copy.metaKeywords;
    if (key === 'og.title') return copy.ogTitle;
    if (key === 'og.description') return copy.ogDescription;
    if (key === 'link.canonical') return copy.canonical;
    if (key === 'schema.app') return copy.schemaJson;
    return copy[key] || '';
  }

  function bindElement(el, key, value) {
    if (!value) return;
    if (key === 'link.canonical') {
      el.href = value;
      return;
    }
    if (key === 'schema.app') {
      el.textContent = value;
      return;
    }
    if (key.indexOf('meta.') === 0 || key.indexOf('og.') === 0) {
      el.content = value;
      return;
    }
    if (key === 'input.placeholder' || key.slice(-12) === '.placeholder') {
      el.placeholder = value;
      return;
    }
    if (key === 'input.aria' || key.slice(-5) === '.aria') {
      el.setAttribute('aria-label', value);
      return;
    }
    el.textContent = value;
  }

  var pathname = resolvePathname();
  var platformKey = resolvePlatform(pathname);
  var countryCode = resolveCountry();
  var cluster = resolveCluster(countryCode);
  var tier = resolveTier(countryCode);
  var copy = lookupCopy(platformKey, cluster);
  var canonical = buildCanonical(pathname);
  var languageKey = resolveLanguage(countryCode, copy);
  var schemaJson = buildSchema(copy, canonical);

  document.title = copy.title;
  document.documentElement.lang = languageKey;

  var nodes = document.querySelectorAll('[data-gravity-key],[data-i18n-key],[data-i18n-aria]');
  var n = nodes.length;
  var i;
  for (i = 0; i < n; i++) {
    var el = nodes[i];
    var gravityKey = el.getAttribute('data-gravity-key');
    var i18nKey = el.getAttribute('data-i18n-key');
    var ariaKey = el.getAttribute('data-i18n-aria');
    if (gravityKey) {
      if (gravityKey === 'link.canonical') bindElement(el, gravityKey, canonical);
      else if (gravityKey === 'schema.app') bindElement(el, gravityKey, schemaJson);
      else bindElement(el, gravityKey, copyValue(copy, gravityKey));
    }
    if (i18nKey) bindElement(el, i18nKey, copy[i18nKey]);
    if (ariaKey) bindElement(el, ariaKey, copy[ariaKey]);
  }

  document.documentElement.classList.remove('gravity-pending');

  var adMount = document.querySelector('[data-ad-mount="primary"]');
  if (adMount) {
    var ad = ADS[tier] || ADS.T4;
    adMount.classList.remove('ad-tier-t1', 'ad-tier-t2', 'ad-tier-t3', 'ad-tier-t4');
    adMount.classList.add(ad.cls);
    adMount.setAttribute('data-ad-tier', tier);
    adMount.setAttribute('data-ad-unit', ad.unit);
  }

  var frozenCopy = Object.freeze({
    lang: copy.lang,
    title: copy.title,
    metaDescription: copy.metaDescription,
    metaKeywords: copy.metaKeywords,
    ogTitle: copy.ogTitle,
    ogDescription: copy.ogDescription,
    canonical: canonical,
    schemaJson: schemaJson,
    'welcome-title': copy['welcome-title'],
    'input.placeholder': copy['input.placeholder'],
    'input.aria': copy['input.aria'],
    'button.send.aria': copy['button.send.aria'],
    'composer.aria': copy['composer.aria'],
    'ad.label': copy['ad.label'],
    'ad.title': copy['ad.title'],
    'ad.desc': copy['ad.desc'],
    'error.duration_exceeded':
      DURATION_ERRORS[cluster] || DURATION_ERRORS.DEFAULT,
    'error.stream_protected':
      copy['error.stream_protected'] || STREAM_ERRORS[cluster] || STREAM_ERRORS.DEFAULT
  });

  var context = Object.freeze({
    platformKey: platformKey,
    countryCode: countryCode,
    cluster: cluster,
    tier: tier,
    languageKey: languageKey,
    canonical: canonical,
    site: SITE_ORIGIN,
    route: Object.freeze({ pathname: pathname }),
    copy: frozenCopy
  });

  window.__GRAVITY__ = context;

  document.dispatchEvent(new CustomEvent('gravity:ready', { detail: context }));
})();
