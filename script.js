const state = {
  docsIndex: null,
  flatFiles: [],
  routeLookup: new Map(),
  searchCache: new Map(),
  theme: 'light',
  expandedFolders: new Set(),
  currentFile: null,
  previousHash: null,
};

const contentEl = document.getElementById('content-inner');
const sidebarNavEl = document.getElementById('sidebar-nav');
const tocNavEl = document.getElementById('toc-nav');
const searchOverlayEl = document.getElementById('search-overlay');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const toastEl = document.getElementById('toast');
const themeToggleEl = document.getElementById('theme-toggle');
const themeIconEl = document.getElementById('theme-icon');

function init() {
  setupTheme();
  setupSearchUI();
  setupMobileSidebar();
  setupRouter();
  loadDocsIndex().then(() => {
    buildSidebar();
    bindHomePageCardClicks();
    routeToCurrentHash();
  });
}

async function loadDocsIndex() {
  try {
    const response = await fetch('./docs-index.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load docs index');
    }

    const data = await response.json();
    state.docsIndex = data;
    state.flatFiles = flattenFiles(data.folders || []);
    state.routeLookup = buildRouteLookup(state.flatFiles);
    state.expandedFolders = new Set(loadExpandedFolders());
    return data;
  } catch (error) {
    console.error(error);
    showErrorState('Documentation index could not be loaded.');
    return null;
  }
}

function flattenFiles(folders, result = []) {
  folders.forEach((folder) => {
    const folderFiles = folder.files || [];
    folderFiles.forEach((file) => {
      result.push({
        ...file,
        folderName: folder.name,
        folderTitle: folder.title,
        folderPath: folder.path,
        route: routeFromFilePath(file.path),
      });
    });

    if (folder.children) {
      flattenFiles(folder.children, result);
    }
  });

  return result;
}

function buildRouteLookup(files) {
  const lookup = new Map();
  files.forEach((file) => lookup.set(file.route, file));
  return lookup;
}

function routeFromFilePath(filePath) {
  const normalized = (filePath || '').replace(/\\/g, '/');
  const withDocs = normalized.startsWith('docs/') ? normalized : `docs/${normalized}`;
  return `#/` + withDocs.replace(/\.md$/i, '');
}

function filePathFromHash(hash) {
  const rawHash = (hash || '').replace(/^#\//, '');
  if (!rawHash || rawHash === 'home') {
    return null;
  }

  const normalized = rawHash.replace(/^docs\//, '');
  const pathWithMd = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
  if (!pathWithMd.startsWith('docs/')) {
    return `docs/${pathWithMd}`;
  }
  return pathWithMd;
}

function setupRouter() {
  window.addEventListener('hashchange', routeToCurrentHash);
}

async function routeToCurrentHash() {
  const currentHash = window.location.hash || '#/home';

  if (currentHash === '#/home' || currentHash === '') {
    renderHomePage();
    return;
  }

  const filePath = filePathFromHash(currentHash);
  if (!filePath) {
    renderHomePage();
    return;
  }

  const route = routeFromFilePath(filePath);
  const fileEntry = state.routeLookup.get(route) || findFileByPath(filePath);

  if (!fileEntry) {
    showErrorState('Document Not Found');
    return;
  }

  await loadDocument(fileEntry);
  highlightActiveSidebar(fileEntry.path);
}

function findFileByPath(filePath) {
  const target = (filePath || '').replace(/\\/g, '/');
  return state.flatFiles.find((file) => file.path.replace(/\\/g, '/') === target);
}

function renderHomePage() {
  const topFolders = state.docsIndex?.folders || [];
  const patterns = topFolders.map((folder) => ({
    ...folder,
    firstFile: getFirstFile(folder),
  }));

  const totalPatterns = patterns.length;
  const totalNotes = countDocuments(topFolders, 'notes');
  const totalProblems = countDocuments(topFolders, 'problems');

  contentEl.innerHTML = `
    <section class="home-page">
      <div class="home-page__hero">
        <p class="eyebrow">&lt; DSA Notes /&gt;</p>
        <h1>Master DSA Patterns,<br />One Pattern At A Time.</h1>
        <p>
          Learn the core pattern families, understand when to apply them, and move through
          notes, problem sets, and examples without leaving the documentation flow.
        </p>
        <button class="primary-button" data-route="${patterns[0]?.firstFile ? routeFromFilePath(patterns[0].firstFile.path) : '#/home'}">
          Explore DSA Patterns
        </button>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card__value">${totalPatterns}+</div>
          <div class="stat-card__label">Patterns</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${totalNotes}+</div>
          <div class="stat-card__label">Notes</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${totalProblems}+</div>
          <div class="stat-card__label">Problems</div>
        </div>
      </div>

      <div class="home-page__features">
        <div class="feature-card">
          <span class="feature-card__title">Pattern-first learning</span>
          <div class="feature-card__text">Study the idea, then jump straight into curated practice problems and examples.</div>
        </div>
        <div class="feature-card">
          <span class="feature-card__title">Structured progression</span>
          <div class="feature-card__text">Each topic is organized by notes, problems, and advanced follow-ups for a cleaner revision flow.</div>
        </div>
        <div class="feature-card">
          <span class="feature-card__title">Built from your docs</span>
          <div class="feature-card__text">Everything is generated from the Markdown files in the docs folder, so the guide stays up to date automatically.</div>
        </div>
      </div>

      <div class="pattern-grid">
        ${patterns
          .map((folder) => {
            const firstFile = folder.firstFile;
            const route = firstFile ? routeFromFilePath(firstFile.path) : '#/home';
            const title = folder.title || folder.name;
            return `
              <button class="pattern-card" data-route="${route}" aria-label="Open ${title}">
                <span class="pattern-card__title">${title}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    </section>
  `;

  bindHomePageCardClicks();
  renderTOC([], true);
  document.title = 'DSA Notes';
}

function getFirstFile(folder) {
  const items = [...(folder.files || []), ...collectChildrenFiles(folder.children || [])];
  return items[0] || null;
}

function collectChildrenFiles(children = []) {
  const results = [];
  children.forEach((child) => {
    results.push(...(child.files || []));
    if (child.children) {
      results.push(...collectChildrenFiles(child.children));
    }
  });
  return results;
}

function countDocuments(folders, keyword = '') {
  let total = 0;
  folders.forEach((folder) => {
    const folderFiles = [...(folder.files || []), ...collectChildrenFiles(folder.children || [])];
    folderFiles.forEach((file) => {
      if (!keyword || file.name.toLowerCase().includes(keyword.toLowerCase()) || file.title.toLowerCase().includes(keyword.toLowerCase())) {
        total += 1;
      }
    });
  });
  return total;
}

function buildSidebar() {
  if (!state.docsIndex?.folders) {
    return;
  }

  sidebarNavEl.innerHTML = '';
  const rootFolders = state.docsIndex.folders;

  rootFolders.forEach((folder) => {
    sidebarNavEl.appendChild(renderFolderNode(folder, true));
  });
}

function renderFolderNode(folder, isRoot = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-folder';

  const folderKey = folder.path;
  const expanded = state.expandedFolders.has(folderKey);

  const heading = document.createElement('button');
  heading.type = 'button';
  heading.className = `nav-folder__toggle ${expanded ? 'is-open' : ''}`;
  heading.setAttribute('data-folder-path', folderKey);
  heading.innerHTML = `
    <span class="nav-folder__caret">${expanded ? '▾' : '▸'}</span>
    <span class="nav-folder__label">${folder.title || folder.name}</span>
  `;
  heading.addEventListener('click', () => toggleFolder(folderKey));

  wrapper.appendChild(heading);

  const filesWrapper = document.createElement('div');
  filesWrapper.className = `nav-folder__content ${expanded ? 'is-visible' : ''}`;

  const allFiles = [...(folder.files || [])];
  allFiles.forEach((file) => {
    const fileItem = document.createElement('button');
    fileItem.type = 'button';
    fileItem.className = 'nav-file';
    fileItem.dataset.route = routeFromFilePath(file.path);
    fileItem.textContent = file.title || file.name;
    fileItem.addEventListener('click', () => {
      window.location.hash = fileItem.dataset.route;
      highlightActiveSidebar(file.path);
      if (window.innerWidth <= 767) {
        document.getElementById('sidebar')?.classList.remove('is-open');
        document.getElementById('mobile-menu-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });

    if (state.currentFile?.path === file.path) {
      fileItem.classList.add('is-active');
    }

    filesWrapper.appendChild(fileItem);
  });

  if (folder.children && folder.children.length) {
    folder.children.forEach((child) => {
      filesWrapper.appendChild(renderFolderNode(child, false));
    });
  }

  wrapper.appendChild(filesWrapper);

  return wrapper;
}

function toggleFolder(folderKey) {
  if (state.expandedFolders.has(folderKey)) {
    state.expandedFolders.delete(folderKey);
  } else {
    state.expandedFolders.add(folderKey);
  }

  persistExpandedFolders();
  buildSidebar();
}

function loadExpandedFolders() {
  try {
    const stored = localStorage.getItem('dsa-docs-expanded');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

function persistExpandedFolders() {
  localStorage.setItem('dsa-docs-expanded', JSON.stringify([...state.expandedFolders]));
}

function highlightActiveSidebar(path) {
  document.querySelectorAll('.nav-file').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.route === routeFromFilePath(path));
  });
}

async function loadDocument(file) {
  if (!file) {
    showErrorState('Document Not Found');
    return;
  }

  state.currentFile = file;
  contentEl.innerHTML = '<div class="loading-state">Loading...</div>';
  renderTOC([], true);

  try {
    const response = await fetch(`./${file.path}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Missing document');
    }

    const markdown = await response.text();
    const html = renderMarkdown(markdown, file.path);
    const folderPath = file.folderPath || file.path.split('/').slice(0, -1).join('/');

    contentEl.innerHTML = `
      <article class="doc-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          ${buildBreadcrumbs(file.path)}
        </nav>
        <div class="markdown-body">${html}</div>
        <div class="doc-page__footer">
          ${buildPrevNextNavigation(file.path)}
        </div>
      </article>
    `;

    bindPrevNextButtons();
    bindInternalMarkdownLinks();
    setupCodeCopy();
    setupHeadingAnchors();
    buildTableOfContents();
    setPageTitle(file.title || file.name);
    buildSidebar();
    highlightActiveSidebar(file.path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    console.error(error);
    showErrorState('Document Not Found');
  }
}

function buildBreadcrumbs(filePath) {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const docsRootIndex = segments.indexOf('docs');

  const crumbParts = segments.slice(docsRootIndex + 1);
  const fileName = crumbParts.pop();
  const folderCrumbs = crumbParts.map((segment, index) => {
    const isFile = index === crumbParts.length - 1;
    const fullPath = `docs/${crumbParts.slice(0, index + 1).join('/')}`;
    const label = formatTitle(segment);
    if (isFile) {
      return `<span class="breadcrumb-current">${label}</span>`;
    }
    return `<button class="breadcrumb-link" data-route="${routeFromFilePath(fullPath + '.md')}">${label}</button>`;
  });

  const finalDocTitle = formatTitle(fileName.replace(/\.md$/i, ''));
  const breadcrumbHtml = [
    '<button class="breadcrumb-link" data-route="#/home">DSA Patterns</button>',
    ...folderCrumbs,
    `<span class="breadcrumb-current">${finalDocTitle}</span>`,
  ].join('<span class="breadcrumb-separator">/</span>');

  bindBreadcrumbClicks();
  return breadcrumbHtml;
}

function bindBreadcrumbClicks() {
  document.querySelectorAll('.breadcrumb-link').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route;
      if (route) {
        window.location.hash = route;
      }
    });
  });
}

function buildPrevNextNavigation(filePath) {
  const files = state.flatFiles.slice().sort((a, b) => {
    const one = a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    const two = b.path.localeCompare(a.path, undefined, { numeric: true, sensitivity: 'base' });
    return one - two;
  });

  const currentIndex = files.findIndex((item) => item.path === filePath);
  const prev = files[currentIndex - 1];
  const next = files[currentIndex + 1];

  return `
    <div class="prev-next-nav">
      <button class="prev-next-card ${prev ? '' : 'is-disabled'}" data-route="${prev ? routeFromFilePath(prev.path) : '#'}" ${prev ? '' : 'disabled'}>
        <span class="prev-next-card__label">← Previous</span>
        <span class="prev-next-card__title">${prev ? prev.title : 'No previous'}</span>
      </button>
      <button class="prev-next-card ${next ? '' : 'is-disabled'}" data-route="${next ? routeFromFilePath(next.path) : '#'}" ${next ? '' : 'disabled'}>
        <span class="prev-next-card__label">Next →</span>
        <span class="prev-next-card__title">${next ? next.title : 'No next'}</span>
      </button>
    </div>
  `;
}

function bindPrevNextButtons() {
  document.querySelectorAll('.prev-next-card[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route;
      if (!route || route === '#') return;
      window.location.hash = route;
    });
  });
}

function renderMarkdown(markdown, filePath) {
  const renderer = new marked.Renderer();

  renderer.heading = ({ text, depth, tokens }) => {
    const headingText = tokens ? tokens.map((token) => token.text || '').join('') : text;
    const id = slugifyHeading(headingText);
    return `<h${depth} id="${id}"><a href="#${id}" class="heading-anchor" aria-label="Anchor for ${headingText}">#</a>${text}</h${depth}>`;
  };

  renderer.link = ({ href, title, tokens }) => {
    const linkText = tokens.map((token) => token.text || '').join('');
    const safeHref = href || '#';
    const normalHref = safeHref.trim();
    const isMarkdown = normalHref.toLowerCase().endsWith('.md') || normalHref.includes('.md#');
    const isExternal = /^https?:\/\//i.test(normalHref) || /^mailto:/i.test(normalHref) || /^\/\//.test(normalHref);

    if (isExternal) {
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" title="${title || ''}">${linkText}</a>`;
    }

    const routeHref = isMarkdown ? routeFromFilePath(resolveRelativePath(filePath, normalHref)) : normalizeMarkdownLink(normalHref, filePath);

    return `<a href="${routeHref}" title="${title || ''}">${linkText}</a>`;
  };

  renderer.image = ({ href, title, text }) => {
    const resolvedHref = resolveRelativePath(filePath, href || '');
    const safeSrc = resolvedHref || href || '';
    const altText = text || 'Illustration';
    return `<img src="${safeSrc}" alt="${altText}" title="${title || ''}" loading="lazy" />`;
  };

  marked.setOptions({
    gfm: true,
    breaks: false,
    renderer,
    headerIds: false,
    mangle: false,
  });

  let html = marked.parse(markdown || '');
  html = sanitizeHtml(html);
  return html;
}

function normalizeMarkdownLink(href, filePath) {
  if (!href || href.startsWith('#')) {
    return href;
  }

  if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('data:')) {
    return href;
  }

  return `#/${resolveRelativePath(filePath, href).replace(/\\/g, '/').replace(/\.md$/i, '')}`;
}

function resolveRelativePath(currentFilePath, relativePath) {
  if (!relativePath || relativePath.startsWith('http') || relativePath.startsWith('#') || relativePath.startsWith('mailto:')) {
    return relativePath;
  }

  const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
  const fullPath = relativePath.startsWith('/') ? relativePath.slice(1) : `${currentDir}/${relativePath}`;
  const segments = fullPath.split('/').filter(Boolean);
  const stack = [];

  segments.forEach((segment) => {
    if (segment === '.') {
      return;
    }
    if (segment === '..') {
      stack.pop();
      return;
    }
    stack.push(segment);
  });

  return stack.join('/');
}

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const allNodes = template.content.querySelectorAll('*');

  allNodes.forEach((node) => {
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName)) {
      node.remove();
      return;
    }

    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || '';

      if (name.startsWith('on')) {
        node.removeAttribute(attribute.name);
      }

      if ((name === 'href' || name === 'src') && /^(javascript:|data:text\/html|vbscript:)/i.test(value.trim())) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return template.innerHTML;
}

function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^ -\uFFFF\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderTOC(headings, isHome = false) {
  if (isHome || !headings.length) {
    tocNavEl.innerHTML = isHome ? '<div class="toc-empty">Overview</div>' : '<div class="toc-empty">No headings</div>';
    return;
  }

  tocNavEl.innerHTML = headings
    .map((heading) => {
      const levelClass = `toc-item--${heading.level}`;
      return `
        <button class="toc-item ${levelClass}" data-target="${heading.id}">
          ${heading.text}
        </button>
      `;
    })
    .join('');

  tocNavEl.querySelectorAll('.toc-item').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function buildTableOfContents() {
  const headings = [...document.querySelectorAll('.markdown-body h2, .markdown-body h3, .markdown-body h4')]
    .map((heading, index) => {
      const text = heading.textContent.trim();
      const level = Number.parseInt(heading.tagName.replace('H', ''), 10);
      if (!heading.id) {
        heading.id = slugifyHeading(`${text}-${index}`);
      }
      return { id: heading.id, text, level };
    });

  renderTOC(headings);
  observeVisibleHeadings(headings);
}

function observeVisibleHeadings(headings) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        .map((entry) => entry.target.id);

      if (!visible.length) return;

      document.querySelectorAll('.toc-item').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.target === visible[0]);
      });
    },
    {
      rootMargin: '-20% 0px -60% 0px',
      threshold: [0.15, 0.5, 1],
    }
  );

  headings.forEach(({ id }) => {
    const heading = document.getElementById(id);
    if (heading) observer.observe(heading);
  });
}

function setupHeadingAnchors() {
  document.querySelectorAll('.markdown-body h2, .markdown-body h3, .markdown-body h4').forEach((heading) => {
    heading.addEventListener('mouseenter', () => {
      heading.classList.add('is-hovered');
    });
    heading.addEventListener('mouseleave', () => {
      heading.classList.remove('is-hovered');
    });
  });
}

function setupCodeCopy() {
  document.querySelectorAll('.markdown-body pre code').forEach((codeBlock) => {
    const pre = codeBlock.parentElement;
    if (!pre || pre.classList.contains('code-block--wrapped')) {
      return;
    }

    const languageClass = Array.from(codeBlock.classList).find((className) => className.startsWith('language-'));
    const language = languageClass ? languageClass.replace('language-', '').toUpperCase() : 'CODE';

    pre.classList.add('code-block--wrapped');
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-block__header';
    header.innerHTML = `
      <span class="code-block__language">${language}</span>
      <button class="code-copy" type="button">Copy</button>
    `;

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    const copyButton = header.querySelector('.code-copy');
    copyButton.addEventListener('click', async () => {
      try {
        const text = codeBlock.innerText;
        await navigator.clipboard.writeText(text);
        copyButton.textContent = '✓ Copied';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 1200);
      } catch (error) {
        console.error('Failed to copy code block', error);
      }
    });

    if (window.hljs) {
      window.hljs.highlightElement(codeBlock);
    }
  });
}

function setupSearchUI() {
  const searchTrigger = document.getElementById('search-button');
  searchTrigger.addEventListener('click', () => openSearch());

  searchOverlayEl.addEventListener('click', (event) => {
    if (event.target === searchOverlayEl) {
      closeSearch();
    }
  });

  searchInputEl.addEventListener('input', async (event) => {
    const query = event.target.value.trim();
    if (!query) {
      searchResultsEl.innerHTML = '<div class="search-empty">Type to search docs...</div>';
      return;
    }

    const results = await searchDocs(query);
    renderSearchResults(results);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }

    if (event.key === 'Escape' && !searchOverlayEl.classList.contains('hidden')) {
      closeSearch();
    }
  });
}

async function openSearch() {
  searchOverlayEl.classList.remove('hidden');
  searchOverlayEl.setAttribute('aria-hidden', 'false');
  setTimeout(() => searchInputEl.focus(), 50);
  searchInputEl.value = '';
  searchResultsEl.innerHTML = '<div class="search-empty">Search documentation...</div>';
}

function closeSearch() {
  searchOverlayEl.classList.add('hidden');
  searchOverlayEl.setAttribute('aria-hidden', 'true');
  searchInputEl.blur();
}

async function searchDocs(query) {
  if (!state.flatFiles.length) return [];

  const lowQuery = query.toLowerCase();
  const results = [];

  for (const file of state.flatFiles) {
    const filePath = file.path;
    let content = state.searchCache.get(filePath);

    if (!content) {
      try {
        const response = await fetch(`./${filePath}`, { cache: 'no-store' });
        if (response.ok) {
          content = await response.text();
          state.searchCache.set(filePath, content);
        }
      } catch (error) {
        content = '';
      }
    }

    const haystack = [
      file.title,
      file.name,
      file.folderTitle,
      file.folderName,
      content,
    ]
      .join(' ')
      .toLowerCase();

    if (haystack.includes(lowQuery)) {
      results.push(file);
    }
  }

  return results.slice(0, 12);
}

function renderSearchResults(results) {
  if (!results.length) {
    searchResultsEl.innerHTML = '<div class="search-empty">No matches found.</div>';
    return;
  }

  searchResultsEl.innerHTML = results
    .map((file) => {
      const folderLabel = file.folderTitle || file.folderName || 'DSA Patterns';
      const route = routeFromFilePath(file.path);
      return `
        <button class="search-result" data-route="${route}" type="button">
          <span class="search-result__folder">${folderLabel}</span>
          <span class="search-result__title">${file.title}</span>
        </button>
      `;
    })
    .join('');

  searchResultsEl.querySelectorAll('.search-result').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route;
      if (route) {
        window.location.hash = route;
        closeSearch();
      }
    });
  });
}

function setupTheme() {
  const saved = localStorage.getItem('dsa-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(state.theme);

  themeToggleEl.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dsa-theme', state.theme);
    applyTheme(state.theme);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  themeIconEl.textContent = isDark ? '☾' : '☀';
  themeToggleEl.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  const highlightCss = isDark ? 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css' : 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css';
  const existing = document.querySelector('link[data-highlight-theme]');
  if (existing) {
    existing.href = highlightCss;
  } else {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = highlightCss;
    link.setAttribute('data-highlight-theme', 'true');
    document.head.appendChild(link);
  }
}

function bindHomePageCardClicks() {
  document.querySelectorAll('.pattern-card, .primary-button').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route;
      if (route) {
        window.location.hash = route;
      }
    });
  });
}

function setupMobileSidebar() {
  const toggle = document.getElementById('mobile-menu-toggle');
  const sidebar = document.getElementById('sidebar');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (event) => {
    if (window.innerWidth > 767) return;
    const clickedInsideSidebar = sidebar.contains(event.target);
    const clickedToggle = toggle.contains(event.target);
    if (!clickedInsideSidebar && !clickedToggle) {
      sidebar.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function setPageTitle(title) {
  document.title = `${title} | DSA Notes`;
}

function showErrorState(message) {
  contentEl.innerHTML = `
    <div class="error-state">
      <h1>Document Not Found</h1>
      <p>${message}</p>
      <button class="primary-button" data-route="#/home">Back To Documentation</button>
    </div>
  `;

  renderTOC([], true);
  document.querySelector('.primary-button')?.addEventListener('click', () => {
    window.location.hash = '#/home';
  });
}

function bindInternalMarkdownLinks() {
  document.querySelectorAll('.markdown-body a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) {
      return;
    }

    link.addEventListener('click', (event) => {
      const targetHref = link.getAttribute('href');
      if (targetHref && targetHref.endsWith('.md')) {
        event.preventDefault();
        const route = routeFromFilePath(resolveRelativePath(state.currentFile.path, targetHref));
        if (route) {
          window.location.hash = route;
        }
      }
    });
  });
}

function formatTitle(value) {
  if (!value) return 'Untitled';
  return String(value)
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  setTimeout(() => toastEl.classList.add('hidden'), 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
