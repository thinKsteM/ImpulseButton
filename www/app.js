/**
 * App Logic for "Desire Button" (欲ボタン)
 */

// --- IndexedDB Wrapper ---
const DB_NAME = 'yoku_buttons_db';
const DB_VERSION = 2; // Upgraded for stats
const STORE_NAME = 'buttons';
const STATS_STORE = 'stats';

const DB = {
    db: null,
    init: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (e) => {
                console.error("DB Open Error", e);
                reject(e);
            };

            request.onsuccess = (e) => {
                DB.db = e.target.result;
                resolve(DB.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STATS_STORE)) {
                    db.createObjectStore(STATS_STORE, { keyPath: 'key' });
                }
            };
        });
    },
    getAll: () => {
        return new Promise((resolve, reject) => {
            if (!DB.db) return reject("DB not initialized");
            const transaction = DB.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },
    get: (id) => {
        return new Promise((resolve, reject) => {
            if (!DB.db) return reject("DB not initialized");
            const transaction = DB.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    put: (item) => {
        return new Promise((resolve, reject) => {
            if (!DB.db) return reject("DB not initialized");
            const transaction = DB.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(item);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => {
                console.error("DB Put Error", e);
                resolve(false); // Return false on failure
            };
        });
    },
    delete: (id) => {
        return new Promise((resolve, reject) => {
            if (!DB.db) return reject("DB not initialized");
            const transaction = DB.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }
};

// --- Storage Module (Async) ---
const Storage = {
    OLD_KEY: "yoku-buttons", // For migration

    // Check if migration is needed
    migrateIfNeeded: async () => {
        try {
            const raw = localStorage.getItem(Storage.OLD_KEY);
            if (raw) {
                const buttons = JSON.parse(raw);
                if (Array.isArray(buttons) && buttons.length > 0) {
                    console.log(`Migrating ${buttons.length} items from LocalStorage...`);
                    for (const btn of buttons) {
                        await DB.put(btn);
                    }
                    localStorage.removeItem(Storage.OLD_KEY); // Clear old data
                    console.log("Migration complete.");
                }
            }
        } catch (e) {
            console.error("Migration failed", e);
        }
    },

    getButtons: async () => {
        return await DB.getAll();
    },
    addButton: async (input) => {
        const newButton = {
            ...input,
            id: Date.now().toString(),
            createdAt: Date.now(),
            patienceCount: 0,
            desireCount: 0,
        };
        const success = await DB.put(newButton);
        return success ? newButton : null;
    },
    getButton: async (id) => {
        return await DB.get(id);
    },
    updateButton: async (id, input) => {
        const current = await DB.get(id);
        if (current) {
            const updated = { ...current, ...input };
            const success = await DB.put(updated);
            return success ? updated : null;
        }
        return null;
    },
    deleteButton: async (id) => {
        await DB.delete(id);
    },

    // --- Stats Methods ---
    getStats: async () => {
        const pReq = new Promise((resolve) => {
            // We can't use DB.get directly for arbitrary keys easily with current wrapper or maybe we can?
            // The wrapper DB.get is hardcoded to STORE_NAME. We should refactor DB wrapper or just use raw transaction here.
            // Let's extend DB wrapper for generic usage or just do it here.
            // For simplicity, let's add generic support or just do ad-hoc.
            // Actually, DB.get is `store.get(id)`. STORE_NAME is hardcoded.
            // Let's refactor DB wrapper slightly in a separate step or just copy paste logic here.
            // To avoid too big changes, I'll access DB.db directly here.
            if (!DB.db) { resolve({}); return; }
            const tx = DB.db.transaction([STATS_STORE], 'readonly');
            const store = tx.objectStore(STATS_STORE);
            const reqPatience = store.get('patience');
            const reqDesire = store.get('desire');

            let patience = 0;
            let desire = 0;

            // Parallel wait not easy with pure IDB requests callbacks without promises.
            // Let's cascade.
            reqPatience.onsuccess = () => {
                if (reqPatience.result) patience = reqPatience.result.value || 0;
                reqDesire.onsuccess = () => {
                    if (reqDesire.result) desire = reqDesire.result.value || 0;
                    resolve({ patience, desire });
                };
            };
            reqPatience.onerror = () => resolve({ patience: 0, desire: 0 }); // Fallback
        });
        return await pReq;
    },

    incrementStat: async (key) => {
        // key: 'patience' or 'desire'
        if (!DB.db) return;
        const tx = DB.db.transaction([STATS_STORE], 'readwrite');
        const store = tx.objectStore(STATS_STORE);

        return new Promise((resolve) => {
            const reqGet = store.get(key);
            reqGet.onsuccess = () => {
                let current = 0;
                if (reqGet.result) current = reqGet.result.value || 0;
                const newVal = current + 1;
                store.put({ key: key, value: newVal });
                resolve(newVal);
            };
            reqGet.onerror = () => resolve(0);
        });
    },

    incrementButtonStat: async (id, type) => {
        // type: 'patience' or 'desire'
        const button = await Storage.getButton(id);
        if (!button) return;

        const key = type === 'patience' ? 'patienceCount' : 'desireCount';
        button[key] = (button[key] || 0) + 1;

        await Storage.updateButton(id, button);
    },

    // Reset all stats
    resetStats: async () => {
        if (!DB.db) return;

        // Reset global stats
        const tx = DB.db.transaction([STATS_STORE], 'readwrite');
        const store = tx.objectStore(STATS_STORE);

        await new Promise((resolve) => {
            store.put({ key: 'patience', value: 0 });
            store.put({ key: 'desire', value: 0 });
            resolve();
        });

        // Reset all button stats
        const buttons = await Storage.getButtons();
        for (const button of buttons) {
            button.patienceCount = 0;
            button.desireCount = 0;
            await DB.put(button);
        }
    }
};

// State
let currentView = 'home';
let activeButtonId = null;
let isEditMode = false;
let editingButtonId = null;

// DOM Elements
const views = {
    home: document.getElementById('view-home'),
    add: document.getElementById('view-add'),
    buttonImage: document.getElementById('view-button-image'),
    buttonMessage: document.getElementById('view-button-message')
};

const homeContent = document.getElementById('home-content');

// --- Initialization ---
async function initApp() {
    try {
        await DB.init();
        await Storage.migrateIfNeeded();
        // Initial Navi
        navigateTo('home');
    } catch (e) {
        alert("データベースの起動に失敗しました。アプリを再読み込みしてください。");
        console.error(e);
    }
}

// Navigation
async function navigateTo(viewId, data = null) {
    // Hide all views
    Object.values(views).forEach(el => el.classList.add('hidden'));

    // Show target view
    if (views[viewId]) {
        views[viewId].classList.remove('hidden');
        currentView = viewId;
    }

    // View specific logic
    if (viewId === 'home') {
        await renderHome();
        await renderHeaderStats();
    } else if (viewId === 'add') {
        if (data && typeof data === 'string') {
            await loadEditForm(data);
        } else {
            resetAddForm();
        }
    } else if (viewId === 'buttonImage' && data) {
        await setupButtonFlow(data);
    }
}

// Render Home Grid
async function renderHome() {
    try {
        if (!homeContent) {
            alert("Error: homeContent element not found");
            return;
        }

        // Show spinner if needed? For now just wait.
        let buttons = [];
        try {
            buttons = await Storage.getButtons();
        } catch (dbErr) {
            console.error("DB Error", dbErr);
            alert("データの取得に失敗しました: " + dbErr);
            buttons = [];
        }

        homeContent.innerHTML = '';

        // Always create grid
        const grid = document.createElement('div');
        grid.className = 'grid-2';

        // Render existing buttons
        buttons.forEach((btn, index) => {
            const btnEl = document.createElement('button');
            // Use stored color or fallback to index-based cycle
            const colorIndex = (btn.colorIndex !== undefined && btn.colorIndex !== null)
                ? btn.colorIndex
                : (index % 8);
            const colorClass = `color-${colorIndex}`;
            btnEl.className = `card-btn ${colorClass}`;

            // Click handler logic
            btnEl.onclick = (e) => {
                if (isEditMode) {
                    // In edit mode, clicking the main button does nothing
                } else {
                    activeButtonId = btn.id;
                    navigateTo('buttonImage', btn.id);
                }
            };

            let editBadgeHtml = '';
            if (isEditMode) {
                editBadgeHtml = `
                <div class="edit-badge" onclick="handleEditClick(event, '${btn.id}')">✎</div>
                <div class="delete-badge" onclick="handleDeleteClick(event, '${btn.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </div>
            `;
            }

            // Text Only as requested
            btnEl.innerHTML = `
            ${editBadgeHtml}
            <span class="btn-text line-clamp-3">${escapeHtml(btn.name)}</span>
        `;
            grid.appendChild(btnEl);
        });

        // Append "Add Button"
        const addBtnEl = document.createElement('button');
        addBtnEl.className = 'card-btn';
        addBtnEl.style.background = 'rgba(255,255,255,0.1)';
        addBtnEl.style.border = '2px dashed rgba(255,255,255,0.3)';
        addBtnEl.style.boxShadow = 'none';

        addBtnEl.onclick = (e) => {
            if (isEditMode) return; // Do not add in edit mode (bubbles to exit)
            navigateTo('add');
        };
        addBtnEl.innerHTML = `
        <span style="font-size: 3rem; color: rgba(255,255,255,0.5); font-weight: bold;">+</span>
    `;
        grid.appendChild(addBtnEl);

        homeContent.appendChild(grid);
    } catch (e) {
        console.error("renderHome Fatality", e);
        alert("表示エラー: " + e.message);
    }
}

// Stats Renderer
async function renderHeaderStats() {
    const stats = await Storage.getStats();
    const patienceEl = document.getElementById('stat-patience');
    const desireEl = document.getElementById('stat-desire');

    if (patienceEl) patienceEl.textContent = stats.patience;
    if (desireEl) desireEl.textContent = stats.desire;
}

// Handle clicking the edit badge
window.handleEditClick = (e, id) => {
    e.stopPropagation();
    navigateTo('add', id);
};

window.handleDeleteClick = async (e, id) => {
    e.stopPropagation();
    if (confirm("本当にこの欲ボタンを削除しますか？")) {
        await Storage.deleteButton(id);
        await renderHome();
    }
};

// Toggle Edit Mode
document.querySelector('.btn-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    isEditMode = !isEditMode;
    renderHome(); // renderHome is async but here we don't need to await it necessarily as it updates DOM
});

// Reset History Button
document.querySelector('.btn-reset-history').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('本当に全ての履歴をリセットしますか？\n\nこの操作は取り消せません。')) {
        await Storage.resetStats();
        await renderHome();
        await renderHeaderStats();
    }
});

// Exit Edit Mode on outside click
document.addEventListener('click', (e) => {
    if (isEditMode) {
        // If clicking on specific tools, do not exit.
        // check closest for edit-badge or delete-badge
        // also check btn-settings (handled by stopPropagation, but just in case)
        if (e.target.closest('.edit-badge') || e.target.closest('.delete-badge') || e.target.closest('.btn-settings')) {
            return;
        }
        // Otherwise exit edit mode
        isEditMode = false;
        renderHome();
    }
});


// Add/Edit Form Logic
const addForm = document.getElementById('add-form');
const bgInputImage = document.getElementById('input-image');
const imgPreview = document.getElementById('image-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const inputName = document.getElementById('input-name');
const inputMessage = document.getElementById('input-message');
const countName = document.getElementById('count-name');
const countMessage = document.getElementById('count-message');
const formTitle = document.querySelector('#view-add .header-title');

let currentImageBase64 = null;
let selectedColorIndex = 0;
const colorOptions = document.querySelectorAll('.color-option');

function updateColorSelectionUI(index) {
    selectedColorIndex = index;
    colorOptions.forEach(opt => {
        if (parseInt(opt.dataset.color) === index) {
            opt.classList.add('selected');
        } else {
            opt.classList.remove('selected');
        }
    });
}

function resetAddForm() {
    editingButtonId = null;
    formTitle.textContent = "新しい欲ボタンを作成";
    addForm.reset();
    currentImageBase64 = null;
    imgPreview.src = "";
    imgPreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
    countName.textContent = "0";
    countMessage.textContent = "0";
    // Default color to 0 or random? Let's default to 0 for consistency, or random to inspire variety.
    // User probably wants to choose, so default 0 is safe.
    updateColorSelectionUI(0);
    hideErrors();
}

async function loadEditForm(id) {
    editingButtonId = id;
    const button = await Storage.getButton(id); // Async
    if (!button) {
        navigateTo('home');
        return;
    }

    formTitle.textContent = "ボタンを編集";

    inputName.value = button.name;
    inputMessage.value = button.message;
    countName.textContent = button.name.length;
    countMessage.textContent = button.message.length;

    if (button.imageUrl) {
        currentImageBase64 = button.imageUrl;
        imgPreview.src = currentImageBase64;
        imgPreview.classList.remove('hidden');
        uploadPlaceholder.classList.add('hidden');
    } else {
        // Handle case if image missing?
    }


    // Load color
    const loadedColor = (button.colorIndex !== undefined && button.colorIndex !== null) ? button.colorIndex : 0;
    updateColorSelectionUI(loadedColor);

    hideErrors();
}

// Image Compression Helper
function compressImage(file, maxWidth, quality, callback) {
    try {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                try {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxWidth) {
                        if (width > height) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxWidth) / height);
                            height = maxWidth;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    callback(dataUrl);
                } catch (err) {
                    console.error("Compression error:", err);
                    alert("画像の処理中にエラーが発生しました。");
                    // Reset processing state if error occurs inside loop (needs manual reset in caller or callback with error)
                    // For simplicity here, we might need a better error callback pattern, 
                    // but alert + silence is better than crash.
                    // Let's pass null to callback to signal failure.
                    callback(null);
                }
            };
            img.onerror = () => {
                alert("画像の読み込みに失敗しました。");
                callback(null);
            };
            img.src = event.target.result;
        };
        reader.onerror = () => {
            alert("ファイルの読み込みに失敗しました。");
            callback(null);
        };
        reader.readAsDataURL(file);
    } catch (e) {
        console.error("FileReader error:", e);
        alert("予期せぬエラーが発生しました。");
        callback(null);
    }
}

// File Input
let isProcessing = false;
const btnSubmit = addForm.querySelector('button[type="submit"]');

bgInputImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) { // Increased to 20MB
        alert("画像サイズが大きすぎます（20MB以下にしてください）");
        e.target.value = ""; // Clear input
        return;
    }

    // Set Processing State
    isProcessing = true;
    btnSubmit.disabled = true;
    btnSubmit.textContent = "画像処理中...";
    btnSubmit.style.opacity = "0.7";

    uploadPlaceholder.classList.add('hidden');
    imgPreview.classList.add('hidden');
    // Maybe show a spinner or text in placeholder?
    // For now, let's just keep placeholder hidden and maybe show the text in submit button.

    // Compress: Max 600px, 0.6 quality (More aggressive)
    compressImage(file, 600, 0.6, (base64) => {
        isProcessing = false;
        btnSubmit.disabled = false;
        btnSubmit.textContent = "保存";
        btnSubmit.style.opacity = "1";

        if (base64) {
            currentImageBase64 = base64;
            imgPreview.src = currentImageBase64;
            imgPreview.classList.remove('hidden');
        } else {
            // Failed
            uploadPlaceholder.classList.remove('hidden');
            e.target.value = ""; // Reset input
        }
    });
});

inputName.addEventListener('input', (e) => {
    countName.textContent = e.target.value.length;
});

inputMessage.addEventListener('input', (e) => {
    countMessage.textContent = e.target.value.length;
});

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrors();

    if (isProcessing) {
        alert("画像を処理中です。少々お待ちください。");
        return;
    }

    const name = inputName.value.trim();
    const message = inputMessage.value.trim();

    let hasError = false;

    if (!currentImageBase64) {
        showError('image', "画像を選択してください");
        hasError = true;
    }
    if (!name) {
        showError('name', "欲の名前を入力してください");
        hasError = true;
    }
    if (!message) {
        showError('message', "メッセージを入力してください");
        hasError = true;
    }

    if (hasError) return;

    // Show saving indicator?
    btnSubmit.disabled = true;
    btnSubmit.textContent = "保存中...";

    let result = null;

    if (editingButtonId) {
        result = await Storage.updateButton(editingButtonId, {
            name,
            message,
            imageUrl: currentImageBase64,
            colorIndex: selectedColorIndex
        });
    } else {
        result = await Storage.addButton({
            name,
            message,
            imageUrl: currentImageBase64,
            colorIndex: selectedColorIndex
        });
    }

    btnSubmit.disabled = false;
    btnSubmit.textContent = "保存";

    if (!result) {
        alert("保存に失敗しました。");
        return;
    }

    // Success
    isEditMode = false;
    // No need to reset form here as navigateTo('add') does it, but navigateTo('home') doesn't touch it.
    // It's fine.
    navigateTo('home');
});

function showError(field, msg) {
    const el = document.getElementById(`error-${field}`);
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

function hideErrors() {
    document.querySelectorAll('.error-text').forEach(el => el.classList.add('hidden'));
}

// Button Flow Logic
const flowImage = document.getElementById('flow-image');
const flowName = document.getElementById('flow-name');
const flowMessage = document.getElementById('flow-message');

async function setupButtonFlow(id) {
    // Load Button Data
    const button = await Storage.getButton(id); // Use id parameter
    if (!button) {
        navigateTo('home');
        return;
    }

    // Populate Data
    document.getElementById('flow-image').src = button.imageUrl || '';
    document.getElementById('flow-name').textContent = button.name;
    document.getElementById('flow-message').textContent = button.message;

    // Populate Stats
    const pCount = document.getElementById('flow-stat-patience');
    const dCount = document.getElementById('flow-stat-desire');
    // Ensure button.patienceCount/desireCount exist or default to 0
    if (pCount) pCount.textContent = button.patienceCount || 0;
    if (dCount) dCount.textContent = button.desireCount || 0;

    // Reset Flow UI
    views.buttonImage.classList.remove('hidden');
}

// "Tap anywhere" to go next
document.getElementById('view-button-image').addEventListener('click', () => {
    // Transition to Message View
    views.buttonImage.classList.add('hidden');
    views.buttonMessage.classList.remove('hidden');
    currentView = 'buttonMessage';
});

document.getElementById('btn-flow-back').addEventListener('click', () => {
    // Back to Image View
    views.buttonMessage.classList.add('hidden');
    views.buttonImage.classList.remove('hidden');
    currentView = 'buttonImage';
});

// Generic Listeners
// document.getElementById('btn-add-start').addEventListener('click', () => navigateTo('add'));

// Use a loop for nav-back to ensure all elements are covered
const backButtons = document.querySelectorAll('.nav-back');
for (let btn of backButtons) {
    btn.addEventListener('click', () => navigateTo('home'));
}


// Flow actions
document.getElementById('btn-flow-do').addEventListener('click', async () => {
    // "Do it" -> Desire
    await Storage.incrementStat('desire');
    if (activeButtonId) {
        await Storage.incrementButtonStat(activeButtonId, 'desire');
    }
    navigateTo('home');
});
document.getElementById('btn-flow-dont').addEventListener('click', async () => {
    // "Don't do it" -> Patience
    await Storage.incrementStat('patience');
    if (activeButtonId) {
        await Storage.incrementButtonStat(activeButtonId, 'patience');
    }
    navigateTo('home');
});
document.getElementById('btn-flow-home').addEventListener('click', () => navigateTo('home'));

// Helper
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Init
window.navigateTo = navigateTo;
// navigateTo('home'); // Removed direct call, use initApp
initApp();

// Color Selection Listeners
colorOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        const idx = parseInt(opt.dataset.color);
        updateColorSelectionUI(idx);
    });
});
