chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractText') {
        const extractedText = extractMainContent();
        sendResponse({ text: extractedText });
    }
});

function extractMainContent() {
    let mainContent = '';
    
    // Essaye de trouver les éléments qui contiennent généralement le contenu principal
    const selectors = [
        'article',
        'main',
        'div[role="main"]', // Parfois utilisé pour le contenu principal
        'div.post-content',
        'div.entry-content',
        'div.article-content',
        'div.body-content',
        'div[itemprop="articleBody"]',
        '.content-area', // Selecteur générique courant
        '.post-body', // Selecteur générique courant
        '.page-content', // Selecteur générique courant
        'p' // Comme dernier recours, on prend tous les paragraphes (filtrés ci-dessous)
    ];

    // Crée un clone du body pour ne pas modifier la page originale et pour un nettoyage isolé
    const tempBody = document.body.cloneNode(true);

    // Fonction pour supprimer un élément du DOM temporaire
    const removeElements = (selector) => {
        tempBody.querySelectorAll(selector).forEach(el => el.remove());
    };

    // 1. Suppression des éléments non pertinents avant l'extraction
    // Ciblage générique pour les éléments de UI/navigation/publicité
    const irrelevantSelectors = [
        'header', 'footer', 'nav', 'aside',
        'script', 'style', 'noscript', 'meta', 'link',
        'img', 'picture', 'svg', 'canvas', 'video', 'audio', // Éléments média
        'iframe', 'object', 'embed', // Contenus embarqués
        '.sidebar', '.ad', '.ads', '.adsbygoogle', '.header-area', '.footer-area', '.navigation', '.menu',
        '.widget', '.comment-section', '.share-buttons', '.social-media-links',
        '[class*="icon"]', '[data-icon]', // Icônes
        '[aria-hidden="true"]', // Éléments cachés à l'accessibilité (souvent des icônes)
        '.hidden', '.display-none', // Classes pour cacher des éléments
        'form', 'button', 'input', 'textarea', 'select' // Éléments de formulaire
    ];
    removeElements(irrelevantSelectors.join(', '));

    // 2. Tenter d'extraire le contenu principal d'un bloc ciblé
    for (const selector of selectors) {
        const element = tempBody.querySelector(selector);
        if (element && element.textContent.length > 200) { // Un minimum de texte pour être pertinent
            mainContent = element.textContent;
            break;
        }
    }

    // 3. Si aucun bloc principal n'est trouvé, prendre tout le texte restant du corps nettoyé
    if (mainContent.length === 0) {
        mainContent = tempBody.textContent;
    }

    // 4. Nettoyage final du texte :
    // - Remplacer les retours à la ligne multiples par un seul espace ou un saut de ligne unique
    // - Supprimer les espaces multiples, les tabulations
    // - Supprimer les espaces en début et fin de chaîne
    mainContent = mainContent.replace(/(\n\s*){2,}/g, '\n\n') // Conserve max 2 retours à la ligne consécutifs
                             .replace(/[ \t]+/g, ' ') // Remplace les espaces/tab multiples par un seul
                             .trim(); // Supprime les espaces au début/fin

    return mainContent;
}