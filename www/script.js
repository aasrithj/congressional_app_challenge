// Functional Hamburger Menu

function goTo(screenId) {
    const target = document.getElementById(screenId);
    if (!target) return;

    document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.remove('active');
    });

    target.classList.add('active');
    document.getElementById('scroll-area').scrollTop = 0;

    if (screenId === 'screen-setup-materials') {
        renderMaterials();
    }
}

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

// Close the Hamburger Menu when Clicking Outside of Its Viewport

document.addEventListener('click', (event) => {
    const menu = document.getElementById('nav-links');
    const button = document.getElementById('hamburger-button');

    if (!menu.contains(event.target) && !button.contains(event.target)) {
        toggleMenu(false);
    }
});

// Close the Hamburger Menu Automatically when Clicking on a Section

document.getElementById('nav-links').addEventListener('click', (event) => {
    const link = event.target.closest('a');

    if (link) {
        toggleMenu(false);
    }
});

// Restore Previously Selected Conditions

const conditionDefaultsVersion = localStorage.getItem('healthsyncConditionDefaultsVersion');

// Reset the previous starter selections once; later user choices are preserved.
if (conditionDefaultsVersion !== 'asthma-only-v2') {
    localStorage.setItem('healthsyncConditions', JSON.stringify(['asthma']));
    localStorage.setItem('healthsyncConditionDefaultsVersion', 'asthma-only-v2');
}

const savedConditions = readSavedValue('healthsyncConditions', ['asthma']);
document.querySelectorAll('#conditions-list input[data-value]').forEach((input) => {
    input.checked = savedConditions.includes(input.dataset.value);
});

// Save Step 1 Conditions for Step 4

function saveConditionsAndContinue() {
    const conditions = [...document.querySelectorAll('#conditions-list input:checked')]
        .map((input) => input.dataset.value);
    const message = document.getElementById('conditions-error');

    if (!conditions.length) {
        if (message) message.textContent = 'Choose at least one condition to continue.';
        return;
    }

    localStorage.setItem('healthsyncConditions', JSON.stringify(conditions));
    if (message) message.textContent = '';
    goTo('screen-setup-location');
}

// Restore Previously Selected Reminders (Step 4 - Optional)

const savedReminders = readSavedValue('healthsyncReminders', ['morning-summary']);
document.querySelectorAll('#section-6-choices input[data-value]').forEach((input) => {
    input.checked = savedReminders.includes(input.dataset.value);
    input.addEventListener('change', saveReminders);
});

// Save Step 4 Optional Reminders

function saveReminders() {
    const reminders = [...document.querySelectorAll('#section-6-choices input:checked')]
        .map((input) => input.dataset.value);

    localStorage.setItem('healthsyncReminders', JSON.stringify(reminders));
}

// Location Permission Request and Open-Meteo Weather Lookup for Step 2

let locationChoice = null;
let locationConfirmedThisRun = false;
let gpsRequestPending = false;
let continueAfterGps = false;
let selectedLocation = readSavedValue('healthsyncLocation');

function readSavedValue(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function setLocationMessage(message, isError = false) {
    const display = document.getElementById('location-display');
    if (!display) return;
    display.textContent = isError ? message : '';
    display.hidden = !isError;
    display.setAttribute('aria-hidden', String(!isError));
}

function setLocationRequiredError(message) {
    const error = document.getElementById('location-required-error');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
    error.setAttribute('aria-hidden', 'false');
}

function clearLocationRequiredError() {
    const error = document.getElementById('location-required-error');
    if (!error) return;
    error.textContent = '';
    error.hidden = true;
    error.setAttribute('aria-hidden', 'true');
}

function updateSelectedLocation(location) {
    selectedLocation = location;
    localStorage.setItem('healthsyncLocation', JSON.stringify(location));
    return loadWeatherForLocation(location);
}

function getLocation() {
    const cityInput = document.getElementById('manual-city');
    locationChoice = 'gps';
    locationConfirmedThisRun = false;
    gpsRequestPending = false;
    continueAfterGps = false;
    clearLocationRequiredError();
    if (cityInput) cityInput.value = '';

    if (!navigator.geolocation) {
        gpsRequestPending = false;
        setLocationMessage('Location is not available in this browser. Enter a city or ZIP code instead.', true);
        return;
    }

    gpsRequestPending = true;
    setLocationMessage('Getting your location…');
    navigator.geolocation.getCurrentPosition(showPosition, showError, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 300000
    });
}

async function showPosition(position) {
    if (locationChoice !== 'gps') return;

    gpsRequestPending = false;
    locationConfirmedThisRun = true;
    clearLocationRequiredError();
    setLocationMessage('', false);

    const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: 'Current location',
        source: 'gps'
    };
    await updateSelectedLocation(location);

    if (continueAfterGps && locationChoice === 'gps') {
        continueAfterGps = false;
        goTo('screen-setup-day-timings');
    }
}

function showError(error) {
    if (locationChoice !== 'gps') return;

    gpsRequestPending = false;
    continueAfterGps = false;
    clearLocationRequiredError();

    const message = error && error.code === 1
        ? 'Location permission was denied. Enter a city or ZIP code to continue.'
        : 'Could not get your location. Try again or enter a city or ZIP code.';
    setLocationMessage(message, true);
}

async function lookupCityLocation(query) {
    const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
    endpoint.search = new URLSearchParams({ name: query, count: '1', language: 'en', format: 'json' });
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Location search failed. Check the city or ZIP code and try again.');

    const data = await response.json();
    const result = data.results && data.results[0];
    if (!result) throw new Error('No matching city or ZIP code was found. Try reentering your location or click "Use my  location".');

    return {
        latitude: result.latitude,
        longitude: result.longitude,
        label: [result.name, result.admin1, result.country].filter(Boolean).join(', '),
        source: 'search'
    };
}

async function loadWeatherForLocation(location) {
    const coordinates = { latitude: location.latitude, longitude: location.longitude };
    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.search = new URLSearchParams({
        ...coordinates,
        current: 'temperature_2m,relative_humidity_2m,surface_pressure,uv_index',
        hourly: 'temperature_2m,relative_humidity_2m,surface_pressure,uv_index',
        forecast_days: '2',
        timezone: 'auto'
    });

    const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    airUrl.search = new URLSearchParams({
        ...coordinates,
        current: 'us_aqi,pm2_5,ozone,uv_index',
        hourly: 'us_aqi,pm2_5,ozone,uv_index',
        forecast_days: '2',
        timezone: 'auto'
    });

    setLocationMessage(`Using ${location.label}. Loading local weather and air quality…`);

    try {
        const [weatherResponse, airResponse] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
        if (!weatherResponse.ok || !airResponse.ok) throw new Error('Open-Meteo could not return data for this location.');

        const [weather, airQuality] = await Promise.all([weatherResponse.json(), airResponse.json()]);
        localStorage.setItem('healthsyncWeather', JSON.stringify({ weather, airQuality, location }));
        setLocationMessage(`Location set to ${location.label}. Weather and air quality are ready.`);
    } catch (error) {
        setLocationMessage(`${location.label} is saved, but weather data could not load. Check your connection and try again.`, true);
    }
}

async function continueFromLocation() {
    const cityInput = document.getElementById('manual-city');
    const query = cityInput ? cityInput.value.trim() : '';
    if (query && !locationChoice) locationChoice = 'manual';
    clearLocationRequiredError();

    // If GPS is still resolving, wait for its callback instead of showing
    // the missing-location error. A successful callback continues the flow.
    if (locationChoice === 'gps' && gpsRequestPending) {
        continueAfterGps = true;
        return;
    }

    if (locationChoice === 'manual' || query) {
        if (!query) {
            setLocationMessage('', false);
            setLocationRequiredError('Choose or enter a location to continue.');
            return;
        }

        try {
            setLocationMessage('Finding that location…');
            const location = await lookupCityLocation(query);
            if (locationChoice !== 'manual' || cityInput.value.trim() !== query) return;
            locationConfirmedThisRun = true;
            await updateSelectedLocation(location);
            goTo('screen-setup-day-timings');
        } catch (error) {
            setLocationMessage(error.message || 'Could not find that location.', true);
        }
        return;
    }

    if (locationChoice === 'gps' && locationConfirmedThisRun && selectedLocation && selectedLocation.source === 'gps') {
        goTo('screen-setup-day-timings');
        return;
    }

    setLocationMessage('', false);
    setLocationRequiredError('Choose or enter a location to continue.');
}

// Validate Step 3 Wake and Sleep Times

function continueFromSchedule() {
    const wakeInput = document.getElementById('wake-time');
    const sleepInput = document.getElementById('sleep-time');
    const error = document.getElementById('schedule-error');
    const wake = wakeInput.value.trim();
    const sleep = sleepInput.value.trim();

    if (!wake || !sleep) {
        error.textContent = 'Enter your usual wake and sleep times to continue.';
        error.hidden = false;
        error.setAttribute('aria-hidden', 'false');
        return;
    }

    localStorage.setItem('healthsyncSchedule', JSON.stringify({ wake, sleep }));
    error.textContent = '';
    error.hidden = true;
    error.setAttribute('aria-hidden', 'true');
    goTo('screen-setup-materials');
}

['wake-time', 'sleep-time'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
        const error = document.getElementById('schedule-error');
        error.textContent = '';
        error.hidden = true;
        error.setAttribute('aria-hidden', 'true');
    });
});

document.getElementById('manual-city').addEventListener('input', () => {
    locationChoice = 'manual';
    locationConfirmedThisRun = false;
    gpsRequestPending = false;
    continueAfterGps = false;
    clearLocationRequiredError();
    setLocationMessage('This city or ZIP code will be used for your weather data.');
});

// Step 4 Carry Items by Selected Condition

const CONDITION_MATERIALS = {
    asthma: {
        label: 'Asthma',
        items: [
            { id: 'rescue-inhaler', name: 'Rescue inhaler', reminder: 'Remind me when air quality is poor', trigger: 'air-quality', recommended: true },
            { id: 'spacer', name: 'Spacer', reminder: 'Remind me when air quality is poor', trigger: 'air-quality' }
        ]
    },
    migraine: {
        label: 'Migraine',
        items: [
            { id: 'migraine-medication', name: 'Migraine medication', reminder: 'Remind me when pressure is shifting', trigger: 'pressure', recommended: true },
            { id: 'sunglasses', name: 'Sunglasses', reminder: 'Remind me when UV is high', trigger: 'uv' }
        ]
    },
    eczema: {
        label: 'Eczema / atopic dermatitis',
        items: [
            { id: 'moisturizer', name: 'Moisturizer', reminder: 'Remind me when the air is dry', trigger: 'dry-air', recommended: true },
            { id: 'eczema-sunscreen', name: 'Sunscreen', reminder: 'Remind me when UV is high', trigger: 'uv' }
        ]
    },
    anemia: {
        label: 'Anemia',
        items: [
            { id: 'anemia-treatment', name: 'Prescribed anemia treatment', reminder: 'Remind me whenever I go outside', trigger: 'always', recommended: true }
        ]
    },
    'heart-related-condition': {
        label: 'Heart-related / circulatory condition',
        items: [
            { id: 'prescribed-medication', name: 'Prescribed medication', reminder: 'Remind me when it is hot out', trigger: 'heat', recommended: true },
            { id: 'water-for-heart', name: 'Water bottle', reminder: 'Remind me when it is hot out', trigger: 'heat' }
        ]
    }
};

const COMMON_MATERIALS = [
    { id: 'water-bottle', name: 'Water bottle', reminder: 'When it is hot out', trigger: 'heat' },
    { id: 'n95-mask', name: 'N95 mask', reminder: 'When particulates are high', trigger: 'air-quality', recommended: true },
    { id: 'sunscreen', name: 'Sunscreen', reminder: 'When UV is 3 or above', trigger: 'uv' },
    { id: 'daily-moisturizer', name: 'Moisturizer', reminder: 'When the air is dry', trigger: 'dry-air' },
    { id: 'allergy-medication', name: 'Allergy medication', reminder: 'When pollen is high', trigger: 'pollen' },
    { id: 'hat', name: 'Hat', reminder: 'When UV is high', trigger: 'uv' }
];

let removeCustomMaterialsMode = false;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function getSavedMaterialIds() {
    return readSavedValue('healthsyncMaterials', []);
}

function initializeRecommendedMaterials(selectedConditions) {
    if (localStorage.getItem('healthsyncMaterialsInitialized') === 'true') return;

    const savedIds = getSavedMaterialIds();
    if (savedIds.length) {
        localStorage.setItem('healthsyncMaterialsInitialized', 'true');
        return;
    }

    const conditionDefaults = selectedConditions.flatMap((condition) => {
        const group = CONDITION_MATERIALS[condition];
        return group ? group.items.filter((item) => item.recommended).map((item) => item.id) : [];
    });
    const commonDefaults = COMMON_MATERIALS.filter((item) => item.recommended).map((item) => item.id);
    localStorage.setItem('healthsyncMaterials', JSON.stringify([...conditionDefaults, ...commonDefaults]));
    localStorage.setItem('healthsyncMaterialsInitialized', 'true');
}

function saveMaterialIds() {
    const selected = [...document.querySelectorAll('[data-material-id]:checked')]
        .map((input) => input.dataset.materialId);
    localStorage.setItem('healthsyncMaterials', JSON.stringify(selected));
}

function materialRow(item, selectedIds, allowSelection = true) {
    const checked = selectedIds.includes(item.id);

    if (!allowSelection) {
        return `
            <div class="step-4-material-row step-4-removal-locked-row" aria-disabled="true">
                <span class="step-4-material-copy">
                    <span class="check-heading step-4-material-name">${escapeHtml(item.name)}</span>
                    <span class="check-subheading step-4-material-reminder">${escapeHtml(item.reminder)}</span>
                </span>
            </div>`;
    }

    return `
        <label class="check-row check-row-1 step-4-material-row">
            <input type="checkbox" data-material-id="${escapeHtml(item.id)}" ${checked ? 'checked' : ''}>
            <span class="box"></span>
            <span class="step-4-material-copy">
                <span class="check-heading step-4-material-name">${escapeHtml(item.name)}</span>
                <span class="check-subheading step-4-material-reminder">${escapeHtml(item.reminder)}</span>
            </span>
        </label>`;
}

function customMaterialRemovalRow(item) {
    return `
        <label class="check-row check-row-1 step-4-material-row step-4-remove-row">
            <input type="checkbox" data-remove-custom-id="${escapeHtml(item.id)}" aria-label="Select ${escapeHtml(item.name)} to remove">
            <span class="box"></span>
            <span class="step-4-material-copy">
                <span class="check-heading step-4-material-name">${escapeHtml(item.name)}</span>
                <span class="check-subheading step-4-material-reminder">Select this item, then click "Save changes" to remove it.</span>
            </span>
        </label>`;
}

function renderMaterials() {
    const selectedConditions = readSavedValue('healthsyncConditions', []);
    initializeRecommendedMaterials(selectedConditions);
    const selectedIds = getSavedMaterialIds();
    const customItems = readSavedValue('healthsyncCustomMaterials', []);
    const groups = document.getElementById('materials-groups');
    const common = document.getElementById('common-materials');
    if (!groups || !common) return;

    groups.innerHTML = selectedConditions.map((condition) => {
        const group = CONDITION_MATERIALS[condition];
        if (!group) return '';
        return `
            <section class="step-4-condition-group">
                <p class="step-4-group-heading">BECAUSE YOU CHOSE ${escapeHtml(group.label).toUpperCase()}</p>
                <div class="step-4-material-list">${group.items.map((item) => materialRow(item, selectedIds, !removeCustomMaterialsMode)).join('')}</div>
            </section>`;
    }).join('');

    const conditionItemNames = new Set(selectedConditions.flatMap((condition) => {
        const group = CONDITION_MATERIALS[condition];
        return group ? group.items.map((item) => item.name.toLowerCase()) : [];
    }));
    const commonItems = COMMON_MATERIALS.filter((item) => !conditionItemNames.has(item.name.toLowerCase()));
    common.innerHTML = commonItems.map((item) => materialRow(item, selectedIds, !removeCustomMaterialsMode)).join('')
        + customItems.map((item) => removeCustomMaterialsMode
            ? customMaterialRemovalRow(item)
            : materialRow(item, selectedIds)).join('');

    const removeButton = document.getElementById('remove-custom-items-button');
    const saveButton = document.getElementById('save-custom-removals-button');
    if (removeButton) removeButton.textContent = removeCustomMaterialsMode ? 'Cancel removal' : 'Remove item';
    if (saveButton) saveButton.hidden = !removeCustomMaterialsMode;

    document.querySelectorAll('[data-material-id]').forEach((input) => {
        input.addEventListener('change', saveMaterialIds);
    });
}

function toggleCustomMaterialRemoval() {
    const status = document.getElementById('materials-status');
    const customItems = readSavedValue('healthsyncCustomMaterials', []);

    if (!removeCustomMaterialsMode && !customItems.length) {
        if (status) status.textContent = 'There are no custom items to remove.';
        return;
    }

    removeCustomMaterialsMode = !removeCustomMaterialsMode;
    if (status) {
        status.textContent = removeCustomMaterialsMode
            ? 'Select the custom items you want to remove, then save changes.'
            : '';
    }
    renderMaterials();
}

function saveCustomMaterialRemovals() {
    const status = document.getElementById('materials-status');
    const selectedIds = [...document.querySelectorAll('[data-remove-custom-id]:checked')]
        .map((input) => input.dataset.removeCustomId);

    if (!selectedIds.length) {
        if (status) status.textContent = 'Select at least one custom item to remove.';
        return;
    }

    const idsToRemove = new Set(selectedIds);
    const customItems = readSavedValue('healthsyncCustomMaterials', []);
    const remainingItems = customItems.filter((item) => !idsToRemove.has(item.id));
    const selectedMaterials = getSavedMaterialIds().filter((id) => !idsToRemove.has(id));
    localStorage.setItem('healthsyncCustomMaterials', JSON.stringify(remainingItems));
    localStorage.setItem('healthsyncMaterials', JSON.stringify(selectedMaterials));
    removeCustomMaterialsMode = false;
    renderMaterials();
    if (status) status.textContent = '';
}

function addCustomMaterial() {
    const input = document.getElementById('custom-material-name');
    const reminderSelect = document.getElementById('custom-material-reminder');
    const name = input.value.trim();
    const status = document.getElementById('materials-status');
    if (!name) {
        status.textContent = 'Enter an item name first.';
        input.focus();
        return;
    }

    const customItems = readSavedValue('healthsyncCustomMaterials', []);
    const id = `custom-${Date.now()}`;
    const reminderLabels = {
        'air-quality': 'Remind me when air quality is poor',
        pressure: 'Remind me when pressure is shifting',
        uv: 'Remind me when UV is high',
        'dry-air': 'Remind me when the air is dry',
        heat: 'Remind me when it is hot out',
        always: 'Remind me whenever I go outside'
    };
    customItems.push({ id, name, trigger: reminderSelect.value, reminder: reminderLabels[reminderSelect.value] });
    localStorage.setItem('healthsyncCustomMaterials', JSON.stringify(customItems));
    const selectedIds = getSavedMaterialIds();
    selectedIds.push(id);
    localStorage.setItem('healthsyncMaterials', JSON.stringify(selectedIds));
    input.value = '';
    status.textContent = `${name} added.`;
    renderMaterials();
}

function finishSetup() {
    saveMaterialIds();
    localStorage.setItem('healthsyncSetupComplete', 'true');
    const status = document.getElementById('materials-status');
    if (status) status.textContent = 'Your carry list is saved.';
}