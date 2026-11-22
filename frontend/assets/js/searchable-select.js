/**
 * searchable-select.js - Bộ chọn có ô tìm kiếm dùng chung (bộ lọc thẻ/danh mục,
 * chọn nhiều ngôn ngữ dịch). Hỗ trợ single/multiple, tìm tiếng Việt không dấu,
 * điều hướng bàn phím, ARIA listbox/combobox và đóng khi click ngoài hoặc Esc.
 */

window.SearchableSelect = (function () {
    let instanceCounter = 0;
    const instances = new Set();
    let docListenersBound = false;

    // Chuẩn hóa chuỗi để tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt
    function normalize(text) {
        return String(text === null || text === undefined ? '' : text)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd');
    }

    function escapeHtml(value) {
        if (window.Layout && typeof window.Layout.escapeHtml === 'function') {
            return window.Layout.escapeHtml(value);
        }
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function t(key, fallback) {
        return window.I18n ? window.I18n.t(key, {}, fallback) : fallback;
    }

    // Một listener document dùng chung cho mọi instance (tránh rò rỉ listener khi re-render)
    function bindDocumentListeners() {
        if (docListenersBound) return;
        docListenersBound = true;

        document.addEventListener('click', (event) => {
            instances.forEach(inst => {
                if (!inst.root.isConnected) {
                    instances.delete(inst);
                    return;
                }
                if (inst.isOpen() && !inst.root.contains(event.target)) {
                    inst.close();
                }
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            instances.forEach(inst => {
                if (inst.isOpen()) inst.close();
            });
        });
    }

    function mount(container, options = {}) {
        if (typeof container === 'string') container = document.querySelector(container);
        if (!container) return null;

        bindDocumentListeners();

        const multiple = !!options.multiple;
        const placeholder = options.placeholder || '';
        const searchPlaceholder = options.searchPlaceholder || t('common.search', 'Tìm kiếm...');
        const emptyText = options.emptyText || t('common.no_results', 'Không tìm thấy kết quả phù hợp.');
        const allLabel = options.allLabel || null;

        let items = normalizeOptions(options.options);
        let value = multiple
            ? toValueArray(options.value)
            : (options.value !== null && options.value !== undefined && options.value !== '' ? String(options.value) : null);

        let isOpen = false;
        let activeIndex = -1;
        let visibleOptions = [];
        let query = '';

        const panelId = `searchable-select-panel-${++instanceCounter}`;

        container.innerHTML = `
            <div class="searchable-select relative w-full text-xs">
                <div class="ss-trigger w-full min-h-[38px] bg-cardBg border border-borderDark hover:border-substackOrange rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition focus:outline-none focus:border-substackOrange focus:ring-1 focus:ring-substackOrange"
                    role="combobox" tabindex="0" aria-haspopup="listbox" aria-expanded="false" aria-controls="${panelId}" aria-label="${escapeHtml(placeholder)}">
                    <span class="ss-value flex flex-wrap items-center gap-1.5 flex-1 min-w-0"></span>
                    <i class="fa-solid fa-chevron-down ss-chevron text-[10px] text-gray-500 transition-transform shrink-0"></i>
                </div>
                <div id="${panelId}" class="ss-panel hidden absolute left-0 right-0 top-full mt-1 bg-cardBg border border-borderDark rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div class="p-2 border-b border-borderDark">
                        <div class="relative">
                            <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-500"><i class="fa-solid fa-magnifying-glass text-[10px]"></i></span>
                            <input type="text" class="ss-search w-full bg-darkBg border border-borderDark rounded-lg pl-7 pr-2.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-substackOrange transition"
                                placeholder="${escapeHtml(searchPlaceholder)}" autocomplete="off" aria-autocomplete="list" aria-controls="${panelId}">
                        </div>
                    </div>
                    <div class="ss-options max-h-60 overflow-y-auto p-1" role="listbox" ${multiple ? 'aria-multiselectable="true"' : ''}></div>
                    <div class="ss-empty hidden px-3 py-4 text-center text-[11px] text-gray-500"></div>
                </div>
            </div>
        `;

        const root = container.querySelector('.searchable-select');
        const trigger = root.querySelector('.ss-trigger');
        const valueEl = root.querySelector('.ss-value');
        const chevron = root.querySelector('.ss-chevron');
        const panel = root.querySelector('.ss-panel');
        const searchInput = root.querySelector('.ss-search');
        const optionsEl = root.querySelector('.ss-options');
        const emptyEl = root.querySelector('.ss-empty');

        function normalizeOptions(list) {
            return (Array.isArray(list) ? list : []).map(item => {
                if (item && typeof item === 'object') {
                    return { value: String(item.value === null || item.value === undefined ? '' : item.value), label: String(item.label === null || item.label === undefined ? '' : item.label) };
                }
                return { value: String(item), label: String(item) };
            });
        }

        function toValueArray(raw) {
            if (Array.isArray(raw)) return raw.filter(v => v !== null && v !== undefined && v !== '').map(String);
            if (raw === null || raw === undefined || raw === '') return [];
            return [String(raw)];
        }

        function labelFor(val) {
            const found = items.find(item => item.value === val);
            return found ? found.label : val;
        }

        function isSelected(item) {
            if (!multiple && item.value === '' && allLabel) return !value;
            return multiple ? value.includes(item.value) : item.value === (value || '');
        }

        function renderTrigger() {
            if (multiple) {
                if (!value.length) {
                    valueEl.innerHTML = `<span class="text-gray-500 truncate">${escapeHtml(placeholder)}</span>`;
                    return;
                }
                valueEl.innerHTML = value.map(val => `
                    <span class="inline-flex items-center gap-1 bg-substackOrange/15 text-substackOrange border border-substackOrange/30 rounded-full pl-2 pr-1 py-0.5 text-[10px] font-medium max-w-full">
                        <span class="truncate">${escapeHtml(labelFor(val))}</span>
                        <button type="button" class="ss-chip-remove w-4 h-4 rounded-full flex items-center justify-center hover:bg-substackOrange/25 transition focus:outline-none" data-value="${escapeHtml(val)}" aria-label="${escapeHtml(t('common.remove', 'Xóa'))}">
                            <i class="fa-solid fa-xmark text-[9px]"></i>
                        </button>
                    </span>
                `).join('');
                return;
            }

            const display = value ? labelFor(value) : (allLabel || placeholder);
            const hasDisplay = !!value || !!allLabel;
            valueEl.innerHTML = `<span class="truncate ${hasDisplay ? 'text-gray-200' : 'text-gray-500'}">${escapeHtml(display)}</span>`;
        }

        function renderOptions() {
            const q = normalize(query.trim());
            visibleOptions = q
                ? items.filter(item => normalize(item.label).includes(q))
                : items.slice();

            if (!visibleOptions.length) {
                optionsEl.innerHTML = '';
                emptyEl.textContent = emptyText;
                emptyEl.classList.remove('hidden');
                activeIndex = -1;
                return;
            }

            emptyEl.classList.add('hidden');
            optionsEl.innerHTML = visibleOptions.map((item, idx) => {
                const selected = isSelected(item);
                const active = idx === activeIndex;
                const classes = [
                    'ss-option w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition',
                    active ? 'bg-borderDark text-white' : 'hover:bg-borderDark',
                    selected && !active ? 'text-substackOrange' : (active ? '' : 'text-gray-300')
                ].join(' ');
                return `
                    <button type="button" role="option" data-index="${idx}" aria-selected="${selected}" tabindex="-1" class="${classes}">
                        <span class="truncate">${escapeHtml(item.label)}</span>
                        ${selected ? '<i class="fa-solid fa-check text-[10px] shrink-0"></i>' : ''}
                    </button>
                `;
            }).join('');

            optionsEl.querySelectorAll('.ss-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-index'), 10);
                    if (!Number.isNaN(idx) && visibleOptions[idx]) choose(visibleOptions[idx]);
                });
            });
        }

        function notify() {
            if (typeof options.onChange === 'function') {
                options.onChange(multiple ? value.slice() : value);
            }
        }

        function choose(item) {
            if (multiple) {
                if (item.value === '' && allLabel) {
                    value = [];
                } else if (value.includes(item.value)) {
                    value = value.filter(v => v !== item.value);
                } else {
                    value = value.concat(item.value);
                }
                renderTrigger();
                query = '';
                searchInput.value = '';
                renderOptions();
                searchInput.focus();
                notify();
                return;
            }

            value = item.value === '' ? null : item.value;
            renderTrigger();
            close();
            notify();
        }

        function moveActive(delta) {
            if (!visibleOptions.length) return;
            if (activeIndex < 0) {
                activeIndex = delta > 0 ? 0 : visibleOptions.length - 1;
            } else {
                activeIndex = (activeIndex + delta + visibleOptions.length) % visibleOptions.length;
            }
            renderOptions();
            const activeBtn = optionsEl.querySelector(`.ss-option[data-index="${activeIndex}"]`);
            if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
                activeBtn.scrollIntoView({ block: 'nearest' });
            }
        }

        function open() {
            if (isOpen) return;
            isOpen = true;
            query = '';
            searchInput.value = '';
            activeIndex = -1;
            renderOptions();
            panel.classList.remove('hidden');
            trigger.setAttribute('aria-expanded', 'true');
            chevron.classList.add('rotate-180');
            searchInput.focus();
        }

        function close() {
            if (!isOpen) return;
            isOpen = false;
            panel.classList.add('hidden');
            trigger.setAttribute('aria-expanded', 'false');
            chevron.classList.remove('rotate-180');
            activeIndex = -1;
        }

        function toggle() {
            if (isOpen) close(); else open();
        }

        trigger.addEventListener('click', (event) => {
            event.stopPropagation();

            // Chip xóa trong chế độ multiple không mở/đóng panel
            const removeBtn = event.target.closest('.ss-chip-remove');
            if (removeBtn) {
                const removed = removeBtn.getAttribute('data-value');
                value = value.filter(v => v !== removed);
                renderTrigger();
                if (isOpen) renderOptions();
                notify();
                return;
            }

            toggle();
        });

        trigger.addEventListener('keydown', (event) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                open();
            } else if (event.key === 'Escape') {
                close();
            }
        });

        searchInput.addEventListener('input', () => {
            query = searchInput.value;
            activeIndex = -1;
            renderOptions();
        });

        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveActive(1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveActive(-1);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (activeIndex >= 0 && visibleOptions[activeIndex]) {
                    choose(visibleOptions[activeIndex]);
                } else if (visibleOptions.length === 1) {
                    choose(visibleOptions[0]);
                }
            } else if (event.key === 'Escape') {
                event.stopPropagation();
                close();
                trigger.focus();
            } else if (event.key === 'Tab') {
                close();
            }
        });

        const instance = {
            root,
            isOpen: () => isOpen,
            close
        };
        instances.add(instance);

        renderTrigger();

        return {
            element: root,
            getValue: () => (multiple ? value.slice() : value),
            setValue: (next, shouldNotify = false) => {
                value = multiple ? toValueArray(next) : (next !== null && next !== undefined && next !== '' ? String(next) : null);
                renderTrigger();
                if (isOpen) renderOptions();
                if (shouldNotify) notify();
                return multiple ? value.slice() : value;
            },
            setOptions: (nextOptions) => {
                items = normalizeOptions(nextOptions);
                if (multiple) {
                    value = value.filter(v => items.some(item => item.value === v));
                } else if (value && !items.some(item => item.value === value)) {
                    value = null;
                }
                renderTrigger();
                if (isOpen) renderOptions();
            },
            open,
            close,
            destroy: () => {
                instances.delete(instance);
                container.innerHTML = '';
            }
        };
    }

    return { mount, normalize };
})();
