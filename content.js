chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractText') {
        const extractedText = extractMainContent();
        sendResponse({ text: extractedText });
    }
});

function extractMainContent() {
    let mainContent = '';
    
    // Essaye de trouver les éléments qui contiennent généralement le contenu principal
    // Ces sélecteurs sont des heuristiques, tu pourrais les affiner
    const selectors = [
        'article',
        'main',
        'div.post-content',
        'div.entry-content',
        'div.article-content',
        'div.body-content',
        'div[itemprop="articleBody"]',
        'p' // Comme dernier recours, on prend tous les paragraphes
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.length > 200) { // On cherche un élément avec assez de texte
            mainContent = element.textContent;
            break; // On a trouvé un bon candidat, on arrête la recherche
        }
    }

    // Si aucun des sélecteurs spécifiques n'a donné de résultat, on tente de prendre une partie du body
    if (mainContent.length === 0) {
        // Exclure les éléments non pertinents comme les en-têtes, pieds de page, navigations
        const bodyContent = document.body.cloneNode(true);
        const irrelevantSelectors = [
            'header', 'footer', 'nav', 'aside',
            'script', 'style', 'noscript',
            '.sidebar', '.ad', '.ads', '.adsbygoogle', '.header', '.footer', '.navigation', '.menu'
        ];
        irrelevantSelectors.forEach(selector => {
            bodyContent.querySelectorAll(selector).forEach(el => el.remove());
        });
        mainContent = bodyContent.textContent;
    }

    // Nettoyage final pour retirer les espaces multiples, tabulations, etc.
    mainContent = mainContent.replace(/\s+/g, ' ').trim();

    return mainContent;
}