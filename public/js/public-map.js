// public/js/public-map.js - Clean White Map Engine with Direct On-Page Admin Controls
(function() {
  'use strict';

  // Global State
  let isAdminAuthenticated = false;
  let isAdminModeActive = false;
  let currentMap = null;
  let allPins = []; // Zones/Pins
  let currentPinStalls = [];
  let selectedPinId = null;

  // Viewport Pan & Zoom State
  let scale = 1.0;
  let panX = 0;
  let panY = 0;
  let isDraggingCanvas = false;
  let canvasStartX = 0;
  let canvasStartY = 0;

  // Pin Dragging State
  let isDraggingPin = false;
  let draggedPinId = null;
  let pinDragStartX = 0;
  let pinDragStartY = 0;
  let pinInitialCoords = null;

  // DOM Elements
  const viewport = document.getElementById('map-viewport');
  const stage = document.getElementById('map-stage');
  const mapImage = document.getElementById('map-image');
  const mapWrapper = document.getElementById('map-wrapper');
  const pinsLayer = document.getElementById('pins-layer');
  const eventTitle = document.getElementById('event-title');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const tipText = document.getElementById('tip-text');

  // Admin Top Bar & Buttons
  const adminModeBar = document.getElementById('admin-mode-bar');
  const btnToggleAdminMode = document.getElementById('btn-toggle-admin-mode');
  const adminModeBtnIcon = document.getElementById('admin-mode-btn-icon');
  const adminModeBtnText = document.getElementById('admin-mode-btn-text');
  const btnDropPin = document.getElementById('btn-drop-pin');
  const btnOpenUploadMap = document.getElementById('btn-open-upload-map');
  const btnToggleVisitorView = document.getElementById('btn-toggle-visitor-view');
  const btnAdminLogout = document.getElementById('btn-admin-logout');

  // Pin Drawer Modal Elements
  const pinModal = document.getElementById('pin-modal');
  const modalPinTitle = document.getElementById('modal-pin-title');
  const modalPinCount = document.getElementById('modal-pin-count');
  const modalPinColorTag = document.getElementById('modal-pin-color-tag');
  const modalPinDesc = document.getElementById('modal-pin-desc');
  const modalStallsList = document.getElementById('modal-stalls-list');
  const modalPinSearch = document.getElementById('modal-pin-search');
  const btnPinModalClose = document.getElementById('btn-pin-modal-close');
  const btnPinModalFooterClose = document.getElementById('btn-pin-modal-footer-close');

  // Admin Pin Settings Elements
  const adminPinSettingsBox = document.getElementById('admin-pin-settings-box');
  const adminPinNameInput = document.getElementById('admin-pin-name-input');
  const adminPinColorInput = document.getElementById('admin-pin-color-input');
  const adminPinDescInput = document.getElementById('admin-pin-desc-input');
  const btnSavePinSettings = document.getElementById('btn-save-pin-settings');
  const btnDeletePin = document.getElementById('btn-delete-pin');
  const adminAddStallRow = document.getElementById('admin-add-stall-row');
  const btnAddStallUnderPin = document.getElementById('btn-add-stall-under-pin');

  // Stall Form Modal Elements
  const stallFormModal = document.getElementById('stall-form-modal');
  const stallFormTitle = document.getElementById('stall-form-title');
  const stallEditorForm = document.getElementById('stall-editor-form');
  const stallIdInput = document.getElementById('stall-id-input');
  const stallPinIdInput = document.getElementById('stall-pin-id-input');
  const formStallNumber = document.getElementById('form-stall-number');
  const formStallCompany = document.getElementById('form-stall-company');
  const formStallCategory = document.getElementById('form-stall-category');
  const formStallPublicDesc = document.getElementById('form-stall-public-desc');
  const formStallPublicVis = document.getElementById('form-stall-public-vis');
  const formStallContact = document.getElementById('form-stall-contact');
  const formStallPhone = document.getElementById('form-stall-phone');
  const formStallEmail = document.getElementById('form-stall-email');
  const formStallBookingStatus = document.getElementById('form-stall-booking-status');
  const formStallPaymentStatus = document.getElementById('form-stall-payment-status');
  const formStallNotes = document.getElementById('form-stall-notes');
  const btnStallFormCancel = document.getElementById('btn-stall-form-cancel');
  const btnStallFormSave = document.getElementById('btn-stall-form-save');
  const btnStallFormClose = document.getElementById('btn-stall-form-close');

  // Map Upload Modal Elements
  const uploadMapModal = document.getElementById('upload-map-modal');
  const uploadMapNameInput = document.getElementById('upload-map-name-input');
  const uploadMapFileInput = document.getElementById('upload-map-file-input');
  const btnUploadMapClose = document.getElementById('btn-upload-map-close');
  const btnUploadMapCancel = document.getElementById('btn-upload-map-cancel');
  const btnUploadMapSubmit = document.getElementById('btn-upload-map-submit');

  // Admin Login Modal Elements
  const adminLoginModal = document.getElementById('admin-login-modal');
  const inlineLoginForm = document.getElementById('inline-login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginErrorBanner = document.getElementById('login-error-banner');
  const btnLoginModalClose = document.getElementById('btn-login-modal-close');
  const btnQuickFillLogin = document.getElementById('btn-quick-fill-login');
  const btnLoginSubmit = document.getElementById('btn-login-submit');

  // Search Input
  const publicSearchInput = document.getElementById('public-search-input');

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
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  // =================== 1. AUTH & MODE HANDLING ===================
  async function checkAdminAuth() {
    try {
      const res = await fetch('/api/admin/auth/me');
      const json = await res.json();
      if (json.success && json.user) {
        isAdminAuthenticated = true;
        setAdminMode(true);
      } else {
        isAdminAuthenticated = false;
        setAdminMode(false);
      }
    } catch (e) {
      isAdminAuthenticated = false;
      setAdminMode(false);
    }
  }

  function setAdminMode(active) {
    isAdminModeActive = active && isAdminAuthenticated;

    if (isAdminModeActive) {
      adminModeBar.classList.add('active');
      adminModeBtnIcon.textContent = '🛠️';
      adminModeBtnText.textContent = 'Admin Mode: ON';
      btnToggleAdminMode.className = 'btn btn-primary btn-sm';
      if (tipText) tipText.textContent = 'Admin Mode: Drag pins to reposition or click any pin to manage its stalls';
    } else {
      adminModeBar.classList.remove('active');
      adminModeBtnIcon.textContent = '🔒';
      adminModeBtnText.textContent = 'Admin Mode';
      btnToggleAdminMode.className = 'btn btn-secondary btn-sm';
      if (tipText) tipText.textContent = 'Click any pin button to explore stalls under that location';
    }

    renderPins();
  }

  btnToggleAdminMode.addEventListener('click', () => {
    if (!isAdminAuthenticated) {
      // Open Login Modal
      loginErrorBanner.style.display = 'none';
      adminLoginModal.classList.add('active');
    } else {
      // Toggle between Admin and Visitor View
      setAdminMode(!isAdminModeActive);
    }
  });

  btnToggleVisitorView.addEventListener('click', () => {
    setAdminMode(false);
    showToast('Switched to Visitor Preview mode', 'info');
  });

  btnAdminLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch (e) {}
    isAdminAuthenticated = false;
    setAdminMode(false);
    showToast('Signed out of Admin Mode', 'info');
  });

  // Admin Quick Login Submit
  btnQuickFillLogin.addEventListener('click', () => {
    loginEmail.value = 'admin@event.com';
    loginPassword.value = 'Admin@123456';
  });

  inlineLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorBanner.style.display = 'none';
    btnLoginSubmit.disabled = true;
    btnLoginSubmit.textContent = 'Signing in...';

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.value.trim(),
          password: loginPassword.value
        })
      });
      const json = await res.json();
      if (json.success) {
        isAdminAuthenticated = true;
        adminLoginModal.classList.remove('active');
        inlineLoginForm.reset();
        setAdminMode(true);
        showToast('Admin Mode unlocked! You can now drop pins, upload maps, and edit stalls directly.', 'success');
        await loadMapAndPins();
      } else {
        loginErrorBanner.textContent = json.error || 'Authentication failed.';
        loginErrorBanner.style.display = 'block';
      }
    } catch (err) {
      loginErrorBanner.textContent = 'Network or server error.';
      loginErrorBanner.style.display = 'block';
    } finally {
      btnLoginSubmit.disabled = false;
      btnLoginSubmit.textContent = 'Unlock Admin Mode';
    }
  });

  btnLoginModalClose.addEventListener('click', () => adminLoginModal.classList.remove('active'));

  // =================== 2. PAN & ZOOM ENGINE ===================
  function updateTransform() {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function fitToScreen() {
    if (!mapImage.naturalWidth) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const imgW = mapImage.naturalWidth || 1600;
    const imgH = mapImage.naturalHeight || 1000;

    const sX = (vpW - 60) / imgW;
    const sY = (vpH - 60) / imgH;
    scale = Math.min(sX, sY, 1.2);
    scale = Math.max(scale, 0.3);

    panX = (vpW - imgW * scale) / 2;
    panY = (vpH - imgH * scale) / 2;
    updateTransform();
  }

  function panToCoords(x, y) {
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const imgW = mapImage.clientWidth || 1600;
    const imgH = mapImage.clientHeight || 1000;

    scale = Math.max(scale, 1.2);
    const targetPxX = (x / 100) * imgW;
    const targetPxY = (y / 100) * imgH;

    panX = vpW / 2 - targetPxX * scale;
    panY = vpH / 2 - targetPxY * scale;
    updateTransform();
  }

  function initPanZoom() {
    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.map-pin-btn') || e.target.closest('.map-controls-floating') || e.target.closest('.map-info-pill')) return;
      isDraggingCanvas = true;
      canvasStartX = e.clientX - panX;
      canvasStartY = e.clientY - panY;
      viewport.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (isDraggingCanvas) {
        panX = e.clientX - canvasStartX;
        panY = e.clientY - canvasStartY;
        updateTransform();
      } else if (isDraggingPin && draggedPinId) {
        handlePinDrag(e);
      }
    });

    window.addEventListener('mouseup', async () => {
      if (isDraggingCanvas) {
        isDraggingCanvas = false;
        viewport.classList.remove('is-dragging');
      }
      if (isDraggingPin) {
        isDraggingPin = false;
        const pinId = draggedPinId;
        draggedPinId = null;
        if (pinId) {
          await savePinPosition(pinId);
        }
      }
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.min(Math.max(scale * factor, 0.25), 4.0);

      panX = mouseX - (mouseX - panX) * (newScale / scale);
      panY = mouseY - (mouseY - panY) * (newScale / scale);
      scale = newScale;

      updateTransform();
    }, { passive: false });

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

  // =================== 3. MAP & PIN RENDERING ===================
  async function loadMapAndPins() {
    try {
      const endpoint = isAdminAuthenticated ? '/api/admin/maps' : '/api/public/map';
      const res = await fetch(endpoint);
      const json = await res.json();

      if (json.success) {
        const mapData = isAdminAuthenticated ? (json.maps.find(m => m.is_active === 1) || json.maps[0]) : json.data;
        if (mapData) {
          currentMap = mapData;
          mapImage.src = mapData.image_url || mapData.imageUrl;
          if (eventTitle) eventTitle.textContent = mapData.name || 'Event Floor Plan';
        }
      }

      mapImage.onload = () => {
        fitToScreen();
      };

      await loadPins();
    } catch (err) {
      console.error('[Load Error]', err);
    }
  }

  async function loadPins() {
    try {
      const endpoint = isAdminAuthenticated ? '/api/admin/zones' : '/api/public/zones';
      const res = await fetch(endpoint);
      const json = await res.json();

      if (json.success) {
        allPins = isAdminAuthenticated ? json.zones : json.data;
        renderPins();
      }
    } catch (e) {
      console.error('[Pins Load Error]', e);
    }
  }

  // Render Interactive Pin Buttons on Canvas
  function renderPins() {
    pinsLayer.innerHTML = '';

    allPins.forEach(pin => {
      const count = pin.stallCount !== undefined ? pin.stallCount : (pin.total_stalls || 0);
      const color = pin.color || '#2563eb';
      const isSelected = (pin.id === selectedPinId);

      const btn = document.createElement('button');
      btn.className = `map-pin-btn ${isAdminModeActive ? 'is-admin-draggable' : ''} ${isSelected ? 'selected' : ''}`;
      btn.id = `map-pin-${pin.id}`;
      btn.style.left = `${pin.x}%`;
      btn.style.top = `${pin.y}%`;
      btn.style.borderColor = color;

      btn.innerHTML = `
        <span class="pin-icon" style="color: ${color};">${isAdminModeActive ? '📍' : '🏪'}</span>
        <span class="pin-label">${escapeHtml(pin.name)}</span>
        <span class="pin-count-badge" style="background: ${color}18; color: ${color};">${count} ${count === 1 ? 'Stall' : 'Stalls'}</span>
      `;

      // Click & Drag Handlers
      btn.addEventListener('mousedown', (e) => {
        if (!isAdminModeActive) return;
        e.stopPropagation();
        isDraggingPin = true;
        draggedPinId = pin.id;
        pinDragStartX = e.clientX;
        pinDragStartY = e.clientY;
        pinInitialCoords = { x: pin.x, y: pin.y };
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPinDrawer(pin.id);
      });

      pinsLayer.appendChild(btn);
    });
  }

  // Drag Pin Handler (Percentage Position)
  function handlePinDrag(e) {
    const mapW = mapImage.clientWidth;
    const mapH = mapImage.clientHeight;
    if (!mapW || !mapH) return;

    const deltaPxX = (e.clientX - pinDragStartX) / scale;
    const deltaPxY = (e.clientY - pinDragStartY) / scale;

    const deltaPctX = (deltaPxX / mapW) * 100;
    const deltaPctY = (deltaPxY / mapH) * 100;

    let newX = Math.max(1, Math.min(99, pinInitialCoords.x + deltaPctX));
    let newY = Math.max(1, Math.min(99, pinInitialCoords.y + deltaPctY));

    newX = Math.round(newX * 10) / 10;
    newY = Math.round(newY * 10) / 10;

    const pin = allPins.find(p => p.id === draggedPinId);
    if (pin) {
      pin.x = newX;
      pin.y = newY;
      const el = document.getElementById(`map-pin-${pin.id}`);
      if (el) {
        el.style.left = `${newX}%`;
        el.style.top = `${newY}%`;
      }
    }
  }

  async function savePinPosition(pinId) {
    const pin = allPins.find(p => p.id === pinId);
    if (!pin) return;

    try {
      await fetch(`/api/admin/zones/${pinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: pin.x,
          y: pin.y
        })
      });
      showToast(`Repositioned "${pin.name}" to ${pin.x}%, ${pin.y}%`, 'success');
    } catch (e) {}
  }

  // =================== 4. DIRECT PIN CREATION & MANAGEMENT ===================
  btnDropPin.addEventListener('click', async () => {
    if (!isAdminAuthenticated) return;
    const defaultName = `Pin ${allPins.length + 1}`;
    const payload = {
      name: defaultName,
      shape: 'rect',
      x: 45.0,
      y: 45.0,
      width: 15.0,
      height: 15.0,
      color: '#2563eb',
      is_public: 1,
      description: 'New interactive location'
    };

    try {
      const res = await fetch('/api/admin/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Dropped "${defaultName}" on the map!`, 'success');
        await loadPins();
        openPinDrawer(json.zone.id);
      }
    } catch (e) {
      showToast('Failed to drop pin', 'error');
    }
  });

  // Open Pin Drawer
  async function openPinDrawer(pinId) {
    selectedPinId = pinId;
    const pin = allPins.find(p => p.id === pinId);
    if (!pin) return;

    modalPinTitle.textContent = pin.name;
    modalPinDesc.textContent = pin.description || '';
    modalPinColorTag.style.backgroundColor = pin.color || '#2563eb';
    modalPinSearch.value = '';
    modalStallsList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading stalls under this pin...</div>';

    // Show/Hide Admin Controls
    if (isAdminModeActive) {
      adminPinSettingsBox.style.display = 'block';
      adminAddStallRow.style.display = 'flex';
      adminPinNameInput.value = pin.name;
      adminPinColorInput.value = pin.color || '#2563eb';
      adminPinDescInput.value = pin.description || '';
    } else {
      adminPinSettingsBox.style.display = 'none';
      adminAddStallRow.style.display = 'none';
    }

    pinModal.classList.add('active');

    // Fetch Stalls under this pin
    try {
      const endpoint = isAdminAuthenticated ? `/api/admin/stalls?zone_id=${pinId}` : `/api/public/zones/${pinId}/stalls`;
      const res = await fetch(endpoint);
      const json = await res.json();

      if (json.success) {
        currentPinStalls = isAdminAuthenticated ? json.stalls : json.stalls;
        const count = currentPinStalls.length;
        modalPinCount.textContent = `${count} ${count === 1 ? 'Stall' : 'Stalls'}`;
        renderPinStalls(currentPinStalls);
      }
    } catch (e) {
      modalStallsList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--danger);">Failed to load stalls.</div>';
    }
  }

  // Render Stalls in Drawer
  function renderPinStalls(stalls) {
    if (!stalls || stalls.length === 0) {
      modalStallsList.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">🏪</div>
          <div style="font-weight: 600;">No Stalls Under this Pin Yet</div>
          ${isAdminModeActive ? '<div style="font-size: 12px; margin-top: 4px;">Click "+ Add Stall" above to place your first stall!</div>' : ''}
        </div>
      `;
      return;
    }

    modalStallsList.innerHTML = stalls.map(s => {
      const stallNum = s.stallNumber || s.stall_number;
      const company = s.companyName || s.company_name;
      const cat = s.category || '';
      const desc = s.description || s.public_description || '';
      const isPublic = s.public_visible !== undefined ? !!s.public_visible : true;
      const stallId = s.id;

      if (isAdminModeActive) {
        // Admin Card with Edit / Delete / Visibility controls
        return `
          <div class="pin-stall-card">
            <div class="stall-card-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="stall-pill-num">${escapeHtml(stallNum)}</span>
                <span class="stall-company-title">${escapeHtml(company || '—')}</span>
                ${cat ? `<span class="badge badge-neutral">${escapeHtml(cat)}</span>` : ''}
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary btn-sm" onclick="window.editStallFromDrawer(${stallId})" title="Edit Stall">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="window.deleteStallFromDrawer(${stallId}, '${escapeHtml(stallNum)}')" title="Delete Stall">🗑️</button>
              </div>
            </div>
            ${desc ? `<div class="stall-desc-text">${escapeHtml(desc)}</div>` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border-light); padding-top: 6px;">
              <span>Status: <strong>${s.booking_status || 'Available'}</strong></span>
              <span class="badge ${isPublic ? 'badge-success' : 'badge-neutral'}">${isPublic ? '🌐 Public' : '🔒 Private'}</span>
            </div>
          </div>
        `;
      } else {
        // Public Card (Strict Zero-Leakage)
        return `
          <div class="pin-stall-card">
            <div class="stall-card-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="stall-pill-num">${escapeHtml(stallNum)}</span>
                ${company ? `<span class="stall-company-title">${escapeHtml(company)}</span>` : '<span style="color: var(--success); font-weight: 700; font-size: 13px;">Available Stall</span>'}
              </div>
              ${cat ? `<span class="badge badge-primary">${escapeHtml(cat)}</span>` : ''}
            </div>
            ${desc ? `<div class="stall-desc-text">${escapeHtml(desc)}</div>` : ''}
          </div>
        `;
      }
    }).join('');
  }

  // Filter Stalls in Drawer
  modalPinSearch.addEventListener('input', () => {
    const q = modalPinSearch.value.trim().toLowerCase();
    if (!q) return renderPinStalls(currentPinStalls);

    const filtered = currentPinStalls.filter(s => {
      const stallNum = (s.stallNumber || s.stall_number || '').toLowerCase();
      const comp = (s.companyName || s.company_name || '').toLowerCase();
      const cat = (s.category || '').toLowerCase();
      return stallNum.includes(q) || comp.includes(q) || cat.includes(q);
    });
    renderPinStalls(filtered);
  });

  // Save Pin Details
  btnSavePinSettings.addEventListener('click', async () => {
    if (!selectedPinId) return;
    const name = adminPinNameInput.value.trim();
    const color = adminPinColorInput.value;
    const desc = adminPinDescInput.value.trim();

    if (!name) {
      showToast('Pin name is required', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/admin/zones/${selectedPinId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, description: desc })
      });
      const json = await res.json();
      if (json.success) {
        showToast('Pin details saved', 'success');
        modalPinTitle.textContent = name;
        modalPinColorTag.style.backgroundColor = color;
        await loadPins();
      }
    } catch (e) {
      showToast('Error saving pin', 'error');
    }
  });

  // Delete Pin
  btnDeletePin.addEventListener('click', async () => {
    if (!selectedPinId) return;
    const pin = allPins.find(p => p.id === selectedPinId);
    if (!confirm(`Delete Pin "${pin ? pin.name : 'this pin'}" and all stalls under it?`)) return;

    try {
      const res = await fetch(`/api/admin/zones/${selectedPinId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast('Pin deleted', 'success');
        pinModal.classList.remove('active');
        selectedPinId = null;
        await loadPins();
      }
    } catch (e) {
      showToast('Error deleting pin', 'error');
    }
  });

  function closePinDrawer() {
    pinModal.classList.remove('active');
    selectedPinId = null;
  }
  btnPinModalClose.addEventListener('click', closePinDrawer);
  btnPinModalFooterClose.addEventListener('click', closePinDrawer);
  pinModal.addEventListener('click', (e) => {
    if (e.target === pinModal) closePinDrawer();
  });

  // =================== 5. ADD / EDIT STALL MODAL ===================
  btnAddStallUnderPin.addEventListener('click', () => {
    if (!selectedPinId) return;
    stallIdInput.value = '';
    stallPinIdInput.value = selectedPinId;
    stallFormTitle.textContent = 'Add Stall Under this Pin';
    stallEditorForm.reset();
    formStallPublicVis.checked = true;
    stallFormModal.classList.add('active');
  });

  window.editStallFromDrawer = function(stallId) {
    const stall = currentPinStalls.find(s => s.id === stallId);
    if (!stall) return;

    stallIdInput.value = stall.id;
    stallPinIdInput.value = stall.zone_id || selectedPinId;
    stallFormTitle.textContent = `Edit Stall ${stall.stall_number}`;

    formStallNumber.value = stall.stall_number;
    formStallCompany.value = stall.company_name || '';
    formStallCategory.value = stall.category || '';
    formStallPublicDesc.value = stall.public_description || '';
    formStallPublicVis.checked = !!stall.public_visible;

    formStallContact.value = stall.contact_person || '';
    formStallPhone.value = stall.phone || '';
    formStallEmail.value = stall.email || '';
    formStallBookingStatus.value = stall.booking_status || 'Available';
    formStallPaymentStatus.value = stall.payment_status || 'Unpaid';
    formStallNotes.value = stall.internal_notes || '';

    stallFormModal.classList.add('active');
  };

  window.deleteStallFromDrawer = async function(stallId, stallNum) {
    if (!confirm(`Delete Stall "${stallNum}"?`)) return;

    try {
      const res = await fetch(`/api/admin/stalls/${stallId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast(`Stall ${stallNum} deleted`, 'success');
        if (selectedPinId) openPinDrawer(selectedPinId);
        await loadPins();
      }
    } catch (e) {
      showToast('Error deleting stall', 'error');
    }
  };

  btnStallFormCancel.addEventListener('click', () => stallFormModal.classList.remove('active'));
  btnStallFormClose.addEventListener('click', () => stallFormModal.classList.remove('active'));

  btnStallFormSave.addEventListener('click', async () => {
    const stallNum = formStallNumber.value.trim();
    const pinId = stallPinIdInput.value || selectedPinId;
    const stallId = stallIdInput.value;

    if (!stallNum || !pinId) {
      showToast('Stall number is required', 'error');
      return;
    }

    const payload = {
      stall_number: stallNum,
      zone_id: Number(pinId),
      company_name: formStallCompany.value.trim(),
      category: formStallCategory.value.trim(),
      public_description: formStallPublicDesc.value.trim(),
      public_visible: formStallPublicVis.checked,
      show_company_name: true,
      show_category: true,
      show_description: true,
      contact_person: formStallContact.value.trim(),
      phone: formStallPhone.value.trim(),
      email: formStallEmail.value.trim(),
      booking_status: formStallBookingStatus.value,
      payment_status: formStallPaymentStatus.value,
      internal_notes: formStallNotes.value.trim()
    };

    btnStallFormSave.disabled = true;
    try {
      const url = stallId ? `/api/admin/stalls/${stallId}` : '/api/admin/stalls';
      const method = stallId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(stallId ? 'Stall updated!' : 'Stall added!', 'success');
        stallFormModal.classList.remove('active');
        if (selectedPinId) openPinDrawer(selectedPinId);
        await loadPins();
      } else {
        showToast(json.error || 'Failed to save stall', 'error');
      }
    } catch (e) {
      showToast('Network error saving stall', 'error');
    } finally {
      btnStallFormSave.disabled = false;
    }
  });

  // =================== 6. MAP UPLOAD ===================
  btnOpenUploadMap.addEventListener('click', () => uploadMapModal.classList.add('active'));
  btnUploadMapClose.addEventListener('click', () => uploadMapModal.classList.remove('active'));
  btnUploadMapCancel.addEventListener('click', () => uploadMapModal.classList.remove('active'));

  btnUploadMapSubmit.addEventListener('click', async () => {
    const name = uploadMapNameInput.value.trim();
    const file = uploadMapFileInput.files[0];
    if (!name || !file) {
      showToast('Please provide a layout title and select a file', 'error');
      return;
    }

    btnUploadMapSubmit.disabled = true;
    btnUploadMapSubmit.textContent = 'Uploading...';

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
        if (!uploadJson.success) throw new Error(uploadJson.error);

        const mapRes = await fetch('/api/admin/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, imageUrl: uploadJson.url })
        });
        const mapJson = await mapRes.json();
        if (mapJson.success) {
          showToast('Floor plan uploaded & set as active map!', 'success');
          uploadMapModal.classList.remove('active');
          uploadMapNameInput.value = '';
          uploadMapFileInput.value = '';
          await loadMapAndPins();
        }
      } catch (err) {
        showToast(err.message || 'Failed to upload map', 'error');
      } finally {
        btnUploadMapSubmit.disabled = false;
        btnUploadMapSubmit.textContent = 'Upload & Set as Map';
      }
    };
    reader.readAsDataURL(file);
  });

  // =================== 7. GLOBAL SEARCH ===================
  let searchDebounce = null;
  publicSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const q = publicSearchInput.value.trim();
      if (!q) {
        document.querySelectorAll('.map-pin-btn').forEach(el => el.classList.remove('highlighted'));
        return;
      }

      try {
        const res = await fetch(`/api/public/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success && json.results.length > 0) {
          const first = json.results[0];
          document.querySelectorAll('.map-pin-btn').forEach(el => el.classList.remove('highlighted'));
          
          const pinEl = document.getElementById(`map-pin-${first.zoneId}`);
          if (pinEl) {
            pinEl.classList.add('highlighted');
            panToCoords(first.coords.x, first.coords.y);
          }
        }
      } catch (e) {}
    }, 250);
  });

  // =================== 8. REAL-TIME SSE SYNC ===================
  function initRealtime() {
    const evtSource = new EventSource('/api/realtime/events');

    evtSource.addEventListener('CONNECTED', () => {
      statusDot.className = 'status-dot online';
      statusText.textContent = 'Live';
    });

    evtSource.addEventListener('ZONE_UPDATED', () => loadPins());
    evtSource.addEventListener('ZONE_CREATED', () => loadPins());
    evtSource.addEventListener('ZONE_DELETED', () => loadPins());
    evtSource.addEventListener('STALL_UPDATED', () => {
      loadPins();
      if (selectedPinId) openPinDrawer(selectedPinId);
    });
    evtSource.addEventListener('STALL_CREATED', () => {
      loadPins();
      if (selectedPinId) openPinDrawer(selectedPinId);
    });
    evtSource.addEventListener('STALL_DELETED', () => {
      loadPins();
      if (selectedPinId) openPinDrawer(selectedPinId);
    });
    evtSource.addEventListener('MAP_CHANGED', (e) => {
      const data = JSON.parse(e.data);
      mapImage.src = data.imageUrl;
      if (eventTitle) eventTitle.textContent = data.name;
      loadPins();
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
  window.addEventListener('DOMContentLoaded', async () => {
    initPanZoom();
    await checkAdminAuth();
    await loadMapAndPins();
    initRealtime();
    window.addEventListener('resize', fitToScreen);
  });
})();
