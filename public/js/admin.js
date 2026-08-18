// public/js/admin.js - SaaS Admin Dashboard & Sensory Map Editor Engine
(function() {
  'use strict';

  // Global Admin State
  let currentUser = null;
  let currentMap = null;
  let allZones = [];
  let allStalls = [];
  let selectedZoneId = null;
  let selectedStallId = null;
  let isEditingStallId = null;

  // Editor Pan & Zoom State
  let editorScale = 1.0;
  let editorPanX = 0;
  let editorPanY = 0;
  let isEditorPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let currentTool = 'select'; // select, pan, add_stall, add_rect, add_circle

  // Drag & Resize Interaction State
  let isDraggingItem = false;
  let isResizingItem = false;
  let dragItemType = null; // 'zone' | 'stall'
  let activeResizeHandle = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialItemCoords = null;

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const currentPageTitle = document.getElementById('current-page-title');
  const sidebarUserName = document.getElementById('sidebar-user-name');
  const sidebarUserEmail = document.getElementById('sidebar-user-email');
  const userAvatarInitials = document.getElementById('user-avatar-initials');
  const btnLogout = document.getElementById('btn-logout');
  const btnPreviewPublic = document.getElementById('btn-preview-public');
  const previewModal = document.getElementById('preview-modal');
  const btnPreviewClose = document.getElementById('btn-preview-close');

  // Editor Elements
  const editorCanvas = document.getElementById('editor-canvas-viewport');
  const editorStage = document.getElementById('editor-stage');
  const editorMapWrapper = document.getElementById('editor-map-wrapper');
  const editorMapImg = document.getElementById('editor-map-img');
  const editorZonesLayer = document.getElementById('editor-zones-layer');
  const editorStallsLayer = document.getElementById('editor-stalls-layer');
  const inspectorEmptyState = document.getElementById('inspector-empty-state');
  const inspectorZoneForm = document.getElementById('inspector-zone-form');
  const inspectorStallForm = document.getElementById('inspector-stall-form');
  const inspectorTitle = document.getElementById('inspector-title');
  const inspectorBadge = document.getElementById('inspector-badge');

  // Zone Inspector Form Inputs
  const propZoneName = document.getElementById('prop-zone-name');
  const propZoneShape = document.getElementById('prop-zone-shape');
  const propZoneColor = document.getElementById('prop-zone-color');
  const propZoneColorHex = document.getElementById('prop-zone-color-hex');
  const propZoneX = document.getElementById('prop-zone-x');
  const propZoneY = document.getElementById('prop-zone-y');
  const propZoneW = document.getElementById('prop-zone-w');
  const propZoneH = document.getElementById('prop-zone-h');
  const propZonePublic = document.getElementById('prop-zone-public');
  const propZoneDesc = document.getElementById('prop-zone-desc');
  const btnSaveZoneProps = document.getElementById('btn-save-zone-props');
  const btnDuplicateZone = document.getElementById('btn-duplicate-zone');
  const btnDeleteZone = document.getElementById('btn-delete-zone');

  // Stall Inspector Form Inputs
  const propStallNumber = document.getElementById('prop-stall-number');
  const propStallZone = document.getElementById('prop-stall-zone');
  const propStallCompany = document.getElementById('prop-stall-company');
  const propStallCategory = document.getElementById('prop-stall-category');
  const propStallBookingStatus = document.getElementById('prop-stall-booking-status');
  const propStallPaymentStatus = document.getElementById('prop-stall-payment-status');
  const propStallAmount = document.getElementById('prop-stall-amount');
  const propStallX = document.getElementById('prop-stall-x');
  const propStallY = document.getElementById('prop-stall-y');
  const propStallW = document.getElementById('prop-stall-w');
  const propStallH = document.getElementById('prop-stall-h');
  const propStallPublic = document.getElementById('prop-stall-public');
  const propStallDesc = document.getElementById('prop-stall-desc');
  const propStallContact = document.getElementById('prop-stall-contact');
  const propStallPhone = document.getElementById('prop-stall-phone');
  const propStallEmail = document.getElementById('prop-stall-email');
  const btnSaveStallProps = document.getElementById('btn-save-stall-props');
  const btnDuplicateStallEditor = document.getElementById('btn-duplicate-stall-editor');
  const btnDeleteStallEditor = document.getElementById('btn-delete-stall-editor');

  // Stall Modal & Elements
  const stallModal = document.getElementById('stall-modal');
  const stallForm = document.getElementById('stall-form');
  const stallModalTitle = document.getElementById('stall-modal-title');
  const btnStallCancel = document.getElementById('btn-stall-cancel');
  const btnStallSave = document.getElementById('btn-stall-save');
  const btnStallModalClose = document.getElementById('btn-stall-modal-close');
  const btnQuickAddStall = document.getElementById('btn-quick-add-stall');
  const btnAddStall = document.getElementById('btn-add-stall');

  // CSV Elements
  const csvImportModal = document.getElementById('csv-import-modal');
  const btnImportCsv = document.getElementById('btn-import-csv');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnCsvClose = document.getElementById('btn-csv-close');
  const btnCsvCancel = document.getElementById('btn-csv-cancel');
  const btnCsvExecute = document.getElementById('btn-csv-execute');
  const csvRawInput = document.getElementById('csv-raw-input');
  const csvFileInput = document.getElementById('csv-file-input');
  const csvDefaultZone = document.getElementById('csv-default-zone');
  const csvImportResults = document.getElementById('csv-import-results');

  // Map Upload Elements
  const uploadMapModal = document.getElementById('upload-map-modal');
  const btnOpenUploadMap = document.getElementById('btn-open-upload-map');
  const btnMapUploadClose = document.getElementById('btn-map-upload-close');
  const btnMapUploadCancel = document.getElementById('btn-map-upload-cancel');
  const btnMapUploadSubmit = document.getElementById('btn-map-upload-submit');
  const mapUploadName = document.getElementById('map-upload-name');
  const mapUploadFile = document.getElementById('map-upload-file');

  // Toast System
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

  // =================== AUTH & INITIALIZATION ===================
  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/auth/me');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const json = await res.json();
      if (json.success && json.user) {
        currentUser = json.user;
        sidebarUserName.textContent = currentUser.name || 'Administrator';
        sidebarUserEmail.textContent = currentUser.email || 'admin@event.com';
        userAvatarInitials.textContent = (currentUser.name || 'AD').substring(0, 2).toUpperCase();
        
        await loadInitialData();
      } else {
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('[Admin Auth Check Error]', err);
      window.location.href = '/login';
    }
  }

  async function loadInitialData() {
    await Promise.all([
      loadDashboardStats(),
      loadMapsAndZones(),
      loadStallsTable(),
      loadAuditLogs()
    ]);
  }

  btnLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/login';
  });

  window.switchTab = function(tabId) {
    navItems.forEach(item => {
      if (item.dataset.tab === tabId) item.classList.add('active');
      else item.classList.remove('active');
    });

    tabPanes.forEach(pane => {
      if (pane.id === tabId) pane.classList.add('active');
      else pane.classList.remove('active');
    });

    const titles = {
      'tab-dashboard': 'Dashboard Overview',
      'tab-editor': 'Figma-Style Map & Zone Editor',
      'tab-stalls': 'Stall Database Management',
      'tab-zones': 'Interactive Zones Overview',
      'tab-audit': 'System Audit Logs & History',
      'tab-settings': 'Settings & Security'
    };
    currentPageTitle.textContent = titles[tabId] || 'Admin Dashboard';

    if (tabId === 'tab-editor') {
      setTimeout(fitEditorToScreen, 50);
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
    });
  });

  btnPreviewPublic.addEventListener('click', () => {
    const iframe = document.getElementById('preview-iframe');
    iframe.src = '/map?t=' + Date.now();
    previewModal.classList.add('active');
  });

  btnPreviewClose.addEventListener('click', () => {
    previewModal.classList.remove('active');
  });

  // =================== 1. DASHBOARD OVERVIEW ===================
  async function loadDashboardStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const json = await res.json();
      if (!json.success) return;

      const { stats } = json;
      document.getElementById('stat-total-stalls').textContent = stats.stalls.total;
      document.getElementById('stat-stalls-sub').textContent = `${stats.stalls.booked} Booked · ${stats.stalls.available} Available · ${stats.stalls.reserved} Reserved`;
      
      document.getElementById('stat-occupancy-rate').textContent = `${stats.stalls.occupancyRate}%`;
      document.getElementById('stat-occupancy-sub').textContent = `${stats.stalls.publicVisible} Publicly Visible on Map`;

      document.getElementById('stat-total-revenue').textContent = `$${stats.financials.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      document.getElementById('stat-pending-revenue').textContent = `Potential: $${stats.financials.potentialRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      document.getElementById('stat-total-zones').textContent = stats.zones.total;
      document.getElementById('stat-zones-sub').textContent = `${stats.zones.public} Public · ${stats.zones.private} Internal Only`;

      const activityContainer = document.getElementById('dashboard-recent-activity');
      if (!stats.recentActivity || stats.recentActivity.length === 0) {
        activityContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No recent activity.</div>';
      } else {
        activityContainer.innerHTML = stats.recentActivity.map(act => `
          <div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-light); font-size: 13px;">
            <span class="badge ${act.action === 'CREATE' ? 'badge-success' : act.action === 'DELETE' ? 'badge-danger' : 'badge-primary'}">${act.action}</span>
            <div style="flex: 1;">
              <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(act.details)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${act.user_name} · ${new Date(act.created_at).toLocaleTimeString()}</div>
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('[Dashboard Stats Error]', err);
    }
  }

  // =================== 2. FIGMA-STYLE MAP & STALL EDITOR ===================
  function updateEditorTransform() {
    editorStage.style.transform = `translate(${editorPanX}px, ${editorPanY}px) scale(${editorScale})`;
  }

  function fitEditorToScreen() {
    if (!editorMapImg.naturalWidth) return;
    const vpW = editorCanvas.clientWidth;
    const vpH = editorCanvas.clientHeight;
    const imgW = editorMapImg.naturalWidth || 1600;
    const imgH = editorMapImg.naturalHeight || 1000;

    const sX = (vpW - 80) / imgW;
    const sY = (vpH - 80) / imgH;
    editorScale = Math.min(sX, sY, 1.2);
    editorScale = Math.max(editorScale, 0.3);

    editorPanX = (vpW - imgW * editorScale) / 2;
    editorPanY = (vpH - imgH * editorScale) / 2;
    updateEditorTransform();
  }

  function initEditorControls() {
    const toolBtns = {
      'tool-select': 'select',
      'tool-pan': 'pan',
      'tool-add-stall': 'add_stall',
      'tool-add-rect': 'add_rect',
      'tool-add-circle': 'add_circle'
    };

    Object.entries(toolBtns).forEach(([btnId, tool]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = tool;

        editorCanvas.className = 'editor-canvas-container';
        if (tool === 'pan') {
          editorCanvas.classList.add('tool-pan');
        } else if (tool === 'add_stall') {
          createStallAtCenter();
          document.getElementById('tool-select').click();
        } else if (tool.startsWith('add_')) {
          createZoneAtCenter(tool.replace('add_', ''));
          document.getElementById('tool-select').click();
        }
      });
    });

    document.getElementById('btn-editor-zoom-in').addEventListener('click', () => {
      editorScale = Math.min(editorScale * 1.2, 4.0);
      updateEditorTransform();
    });
    document.getElementById('btn-editor-zoom-out').addEventListener('click', () => {
      editorScale = Math.max(editorScale * 0.8, 0.25);
      updateEditorTransform();
    });
    document.getElementById('btn-editor-fit').addEventListener('click', fitEditorToScreen);
    document.getElementById('btn-editor-reset').addEventListener('click', () => {
      editorScale = 1.0;
      editorPanX = 0;
      editorPanY = 0;
      updateEditorTransform();
    });

    // Canvas Pan & Deselect
    editorCanvas.addEventListener('mousedown', (e) => {
      if (currentTool === 'pan' || e.button === 1 || e.target === editorCanvas || e.target === editorStage) {
        if (!e.target.closest('.editor-zone-box') && !e.target.closest('.editor-stall-box')) {
          deselectAll();
        }
        isEditorPanning = true;
        panStartX = e.clientX - editorPanX;
        panStartY = e.clientY - editorPanY;
        editorCanvas.classList.add('is-dragging');
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isEditorPanning) {
        editorPanX = e.clientX - panStartX;
        editorPanY = e.clientY - panStartY;
        updateEditorTransform();
      } else if (isDraggingItem) {
        handleItemDrag(e);
      } else if (isResizingItem) {
        handleItemResize(e);
      }
    });

    window.addEventListener('mouseup', async () => {
      if (isEditorPanning) {
        isEditorPanning = false;
        editorCanvas.classList.remove('is-dragging');
      }
      if (isDraggingItem || isResizingItem) {
        isDraggingItem = false;
        isResizingItem = false;
        activeResizeHandle = null;
        
        if (dragItemType === 'zone' && selectedZoneId) {
          await saveZoneProperties(false);
        } else if (dragItemType === 'stall' && selectedStallId) {
          await saveStallProperties(false);
        }
      }
    });

    // Wheel Zoom
    editorCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = editorCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.min(Math.max(editorScale * factor, 0.25), 4.0);

      editorPanX = mouseX - (mouseX - editorPanX) * (newScale / editorScale);
      editorPanY = mouseY - (mouseY - editorPanY) * (newScale / editorScale);
      editorScale = newScale;

      updateEditorTransform();
    }, { passive: false });

    // Keyboard Delete Shortcut
    window.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedStallId) {
          btnDeleteStallEditor.click();
        } else if (selectedZoneId) {
          btnDeleteZone.click();
        }
      }
    });
  }

  // Load Maps, Zones, Stalls in Editor
  async function loadMapsAndZones() {
    try {
      const res = await fetch('/api/admin/maps');
      const json = await res.json();
      if (json.success && json.maps.length > 0) {
        const active = json.maps.find(m => m.is_active === 1) || json.maps[0];
        currentMap = active;
        editorMapImg.src = active.image_url;
      }

      editorMapImg.onload = () => {
        fitEditorToScreen();
      };

      const [zonesRes, stallsRes] = await Promise.all([
        fetch('/api/admin/zones'),
        fetch('/api/admin/stalls')
      ]);

      const zonesJson = await zonesRes.json();
      const stallsJson = await stallsRes.json();

      if (zonesJson.success) {
        allZones = zonesJson.zones || [];
        renderEditorZones();
        renderZonesOverviewTable();
        populateZoneSelectDropdowns();
      }

      if (stallsJson.success) {
        allStalls = stallsJson.stalls || [];
        renderEditorStalls();
      }
    } catch (err) {
      console.error('[Admin Load Error]', err);
    }
  }

  // Render Zones in Canvas
  function renderEditorZones() {
    editorZonesLayer.innerHTML = '';

    allZones.forEach(zone => {
      const isSelected = (zone.id === selectedZoneId && dragItemType === 'zone');
      const box = document.createElement('div');
      box.className = `editor-zone-box shape-${zone.shape || 'rect'} ${zone.is_public ? '' : 'is-private'} ${isSelected ? 'selected' : ''}`;
      box.id = `admin-zone-box-${zone.id}`;
      
      box.style.left = `${zone.x}%`;
      box.style.top = `${zone.y}%`;
      box.style.width = `${zone.width}%`;
      box.style.height = `${zone.height}%`;
      box.style.borderColor = zone.color || '#3b82f6';
      box.style.backgroundColor = `${zone.color || '#3b82f6'}18`;

      box.innerHTML = `
        <div class="editor-zone-tag" style="border-left: 3px solid ${zone.color || '#3b82f6'};">
          ${escapeHtml(zone.name)} ${zone.is_public ? '' : '🔒'}
        </div>
        <div class="resize-handle handle-nw" data-handle="nw"></div>
        <div class="resize-handle handle-n" data-handle="n"></div>
        <div class="resize-handle handle-ne" data-handle="ne"></div>
        <div class="resize-handle handle-e" data-handle="e"></div>
        <div class="resize-handle handle-se" data-handle="se"></div>
        <div class="resize-handle handle-s" data-handle="s"></div>
        <div class="resize-handle handle-sw" data-handle="sw"></div>
        <div class="resize-handle handle-w" data-handle="w"></div>
      `;

      box.addEventListener('mousedown', (e) => {
        if (currentTool === 'pan') return;
        e.stopPropagation();

        const handle = e.target.dataset.handle;
        if (handle) {
          isResizingItem = true;
          dragItemType = 'zone';
          activeResizeHandle = handle;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          initialItemCoords = { ...zone };
        } else {
          selectZone(zone.id);
          isDraggingItem = true;
          dragItemType = 'zone';
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          initialItemCoords = { ...zone };
        }
      });

      editorZonesLayer.appendChild(box);
    });
  }

  // Render Direct Stalls / Booths in Canvas
  function renderEditorStalls() {
    editorStallsLayer.innerHTML = '';

    allStalls.forEach(stall => {
      if (stall.x === null || stall.x === undefined) return;

      const isSelected = (stall.id === selectedStallId && dragItemType === 'stall');
      const box = document.createElement('div');
      const statusClass = (stall.booking_status === 'Available') ? 'status-available' : (stall.booking_status === 'Reserved') ? 'status-reserved' : '';
      box.className = `editor-stall-box ${statusClass} ${isSelected ? 'selected' : ''}`;
      box.id = `admin-stall-box-${stall.id}`;

      box.style.left = `${stall.x}%`;
      box.style.top = `${stall.y}%`;
      box.style.width = `${stall.width || 7.0}%`;
      box.style.height = `${stall.height || 7.0}%`;

      box.innerHTML = `
        <div class="stall-tag-num">${escapeHtml(stall.stall_number)}</div>
        <div class="stall-tag-comp">${escapeHtml(stall.company_name || (stall.booking_status === 'Available' ? 'Available' : ''))}</div>
        <div class="resize-handle handle-nw" data-handle="nw"></div>
        <div class="resize-handle handle-n" data-handle="n"></div>
        <div class="resize-handle handle-ne" data-handle="ne"></div>
        <div class="resize-handle handle-e" data-handle="e"></div>
        <div class="resize-handle handle-se" data-handle="se"></div>
        <div class="resize-handle handle-s" data-handle="s"></div>
        <div class="resize-handle handle-sw" data-handle="sw"></div>
        <div class="resize-handle handle-w" data-handle="w"></div>
      `;

      box.addEventListener('mousedown', (e) => {
        if (currentTool === 'pan') return;
        e.stopPropagation();

        const handle = e.target.dataset.handle;
        if (handle) {
          isResizingItem = true;
          dragItemType = 'stall';
          activeResizeHandle = handle;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          initialItemCoords = { ...stall };
        } else {
          selectStall(stall.id);
          isDraggingItem = true;
          dragItemType = 'stall';
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          initialItemCoords = { ...stall };
        }
      });

      editorStallsLayer.appendChild(box);
    });
  }

  // Drag Item (Zone or Stall)
  function handleItemDrag(e) {
    const mapW = editorMapImg.clientWidth;
    const mapH = editorMapImg.clientHeight;
    if (!mapW || !mapH) return;

    const deltaPxX = (e.clientX - dragStartX) / editorScale;
    const deltaPxY = (e.clientY - dragStartY) / editorScale;

    const deltaPctX = (deltaPxX / mapW) * 100;
    const deltaPctY = (deltaPxY / mapH) * 100;

    let newX = Math.max(0, Math.min(100 - initialItemCoords.width, initialItemCoords.x + deltaPctX));
    let newY = Math.max(0, Math.min(100 - initialItemCoords.height, initialItemCoords.y + deltaPctY));

    newX = Math.round(newX * 10) / 10;
    newY = Math.round(newY * 10) / 10;

    if (dragItemType === 'zone') {
      const zone = allZones.find(z => z.id === selectedZoneId);
      if (zone) {
        zone.x = newX;
        zone.y = newY;
        propZoneX.value = newX;
        propZoneY.value = newY;
        const el = document.getElementById(`admin-zone-box-${zone.id}`);
        if (el) {
          el.style.left = `${newX}%`;
          el.style.top = `${newY}%`;
        }
      }
    } else if (dragItemType === 'stall') {
      const stall = allStalls.find(s => s.id === selectedStallId);
      if (stall) {
        stall.x = newX;
        stall.y = newY;
        propStallX.value = newX;
        propStallY.value = newY;
        const el = document.getElementById(`admin-stall-box-${stall.id}`);
        if (el) {
          el.style.left = `${newX}%`;
          el.style.top = `${newY}%`;
        }
      }
    }
  }

  // Resize Item (Zone or Stall)
  function handleItemResize(e) {
    const mapW = editorMapImg.clientWidth;
    const mapH = editorMapImg.clientHeight;
    if (!mapW || !mapH) return;

    const deltaPxX = (e.clientX - dragStartX) / editorScale;
    const deltaPxY = (e.clientY - dragStartY) / editorScale;

    const deltaPctX = (deltaPxX / mapW) * 100;
    const deltaPctY = (deltaPxY / mapH) * 100;

    const item = initialItemCoords;
    let newX = item.x;
    let newY = item.y;
    let newW = item.width;
    let newH = item.height;

    switch (activeResizeHandle) {
      case 'se':
        newW = Math.max(2, item.width + deltaPctX);
        newH = Math.max(2, item.height + deltaPctY);
        break;
      case 'e':
        newW = Math.max(2, item.width + deltaPctX);
        break;
      case 's':
        newH = Math.max(2, item.height + deltaPctY);
        break;
      case 'nw':
        newX = Math.min(item.x + item.width - 2, item.x + deltaPctX);
        newY = Math.min(item.y + item.height - 2, item.y + deltaPctY);
        newW = item.width - (newX - item.x);
        newH = item.height - (newY - item.y);
        break;
      case 'n':
        newY = Math.min(item.y + item.height - 2, item.y + deltaPctY);
        newH = item.height - (newY - item.y);
        break;
      case 'w':
        newX = Math.min(item.x + item.width - 2, item.x + deltaPctX);
        newW = item.width - (newX - item.x);
        break;
      case 'ne':
        newY = Math.min(item.y + item.height - 2, item.y + deltaPctY);
        newW = Math.max(2, item.width + deltaPctX);
        newH = item.height - (newY - item.y);
        break;
      case 'sw':
        newX = Math.min(item.x + item.width - 2, item.x + deltaPctX);
        newW = item.width - (newX - item.x);
        newH = Math.max(2, item.height + deltaPctY);
        break;
    }

    newX = Math.max(0, Math.round(newX * 10) / 10);
    newY = Math.max(0, Math.round(newY * 10) / 10);
    newW = Math.max(2, Math.round(newW * 10) / 10);
    newH = Math.max(2, Math.round(newH * 10) / 10);

    if (dragItemType === 'zone') {
      const zone = allZones.find(z => z.id === selectedZoneId);
      if (zone) {
        zone.x = newX; zone.y = newY; zone.width = newW; zone.height = newH;
        propZoneX.value = newX; propZoneY.value = newY; propZoneW.value = newW; propZoneH.value = newH;
        const el = document.getElementById(`admin-zone-box-${zone.id}`);
        if (el) { el.style.left = `${newX}%`; el.style.top = `${newY}%`; el.style.width = `${newW}%`; el.style.height = `${newH}%`; }
      }
    } else if (dragItemType === 'stall') {
      const stall = allStalls.find(s => s.id === selectedStallId);
      if (stall) {
        stall.x = newX; stall.y = newY; stall.width = newW; stall.height = newH;
        propStallX.value = newX; propStallY.value = newY; propStallW.value = newW; propStallH.value = newH;
        const el = document.getElementById(`admin-stall-box-${stall.id}`);
        if (el) { el.style.left = `${newX}%`; el.style.top = `${newY}%`; el.style.width = `${newW}%`; el.style.height = `${newH}%`; }
      }
    }
  }

  // Select Zone
  function selectZone(zoneId) {
    deselectAll();
    selectedZoneId = zoneId;
    dragItemType = 'zone';

    const zone = allZones.find(z => z.id === zoneId);
    if (!zone) return;

    const el = document.getElementById(`admin-zone-box-${zone.id}`);
    if (el) el.classList.add('selected');

    inspectorEmptyState.style.display = 'none';
    inspectorStallForm.style.display = 'none';
    inspectorZoneForm.style.display = 'block';
    inspectorTitle.textContent = 'Zone Properties';
    inspectorBadge.textContent = 'Zone';

    propZoneName.value = zone.name;
    propZoneShape.value = zone.shape || 'rect';
    propZoneColor.value = zone.color || '#3b82f6';
    propZoneColorHex.value = zone.color || '#3b82f6';
    propZoneX.value = zone.x;
    propZoneY.value = zone.y;
    propZoneW.value = zone.width;
    propZoneH.value = zone.height;
    propZonePublic.checked = !!zone.is_public;
    propZoneDesc.value = zone.description || '';
  }

  // Select Stall
  function selectStall(stallId) {
    deselectAll();
    selectedStallId = stallId;
    dragItemType = 'stall';

    const stall = allStalls.find(s => s.id === stallId);
    if (!stall) return;

    const el = document.getElementById(`admin-stall-box-${stall.id}`);
    if (el) el.classList.add('selected');

    inspectorEmptyState.style.display = 'none';
    inspectorZoneForm.style.display = 'none';
    inspectorStallForm.style.display = 'block';
    inspectorTitle.textContent = `Stall ${stall.stall_number}`;
    inspectorBadge.textContent = 'Stall Booth';

    propStallNumber.value = stall.stall_number;
    propStallZone.value = stall.zone_id;
    propStallCompany.value = stall.company_name || '';
    propStallCategory.value = stall.category || '';
    propStallBookingStatus.value = stall.booking_status || 'Available';
    propStallPaymentStatus.value = stall.payment_status || 'Unpaid';
    propStallAmount.value = stall.payment_amount || 0;
    propStallX.value = stall.x !== undefined ? stall.x : 20;
    propStallY.value = stall.y !== undefined ? stall.y : 20;
    propStallW.value = stall.width || 7.0;
    propStallH.value = stall.height || 7.0;
    propStallPublic.checked = !!stall.public_visible;
    propStallDesc.value = stall.public_description || '';
    propStallContact.value = stall.contact_person || '';
    propStallPhone.value = stall.phone || '';
    propStallEmail.value = stall.email || '';
  }

  function deselectAll() {
    selectedZoneId = null;
    selectedStallId = null;
    dragItemType = null;
    document.querySelectorAll('.editor-zone-box, .editor-stall-box').forEach(b => b.classList.remove('selected'));
    inspectorEmptyState.style.display = 'block';
    inspectorZoneForm.style.display = 'none';
    inspectorStallForm.style.display = 'none';
    inspectorTitle.textContent = 'Properties';
    inspectorBadge.textContent = 'Inspector';
  }

  // Save Zone
  async function saveZoneProperties(notify = true) {
    if (!selectedZoneId) return;
    const payload = {
      name: propZoneName.value.trim(),
      shape: propZoneShape.value,
      color: propZoneColor.value,
      x: parseFloat(propZoneX.value) || 0,
      y: parseFloat(propZoneY.value) || 0,
      width: parseFloat(propZoneW.value) || 15,
      height: parseFloat(propZoneH.value) || 15,
      is_public: propZonePublic.checked,
      description: propZoneDesc.value.trim()
    };

    try {
      const res = await fetch(`/api/admin/zones/${selectedZoneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        if (notify) showToast('Zone saved', 'success');
        await loadMapsAndZones();
        selectZone(selectedZoneId);
      }
    } catch (err) {
      showToast('Error saving zone', 'error');
    }
  }
  btnSaveZoneProps.addEventListener('click', () => saveZoneProperties(true));

  // Save Stall
  async function saveStallProperties(notify = true) {
    if (!selectedStallId) return;
    const payload = {
      stall_number: propStallNumber.value.trim(),
      zone_id: Number(propStallZone.value),
      company_name: propStallCompany.value.trim(),
      category: propStallCategory.value.trim(),
      booking_status: propStallBookingStatus.value,
      payment_status: propStallPaymentStatus.value,
      payment_amount: parseFloat(propStallAmount.value) || 0,
      x: parseFloat(propStallX.value) || 20,
      y: parseFloat(propStallY.value) || 20,
      width: parseFloat(propStallW.value) || 7,
      height: parseFloat(propStallH.value) || 7,
      public_visible: propStallPublic.checked,
      public_description: propStallDesc.value.trim(),
      contact_person: propStallContact.value.trim(),
      phone: propStallPhone.value.trim(),
      email: propStallEmail.value.trim()
    };

    try {
      const res = await fetch(`/api/admin/stalls/${selectedStallId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        if (notify) showToast('Stall booth saved', 'success');
        await loadMapsAndZones();
        await loadStallsTable();
        selectStall(selectedStallId);
      } else {
        showToast(json.error || 'Failed to save stall', 'error');
      }
    } catch (err) {
      showToast('Error saving stall', 'error');
    }
  }
  btnSaveStallProps.addEventListener('click', () => saveStallProperties(true));

  // Duplicate Stall from Editor
  btnDuplicateStallEditor.addEventListener('click', async () => {
    if (!selectedStallId) return;
    try {
      const res = await fetch(`/api/admin/stalls/${selectedStallId}/duplicate`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Stall booth duplicated', 'success');
        await loadMapsAndZones();
        await loadStallsTable();
        selectStall(json.stall.id);
      }
    } catch (e) {
      showToast('Failed to duplicate stall', 'error');
    }
  });

  // Delete Stall from Editor
  btnDeleteStallEditor.addEventListener('click', async () => {
    if (!selectedStallId) return;
    const stall = allStalls.find(s => s.id === selectedStallId);
    if (!confirm(`Delete Stall "${stall ? stall.stall_number : 'this booth'}"?`)) return;

    try {
      const res = await fetch(`/api/admin/stalls/${selectedStallId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast('Stall deleted', 'success');
        deselectAll();
        await loadMapsAndZones();
        await loadStallsTable();
        await loadDashboardStats();
      }
    } catch (e) {
      showToast('Failed to delete stall', 'error');
    }
  });

  // Create Stall at Center
  async function createStallAtCenter() {
    const targetZoneId = allZones.length > 0 ? allZones[0].id : 1;
    const stallNum = `B-${Math.floor(Math.random() * 89 + 10)}`;
    const payload = {
      stall_number: stallNum,
      zone_id: targetZoneId,
      company_name: '',
      category: 'General',
      booking_status: 'Available',
      payment_status: 'Unpaid',
      payment_amount: 3500.0,
      x: 45.0,
      y: 45.0,
      width: 7.0,
      height: 7.0,
      shape: 'rect',
      public_visible: true,
      public_description: 'Available booth for reservation.'
    };

    try {
      const res = await fetch('/api/admin/stalls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Placed Stall ${stallNum} on floor plan`, 'success');
        await loadMapsAndZones();
        await loadStallsTable();
        await loadDashboardStats();
        selectStall(json.stall.id);
      } else {
        showToast(json.error || 'Failed to place stall', 'error');
      }
    } catch (e) {
      showToast('Failed to create stall', 'error');
    }
  }

  // Create Zone at Center
  async function createZoneAtCenter(shape = 'rect') {
    const defaultName = `New Zone ${allZones.length + 1}`;
    const payload = {
      name: defaultName,
      shape,
      x: 35.0,
      y: 35.0,
      width: 20.0,
      height: 18.0,
      color: '#3b82f6',
      is_public: 1,
      description: 'New interactive event zone'
    };

    try {
      const res = await fetch('/api/admin/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Created ${defaultName}`, 'success');
        await loadMapsAndZones();
        selectZone(json.zone.id);
      }
    } catch (e) {
      showToast('Failed to create zone', 'error');
    }
  }

  // Duplicate Zone
  btnDuplicateZone.addEventListener('click', async () => {
    if (!selectedZoneId) return;
    try {
      const res = await fetch(`/api/admin/zones/${selectedZoneId}/duplicate`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Zone duplicated', 'success');
        await loadMapsAndZones();
        selectZone(json.zone.id);
      }
    } catch (e) {
      showToast('Failed to duplicate zone', 'error');
    }
  });

  // Delete Zone
  btnDeleteZone.addEventListener('click', async () => {
    if (!selectedZoneId) return;
    const zone = allZones.find(z => z.id === selectedZoneId);
    if (!confirm(`Delete Zone "${zone ? zone.name : 'this zone'}"?`)) return;

    try {
      const res = await fetch(`/api/admin/zones/${selectedZoneId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast('Zone deleted', 'success');
        deselectAll();
        await loadMapsAndZones();
        await loadStallsTable();
      }
    } catch (e) {
      showToast('Failed to delete zone', 'error');
    }
  });

  // Upload New Map
  btnOpenUploadMap.addEventListener('click', () => uploadMapModal.classList.add('active'));
  btnMapUploadClose.addEventListener('click', () => uploadMapModal.classList.remove('active'));
  btnMapUploadCancel.addEventListener('click', () => uploadMapModal.classList.remove('active'));

  btnMapUploadSubmit.addEventListener('click', async () => {
    const name = mapUploadName.value.trim();
    const file = mapUploadFile.files[0];
    if (!name || !file) {
      showToast('Please provide a layout name and select a map file', 'error');
      return;
    }

    btnMapUploadSubmit.disabled = true;
    btnMapUploadSubmit.textContent = 'Uploading...';

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const uploadRes = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            base64Data: reader.result,
            folder: 'maps'
          })
        });

        const uploadJson = await uploadRes.json();
        if (!uploadJson.success) throw new Error(uploadJson.error || 'Upload failed');

        const mapRes = await fetch('/api/admin/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, imageUrl: uploadJson.url })
        });
        const mapJson = await mapRes.json();
        if (mapJson.success) {
          showToast('Floor plan uploaded & activated!', 'success');
          uploadMapModal.classList.remove('active');
          mapUploadName.value = '';
          mapUploadFile.value = '';
          await loadMapsAndZones();
        }
      } catch (err) {
        showToast(err.message || 'Error uploading map', 'error');
      } finally {
        btnMapUploadSubmit.disabled = false;
        btnMapUploadSubmit.textContent = 'Upload & Activate Map';
      }
    };
    reader.readAsDataURL(file);
  });

  // =================== 3. STALL DATABASE TABLE ===================
  async function loadStallsTable() {
    try {
      const qSearch = document.getElementById('stall-search-input').value.trim();
      const qZone = document.getElementById('stall-zone-filter').value;
      const qBooking = document.getElementById('stall-booking-filter').value;
      const qPayment = document.getElementById('stall-payment-filter').value;
      const qPublic = document.getElementById('stall-public-filter').value;

      const params = new URLSearchParams();
      if (qSearch) params.set('search', qSearch);
      if (qZone) params.set('zone_id', qZone);
      if (qBooking) params.set('booking_status', qBooking);
      if (qPayment) params.set('payment_status', qPayment);
      if (qPublic) params.set('public_visible', qPublic);

      const res = await fetch(`/api/admin/stalls?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        allStalls = json.stalls || [];
        renderStallsTable(allStalls);
      }
    } catch (err) {
      console.error('[Stalls Table Load Error]', err);
    }
  }

  function renderStallsTable(stalls) {
    const tbody = document.getElementById('stalls-table-body');
    if (!stalls || stalls.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">No stalls match your filter criteria</td></tr>`;
      return;
    }

    tbody.innerHTML = stalls.map(s => `
      <tr>
        <td><strong style="font-family: monospace; font-size: 13px;">${escapeHtml(s.stall_number)}</strong></td>
        <td><span class="badge" style="background: ${s.zone_color || '#3b82f6'}22; color: ${s.zone_color || '#3b82f6'}; border: 1px solid ${s.zone_color || '#3b82f6'};">${escapeHtml(s.zone_name || 'Unassigned')}</span></td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(s.company_name || '—')}</div>
          ${s.contact_person ? `<div style="font-size: 11px; color: var(--text-muted);">Contact: ${escapeHtml(s.contact_person)}</div>` : ''}
        </td>
        <td>${escapeHtml(s.category || 'General')}</td>
        <td>
          <span class="badge ${s.booking_status === 'Booked' ? 'badge-primary' : s.booking_status === 'Available' ? 'badge-success' : 'badge-warning'}">
            ${escapeHtml(s.booking_status)}
          </span>
        </td>
        <td>
          <span class="badge ${s.payment_status === 'Paid' ? 'badge-success' : s.payment_status === 'Pending' ? 'badge-warning' : 'badge-danger'}">
            ${escapeHtml(s.payment_status)}
          </span>
        </td>
        <td>$${(s.payment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td>
          <span class="badge ${s.public_visible ? 'badge-success' : 'badge-neutral'}">
            ${s.public_visible ? '🌐 Public' : '🔒 Private'}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="switchTab('tab-editor'); selectStall(${s.id});" title="Locate on Map">🗺️</button>
          <button class="btn btn-secondary btn-sm" onclick="editStall(${s.id})" title="Edit Details">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteStall(${s.id}, '${escapeHtml(s.stall_number)}')" title="Delete">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  ['stall-search-input', 'stall-zone-filter', 'stall-booking-filter', 'stall-payment-filter', 'stall-public-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => loadStallsTable());
  });

  function populateZoneSelectDropdowns() {
    const formSelect = document.getElementById('form-stall-zone');
    const filterSelect = document.getElementById('stall-zone-filter');
    const csvSelect = document.getElementById('csv-default-zone');
    const propSelect = document.getElementById('prop-stall-zone');

    const optionsHtml = allZones.map(z => `<option value="${z.id}">${escapeHtml(z.name)}</option>`).join('');
    
    if (formSelect) formSelect.innerHTML = optionsHtml;
    if (csvSelect) csvSelect.innerHTML = optionsHtml;
    if (propSelect) propSelect.innerHTML = optionsHtml;
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">All Zones</option>' + optionsHtml;
    }
  }

  window.openAddStallModal = function() {
    isEditingStallId = null;
    stallModalTitle.textContent = 'Add New Stall';
    stallForm.reset();
    document.getElementById('form-stall-id').value = '';
    document.getElementById('form-stall-public-vis').checked = true;
    document.getElementById('form-stall-show-company').checked = true;
    document.getElementById('form-stall-show-cat').checked = true;
    document.getElementById('form-stall-show-desc').checked = true;
    stallModal.classList.add('active');
  };

  window.editStall = function(stallId) {
    const stall = allStalls.find(s => s.id === stallId);
    if (!stall) return;

    isEditingStallId = stallId;
    stallModalTitle.textContent = `Edit Stall ${stall.stall_number}`;

    document.getElementById('form-stall-id').value = stall.id;
    document.getElementById('form-stall-num').value = stall.stall_number;
    document.getElementById('form-stall-zone').value = stall.zone_id;
    document.getElementById('form-stall-company').value = stall.company_name || '';
    document.getElementById('form-stall-category').value = stall.category || '';
    document.getElementById('form-stall-public-desc').value = stall.public_description || '';
    
    document.getElementById('form-stall-show-company').checked = !!stall.show_company_name;
    document.getElementById('form-stall-show-cat').checked = !!stall.show_category;
    document.getElementById('form-stall-show-desc').checked = !!stall.show_description;
    document.getElementById('form-stall-public-vis').checked = !!stall.public_visible;

    document.getElementById('form-stall-contact').value = stall.contact_person || '';
    document.getElementById('form-stall-phone').value = stall.phone || '';
    document.getElementById('form-stall-email').value = stall.email || '';
    document.getElementById('form-stall-booking-status').value = stall.booking_status || 'Available';
    document.getElementById('form-stall-payment-status').value = stall.payment_status || 'Unpaid';
    document.getElementById('form-stall-amount').value = stall.payment_amount || 0;
    document.getElementById('form-stall-notes').value = stall.internal_notes || '';

    stallModal.classList.add('active');
  };

  window.deleteStall = async function(stallId, stallNum) {
    if (!confirm(`Are you sure you want to permanently delete Stall "${stallNum}"?`)) return;

    try {
      const res = await fetch(`/api/admin/stalls/${stallId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast(`Stall ${stallNum} deleted`, 'success');
        await loadStallsTable();
        await loadMapsAndZones();
        await loadDashboardStats();
      }
    } catch (e) {
      showToast('Failed to delete stall', 'error');
    }
  };

  btnQuickAddStall.addEventListener('click', () => openAddStallModal());
  btnAddStall.addEventListener('click', () => openAddStallModal());
  btnStallCancel.addEventListener('click', () => stallModal.classList.remove('active'));
  btnStallModalClose.addEventListener('click', () => stallModal.classList.remove('active'));

  btnStallSave.addEventListener('click', async () => {
    const stallNum = document.getElementById('form-stall-num').value.trim();
    const zoneId = document.getElementById('form-stall-zone').value;
    if (!stallNum || !zoneId) {
      showToast('Stall Number and Zone are required', 'error');
      return;
    }

    const payload = {
      stall_number: stallNum,
      zone_id: Number(zoneId),
      company_name: document.getElementById('form-stall-company').value.trim(),
      category: document.getElementById('form-stall-category').value.trim(),
      public_description: document.getElementById('form-stall-public-desc').value.trim(),
      show_company_name: document.getElementById('form-stall-show-company').checked,
      show_category: document.getElementById('form-stall-show-cat').checked,
      show_description: document.getElementById('form-stall-show-desc').checked,
      public_visible: document.getElementById('form-stall-public-vis').checked,
      contact_person: document.getElementById('form-stall-contact').value.trim(),
      phone: document.getElementById('form-stall-phone').value.trim(),
      email: document.getElementById('form-stall-email').value.trim(),
      booking_status: document.getElementById('form-stall-booking-status').value,
      payment_status: document.getElementById('form-stall-payment-status').value,
      payment_amount: parseFloat(document.getElementById('form-stall-amount').value) || 0,
      internal_notes: document.getElementById('form-stall-notes').value.trim()
    };

    btnStallSave.disabled = true;
    try {
      const url = isEditingStallId ? `/api/admin/stalls/${isEditingStallId}` : '/api/admin/stalls';
      const method = isEditingStallId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(isEditingStallId ? 'Stall updated' : 'Stall created', 'success');
        stallModal.classList.remove('active');
        await loadStallsTable();
        await loadMapsAndZones();
        await loadDashboardStats();
      } else {
        showToast(json.error || 'Failed to save stall', 'error');
      }
    } catch (err) {
      showToast('Error saving stall', 'error');
    } finally {
      btnStallSave.disabled = false;
    }
  });

  // =================== CSV IMPORT & EXPORT ===================
  btnExportCsv.addEventListener('click', () => {
    window.location.href = '/api/admin/stalls/export';
  });

  window.openCsvImportModal = function() {
    csvRawInput.value = '';
    csvFileInput.value = '';
    csvImportResults.style.display = 'none';
    csvImportModal.classList.add('active');
  };

  btnImportCsv.addEventListener('click', openCsvImportModal);
  btnCsvClose.addEventListener('click', () => csvImportModal.classList.remove('active'));
  btnCsvCancel.addEventListener('click', () => csvImportModal.classList.remove('active'));

  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { csvRawInput.value = reader.result; };
      reader.readAsText(file);
    }
  });

  btnCsvExecute.addEventListener('click', async () => {
    const csvData = csvRawInput.value.trim();
    if (!csvData) {
      showToast('Please paste or upload CSV data', 'error');
      return;
    }

    btnCsvExecute.disabled = true;
    btnCsvExecute.textContent = 'Importing...';

    try {
      const res = await fetch('/api/admin/stalls/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvData,
          defaultZoneId: Number(csvDefaultZone.value)
        })
      });

      const json = await res.json();
      if (json.success) {
        const { results } = json;
        csvImportResults.style.display = 'block';
        csvImportResults.innerHTML = `
          <div style="background: var(--success-light); border: 1px solid var(--success-border); color: #065f46; padding: 12px; border-radius: var(--radius-sm); font-size: 13px;">
            <strong>✓ Successfully imported ${results.imported} stalls!</strong>
            ${results.errors.length > 0 ? `<div style="margin-top: 6px; color: var(--danger);">${results.errors.length} rows had errors.</div>` : ''}
          </div>
        `;
        showToast(`Imported ${results.imported} records`, 'success');
        await loadStallsTable();
        await loadMapsAndZones();
        await loadDashboardStats();
      } else {
        showToast(json.error || 'Import failed', 'error');
      }
    } catch (err) {
      showToast('Error during import', 'error');
    } finally {
      btnCsvExecute.disabled = false;
      btnCsvExecute.textContent = 'Process & Import Records';
    }
  });

  // =================== 4. ZONES OVERVIEW TABLE ===================
  function renderZonesOverviewTable() {
    const tbody = document.getElementById('zones-table-body');
    if (!tbody) return;

    if (!allZones || allZones.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">No zones created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = allZones.map(z => `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 16px; height: 16px; border-radius: 4px; background: ${z.color || '#3b82f6'};"></div>
            <span style="font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--text-muted);">${z.shape || 'rect'}</span>
          </div>
        </td>
        <td><strong>${escapeHtml(z.name)}</strong></td>
        <td><span class="badge badge-neutral">${z.total_stalls || 0}</span></td>
        <td><span class="badge badge-primary">${z.booked_stalls || 0}</span></td>
        <td><span class="badge badge-success">${z.available_stalls || 0}</span></td>
        <td><span class="badge ${z.is_public ? 'badge-success' : 'badge-warning'}">${z.is_public ? '🌐 Public' : '🔒 Private'}</span></td>
        <td style="font-family: monospace; font-size: 12px;">${z.x}%, ${z.y}%, ${z.width}%, ${z.height}%</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="switchTab('tab-editor'); selectZone(${z.id});" title="Edit in Canvas">🗺️ Open in Editor</button>
        </td>
      </tr>
    `).join('');
  }

  // =================== 5. AUDIT LOGS ===================
  async function loadAuditLogs() {
    try {
      const res = await fetch('/api/admin/audit-logs');
      const json = await res.json();
      if (!json.success) return;

      const tbody = document.getElementById('audit-table-body');
      const badgeCount = document.getElementById('audit-logs-count');
      const logs = json.logs || [];

      if (badgeCount) badgeCount.textContent = `${logs.length} Records`;

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">No audit events recorded yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="font-size: 12px; color: var(--text-muted);">${new Date(l.created_at).toLocaleString()}</td>
          <td><strong>${escapeHtml(l.user_name || 'System')}</strong></td>
          <td><span class="badge ${l.action === 'CREATE' ? 'badge-success' : l.action === 'DELETE' ? 'badge-danger' : 'badge-primary'}">${l.action}</span></td>
          <td><span class="badge badge-neutral">${l.entity_type}</span></td>
          <td style="font-family: monospace; font-size: 12px;">${l.entity_id || '—'}</td>
          <td>${escapeHtml(l.details || '')}</td>
          <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${escapeHtml(l.ip_address || '—')}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('[Audit Logs Error]', e);
    }
  }

  // =================== 6. SETTINGS & PASSWORD CHANGE ===================
  const changePwdForm = document.getElementById('change-pwd-form');
  if (changePwdForm) {
    changePwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cur = document.getElementById('pwd-current').value;
      const nw = document.getElementById('pwd-new').value;
      const conf = document.getElementById('pwd-confirm').value;

      if (nw !== conf) {
        showToast('New passwords do not match', 'error');
        return;
      }

      try {
        const res = await fetch('/api/admin/auth/password', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: cur, newPassword: nw })
        });
        const json = await res.json();
        if (json.success) {
          showToast('Password updated successfully', 'success');
          changePwdForm.reset();
        } else {
          showToast(json.error || 'Failed to update password', 'error');
        }
      } catch (err) {
        showToast('Network error updating password', 'error');
      }
    });
  }

  // =================== REAL-TIME SYNC (SSE) ===================
  function initAdminRealtime() {
    const statusDot = document.getElementById('admin-status-dot');
    const statusText = document.getElementById('admin-status-text');

    const evtSource = new EventSource('/api/realtime/events');

    evtSource.addEventListener('CONNECTED', () => {
      if (statusDot) statusDot.className = 'status-dot online';
      if (statusText) statusText.textContent = 'Live Sync';
    });

    evtSource.addEventListener('ZONE_UPDATED', async () => {
      await loadMapsAndZones();
      await loadDashboardStats();
    });

    evtSource.addEventListener('ZONE_CREATED', async () => {
      await loadMapsAndZones();
      await loadDashboardStats();
    });

    evtSource.addEventListener('ZONE_DELETED', async () => {
      await loadMapsAndZones();
      await loadStallsTable();
      await loadDashboardStats();
    });

    evtSource.addEventListener('STALL_UPDATED', async () => {
      await loadMapsAndZones();
      await loadStallsTable();
      await loadDashboardStats();
    });

    evtSource.addEventListener('STALL_CREATED', async () => {
      await loadMapsAndZones();
      await loadStallsTable();
      await loadDashboardStats();
    });

    evtSource.addEventListener('STALL_DELETED', async () => {
      await loadMapsAndZones();
      await loadStallsTable();
      await loadDashboardStats();
    });

    evtSource.addEventListener('MAP_CHANGED', async () => {
      await loadMapsAndZones();
    });

    evtSource.onerror = () => {
      if (statusDot) statusDot.className = 'status-dot offline';
      if (statusText) statusText.textContent = 'Reconnecting...';
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.selectZone = selectZone;
  window.selectStall = selectStall;

  window.addEventListener('DOMContentLoaded', async () => {
    initEditorControls();
    await checkAuth();
    initAdminRealtime();
  });
})();
