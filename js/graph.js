/* ============================================
   AI Knowledge Graph - Force-directed graph
   D3.js v7  |  v3: layered rendering, type filter panel,
   loading feedback, search hint, persistent legend
   ============================================ */

const TYPE_COLOR = {
  company: 'var(--color-company)',
  product: 'var(--color-product)',
  person:  'var(--color-person)',
  tech:    'var(--color-tech)',
  concept: 'var(--color-tech)',
  paper:   'var(--color-paper)',
};

const TYPE_COLOR_HEX = {
  company: '#f78166',
  product: '#79c0ff',
  person:  '#d2a8ff',
  tech:    '#56d364',
  concept: '#56d364',
  paper:   '#e3b341',
};

const TYPE_LABEL = {
  company: '公司/院校',
  product: '产品',
  person:  '人物',
  tech:    '技术概念',
  concept: '技术概念',
  paper:   '论文',
};

const RELATION_COLOR = {
  made_by:       '#f78166',
  works_at:      '#d2a8ff',
  competes_with: '#ff7b72',
  researches:    '#56d364',
  focuses_on:    '#79c0ff',
  enhances:      '#ffa657',
  enables:       '#56d364',
  uses:          '#58a6ff',
  is_variant_of: '#e3b341',
  is_method_of:  '#79c0ff',
  powered_by:    '#ffa657',
  extends:       '#e3b341',
  improves:      '#56d364',
  technique_of:  '#79c0ff',
  abbrev_of:     '#8b949e',
  related_to:    '#8b949e',
  part_of:       '#d2a8ff',
  is_type_of:    '#d2a8ff',
  same_as:       '#8b949e',
  describes:     '#58a6ff',
};

const RELATION_LABEL = {
  made_by:       '由…开发',
  works_at:      '就职于',
  competes_with: '竞争',
  researches:    '研究',
  focuses_on:    '专注于',
  enhances:      '增强',
  enables:       '赋能',
  uses:          '使用',
  is_variant_of: '变体',
  is_method_of:  '方法',
  powered_by:    '由…驱动',
  extends:       '扩展自',
  improves:      '改进',
  technique_of:  '技术属于',
  abbrev_of:     '缩写',
  related_to:    '相关',
  part_of:       '属于',
  is_type_of:    '类型',
  same_as:       '等同',
  describes:     '描述',
};

// ---- State ----
let allNodes = [], allEdges = [], meta = {};
let activeType = 'all';
let showIsolated = false;
let showAll = false;          // 是否显示全部节点（含低频）
let MIN_COUNT = 3;            // 默认最低频次阈值
let selectedNode = null;
let simulation, svg, g, linkSel, nodeSel, zoom;

// 类型筛选复选框状态（null = 全选）
let typeFilter = null; // null | Set<string>

// ---- Loading overlay ----
function showLoading(msg) {
  const el = document.getElementById('loading-overlay');
  if (el) { el.style.display = 'flex'; el.querySelector('.loading-msg').textContent = msg || '加载中…'; }
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ---- Load data ----
async function loadData() {
  showLoading('正在加载知识图谱数据…');
  const [nodesRes, edgesRes, metaRes] = await Promise.all([
    fetch('data/nodes.json'),
    fetch('data/edges.json'),
    fetch('data/meta.json'),
  ]);
  allNodes = await nodesRes.json();
  allEdges = await edgesRes.json();
  meta = await metaRes.json();

  // 字段兼容：name / label 都支持
  allNodes.forEach(n => { if (!n.label) n.label = n.name || n.id; });
  // 字段兼容：type（edges）/ relation 都支持
  allEdges.forEach(e => { if (!e.relation) e.relation = e.type || 'related_to'; });

  document.getElementById('stat-nodes').textContent = allNodes.length.toLocaleString();
  document.getElementById('stat-edges').textContent = allEdges.length.toLocaleString();
  document.getElementById('stat-docs').textContent = (meta.docCount || meta.total_docs || '–').toLocaleString();
  document.getElementById('nav-meta').textContent =
    `更新于 ${meta.updatedAt || '2026-03-26'}`;
  document.getElementById('footer-meta').textContent =
    `数据来源：美团 Friday 知识库 · ${meta.docCount || meta.total_docs || 212} 篇 · 最后更新 2026-03-26`;

  // 统计核心节点数，更新开关标签
  const coreCount = allNodes.filter(n => (n.count || 0) >= MIN_COUNT).length;
  const showAllBtn = document.getElementById('toggle-show-all');
  if (showAllBtn) {
    showAllBtn.title = `当前显示 count≥${MIN_COUNT} 的核心节点（${coreCount} 个），点击显示全部 ${allNodes.length} 个`;
  }
  updateNodeCountBadge();

  buildLegendRelations();
  buildRightRanking();
  buildTypeFilterPanel();
  initGraph();
  hideLoading();
}

// ---- Update node count badge ----
function updateNodeCountBadge() {
  const visible = getVisibleNodes();
  const badge = document.getElementById('visible-count-badge');
  if (badge) {
    badge.textContent = `显示 ${visible.length.toLocaleString()} / ${allNodes.length.toLocaleString()} 节点`;
  }
}

// ---- Build relation legend ----
function buildLegendRelations() {
  const container = document.getElementById('legend-relations');
  if (!container) return;
  const used = [...new Set(allEdges.map(e => e.relation).filter(Boolean))].slice(0, 8);
  container.innerHTML = used.map(r => `
    <div class="legend-rel-item">
      <div class="legend-rel-dot" style="background:${RELATION_COLOR[r] || '#8b949e'}"></div>
      <span>${RELATION_LABEL[r] || r}</span>
    </div>`).join('');
}

// ---- Build right ranking ----
function buildRightRanking() {
  const container = document.getElementById('right-ranking');
  if (!container) return;
  const top = [...allNodes]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 15);
  const maxCount = top[0]?.count || 1;
  container.innerHTML = top.map((n, i) => `
    <div class="rr-item" onclick="focusNodeById('${n.id}')">
      <span class="rr-rank">${i + 1}</span>
      <span class="rr-name">${n.label}</span>
      <div class="rr-bar-wrap">
        <div class="rr-bar" style="width:${Math.round((n.count||0)/maxCount*100)}%;background:${TYPE_COLOR_HEX[n.type] || '#58a6ff'}"></div>
      </div>
      <span class="rr-count">${n.count}</span>
    </div>`).join('');
}

// ---- Build type filter panel ----
function buildTypeFilterPanel() {
  const panel = document.getElementById('type-filter-panel');
  if (!panel) return;

  const types = ['company','product','person','concept','paper'];
  const countByType = {};
  allNodes.forEach(n => {
    const t = n.type === 'tech' ? 'concept' : n.type;
    countByType[t] = (countByType[t] || 0) + 1;
  });

  panel.innerHTML = types.map(t => `
    <label class="type-check-item" data-type="${t}">
      <input type="checkbox" checked data-type="${t}">
      <span class="type-dot" style="background:${TYPE_COLOR_HEX[t]}"></span>
      <span class="type-name">${TYPE_LABEL[t] || t}</span>
      <span class="type-cnt">${countByType[t] || 0}</span>
    </label>`).join('');

  panel.addEventListener('change', () => {
    const checked = [...panel.querySelectorAll('input[type=checkbox]:checked')].map(el => el.dataset.type);
    typeFilter = checked.length === types.length ? null : new Set(checked);
    rebuildCurrent();
    updateNodeCountBadge();
  });
}

// ---- Init graph ----
function initGraph() {
  const container = document.getElementById('graph-container');
  const W = container.clientWidth;
  const H = container.clientHeight;

  svg = d3.select('#graph-svg').attr('width', W).attr('height', H);
  zoom = d3.zoom().scaleExtent([0.03, 8]).on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);
  g = svg.append('g');

  // Arrow markers
  const defs = svg.append('defs');
  const usedRels = [...new Set(allEdges.map(e => e.relation || 'default'))];
  usedRels.forEach(rel => {
    const col = RELATION_COLOR[rel] || '#444';
    defs.append('marker')
      .attr('id', `arrow-${rel}`)
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 18).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', col).attr('opacity', 0.7);
  });

  buildGraph(getVisibleNodes(), allEdges);

  // Zoom controls
  document.getElementById('zoom-in').onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
  document.getElementById('zoom-out').onclick = () => svg.transition().call(zoom.scaleBy, 0.77);
  document.getElementById('zoom-reset').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

  // Toggle isolated
  const toggleIso = document.getElementById('toggle-isolated');
  if (toggleIso) {
    toggleIso.onclick = () => {
      showIsolated = !showIsolated;
      toggleIso.classList.toggle('active', showIsolated);
      rebuildCurrent();
    };
  }

  // Toggle show all
  const toggleAll = document.getElementById('toggle-show-all');
  if (toggleAll) {
    toggleAll.onclick = () => {
      if (!showAll) {
        const cnt = allNodes.length;
        if (!confirm(`⚠️ 即将渲染全部 ${cnt.toLocaleString()} 个节点，可能导致浏览器卡顿。确定继续？`)) return;
      }
      showAll = !showAll;
      toggleAll.classList.toggle('active', showAll);
      toggleAll.title = showAll ? '当前：显示全部节点（点击切换回核心视图）' : `显示全部 ${allNodes.length.toLocaleString()} 个节点`;
      rebuildCurrent();
      updateNodeCountBadge();
    };
  }

  // Search
  const searchInput = document.getElementById('search-input');
  const searchHint = document.getElementById('search-hint');
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { clearHighlight(); if (searchHint) searchHint.textContent = ''; return; }
    const matched = allNodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      (n.name || '').toLowerCase().includes(q)
    );
    if (matched.length > 0) {
      flyToAndSelect(matched[0]);
      if (searchHint) searchHint.textContent = `找到 ${matched.length} 个节点`;
    } else {
      if (searchHint) searchHint.textContent = `未找到 "${e.target.value}"，共 ${allNodes.length.toLocaleString()} 个节点可搜索`;
      clearHighlight();
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.target.value = '';
      if (searchHint) searchHint.textContent = '';
      clearHighlight();
    }
  });

  // Filter chips (type)
  document.getElementById('type-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeType = chip.dataset.type;
    rebuildCurrent();
    updateNodeCountBadge();
  });

  // Legend clicks
  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const t = item.dataset.type;
      activeType = activeType === t ? 'all' : t;
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      const chip = document.querySelector(`.chip[data-type="${activeType}"]`);
      if (chip) chip.classList.add('active');
      rebuildCurrent();
      updateNodeCountBadge();
    });
  });

  window.addEventListener('resize', () => {
    const W2 = container.clientWidth, H2 = container.clientHeight;
    svg.attr('width', W2).attr('height', H2);
    if (simulation) simulation.force('center', d3.forceCenter(W2/2, H2/2)).alpha(0.1).restart();
  });
}

// ---- Get visible nodes ----
function getVisibleNodes() {
  let nodes = allNodes;

  // 1. 分层：默认只显示 count >= MIN_COUNT 的核心节点
  if (!showAll) {
    nodes = nodes.filter(n => (n.count || 0) >= MIN_COUNT);
  }

  // 2. 节点类型筛选（来自 chip 或 panel checkbox）
  const effectiveType = typeFilter
    ? null  // typeFilter 优先
    : activeType !== 'all' ? activeType : null;

  if (typeFilter) {
    nodes = nodes.filter(n => {
      const t = n.type === 'tech' ? 'concept' : n.type;
      return typeFilter.has(t);
    });
  } else if (effectiveType) {
    nodes = nodes.filter(n => n.type === effectiveType || (effectiveType === 'tech' && n.type === 'concept'));
  }

  // 3. 孤立节点过滤
  if (!showIsolated) {
    const nodeIds = new Set(nodes.map(n => n.id));
    const connectedIds = new Set();
    allEdges.forEach(e => {
      const s = e.source?.id ?? e.source;
      const t = e.target?.id ?? e.target;
      if (nodeIds.has(s) && nodeIds.has(t)) {
        connectedIds.add(s);
        connectedIds.add(t);
      }
    });
    nodes = nodes.filter(n => connectedIds.has(n.id) || (n.count || 0) >= 5);
  }

  return nodes;
}

function rebuildCurrent() {
  selectedNode = null;
  clearHighlight();
  showEmptySide();
  if (simulation) simulation.stop();
  buildGraph(getVisibleNodes(), allEdges);
}

// ---- Build / rebuild graph ----
function buildGraph(nodes, edges) {
  g.selectAll('*').remove();
  const W = +svg.attr('width'), H = +svg.attr('height');
  const maxCount = d3.max(nodes, d => d.count) || 1;
  const sizeScale = d3.scaleSqrt().domain([1, maxCount]).range([4, 26]);

  const nodeIds = new Set(nodes.map(d => d.id));
  const validEdges = edges.filter(e => {
    const s = e.source?.id ?? e.source;
    const t = e.target?.id ?? e.target;
    return nodeIds.has(s) && nodeIds.has(t);
  });

  // Links
  linkSel = g.append('g').attr('class', 'links')
    .selectAll('line')
    .data(validEdges)
    .join('line')
    .attr('class', 'link')
    .style('stroke', d => RELATION_COLOR[d.relation] || '#444')
    .style('stroke-opacity', 0.5)
    .style('stroke-width', 1)
    .attr('marker-end', d => `url(#arrow-${d.relation || 'default'})`);

  // Nodes
  const nodeG = g.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragged)
      .on('end', dragEnd))
    .on('click', (event, d) => { event.stopPropagation(); selectNode(d, nodes, validEdges); })
    .on('mouseover', (event, d) => showTooltip(event, d))
    .on('mousemove', (event) => moveTooltip(event))
    .on('mouseout', hideTooltip);

  nodeG.append('circle')
    .attr('r', d => sizeScale(d.count || 1))
    .attr('fill', d => TYPE_COLOR_HEX[d.type] || '#888')
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => TYPE_COLOR_HEX[d.type] || '#888')
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 1.5);

  nodeG.append('text')
    .attr('dy', d => sizeScale(d.count || 1) + 12)
    .text(d => d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label);

  nodeSel = nodeG;

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(validEdges).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(d => -150 - sizeScale(d.count || 1) * 4))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide(d => sizeScale(d.count || 1) + 8))
    .force('x', d3.forceX(W / 2).strength(0.03))
    .force('y', d3.forceY(H / 2).strength(0.03))
    .on('tick', ticked);

  svg.on('click', () => { selectedNode = null; clearHighlight(); showEmptySide(); });
}

function ticked() {
  linkSel
    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
}

// ---- Drag ----
function dragStart(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

// ---- Fly-to + select ----
function flyToAndSelect(d) {
  const node = allNodes.find(n => n.id === d.id);
  if (!node || node.x === undefined) return;
  const W = +svg.attr('width'), H = +svg.attr('height');
  svg.transition().duration(600).call(
    zoom.transform,
    d3.zoomIdentity.translate(W/2, H/2).scale(2).translate(-node.x, -node.y)
  );
  setTimeout(() => selectNode(node, getVisibleNodes(), allEdges), 300);
}

// ---- Select node ----
function selectNode(d, nodes, edges) {
  selectedNode = d;
  const connectedIds = new Set();
  const connectedEdges = [];
  edges.forEach(e => {
    const sid = e.source?.id ?? e.source;
    const tid = e.target?.id ?? e.target;
    if (sid === d.id || tid === d.id) {
      connectedIds.add(sid === d.id ? tid : sid);
      connectedEdges.push(e);
    }
  });

  nodeSel.classed('faded', n => n.id !== d.id && !connectedIds.has(n.id))
         .classed('highlighted', n => n.id === d.id);

  linkSel.classed('faded', e => {
    const sid = e.source?.id ?? e.source;
    const tid = e.target?.id ?? e.target;
    return sid !== d.id && tid !== d.id;
  }).classed('highlighted', e => {
    const sid = e.source?.id ?? e.source;
    const tid = e.target?.id ?? e.target;
    return sid === d.id || tid === d.id;
  });

  const W = +svg.attr('width'), H = +svg.attr('height');
  svg.transition().duration(500).call(
    zoom.transform,
    d3.zoomIdentity.translate(W/2, H/2).scale(1.8).translate(-d.x, -d.y)
  );

  showNodeDetail(d, connectedEdges, nodes);
}

function clearHighlight() {
  if (nodeSel) nodeSel.classed('faded', false).classed('highlighted', false);
  if (linkSel) linkSel.classed('faded', false).classed('highlighted', false);
}

// ---- Tooltip ----
const tooltip = document.getElementById('tooltip');
function showTooltip(event, d) {
  tooltip.style.display = 'block';
  tooltip.innerHTML = `<strong>${d.label}</strong><br>
    <span style="color:${TYPE_COLOR_HEX[d.type]}">${TYPE_LABEL[d.type] || d.type}</span>
    &nbsp;·&nbsp;提及 <strong>${d.count}</strong> 次`;
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style.left = (event.clientX + 14) + 'px';
  tooltip.style.top  = (event.clientY - 8) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

// ---- Side panel ----
function showEmptySide() {
  document.getElementById('side-body').innerHTML = `
    <div class="side-empty">
      <div class="side-empty-icon">🔮</div>
      <div>点击节点查看详情</div>
    </div>`;
}

function showNodeDetail(d, connectedEdges, nodes) {
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  const inEdges  = connectedEdges.filter(e => (e.target?.id ?? e.target) === d.id);
  const outEdges = connectedEdges.filter(e => (e.source?.id ?? e.source) === d.id);

  const relHtml = (edges, dir) => edges.slice(0, 12).map(e => {
    const otherId = dir === 'out' ? (e.target?.id ?? e.target) : (e.source?.id ?? e.source);
    const other = nodeMap[otherId];
    if (!other) return '';
    const rel = e.relation || '';
    const relLabel = RELATION_LABEL[rel] || rel;
    const relColor = RELATION_COLOR[rel] || '#8b949e';
    return `<div class="relation-item" onclick="focusNodeById('${otherId}')">
      <span class="relation-label" style="background:${relColor}22;color:${relColor};border-color:${relColor}44">${relLabel}</span>
      <span class="relation-name" style="color:${TYPE_COLOR_HEX[other.type]||'#e6edf3'}">${other.label}</span>
      <span class="relation-count">${other.count}次</span>
    </div>`;
  }).join('');

  const docIds = d.doc_ids || d.sources || [];

  document.getElementById('side-body').innerHTML = `
    <div class="node-detail active">
      <div class="node-name">
        ${d.label}
        <span class="badge badge-${d.type}">${TYPE_LABEL[d.type] || d.type}</span>
      </div>
      <div class="node-stat">
        <div class="stat">
          <div class="stat-value" style="color:${TYPE_COLOR_HEX[d.type]}">${d.count}</div>
          <div class="stat-label">提及次数</div>
        </div>
        <div class="stat">
          <div class="stat-value">${connectedEdges.length}</div>
          <div class="stat-label">关联节点</div>
        </div>
        <div class="stat">
          <div class="stat-value">${docIds.length}</div>
          <div class="stat-label">出处文档</div>
        </div>
      </div>
      ${d.desc ? `<div class="node-desc">${d.desc}</div>` : ''}
      ${outEdges.length ? `
        <div class="section-title">→ 指向关系</div>
        <div class="relation-list">${relHtml(outEdges, 'out')}</div>
        ${outEdges.length > 12 ? `<div class="source-more">…还有 ${outEdges.length - 12} 条</div>` : ''}
      ` : ''}
      ${inEdges.length ? `
        <div class="section-title">← 来自关系</div>
        <div class="relation-list">${relHtml(inEdges, 'in')}</div>
        ${inEdges.length > 12 ? `<div class="source-more">…还有 ${inEdges.length - 12} 条</div>` : ''}
      ` : ''}
      <div class="goto-ranking" onclick="window.location='ranking.html'">
        查看完整排行榜 →
      </div>
    </div>`;
}

window.focusNodeById = function(nodeId) {
  const node = allNodes.find(n => n.id === nodeId);
  if (node) flyToAndSelect(node);
};

window.focusNode = window.focusNodeById;

loadData().catch(err => {
  hideLoading();
  document.getElementById('side-body').innerHTML = `
    <div class="side-empty">
      <div class="side-empty-icon">⚠️</div>
      <div style="color:var(--text2)">数据加载失败<br><small>${err.message}</small></div>
    </div>`;
  console.error(err);
});
