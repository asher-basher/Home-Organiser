(function () {
    'use strict';

    var appEl = document.getElementById('app');
    var rooms = [];
    var currentStatus = 'Keep';
    var pendingPhoto = '';
    var pendingThumb = '';

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

    // --- Photo processing ---
    function processPhoto(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var img = new Image();
                img.onload = function () {
                    resolve({
                        photo: resizeImg(img, 800, 0.7),
                        thumbnail: resizeImg(img, 200, 0.6)
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function resizeImg(img, maxW, quality) {
        var c = document.createElement('canvas');
        var w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/jpeg', quality);
    }

    // --- Load rooms ---
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
                if (parts[1] === 'new') { renderAdd(); break; }
                if (parts[2] === 'edit') renderEdit(parts[1]);
                else renderDetail(parts[1]);
                break;
            case 'settings': renderSettings(); break;
            default: renderDashboard();
        }
    }

    window.addEventListener('hashchange', route);
    loadRooms().then(route);

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
                '<div class="page-header"><h1>Home Inventory</h1></div>' +
                '<div class="stats-grid">' +
                    '<div class="stat-card"><div class="stat-label">Total Items</div><div class="stat-value primary">' + s.total + '</div></div>' +
                    '<div class="stat-card"><div class="stat-label">To Sell Value</div><div class="stat-value warning">' + (s.total_value ? '$' + s.total_value.toFixed(2) : '$0') + '</div></div>' +
                    '<div class="stat-card"><div class="stat-label">Sold Revenue</div><div class="stat-value success">' + (s.total_sold ? '$' + s.total_sold.toFixed(2) : '$0') + '</div></div>' +
                    '<div class="stat-card"><div class="stat-label">Keeping</div><div class="stat-value">' + (counts['Keep'] || 0) + '</div></div>' +
                '</div>' +
                (statusHtml ? '<div class="card"><div class="card-body">' + statusHtml + '</div></div>' : '') +
                '<div style="padding:16px;text-align:center"><a href="#/add" style="color:var(--primary);font-weight:600;font-size:1rem;text-decoration:none">+ Add your first item</a></div>';
        });
    }

    // --- Items List ---
    var itemFilters = { status: '', room: '', q: '', sort: 'newest' };

    function renderItems() {
        appEl.innerHTML = '<div class="spinner"></div>';
        var qs = '';
        if (itemFilters.q) qs += '&q=' + encodeURIComponent(itemFilters.q);
        if (itemFilters.status) qs += '&status=' + encodeURIComponent(itemFilters.status);
        if (itemFilters.room) qs += '&room=' + itemFilters.room;
        qs += '&sort=' + itemFilters.sort;
        if (qs) qs = '?' + qs.slice(1);

        api('/items' + qs).then(function (items) {
            var filterChips = '<span class="filter-chip' + (!itemFilters.status ? ' active' : '') + '" data-status="">All</span>';
            ['Keep', 'Sell', 'Listed', 'Sold', 'Donated', 'Trash'].forEach(function (s) {
                filterChips += '<span class="filter-chip' + (itemFilters.status === s ? ' active' : '') + '" data-status="' + s + '">' + s + '</span>';
            });

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
                        '</div>' +
                    '</div>' +
                    (item.estimated_value && item.status !== 'Keep' ? '<div class="item-price">' + formatPrice(item.estimated_value) + '</div>' : '') +
                '</div>';
            });

            appEl.innerHTML =
                '<div class="page-header"><h1>Items</h1></div>' +
                '<div class="search-bar"><input type="search" class="search-input" placeholder="Search items..." value="' + esc(itemFilters.q) + '" id="search-input"></div>' +
                '<div class="filter-bar">' + filterChips + '</div>' +
                (items.length
                    ? '<div class="card">' + listHtml + '</div>'
                    : '<div class="empty-state"><p>No items found</p><a href="#/add" style="color:var(--primary);font-weight:600">+ Add Item</a></div>');

            document.querySelectorAll('.filter-chip').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    itemFilters.status = this.dataset.status;
                    renderItems();
                });
            });

            document.querySelectorAll('.item-card').forEach(function (card) {
                card.addEventListener('click', function () {
                    location.hash = '#/item/' + this.dataset.id;
                });
            });

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
        pendingPhoto = '';
        pendingThumb = '';
        currentStatus = 'Keep';

        loadRooms().then(function () {
            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="location.hash=\'#/items\'">&larr;</button>' +
                    '<h1>Add Item</h1>' +
                '</div>' +
                '<div id="camera-section" class="camera-section">' +
                    '<label class="camera-trigger">' +
                        '<input type="file" accept="image/*" capture="environment" id="photo-input">' +
                        '<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/><path d="M2 20a2 2 0 0 1 2-2h5l3-4h12l3 4h5a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" transform="scale(0.85) translate(4,2)"/></svg>' +
                        '<p>Tap to take photo</p>' +
                    '</label>' +
                '</div>' +
                '<div id="form-section" class="hidden">' +
                    '<div class="photo-preview-container">' +
                        '<img id="preview-img" class="photo-preview" alt="">' +
                        '<button class="retake-btn" id="retake-btn">Retake</button>' +
                    '</div>' +
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
                            '<div class="status-toggle">' +
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
                        '<button class="save-btn" id="save-btn">Save Item</button>' +
                    '</div>' +
                '</div>';

            bindAddEvents();
        });
    }

    function bindAddEvents() {
        var photoInput = document.getElementById('photo-input');
        var cameraSection = document.getElementById('camera-section');
        var formSection = document.getElementById('form-section');

        photoInput.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            processPhoto(file).then(function (result) {
                pendingPhoto = result.photo;
                pendingThumb = result.thumbnail;
                document.getElementById('preview-img').src = result.photo;
                cameraSection.classList.add('hidden');
                formSection.classList.remove('hidden');
                document.getElementById('item-name').focus();
            });
        });

        document.getElementById('retake-btn').addEventListener('click', function () {
            pendingPhoto = '';
            pendingThumb = '';
            formSection.classList.add('hidden');
            cameraSection.classList.remove('hidden');
            photoInput.value = '';
        });

        bindStatusToggle();

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
                    estimated_value: document.getElementById('item-value').value || 0,
                    sold_price: document.getElementById('item-sold').value || 0,
                    photo: pendingPhoto,
                    thumbnail: pendingThumb
                }
            }).then(function () {
                toast('Item added!');
                location.hash = '#/items';
            }).catch(function () {
                toast('Failed to save');
                btn.disabled = false;
                btn.textContent = 'Save Item';
            });
        });
    }

    function bindStatusToggle() {
        document.querySelectorAll('.status-toggle .status-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.status-toggle .status-btn').forEach(function (b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                currentStatus = this.dataset.status;

                var sellFields = document.getElementById('sell-fields');
                if (sellFields) {
                    if (currentStatus === 'Sell') {
                        sellFields.classList.add('visible');
                    } else {
                        sellFields.classList.remove('visible');
                    }
                }
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

            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="location.hash=\'#/items\'">&larr;</button>' +
                    '<h1>Details</h1>' +
                '</div>' +
                photoHtml +
                '<div class="detail-header">' +
                    '<div>' +
                        '<div class="detail-name">' + esc(item.name) + '</div>' +
                        statusBadge(item.status) +
                    '</div>' +
                    '<div class="detail-actions">' +
                        '<button onclick="location.hash=\'#/item/' + item.id + '/edit\'">Edit</button>' +
                        '<button class="delete-action" id="delete-btn">Delete</button>' +
                    '</div>' +
                '</div>' +
                '<div class="detail-fields">' +
                    '<div class="detail-row"><span class="detail-row-label">Room</span><span class="detail-row-value">' + (item.room_name || 'None') + '</span></div>' +
                    (item.estimated_value ? '<div class="detail-row"><span class="detail-row-label">Estimated Value</span><span class="detail-row-value">' + formatPrice(item.estimated_value) + '</span></div>' : '') +
                    (item.sold_price ? '<div class="detail-row"><span class="detail-row-label">Sold Price</span><span class="detail-row-value">' + formatPrice(item.sold_price) + '</span></div>' : '') +
                    (item.notes ? '<div class="detail-row"><span class="detail-row-label">Notes</span><span class="detail-row-value">' + esc(item.notes) + '</span></div>' : '') +
                    '<div class="detail-row"><span class="detail-row-label">Added</span><span class="detail-row-value">' + esc(item.created_at || '') + '</span></div>' +
                '</div>' +
                '<div class="quick-status">' +
                    '<div class="quick-status-label">Change Status</div>' +
                    '<div class="status-toggle">' + statusToggle + '</div>' +
                '</div>';

            document.getElementById('delete-btn').addEventListener('click', function () {
                if (confirm('Delete "' + item.name + '"? This cannot be undone.')) {
                    api('/items/' + item.id, { method: 'DELETE' }).then(function () {
                        toast('Item deleted');
                        location.hash = '#/items';
                    });
                }
            });

            document.querySelectorAll('.quick-status .status-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var newStatus = this.dataset.status;
                    api('/items/' + item.id + '/status', {
                        method: 'PATCH',
                        body: { status: newStatus }
                    }).then(function () {
                        document.querySelectorAll('.quick-status .status-btn').forEach(function (b) {
                            b.classList.remove('active');
                        });
                        btn.classList.add('active');
                        toast('Status updated');
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
            var showSell = ['Sell', 'Listed', 'Sold'].indexOf(currentStatus) >= 0;

            var statusToggle = '';
            ['Keep', 'Sell', 'Listed', 'Sold', 'Donated', 'Trash'].forEach(function (s) {
                statusToggle += '<button type="button" class="status-btn' +
                    (currentStatus === s ? ' active' : '') +
                    '" data-status="' + s + '">' + s + '</button>';
            });

            appEl.innerHTML =
                '<div class="page-header">' +
                    '<button class="back-btn" onclick="location.hash=\'#/item/' + id + '\'">&larr;</button>' +
                    '<h1>Edit Item</h1>' +
                '</div>' +
                (pendingPhoto
                    ? '<div class="photo-preview-container"><img class="photo-preview" src="' + pendingPhoto + '" alt=""><button class="retake-btn" id="retake-btn">Change</button></div>'
                    : '<div class="camera-section"><label class="camera-trigger"><input type="file" accept="image/*" capture="environment" id="photo-input"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="24" cy="24" r="8"/><path d="M4 18a2 2 0 0 1 2-2h5l3-4h12l3 4h5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" transform="scale(0.7) translate(10,8)"/></svg><p>Add photo</p></label></div>') +
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
                        '<div class="status-toggle">' + statusToggle + '</div>' +
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
                    '<button class="save-btn" id="save-btn">Update Item</button>' +
                    '<button class="save-btn danger" id="delete-btn" style="margin-top:8px">Delete Item</button>' +
                '</div>';

            var retakeBtn = document.getElementById('retake-btn');
            var editInput = document.getElementById('photo-input-edit');
            var addInput = document.getElementById('photo-input');

            function handlePhotoChange(e) {
                var file = e.target.files[0];
                if (!file) return;
                processPhoto(file).then(function (result) {
                    pendingPhoto = result.photo;
                    pendingThumb = result.thumbnail;
                    renderEdit(id);
                });
            }

            if (retakeBtn) {
                retakeBtn.addEventListener('click', function () { editInput.click(); });
                editInput.addEventListener('change', handlePhotoChange);
            }
            if (addInput) addInput.addEventListener('change', handlePhotoChange);

            bindStatusToggle();

            document.querySelectorAll('.status-toggle .status-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var sellFields = document.getElementById('sell-fields');
                    if (['Sell', 'Listed', 'Sold'].indexOf(this.dataset.status) >= 0) {
                        sellFields.classList.add('visible');
                    } else {
                        sellFields.classList.remove('visible');
                    }
                });
            });

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
                '<div class="page-header"><h1>Settings</h1></div>' +
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
