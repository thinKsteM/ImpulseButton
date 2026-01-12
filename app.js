/**
 * App Logic for "Desire Button" (欲ボタン)
 */

// Storage Module
const Storage = {
    KEY: "yoku-buttons",
    getButtons: () => {
        try {
            const data = localStorage.getItem(Storage.KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },
    saveButtons: (buttons) => {
        try {
            localStorage.setItem(Storage.KEY, JSON.stringify(buttons));
        } catch (e) {
            console.error("Failed to save buttons", e);
        }
    },
    addButton: (input) => {
        const buttons = Storage.getButtons();
        const newButton = {
            ...input,
            id: Date.now().toString(),
            createdAt: Date.now(),
        };
        buttons.push(newButton);
        Storage.saveButtons(buttons);
        return newButton;
    },
    getButton: (id) => {
        const buttons = Storage.getButtons();
        return buttons.find(b => b.id === id);
    },
    updateButton: (id, input) => {
        const buttons = Storage.getButtons();
        const index = buttons.findIndex(b => b.id === id);
        if (index !== -1) {
            buttons[index] = { ...buttons[index], ...input };
            Storage.saveButtons(buttons);
            return buttons[index];
        }
        return null;
    },
    deleteButton: (id) => {
        const buttons = Storage.getButtons();
        const filtered = buttons.filter(b => b.id !== id);
        Storage.saveButtons(filtered);
    }
};

// State
let currentView = 'home';
let activeButtonId = null;
let isEditMode = false;
let editingButtonId = null; // For the form

// DOM Elements
const views = {
    home: document.getElementById('view-home'),
    add: document.getElementById('view-add'),
    buttonImage: document.getElementById('view-button-image'),
    buttonMessage: document.getElementById('view-button-message')
};

const homeContent = document.getElementById('home-content');

// Navigation
function navigateTo(viewId, data = null) {
    // Hide all views
    Object.values(views).forEach(el => el.classList.add('hidden'));

    // Show target view
    if (views[viewId]) {
        views[viewId].classList.remove('hidden');
        currentView = viewId;
    }

    // View specific logic
    if (viewId === 'home') {
        renderHome();
    } else if (viewId === 'add') {
        // data can be ID for editing
        if (data && typeof data === 'string') {
            loadEditForm(data);
        } else {
            resetAddForm();
        }
    } else if (viewId === 'buttonImage' && data) {
        setupButtonFlow(data);
    }
}

// Render Home Grid
function renderHome() {
    const buttons = Storage.getButtons();
    homeContent.innerHTML = '';

    // Always create grid
    const grid = document.createElement('div');
    grid.className = 'grid-2';

    // Render existing buttons
    buttons.forEach((btn, index) => {
        const btnEl = document.createElement('button');
        // Cycle through color-0 to color-7
        const colorClass = `color-${index % 8}`;
        btnEl.className = `card-btn ${colorClass}`;

        // Click handler logic
        btnEl.onclick = (e) => {
            if (isEditMode) {
                // In edit mode, clicking the main button does nothing or handles delete?
                // Requirement says "Edit Badge" handles edit. 
            } else {
                activeButtonId = btn.id;
                navigateTo('buttonImage', btn.id);
            }
        };

        let editBadgeHtml = '';
        if (isEditMode) {
            editBadgeHtml = `<div class="edit-badge" onclick="handleEditClick(event, '${btn.id}')">✎</div>`;
        }

        // Text Only as requested
        btnEl.innerHTML = `
            ${editBadgeHtml}
            <span class="btn-text line-clamp-3">${escapeHtml(btn.name)}</span>
        `;
        grid.appendChild(btnEl);
    });

    // Append "Add Button" as the next item
    // Only if we want to allow adding more? Assuming yes.
    // Style it distinctively
    const addBtnEl = document.createElement('button');
    addBtnEl.className = 'card-btn';
    addBtnEl.style.background = 'rgba(255,255,255,0.1)';
    addBtnEl.style.border = '2px dashed rgba(255,255,255,0.3)';
    addBtnEl.style.boxShadow = 'none'; // Flat for add button? Or keep consistent? 
    // Let's keep it consistent shape but different style

    addBtnEl.onclick = () => navigateTo('add');
    addBtnEl.innerHTML = `
        <span style="font-size: 3rem; color: rgba(255,255,255,0.5); font-weight: bold;">+</span>
    `;
    grid.appendChild(addBtnEl);

    homeContent.appendChild(grid);
}

// Handle clicking the edit badge
window.handleEditClick = (e, id) => {
    e.stopPropagation(); // Prevent main button click
    navigateTo('add', id);
};

// Toggle Edit Mode
document.querySelector('.btn-settings').addEventListener('click', () => {
    isEditMode = !isEditMode;
    renderHome();
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
const formTitle = document.querySelector('#view-add .header-title'); // To change title

let currentImageBase64 = null;

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
    hideErrors();
}

function loadEditForm(id) {
    editingButtonId = id;
    const button = Storage.getButton(id);
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
    hideErrors();
}

bgInputImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("画像は5MB以下にしてください");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageBase64 = event.target.result;
        imgPreview.src = currentImageBase64;
        imgPreview.classList.remove('hidden');
        uploadPlaceholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
});

inputName.addEventListener('input', (e) => {
    countName.textContent = e.target.value.length;
});

inputMessage.addEventListener('input', (e) => {
    countMessage.textContent = e.target.value.length;
});

addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideErrors();

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

    if (editingButtonId) {
        Storage.updateButton(editingButtonId, {
            name,
            message,
            imageUrl: currentImageBase64
        });
    } else {
        Storage.addButton({
            name,
            message,
            imageUrl: currentImageBase64
        });
    }

    // Reset edit mode when going back home? Or keep it?
    // Usually keep it, but user can toggle off.
    isEditMode = false;
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

function setupButtonFlow(id) {
    const button = Storage.getButton(id);
    if (!button) {
        navigateTo('home');
        return;
    }

    activeButtonId = id;

    // Setup Image View
    flowImage.src = button.imageUrl;

    // Setup Message View
    flowName.textContent = button.name;
    flowMessage.textContent = button.message;
}

document.getElementById('btn-flow-next').addEventListener('click', () => {
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
document.getElementById('btn-flow-do').addEventListener('click', () => {
    // "Do it" -> Go back home? Or delete logic? For now just home.
    navigateTo('home');
});
document.getElementById('btn-flow-dont').addEventListener('click', () => {
    // "Don't do it" -> Go back home
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

// Init - expose to global for debugging if needed
window.navigateTo = navigateTo;
navigateTo('home');
