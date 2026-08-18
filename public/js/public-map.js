// public/js/public-map.js - Public Interactive Map Engine
(function() {
  'use strict';

  // State
  let currentMap = null;
  let activeZones = [];
  let currentZoneStalls = [];
  let selectedZoneId = null;

  // Viewport Pan & Zoom State
  let scale = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  // DOM Elements
  const viewport = document.getElementById('map-viewport');
  const stage = document.getElementById('map-stage');
  const mapImage = document.getElementById('map-image');
  const zonesLayer = document.getElementById('zones-layer');
  const eventTitle = document.getElementById('event-title');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // Modal Elements
  const zoneModal = document.getElementById('zone-modal');
  const modalZoneTitle = document.getElementById('modal-zone-title');
  const modalZoneDesc = document.getElementById('modal-zone-desc');
  const modalZoneStallCount = document.getElementById('modal-zone-stall-count');
  const modalZoneColorTag = document.getElementById('modal-zone-color-tag');
  const modalStallsList = document.getElementById('modal-stalls-list');
  const modalZoneSearch = document.getElementById('modal-zone-search');
  const modalCloseBtn = document.getElementById('modal-zone-close');
  const modalCloseFooter = document.getElementById('btn-modal-close-footer');

  // Search and Category Elements
  const publicSearchInput = document.getElementById('public-search-input');
  const categoryBar = document.getElementById('category-bar');

  // Zoom Controls
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnFitScreen = document.getElementById('btn-fit-screen');
  const btnResetZoom = document.getElementById('btn-reset-zoom');

  // Toast Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Update Transform
  function updateTransform() {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  // Fit map to viewport on load
  function fitToScreen() {
    if (!mapImage.naturalWidth) return;
    const vpWidth = viewport.clientWidth;
    const vpHeight = viewport.clientHeight;
    const imgWidth = mapImage.naturalWidth || 1600;
    const imgHeight = mapImage.naturalHeight || 1000;

    const scaleX = (vpWidth - 60) / imgWidth;
    const scaleY = (vpHeight - 60) / imgHeight;
    scale = Math.min(scaleX, scaleY, 1.2);
    scale = Math.max(scale, 0.3);

    panX = (vpWidth - imgWidth * scale) / 2;
    panY = (vpHeight - imgHeight * scale) / 2;
    updateTransform();
  }

  // Pan to a specific zone % coordinates
  function panToZone(zoneX, zoneY) {
    const vpWidth = viewport.clientWidth;
    const vpHeight = viewport.clientHeight;
    const imgWidth = mapImage.clientWidth || 1600;
    const imgHeight = mapImage.clientHeight || 1000;

    scale = Math.max(scale, 1.0);
    const targetPxX = (zoneX / 100) * imgWidth;
    const targetPxY = (zoneY / 100) * imgHeight;

    panX = vpWidth / 2 - targetPxX * scale;
    panY = vpHeight / 2 - targetPxY * scale;
    updateTransform();
  }

  // Initialize Pan & Zoom Event Handlers
  function initPanZoom() {
    // Mouse Drag
    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.public-zone-hotspot') || e.target.closest('.map-controls-floating')) return;
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      viewport.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      viewport.classList.remove('is-dragging');
    });

    // Mouse Wheel Zoom centered on cursor
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.min(Math.max(scale * zoomFactor, 0.25), 4.0);

      // Adjust pan to zoom into mouse cursor
      panX = mouseX - (mouseX - panX) * (newScale / scale);
      panY = mouseY - (mouseY - panY) * (newScale / scale);
      scale = newScale;

      updateTransform();
    }, { passive: false });

    // Touch Support (Pinch to Zoom & Touch Drag)
    let initialPinchDistance = null;
    let initialPinchScale = 1.0;

    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - panX;
        startY = e.touches[0].clientY - panY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchScale = scale;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        panX = e.touches[0].clientX - startX;
        panY = e.touches[0].clientY - startY;
        updateTransform();
      } else if (e.touches.length === 2 && initialPinchDistance) {
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDistance / initialPinchDistance;
        scale = Math.min(Math.max(initialPinchScale * factor, 0.25), 4.0);
        updateTransform();
      }
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
      isDragging = false;
      initialPinchDistance = null;
    });

    // Control Buttons
    btnZoomIn.addEventListener('click', () => {
      scale = Math.min(scale * 1.25, 4.0);
      updateTransform();
    });

    btnZoomOut.addEventListener('click', () => {
      scale = Math.max(scale * 0.8, 0.25);
      updateTransform();
    });

    btnFitScreen.addEventListener('click', fitToScreen);
    btnResetZoom.addEventListener('click', () => {
      scale = 1.0;
      panX = 0;
      panY = 0;
      updateTransform();
    });
  }

  // Load Map & Zones
  async function loadMapData() {
    try {
      const mapRes = await fetch('/api/public/map');
      const mapJson = await mapRes.json();

      if (mapJson.success && mapJson.data) {
        currentMap = mapJson.data;
        mapImage.src = currentMap.imageUrl;
        if (eventTitle) {
          eventTitle.textContent = currentMap.name || 'Event Floor Plan';
        }
      }

      mapImage.onload = () => {
        fitToScreen();
      };

      await loadZonesData();
    } catch (err) {
      console.error('[Public Map] Failed to load map:', err);
    }
  }

  async function loadZonesData() {
    try {
      const zonesRes = await fetch('/api/public/zones');
      const zonesJson = await zonesRes.json();
      if (zonesJson.success) {
        activeZones = zonesJson.data || [];
        renderZones();
      }
    } catch (err) {
      console.error('[Public Map] Failed to load zones:', err);
    }
  }

  // Render Zone Hotspot Overlays
  function renderZones() {
    zonesLayer.innerHTML = '';

    activeZones.forEach(zone => {
      const el = document.createElement('div');
      el.className = `public-zone-hotspot shape-${zone.shape || 'rect'}`;
      el.id = `zone-hotspot-${zone.id}`;
      el.style.left = `${zone.x}%`;
      el.style.top = `${zone.y}%`;
      el.style.width = `${zone.width}%`;
      el.style.height = `${zone.height}%`;
      el.style.backgroundColor = `${zone.color || '#3b82f6'}33`; // 20% alpha background
      el.style.borderColor = zone.color || '#3b82f6';

      el.innerHTML = `
        <div class="zone-label-badge" style="border-left: 3px solid ${zone.color || '#3b82f6'};">
          ${escapeHtml(zone.name)}
        </div>
        <div class="zone-stalls-count">
          ${zone.stallCount || 0} ${zone.stallCount === 1 ? 'Stall' : 'Stalls'}
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openZoneModal(zone.id);
      });

      zonesLayer.appendChild(el);
    });
  }

  // Open Zone Details Modal
  async function openZoneModal(zoneId) {
    selectedZoneId = zoneId;
    const zone = activeZones.find(z => z.id === zoneId);
    if (!zone) return;

    modalZoneTitle.textContent = zone.name;
    modalZoneDesc.textContent = zone.description || 'No description provided.';
    modalZoneColorTag.style.backgroundColor = zone.color || '#3b82f6';
    modalZoneStallCount.textContent = `${zone.stallCount || 0} Stalls`;
    modalStallsList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading stalls...</div>';
    modalZoneSearch.value = '';

    zoneModal.classList.add('active');

    try {
      const res = await fetch(`/api/public/zones/${zoneId}/stalls`);
      const json = await res.json();
      if (json.success) {
        currentZoneStalls = json.stalls || [];
        renderZoneStalls(currentZoneStalls);
      } else {
        modalStallsList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--danger);">${json.error || 'Failed to load stalls.'}</div>`;
      }
    } catch (err) {
      modalStallsList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--danger);">Network error loading stalls.</div>';
    }
  }

  // Render Stalls inside Modal
  function renderZoneStalls(stalls) {
    if (!stalls || stalls.length === 0) {
      modalStallsList.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">🏪</div>
          <div style="font-weight: 600;">No Public Stalls Listed</div>
          <div style="font-size: 12px; margin-top: 4px;">There are currently no public stalls configured for this zone.</div>
        </div>
      `;
      return;
    }

    modalStallsList.innerHTML = stalls.map(s => `
      <div class="stall-item-card">
        <div class="stall-header-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="stall-badge">${escapeHtml(s.stallNumber)}</span>
            ${s.companyName ? `<span class="stall-company-name">${escapeHtml(s.companyName)}</span>` : '<span style="font-size: 13px; color: var(--text-muted); font-style: italic;">Exhibitor Info</span>'}
          </div>
          ${s.category ? `<span class="stall-category-badge">${escapeHtml(s.category)}</span>` : ''}
        </div>
        ${s.description ? `<p class="stall-public-desc">${escapeHtml(s.description)}</p>` : ''}
      </div>
    `).join('');
  }

  // Filter Stalls inside Modal Search
  modalZoneSearch.addEventListener('input', () => {
    const q = modalZoneSearch.value.trim().toLowerCase();
    if (!q) {
      return renderZoneStalls(currentZoneStalls);
    }
    const filtered = currentZoneStalls.filter(s => 
      (s.stallNumber && s.stallNumber.toLowerCase().includes(q)) ||
      (s.companyName && s.companyName.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
    renderZoneStalls(filtered);
  });

  // Close Modal
  function closeModal() {
    zoneModal.classList.remove('active');
    selectedZoneId = null;
  }
  modalCloseBtn.addEventListener('click', closeModal);
  modalCloseFooter.addEventListener('click', closeModal);
  zoneModal.addEventListener('click', (e) => {
    if (e.target === zoneModal) closeModal();
  });

  // Global Search Input
  let searchDebounce = null;
  publicSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const q = publicSearchInput.value.trim();
      if (!q) {
        document.querySelectorAll('.public-zone-hotspot').forEach(el => el.classList.remove('highlighted'));
        return;
      }

      try {
        const res = await fetch(`/api/public/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success && json.results.length > 0) {
          const first = json.results[0];
          document.querySelectorAll('.public-zone-hotspot').forEach(el => el.classList.remove('highlighted'));
          
          const hotspot = document.getElementById(`zone-hotspot-${first.zoneId}`);
          if (hotspot) {
            hotspot.classList.add('highlighted');
            panToZone(first.zoneCoords.x, first.zoneCoords.y);
          }
        }
      } catch (e) {}
    }, 250);
  });

  // Category Filter Bar
  categoryBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-chip');
    if (!btn) return;
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');

    const cat = btn.dataset.category;
    if (cat === 'ALL') {
      document.querySelectorAll('.public-zone-hotspot').forEach(el => el.classList.remove('highlighted'));
    } else {
      // Highlight matching zones
      activeZones.forEach(z => {
        const el = document.getElementById(`zone-hotspot-${z.id}`);
        if (el) {
          if (z.name.toLowerCase().includes(cat.toLowerCase()) || z.description.toLowerCase().includes(cat.toLowerCase())) {
            el.classList.add('highlighted');
          } else {
            el.classList.remove('highlighted');
          }
        }
      });
    }
  });

  // Real-time EventSource Setup
  function initRealtime() {
    const evtSource = new EventSource('/api/realtime/events');

    evtSource.addEventListener('CONNECTED', (e) => {
      statusDot.className = 'status-dot online';
      statusText.textContent = 'Live';
    });

    evtSource.addEventListener('ZONE_UPDATED', (e) => {
      const data = JSON.parse(e.data);
      loadZonesData();
      if (selectedZoneId === data.id) {
        openZoneModal(data.id);
      }
    });

    evtSource.addEventListener('ZONE_CREATED', () => {
      loadZonesData();
      showToast('New map zone added by event team', 'info');
    });

    evtSource.addEventListener('ZONE_DELETED', (e) => {
      const data = JSON.parse(e.data);
      loadZonesData();
      if (selectedZoneId === data.id) {
        closeModal();
      }
    });

    evtSource.addEventListener('STALL_UPDATED', (e) => {
      const data = JSON.parse(e.data);
      if (selectedZoneId === data.zoneId) {
        openZoneModal(data.zoneId);
      }
    });

    evtSource.addEventListener('STALL_CREATED', (e) => {
      const data = JSON.parse(e.data);
      loadZonesData();
      if (selectedZoneId === data.zoneId) {
        openZoneModal(data.zoneId);
      }
    });

    evtSource.addEventListener('STALL_DELETED', (e) => {
      const data = JSON.parse(e.data);
      loadZonesData();
      if (selectedZoneId === data.zoneId) {
        openZoneModal(data.zoneId);
      }
    });

    evtSource.addEventListener('MAP_CHANGED', (e) => {
      const data = JSON.parse(e.data);
      mapImage.src = data.imageUrl;
      if (eventTitle) eventTitle.textContent = data.name;
      loadZonesData();
      showToast('Event floor plan updated in real time', 'info');
    });

    evtSource.onerror = () => {
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Reconnecting...';
    };
  }

  // HTML Escape Helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Bootstrap
  window.addEventListener('DOMContentLoaded', () => {
    initPanZoom();
    loadMapData();
    initRealtime();
    window.addEventListener('resize', fitToScreen);
  });
})();
