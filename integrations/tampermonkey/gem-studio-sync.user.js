// ==UserScript==
// @name         GemStudio Sync for Gemini
// @namespace    https://github.com/rmasabela/gem-studio
// @version      1.0.2
// @description  Sincroniza y despliega configuraciones de Gems desde GitHub Pages directo a la UI de Gemini
// @author       Ricardo Masabel
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      rmasabela.github.io
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const BASE_URL = "https://rmasabela.github.io/gem-studio";

    function setNativeValue(element, value) {
        if (!element) return;
        element.focus();
        
        // Manejo para inputs/textareas que pueden tener value setters interceptados por Angular/React
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    function locateGemFields() {
        const textareas = Array.from(document.querySelectorAll('textarea'));
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));

        // 1. Campo Nombre
        let nameField = inputs.find(i => {
            const label = (i.getAttribute('aria-label') || i.getAttribute('placeholder') || '').toLowerCase();
            return label.includes('nombre') || label.includes('name');
        }) || inputs[0];

        // 2. Campo Descripción
        let descField = inputs.find(i => {
            const label = (i.getAttribute('aria-label') || i.getAttribute('placeholder') || '').toLowerCase();
            return label.includes('descrip');
        }) || textareas.find(t => {
            const label = (t.getAttribute('aria-label') || t.getAttribute('placeholder') || '').toLowerCase();
            return label.includes('descrip');
        });

        // 3. Campo Instrucciones (usualmente el textarea principal o más grande)
        let instField = textareas.find(t => {
            const label = (t.getAttribute('aria-label') || t.getAttribute('placeholder') || '').toLowerCase();
            return label.includes('instrucc') || label.includes('instruction');
        }) || textareas[textareas.length - 1];

        return { nameField, descField, instField };
    }

    function renderSyncBar() {
        // Inyectar solo si estamos en la vista de edición/creación de un Gem
        const isEditView = window.location.pathname.includes('/gems/edit/') || 
                           window.location.pathname.includes('/gems/create') ||
                           window.location.href.includes('/gems/');

        const existingBar = document.getElementById('gem-studio-sync-bar');

        if (!isEditView) {
            if (existingBar) existingBar.style.display = 'none';
            return;
        }

        if (existingBar) {
            existingBar.style.display = 'flex';
            return;
        }

        const bar = document.createElement('div');
        bar.id = 'gem-studio-sync-bar';
        bar.style.cssText = `
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            z-index: 2147483647 !important;
            background: #181a1f !important;
            border: 1px solid #3c4043 !important;
            border-radius: 8px !important;
            padding: 8px 12px !important;
            box-shadow: 0 4px 16px rgba(0,0,0,0.7) !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        `;

        bar.innerHTML = `
            <span style="color: #8ab4f8; font-weight: 600; font-size: 11px; letter-spacing: 0.5px;">GEM-STUDIO</span>
            <select id="gem-studio-select" style="background: #202124; color: #e8eaed; border: 1px solid #5f6368; border-radius: 4px; padding: 4px 6px; font-size: 11px; outline: none;">
                <option value="">Cargando catálogo...</option>
            </select>
            <button id="gem-studio-btn-sync" style="background: #1a73e8; color: white; border: none; border-radius: 4px; padding: 5px 10px; font-size: 11px; font-weight: 500; cursor: pointer;">
                Deploy to UI
            </button>
        `;

        document.body.appendChild(bar);

        const selectEl = document.getElementById('gem-studio-select');
        const syncBtn = document.getElementById('gem-studio-btn-sync');

        // Cargar catálogo de GitHub Pages
        GM_xmlhttpRequest({
            method: "GET",
            url: `${BASE_URL}/index.json`,
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        const gems = JSON.parse(res.responseText);
                        selectEl.innerHTML = gems.map(g => `<option value="${g.slug}">${g.name} (v${g.version})</option>`).join('');
                    } catch(e) {
                        selectEl.innerHTML = '<option value="">Error JSON</option>';
                    }
                } else {
                    selectEl.innerHTML = '<option value="">Error ' + res.status + '</option>';
                }
            }
        });

        syncBtn.addEventListener('click', () => {
            const slug = selectEl.value;
            if (!slug) return alert('Selecciona un Gem.');

            syncBtn.innerText = 'Descargando...';
            syncBtn.style.background = '#e37400';

            GM_xmlhttpRequest({
                method: "GET",
                url: `${BASE_URL}/${slug}.json`,
                onload: function(res) {
                    if (res.status !== 200) {
                        syncBtn.innerText = 'Error';
                        syncBtn.style.background = '#d93025';
                        return alert(`HTTP Error ${res.status}`);
                    }

                    try {
                        const config = JSON.parse(res.responseText).gem_configuration;
                        const { nameField, descField, instField } = locateGemFields();

                        if (nameField && config.metadata?.name) {
                            setNativeValue(nameField, config.metadata.name);
                        }

                        if (descField && config.metadata?.description) {
                            setNativeValue(descField, config.metadata.description);
                        }

                        if (instField && config.behavior?.instructions) {
                            setNativeValue(instField, config.behavior.instructions);
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
                        alert('Error aplicando datos: ' + err.message);
                    }
                }
            });
        });
    }

    setInterval(renderSyncBar, 1000);
})();
