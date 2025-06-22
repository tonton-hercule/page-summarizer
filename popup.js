// popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const summarizeBtn = document.getElementById('summarize-btn');
    const statusMessage = document.getElementById('status-message');
    const summaryOutput = document.getElementById('summary-output');

    const providerSelect = document.getElementById('provider-select');
    const hfSettings = document.getElementById('huggingface-settings');
    const openaiSettings = document.getElementById('openai-settings');
    const hfModelSelect = document.getElementById('hf-model-select');
    const hfApiKeyInput = document.getElementById('hf-api-key');
    const openaiModelSelect = document.getElementById('openai-model-select');
    const openaiApiKeyInput = document.getElementById('openai-api-key');
    const outputLanguageSelect = document.getElementById('output-language-select');
    const summaryLengthInput = document.getElementById('summary-length-input');

    // --- Fonctions d'aide pour l'UI et le stockage des paramètres ---

    function setStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? 'red' : '#555';
    }

    function clearSummary() {
        summaryOutput.textContent = 'Le résumé apparaîtra ici.';
        summaryOutput.classList.add('empty');
    }

    // Affiche/Masque les paramètres spécifiques au fournisseur
    function updateProviderSettingsVisibility() {
        const selectedProvider = providerSelect.value;
        hfSettings.style.display = selectedProvider === 'huggingface' ? 'block' : 'none';
        openaiSettings.style.display = selectedProvider === 'openai' ? 'block' : 'none';
    }

    // Sauvegarde les paramètres dans le stockage synchronisé de Chrome
    async function saveSettings() {
        const settings = {
            provider: providerSelect.value,
            hfModel: hfModelSelect.value,
            hfApiKey: hfApiKeyInput.value,
            openaiModel: openaiModelSelect.value,
            openaiApiKey: openaiApiKeyInput.value,
            outputLanguage: outputLanguageSelect.value,
            summaryLength: summaryLengthInput.value
        };
        await chrome.storage.sync.set({ summaryExtensionSettings: settings });
    }

    // Charge les paramètres depuis le stockage synchronisé de Chrome
    async function loadSettings() {
        const result = await chrome.storage.sync.get('summaryExtensionSettings');
        const settings = result.summaryExtensionSettings;
        if (settings) {
            providerSelect.value = settings.provider || 'classic';
            hfModelSelect.value = settings.hfModel || 'csebuetnlp/mt5_multilingual_XLSum'; // Valeur par défaut pour HF
            hfApiKeyInput.value = settings.hfApiKey || '';
            openaiModelSelect.value = settings.openaiModel || 'gpt-3.5-turbo';
            openaiApiKeyInput.value = settings.openaiApiKey || '';
            outputLanguageSelect.value = settings.outputLanguage || 'auto';
            summaryLengthInput.value = settings.summaryLength || '5';
        }
        updateProviderSettingsVisibility();
    }

    // Écouteurs pour sauvegarder les paramètres à chaque changement
    providerSelect.addEventListener('change', async () => { await saveSettings(); updateProviderSettingsVisibility(); });
    hfModelSelect.addEventListener('change', saveSettings);
    hfApiKeyInput.addEventListener('input', saveSettings);
    openaiModelSelect.addEventListener('change', saveSettings);
    openaiApiKeyInput.addEventListener('input', saveSettings);
    outputLanguageSelect.addEventListener('change', saveSettings);
    summaryLengthInput.addEventListener('input', saveSettings);

    // --- Algorithmes de Résumé ---

    // Algorithme de résumé classique (basé sur les premières phrases)
    function simpleSummarize(text, sentenceCount = 5) {
        if (!text) return 'Aucun texte à résumer.';
        text = text.replace(/\s+/g, ' ').trim();
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
        if (sentences.length === 0) return 'Impossible de trouver des phrases à résumer.';
        return sentences.slice(0, sentenceCount).join(' ').trim();
    }

    // Appelle l'API Hugging Face pour le résumé
    async function summarizeWithHuggingFace(text, model, apiKey, outputLanguage, summaryLength) {
        if (!apiKey) throw new Error("Clé API Hugging Face manquante.");
        if (!text) throw new Error("Aucun texte à résumer.");
        
        // URL d'API pour Hugging Face (router.huggingface.co est la nouvelle URL générique)
        const apiUrl = `https://router.huggingface.co/hf-inference/models/${model}`;
        
        let prompt = text;
        // La gestion de la langue de sortie est complexe et dépend de l'entraînement spécifique du modèle.
        // Pour les modèles mT5 comme XLSum/CrossSum, la langue de sortie est souvent la langue de l'entrée.
        // Pour forcer, on pourrait faire: `prompt = `summarize ${outputLanguage}: ${text}`;`
        // Mais ça dépend du modèle. Le plus sûr est de laisser le modèle décider ou d'utiliser un modèle m2o.

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    min_length: Math.min(50, summaryLength * 10),
                    max_length: summaryLength * 30
                },
                options: {
                    use_cache: true,
                    wait_for_model: true
                }
            })
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error("Détails de l'erreur Hugging Face:", errorBody);
            // Amélioration du message d'erreur pour aider au diagnostic du 404/401/etc.
            let errorMessage = `Erreur API Hugging Face: ${response.status} - `;
            if (response.status === 404) {
                errorMessage += "Modèle introuvable ou non disponible sur l'API publique gratuite.";
            } else if (response.status === 401 || response.status === 403) {
                errorMessage += "Clé API invalide ou permissions insuffisantes.";
            } else {
                errorMessage += errorBody.error || errorBody.detail || 'Erreur inconnue';
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data && Array.isArray(data) && data.length > 0 && typeof data[0].summary_text === 'string') {
            return data[0].summary_text;
        } else if (data && Array.isArray(data) && data.length > 0 && typeof data[0].generated_text === 'string') {
            return data[0].generated_text;
        } else {
            throw new Error("Réponse de l'API Hugging Face invalide ou inattendue.");
        }
    }

    // Appelle l'API OpenAI pour le résumé
    async function summarizeWithOpenAI(text, model, apiKey, outputLanguage, summaryLength) {
        if (!apiKey) throw new Error("Clé API OpenAI manquante.");
        if (!text) throw new Error("Aucun texte à résumer.");

        const apiUrl = 'https://api.openai.com/v1/chat/completions';
        
        let systemPrompt = "Vous êtes un assistant de résumé expert. Résumez le texte suivant de manière concise et factuelle.";
        if (outputLanguage !== 'auto') {
            systemPrompt += ` Le résumé doit être en ${outputLanguage === 'en' ? 'anglais' : outputLanguage === 'fr' ? 'français' : 'la langue spécifiée par le code ISO "'+outputLanguage+'"'}.`;
        }
        systemPrompt += ` Le résumé doit être d'environ ${summaryLength} phrases.`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Texte à résumer: "${text}"` }
                ],
                temperature: 0.7,
                max_tokens: summaryLength * 30
            })
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(`Erreur API OpenAI: ${response.status} - ${errorBody.error?.message || 'Erreur inconnue'}`);
        }

        const data = await response.json();
        if (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
            return data.choices[0].message.content.trim();
        } else {
            throw new Error("Réponse de l'API OpenAI invalide.");
        }
    }

    // --- Fonction pour la détection de langue ---
    async function detectPageLanguage() {
        return new Promise((resolve) => {
            chrome.tabs.detectLanguage((language) => {
                resolve(language || 'en');
            });
        });
    }

    // --- Gestionnaire de clic principal ---
    summarizeBtn.addEventListener('click', async () => {
        summarizeBtn.disabled = true;
        setStatus('Extraction du contenu de la page...');
        clearSummary();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                setStatus('Impossible de résumer cette page. Veuillez ouvrir une page web standard.', true);
                summarizeBtn.disabled = false;
                return;
            }

            // --- Étape 1: Extraction du texte de la page ---
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            const response = await new Promise(resolve => {
                chrome.tabs.sendMessage(tab.id, { action: 'extractText' }, resolve);
            });

            if (chrome.runtime.lastError) {
                throw new Error(`Erreur de communication avec la page: ${chrome.runtime.lastError.message}`);
            }
            if (!response || !response.text) {
                throw new Error('Aucun texte significatif trouvé sur cette page.');
            }
            const pageText = response.text;
            const summaryLength = parseInt(summaryLengthInput.value, 10);

            // --- Étape 2: Détection de la langue (si 'auto' sélectionné) ---
            let detectedLanguage = 'en';
            const selectedOutputLanguage = outputLanguageSelect.value;
            if (selectedOutputLanguage === 'auto') {
                setStatus('Détection de la langue de la page...');
                detectedLanguage = await detectPageLanguage();
                console.log("Langue de la page détectée:", detectedLanguage);
                if (!['en', 'fr', 'es', 'de', 'zh', 'ar', 'ru', 'hi'].includes(detectedLanguage)) {
                    detectedLanguage = 'en';
                }
            }
            const finalOutputLanguage = selectedOutputLanguage === 'auto' ? detectedLanguage : selectedOutputLanguage;


            // --- Étape 3: Appel de l'algorithme de résumé ---
            const selectedProvider = providerSelect.value;
            setStatus(`Génération du résumé via ${selectedProvider}...`);
            let summary = '';

            switch (selectedProvider) {
                case 'classic':
                    summary = simpleSummarize(pageText, summaryLength);
                    break;
                case 'huggingface':
                    const hfModel = hfModelSelect.value;
                    const hfApiKey = hfApiKeyInput.value;
                    summary = await summarizeWithHuggingFace(pageText, hfModel, hfApiKey, finalOutputLanguage, summaryLength);
                    break;
                case 'openai':
                    const openaiModel = openaiModelSelect.value;
                    const openaiApiKey = openaiApiKeyInput.value;
                    summary = await summarizeWithOpenAI(pageText, openaiModel, openaiApiKey, finalOutputLanguage, summaryLength);
                    break;
                default:
                    throw new Error('Fournisseur de résumé non reconnu.');
            }

            // --- Étape 4: Affichage du résumé ---
            summaryOutput.textContent = summary;
            summaryOutput.classList.remove('empty');
            setStatus('Résumé généré avec succès !');

        } catch (error) {
            setStatus(`Erreur: ${error.message}`, true);
            console.error('Erreur dans popup.js:', error);
            summaryOutput.textContent = `Erreur: ${error.message}`;
            summaryOutput.classList.remove('empty');
        } finally {
            summarizeBtn.disabled = false;
        }
    });

    // --- Initialisation ---
    await loadSettings();
    clearSummary();
    setStatus('Prêt à résumer.');
});