
/* =====================================================================
   Multi-Manual Viewer – App Script
   ---------------------------------------------------------------------
   WHAT THIS DOES
   - Loads a manifest of manuals (data/manuals.json)
   - Fetches and renders Markdown (via raw.githubusercontent.com)
   - Generates a right-side TOC from headings
   - Preserves internal cross-references and relative images/links
   - Left drawer with manual index + dark/light theme toggle
   - Mobile-friendly layout
   - Simple search (current manual)

   HOW TO CUSTOMIZE (Search for "TODO:" comments)
   ===================================================================== */

(function() {
  // ----------------------------
  // TODO: Set these to your repo
  // ----------------------------
  const CONFIG = {
    GITHUB_USERNAME: '__GITHUB_USERNAME__', // e.g., 'Surya-Jaganathan'
    REPO_NAME: '__REPO_NAME__',             // e.g., 'multi-manual-site'
    BRANCH: 'main',                         // You said Pages is on main
    MANIFEST_PATH: 'data/manuals.json',     // keep this file in the repo

    COMPANY_NAME: 'Your Company',           // header middle (italic)
    COMPANY_LOGO_SRC: 'images/company-logo.png', // left logo and drawer
    PARTNER_LOGO_SRC: 'images/partner-logo.png', // right partner logo
  };

  // Compute raw base URL to fetch files from repo
  const RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.GITHUB_USERNAME}/${CONFIG.REPO_NAME}/${CONFIG.BRANCH}/`;

  // Elements
  const els = {
    article: document.getElementById('article'),
    tocList: document.getElementById('tocList'),
    companyName: document.getElementById('companyName'),
    companyLogo: document.getElementById('companyLogo'),
    partnerLogo: document.getElementById('partnerLogo'),
    drawerCompanyLogo: document.getElementById('drawerCompanyLogo'),
    drawerCompanyName: document.getElementById('drawerCompanyName'),
    drawerIndex: document.getElementById('drawerIndex'),
    menuButton: document.getElementById('menuButton'),
    drawer: document.getElementById('appDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    themeToggle: document.getElementById('themeToggle'),
    footerYear: document.getElementById('footerYear'),
    footerCompany: document.getElementById('footerCompany'),
    homeLink: document.getElementById('homeLink'),
    searchBox: document.getElementById('searchBox'),
  };

  // Initialize header/footer
  function initBranding() {
    els.companyName.textContent = CONFIG.COMPANY_NAME;
    els.drawerCompanyName.textContent = CONFIG.COMPANY_NAME;
    els.footerCompany.textContent = CONFIG.COMPANY_NAME;
    els.footerYear.textContent = new Date().getFullYear();
    els.companyLogo.src = CONFIG.COMPANY_LOGO_SRC;
    els.drawerCompanyLogo.src = CONFIG.COMPANY_LOGO_SRC;
    els.partnerLogo.src = CONFIG.PARTNER_LOGO_SRC;
  }

  // Theme handling
  function applySavedTheme() {
    const saved = localStorage.getItem('mmv-theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('mmv-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('mmv-theme', 'dark');
    }
  }

  // Drawer handling (open/close)
  function openDrawer() {
    els.drawer.classList.add('open');
    els.drawer.setAttribute('aria-hidden', 'false');
    els.drawerBackdrop.hidden = false;
    els.drawerBackdrop.style.display = 'block';
    els.menuButton.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    els.drawer.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
    els.drawerBackdrop.hidden = true;
    els.drawerBackdrop.style.display = 'none';
    els.menuButton.setAttribute('aria-expanded', 'false');
  }
  els.menuButton.addEventListener('click', () => {
    const open = els.menuButton.getAttribute('aria-expanded') === 'true';
    if (open) closeDrawer(); else openDrawer();
  });
  els.drawerBackdrop.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // Manifest load → build index
  let manifest = [];
  async function loadManifest() {
    const url = RAW_BASE + CONFIG.MANIFEST_PATH;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Failed to load manifest: ' + resp.status);
      manifest = await resp.json();
      buildIndex(manifest);
      // Load first manual by default
      if (manifest.length) loadManual(manifest[0]);
    } catch (err) {
      els.article.innerHTML = `<p style="color:red">Error loading manifest: ${err.message}</p>`;
    }
  }

  function buildIndex(items) {
    els.drawerIndex.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = item.title || item.path || item.url;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        loadManual(item);
        closeDrawer();
      });
      li.appendChild(a);
      els.drawerIndex.appendChild(li);
    });
  }

  // Rewrite relatives for manuals inside THIS repo
  function rewriteRelativeUrls(mdText, mdPath) {
    const baseDir = mdPath.replace(/[^\/]+$/, ''); // remove filename, keep trailing slash

    function toRawUrl(rel) {
      if (/^(https?:)?\/\//i.test(rel)) return rel; // absolute
      if (rel.startsWith('#')) return rel;          // anchor
      if (rel.startsWith('/')) {
        const clean = rel.replace(/^\//, '');
        return RAW_BASE + clean;                    // repo root
      }
      return RAW_BASE + baseDir + rel;              // relative to md dir
    }

    mdText = mdText.replace(/(!\[[^\]]*\]\()([^\)]+)(\))/g, (m, p1, url, p3) => p1 + toRawUrl(url) + p3);
    mdText = mdText.replace(/(\[[^\]]*\]\()([^\)]+)(\))/g, (m, p1, url, p3) => p1 + toRawUrl(url) + p3);
    return mdText;
  }

  // Rewrite relatives for manuals loaded from OTHER repos (explicit base)
  function rewriteRelativeUrlsWithBase(mdText, base) {
    function toRawUrl(rel) {
      if (/^(https?:)?\/\//i.test(rel)) return rel;
      if (rel.startsWith('#')) return rel;
      if (rel.startsWith('/')) {
        // Treat root-relative as "repo root" of provided base
        const clean = rel.replace(/^\//, '');
        return base.replace(/[^/]+$/, '') + clean;
      }
      return base + rel;
    }
    mdText = mdText.replace(/(!\[[^\]]*\]\()([^\)]+)(\))/g, (m, p1, url, p3) => p1 + toRawUrl(url) + p3);
    mdText = mdText.replace(/(\[[^\]]*\]\()([^\)]+)(\))/g, (m, p1, url, p3) => p1 + toRawUrl(url) + p3);
    return mdText;
  }

  // Render TOC from headings
  function buildToc() {
    const headings = els.article.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const tocItems = [];
    headings.forEach(h => {
      // Ensure id
      if (!h.id) {
        h.id = h.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
      }
      tocItems.push({ level: parseInt(h.tagName.substring(1), 10), text: h.textContent, id: h.id });
    });

    // Build nested list (simple: indent with padding based on level)
    els.tocList.innerHTML = '';
    tocItems.forEach(item => {
      const li = document.createElement('li');
      li.style.paddingLeft = ((item.level - 1) * 12) + 'px';
      const a = document.createElement('a');
      a.href = '#' + item.id;
      a.textContent = item.text;
      li.appendChild(a);
      els.tocList.appendChild(li);
    });

    // Scroll spy
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const link = els.tocList.querySelector(`a[href="#${id}"]`);
        if (link) {
          if (entry.isIntersecting) { link.classList.add('active'); }
          else { link.classList.remove('active'); }
        }
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0.1 });
    headings.forEach(h => observer.observe(h));
  }

  // Render Markdown into article (supports this repo OR external url+base)
  async function loadManual(item) {
    const isSameRepo = !!item.path;
    const mdUrl = isSameRepo ? (RAW_BASE + item.path) : item.url;

    els.article.innerHTML = '<p>Loading…</p>';
    try {
      let mdText = await (await fetch(mdUrl)).text();

      if (isSameRepo) {
        mdText = rewriteRelativeUrls(mdText, item.path);
      } else if (item.base) {
        mdText = rewriteRelativeUrlsWithBase(mdText, item.base);
      }
      // If external without base, leave md as-is; absolute links/images still work.

      marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
      const html = marked.parse(mdText);
      const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      els.article.innerHTML = safe;

      // Intercept md links for SPA-like navigation
      els.article.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        const isAbs = /^(https?:)?\/\//i.test(href);
        const isMd = /\.md($|#|\?)/.test(href);
        if (isMd) {
          a.addEventListener('click', (e) => {
            e.preventDefault();

            if (isAbs) {
              // External md: load via url; derive base as its directory
              const nextBase = href.replace(/[^/]+$/, '');
              loadManual({ title: href, url: href, base: nextBase });
            } else if (isSameRepo) {
              // Relative to current md directory in this repo
              const baseDir = item.path.replace(/[^\/]+$/, '');
              const path = href.startsWith('/') ? href.replace(/^\//, '') : (baseDir + href);
              loadManual({ title: path, path });
            } else if (item.base) {
              // Relative to provided external base
              const full = href.startsWith('/') ? (item.base.replace(/docs\/?$/, '') + href.replace(/^\//, '')) : (item.base + href);
              const nextBase = full.replace(/[^/]+$/, '');
              loadManual({ title: href, url: full, base: nextBase });
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        }
      });

      buildToc();

      // Build search index after TOC
      buildSearchIndex();

      // Update URL hash for deep-linking
      const encoded = encodeURIComponent(isSameRepo ? item.path : item.url);
      history.replaceState(null, '', `#manual=${encoded}`);
    } catch (err) {
      els.article.innerHTML = `<p style="color:red">Failed to load manual: ${err.message}</p>`;
    }
  }

  // Support loading manual from URL hash (e.g., #manual=docs/home.md)
  function loadManualFromHash() {
    const m = location.hash.match(/manual=([^&]+)/);
    if (m) {
      const key = decodeURIComponent(m[1]);
      // If the key matches a path in manifest, prefer that
      const found = manifest.find(x => (x.path === key || x.url === key));
      if (found) return loadManual(found);
      // Otherwise, try direct (assume external url)
      if (/^(https?:)?\/\//i.test(key)) return loadManual({ title: key, url: key, base: key.replace(/[^/]+$/, '') });
      // Or same repo path
      return loadManual({ title: key, path: key });
    }
  }

  // Home link resets to first manual
  els.homeLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (manifest.length) {
      loadManual(manifest[0]); // "Home"
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Theme toggle
  els.themeToggle.addEventListener('click', toggleTheme);

  // --- Simple search over current manual ---
  let searchIndex = [];
  function buildSearchIndex() {
    searchIndex = [];
    const nodes = document.querySelectorAll('#article h1, #article h2, #article h3, #article h4, #article h5, #article h6, #article p, #article li');
    nodes.forEach(n => {
      const text = n.textContent.trim();
      if (text.length > 0) {
        const id = n.id || (n.closest('[id]')?.id);
        searchIndex.push({ text, id, el: n });
      }
    });
  }
  if (els.searchBox) {
    els.searchBox.addEventListener('input', () => {
      const q = els.searchBox.value.trim().toLowerCase();
      document.querySelectorAll('.mmv-highlight').forEach(el => el.classList.remove('mmv-highlight'));
      if (!q) return;
      const matches = searchIndex.filter(x => x.text.toLowerCase().includes(q)).slice(0, 50);
      if (matches.length) {
        const target = matches[0].el;
        if (target) {
          target.classList.add('mmv-highlight');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  // Init
  initBranding();
  applySavedTheme();
  loadManifest().then(loadManualFromHash);
})();
