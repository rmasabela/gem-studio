// ==UserScript==
// @name         GemStudio Sync for Gemini
// @namespace    https://github.com/rmasabela/gem-studio
// @version      1.0.0
// @description  Sincroniza y despliega configuraciones de Gems desde GitHub Pages directo a la UI de Gemini
// @author       Ricardo Masabel
// @match        https://gemini.google.com/gems/*
// @grant        GM_xmlhttpRequest
// @connect      rmasabela.github.io
// ==/UserScript==

(function() {
    'use strict';

    const BASE_URL = "https://rmasabela.github.io/gem-studio";

    function triggerInput(el, text) {
        if (!el) return;
        el.focus();
        if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
            // Manejo de div contenteditable moderno
            el.innerHTML = '';
            document.execCommand('insertText', false, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function renderSyncBar() {
        if (document.getElementById('gem-studio-sync-bar')) return;

        // Solo inyectar si estamos en el panel de creación/edición de Gems
        const isGemEditor = window.location.pathname.includes('/gems/');
        if (!isGemEditor) return;

        const bar = document.createElement('div');
        bar.id = 'gem-studio-sync-bar';
        bar.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99999;
            background: #181a1f;
            border: 1px solid #3c4043;
            border-radius: 8px;
            padding: 10px 14px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        bar.innerHTML = `
            <span style="color: #8ab4f8; font-weight: 600; font-size: 12px; letter-spacing: 0.5px;">GEM-STUDIO</span>
            <select id="gem-studio-select" style="background: #202124; color: #e8eaed; border: 1px solid #5f6368; border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;">
                <option value="">Cargando catálogo...</option>
            </select>
            <button id="gem-studio-btn-sync" style="background: #1a73e8; color: white; border: none; border-radius: 4px; padding: 5px 12px; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.2s;">
                Deploy to UI
            </button>
        `;

        document.body.appendChild(bar);

        const selectEl = document.getElementById('gem-studio-select');
        const syncBtn = document.getElementById('gem-studio-btn-sync');

        // 1. Cargar catálogo centralizado index.json
        GM_xmlhttpRequest({
            method: "GET",
            url: `${BASE_URL}/index.json`,
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        const gems = JSON.parse(res.responseText);
                        selectEl.innerHTML = gems.map(g => `<option value="${g.slug}">${g.name} (v${g.version})</option>`).join('');
                    } catch(e) {
                        selectEl.innerHTML = '<option value="">Error parseando catálogo</option>';
                    }
                } else {
                    selectEl.innerHTML = '<option value="">Error cargando catálogo</option>';
                }
            }
        });

        // 2. Acción de deploy al presionar el botón
        syncBtn.addEventListener('click', () => {
            const slug = selectEl.value;
            if (!slug) return alert('Selecciona un Gem válido.');

            syncBtn.innerText = 'Sincronizando...';
            syncBtn.style.background = '#e37400';

            GM_xmlhttpRequest({
                method: "GET",
                url: `${BASE_URL}/${slug}.json`,
                onload: function(res) {
                    if (res.status !== 200) {
                        syncBtn.innerText = 'Error';
                        syncBtn.style.background = '#d93025';
                        alert(`No se pudo descargar el Gem ${slug}: status ${res.status}`);
                        return;
                    }

                    try {
                        const payload = JSON.parse(res.responseText).gem_configuration;

                        // Localización de campos estándar en el formulario de Gemini
                        const inputs = Array.from(document.querySelectorAll('input, textarea, div[contenteditable="true"]'));

                        // Input Nombre
                        const nameInput = inputs.find(el => {
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const ph = (el.getAttribute('placeholder') || '').toLowerCase();
                            return aria.includes('nombre') || ph.includes('nombre') || aria.includes('name') || ph.includes('name');
                        });

                        // Input Descripción
                        const descInput = inputs.find(el => {
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const ph = (el.getAttribute('placeholder') || '').toLowerCase();
                            return (aria.includes('descrip') || ph.includes('descrip')) && el !== nameInput;
                        });

                        // Input Instrucciones
                        const instInput = inputs.find(el => {
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const ph = (el.getAttribute('placeholder') || '').toLowerCase();
                            return aria.includes('instrucc') || ph.includes('instrucc') || aria.includes('instruction') || ph.includes('instruction');
                        });

                        if (nameInput && payload.metadata?.name) {
                            triggerInput(nameInput, payload.metadata.name);
                        }

                        if (descInput && payload.metadata?.description) {
                            triggerInput(descInput, payload.metadata.description);
                        }

                        if (instInput && payload.behavior?.instructions) {
                            triggerInput(instInput, payload.behavior.instructions);
                        }

                        syncBtn.innerText = '¡Desplegado!';
                        syncBtn.style.background = '#1e8e3e';
                        setTimeout(() => {
                            syncBtn.innerText = 'Deploy to UI';
                            syncBtn.style.background = '#1a73e8';
                        }, 2500);

                    } catch (err) {
                        syncBtn.innerText = 'Error';
                        syncBtn.style.background = '#d93025';
                        alert('Error al procesar el manifiesto: ' + err.message);
                    }
                }
            });
        });
    }

    // Monitor activo para inyectar al navegar mediante SPA
    setInterval(renderSyncBar, 1500);
})();
