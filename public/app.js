(function () {
    'use strict';

    var appEl = document.getElementById('app');
    var rooms = [];
    var currentStatus = 'Keep';
    var currentPriority = 'Low';
    var pendingPhoto = '';
    var pendingThumb = '';
    var globalInput = document.getElementById('global-photo-input');

    // --- + button opens camera directly ---
    document.getElementById('add-btn').addEventListener('click', function () {
        globalInput.click();
    });

    globalInput.addEventListener('change', function () {
        var file = this.files[0];
        var input = this;
        if (!file) return;
        processPhoto(file).then(function (result) {
            pendingPhoto = result.photo;
            pendingThumb = result.thumbnail;
            input.value = '';
            location.hash = '#/add';
            if (location.hash === '#/add') renderAdd();
        });
    });

    // --- API ---
    function api(path, opts) {
        opts = opts || {};
        var headers = { 'Content-Type': 'application/json' };
        if (opts.body) opts.body = JSON.stringify(opts.body);
        opts.headers = headers;
        return fetch('/api' + path, opts).then(function (r) {
            if (!r.ok) throw new Error('Request failed');
            return r.json();
        });
    }

    // --- Toast ---
    function toast(msg) {
        var el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { el.classList.add('show'); });
        });
        setTimeout(function () {
            el.classList.remove('show');
            setTimeout(function () { el.remove(); }, 300);
        }, 2000);
    }

    // --- Photo processing (handles EXIF orientation) ---
    function processPhoto(file) {
        return createImageBitmap(file).then(function (bitmap) {
            var result = {
                photo: resizeImg(bitmap, 800, 0.7),
                thumbnail: resizeImg(bitmap, 200, 0.6)
            };
            bitmap.close();
            return result;
        });
    }

    function resizeImg(source, maxW, quality) {
        var c = document.createElement('canvas');
        var w = source.width, h = source.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(source, 0, 0, w, h);
        return c.toDataURL('image/jpeg', quality);
    }

    // --- Rooms ---
    function loadRooms() {
        return api('/rooms').then(function (data) { rooms = data; });
    }

    function roomOptions(selectedId) {
        var html = '<option value="">No room</option>';
        rooms.forEach(function (r) {
            html += '<option value="' + r.id + '"' +
                (selectedId && r.id == selectedId ? ' selected' : '') +
                '>' + esc(r.name) + '</option>';
        });
        return html;
    }

    function esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function statusBadge(status) {
        return '<span class="badge badge-' + status.toLowerCase().replace(' ', '-') +
            '">' + esc(status) + '</span>';
    }

    function priorityBadge(priority) {
        if (!priority) return '';
        return '<span class="badge badge-' + priority.toLowerCase() + '">' + esc(priority) + '</span>';
    }

    function formatPrice(v) {
        v = parseFloat(v);
        if (!v) return '';
        return '$' + v.toFixed(2);
    }

    // --- Router ---
    function route() {
        var hash = location.hash || '#/';
        var parts = hash.slice(2).split('/');
        var page = parts[0] || 'dashboard';

        document.querySelectorAll('.nav-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.page === page ||
                (page === 'dashboard' && el.dataset.page === 'dashboard') ||
                (page === 'item' && el.dataset.page === 'items'));
        });

        switch (page) {
            case 'dashboard': renderDashboard(); break;
            case 'items': renderItems(); break;
            case 'add': renderAdd(); break;
            case 'item':
                if (parts[2] === 'edit') renderEdit(parts[1]);
                else renderDetail(parts[1]);
                break;
            case 'settings': renderSettings(); break;
            default: renderDashboard();
        }
    }

    window.addEventListener('hashchange', route);
    loadRooms().then(route);

    // --- Settings gear icon ---
    function settingsBtn() {
        return '<button class="header-action" onclick="location.hash=\'#/settings\'" title="Settings">' +
            '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="3"/><path d="M19.4 14a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 14a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
            '</button>';
    }

    // --- Dashboard ---
    function renderDashboard() {
        appEl.innerHTML = '<div class="spinner"></div>';
        api('/stats').then(function (s) {
            var statusHtml = '';
            var order = ['Keep', 'Sell', 'Listed', 'Sold', 'Donated', 'Trash'];
            var counts = {};
            (s.by_status || []).forEach(function (r) { counts[r.status] = r.count; });
            order.forEach(function (st) {
                if (counts[st]) {
                    statusHtml += '<div class="status-row">' +
                        statusBadge(st) +
                        '<span>' + counts[st] + '</span></div>';
                }
            });

            appEl.innerHTML =
                '<div class="page-header"><h1>Home Inventory</h1>' + settingsBtn() + '</div>' +
                '<div class="stats-grid">' +
                    '<div class="stat-card"><div class="stat-label">Total Items</div><div class="stat-value primary">' + s.total + '</div></div>' +
                    '<div class="stat-card"><div class="stat-label">To Sell Value</div><div class="stat-value warning">' + (s.total_value ? '$' + s.total_value.toFixed(2) : '$0') + '</div></div>' +
                    '<div class="stat-card"><div class="stat-label">Sold Revenue</div><div class="stat-value success">' + (s.total_sold ? '$' + s.total_sold.toFixed(2) : '$0') + '</div></div>' +
                    '<div class="stat-card"><div class="stat-label">Keeping</div><div class="stat-value">' + (counts['Keep'] || 0) + '</div></div>' +
                '</div>' +
                (statusHtml ? '<div class="card"><div class="card-body">' + statusHtml + '</div></div>' : '');
        });
    }

    // --- Items List ---
    var itemFilters = { status: '', room: '', q: '', sort: 'newest', priority: '' };

    function renderItems() {
        appEl.innerHTML = '<div class="spinner"></div>';
        var qs = '';
        if (itemFilters.q) qs += '&q=' + encodeURIComponent(itemFilters.q);
        if (itemFilters.status) qs += '&status=' + encodeURIComponent(itemFilters.status);
        if (itemFilters.room) qs += '&room=' + itemFilters.room;
        if (itemFilters.priority) qs += '&priority=' + itemFilters.priority;
        qs += '&sort=' + itemFilters.sort;
        if (qs) qs = '?' + qs.slice(1);

        api('/items' + qs).then(function (items) {
            var statusChips = '<span class="filter-chip' + (!itemFilters.status ? ' active' : '') + '" data-filter="status" data-val="">All</span>';
            ['Keep', 'Sell', 'Listed', 'Sold'].forEach(function (s) {
                statusChips += '<span class="filter-chip' + (itemFilters.status === s ? ' active' : '') + '" data-filter="status" data-val="' + s + '">' + s + '</span>';
            });

            var priorityChips = '<span class="filter-chip' + (!itemFilters.priority ? ' active' : '') + '" data-filter="priority" data-val="">All</span>';
            ['High', 'Med', 'Low'].forEach(function (p) {
                priorityChips += '<span class="filter-chip' + (itemFilters.priority === p ? ' active' : '') + '" data-filter="priority" data-val="' + p + '">' + p + '</span>';
            });

            var sortSelect = '<select class="form-select" id="sort-select" style="max-width:180px;padding:6px 10px;font-size:0.85rem">' +
                '<option value="newest"' + (itemFilters.sort === 'newest' ? ' selected' : '') + '>Newest</option>' +
                '<option value="oldest"' + (itemFilters.sort === 'oldest' ? ' selected' : '') + '>Oldest</option>' +
                '<option value="name"' + (itemFilters.sort === 'name' ? ' selected' : '') + '>Name</option>' +
                '<option value="price"' + (itemFilters.sort === 'price' ? ' selected' : '') + '>Price</option>' +
                '<option value="priority"' + (itemFilters.sort === 'priority' ? ' selected' : '') + '>Priority</option>' +
                '</select>';

            var listHtml = '';
            items.forEach(function (item) {
                var thumb = item.thumbnail
                    ? '<img class="item-thumb" src="' + item.thumbnail + '" alt="">'
                    : '<div class="item-thumb-placeholder"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="16" height="16" rx="2"/><circle cx="7" cy="7" r="1.5"/><path d="M2 13l4-4 3 3 3-3 6 6"/></svg></div>';

                listHtml += '<div class="item-card" data-id="' + item.id + '">' +
                    thumb +
                    '<div class="item-info">' +
                        '<div class="item-name">' + esc(item.name) + '</div>' +
                        '<div class="item-meta">' +
                            (item.room_name ? esc(item.room_name) : 'No room') +
                            ' &middot; ' + statusBadge(item.status) +
                            (item.priority ? ' ' + priorityBadge(item.priority) : '') +
                        '</div>' +
                    '</div>' +
                    (item.estimated_value && item.status !== 'Keep' ? '<div class="item-price">' + formatPrice(item.estimated_value) + '</div>' : '') +
                '</div>';
            });

            appEl.innerHTML =
                '<div class="page-header"><h1>Items</h1>' + settingsBtn() + '</div>' +
                '<div class="search-bar"><input type="search" class="search-input" placeholder="Search items..." value="' + esc(itemFilters.q) + '" id="search-input"></div>' +
                '<div class="filter-bar" style="padding-bottom:0"><small style="color:var(--text-light);margin-right:4px;flex-shrink:0">Status:</small>' + statusChips + '</div>' +
                '<div class="filter-bar"><small style="color:var(--text-light);margin-right:4px;flex-shrink:0">Priority:</small>' + priorityChips + '<span style="margin-left:auto;flex-shrink:0">' + sortSelect + '</span></div>' +
                '<p style="padding:0 16px;font-size:0.82rem;color:var(--text-light)">' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</p>' +
                (items.length
                    ? '<div class="items-grid"><div class="card" style="margin:0">' + listHtml + '</div></div>'
                    : '<div class="empty-state"><p>No items found</p></div>');

            document.querySelectorAll('.filter-chip').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    itemFilters[this.dataset.filter] = this.dataset.val;
                    renderItems();
                });
            });

            document.querySelectorAll('.item-card').forEach(function (card) {
                card.addEventListener('click', function () {
                    location.hash = '#/item/' + this.dataset.id;
                });
            });

            var sortSel = document.getElementById('sort-select');
            if (sortSel) {
                sortSel.addEventListener('change', function () {
                    itemFilters.sort = this.value;
                    renderItems();
                });
            }

            var searchTimeout;
            var searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', function () {
                    var val = this.value;
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(function () {
                        itemFilters.q = val;
                        renderItems();
                    }, 300);
                });
            }
        });
    }

    // --- Add Item ---
    function renderAdd() {
        currentStatus = 'Keep';
        currentPriority = 'Low';

        loadRooms().then(function () {
            var hasPhoto = !!pendingPhoto;

            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="location.hash=\'#/items\'">&larr;</button>' +
                    '<h1>Add Item</h1>' +
                '</div>' +
                (hasPhoto
                    ? '<div class="photo-preview-container">' +
                        '<img id="preview-img" class="photo-preview" src="' + pendingPhoto + '" alt="">' +
                        '<button class="retake-btn" id="retake-btn">Retake</button>' +
                      '</div>'
                    : '<div class="camera-section">' +
                        '<label class="camera-trigger">' +
                            '<input type="file" accept="image/*" capture="environment" id="photo-input-fallback">' +
                            '<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="24" cy="26" r="6"/><path d="M6 18a2 2 0 0 1 2-2h5l3-4h12l3 4h5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/></svg>' +
                            '<p>Tap to take photo</p>' +
                        '</label>' +
                      '</div>') +
                '<div class="form-section">' +
                    '<div class="form-group">' +
                        '<input type="text" class="form-input form-input-lg" id="item-name" placeholder="Item name" autocomplete="off">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Room</label>' +
                        '<select class="form-select" id="item-room">' + roomOptions() + '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Notes</label>' +
                        '<textarea class="form-textarea" id="item-notes" placeholder="Optional notes..." rows="2"></textarea>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Status</label>' +
                        '<div class="status-toggle" id="status-toggle">' +
                            '<button type="button" class="status-btn active" data-status="Keep">Keep</button>' +
                            '<button type="button" class="status-btn" data-status="Sell">Sell</button>' +
                            '<button type="button" class="status-btn" data-status="Donate">Donate</button>' +
                            '<button type="button" class="status-btn" data-status="Trash">Trash</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sell-fields" id="sell-fields">' +
                        '<div class="sell-fields-inner">' +
                            '<div class="form-group">' +
                                '<label class="form-label">Estimated Value</label>' +
                                '<input type="number" class="form-input" id="item-value" placeholder="$0.00" step="0.01" min="0" inputmode="decimal">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label class="form-label">Sold Price</label>' +
                                '<input type="number" class="form-input" id="item-sold" placeholder="$0.00" step="0.01" min="0" inputmode="decimal">' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Sell Priority</label>' +
                        '<div class="priority-toggle" id="priority-toggle">' +
                            '<button type="button" class="priority-btn" data-priority="High">High</button>' +
                            '<button type="button" class="priority-btn" data-priority="Med">Med</button>' +
                            '<button type="button" class="priority-btn active" data-priority="Low">Low</button>' +
                        '</div>' +
                    '</div>' +
                    '<button class="save-btn" id="save-btn">Save Item</button>' +
                '</div>';

            if (hasPhoto) {
                document.getElementById('item-name').focus();
            }

            var retakeBtn = document.getElementById('retake-btn');
            if (retakeBtn) {
                retakeBtn.addEventListener('click', function () {
                    globalInput.click();
                });
            }

            var fallbackInput = document.getElementById('photo-input-fallback');
            if (fallbackInput) {
                fallbackInput.addEventListener('change', function () {
                    var file = this.files[0];
                    if (!file) return;
                    processPhoto(file).then(function (result) {
                        pendingPhoto = result.photo;
                        pendingThumb = result.thumbnail;
                        renderAdd();
                    });
                });
            }

            bindStatusToggle('status-toggle', function (val) { currentStatus = val; });
            bindPriorityToggle();

            document.getElementById('save-btn').addEventListener('click', function () {
                var name = document.getElementById('item-name').value.trim();
                if (!name) {
                    document.getElementById('item-name').focus();
                    toast('Please enter a name');
                    return;
                }

                var btn = this;
                btn.disabled = true;
                btn.textContent = 'Saving...';

                var status = currentStatus === 'Donate' ? 'Donated' : currentStatus;

                api('/items', {
                    method: 'POST',
                    body: {
                        name: name,
                        room_id: document.getElementById('item-room').value || null,
                        notes: document.getElementById('item-notes').value,
                        status: status,
                        priority: currentPriority,
                        estimated_value: document.getElementById('item-value').value || 0,
                        sold_price: document.getElementById('item-sold').value || 0,
                        photo: pendingPhoto,
                        thumbnail: pendingThumb
                    }
                }).then(function () {
                    pendingPhoto = '';
                    pendingThumb = '';
                    toast('Item added!');
                    location.hash = '#/items';
                }).catch(function () {
                    toast('Failed to save');
                    btn.disabled = false;
                    btn.textContent = 'Save Item';
                });
            });
        });
    }

    function bindStatusToggle(containerId, callback) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.status-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                container.querySelectorAll('.status-btn').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                callback(this.dataset.status);

                var sellFields = document.getElementById('sell-fields');
                if (sellFields) {
                    sellFields.classList.toggle('visible', this.dataset.status === 'Sell');
                }
            });
        });
    }

    function bindPriorityToggle() {
        var container = document.getElementById('priority-toggle');
        if (!container) return;
        container.querySelectorAll('.priority-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                container.querySelectorAll('.priority-btn').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                currentPriority = this.dataset.priority;
            });
        });
    }

    // --- Item Detail ---
    function renderDetail(id) {
        appEl.innerHTML = '<div class="spinner"></div>';
        api('/items/' + id).then(function (item) {
            var photoHtml = item.photo
                ? '<img class="detail-photo" src="' + item.photo + '" alt="' + esc(item.name) + '">'
                : '';

            var statusToggle = '';
            ['Keep', 'Sell', 'Listed', 'Sold', 'Donated', 'Trash'].forEach(function (s) {
                statusToggle += '<button type="button" class="status-btn' +
                    (item.status === s ? ' active' : '') +
                    '" data-status="' + s + '">' + s + '</button>';
            });

            var priorityToggle = '';
            ['High', 'Med', 'Low'].forEach(function (p) {
                priorityToggle += '<button type="button" class="priority-btn' +
                    ((item.priority || 'Low') === p ? ' active' : '') +
                    '" data-priority="' + p + '">' + p + '</button>';
            });

            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="location.hash=\'#/items\'">&larr;</button>' +
                    '<h1>Details</h1>' +
                '</div>' +
                photoHtml +
                '<div class="detail-header">' +
                    '<div>' +
                        '<div class="detail-name">' + esc(item.name) + '</div>' +
                        '<div class="detail-badges">' + statusBadge(item.status) + ' ' + priorityBadge(item.priority) + '</div>' +
                    '</div>' +
                    '<div class="detail-actions">' +
                        '<button onclick="location.hash=\'#/item/' + item.id + '/edit\'">Edit</button>' +
                        '<button class="delete-action" id="delete-btn">Delete</button>' +
                    '</div>' +
                '</div>' +
                '<div class="detail-fields">' +
                    '<div class="detail-row"><span class="detail-row-label">Room</span><span class="detail-row-value">' + (item.room_name || 'None') + '</span></div>' +
                    '<div class="detail-row"><span class="detail-row-label">Priority</span><span class="detail-row-value">' + priorityBadge(item.priority || 'Low') + '</span></div>' +
                    (item.estimated_value ? '<div class="detail-row"><span class="detail-row-label">Estimated Value</span><span class="detail-row-value">' + formatPrice(item.estimated_value) + '</span></div>' : '') +
                    (item.sold_price ? '<div class="detail-row"><span class="detail-row-label">Sold Price</span><span class="detail-row-value">' + formatPrice(item.sold_price) + '</span></div>' : '') +
                    (item.notes ? '<div class="detail-row"><span class="detail-row-label">Notes</span><span class="detail-row-value">' + esc(item.notes) + '</span></div>' : '') +
                    '<div class="detail-row"><span class="detail-row-label">Added</span><span class="detail-row-value">' + esc(item.created_at || '') + '</span></div>' +
                '</div>' +
                '<div class="quick-status">' +
                    '<div class="quick-status-label">Status</div>' +
                    '<div class="status-toggle" id="detail-status">' + statusToggle + '</div>' +
                '</div>' +
                '<div class="quick-status" style="padding-bottom:24px">' +
                    '<div class="quick-status-label">Priority</div>' +
                    '<div class="priority-toggle" id="detail-priority">' + priorityToggle + '</div>' +
                '</div>';

            document.getElementById('delete-btn').addEventListener('click', function () {
                if (confirm('Delete "' + item.name + '"? This cannot be undone.')) {
                    api('/items/' + item.id, { method: 'DELETE' }).then(function () {
                        toast('Item deleted');
                        location.hash = '#/items';
                    });
                }
            });

            document.querySelectorAll('#detail-status .status-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var newStatus = this.dataset.status;
                    api('/items/' + item.id + '/status', {
                        method: 'PATCH',
                        body: { status: newStatus }
                    }).then(function () {
                        document.querySelectorAll('#detail-status .status-btn').forEach(function (b) { b.classList.remove('active'); });
                        btn.classList.add('active');
                        toast('Status updated');
                    });
                });
            });

            document.querySelectorAll('#detail-priority .priority-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var newPriority = this.dataset.priority;
                    api('/items/' + item.id, {
                        method: 'PUT',
                        body: {
                            name: item.name,
                            room_id: item.room_id,
                            notes: item.notes,
                            status: item.status,
                            priority: newPriority,
                            estimated_value: item.estimated_value,
                            sold_price: item.sold_price,
                            photo: item.photo,
                            thumbnail: item.thumbnail
                        }
                    }).then(function () {
                        document.querySelectorAll('#detail-priority .priority-btn').forEach(function (b) { b.classList.remove('active'); });
                        btn.classList.add('active');
                        item.priority = newPriority;
                        toast('Priority updated');
                    });
                });
            });
        });
    }

    // --- Edit Item ---
    function renderEdit(id) {
        appEl.innerHTML = '<div class="spinner"></div>';
        Promise.all([api('/items/' + id), loadRooms()]).then(function (results) {
            var item = results[0];
            pendingPhoto = item.photo || '';
            pendingThumb = item.thumbnail || '';
            currentStatus = item.status || 'Keep';
            currentPriority = item.priority || 'Low';
            var showSell = ['Sell', 'Listed', 'Sold'].indexOf(currentStatus) >= 0;

            var statusToggle = '';
            ['Keep', 'Sell', 'Listed', 'Sold', 'Donated', 'Trash'].forEach(function (s) {
                statusToggle += '<button type="button" class="status-btn' +
                    (currentStatus === s ? ' active' : '') +
                    '" data-status="' + s + '">' + s + '</button>';
            });

            var priorityToggle = '';
            ['High', 'Med', 'Low'].forEach(function (p) {
                priorityToggle += '<button type="button" class="priority-btn' +
                    (currentPriority === p ? ' active' : '') +
                    '" data-priority="' + p + '">' + p + '</button>';
            });

            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="location.hash=\'#/item/' + id + '\'">&larr;</button>' +
                    '<h1>Edit Item</h1>' +
                '</div>' +
                (pendingPhoto
                    ? '<div class="photo-preview-container"><img class="photo-preview" src="' + pendingPhoto + '" alt=""><button class="retake-btn" id="retake-btn">Change</button></div>'
                    : '<div class="camera-section"><label class="camera-trigger"><input type="file" accept="image/*" capture="environment" id="photo-input-edit-fallback"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="24" cy="26" r="6"/><path d="M6 18a2 2 0 0 1 2-2h5l3-4h12l3 4h5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/></svg><p>Add photo</p></label></div>') +
                '<input type="file" accept="image/*" capture="environment" id="photo-input-edit" class="hidden">' +
                '<div class="form-section">' +
                    '<div class="form-group">' +
                        '<input type="text" class="form-input form-input-lg" id="item-name" value="' + esc(item.name) + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Room</label>' +
                        '<select class="form-select" id="item-room">' + roomOptions(item.room_id) + '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Notes</label>' +
                        '<textarea class="form-textarea" id="item-notes" rows="2">' + esc(item.notes) + '</textarea>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Status</label>' +
                        '<div class="status-toggle" id="status-toggle">' + statusToggle + '</div>' +
                    '</div>' +
                    '<div class="sell-fields' + (showSell ? ' visible' : '') + '" id="sell-fields">' +
                        '<div class="sell-fields-inner">' +
                            '<div class="form-group">' +
                                '<label class="form-label">Estimated Value</label>' +
                                '<input type="number" class="form-input" id="item-value" value="' + (item.estimated_value || '') + '" step="0.01" min="0" inputmode="decimal">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label class="form-label">Sold Price</label>' +
                                '<input type="number" class="form-input" id="item-sold" value="' + (item.sold_price || '') + '" step="0.01" min="0" inputmode="decimal">' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Sell Priority</label>' +
                        '<div class="priority-toggle" id="priority-toggle">' + priorityToggle + '</div>' +
                    '</div>' +
                    '<button class="save-btn" id="save-btn">Update Item</button>' +
                    '<button class="save-btn danger" id="delete-btn" style="margin-top:8px">Delete Item</button>' +
                '</div>';

            function handlePhotoChange(e) {
                var file = e.target.files[0];
                if (!file) return;
                processPhoto(file).then(function (result) {
                    pendingPhoto = result.photo;
                    pendingThumb = result.thumbnail;
                    renderEdit(id);
                });
            }

            var retakeBtn = document.getElementById('retake-btn');
            var editInput = document.getElementById('photo-input-edit');
            var fallbackInput = document.getElementById('photo-input-edit-fallback');

            if (retakeBtn) {
                retakeBtn.addEventListener('click', function () { editInput.click(); });
                editInput.addEventListener('change', handlePhotoChange);
            }
            if (fallbackInput) fallbackInput.addEventListener('change', handlePhotoChange);

            bindStatusToggle('status-toggle', function (val) {
                currentStatus = val;
                var sellFields = document.getElementById('sell-fields');
                if (sellFields) {
                    sellFields.classList.toggle('visible', ['Sell', 'Listed', 'Sold'].indexOf(val) >= 0);
                }
            });
            bindPriorityToggle();

            document.getElementById('save-btn').addEventListener('click', function () {
                var name = document.getElementById('item-name').value.trim();
                if (!name) { toast('Please enter a name'); return; }

                var btn = this;
                btn.disabled = true;
                btn.textContent = 'Saving...';

                api('/items/' + id, {
                    method: 'PUT',
                    body: {
                        name: name,
                        room_id: document.getElementById('item-room').value || null,
                        notes: document.getElementById('item-notes').value,
                        status: currentStatus,
                        priority: currentPriority,
                        estimated_value: document.getElementById('item-value').value || 0,
                        sold_price: document.getElementById('item-sold').value || 0,
                        photo: pendingPhoto,
                        thumbnail: pendingThumb
                    }
                }).then(function () {
                    toast('Item updated!');
                    location.hash = '#/item/' + id;
                }).catch(function () {
                    toast('Failed to save');
                    btn.disabled = false;
                    btn.textContent = 'Update Item';
                });
            });

            document.getElementById('delete-btn').addEventListener('click', function () {
                if (confirm('Delete "' + item.name + '"?')) {
                    api('/items/' + id, { method: 'DELETE' }).then(function () {
                        toast('Deleted');
                        location.hash = '#/items';
                    });
                }
            });
        });
    }

    // --- Settings ---
    function renderSettings() {
        appEl.innerHTML = '<div class="spinner"></div>';
        api('/rooms').then(function (roomList) {
            var roomsHtml = '';
            roomList.forEach(function (r) {
                roomsHtml += '<div class="room-item">' +
                    '<span>' + esc(r.name) + '</span>' +
                    '<div>' +
                        '<span class="room-count">' + (r.item_count || 0) + ' items</span>' +
                        (r.item_count === 0 ? '<button class="delete-room-btn" data-id="' + r.id + '">Delete</button>' : '') +
                    '</div>' +
                '</div>';
            });

            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="history.back()">&larr;</button>' +
                    '<h1>Settings</h1>' +
                '</div>' +
                '<div class="settings-section">' +
                    '<h2>Rooms</h2>' +
                    (roomsHtml || '<p style="color:var(--text-light);padding:12px 0">No rooms yet</p>') +
                    '<div class="add-room-form">' +
                        '<input type="text" id="new-room" placeholder="New room name...">' +
                        '<button id="add-room-btn">Add</button>' +
                    '</div>' +
                '</div>';

            document.getElementById('add-room-btn').addEventListener('click', function () {
                var input = document.getElementById('new-room');
                var name = input.value.trim();
                if (!name) return;
                api('/rooms', { method: 'POST', body: { name: name } }).then(function () {
                    toast('Room added');
                    loadRooms().then(renderSettings);
                }).catch(function () { toast('Room already exists'); });
            });

            document.querySelectorAll('.delete-room-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (confirm('Delete this room?')) {
                        api('/rooms/' + this.dataset.id, { method: 'DELETE' }).then(function () {
                            toast('Room deleted');
                            loadRooms().then(renderSettings);
                        });
                    }
                });
            });
        });
    }
})();
