// Functional Hamburger Menu

function toggleMenu(force) {
    const menu = document.getElementById('nav-links');
    const button = document.getElementById('hamburger-button');

    const isOpen = typeof force === 'boolean'
        ? force
        : !menu.classList.contains('open');

    menu.classList.toggle('open', isOpen);
    button.setAttribute('aria-expanded', String(isOpen));
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        toggleMenu(false);
    }
});

// Close the menu when clicking outside of it

document.addEventListener('click', (event) => {
    const menu = document.getElementById('nav-links');
    const button = document.getElementById('hamburger-button');

    if (!menu.contains(event.target) && !button.contains(event.target)) {
        toggleMenu(false);
    }
});