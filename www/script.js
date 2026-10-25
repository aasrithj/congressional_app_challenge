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

    if (screenId === 'home-section') {
        createHomeSection();
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

document.addEventListener('click', (event) => {
    const menu = document.getElementById('nav-links');
    const button = document.getElementById('hamburger-button');

    if (!menu.contains(event.target) && !button.contains(event.target)) {
        toggleMenu(false);
    }
});

document.getElementById('nav-links').addEventListener('click', (event) => {
    const link = event.target.closest('a');

    if (link) {
        toggleMenu(false);
    }
});

const conditionDefaultsVersion = localStorage.getItem('healthsyncConditionDefaultsVersion');

if (conditionDefaultsVersion !== 'asthma-only-v3') {
    localStorage.setItem('healthsyncConditions', JSON.stringify(['asthma']));
    localStorage.setItem('healthsyncConditionDefaultsVersion', 'asthma-only-v3');
}

const savedConditions = readSavedValue('healthsyncConditions', ['asthma']);
document.querySelectorAll('#conditions-list input[data-value]').forEach((input) => {
    input.checked = savedConditions.includes(input.dataset.value);
});

document.getElementById('conditions-list').addEventListener('change', () => {
    const message = document.getElementById('conditions-error');
    if (message) message.textContent = '';
});

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

const savedReminders = readSavedValue('healthsyncReminders', ['morning-summary']);
document.querySelectorAll('#section-6-choices input[data-value]').forEach((input) => {
    input.checked = savedReminders.includes(input.dataset.value);
    input.addEventListener('change', saveReminders);
});

function saveReminders() {
    const reminders = [...document.querySelectorAll('#section-6-choices input:checked')]
        .map((input) => input.dataset.value);

    localStorage.setItem('healthsyncReminders', JSON.stringify(reminders));
}

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
        localStorage.setItem('healthsyncWeather', JSON.stringify({ weather, airQuality, location, savedAt: Date.now() }));
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
    setMaterialsError('');
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
    setMaterialsError('');
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



function setMaterialsError(message) {
    const error = document.getElementById('materials-error');
    if (error) error.textContent = message;
}

function continueFromMaterials() {
    const selected = document.querySelectorAll('#screen-setup-materials [data-material-id]:checked');

    if (!selected.length) {
        setMaterialsError('Please select one or more items to continue.');
        return;
    }

    setMaterialsError('');
    goTo('screen-risk-index');
}

function finishSetup() {
    if (document.getElementById('section-6-choices')) saveReminders();
    localStorage.setItem('healthsyncSetupComplete', 'true');
    goTo('home-section');
}

function startApp() {
    const setupDone = localStorage.getItem('healthsyncSetupComplete') === 'true';
    goTo(setupDone ? 'home-section' : 'screen-setup-conditions');
}

function goToTab(tabId) {
    const setupDone = localStorage.getItem('healthsyncSetupComplete') === 'true';
    if (!setupDone) {
        goTo('screen-setup-conditions');
        return;
    }
    goTo(document.getElementById(tabId) ? tabId : 'home-section');
}

const CONDITION_NAMES = {
    asthma: 'Asthma',
    migraine: 'Migraine',
    eczema: 'Eczema',
    'heart-related-condition': 'Heart / circulatory',
    other: 'Other condition',
    anemia: 'Anemia'
};

const CONDITION_WEIGHTS = {
    asthma:                    { aqi: 1, pm25: 1, ozone: 1, cold: 0.8, dry: 0.5, humid: 0.4 },
    migraine:                  { pressure: 1, heat: 0.8, humid: 0.6, uv: 0.5, pm25: 0.4 },
    eczema:                    { dry: 1, heat: 0.6, cold: 0.6, uv: 0.4, pm25: 0.4 },
    'heart-related-condition': { pm25: 1, heat: 1, aqi: 0.9, cold: 0.8, ozone: 0.6 },
    other:                     { pm25: 0.8, heat: 0.8, cold: 0.8, aqi: 0.7 },
    anemia:                    { heat: 0.7, cold: 0.7 }
};

const RISK_BANDS = [
    { max: 19, name: 'Good', color: '#00AD17', advice: 'Conditions look good. A great time to get outside.' },
    { max: 39, name: 'Moderate', color: '#E8C000', advice: 'Mostly fine. Keep an eye on how you feel.' },
    { max: 64, name: 'Caution', color: '#FF9000', advice: 'Shorten outdoor activity or move it to a better hour.' },
    { max: 100, name: 'Avoid', color: '#FF0000', advice: 'Stay inside if you can, or keep time outdoors very short.' }
];

let homeDay = 0;
let homeData = null;

const clamp = (value) => Math.max(0, Math.min(100, value));
const cToF = (celsius) => celsius * 9 / 5 + 32;
const ozoneToPpb = (microgramsPerM3) => microgramsPerM3 / 1.96;

function getBand(index) {
    return RISK_BANDS.find((band) => index <= band.max) || RISK_BANDS[RISK_BANDS.length - 1];
}

function factorScores(reading) {
    const scores = {};
    if (reading.aqi != null) scores.aqi = clamp(reading.aqi / 150 * 100);
    if (reading.pm25 != null) scores.pm25 = clamp(reading.pm25 / 55 * 100);
    if (reading.ozone != null) scores.ozone = clamp((ozoneToPpb(reading.ozone) - 30) / 55 * 100);
    if (reading.uv != null) scores.uv = clamp(reading.uv / 11 * 100);
    if (reading.tempF != null) {
        scores.heat = clamp((reading.tempF - 75) / 25 * 100);
        scores.cold = clamp((40 - reading.tempF) / 30 * 100);
    }
    if (reading.humidity != null) {
        scores.dry = clamp((40 - reading.humidity) / 25 * 100);
        scores.humid = clamp((reading.humidity - 70) / 30 * 100);
    }
    if (reading.pressureChange != null) scores.pressure = clamp(Math.abs(reading.pressureChange) / 4 * 100);
    return scores;
}

function conditionIndex(condition, reading) {
    const weights = CONDITION_WEIGHTS[condition] || CONDITION_WEIGHTS.other;
    const scores = factorScores(reading);
    const parts = Object.keys(weights)
        .filter((factor) => scores[factor] != null)
        .map((factor) => ({ factor, value: weights[factor] * scores[factor] }));
    if (!parts.length) return { index: 0, parts: [] };

    const worst = Math.max(...parts.map((part) => part.value));
    const average = parts.reduce((sum, part) => sum + part.value, 0) / parts.length;
    parts.sort((a, b) => b.value - a.value);
    return { index: Math.round(clamp(worst * 0.65 + average * 0.35)), parts };
}

function overallIndex(conditions, reading) {
    let result = { condition: conditions[0], index: 0, parts: [] };
    conditions.forEach((condition) => {
        const current = conditionIndex(condition, reading);
        if (current.index >= result.index) result = { condition, ...current };
    });
    return result;
}

function buildHourlyReadings(weather, airQuality) {
    const wh = weather.hourly || {};
    const ah = airQuality.hourly || {};
    const airIndexByTime = {};
    (ah.time || []).forEach((time, i) => { airIndexByTime[time] = i; });

    return (wh.time || []).map((time, i) => {
        const a = airIndexByTime[time];
        const earlier = i >= 3 ? wh.surface_pressure[i - 3] : null;
        return {
            time,
            hour: Number(time.slice(11, 13)),
            date: time.slice(0, 10),
            tempF: wh.temperature_2m[i] != null ? cToF(wh.temperature_2m[i]) : null,
            humidity: wh.relative_humidity_2m[i],
            uv: wh.uv_index ? wh.uv_index[i] : (a != null ? ah.uv_index[a] : null),
            pressureChange: earlier != null && wh.surface_pressure[i] != null ? wh.surface_pressure[i] - earlier : null,
            aqi: a != null ? ah.us_aqi[a] : null,
            pm25: a != null ? ah.pm2_5[a] : null,
            ozone: a != null ? ah.ozone[a] : null
        };
    });
}

function buildCurrentReading(weather, airQuality, hourly) {
    const wc = weather.current || {};
    const ac = airQuality.current || {};
    const hourKey = (wc.time || '').slice(0, 13);
    const nowHour = hourly.find((reading) => reading.time.slice(0, 13) === hourKey) || hourly[0] || {};
    return {
        time: wc.time,
        tempF: wc.temperature_2m != null ? cToF(wc.temperature_2m) : nowHour.tempF,
        humidity: wc.relative_humidity_2m != null ? wc.relative_humidity_2m : nowHour.humidity,
        uv: wc.uv_index != null ? wc.uv_index : (ac.uv_index != null ? ac.uv_index : nowHour.uv),
        pressureChange: nowHour.pressureChange,
        aqi: ac.us_aqi != null ? ac.us_aqi : nowHour.aqi,
        pm25: ac.pm2_5 != null ? ac.pm2_5 : nowHour.pm25,
        ozone: ac.ozone != null ? ac.ozone : nowHour.ozone
    };
}

function parseHour(text, fallback) {
    const match = String(text || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/);
    if (!match) return fallback;
    let hour = Number(match[1]) % 24;
    const meridiem = match[3];
    if (meridiem && meridiem.startsWith('p') && hour < 12) hour += 12;
    if (meridiem && meridiem.startsWith('a') && hour === 12) hour = 0;
    return hour;
}

function formatHour(hour) {
    const h = ((hour % 24) + 24) % 24;
    const suffix = h < 12 ? 'AM' : 'PM';
    return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

function findBestWindow(hours, wakeHour, sleepHour, fromHour) {
    const awake = hours.filter((h) => {
        const isAwake = wakeHour <= sleepHour ? h.hour >= wakeHour && h.hour < sleepHour : h.hour >= wakeHour || h.hour < sleepHour;
        return isAwake && h.hour >= fromHour;
    });
    if (!awake.length) return null;

    const best = awake.reduce((low, h) => (h.index < low.index ? h : low), awake[0]);
    let start = best.hour;
    let end = best.hour + 1;
    const byHour = {};
    awake.forEach((h) => { byHour[h.hour] = h; });
    while (byHour[start - 1] && byHour[start - 1].index <= best.index + 5 && end - start < 3) start -= 1;
    while (byHour[end] && byHour[end].index <= best.index + 5 && end - start < 3) end += 1;
    const worstInside = Math.max(...awake.filter((h) => h.hour >= start && h.hour < end).map((h) => h.index));
    return { start, end, index: worstInside };
}

function aqiCategory(aqi) {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for sensitive groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very unhealthy';
    return 'Hazardous';
}

function uvCategory(uv) {
    if (uv < 3) return 'Low';
    if (uv < 6) return 'Moderate';
    if (uv < 8) return 'High';
    if (uv < 11) return 'Very high';
    return 'Extreme';
}

function describeFactor(factor, reading) {
    const r = (value, digits = 0) => Number(value).toFixed(digits);
    switch (factor) {
        case 'aqi': return { title: `US AQI ${r(reading.aqi)}`, detail: `${aqiCategory(reading.aqi)} (0–50 is Good)`, source: 'AirNow: AQI basics', url: 'https://www.airnow.gov/aqi/aqi-basics/' };
        case 'pm25': return { title: `PM2.5 ${r(reading.pm25, 1)} µg/m³`, detail: `${reading.pm25 > 9 ? 'above' : 'below'} the 9 µg/m³ annual standard`, source: 'EPA particulate matter standards', url: 'https://www.epa.gov/pm-pollution/national-ambient-air-quality-standards-naaqs-pm' };
        case 'ozone': { const ppb = ozoneToPpb(reading.ozone); return { title: `Ozone ${r(ppb)} ppb`, detail: `${ppb > 54 ? 'above' : 'below'} the 54 ppb "Good" AQI level`, source: 'EPA ozone and your health', url: 'https://www.airnow.gov/aqi/aqi-basics/' }; }
        case 'uv': return { title: `UV index ${r(reading.uv, 1)}`, detail: `${uvCategory(reading.uv)}; sun protection advised at 3+`, source: 'EPA UV index scale', url: 'https://www.epa.gov/sunsafety/uv-index-scale-0' };
        case 'heat': return { title: `Temperature ${r(reading.tempF)}°F`, detail: 'Heat strains the heart and can trigger symptoms', source: 'NWS heat safety', url: 'https://www.weather.gov/safety/heat' };
        case 'cold': return { title: `Temperature ${r(reading.tempF)}°F`, detail: 'Cold air can tighten airways and blood vessels', source: 'NWS cold safety', url: 'https://www.weather.gov/safety/cold' };
        case 'dry': return { title: `Humidity ${r(reading.humidity)}%`, detail: 'Dry air (under 40%) dries out skin and airways', source: 'Open-Meteo forecast', url: 'https://open-meteo.com/' };
        case 'humid': return { title: `Humidity ${r(reading.humidity)}%`, detail: 'Very humid air (over 70%) can make breathing harder', source: 'Open-Meteo forecast', url: 'https://open-meteo.com/' };
        case 'pressure': return { title: `Pressure ${reading.pressureChange >= 0 ? '+' : ''}${r(reading.pressureChange, 1)} hPa in 3 hrs`, detail: 'Fast pressure changes are a common migraine trigger', source: 'Open-Meteo forecast', url: 'https://open-meteo.com/' };
        default: return { title: factor, detail: '', source: '', url: '' };
    }
}

function itemsToBringToday(hoursLeftToday) {
    const saved = readSavedValue('healthsyncMaterials', []);
    if (!saved.length) return [];

    const allItems = [
        ...Object.values(CONDITION_MATERIALS).flatMap((group) => group.items),
        ...COMMON_MATERIALS,
        ...readSavedValue('healthsyncCustomMaterials', [])
    ];
    const max = (key) => Math.max(0, ...hoursLeftToday.map((h) => h[key] || 0));
    const maxPressureSwing = Math.max(0, ...hoursLeftToday.map((h) => Math.abs(h.pressureChange || 0)));
    const minHumidity = Math.min(100, ...hoursLeftToday.map((h) => (h.humidity == null ? 100 : h.humidity)));
    const active = {
        always: true,
        'air-quality': max('aqi') > 100 || max('pm25') > 35,
        pressure: maxPressureSwing >= 3,
        uv: max('uv') >= 3,
        'dry-air': minHumidity < 35,
        heat: max('tempF') >= 85
    };

    const seen = new Set();
    return saved
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item) => item && active[item.trigger] && !seen.has(item.name.toLowerCase()) && seen.add(item.name.toLowerCase()));
}

function renderHourBars() {
    if (!homeData) return;
    const bars = document.getElementById('home-bars');
    const day = homeData.days[homeDay] || [];
    document.getElementById('home-day-today').classList.toggle('active', homeDay === 0);
    document.getElementById('home-day-tomorrow').classList.toggle('active', homeDay === 1);

    bars.innerHTML = day.map((h, i) => `
        <button class="home-bar${homeDay === 0 && h.hour === homeData.nowHour ? ' now' : ''}" type="button" data-i="${i}"
            style="height:${Math.max(6, h.index)}%; background:${getBand(h.index).color}"
            aria-label="${formatHour(h.hour)}: index ${h.index}"></button>`).join('');

    bars.querySelectorAll('.home-bar').forEach((bar) => {
        bar.addEventListener('click', () => {
            const h = day[Number(bar.dataset.i)];
            bars.querySelectorAll('.home-bar').forEach((b) => b.classList.remove('selected'));
            bar.classList.add('selected');
            const bits = [];
            if (h.aqi != null) bits.push(`AQI ${Math.round(h.aqi)}`);
            if (h.pm25 != null) bits.push(`PM2.5 ${h.pm25.toFixed(1)}`);
            if (h.uv != null) bits.push(`UV ${h.uv.toFixed(1)}`);
            if (h.tempF != null) bits.push(`${Math.round(h.tempF)}°F`);
            if (h.humidity != null) bits.push(`${Math.round(h.humidity)}% humidity`);
            document.getElementById('home-hour-detail').textContent =
                `${formatHour(h.hour)}: index ${h.index} (${getBand(h.index).name}) · ${bits.join(' · ')}`;
        });
    });
}

function setHomeDay(day) {
    homeDay = day;
    document.getElementById('home-hour-detail').textContent = "Tap a bar to see that hour's values.";
    renderHourBars();
}

function showHomeMessage(text) {
    const message = document.getElementById('home-message');
    message.textContent = text;
    message.hidden = !text;
    document.getElementById('home-dashboard').hidden = Boolean(text);
}

async function refreshHome() {
    const location = readSavedValue('healthsyncLocation');
    const button = document.getElementById('home-refresh');
    if (!location) {
        showHomeMessage('Add your location in setup so we can load local weather and air quality.');
        return;
    }
    button.disabled = true;
    button.textContent = 'Refreshing…';
    await loadWeatherForLocation(location);
    button.disabled = false;
    button.textContent = 'Refresh';
    createHomeSection(true);
}

function createHomeSection(skipAutoRefresh = false) {
    const conditions = readSavedValue('healthsyncConditions', []);
    const saved = readSavedValue('healthsyncWeather');
    const schedule = readSavedValue('healthsyncSchedule', {});

    document.getElementById('home-date').textContent = new Date()
        .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

    if (!conditions.length) {
        showHomeMessage('Pick at least one condition in setup to see your risk index.');
        return;
    }
    if (!saved || !saved.weather || !saved.airQuality) {
        document.getElementById('home-location').textContent = '';
        showHomeMessage('Loading weather and air quality…');
        if (!skipAutoRefresh) refreshHome();
        else showHomeMessage('Weather data could not load. Check your connection and tap Refresh.');
        return;
    }

    const ageMinutes = (Date.now() - (saved.savedAt || 0)) / 60000;
    if (!skipAutoRefresh && saved.savedAt && ageMinutes > 60) {
        refreshHome();
        return;
    }

    showHomeMessage('');
    const { weather, airQuality, location } = saved;
    document.getElementById('home-location').textContent = location && location.label ? location.label : '';

    const hourly = buildHourlyReadings(weather, airQuality);
    const now = buildCurrentReading(weather, airQuality, hourly);
    const current = overallIndex(conditions, now);
    const band = getBand(current.index);
    const worstName = CONDITION_NAMES[current.condition] || current.condition;

    document.getElementById('current-risk-index-title').innerHTML =
        `CURRENT RISK INDEX FOR <span class="home-highlight">${escapeHtml(worstName.toUpperCase())}</span>`;
    document.getElementById('home-score').textContent = current.index;
    const bandLabel = document.getElementById('home-band');
    bandLabel.textContent = band.name.toUpperCase();
    bandLabel.style.color = band.color === '#E8C000' ? '#9A7F00' : band.color;
    document.getElementById('home-scale-marker').style.left = `${current.index}%`;
    document.getElementById('home-advice').textContent = conditions.length > 1
        ? `${band.advice} Driven by ${worstName.toLowerCase()}, your highest-risk condition right now, not an average.`
        : band.advice;

    const top = current.parts.filter((part) => part.value > 0).slice(0, 2);
    document.getElementById('home-contributors').innerHTML = top.length
        ? top.map((part) => {
            const info = describeFactor(part.factor, now);
            return `
                <div class="home-contributor">
                    <p class="home-contributor-title">${escapeHtml(info.title)}</p>
                    <p class="home-contributor-detail">${escapeHtml(info.detail)}</p>
                    <a class="home-source" href="${info.url}" target="_blank" rel="noopener">${escapeHtml(info.source)} ↗</a>
                </div>`;
        }).join('')
        : '<p class="home-contributor-detail">Nothing is raising your risk right now.</p>';

    hourly.forEach((h) => { h.index = overallIndex(conditions, h).index; });
    const dates = [...new Set(hourly.map((h) => h.date))];
    const nowHour = Number(String(now.time || '').slice(11, 13)) || new Date().getHours();
    homeData = { days: [hourly.filter((h) => h.date === dates[0]), hourly.filter((h) => h.date === dates[1])], nowHour };
    renderHourBars();

    const wakeHour = parseHour(schedule.wake, 7);
    const sleepHour = parseHour(schedule.sleep, 22);
    let windowDay = 'TODAY';
    let best = findBestWindow(homeData.days[0], wakeHour, sleepHour, nowHour);
    if (!best && homeData.days[1].length) {
        best = findBestWindow(homeData.days[1], wakeHour, sleepHour, 0);
        windowDay = 'TOMORROW';
    }
    document.getElementById('home-window-label').textContent = `BEST WINDOW FOR ${windowDay}`;
    if (best) {
        const bestBand = getBand(best.index);
        document.getElementById('home-window-time').textContent = `${formatHour(best.start)} – ${formatHour(best.end)}`;
        document.getElementById('home-window-detail').textContent = `Index ${best.index} / 100 · ${bestBand.name}`;
    } else {
        document.getElementById('home-window-time').textContent = 'No window found';
        document.getElementById('home-window-detail').textContent = 'Check your wake and sleep times in setup.';
    }

    const hoursLeft = homeData.days[0].filter((h) => h.hour >= nowHour);
    const bring = itemsToBringToday(hoursLeft.length ? hoursLeft : homeData.days[0]);
    document.getElementById('home-carry-list').innerHTML = bring.length
        ? bring.map((item) => `
            <div class="home-carry-item">
                <span class="home-carry-dot"></span>
                <span><b>${escapeHtml(item.name)}</b><br><span class="home-contributor-detail">${escapeHtml(item.reminder)}</span></span>
            </div>`).join('')
        : '<p class="home-contributor-detail">Nothing extra needed today based on your carry list.</p>';

    const measures = [
        { label: 'US AQI', value: now.aqi != null ? Math.round(now.aqi) : '--', note: now.aqi != null ? `${aqiCategory(now.aqi)} · 0–500` : '' },
        { label: 'PM2.5', value: now.pm25 != null ? now.pm25.toFixed(1) : '--', note: 'µg/m³' },
        { label: 'OZONE', value: now.ozone != null ? Math.round(ozoneToPpb(now.ozone)) : '--', note: 'ppb' },
        { label: 'UV INDEX', value: now.uv != null ? now.uv.toFixed(1) : '--', note: now.uv != null ? `${uvCategory(now.uv)} · 0–11+` : '' },
        { label: 'TEMP', value: now.tempF != null ? `${Math.round(now.tempF)}°` : '--', note: 'Fahrenheit' },
        { label: 'HUMIDITY', value: now.humidity != null ? `${Math.round(now.humidity)}%` : '--', note: 'relative' }
    ];
    document.getElementById('home-measures').innerHTML = measures.map((m) => `
        <div class="home-measure">
            <p class="home-measure-label">${m.label}</p>
            <p class="home-measure-value">${m.value}</p>
            <p class="home-measure-note">${m.note}</p>
        </div>`).join('');

    document.getElementById('home-conditions').innerHTML = conditions.map((condition) => {
        const result = conditionIndex(condition, now);
        const conditionBand = getBand(result.index);
        return `
            <div class="home-condition-row">
                <span class="home-condition-name">${escapeHtml(CONDITION_NAMES[condition] || condition)}</span>
                <span class="home-condition-score"><span class="home-condition-dot" style="background:${conditionBand.color}"></span>${result.index} / 100 · ${conditionBand.name}</span>
            </div>`;
    }).join('');

    const updated = saved.savedAt ? new Date(saved.savedAt) : null;
    document.getElementById('home-updated').textContent = updated
        ? `Updated ${updated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Data changes constantly, so tap "Refresh" for the latest.`
        : 'Data changes constantly, so tap Refresh for the latest.';
}