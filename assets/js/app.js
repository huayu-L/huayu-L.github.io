/* =========================================================
   Huayu — static Markdown blog
   Notes are discovered from the GitHub repository and rendered
   in the browser. Drop a .md file into /notes and it appears.
   ========================================================= */

(function () {
  'use strict';

  const CONFIG = {
    siteName: 'Huayu',
    repo: 'huayu-L/huayu-L.github.io',
    branch: 'main',
    notesDir: 'notes',
    manifestPath: 'notes/_index.json',
    github: 'https://github.com/huayu-L',
    since: 2026,
    cacheKey: 'huayu:notes-index:v2',
    cacheVersion: 2,
    apiTimeout: 12000,
    fileTimeout: 12000
  };

  const els = {};
  const state = {
    posts: [],
    status: 'loading',
    query: '',
    activeTag: 'all',
    routeToken: 0,
    currentRoute: null,
    noteViewPath: null,
    articleEl: null,
    headingEls: [],
    tocButtons: [],
    lastDataSignature: '',
    contentCache: new Map()
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Boot ---------- */

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    els.app = document.getElementById('app');
    els.header = document.getElementById('site-header');
    els.themeToggle = document.getElementById('theme-toggle');
    els.menuToggle = document.getElementById('menu-toggle');
    els.mobileNav = document.getElementById('mobile-nav');
    els.progress = document.getElementById('reading-progress');
    els.progressBar = els.progress ? els.progress.querySelector('span') : null;
    els.backToTop = document.getElementById('back-to-top');
    els.footerYear = document.getElementById('footer-year');

    if (els.footerYear) {
      els.footerYear.textContent = String(new Date().getFullYear());
    }

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    initTheme();
    initMenu();
    initGlobalEvents();
    initScrollUi();
    initKeyboardShortcuts();

    window.addEventListener('hashchange', onRouteChange);
    renderRoute();
    loadData();
  }

  /* ---------- Utilities ---------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function encodePath(path) {
    return String(path)
      .split('/')
      .map(function (part) {
        return encodeURIComponent(part);
      })
      .join('/');
  }

  function noteHref(path) {
    return '#/note/' + encodePath(path);
  }

  function noteAssetUrl(notePath, source) {
    const src = String(source || '').trim();
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src)) {
      return source;
    }

    const pieces = src.match(/^([^?#]*)([?#].*)?$/);
    const filePart = (pieces && pieces[1]) || '';
    const suffix = (pieces && pieces[2]) || '';
    if (!filePart) return source;

    const noteDir = notePath.indexOf('/') >= 0
      ? notePath.slice(0, notePath.lastIndexOf('/') + 1)
      : '';

    try {
      let relative = combinePaths(noteDir, filePart);
      if (relative === null) return source;
      relative = stripNotesPrefix(decodePath(relative));
      return CONFIG.notesDir + '/' + encodePath(relative) + suffix;
    } catch (_) {
      return source;
    }
  }

  function combinePaths(noteDir, reference) {
    if (/^[/\\]/.test(reference) || /^[a-z][a-z0-9+.-]*:/i.test(reference)) {
      return null;
    }

    const stack = noteDir.split('/').filter(Boolean);
    const parts = reference.split('/');

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!stack.length) return null;
        stack.pop();
      } else {
        stack.push(part);
      }
    }

    return stack.join('/');
  }

  function stripNotesPrefix(path) {
    let value = String(path || '').replace(/^\/+/, '');
    if (value.indexOf(CONFIG.notesDir + '/') === 0) {
      value = value.slice(CONFIG.notesDir.length + 1);
    }
    return value;
  }

  function decodePath(path) {
    return String(path || '').split('/').map(function (part) {
      try {
        return decodeURIComponent(part);
      } catch (_) {
        return part;
      }
    }).join('/');
  }

  function resolveNoteLink(href, notePath) {
    const clean = String(href || '');
    const pieces = clean.match(/^([^?#]*)([?#].*)?$/);
    const filePart = pieces && pieces[1];
    if (!filePart || !/\.(md|markdown)$/i.test(filePart)) return null;

    let resolved;
    if (/^[/\\]/.test(filePart)) {
      const absolute = filePart.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      resolved = absolute.indexOf(CONFIG.notesDir + '/') === 0
        ? absolute.slice(CONFIG.notesDir.length + 1)
        : absolute;
    } else {
      const noteDir = notePath.indexOf('/') >= 0
        ? notePath.slice(0, notePath.lastIndexOf('/') + 1)
        : '';
      resolved = combinePaths(noteDir, filePart);
    }

    if (!resolved) return null;
    resolved = decodePath(resolved).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!resolved || resolved.split('/').some(function (part) { return part === '..' || part === ''; })) {
      return null;
    }
    if (!/\.(md|markdown)$/i.test(resolved)) return null;
    return resolved;
  }

  function truncate(text, length) {
    const value = String(text || '').trim();
    if (!value) return '';
    return value.length > length ? value.slice(0, length).replace(/[，。！？、；：,.!?;:\s]+$/, '') + '…' : value;
  }

  function cleanInlineMarkdown(text) {
    return String(text || '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`]/g, '')
      .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plainText(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/[|*_~`#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSearch(text) {
    return String(text || '')
      .normalize('NFKC')
      .toLocaleLowerCase('zh-CN')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function makeSearchText(title, description, tags, body) {
    return normalizeSearch([
      title,
      description,
      tags.join(' '),
      plainText(body).slice(0, 1800)
    ].join(' '));
  }

  function readingMinutes(body) {
    const text = plainText(body);
    const cjk = (text.match(/[㐀-䶿一-鿿豈-﫿]/g) || []).length;
    const latinWords = (text.replace(/[㐀-䶿一-鿿豈-﫿]/g, ' ').match(/[A-Za-z0-9]+(?:['’.-][A-Za-z0-9]+)*/g) || []).length;
    return Math.max(1, Math.ceil(cjk / 360 + latinWords / 220));
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
      return dateInfo(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }

    const match = String(value).trim().match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!match) return null;
    return dateInfo(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  function dateInfo(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    const pad = function (number) { return String(number).padStart(2, '0'); };
    return {
      iso: year + '-' + pad(month) + '-' + pad(day),
      display: year + '.' + pad(month) + '.' + pad(day),
      long: year + ' 年 ' + month + ' 月 ' + day + ' 日',
      sort: year + pad(month) + pad(day)
    };
  }

  function dateFromFilename(path) {
    const name = path.split('/').pop().replace(/\.(md|markdown)$/i, '');
    let match = name.match(/^(\d{4})[-_](\d{2})[-_](\d{2})(?:[-_\s]|$)/);
    if (match) return dateInfo(Number(match[1]), Number(match[2]), Number(match[3]));
    match = name.match(/^(\d{4})(\d{2})(\d{2})(?:[-_\s]|$)/);
    if (match) return dateInfo(Number(match[1]), Number(match[2]), Number(match[3]));
    return null;
  }

  function readableFilename(path) {
    const name = path.split('/').pop().replace(/\.(md|markdown)$/i, '');
    return name
      .replace(/^\d{4}[-_]?\d{2}[-_]?\d{2}[-_\s]*/, '')
      .replace(/[-_]+/g, ' ')
      .trim() || '无题';
  }

  function getPostsSignature() {
    return state.status + '|' + state.posts.map(function (post) {
      return [post.path, post.sha || '', post.title, post.date || ''].join(':');
    }).join('|');
  }

  function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    async function run() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await worker(items[index], index);
        } catch (error) {
          results[index] = null;
        }
      }
    }

    const count = Math.min(limit, items.length);
    const workers = [];
    for (let i = 0; i < count; i += 1) workers.push(run());
    return Promise.all(workers).then(function () { return results; });
  }

  function fetchText(url, options, timeout) {
    const controller = new AbortController();
    const timer = window.setTimeout(function () { controller.abort(); }, timeout || CONFIG.fileTimeout);
    const opts = Object.assign({}, options || {}, { signal: controller.signal });

    return fetch(url, opts).then(function (response) {
      if (!response.ok) {
        const error = new Error('HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return response.text();
    }).finally(function () {
      window.clearTimeout(timer);
    });
  }

  /* ---------- Front matter & post parsing ---------- */

  function splitFrontmatter(source) {
    const normalized = String(source || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const match = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);

    if (!match) {
      return { data: {}, body: normalized };
    }

    const data = {};
    let currentKey = null;

    match[1].split('\n').forEach(function (line) {
      if (!line.trim() || /^\s*#/.test(line)) return;

      const listItem = line.match(/^\s+-\s+(.*)$/);
      if (listItem && currentKey) {
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        data[currentKey].push(parseYamlScalar(listItem[1]));
        return;
      }

      const pair = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
      if (!pair) return;

      currentKey = pair[1].toLowerCase();
      const rawValue = (pair[2] || '').trim();
      data[currentKey] = rawValue === '' ? null : parseYamlScalar(rawValue);
    });

    return {
      data: data,
      body: normalized.slice(match[0].length).replace(/^\n+/, '')
    };
  }

  function parseYamlScalar(raw) {
    let value = String(raw || '').trim();

    if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
      const quote = value.charAt(0);
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      }
      return value;
    }

    if (value.charAt(0) === '[' && value.charAt(value.length - 1) === ']') {
      return value.slice(1, -1).split(',').map(parseYamlScalar).filter(function (item) {
        return item !== '';
      });
    }

    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(value)) return null;

    value = value.replace(/\s+#.*$/, '').trim();
    return value;
  }

  function findLeadingH1(body) {
    const stripped = String(body || '').replace(/^\s+/, '');
    const match = stripped.match(/^#\s+(.+?)\s*#*\s*(?:\n|$)/);
    return match ? cleanInlineMarkdown(match[1]) : '';
  }

  function removeLeadingH1(body) {
    const stripped = String(body || '').replace(/^\s+/, '');
    if (!/^#\s+/.test(stripped)) return body;
    return stripped.replace(/^#\s+.*(?:\n+|$)/, '');
  }

  function extractFirstParagraph(body) {
    const withoutTitle = removeLeadingH1(body).replace(/^\s+/, '');
    const blocks = withoutTitle.split(/\n{2,}/);

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i].trim();
      if (!block) continue;
      if (/^(#|```|~~~|>|[-*+]\s|\d+\.\s|\||!\[|<)/.test(block)) continue;
      const text = plainText(block);
      if (text) return text;
    }

    return '';
  }

  function normaliseTags(value) {
    let items = [];
    if (Array.isArray(value)) {
      items = value;
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.charAt(0) === '#') {
        items = trimmed.split(/\s+/);
      } else {
        items = trimmed.split(/[,，、;；]/);
      }
    }

    const seen = new Set();
    return items.map(function (item) {
      return String(item == null ? '' : item).trim().replace(/^#+/, '').trim();
    }).filter(function (tag) {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    }).slice(0, 6);
  }

  function fallbackTagsFromPath(path) {
    const parts = path.split('/');
    parts.pop();
    const folder = parts.filter(Boolean).pop();
    if (!folder || folder === CONFIG.notesDir || folder === 'drafts') return [];
    return [folder];
  }

  function parsePost(path, raw, extra) {
    const meta = splitFrontmatter(raw);
    const data = meta.data;
    const body = meta.body;
    const headingTitle = findLeadingH1(body);
    const filenameTitle = readableFilename(path);

    const titleValue = data.title != null && String(data.title).trim()
      ? cleanInlineMarkdown(data.title)
      : '';
    const title = titleValue || headingTitle || filenameTitle;

    const date = parseDateValue(data.date) ||
      parseDateValue(data.created) ||
      parseDateValue(data.published) ||
      dateFromFilename(path);

    let tags = normaliseTags(data.tags != null ? data.tags : data.tag);
    if (!tags.length) tags = normaliseTags(data.categories != null ? data.categories : data.category);
    if (!tags.length) tags = fallbackTagsFromPath(path);

    const metaDescription = data.description != null ? data.description :
      (data.summary != null ? data.summary : data.excerpt);
    const description = truncate(
      cleanInlineMarkdown(metaDescription || extractFirstParagraph(body)),
      160
    );
    const minutes = readingMinutes(body);
    const draftValue = data.draft;
    const draft = draftValue === true || String(draftValue).toLowerCase() === 'true';

    return {
      path: path,
      sha: (extra && extra.sha) || '',
      size: (extra && extra.size) || 0,
      title: title,
      date: date ? date.iso : '',
      dateLabel: date ? date.display : '',
      dateLong: date ? date.long : '',
      dateSort: date ? date.sort : '',
      tags: tags,
      description: description,
      excerpt: description || truncate(plainText(body), 150),
      minutes: minutes,
      chars: plainText(body).length,
      draft: draft,
      searchText: makeSearchText(title, description, tags, body)
    };
  }

  function fallbackPost(path, extra) {
    const date = dateFromFilename(path);
    const title = readableFilename(path);
    return {
      path: path,
      sha: '',
      size: (extra && extra.size) || 0,
      title: title,
      date: date ? date.iso : '',
      dateLabel: date ? date.display : '',
      dateLong: date ? date.long : '',
      dateSort: date ? date.sort : '',
      tags: fallbackTagsFromPath(path),
      description: '',
      excerpt: '',
      minutes: 1,
      chars: 0,
      draft: false,
      searchText: normalizeSearch(title)
    };
  }

  function sortPosts(posts) {
    return posts.slice().sort(function (a, b) {
      if (a.dateSort && b.dateSort) {
        const dateCompare = b.dateSort.localeCompare(a.dateSort);
        if (dateCompare !== 0) return dateCompare;
      } else if (a.dateSort) {
        return -1;
      } else if (b.dateSort) {
        return 1;
      }
      return a.title.localeCompare(b.title, 'zh-CN');
    });
  }

  /* ---------- Data loading ---------- */

  async function loadData() {
    const cached = readCache();
    if (cached) {
      state.posts = cached;
      state.status = 'ready';
      refreshAfterData();
    }

    try {
      const files = await fetchRepoTree();
      const posts = await buildPosts(files);
      state.posts = sortPosts(posts.filter(function (post) { return !post.draft; }));
      state.status = 'ready';
      if (state.activeTag !== 'all' && !state.posts.some(function (post) {
        return post.tags.indexOf(state.activeTag) >= 0;
      })) {
        state.activeTag = 'all';
      }
      writeCache(state.posts);
      refreshAfterData();
    } catch (error) {
      console.warn('[Huayu] GitHub note discovery failed:', error);

      if (state.posts.length) {
        state.status = 'ready';
        refreshAfterData();
        return;
      }

      try {
        const manifestPosts = await loadManifest();
        state.posts = sortPosts(manifestPosts);
        state.status = 'ready';
        refreshAfterData();
      } catch (manifestError) {
        console.warn('[Huayu] Fallback note index failed:', manifestError);
        state.posts = [];
        state.status = 'error';
        refreshAfterData();
      }
    }
  }

  async function fetchRepoTree() {
    const url = 'https://api.github.com/repos/' + CONFIG.repo + '/git/trees/' +
      encodeURIComponent(CONFIG.branch) + '?recursive=1';
    const controller = new AbortController();
    const timer = window.setTimeout(function () { controller.abort(); }, CONFIG.apiTimeout);
    let response;

    try {
      response = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error('GitHub API returned ' + response.status);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.tree)) {
      throw new Error('GitHub API returned an invalid tree');
    }

    return data.tree.filter(function (item) {
      return item.type === 'blob' &&
        item.path.indexOf(CONFIG.notesDir + '/') === 0 &&
        /\.(md|markdown)$/i.test(item.path) &&
        isPublicNotePath(item.path);
    });
  }

  function isPublicNotePath(fullPath) {
    const relative = fullPath.slice(CONFIG.notesDir.length + 1);
    if (!relative) return false;

    const parts = relative.split('/');
    if (parts.some(function (part) {
      return !part || part.charAt(0) === '.' || part.charAt(0) === '_';
    })) {
      return false;
    }

    const filename = parts[parts.length - 1].toLowerCase();
    if (filename === 'readme.md' || filename === 'readme.markdown') return false;
    if (parts.some(function (part) { return part.toLowerCase() === 'drafts'; })) return false;

    return true;
  }

  async function buildPosts(files) {
    const oldPosts = new Map();
    state.posts.forEach(function (post) { oldPosts.set(post.path, post); });

    const loaded = await mapLimit(files, 5, async function (file) {
      const relative = file.path.slice(CONFIG.notesDir.length + 1);
      const oldPost = oldPosts.get(relative);

      if (oldPost && oldPost.sha && file.sha && oldPost.sha === file.sha) {
        return oldPost;
      }

      try {
        const raw = await fetchNoteRaw(relative, file.sha);
        state.contentCache.set(relative, raw);
        return parsePost(relative, raw, { sha: file.sha, size: file.size });
      } catch (error) {
        console.warn('[Huayu] Could not read note:', relative, error);
        if (oldPost) {
          return Object.assign({}, oldPost, { sha: '' });
        }
        return fallbackPost(relative, { size: file.size });
      }
    });

    return loaded.filter(Boolean);
  }

  async function fetchNoteRaw(relative, sha) {
    const encoded = encodePath(relative);
    let sameOriginError = null;

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      try {
        const url = new URL(CONFIG.notesDir + '/' + encoded, document.baseURI);
        if (sha) url.searchParams.set('v', sha);
        return await fetchText(url.href, { cache: 'no-cache' }, CONFIG.fileTimeout);
      } catch (error) {
        sameOriginError = error;
      }
    }

    const rawUrl = 'https://raw.githubusercontent.com/' + CONFIG.repo + '/' +
      encodePath(CONFIG.branch) + '/' + CONFIG.notesDir + '/' + encoded +
      (sha ? '?v=' + encodeURIComponent(sha) : '');

    try {
      return await fetchText(rawUrl, { cache: 'no-cache' }, CONFIG.fileTimeout);
    } catch (error) {
      if (sameOriginError) {
        throw new Error('无法读取这篇笔记（' + error.message + '）');
      }
      throw error;
    }
  }

  async function loadManifest() {
    const response = await fetch(CONFIG.manifestPath, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Fallback index returned ' + response.status);

    const data = await response.json();
    const entries = Array.isArray(data) ? data : (data && Array.isArray(data.posts) ? data.posts : []);
    const posts = [];

    entries.forEach(function (entry) {
      if (!entry || !entry.path) return;
      const relative = stripNotesPrefix(String(entry.path));
      if (!relative || !/\.(md|markdown)$/i.test(relative)) return;

      const filenameDate = dateFromFilename(relative);
      const entryDate = parseDateValue(entry.date) || filenameDate;
      const tags = normaliseTags(entry.tags);
      const title = cleanInlineMarkdown(entry.title || readableFilename(relative));
      const description = truncate(cleanInlineMarkdown(entry.description || entry.excerpt || ''), 160);

      posts.push({
        path: relative,
        sha: '',
        size: 0,
        title: title,
        date: entryDate ? entryDate.iso : '',
        dateLabel: entryDate ? entryDate.display : '',
        dateLong: entryDate ? entryDate.long : '',
        dateSort: entryDate ? entryDate.sort : '',
        tags: tags.length ? tags : fallbackTagsFromPath(relative),
        description: description,
        excerpt: description,
        minutes: Number(entry.minutes) > 0 ? Number(entry.minutes) : 1,
        chars: Number(entry.chars) > 0 ? Number(entry.chars) : 0,
        draft: entry.draft === true || String(entry.draft).toLowerCase() === 'true',
        searchText: normalizeSearch([title, description, tags.join(' ')].join(' '))
      });
    });

    return posts.filter(function (post) { return !post.draft; });
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CONFIG.cacheKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== CONFIG.cacheVersion || !Array.isArray(data.posts)) return null;

      return data.posts.filter(function (post) {
        return post && typeof post.path === 'string';
      }).map(function (post) {
        const date = parseDateValue(post.date) || parseDateValue(post.dateLabel);
        return {
          path: post.path,
          sha: post.sha || '',
          size: post.size || 0,
          title: post.title || readableFilename(post.path),
          date: post.date || (date ? date.iso : ''),
          dateLabel: post.dateLabel || (date ? date.display : ''),
          dateLong: post.dateLong || (date ? date.long : ''),
          dateSort: post.dateSort || (date ? date.sort : ''),
          tags: Array.isArray(post.tags) ? post.tags : [],
          description: post.description || '',
          excerpt: post.excerpt || post.description || '',
          minutes: Number(post.minutes) || 1,
          chars: Number(post.chars) || 0,
          draft: false,
          searchText: post.searchText || normalizeSearch([post.title, post.description, (post.tags || []).join(' ')].join(' '))
        };
      });
    } catch (_) {
      return null;
    }
  }

  function writeCache(posts) {
    try {
      const serialisable = posts.map(function (post) {
        return {
          path: post.path,
          sha: post.sha || '',
          size: post.size || 0,
          title: post.title,
          date: post.date,
          dateLabel: post.dateLabel,
          dateLong: post.dateLong,
          dateSort: post.dateSort,
          tags: post.tags,
          description: post.description,
          excerpt: post.excerpt,
          minutes: post.minutes,
          chars: post.chars,
          searchText: post.searchText
        };
      });
      localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
        version: CONFIG.cacheVersion,
        savedAt: Date.now(),
        posts: serialisable
      }));
    } catch (_) {
      // A full or disabled localStorage should never break the site.
    }
  }

  /* ---------- Routing ---------- */

  function parseRoute() {
    let raw = window.location.hash || '#/';
    raw = raw.replace(/^#/, '');
    if (!raw) raw = '/';
    if (raw.charAt(0) !== '/') raw = '/' + raw;

    const questionMark = raw.indexOf('?');
    if (questionMark >= 0) raw = raw.slice(0, questionMark);

    if (raw === '/' || raw === '') return { name: 'home' };
    if (raw === '/notes' || raw === '/notes/') return { name: 'notes' };
    if (raw === '/about' || raw === '/about/') return { name: 'about' };

    const noteMatch = raw.match(/^\/note\/(.+)$/);
    if (noteMatch) {
      let decoded;
      try {
        decoded = noteMatch[1].split('/').map(decodeURIComponent).join('/');
      } catch (_) {
        return { name: 'notFound' };
      }
      decoded = stripNotesPrefix(decoded);
      if (!decoded || decoded.indexOf('..') >= 0 || decoded.indexOf('\\') >= 0 ||
          !/\.(md|markdown)$/i.test(decoded)) {
        return { name: 'notFound' };
      }
      return { name: 'note', path: decoded };
    }

    return { name: 'notFound' };
  }

  function onRouteChange() {
    closeMenu(false);
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousBehavior;
    renderRoute();
    window.setTimeout(function () {
      if (els.app) els.app.focus({ preventScroll: true });
    }, 0);
  }

  function renderRoute() {
    state.routeToken += 1;
    const token = state.routeToken;
    const route = parseRoute();
    state.currentRoute = route;
    state.articleEl = null;
    state.headingEls = [];
    state.tocButtons = [];
    setNav(route.name === 'note' ? 'notes' : route.name);
    hideReadingProgress();
    updateDocumentMeta(route);

    if (route.name === 'note') {
      state.noteViewPath = null;
      if (state.status === 'loading' && !state.posts.length) {
        els.app.innerHTML = routeLoadingHtml('正在翻开这篇笔记…');
        return;
      }
      renderNotePage(route, token);
      return;
    }

    state.noteViewPath = null;

    if (route.name === 'home') {
      renderHome();
    } else if (route.name === 'notes') {
      renderNotesPage();
    } else if (route.name === 'about') {
      renderAbout();
    } else {
      renderNotFound();
    }

    state.lastDataSignature = getPostsSignature();
  }

  function refreshAfterData() {
    const route = parseRoute();

    if (route.name === 'note') {
      if (!state.noteViewPath) {
        renderRoute();
      }
      return;
    }

    if (route.name === 'about' || route.name === 'notFound') return;

    const activeIsSearch = document.activeElement && document.activeElement.id === 'note-search';
    if (route.name === 'notes' && activeIsSearch) return;

    if (state.lastDataSignature === getPostsSignature()) return;

    renderRoute();
  }

  function setNav(active) {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      const isActive = link.getAttribute('data-nav') === active;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function updateDocumentMeta(route) {
    const descriptions = {
      home: 'Huayu 的个人博客，记录代码、阅读与生活里那些值得留下的片段。',
      notes: '关于代码、阅读与生活的笔记，按时间静静排列。',
      about: '关于 Huayu，以及这个用 Markdown 和 GitHub Pages 搭建的小小空间。'
    };
    let title = CONFIG.siteName + ' · 在代码与文字之间';
    let description = descriptions.home;

    if (route.name === 'home') {
      title = CONFIG.siteName + ' · 在代码与文字之间';
    } else if (route.name === 'notes') {
      title = '笔记 · ' + CONFIG.siteName;
      description = descriptions.notes;
    } else if (route.name === 'about') {
      title = '关于 · ' + CONFIG.siteName;
      description = descriptions.about;
    } else if (route.name === 'notFound') {
      title = '页面未找到 · ' + CONFIG.siteName;
      description = '这一页似乎还没有被写下。';
    }

    updateMeta(title, description);
  }

  function updateMeta(title, description) {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);
  }

  function routeLoadingHtml(message) {
    return '<div class="route-loading" aria-live="polite">' +
      '<span class="loading-mark" aria-hidden="true">H</span>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '</div>';
  }

  /* ---------- Home ---------- */

  function renderHome() {
    const loading = state.status === 'loading';
    const hasError = state.status === 'error';
    const latest = state.posts.length ? state.posts[0] : null;
    const tags = allTags(state.posts);
    const latestDate = latest && latest.dateLabel ? latest.dateLabel : '—';
    const cards = loading
      ? skeletonCards(3)
      : state.posts.slice(0, 3).map(function (post, index) {
          return renderNoteCard(post, index);
        }).join('');

    const notesSection = state.posts.length
      ? '<div class="notes-grid' + (state.posts.length === 2 ? ' is-double' : '') + '">' + cards + '</div>'
      : loading
        ? '<div class="notes-grid">' + skeletonCards(3) + '</div>'
        : emptyBlock(
            hasError ? '笔记暂时没有加载出来' : '这里还没有笔记',
            hasError
              ? '可能是网络或 GitHub API 暂时不可用，稍后再来看看吧。'
              : '空白也是一种开始。等第一篇文字落在这里。',
            hasError ? '<button class="button button-ghost" type="button" data-retry-load>重新加载</button>' : ''
          );

    els.app.innerHTML =
      '<div class="view home-page">' +
        '<section class="hero container">' +
          '<div class="hero-copy">' +
            '<p class="eyebrow"><span class="eyebrow-dot"></span> Personal journal <span class="eyebrow-line"></span> 记录与思考</p>' +
            '<h1 class="hero-title">写下来，<br>让<span class="mark">时间</span>有迹可循。</h1>' +
            '<p class="hero-lead">一些关于代码、阅读和日常的片段。慢一点写，慢一点读，让走过的路留下可以回看的纹理。</p>' +
            '<div class="hero-actions">' +
              '<a class="button button-primary" href="#/notes">开始阅读' + arrowIcon('right') + '</a>' +
              '<a class="text-link" href="#/about">关于这个博客 <span>↗</span></a>' +
            '</div>' +
            '<div class="hero-stats" aria-label="博客统计">' +
              '<div class="hero-stat"><strong>' + (loading ? '—' : state.posts.length) + '</strong><span>Notes / 篇笔记</span></div>' +
              '<div class="hero-stat"><strong>' + (loading ? '—' : tags.length) + '</strong><span>Topics / 个标签</span></div>' +
              '<div class="hero-stat"><strong>' + (loading ? '—' : latestDate) + '</strong><span>Last note / 最近更新</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="hero-visual" aria-label="最新笔记">' +
            '<div class="hero-orbit hero-orbit-1" aria-hidden="true"></div>' +
            '<div class="hero-orbit hero-orbit-2" aria-hidden="true"></div>' +
            '<span class="hero-cross" aria-hidden="true"></span>' +
            '<span class="hero-annotation" aria-hidden="true">notes, slowly.</span>' +
            '<div class="specimen-stack">' +
              '<div class="specimen-back" aria-hidden="true"></div>' +
              renderSpecimen(latest, loading) +
            '</div>' +
            '<div class="hero-stamp" aria-hidden="true"><span>Field notes</span><i></i><span>Vol. 01</span></div>' +
          '</div>' +
        '</section>' +
        '<div class="word-strip" aria-hidden="true">' +
          '<div class="word-track">' +
            '<span>Write</span><i>✦</i><span class="word-accent">Read</span><i>✦</i><span>Think</span><i>✦</i><span class="word-accent">Wander</span><i>✦</i><span>Grow</span><i>✦</i><span class="word-accent">Repeat</span>' +
          '</div>' +
        '</div>' +
        '<section class="section container">' +
          '<div class="section-head">' +
            '<div><p class="eyebrow"><span class="eyebrow-dot"></span> Recent notes</p><h2 class="section-title">最近写下的</h2></div>' +
            '<a class="text-link" href="#/notes">全部笔记 <span>→</span></a>' +
          '</div>' +
          notesSection +
        '</section>' +
        '<section class="home-about container">' +
          '<div class="about-monogram" aria-hidden="true"><span>H</span><small>Est. ' + CONFIG.since + '</small></div>' +
          '<div class="home-about-copy">' +
            '<p class="eyebrow"><span class="eyebrow-dot"></span> About this space</p>' +
            '<h2 class="home-about-title">一个不急着<br>抵达的地方。</h2>' +
            '<p class="home-about-text">这里没有固定的主题，也没有必须完成的更新计划。只是把读过的书、写过的代码、想明白或仍没想明白的事，安静地放在一起。</p>' +
            '<a class="button button-ghost" href="#/about">了解这个博客' + arrowIcon('right') + '</a>' +
          '</div>' +
        '</section>' +
      '</div>';

    bindRetryButton();
  }

  function renderSpecimen(latest, loading) {
    if (loading) {
      return '<div class="specimen skeleton">' +
        '<div class="skeleton-line short"></div>' +
        '<div class="skeleton-line tall" style="margin-top:38px"></div>' +
        '<div class="skeleton-line"></div>' +
        '<div class="skeleton-line medium"></div>' +
        '<div class="skeleton-line short" style="margin-top:auto"></div>' +
        '</div>';
    }

    if (!latest) {
      return '<div class="specimen">' +
        '<div class="specimen-head"><span class="live-dot">Latest note</span><span>—</span></div>' +
        '<p class="specimen-kicker">A blank page</p>' +
        '<h2 class="specimen-title">空白也是<br>一种开始。</h2>' +
        '<p class="specimen-excerpt">等到一个值得记录的瞬间，第一篇文字就会出现在这里。</p>' +
        '<div class="specimen-foot"><span>Waiting for words</span><a href="#/notes">去笔记看看 ' + arrowIcon('up-right') + '</a></div>' +
        '</div>';
    }

    return '<article class="specimen">' +
      '<div class="specimen-head"><span class="live-dot">Latest note</span><span>' + escapeHtml(latest.dateLabel || '随笔') + '</span></div>' +
      '<p class="specimen-kicker">' + escapeHtml(latest.tags.length ? latest.tags[0] : '笔记') + '</p>' +
      '<h2 class="specimen-title"><a href="' + noteHref(latest.path) + '">' + escapeHtml(latest.title) + '</a></h2>' +
      '<p class="specimen-excerpt">' + escapeHtml(latest.excerpt || latest.description || '打开这一页，读读最近写下的文字。') + '</p>' +
      '<div class="specimen-foot"><span>' + latest.minutes + ' min read</span><a href="' + noteHref(latest.path) + '">翻开 ' + arrowIcon('up-right') + '</a></div>' +
      '</article>';
  }

  function allTags(posts) {
    const tags = new Map();
    posts.forEach(function (post) {
      post.tags.forEach(function (tag) {
        tags.set(tag, (tags.get(tag) || 0) + 1);
      });
    });
    return Array.from(tags.entries()).sort(function (a, b) {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'zh-CN');
    });
  }

  function renderNoteCard(post, index) {
    const title = escapeHtml(post.title);
    const href = noteHref(post.path);
    const tagMarkup = post.tags.slice(0, 3).map(function (tag) {
      return '<span class="note-tag">#' + escapeHtml(tag) + '</span>';
    }).join('');
    const description = post.description || post.excerpt || '打开这篇笔记，看看这页写了些什么。';
    const date = post.dateLabel || '随笔';
    const number = String(index + 1).padStart(2, '0');

    return '<article class="note-card" style="--i:' + (index % 4) + '">' +
      '<div class="note-card-top"><span class="note-number">' + number + '</span><time class="note-date" datetime="' + escapeHtml(post.date || '') + '">' + escapeHtml(date) + '</time></div>' +
      '<div class="note-tags">' + tagMarkup + '</div>' +
      '<h3 class="note-card-title"><a class="note-card-link" href="' + href + '">' + title + '</a></h3>' +
      '<p class="note-card-desc">' + escapeHtml(description) + '</p>' +
      '<div class="note-card-foot"><span>' + post.minutes + ' 分钟阅读</span><span class="note-card-arrow">' + arrowIcon('up-right') + '</span></div>' +
      '</article>';
  }

  function skeletonCards(count) {
    let markup = '';
    for (let i = 0; i < count; i += 1) {
      markup += '<div class="note-card skeleton" aria-hidden="true" style="--i:' + i + '">' +
        '<div class="skeleton-line short"></div>' +
        '<div class="skeleton-line" style="margin-top:48px;width:30%"></div>' +
        '<div class="skeleton-line tall" style="margin-top:18px"></div>' +
        '<div class="skeleton-line"></div>' +
        '<div class="skeleton-line medium"></div>' +
        '<div class="skeleton-line short" style="margin-top:auto"></div>' +
        '</div>';
    }
    return markup;
  }

  function emptyBlock(title, text, action) {
    return '<div class="empty-state">' +
      '<div class="empty-symbol" aria-hidden="true">∅</div>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<p>' + escapeHtml(text) + '</p>' +
      (action || '') +
      '</div>';
  }

  function bindRetryButton() {
    const button = els.app.querySelector('[data-retry-load]');
    if (button) {
      button.addEventListener('click', function () {
        window.location.reload();
      });
    }
  }

  /* ---------- Notes index ---------- */

  function renderNotesPage() {
    const loading = state.status === 'loading';
    const tags = allTags(state.posts);
    const filterMarkup = renderTagFilters(tags);

    els.app.innerHTML =
      '<div class="view notes-page">' +
        '<section class="page-hero container">' +
          '<p class="eyebrow"><span class="eyebrow-dot"></span> Index / Notes</p>' +
          '<div class="page-title-row">' +
            '<h1 class="page-title">所有笔记<span class="title-dot">.</span></h1>' +
            '<p class="page-intro">关于代码、阅读与生活的一些记录。它们按写下时的时间排列，不追赶什么，只负责被记住。</p>' +
          '</div>' +
        '</section>' +
        '<section class="notes-browser container">' +
          '<div class="notes-toolbar">' +
            '<label class="search-box">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>' +
              '<span class="sr-only">搜索笔记</span>' +
              '<input id="note-search" type="search" autocomplete="off" placeholder="搜索标题、标签或内容…" value="' + escapeHtml(state.query) + '" ' + (loading ? 'disabled' : '') + '>' +
              '<kbd>/</kbd>' +
            '</label>' +
            '<span class="result-count" aria-live="polite"><span id="notes-count">' + (loading ? '…' : state.posts.length) + '</span> 篇</span>' +
          '</div>' +
          '<div class="filter-row">' +
            '<span class="filter-label">标签</span>' +
            '<div class="tag-filters" id="tag-filters" role="group" aria-label="按标签筛选">' + filterMarkup + '</div>' +
          '</div>' +
          '<div id="notes-results">' +
            (loading ? '<div class="notes-grid">' + skeletonCards(4) + '</div>' : '') +
          '</div>' +
        '</section>' +
      '</div>';

    setupNotesBrowser();

    if (!loading) {
      applyNotesFilter();
    } else {
      bindRetryButton();
    }
  }

  function renderTagFilters(tags) {
    const allCount = state.posts.length;
    let markup = '<button class="filter-chip' + (state.activeTag === 'all' ? ' is-active' : '') + '" type="button" data-filter-tag="all" aria-pressed="' + (state.activeTag === 'all') + '">全部 <span>' + allCount + '</span></button>';

    tags.forEach(function (entry) {
      const tag = entry[0];
      const count = entry[1];
      markup += '<button class="filter-chip' + (state.activeTag === tag ? ' is-active' : '') + '" type="button" data-filter-tag="' + escapeHtml(tag) + '" aria-pressed="' + (state.activeTag === tag) + '">' + escapeHtml(tag) + ' <span>' + count + '</span></button>';
    });

    return markup;
  }

  function setupNotesBrowser() {
    const search = document.getElementById('note-search');
    const filters = document.getElementById('tag-filters');

    if (search) {
      search.addEventListener('input', function () {
        state.query = search.value;
        applyNotesFilter();
      });
    }

    if (filters) {
      filters.addEventListener('click', function (event) {
        const button = event.target.closest('[data-filter-tag]');
        if (!button) return;
        state.activeTag = button.getAttribute('data-filter-tag') || 'all';
        filters.querySelectorAll('[data-filter-tag]').forEach(function (chip) {
          const active = chip === button;
          chip.classList.toggle('is-active', active);
          chip.setAttribute('aria-pressed', String(active));
        });
        applyNotesFilter();
      });
    }

    bindRetryButton();

    const emptyButton = els.app.querySelector('[data-clear-filters]');
    if (emptyButton) {
      emptyButton.addEventListener('click', clearFilters);
    }
  }

  function getFilteredPosts() {
    const query = normalizeSearch(state.query);
    return state.posts.filter(function (post) {
      if (state.activeTag !== 'all' && post.tags.indexOf(state.activeTag) < 0) return false;
      if (!query) return true;
      const haystack = post.searchText || normalizeSearch([post.title, post.description, post.tags.join(' ')].join(' '));
      return haystack.indexOf(query) >= 0;
    });
  }

  function applyNotesFilter() {
    const results = document.getElementById('notes-results');
    const count = document.getElementById('notes-count');
    if (!results) return;

    if (state.status === 'loading') return;

    if (state.status === 'error' && !state.posts.length) {
      if (count) count.textContent = '0';
      results.innerHTML = emptyBlock(
        '笔记暂时走丢了',
        '可能是网络或 GitHub API 暂时不可用，请稍后重新加载。',
        '<button class="button button-ghost" type="button" data-retry-load>重新加载</button>'
      );
      bindRetryButton();
      return;
    }

    if (!state.posts.length) {
      if (count) count.textContent = '0';
      results.innerHTML = emptyBlock(
        '这里还是空白',
        '把第一篇 Markdown 笔记放进 notes 文件夹，它就会安静地出现在这里。',
        '<a class="text-link" href="#/about">了解这个博客 <span>→</span></a>'
      );
      return;
    }

    const filtered = getFilteredPosts();
    if (count) count.textContent = String(filtered.length);

    if (!filtered.length) {
      results.innerHTML = emptyBlock(
        '没有找到相关的笔记',
        '换一个关键词，或者把标签切回「全部」试试。',
        '<button class="inline-button" type="button" data-clear-filters>清除筛选</button>'
      );
      const clear = results.querySelector('[data-clear-filters]');
      if (clear) clear.addEventListener('click', clearFilters);
      return;
    }

    results.innerHTML = '<div class="notes-grid">' +
      filtered.map(function (post) {
        const index = state.posts.indexOf(post);
        return renderNoteCard(post, index);
      }).join('') +
      '</div>';
  }

  function clearFilters() {
    state.query = '';
    state.activeTag = 'all';
    const search = document.getElementById('note-search');
    if (search) search.value = '';
    const filters = document.getElementById('tag-filters');
    if (filters) {
      filters.querySelectorAll('[data-filter-tag]').forEach(function (chip) {
        const active = chip.getAttribute('data-filter-tag') === 'all';
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
    }
    applyNotesFilter();
  }

  /* ---------- Article ---------- */

  async function renderNotePage(route, token) {
    const post = findPost(route.path);

    if (!post) {
      renderNotFound('这一篇笔记还没有被写下');
      return;
    }

    state.noteViewPath = post.path;
    state.currentPost = post;
    updateMeta(post.title + ' · ' + CONFIG.siteName, post.description || '一篇来自 Huayu 的笔记。');

    let raw = state.contentCache.get(post.path);

    if (!raw) {
      els.app.innerHTML = routeLoadingHtml('正在载入这篇笔记…');
      try {
        raw = await fetchNoteRaw(post.path, post.sha);
        if (token !== state.routeToken) return;
        state.contentCache.set(post.path, raw);

        const parsed = parsePost(post.path, raw, { sha: post.sha, size: post.size });
        if (parsed.title && parsed.title !== post.title) {
          post.title = parsed.title;
        }
        if (parsed.description) post.description = parsed.description;
        if (parsed.excerpt) post.excerpt = parsed.excerpt;
        if (parsed.date) {
          post.date = parsed.date;
          post.dateLabel = parsed.dateLabel;
          post.dateLong = parsed.dateLong;
          post.dateSort = parsed.dateSort;
        }
        post.tags = parsed.tags.length ? parsed.tags : post.tags;
        post.minutes = parsed.minutes;
        post.chars = parsed.chars;
        post.searchText = parsed.searchText;
        updateMeta(post.title + ' · ' + CONFIG.siteName, post.description || '一篇来自 Huayu 的笔记。');
      } catch {
        if (token !== state.routeToken) return;
        renderArticleError(post);
        return;
      }
    }

    if (token !== state.routeToken) return;
    paintArticle(post, raw);
  }

  function findPost(path) {
    return state.posts.find(function (post) { return post.path === path; }) || null;
  }

  function paintArticle(post, raw) {
    let body = splitFrontmatter(raw).body;
    body = removeLeadingH1(body);

    let html;
    try {
      html = renderMarkdown(body);
    } catch {
      renderArticleError(post);
      return;
    }

    const currentIndex = state.posts.findIndex(function (item) { return item.path === post.path; });
    const newer = currentIndex > 0 ? state.posts[currentIndex - 1] : null;
    const older = currentIndex >= 0 && currentIndex < state.posts.length - 1 ? state.posts[currentIndex + 1] : null;
    const tagsMarkup = post.tags.map(function (tag) {
      return '<span class="article-tag">#' + escapeHtml(tag) + '</span>';
    }).join('');

    els.app.innerHTML =
      '<div class="view article-page">' +
        '<div class="container article-shell" id="article-shell">' +
          '<div class="article-main">' +
            '<a class="back-link" href="#/notes">' + arrowIcon('left') + ' 返回全部笔记</a>' +
            '<header class="article-header">' +
              '<p class="eyebrow"><span class="eyebrow-dot"></span> Note ' + (post.tags.length ? '/ ' + escapeHtml(post.tags[0]) : '/ 随笔') + '</p>' +
              '<h1 class="article-title">' + escapeHtml(post.title) + '</h1>' +
              (post.description ? '<p class="article-description">' + escapeHtml(post.description) + '</p>' : '') +
              '<div class="article-meta">' +
                '<time datetime="' + escapeHtml(post.date || '') + '">' + escapeHtml(post.dateLong || '未注日期') + '</time>' +
                '<span class="meta-dot" aria-hidden="true"></span>' +
                '<span>' + post.minutes + ' 分钟阅读</span>' +
                (post.chars ? '<span class="meta-dot" aria-hidden="true"></span><span>约 ' + post.chars + ' 字</span>' : '') +
              '</div>' +
              (tagsMarkup ? '<div class="article-tags">' + tagsMarkup + '</div>' : '') +
            '</header>' +
            '<div class="article-divider" aria-hidden="true"><span>✦</span></div>' +
            '<div id="mobile-toc-slot"></div>' +
            '<article class="prose" id="article-body"></article>' +
            '<div class="article-end">' +
              '<span class="end-mark" aria-hidden="true">完</span>' +
              '<p>感谢你读到这里。</p>' +
              '<a class="button button-ghost" href="#/notes">继续阅读其他笔记 ' + arrowIcon('right') + '</a>' +
            '</div>' +
            ((newer || older) ?
              '<nav class="post-pagination' + (newer && older ? '' : ' is-single') + '" aria-label="文章翻页">' +
                renderPager(newer, 'prev', '上一篇') +
                renderPager(older, 'next', '下一篇') +
              '</nav>' : '') +
          '</div>' +
          '<aside class="toc" id="toc" aria-label="本文目录">' +
            '<p class="toc-label">Contents / 目录</p>' +
            '<ol class="toc-list" id="toc-list"></ol>' +
            '<div class="toc-progress">阅读进度 <strong id="toc-percent">0%</strong></div>' +
          '</aside>' +
        '</div>' +
      '</div>';

    const articleBody = document.getElementById('article-body');
    articleBody.innerHTML = html;
    addHeadingIds(articleBody);

    const toc = buildTableOfContents(articleBody);
    const tocAside = document.getElementById('toc');
    const mobileSlot = document.getElementById('mobile-toc-slot');
    const shell = document.getElementById('article-shell');

    if (!toc.length) {
      if (tocAside) tocAside.remove();
      if (mobileSlot) mobileSlot.remove();
      if (shell) shell.classList.add('no-toc');
    } else {
      fillTableOfContents(toc, tocAside, mobileSlot);
    }

    enhanceArticle(articleBody, post);
    state.articleEl = articleBody;
    state.headingEls = Array.prototype.slice.call(articleBody.querySelectorAll('h2[id], h3[id]'));
    state.tocButtons = Array.prototype.slice.call(document.querySelectorAll('[data-toc-target]'));

    els.progress.classList.add('is-active');
    els.progress.setAttribute('aria-hidden', 'false');
    updateScrollUi();

    // Route-specific click refreshes the article content after metadata was cached.
    if (els.backToTop) els.backToTop.classList.toggle('is-visible', window.scrollY > 640);
  }

  function renderPager(post, direction, label) {
    if (!post) return '';
    return '<a class="post-pager ' + direction + '" href="' + noteHref(post.path) + '">' +
      '<small>' + label + '</small>' +
      '<strong>' + escapeHtml(post.title) + '</strong>' +
      '</a>';
  }

  function renderArticleError(post) {
    hideReadingProgress();
    updateMeta('无法读取笔记 · ' + CONFIG.siteName, '这篇笔记暂时无法读取。');
    els.app.innerHTML =
      '<div class="view article-page">' +
        '<div class="container" style="max-width:760px">' +
          '<a class="back-link" href="#/notes">' + arrowIcon('left') + ' 返回全部笔记</a>' +
          '<div class="article-error">' +
            '<h2>这一页暂时没有翻开</h2>' +
            '<p>' + escapeHtml(post.title) + ' 的内容没有成功载入。请检查网络后再试一次。</p>' +
            '<button class="button button-ghost" type="button" data-retry-note>重新加载</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    const retry = els.app.querySelector('[data-retry-note]');
    if (retry) {
      retry.addEventListener('click', function () {
        state.contentCache.delete(post.path);
        renderRoute();
      });
    }
  }

  /* ---------- Markdown ---------- */

  function renderMarkdown(body) {
    if (!window.marked || !window.DOMPurify) {
      throw new Error('Markdown renderer is unavailable');
    }

    const rawHtml = window.marked.parse(body, {
      gfm: true,
      breaks: false
    });

    return window.DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel', 'id', 'loading', 'decoding'],
      FORBID_TAGS: ['style', 'form'],
      FORBID_ATTR: ['style']
    });
  }

  function enhanceArticle(root, post) {
    processArticleLinks(root, post);
    processImages(root, post);
    processTables(root);
    processCodeBlocks(root);
  }

  function addHeadingIds(root) {
    const used = new Set();
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function (heading, index) {
      const base = slugify(heading.textContent) || 'section-' + (index + 1);
      let id = base;
      let suffix = 2;
      while (used.has(id)) {
        id = base + '-' + suffix;
        suffix += 1;
      }
      used.add(id);
      heading.id = id;
    });
  }

  function slugify(text) {
    return String(text || '')
      .normalize('NFKC')
      .toLocaleLowerCase('zh-CN')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_\-]/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56);
  }

  function processArticleLinks(root, post) {
    root.querySelectorAll('a[href]').forEach(function (link) {
      const href = link.getAttribute('href');
      if (!href) return;

      if (href.charAt(0) === '#') {
        if (href.charAt(1) === '/' || href === '#') return;
        link.addEventListener('click', function (event) {
          const targetId = decodeURIComponent(href.slice(1));
          const target = document.getElementById(targetId);
          if (target) {
            event.preventDefault();
            target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
          }
        });
        return;
      }

      if (/^(mailto:|tel:)/i.test(href)) return;

      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf('//') === 0) {
        try {
          const url = new URL(href, window.location.href);
          if (url.origin !== window.location.origin) {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
          }
        } catch (_) {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
        }
        return;
      }

      const noteLink = resolveNoteLink(href, post.path);
      if (noteLink) {
        link.setAttribute('href', noteHref(noteLink));
        return;
      }

      if (href.charAt(0) !== '#') {
        const asset = noteAssetUrl(post.path, href);
        if (asset) link.setAttribute('href', asset);
      }
    });
  }

  function processImages(root, post) {
    root.querySelectorAll('img').forEach(function (image) {
      const source = image.getAttribute('src');
      if (source) {
        const asset = noteAssetUrl(post.path, source);
        if (asset) image.setAttribute('src', asset);
      }
      image.setAttribute('loading', 'lazy');
      image.setAttribute('decoding', 'async');
      if (!image.getAttribute('alt')) image.setAttribute('alt', '');
    });
  }

  function processTables(root) {
    root.querySelectorAll('table').forEach(function (table) {
      if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrap';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function processCodeBlocks(root) {
    root.querySelectorAll('pre').forEach(function (pre) {
      const code = pre.querySelector('code');
      if (!code) return;

      let language = 'code';
      const languageClass = Array.prototype.find.call(code.classList, function (name) {
        return name.indexOf('language-') === 0;
      });
      if (languageClass) language = languageClass.slice('language-'.length) || 'code';
      pre.setAttribute('data-language', language);

      if (window.hljs && languageClass) {
        try {
          window.hljs.highlightElement(code);
        } catch (_) {
          // Highlighting is a progressive enhancement.
        }
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.setAttribute('aria-label', '复制代码');
      button.innerHTML = copyIcon() + '<span>复制</span>';
      button.addEventListener('click', function () {
        copyText(code.textContent).then(function () {
          button.innerHTML = checkIcon() + '<span>已复制</span>';
          button.setAttribute('aria-label', '代码已复制');
          window.setTimeout(function () {
            button.innerHTML = copyIcon() + '<span>复制</span>';
            button.setAttribute('aria-label', '复制代码');
          }, 1600);
        }).catch(function () {
          button.querySelector('span').textContent = '复制失败';
        });
      });
      pre.appendChild(button);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (_) {
        copied = false;
      }
      document.body.removeChild(area);
      if (copied) resolve();
      else reject(new Error('Copy failed'));
    });
  }

  /* ---------- Table of contents ---------- */

  function buildTableOfContents(articleBody) {
    return Array.prototype.slice.call(articleBody.querySelectorAll('h2[id], h3[id]')).map(function (heading) {
      return {
        id: heading.id,
        level: Number(heading.tagName.slice(1)),
        text: heading.textContent.trim()
      };
    });
  }

  function fillTableOfContents(entries, tocAside, mobileSlot) {
    const listMarkup = entries.map(function (entry) {
      return '<li class="toc-h' + entry.level + '"><button type="button" data-toc-target="' + escapeHtml(entry.id) + '">' + escapeHtml(entry.text) + '</button></li>';
    }).join('');

    const list = document.getElementById('toc-list');
    if (list) list.innerHTML = listMarkup;

    if (mobileSlot) {
      mobileSlot.innerHTML = '<details class="mobile-toc">' +
        '<summary>本文目录 · ' + entries.length + ' 节</summary>' +
        '<ol>' + listMarkup + '</ol>' +
        '</details>';
    }

    document.querySelectorAll('[data-toc-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        const target = document.getElementById(button.getAttribute('data-toc-target'));
        if (!target) return;
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        window.setTimeout(function () {
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }, reduceMotion ? 0 : 450);
        const details = button.closest('details');
        if (details) details.open = false;
      });
    });

    if (tocAside) {
      tocAside.hidden = false;
    }
  }

  function updateTocActive() {
    if (!state.headingEls.length) return;
    const threshold = window.scrollY + 140;
    let activeIndex = 0;

    state.headingEls.forEach(function (heading, index) {
      const top = heading.getBoundingClientRect().top + window.scrollY;
      if (top <= threshold) activeIndex = index;
    });

    state.tocButtons.forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-toc-target') === state.headingEls[activeIndex].id);
    });
  }

  /* ---------- About & 404 ---------- */

  function renderAbout() {
    els.app.innerHTML =
      '<div class="view about-page">' +
        '<section class="container">' +
          '<p class="eyebrow"><span class="eyebrow-dot"></span> About / 关于</p>' +
          '<div class="about-hero-grid">' +
            '<h1 class="about-title">你好，<br>我是 <em>Huayu</em>。</h1>' +
            '<p class="about-intro">这里是我的数字花园，收留那些不愿意被时间冲走的想法。' +
              '<span>Write slowly. Read deeply. Stay curious.</span>' +
            '</p>' +
          '</div>' +
          '<div class="about-main">' +
            '<aside class="about-aside">' +
              '<div class="about-portrait">' +
                '<div class="portrait-disc" aria-hidden="true"><span>H</span></div>' +
                '<div class="portrait-caption"><span>Huayu / Personal notes</span><span>Since ' + CONFIG.since + '</span></div>' +
              '</div>' +
              '<span class="about-stamp" aria-hidden="true">a quiet<br>corner</span>' +
            '</aside>' +
            '<div class="about-content">' +
              '<p class="lead">我喜欢把复杂的事情写清楚，也喜欢记录那些看似无用的瞬间。</p>' +
              '<p>这个博客没有宏大的目标。它更像一本摊开在桌上的笔记本：学到的东西、读过的书、写过的代码，以及某个下午忽然想明白的小事，都可以放在这里。</p>' +
              '<h2>这个博客是什么</h2>' +
              '<p>它是一个使用 Markdown 写作、由 GitHub Pages 托管的静态空间。没有算法推荐，没有信息流，也没有催促更新的红点。你可以按时间慢慢读，也可以搜索一个恰好感兴趣的词。</p>' +
              '<h2>这里会写什么</h2>' +
              '<ul class="about-topics">' +
                '<li data-index="01">学习与思考的笔记</li>' +
                '<li data-index="02">代码和工具的使用心得</li>' +
                '<li data-index="03">书、电影与日常观察</li>' +
                '<li data-index="04">尚未被归类的片段</li>' +
              '</ul>' +
              '<blockquote>“写作不是为了被看见，<br>而是为了让思考有形状。”</blockquote>' +
              '<h2>关于这个网站</h2>' +
              '<p>页面上的每篇文字都来自一个普通的 <code>.md</code> 文件。它们被放进 <code>notes</code> 文件夹，然后安静地出现在这里。简单、轻量，也足够长久。</p>' +
              '<p>如果你想看看这些页面之外的我，可以从 GitHub 开始。</p>' +
              '<a class="about-contact-link" href="' + escapeHtml(CONFIG.github) + '" target="_blank" rel="noopener noreferrer">' + githubIcon() + ' 在 GitHub 找到我</a>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';
  }

  function renderNotFound(message) {
    const title = message || '这一页还没有被写下';
    updateMeta('页面未找到 · ' + CONFIG.siteName, '这一页似乎还没有被写下。');
    els.app.innerHTML =
      '<div class="view">' +
        '<div class="not-found">' +
          '<div class="not-found-code" aria-hidden="true">404</div>' +
          '<h1>' + escapeHtml(title) + '</h1>' +
          '<p>也许它还在路上，也许只是链接走错了方向。</p>' +
          '<a class="button button-primary" href="#/notes">回到笔记' + arrowIcon('right') + '</a>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Icons ---------- */

  function arrowIcon(direction) {
    const paths = {
      right: '<path d="M4 12h15M13 6l6 6-6 6"/>',
      left: '<path d="M20 12H5M11 18l-6-6 6-6"/>',
      'up-right': '<path d="M7 17 17 7M8 7h9v9"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[direction] || paths.right) + '</svg>';
  }

  function copyIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1.6"/><path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v8.4A1.8 1.8 0 0 0 5.8 16H8"/></svg>';
  }

  function checkIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 6.8"/></svg>';
  }

  function githubIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.12.68-3.78-1.32-3.78-1.32-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.64 1.22 3.29.93.1-.72.39-1.22.71-1.5-2.49-.28-5.11-1.24-5.11-5.54 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.09 1.15a10.7 10.7 0 0 1 5.62 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.72.78 1.16 1.78 1.16 3 0 4.31-2.63 5.26-5.13 5.54.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>';
  }

  /* ---------- Theme, menu, scroll ---------- */

  function initTheme() {
    const saved = readLocal('huayu-theme');
    const current = document.documentElement.dataset.theme || (saved || 'light');
    applyTheme(current, false);

    if (els.themeToggle) {
      els.themeToggle.addEventListener('click', function () {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next, true);
      });
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function (event) {
      if (!readLocal('huayu-theme')) applyTheme(event.matches ? 'dark' : 'light', false);
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
  }

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    if (els.themeToggle) {
      els.themeToggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#151915' : '#f4f0e8');
    if (persist) {
      try {
        localStorage.setItem('huayu-theme', theme);
      } catch (_) {}
    }
  }

  function readLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function initMenu() {
    if (!els.menuToggle || !els.mobileNav) return;

    els.menuToggle.addEventListener('click', function () {
      const open = els.menuToggle.getAttribute('aria-expanded') === 'true';
      if (open) {
        closeMenu(true);
      } else {
        openMenu();
      }
    });

    els.mobileNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeMenu(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) closeMenu(false);
    });
  }

  function closeMenu(restoreFocus) {
    if (!els.menuToggle || !els.mobileNav) return;
    els.menuToggle.setAttribute('aria-expanded', 'false');
    els.menuToggle.setAttribute('aria-label', '打开菜单');
    els.mobileNav.classList.remove('is-open');
    els.mobileNav.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    if (restoreFocus) els.menuToggle.focus();
  }

  function openMenu() {
    if (!els.menuToggle || !els.mobileNav) return;
    els.menuToggle.setAttribute('aria-expanded', 'true');
    els.menuToggle.setAttribute('aria-label', '关闭菜单');
    els.mobileNav.classList.add('is-open');
    els.mobileNav.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    const firstLink = els.mobileNav.querySelector('a');
    if (firstLink) window.setTimeout(function () { firstLink.focus(); }, 100);
  }

  function initGlobalEvents() {
    if (els.backToTop) {
      els.backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }

    // The stretch-link overlay handles card clicks; keep keyboard focus visible.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (els.mobileNav && els.mobileNav.classList.contains('is-open')) {
          closeMenu(true);
          return;
        }
        const search = document.getElementById('note-search');
        if (search && document.activeElement === search && search.value) {
          search.value = '';
          state.query = '';
          applyNotesFilter();
        }
      }
    });
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || (target && target.isContentEditable)) return;
      if (!state.currentRoute || state.currentRoute.name !== 'notes') return;
      const search = document.getElementById('note-search');
      if (!search) return;
      event.preventDefault();
      search.focus();
    });
  }

  function initScrollUi() {
    let scheduled = false;

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        updateScrollUi();
      });
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
  }

  function updateScrollUi() {
    if (els.header) {
      els.header.classList.toggle('is-scrolled', window.scrollY > 10);
    }
    if (els.backToTop) {
      els.backToTop.classList.toggle('is-visible', window.scrollY > 640);
    }

    const route = state.currentRoute;
    const isNote = route && route.name === 'note';
    if (!isNote || !state.articleEl) {
      hideReadingProgress();
      return;
    }

    const rect = state.articleEl.getBoundingClientRect();
    const articleTop = rect.top + window.scrollY;
    const start = articleTop - window.innerHeight * 0.5;
    const end = articleTop + rect.height - window.innerHeight * 0.78;
    const progress = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(end - start, 1)));
    if (els.progressBar) els.progressBar.style.width = (progress * 100).toFixed(2) + '%';

    const percent = document.getElementById('toc-percent');
    if (percent) percent.textContent = Math.round(progress * 100) + '%';

    updateTocActive();
  }

  function hideReadingProgress() {
    if (els.progress) {
      els.progress.classList.remove('is-active');
      els.progress.setAttribute('aria-hidden', 'true');
    }
    if (els.progressBar) els.progressBar.style.width = '0%';
  }

})();
