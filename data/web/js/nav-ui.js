/**
 * nav-ui.js - 左侧导航UI模块（v2 重写版）
 * 使用 Vue Router 原生机制集成 #/canvas 和 #/onesentence
 * 
 * 核心策略：
 * 1. 通过 Vue Router 的 afterEach 钩子监听路由变化
 * 2. 为 #/canvas 和 #/onesentence 注入独立内容
 * 3. 通过 Vue __vue_app__ 访问 Router 实例
 * 4. 不使用定时器轮询，使用事件驱动
 */

// ============ 图标定义 ============
var CANVAS_ICON = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '  <rect x="3" y="3" width="18" height="18" rx="2"/>',
  '  <circle cx="8.5" cy="8.5" r="1.5"/>',
  '  <path d="M21 15l-5-5L5 21"/>',
  '</svg>'
].join("\n");

var ONESENTENCE_ICON = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '  <path d="M12 20h9"/>',
  '  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  '</svg>'
].join("\n");

// ============ 状态管理 ============
var state = {
  initialized: false,
  router: null,
  vueApp: null,
  currentView: null,
  styleInjected: false,
  hashListenerInstalled: false
};

// ============ 工具函数 ============

function getRoutePath() {
  var hash = window.location.hash || '';
  return hash.replace(/^#/, '') || '/';
}

// ============ 注入容器样式 ============

function injectBaseStyles() {
  if (state.styleInjected) return;
  state.styleInjected = true;

  var s = document.createElement('style');
  s.id = 'n9_base_styles';
  s.textContent = [
    '#n9_injected_container{position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;overflow:hidden;background:var(--bgc,var(--td-bg-color-page,#0b0b0f))}',
    '.n9_view_content{width:100%;height:100%;position:relative}',
    '.n9_nav_label{font-size:0.5rem;white-space:nowrap;pointer-events:none;margin-top:0.125rem;display:block;text-align:center;width:100%;line-height:1;opacity:.75;font-weight:500}',
    '.n9_icon{display:flex;align-items:center;justify-content:center;pointer-events:none}',
    '.n9_icon svg{width:24px;height:24px;display:block;pointer-events:none}',
    '@keyframes n9_item_appear{0%{opacity:0;transform:scale(0.5)}50%{opacity:0.5;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}',
    '.n9_item_el.n9_animating{animation:n9_item_appear 0.3s ease-out}',
    '.n9_tbtn{display:flex;align-items:center;gap:3px;padding:5px 8px;background:transparent;border:none;color:var(--td-text-color-secondary,#8888a0);font-size:11px;cursor:pointer;border-radius:6px;transition:all 0.15s;white-space:nowrap;font-family:inherit}',
    '.n9_tbtn:hover{background:var(--td-bg-color-component,#1a1a28);color:var(--td-text-color-primary,#eeeef0)}',
    '.n9_tbtn.active{background:var(--td-brand-color,#6c5ce7);color:#fff!important}',
    '.n9_tbtn svg{width:16px;height:16px;pointer-events:none;flex-shrink:0}',
    '.n9_hint{font-size:9px;opacity:0.5;margin-left:2px}',
    '.n9_text_edit{background:transparent;border:none;color:var(--td-text-color-primary,#eeeef0);font-family:inherit;font-size:14px;outline:none;width:100%;min-height:20px;resize:none;overflow:hidden;padding:4px}',
    '.n9_text_edit:focus{border-color:var(--td-brand-color,#6c5ce7)}',
    '.n9_connection_path{fill:none;stroke:var(--td-brand-color,#6c5ce7);stroke-width:2;stroke-linecap:round;cursor:pointer;transition:stroke 0.2s}',
    '.n9_connection_path:hover{stroke:var(--td-brand-color-hover,#a29bfe)}',
    '.n9_connection_dot{fill:var(--td-brand-color,#6c5ce7);cursor:pointer;transition:fill 0.2s}',
    '.n9_connection_dot:hover{fill:var(--td-brand-color-hover,#a29bfe)}',
    '#n9_selbox{position:absolute;border:1px solid var(--td-brand-color,#6c5ce7);background:rgba(108,92,231,0.08);pointer-events:none;z-index:50}',
  ].join('');
  document.head.appendChild(s);
}

// ============ 添加导航按钮到侧边栏 ============

function ensureNavButtons() {
  var itemBox = document.querySelector('.itemBox');
  if (!itemBox) return false;

  if (document.getElementById('n11') && document.getElementById('n12')) {
    // 确保它们还在 itemBox 中
    var n11 = document.getElementById('n11');
    var n12 = document.getElementById('n12');
    if (n11.parentNode !== itemBox) itemBox.appendChild(n11);
    if (n12.parentNode !== itemBox) itemBox.appendChild(n12);
    return true;
  }

  // 克隆 Vue 按钮以继承 scoped CSS (data-v-* 属性)
  var template = itemBox.querySelector('.item');
  if (!template) template = itemBox.children[0];
  if (!template) return false;

  // 浅克隆获取外层元素的 scoped CSS 属性
  var btn1 = template.cloneNode(false);
  btn1.id = 'n11';
  btn1.title = '无限画布';
  btn1.innerHTML = '<span class="n9_icon">' + CANVAS_ICON + '</span><span class="n9_nav_label">画布</span>';
  btn1.onclick = function(e) { e.stopPropagation(); navigateToRoute('canvas'); };
  itemBox.appendChild(btn1);

  var btn2 = template.cloneNode(false);
  btn2.id = 'n12';
  btn2.title = '一句话创作';
  btn2.innerHTML = '<span class="n9_icon">' + ONESENTENCE_ICON + '</span><span class="n9_nav_label">创作</span>';
  btn2.onclick = function(e) { e.stopPropagation(); navigateToRoute('onesentence'); };
  itemBox.appendChild(btn2);

  injectBaseStyles();
  addNavLabels();
  updateButtonStates();
  return true;
}

function addNavLabels() {
  var itemBox = document.querySelector('.itemBox');
  if (!itemBox) return;
  var vueItems = itemBox.querySelectorAll('div[id]');
  for (var i = 0; i < vueItems.length; i++) {
    var el = vueItems[i];
    if (!el.querySelector('.n9_nav_label')) {
      var label = '';
      if (el.id.indexOf('project') >= 0) label = '项目';
      else if (el.id.indexOf('task') >= 0) label = '任务';
      if (label) {
        var span = document.createElement('span');
        span.className = 'n9_nav_label';
        span.textContent = label;
        el.appendChild(span);
      }
    }
  }
}

// ============ 路由导航 ============

function navigateToRoute(view) {
  if (state.router) {
    state.router.push('/' + view).catch(function(err) {
      if (err && err.message && err.message.indexOf('redundant') < 0) {
        console.warn('[nav-ui] Navigation error:', err);
      }
    });
  } else {
    // 降级：直接修改 hash
    window.location.hash = '#/' + view;
  }
}

function updateButtonStates() {
  var path = getRoutePath();
  var isProject = path === '/project' || path === '/' || path === '';
  var isTask = path === '/task';
  var isCanvas = path === '/canvas';
  var isOneSentence = path === '/onesentence';

  // 更新注入按钮的激活状态
  var n11 = document.getElementById('n11');
  var n12 = document.getElementById('n12');
  if (n11) {
    n11.classList.toggle('active', isCanvas);
    n11.style.background = isCanvas ? 'var(--td-brand-color,#6c5ce7)' : '';
    n11.style.borderColor = isCanvas ? 'var(--td-brand-color,#6c5ce7)' : '';
  }
  if (n12) {
    n12.classList.toggle('active', isOneSentence);
    n12.style.background = isOneSentence ? 'var(--td-brand-color,#6c5ce7)' : '';
    n12.style.borderColor = isOneSentence ? 'var(--td-brand-color,#6c5ce7)' : '';
  }

  // 管理 Vue 原生按钮的激活状态（互斥：只能有一个按钮激活）
  var itemBox = document.querySelector('.itemBox');
  if (!itemBox) return;
  var vueBtns = itemBox.querySelectorAll('[id*="project"], [id*="task"]');
  for (var i = 0; i < vueBtns.length; i++) {
    var btn = vueBtns[i];
    var shouldBeActive = (btn.id.indexOf('project') >= 0 && isProject) ||
                          (btn.id.indexOf('task') >= 0 && isTask);
    btn.classList.toggle('active', shouldBeActive);
    if (shouldBeActive) {
      btn.style.background = 'var(--td-brand-color,#6c5ce7)';
      btn.style.borderColor = 'var(--td-brand-color,#6c5ce7)';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
    }
  }
}

// ============ 内容管理 ============

function findViewContainer() {
  var view = document.querySelector('.view');
  if (view) return view;
  view = document.querySelector('.viewBox');
  if (view) return view;
  view = document.querySelector('#app > div > div > div');
  if (view && view.children.length > 0) return view;
  return null;
}

function clearInjectedContent() {
  var container = document.getElementById('n9_injected_container');
  if (container) {
    if (container._cleanup) {
      try { container._cleanup(); } catch(e) {}
    }
    try { container.remove(); } catch(e) {}
  }
  var view = findViewContainer();
  if (view) {
    var children = view.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].id !== 'n9_injected_container') {
        children[i].style.display = '';
      }
    }
  }
}

function loadContentForRoute(path) {
  clearInjectedContent();
  if (path === '/canvas') {
    renderCanvas();
  } else if (path === '/onesentence') {
    renderOneSentence();
  }
}

function handleRouteChange(to) {
  var path = to ? to.path : getRoutePath();

  if (path === '/canvas') {
    state.currentView = 'canvas';
    loadContentForRoute('/canvas');
  } else if (path === '/onesentence') {
    state.currentView = 'onesentence';
    loadContentForRoute('/onesentence');
  } else {
    state.currentView = null;
    clearInjectedContent();
  }
  updateButtonStates();
}

// ============ hashchange 监听器 ============

function installHashListener() {
  if (state.hashListenerInstalled) return;
  state.hashListenerInstalled = true;

  window.addEventListener('hashchange', function() {
    // 确保按钮存在
    ensureNavButtons();
    updateButtonStates();

    var path = getRoutePath();
    if (path === '/canvas' || path === '/onesentence') {
      loadContentForRoute(path);
    } else if (state.currentView) {
      state.currentView = null;
      clearInjectedContent();
    }
  });
}

// ============ 画布功能 ============

function renderCanvas() {
  var view = findViewContainer();
  if (!view) {
    return setTimeout(function() { renderCanvas(); }, 300);
  }

  var children = view.children;
  for (var i = 0; i < children.length; i++) {
    if (!children[i].id) {
      children[i].style.display = 'none';
    }
  }

  var container = document.createElement('div');
  container.id = 'n9_injected_container';
  view.appendChild(container);
  if (getComputedStyle(view).position === 'static') {
    view.style.position = 'relative';
  }

  renderCanvasContent(container);
}

function renderCanvasContent(container) {
  container.innerHTML = [
    '<div id="n9_canvas_wrapper" style="width:100%;height:100%;position:relative;overflow:hidden;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));font-family:Inter,-apple-system,Microsoft YaHei,monospace">',
    getCanvasToolbarHTML(),
    '<div id="n9_canvas" style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;cursor:default">',
    '  <canvas id="n9_grid" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></canvas>',
    '  <div id="n9_items" style="position:absolute;top:0;left:0;width:0;height:0;transform-origin:0 0"></div>',
    '  <div id="n9_selbox" style="display:none;position:absolute;border:1px solid var(--td-brand-color,#6c5ce7);background:rgba(108,92,231,0.08);pointer-events:none;z-index:50"></div>',
    '  <svg id="n9_connections" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2"><defs><marker id="n9_arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="var(--td-brand-color,#6c5ce7)"/></marker></defs></svg>',
    '</div>',
    '</div>'
  ].join("\n");

  addCanvasWelcome(container);
  initCanvasEngine(container);
}

function addCanvasWelcome(container) {
  var wrapper = container.querySelector('#n9_canvas_wrapper');
  if (!wrapper) return;
  var w = document.createElement('div');
  w.id = 'n9_welcome';
  w.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:5;pointer-events:none;transition:opacity .3s';
  w.innerHTML = '<div style="font-size:40px;margin-bottom:12px;opacity:.4">&#9998;</div><div style="font-size:18px;font-weight:600;color:var(--td-text-color-primary,#eeeef0);margin-bottom:6px">&#26080;&#38480;&#30011;&#24067;</div><div style="font-size:12px;color:var(--td-text-color-disabled,#5a5a70);line-height:1.6;margin-bottom:16px">&#36873;&#25321;&#24037;&#20855;&#21518;&#28857;&#20987;&#30011;&#24067;&#21019;&#24314;&#20803;&#32032;</div><div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">R</kbd> &#30697;&#24418;</span><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">O</kbd> &#22278;&#24418;</span><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">T</kbd> &#25991;&#23383;</span><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">V</kbd> &#36873;&#25321;</span><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">H</kbd> &#24179;&#31227;</span><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">L</kbd> &#36830;&#32447;</span><span style="padding:3px 8px;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:4px;font-size:11px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 4px;background:var(--td-bg-color-component,#1a1a28);border-radius:2px;font-size:10px">Ctrl+Z</kbd> &#25764;&#38144;</span></div>';
  wrapper.appendChild(w);
  var obs = new MutationObserver(function() {
    var items = container.querySelector('#n9_items');
    if (items && items.children.length > 0) {
      w.style.opacity = '0';
      setTimeout(function() { try { w.remove(); } catch(e) {} }, 300);
      obs.disconnect();
    }
  });
  var itemsEl = container.querySelector('#n9_items');
  if (itemsEl) obs.observe(itemsEl, { childList: true });
}

function getCanvasToolbarHTML() {
  return [
    '<div id="n9_toolbar" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:100;display:flex;gap:4px;align-items:center;background:var(--td-bg-color-container,#1e1e28);border:1px solid var(--td-component-border,#2e2e3e);border-radius:12px;padding:5px 8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(12px);flex-wrap:wrap;justify-content:center;max-width:90%">',
    '<button class="n9_tbtn active" data-tool="select"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>选择<span class="n9_hint">V</span></button>',
    '<button class="n9_tbtn" data-tool="hand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v-1a2 2 0 0 0-4 0v1a2 2 0 0 0-4 0v7a6 6 0 0 0 6 6h4a4 4 0 0 0 4-4v-4z"/></svg>抓手<span class="n9_hint">H</span></button>',
    '<button class="n9_tbtn" data-tool="text"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>文字<span class="n9_hint">T</span></button>',
    '<button class="n9_tbtn" data-tool="rect"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>矩形<span class="n9_hint">R</span></button>',
    '<button class="n9_tbtn" data-tool="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>圆形<span class="n9_hint">O</span></button>',
    '<button class="n9_tbtn" data-tool="connect"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19L19 5"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="5" r="3"/></svg>连线<span class="n9_hint">L</span></button>',
    '<div style="width:1px;height:24px;background:var(--td-component-border,#2e2e3e);margin:0 4px"></div>',
    '<button id="n9_undo" class="n9_tbtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>',
    '<button id="n9_redo" class="n9_tbtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>',
    '<div style="width:1px;height:24px;background:var(--td-component-border,#2e2e3e);margin:0 4px"></div>',
    '<button id="n9_zoom_in" class="n9_tbtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>',
    '<span id="n9_zoom_level" style="font-size:11px;min-width:36px;text-align:center;color:var(--td-text-color-secondary,#8888a0)">100%</span>',
    '<button id="n9_zoom_out" class="n9_tbtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>',
    '<button id="n9_fit" class="n9_tbtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>',
    '<div style="width:1px;height:24px;background:var(--td-component-border,#2e2e3e);margin:0 4px"></div>',
    '<button id="n9_clear" class="n9_tbtn" style="color:var(--td-error-color,#ef4444)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>',
    '</div>'
  ].join("\n");
}

// ============ 画布引擎 ============

function initCanvasEngine(container) {
  var wrapper = container.querySelector('#n9_canvas_wrapper');
  var canvasEl = container.querySelector('#n9_canvas');
  var itemsEl = container.querySelector('#n9_items');
  var connectionsEl = container.querySelector('#n9_connections');
  var gridCanvas = container.querySelector('#n9_grid');
  var selBox = container.querySelector('#n9_selbox');
  var zoomLevelEl = container.querySelector('#n9_zoom_level');

  var engine = {
    tool: 'select',
    zoom: 1,
    panX: 0,
    panY: 0,
    items: [],
    connections: [],
    selectedItems: new Set(),
    dragState: null,
    isPanning: false,
    panStart: { x: 0, y: 0, px: 0, py: 0 },
    zoomCenter: { x: 0, y: 0 },
    nextId: 1,
    history: [],
    historyIndex: -1,
    connecting: null,
    connectionPoints: [],
    clipboard: null,
    gridCtx: null
  };

  function drawGrid() {
    var ctx = engine.gridCtx;
    if (!ctx) return;
    var rect = wrapper.getBoundingClientRect();
    gridCanvas.width = rect.width * 2;
    gridCanvas.height = rect.height * 2;
    gridCanvas.style.width = rect.width + 'px';
    gridCanvas.style.height = rect.height + 'px';
    ctx.scale(2, 2);

    var w = rect.width;
    var h = rect.height;
    var gridSize = 20 * engine.zoom;
    var offsetX = (engine.panX * engine.zoom) % gridSize;
    var offsetY = (engine.panY * engine.zoom) % gridSize;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(wrapper).getPropertyValue('--td-component-border') || '#2e2e3e';
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;

    for (var x = offsetX; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (var y = offsetY; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function initGrid() {
    engine.gridCtx = gridCanvas.getContext('2d');
    drawGrid();
  }

  function screenToCanvas(sx, sy) {
    var rect = wrapper.getBoundingClientRect();
    return {
      x: (sx - rect.left - engine.panX * engine.zoom) / engine.zoom,
      y: (sy - rect.top - engine.panY * engine.zoom) / engine.zoom
    };
  }

  function createItem(type, x, y) {
    var id = 'n9_item_' + (engine.nextId++);
    var defaults = {
      rect: { width: 200, height: 100, color: 'var(--td-bg-color-container,#1e1e28)', borderColor: 'var(--td-component-border,#2e2e3e)' },
      circle: { radius: 60, color: '#1e1e28', borderColor: '#2e2e3e' },
      text: { text: '双击编辑文字', fontSize: 16, color: '#eeeef0' }
    };

    var item = {
      id: id,
      type: type,
      x: x - (type === 'circle' ? 60 : 100),
      y: y - (type === 'circle' ? 60 : 50),
      props: JSON.parse(JSON.stringify(defaults[type] || defaults.rect)),
      connections: []
    };

    engine.items.push(item);
    saveHistory();
    renderItems();
    return id;
  }

  function saveHistory() {
    engine.historyIndex++;
    engine.history = engine.history.slice(0, engine.historyIndex);
    engine.history.push(JSON.stringify({ items: engine.items, connections: engine.connections }));
    if (engine.history.length > 50) engine.history.shift();
  }

  function undo() {
    if (engine.historyIndex <= 0) return;
    engine.historyIndex--;
    var state = JSON.parse(engine.history[engine.historyIndex]);
    engine.items = state.items;
    engine.connections = state.connections;
    renderItems();
    renderConnections();
  }

  function redo() {
    if (engine.historyIndex >= engine.history.length - 1) return;
    engine.historyIndex++;
    var state = JSON.parse(engine.history[engine.historyIndex]);
    engine.items = state.items;
    engine.connections = state.connections;
    renderItems();
    renderConnections();
  }

  function renderItems() {
    itemsEl.innerHTML = '';
    var sorted = engine.items.slice().sort(function(a, b) {
      return (a.zIndex || 0) - (b.zIndex || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      var el = document.createElement('div');
      el.id = item.id;
      el.className = 'n9_item_el';
      el.dataset.type = item.type;
      el.style.cssText = getItemStyle(item);
      el.innerHTML = getItemInnerHTML(item);
      el.onmousedown = function(e) { e.stopPropagation(); onItemMouseDown(e, this); };
      itemsEl.appendChild(el);
    }
    renderConnections();
  }

  function getItemStyle(item) {
    var s = 'position:absolute;cursor:move;';
    s += 'left:' + item.x + 'px;top:' + item.y + 'px;';
    s += 'z-index:' + (item.zIndex || 1) + ';';

    if (item.type === 'rect') {
      s += 'width:' + item.props.width + 'px;height:' + item.props.height + 'px;';
      s += 'background:' + item.props.color + ';';
      s += 'border:2px solid ' + item.props.borderColor + ';';
      s += 'border-radius:12px;';
      s += 'box-shadow:0 2px 8px rgba(0,0,0,0.2);';
      s += 'display:flex;align-items:center;justify-content:center;';
      s += 'font-size:13px;color:var(--td-text-color-secondary,#8888a0);';
      s += 'padding:12px;box-sizing:border-box;text-align:center;';
    } else if (item.type === 'circle') {
      var r = item.props.radius;
      s += 'width:' + (r * 2) + 'px;height:' + (r * 2) + 'px;';
      s += 'border-radius:50%;';
      s += 'background:' + item.props.color + ';';
      s += 'border:2px solid ' + item.props.borderColor + ';';
      s += 'box-shadow:0 2px 8px rgba(0,0,0,0.2);';
      s += 'display:flex;align-items:center;justify-content:center;';
      s += 'font-size:13px;color:var(--td-text-color-secondary,#8888a0);';
      s += 'padding:12px;box-sizing:border-box;text-align:center;';
    } else if (item.type === 'text') {
      s += 'min-width:40px;min-height:24px;';
      s += 'padding:6px 10px;';
      s += 'font-size:' + item.props.fontSize + 'px;';
      s += 'color:' + item.props.color + ';';
      s += 'cursor:text;';
      s += 'border-radius:4px;';
      s += 'background:transparent;';
    }

    if (engine.selectedItems.has(item.id)) {
      s += 'outline:2px solid var(--td-brand-color,#6c5ce7);outline-offset:2px;';
    }
    return s;
  }

  function getItemInnerHTML(item) {
    if (item.type === 'text') {
      return '<div class="n9_text_edit" contenteditable>' + escHtml(item.props.text) + '</div>';
    }
    var label = '';
    if (item.type === 'rect') label = item.props.label || '矩形';
    else if (item.type === 'circle') label = item.props.label || '圆形';
    return '<span style="pointer-events:none">' + escHtml(label) + '</span>';
  }

  function getItemById(id) {
    for (var i = 0; i < engine.items.length; i++) {
      if (engine.items[i].id === id) return engine.items[i];
    }
    return null;
  }

  var dragItem = null;
  var dragOffset = { x: 0, y: 0 };
  var itemMouseDownPos = { x: 0, y: 0 };
  var itemDragMoved = false;

  function onItemMouseDown(e, el) {
    if (engine.tool === 'hand') return;
    var item = getItemById(el.id);
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();

    if (engine.tool === 'select') {
      if (!e.ctrlKey && !e.shiftKey) {
        if (!engine.selectedItems.has(item.id)) {
          engine.selectedItems.clear();
          engine.selectedItems.add(item.id);
          renderItems();
        }
      } else {
        if (engine.selectedItems.has(item.id)) {
          engine.selectedItems.delete(item.id);
        } else {
          engine.selectedItems.add(item.id);
        }
        renderItems();
      }

      dragItem = item;
      dragOffset.x = e.clientX - (item.x * engine.zoom + engine.panX * engine.zoom);
      dragOffset.y = e.clientY - (item.y * engine.zoom + engine.panY * engine.zoom);
      itemMouseDownPos.x = e.clientX;
      itemMouseDownPos.y = e.clientY;
      itemDragMoved = false;
    } else if (engine.tool === 'connect') {
      handleConnectionClick(item, el);
    }
  }

  function handleConnectionClick(item, el) {
    if (!engine.connecting) {
      engine.connecting = item.id;
      el.style.outline = '2px solid var(--td-success-color,#22c55e)';
      el.style.outlineOffset = '2px';
    } else if (engine.connecting === item.id) {
      engine.connecting = null;
      renderItems();
    } else {
      var conn = {
        id: 'conn_' + (engine.connections.length + 1),
        source: engine.connecting,
        target: item.id,
        label: ''
      };
      engine.connections.push(conn);
      engine.connecting = null;
      renderItems();
      renderConnections();
      saveHistory();
    }
  }

  function renderConnections() {
    connectionsEl.innerHTML = '<defs><marker id="n9_arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="var(--td-brand-color,#6c5ce7)"/></marker></defs>';

    for (var i = 0; i < engine.connections.length; i++) {
      var conn = engine.connections[i];
      var srcEl = document.getElementById(conn.source);
      var tgtEl = document.getElementById(conn.target);
      if (!srcEl || !tgtEl) continue;

      var srcRect = srcEl.getBoundingClientRect();
      var tgtRect = tgtEl.getBoundingClientRect();
      var wrapperRect = wrapper.getBoundingClientRect();

      var x1 = srcRect.left - wrapperRect.left + srcRect.width / 2;
      var y1 = srcRect.top - wrapperRect.top + srcRect.height / 2;
      var x2 = tgtRect.left - wrapperRect.left + tgtRect.width / 2;
      var y2 = tgtRect.top - wrapperRect.top + tgtRect.height / 2;

      var d = 'M' + x1 + ',' + y1 + ' C' + (x1 + (x2 - x1) * 0.4) + ',' + y1 + ' ' + (x2 - (x2 - x1) * 0.4) + ',' + y2 + ' ' + x2 + ',' + y2;

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'n9_connection_path');
      path.setAttribute('marker-end', 'url(#n9_arrow)');
      path.setAttribute('data-conn-id', conn.id);
      path.style.pointerEvents = 'stroke';
      connectionsEl.appendChild(path);

      var midX = (x1 + x2) / 2;
      var midY = (y1 + y2) / 2;
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', midX);
      dot.setAttribute('cy', midY);
      dot.setAttribute('r', '4');
      dot.setAttribute('class', 'n9_connection_dot');
      dot.setAttribute('data-conn-id', conn.id);
      dot.style.pointerEvents = 'all';
      dot.style.cursor = 'pointer';
      dot.title = '删除连线';
      dot.onclick = function(e) {
        e.stopPropagation();
        var cid = this.getAttribute('data-conn-id');
        removeConnection(cid);
      };
      connectionsEl.appendChild(dot);
    }
  }

  function removeConnection(connId) {
    for (var i = 0; i < engine.connections.length; i++) {
      if (engine.connections[i].id === connId) {
        engine.connections.splice(i, 1);
        break;
      }
    }
    renderConnections();
    saveHistory();
  }

  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    switch (e.key.toLowerCase()) {
      case 'v': setTool('select'); break;
      case 'h': setTool('hand'); break;
      case 't': setTool('text'); break;
      case 'r': setTool('rect'); break;
      case 'o': setTool('circle'); break;
      case 'l': setTool('connect'); break;
      case 'delete':
      case 'backspace':
        deleteSelected(); break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) redo(); else undo();
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo(); }
        break;
      case 'escape':
        engine.selectedItems.clear();
        engine.connecting = null;
        renderItems();
        break;
    }
  }

  function deleteSelected() {
    var ids = Array.from(engine.selectedItems);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      for (var j = 0; j < engine.items.length; j++) {
        if (engine.items[j].id === id) {
          engine.items.splice(j, 1);
          break;
        }
      }
      for (var k = engine.connections.length - 1; k >= 0; k--) {
        if (engine.connections[k].source === id || engine.connections[k].target === id) {
          engine.connections.splice(k, 1);
        }
      }
    }
    engine.selectedItems.clear();
    renderItems();
    renderConnections();
    saveHistory();
  }

  function setTool(tool) {
    engine.tool = tool;
    engine.connecting = null;
    var btns = container.querySelectorAll('.n9_tbtn[data-tool]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.tool === tool);
    }
    canvasEl.style.cursor = tool === 'hand' ? 'grab' : (tool === 'text' ? 'text' : (tool === 'select' ? 'default' : 'crosshair'));
  }

  var selectBoxStart = null;

  canvasEl.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    if (engine.tool === 'hand') {
      engine.isPanning = true;
      engine.panStart.x = e.clientX;
      engine.panStart.y = e.clientY;
      engine.panStart.px = engine.panX;
      engine.panStart.py = engine.panY;
      canvasEl.style.cursor = 'grabbing';
      return;
    }

    if (engine.tool === 'select') {
      selectBoxStart = screenToCanvas(e.clientX, e.clientY);
      engine.selectedItems.clear();
      renderItems();
    } else if (engine.tool === 'rect' || engine.tool === 'circle' || engine.tool === 'text') {
      var pos = screenToCanvas(e.clientX, e.clientY);
      createItem(engine.tool, pos.x, pos.y);
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (engine.isPanning) {
      var dx = (e.clientX - engine.panStart.x);
      var dy = (e.clientY - engine.panStart.y);
      engine.panX = engine.panStart.px + dx / engine.zoom;
      engine.panY = engine.panStart.py + dy / engine.zoom;
      transformCanvas();
      drawGrid();
      return;
    }

    if (dragItem) {
      if (!itemDragMoved) {
        var dist = Math.sqrt(Math.pow(e.clientX - itemMouseDownPos.x, 2) + Math.pow(e.clientY - itemMouseDownPos.y, 2));
        if (dist > 3) itemDragMoved = true;
      }
      if (itemDragMoved) {
        var newX = (e.clientX - dragOffset.x) / engine.zoom;
        var newY = (e.clientY - dragOffset.y) / engine.zoom;
        var dx2 = newX - dragItem.x;
        var dy2 = newY - dragItem.y;
        for (var i = 0; i < engine.items.length; i++) {
          if (engine.selectedItems.has(engine.items[i].id)) {
            engine.items[i].x += dx2;
            engine.items[i].y += dy2;
          }
        }
        dragItem = getItemById(dragItem.id);
        renderItems();
      }
    }

    if (selectBoxStart) {
      var cur = screenToCanvas(e.clientX, e.clientY);
      var sx = Math.min(selectBoxStart.x, cur.x);
      var sy = Math.min(selectBoxStart.y, cur.y);
      var sw = Math.abs(cur.x - selectBoxStart.x);
      var sh = Math.abs(cur.y - selectBoxStart.y);
      selBox.style.display = 'block';
      selBox.style.left = (sx * engine.zoom + engine.panX * engine.zoom) + 'px';
      selBox.style.top = (sy * engine.zoom + engine.panY * engine.zoom) + 'px';
      selBox.style.width = (sw * engine.zoom) + 'px';
      selBox.style.height = (sh * engine.zoom) + 'px';
    }
  });

  document.addEventListener('mouseup', function(e) {
    if (engine.isPanning) {
      engine.isPanning = false;
      canvasEl.style.cursor = engine.tool === 'hand' ? 'grab' : 'default';
      return;
    }

    if (dragItem && itemDragMoved) {
      saveHistory();
    }
    dragItem = null;
    itemDragMoved = false;

    if (selectBoxStart) {
      var cur2 = screenToCanvas(e.clientX, e.clientY);
      var items = itemsEl.children;
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var elRect = {
          x: parseFloat(el.style.left),
          y: parseFloat(el.style.top),
          w: parseFloat(el.style.width) || 60,
          h: parseFloat(el.style.height) || 40
        };
        if (rectsOverlap(selectBoxStart.x, selectBoxStart.y, cur2.x - selectBoxStart.x, cur2.y - selectBoxStart.y, elRect.x, elRect.y, elRect.w, elRect.h)) {
          engine.selectedItems.add(el.id);
        }
      }
      selectBoxStart = null;
      selBox.style.display = 'none';
      renderItems();
    }
  });

  function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    if (w1 < 0) { x1 += w1; w1 = -w1; }
    if (h1 < 0) { y1 += h1; h1 = -h1; }
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  function zoom(delta, cx, cy) {
    var oldZoom = engine.zoom;
    var factor = delta > 0 ? 1.1 : 0.9;
    var newZoom = Math.max(0.1, Math.min(5, engine.zoom * factor));

    if (cx !== undefined && cy !== undefined) {
      var rect = wrapper.getBoundingClientRect();
      var worldX = (cx - rect.left - engine.panX * oldZoom) / oldZoom;
      var worldY = (cy - rect.top - engine.panY * oldZoom) / oldZoom;
      engine.panX = (cx - rect.left - worldX * newZoom) / newZoom;
      engine.panY = (cy - rect.top - worldY * newZoom) / newZoom;
    }

    engine.zoom = newZoom;
    updateZoomDisplay();
    transformCanvas();
    drawGrid();
  }

  function updateZoomDisplay() {
    zoomLevelEl.textContent = Math.round(engine.zoom * 100) + '%';
  }

  function transformCanvas() {
    itemsEl.style.transform = 'translate(' + (engine.panX * engine.zoom) + 'px,' + (engine.panY * engine.zoom) + 'px) scale(' + engine.zoom + ')';
  }

  wrapper.addEventListener('wheel', function(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoom(-e.deltaY, e.clientX, e.clientY);
    }
  });

  container.querySelector('#n9_zoom_in').onclick = function() { zoom(1); };
  container.querySelector('#n9_zoom_out').onclick = function() { zoom(-1); };
  container.querySelector('#n9_fit').onclick = function() {
    engine.zoom = 1;
    engine.panX = 0;
    engine.panY = 0;
    updateZoomDisplay();
    transformCanvas();
    drawGrid();
  };

  var toolBtns = container.querySelectorAll('.n9_tbtn[data-tool]');
  for (var i = 0; i < toolBtns.length; i++) {
    toolBtns[i].onclick = function() { setTool(this.dataset.tool); };
  }

  container.querySelector('#n9_undo').onclick = undo;
  container.querySelector('#n9_redo').onclick = redo;
  container.querySelector('#n9_clear').onclick = function() {
    if (engine.items.length === 0) return;
    if (confirm('确定要清空画布吗？')) {
      engine.items = [];
      engine.connections = [];
      engine.selectedItems.clear();
      engine.history = [];
      engine.historyIndex = -1;
      renderItems();
      renderConnections();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  var resizeTimer = null;
  window.addEventListener('resize', function() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { drawGrid(); }, 200);
  });

  container._cleanup = function() { try { var w = document.getElementById("n9_welcome"); if(w) try { w.remove(); } catch(e) {} } catch(e) {}
    document.removeEventListener('keydown', onKeyDown);
    engine.items = [];
    engine.connections = [];
  };

  initGrid();
  transformCanvas();
  updateZoomDisplay();
}

// ============ 一句话创作功能 ============

function renderOneSentence() {
  var view = findViewContainer();
  if (!view) {
    return setTimeout(function() { renderOneSentence(); }, 300);
  }

  var children = view.children;
  for (var i = 0; i < children.length; i++) {
    if (!children[i].id) {
      children[i].style.display = 'none';
    }
  }

  var container = document.createElement('div');
  container.id = 'n9_injected_container';
  view.appendChild(container);
  if (getComputedStyle(view).position === 'static') {
    view.style.position = 'relative';
  }

  renderOneSentenceContent(container);
}

function renderOneSentenceContent(container) {
  container.innerHTML = [
    '<div id="n9_os_wrapper" style="width:100%;height:100%;overflow-y:auto;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));font-family:Inter,-apple-system,Microsoft YaHei,sans-serif;padding:32px 40px;box-sizing:border-box">',
    '<div style="max-width:800px;margin:0 auto">',
    '<h1 style="font-size:28px;font-weight:700;color:var(--td-text-color-primary,#eeeef0);margin:0 0 8px;letter-spacing:-0.5px">一句话创作</h1>',
    '<p style="font-size:14px;color:var(--td-text-color-secondary,#8888a0);margin:0 0 28px;line-height:1.5">输入你的创意灵感，AI 将为你生成完整的故事项目</p>',
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px">',
    '<div class="n9_os_example" data-text="一个关于时间旅行的咖啡馆，每天接待一位特殊的客人" style="padding:8px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s">☕ 时间旅行咖啡馆</div>',
    '<div class="n9_os_example" data-text="一只会说话的猫和它的主人一起破解城市谜案" style="padding:8px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s">🐱 神探猫猫</div>',
    '<div class="n9_os_example" data-text="在未来世界，最后一个拥有情感的人类" style="padding:8px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s">🤖 最后一个人类</div>',
    '<div class="n9_os_example" data-text="少女在废弃的图书馆里发现了通往异世界的门" style="padding:8px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s">📚 图书馆异世界</div>',
    '</div>',
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">',
    '<span class="n9_os_tag" data-panel="art" style="padding:5px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:20px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s;font-weight:500">选择画风</span>',
    '<span class="n9_os_tag" data-panel="tone" style="padding:5px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:20px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s;font-weight:500">选择色调</span>',
    '<span class="n9_os_tag" data-panel="pace" style="padding:5px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:20px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s;font-weight:500">叙事节奏</span>',
    '<span class="n9_os_tag" data-panel="output" style="padding:5px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:20px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s;font-weight:500">输出类型</span>',
    '<span class="n9_os_tag" data-panel="voice" style="padding:5px 14px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:20px;color:var(--td-text-color-secondary,#8888a0);font-size:12px;cursor:pointer;transition:all 0.2s;font-weight:500">配音风格</span>',
    '</div>',
    '<div id="n9_os_style_panel" style="display:none;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:16px;padding:20px 24px;margin-bottom:16px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">',
    '<h3 id="n9_os_style_title" style="font-size:14px;font-weight:600;color:var(--td-text-color-primary,#eeeef0);margin:0">选择画风</h3>',
    '<button id="n9_os_style_close" style="background:none;border:none;color:var(--td-text-color-disabled,#5a5a70);cursor:pointer;font-size:18px;padding:2px 6px;border-radius:4px">x</button>',
    '</div>',
    '<div id="n9_os_style_grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px"></div>',
    '</div>',
    '<div style="background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:16px;padding:20px 24px;margin-bottom:16px">',
    '<textarea id="n9_os_prompt" placeholder="输入你的创意灵感..." style="width:100%;min-height:64px;background:transparent;border:none;color:var(--td-text-color-primary,#eeeef0);font-size:15px;line-height:1.7;resize:vertical;outline:none;font-family:inherit"></textarea>',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--td-component-border,#2a2a3a)">',
    '<span style="font-size:12px;color:var(--td-text-color-disabled,#5a5a70)"><kbd style="padding:1px 5px;background:var(--td-bg-color-component,#1a1a28);border-radius:4px;font-size:11px;border:1px solid var(--td-component-border,#2a2a3a)">Ctrl+Enter</kbd> 生成</span>',
    '<button id="n9_os_generate" style="padding:10px 28px;background:linear-gradient(135deg,#6c5ce7,#a855f7);border:none;border-radius:24px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s">生成故事</button>',
    '</div></div>',
    '<div id="n9_os_progress" style="display:none;gap:6px;margin-bottom:16px">',
    '<div class="n9_os_step" data-step="1" style="flex:1;padding:10px 6px;text-align:center;font-size:11px;font-weight:500;color:var(--td-text-color-disabled,#5a5a70);border-radius:8px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);transition:all 0.4s"><div style="display:block;width:18px;height:18px;line-height:22px;text-align:center;margin:0 auto 4px;border-radius:50%;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));border:1px solid var(--td-component-border,#2a2a3a);font-size:11px;font-weight:700;transition:all 0.4s">1</div>理解创意</div>',
    '<div class="n9_os_step" data-step="2" style="flex:1;padding:10px 6px;text-align:center;font-size:11px;font-weight:500;color:var(--td-text-color-disabled,#5a5a70);border-radius:8px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);transition:all 0.4s"><div style="display:block;width:18px;height:18px;line-height:22px;text-align:center;margin:0 auto 4px;border-radius:50%;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));border:1px solid var(--td-component-border,#2a2a3a);font-size:11px;font-weight:700;transition:all 0.4s">2</div>扩写故事</div>',
    '<div class="n9_os_step" data-step="3" style="flex:1;padding:10px 6px;text-align:center;font-size:11px;font-weight:500;color:var(--td-text-color-disabled,#5a5a70);border-radius:8px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);transition:all 0.4s"><div style="display:block;width:18px;height:18px;line-height:22px;text-align:center;margin:0 auto 4px;border-radius:50%;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));border:1px solid var(--td-component-border,#2a2a3a);font-size:11px;font-weight:700;transition:all 0.4s">3</div>确认风格</div>',
    '<div class="n9_os_step" data-step="4" style="flex:1;padding:10px 6px;text-align:center;font-size:11px;font-weight:500;color:var(--td-text-color-disabled,#5a5a70);border-radius:8px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);transition:all 0.4s"><div style="display:block;width:18px;height:18px;line-height:22px;text-align:center;margin:0 auto 4px;border-radius:50%;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));border:1px solid var(--td-component-border,#2a2a3a);font-size:11px;font-weight:700;transition:all 0.4s">4</div>AI创作</div>',
    '<div class="n9_os_step" data-step="5" style="flex:1;padding:10px 6px;text-align:center;font-size:11px;font-weight:500;color:var(--td-text-color-disabled,#5a5a70);border-radius:8px;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);transition:all 0.4s"><div style="display:block;width:18px;height:18px;line-height:22px;text-align:center;margin:0 auto 4px;border-radius:50%;background:var(--bgc,var(--td-bg-color-page,#0b0b0f));border:1px solid var(--td-component-border,#2a2a3a);font-size:11px;font-weight:700;transition:all 0.4s">5</div>完成</div>',
    '</div>',
    '<div id="n9_os_chat" style="display:none;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:16px;padding:20px 24px;margin-bottom:16px;min-height:100px;max-height:420px;overflow-y:auto"><div id="n9_os_messages"></div></div>',
    '<div id="n9_os_result" style="display:none;background:var(--td-bg-color-container,#1a1a24);border:1px solid var(--td-component-border,#2a2a3a);border-radius:16px;padding:24px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">',
    '<div><h3 id="n9_os_result_title" style="font-size:20px;font-weight:700;color:var(--td-text-color-primary,#eeeef0);margin:0 0 4px">故事标题</h3>',
    '<span id="n9_os_result_badge" style="font-size:11px;color:var(--td-brand-color,#6c5ce7);background:rgba(108,92,231,0.12);padding:2px 10px;border-radius:4px">漫画</span></div></div>',
    '<div id="n9_os_result_characters" style="margin-bottom:16px"></div>',
    '<div id="n9_os_result_scenes" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px"></div>',
    '</div>',
    '<div style="text-align:center;font-size:12px;color:var(--td-text-color-disabled,#5a5a70);margin-top:20px;padding-top:20px;border-top:1px solid var(--td-component-border,#2a2a3a)">AI Manga Studio | 一句话创作</div>',
    '</div>',
    '</div>',
    '<style>',
    '#n9_os_wrapper .n9_os_example:hover{border-color:var(--td-brand-color,#6c5ce7)!important;background:var(--td-bg-color-component-hover,#22222e)!important;color:var(--td-text-color-primary,#eeeef0)!important}',
    '#n9_os_wrapper .n9_os_tag:hover{border-color:var(--td-brand-color,#6c5ce7)!important;background:var(--td-bg-color-component-hover,#22222e)!important;color:var(--td-text-color-primary,#eeeef0)!important}',
    '#n9_os_wrapper .n9_os_tag.active{border-color:var(--td-brand-color,#6c5ce7)!important;background:rgba(108,92,231,0.15)!important;color:var(--td-brand-color,#6c5ce7)!important}',
    '#n9_os_wrapper .n9_os_step.active{color:var(--td-brand-color,#6c5ce7)!important;border-color:var(--td-brand-color,#6c5ce7)!important}',
    '#n9_os_wrapper .n9_os_step.active>div:first-child{background:var(--td-brand-color,#6c5ce7)!important;border-color:var(--td-brand-color,#6c5ce7)!important;color:#fff!important}',
    '#n9_os_wrapper .n9_os_step.done{color:var(--td-success-color,#22c55e)!important;border-color:var(--td-success-color,#22c55e)!important}',
    '#n9_os_wrapper .n9_os_step.done>div:first-child{background:var(--td-success-color,#22c55e)!important;border-color:var(--td-success-color,#22c55e)!important;color:#fff!important}',
    '</style>',
  ].join('\n');

  initOneSentenceLogic(container);
}

function initOneSentenceLogic(container) {
  var prompt = container.querySelector('#n9_os_prompt');
  var genBtn = container.querySelector('#n9_os_generate');
  var chat = container.querySelector('#n9_os_chat');
  var messages = container.querySelector('#n9_os_messages');
  var result = container.querySelector('#n9_os_result');
  var progress = container.querySelector('#n9_os_progress');
  var stylePanel = container.querySelector('#n9_os_style_panel');
  var styleTitle = container.querySelector('#n9_os_style_title');
  var styleGrid = container.querySelector('#n9_os_style_grid');
  var styleClose = container.querySelector('#n9_os_style_close');

  var currentStyle = { artStyle: '日系动漫', colorTone: '明亮温暖', pacing: '轻松搞笑', outputType: '漫画', voiceStyle: '旁白解说' };

  var STYLE_OPTIONS = {
    art: { title: '选择画风', key: 'artStyle', options: [
      { label: '水墨风', icon: 'S', desc: '中国传统水墨意境' }, { label: '日系动漫', icon: 'A', desc: '日本动画风格' },
      { label: '古风', icon: 'G', desc: '中国古典美学' }, { label: '写实', icon: 'R', desc: '逼真现实风格' },
      { label: 'Q版', icon: 'Q', desc: '可爱卡通风' }, { label: '赛博朋克', icon: 'C', desc: '霓虹科幻风格' }
    ]},
    tone: { title: '选择色调', key: 'colorTone', options: [
      { label: '明亮温暖', icon: 'W', desc: '阳光积极' }, { label: '黑暗冷酷', icon: 'D', desc: '深沉冷酷' },
      { label: '怀旧复古', icon: 'V', desc: '旧时光温暖' }, { label: '鲜艳多彩', icon: 'B', desc: '色彩丰富' },
      { label: '黑白', icon: 'M', desc: '经典黑白' }
    ]},
    pace: { title: '选择叙事节奏', key: 'pacing', options: [
      { label: '轻松搞笑', icon: 'H', desc: '轻松愉快' }, { label: '紧张刺激', icon: 'T', desc: '节奏紧迫' },
      { label: '温暖治愈', icon: 'C', desc: '治愈系' }, { label: '悬疑惊悚', icon: 'S', desc: '悬念迭起' },
      { label: '史诗磅礴', icon: 'E', desc: '宏大叙事' }
    ]},
    output: { title: '选择输出类型', key: 'outputType', options: [
      { label: '漫画', icon: 'M', desc: '动态漫画（推荐）' }, { label: '短视频', icon: 'V', desc: '15-60秒' },
      { label: '电影短片', icon: 'F', desc: '3-5分钟' }
    ]},
    voice: { title: '选择配音风格', key: 'voiceStyle', options: [
      { label: '旁白解说', icon: 'N', desc: '第三人称' }, { label: '角色对话', icon: 'D', desc: '角色对话' },
      { label: '无声配乐', icon: 'M', desc: '仅背景音乐' }
    ]}
  };

  var isGenerating = false;
  var currentStep = 0;

  function addMessage(role, content) {
    chat.style.display = 'block';
    chat.classList.add('active');
    var div = document.createElement('div');
    div.style.cssText = 'margin-bottom:14px';
    var roleLabel = role === 'system' ? '系统' : (role === 'ai' ? 'AI 助手' : '');
    div.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--td-brand-color,#6c5ce7);margin-bottom:3px">' + roleLabel + '</div><div style="font-size:14px;line-height:1.6;color:var(--td-text-color-secondary,#8888a0)">' + escHtml(content) + '</div>';
    messages.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function updateStep(step) {
    currentStep = step;
    progress.style.display = 'flex';
    var steps = progress.querySelectorAll('.n9_os_step');
    for (var i = 0; i < steps.length; i++) {
      var s = parseInt(steps[i].dataset.step);
      steps[i].classList.toggle('done', s < step);
      steps[i].classList.toggle('active', s === step);
    }
  }

  function showStylePanel(type) {
    var config = STYLE_OPTIONS[type];
    if (!config) return;
    styleTitle.textContent = config.title;
    var html = '';
    for (var i = 0; i < config.options.length; i++) {
      var opt = config.options[i];
      var selected = currentStyle[config.key] === opt.label;
      html += '<div class="' + (selected ? 'n9_os_scard selected' : 'n9_os_scard') + '" data-key="' + config.key + '" data-value="' + opt.label + '">' +
        '<div style="font-size:24px;margin-bottom:6px">' + opt.icon + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--td-text-color-primary,#eeeef0)">' + opt.label + '</div>' +
        '<div style="font-size:11px;color:var(--td-text-color-disabled,#5a5a70);margin-top:2px">' + opt.desc + '</div></div>';
    }
    styleGrid.innerHTML = html;
    stylePanel.style.display = 'block';

    var cards = styleGrid.querySelectorAll('.n9_os_scard');
    for (var ci = 0; ci < cards.length; ci++) {
      (function(card) {
        card.onclick = function() {
          var key2 = this.dataset.key, value2 = this.dataset.value;
          currentStyle[key2] = value2;
          var allCards = styleGrid.querySelectorAll('.n9_os_scard');
          for (var ac = 0; ac < allCards.length; ac++) allCards[ac].classList.remove('selected');
          this.classList.add('selected');
          var tags = container.querySelectorAll('.n9_os_tag');
          for (var ti = 0; ti < tags.length; ti++) {
            tags[ti].classList.remove('active');
            var p = tags[ti].dataset.panel;
            if (STYLE_OPTIONS[p] && STYLE_OPTIONS[p].key === key2) tags[ti].classList.add('active');
          }
          addMessage('system', '已选择: ' + value2);
          stylePanel.style.display = 'none';
        };
      })(cards[ci]);
    }
  }

  if (styleClose) styleClose.onclick = function() { stylePanel.style.display = 'none'; };

  var tags = container.querySelectorAll('.n9_os_tag');
  for (var ti2 = 0; ti2 < tags.length; ti2++) {
    (function(tag) { tag.onclick = function() { showStylePanel(tag.dataset.panel); }; })(tags[ti2]);
  }

  var examples = container.querySelectorAll('.n9_os_example');
  for (var ei = 0; ei < examples.length; ei++) {
    (function(ex) { ex.onclick = function() { prompt.value = ex.dataset.text || ex.textContent.trim(); prompt.focus(); }; })(examples[ei]);
  }

  genBtn.onclick = function() {
    var text = prompt.value.trim();
    if (!text) { prompt.focus(); return; }
    if (isGenerating) return;
    isGenerating = true;
    genBtn.disabled = true;
    genBtn.textContent = '生成中..';
    messages.innerHTML = '';
    result.style.display = 'none';
    result.classList.remove('active');
    updateStep(1);
    addMessage('system', '正在理解你的创意...');
    setTimeout(function() {
      updateStep(2); addMessage('system', '故事已扩写完成：《灵感的旅程》');
      setTimeout(function() {
        updateStep(3); addMessage('system', '风格: ' + currentStyle.artStyle + ' / ' + currentStyle.colorTone);
        setTimeout(function() {
          updateStep(4); addMessage('system', 'AI 正在创作...');
          setTimeout(function() {
            updateStep(5); addMessage('system', '项目《灵感的旅程》创建完成！');
            result.style.display = 'block'; result.classList.add('active');
            var rt = container.querySelector('#n9_os_result_title');
            var rb = container.querySelector('#n9_os_result_badge');
            var rc = container.querySelector('#n9_os_result_characters');
            var rs = container.querySelector('#n9_os_result_scenes');
            if (rt) rt.textContent = '灵感的旅程';
            if (rb) rb.textContent = currentStyle.outputType;
            if (rc) rc.innerHTML = '<span style="display:inline-block;padding:4px 10px;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.2);border-radius:6px;font-size:12px;color:var(--td-text-color-secondary,#8888a0);margin:2px">小明 (主角)</span><span style="display:inline-block;padding:4px 10px;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.2);border-radius:6px;font-size:12px;color:var(--td-text-color-secondary,#8888a0);margin:2px">导师 (配角)</span><span style="display:inline-block;padding:4px 10px;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.2);border-radius:6px;font-size:12px;color:var(--td-text-color-secondary,#8888a0);margin:2px">神秘人 (关键)</span>';
            if (rs) rs.innerHTML =
              '<div style="background:var(--td-bg-color-component,#1a1a28);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;padding:16px"><div style="font-size:14px;font-weight:600;color:var(--td-text-color-primary,#eeeef0);margin-bottom:8px">平凡的开始</div><p style="font-size:13px;color:var(--td-text-color-secondary,#8888a0);margin:0;line-height:1.5">小明在图书馆发现神秘古书</p></div>' +
              '<div style="background:var(--td-bg-color-component,#1a1a28);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;padding:16px"><div style="font-size:14px;font-weight:600;color:var(--td-text-color-primary,#eeeef0);margin-bottom:8px">穿越异世界</div><p style="font-size:13px;color:var(--td-text-color-secondary,#8888a0);margin:0;line-height:1.5">被传送到魔法世界开始冒险</p></div>' +
              '<div style="background:var(--td-bg-color-component,#1a1a28);border:1px solid var(--td-component-border,#2a2a3a);border-radius:12px;padding:16px"><div style="font-size:14px;font-weight:600;color:var(--td-text-color-primary,#eeeef0);margin-bottom:8px">最终决战</div><p style="font-size:13px;color:var(--td-text-color-secondary,#8888a0);margin:0;line-height:1.5">集结伙伴对抗黑暗势力</p></div>';
            isGenerating = false;
            genBtn.disabled = false;
            genBtn.textContent = '生成故事';
          }, 1500);
        }, 1000);
      }, 1000);
    }, 1000);
  };

  prompt.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); genBtn.click(); }
  });
}

function escHtml(text) {
  var d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ============ 主入口 ============

function initNav() {
  if (state.initialized) return;
  state.initialized = true;

  injectBaseStyles();
  installHashListener();

  // 尝试获取 Vue Router
  tryInitVueRouter();

  // 使用 MutationObserver 等待 Vue 挂载后创建导航按钮
  function tryCreateButtons() {
    if (ensureNavButtons()) {
      updateButtonStates();
      var path = getRoutePath();
      if (path === '/canvas' || path === '/onesentence') loadContentForRoute(path);
      return true;
    }
    return false;
  }

  if (!tryCreateButtons()) {
    var appEl = document.querySelector('#app');
    if (appEl) {
      var observer = new MutationObserver(function() {
        if (tryCreateButtons()) observer.disconnect();
      });
      observer.observe(appEl, { childList: true, subtree: true });
    }
  }
}

function tryInitVueRouter() {
  var appEl = document.querySelector('#app');
  if (!appEl) return;
  var vueApp = appEl.__vue_app__;
  if (!vueApp) return;
  var router = vueApp.config.globalProperties.$router;
  if (!router) return;

  state.vueApp = vueApp;
  state.router = router;

  // 监听路由变化
  router.afterEach(function(to) {
    handleRouteChange(to);
    ensureNavButtons();
  });
}

// ============ 导出 ============

export { initNav };

export function cleanup() {
  var container = document.getElementById('n9_injected_container');
  if (container && container._cleanup) {
    try { container._cleanup(); } catch(e) {}
  }
}
