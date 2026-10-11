(() => {
    const MAIL_TO = "christian@braukmueller.de";
    const TEMPLATE_KEY = "_emptyTemplate";
    let locations = null;
    let modal;

    const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
    const countryEntries = data => Object.entries(data).filter(([country, cities]) =>
        !country.startsWith("_") && isRecord(cities)
    );
    const eventEntries = data => countryEntries(data).flatMap(([country, cities]) =>
        Object.entries(cities).filter(([, event]) => isRecord(event) && Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lon)))
            .map(([city, event]) => ({ country, city, event }))
    );
    const compareNorthToSouth = (first, second) =>
        Number(second.lat) - Number(first.lat) || Number(first.lon) - Number(second.lon);
    const countryCodes = {
        Germany: "DE", Austria: "AT", Switzerland: "CH", Poland: "PL", Ireland: "IE",
        Australia: "AU", USA: "US", "United States": "US", Greece: "GR", Spain: "ES",
        Morocco: "MA", Denmark: "DK", "United Kingdom": "GB", Netherlands: "NL",
        "New Zealand": "NZ", "Czech Republic": "CZ", "Korea, South": "KR"
    };
    const mapCountryNames = { USA: "United States of America" };

    function countryFlag(country) {
        const code = countryCodes[country];
        if (!code) return "🌐";
        return String.fromCodePoint(...[...code].map(letter => 127397 + letter.charCodeAt(0)));
    }

    function updateStatistics(data) {
        const entries = eventEntries(data);
        const counts = {
            "count-loc": entries.length,
            "count-country": new Set(entries.map(entry => entry.country)).size,
            "gemini-count-loc": entries.length,
            "gemini-count-country": new Set(entries.map(entry => entry.country)).size
        };
        Object.entries(counts).forEach(([id, count]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = String(count);
        });
    }

    function addStyles() {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "map-app.css";
        document.head.append(link);
    }

    function makeButton(label, className, callback, title) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        if (title) button.title = title;
        button.addEventListener("click", callback);
        return button;
    }

    function setLinkedHighlight(tile, eventIndex, active) {
        const selector = `[data-event-index="${eventIndex}"]`;
        tile.querySelectorAll(selector).forEach(element => element.classList.toggle("is-linked-active", active));
    }

    function centerLinkedEvent(tile, eventIndex) {
        const eventCard = tile.querySelector(`.city-item[data-event-index="${eventIndex}"]`);
        if (!eventCard) return;
        const list = eventCard.closest(".city-list");
        if (!list || !tile.classList.contains("country-tile-scrollable")) return;
        const listBounds = list.getBoundingClientRect();
        const eventBounds = eventCard.getBoundingClientRect();
        const eventCenter = eventBounds.top + eventBounds.height / 2;
        const listCenter = listBounds.top + list.clientHeight / 2;
        list.scrollTo({
            top: Math.max(0, list.scrollTop + eventCenter - listCenter),
            behavior: "instant"
        });
    }

    function updateMapStickyState() {
        const hasNav = document.body.classList.contains("has-map-nav");
        const topOffset = hasNav ? 96 : 16;
        const availableHeight = window.innerHeight - topOffset - 16;
        document.querySelectorAll(".country-tile").forEach(tile => {
            const panel = tile.querySelector(".side-panel");
            tile.classList.toggle("country-tile-scrollable", Boolean(panel && panel.scrollHeight > availableHeight));
        });
    }

    function createControls() {
        const button = makeButton("Add new event", "add-event-button", () => openForm(), "Create a new location entry");
        button.id = "addEventButton";
        document.body.prepend(button);

        modal = document.createElement("dialog");
        modal.className = "event-dialog";
        modal.setAttribute("aria-labelledby", "eventDialogTitle");
        modal.innerHTML = `
            <form class="event-form" id="eventForm">
                <div class="event-dialog-heading">
                    <div><p class="event-eyebrow">SAP Stammtisch directory</p><h2 id="eventDialogTitle">Add new event</h2></div>
                    <button class="dialog-close" type="button" aria-label="Close">×</button>
                </div>
                <p class="event-form-note">Latitude and longitude are looked up automatically from the city and country. Submitting opens a prefilled email; the JSON file itself is not changed by this page.</p>
                <label>Country<input name="country" autocomplete="country-name" required></label>
                <label>City / location<input name="city" autocomplete="address-level2" required></label>
                <label>Organizers<input name="organizers" required></label>
                <label>Group URL<input name="group" type="url" placeholder="https://…" required></label>
                <label>Remarks<textarea name="remarks" rows="3"></textarea></label>
                <p class="geocode-status" role="status" aria-live="polite"></p>
                <div class="event-form-actions">
                    <button class="dialog-cancel" type="button">Cancel</button>
                    <button class="dialog-submit" type="submit">Prepare email</button>
                </div>
            </form>`;
        document.body.append(modal);
        modal.querySelector(".dialog-close").addEventListener("click", () => modal.close());
        modal.querySelector(".dialog-cancel").addEventListener("click", () => modal.close());
        modal.querySelector("form").addEventListener("submit", submitForm);
    }

    function openForm(entry) {
        const form = modal.querySelector("form");
        form.reset();
        form.dataset.originalCountry = entry?.country || "";
        form.dataset.originalCity = entry?.city || "";
        form.dataset.original = entry ? JSON.stringify(entry.event) : "";
        form.dataset.mode = entry ? "edit" : "add";
        modal.querySelector("h2").textContent = entry ? "Change event" : "Add new event";
        modal.querySelector(".dialog-submit").textContent = entry ? "Prepare change email" : "Prepare email";
        modal.querySelector(".geocode-status").textContent = "";
        if (entry) {
            for (const name of ["country", "city", "organizers", "group", "remarks"]) {
                form.elements[name].value = name === "country" ? entry.country : name === "city" ? entry.city : (entry.event[name] || "");
            }
        }
        modal.showModal();
        form.elements.country.focus();
    }

    async function lookupCoordinates(city, country, status) {
        status.textContent = "Looking up coordinates…";
        const params = new URLSearchParams({
            format: "jsonv2",
            limit: "1",
            city,
            country
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
            headers: { "Accept-Language": "en" }
        });
        if (!response.ok) throw new Error("The geocoding service is unavailable.");
        const results = await response.json();
        if (!results.length) throw new Error("No coordinates found. Check the city and country spelling and try again.");
        status.textContent = `Coordinates found: ${Number(results[0].lat).toFixed(4)}, ${Number(results[0].lon).toFixed(4)}`;
        return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
    }

    function changedFields(before, after) {
        const fields = ["country", "city", "organizers", "group", "remarks", "lat", "lon"];
        const changes = [];
        fields.forEach(field => {
            const oldValue = before[field] ?? "";
            const newValue = after[field] ?? "";
            if (String(oldValue) !== String(newValue)) {
                changes.push(`${field}:\n  Before: ${oldValue || "(empty)"}\n  After:  ${newValue || "(empty)"}`);
            }
        });
        return changes;
    }

    async function submitForm(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const status = modal.querySelector(".geocode-status");
        const submit = modal.querySelector(".dialog-submit");
        const country = form.elements.country.value.trim();
        const city = form.elements.city.value.trim();
        const originalCountry = form.dataset.originalCountry;
        const originalCity = form.dataset.originalCity;
        const isEdit = form.dataset.mode === "edit";
        const oldEvent = isEdit ? JSON.parse(form.dataset.original) : null;

        submit.disabled = true;
        try {
            let coordinates;
            if (isEdit && country === originalCountry && city === originalCity) {
                coordinates = { lat: oldEvent.lat, lon: oldEvent.lon };
            } else {
                coordinates = await lookupCoordinates(city, country, status);
            }

            const updatedEvent = {
                lat: coordinates.lat,
                lon: coordinates.lon,
                organizers: form.elements.organizers.value.trim(),
                group: form.elements.group.value.trim(),
                remarks: form.elements.remarks.value.trim()
            };
            const targetCity = city;
            const currentCountry = country;
            const nextData = structuredClone(locations);
            if (isEdit) {
                const oldCities = nextData[originalCountry];
                if ((originalCountry !== currentCountry || originalCity !== targetCity) && nextData[currentCountry]?.[targetCity]) {
                    throw new Error("That country/location already exists. Edit the existing entry instead.");
                }
                delete oldCities[originalCity];
                if (!Object.keys(oldCities).length) delete nextData[originalCountry];
            } else if (nextData[currentCountry]?.[targetCity]) {
                throw new Error("That country/location already exists. Use its Change button instead.");
            }
            if (!isRecord(nextData[currentCountry])) nextData[currentCountry] = {};
            nextData[currentCountry][targetCity] = updatedEvent;
            if (!nextData[TEMPLATE_KEY]) nextData[TEMPLATE_KEY] = { "New Country": { "New Location": {} } };

            const heading = isEdit ? `Change SAP Stammtisch: ${targetCity}, ${currentCountry}` : `Add SAP Stammtisch: ${targetCity}, ${currentCountry}`;
            const overview = isEdit
                ? changedFields({ country: originalCountry, city: originalCity, ...oldEvent }, { country: currentCountry, city: targetCity, ...updatedEvent }).join("\n\n")
                : `New location: ${targetCity}, ${currentCountry}\nOrganizers: ${updatedEvent.organizers}\nGroup: ${updatedEvent.group}\nRemarks: ${updatedEvent.remarks || "(empty)"}`;
            const body = `${isEdit ? "Changed fields (before / after):" : "New event overview:"}\n${overview || "No values changed."}\n\nUpdated JSON structure:\n${JSON.stringify(nextData, null, 2)}\n`;
            const mailto = `mailto:${MAIL_TO}?subject=${encodeURIComponent(heading)}&body=${encodeURIComponent(body)}`;
            modal.close();
            window.location.href = mailto;
        } catch (error) {
            status.textContent = error.message || "Could not prepare the email.";
            status.classList.add("geocode-error");
        } finally {
            submit.disabled = false;
        }
    }

    function renderDirectory(data) {
        const directory = document.getElementById("locationDirectory");
        if (!directory) return;
        directory.replaceChildren();
        const entries = eventEntries(data);
        countryEntries(data).forEach(([country, cities]) => {
            Object.entries(cities)
                .filter(([, event]) => isRecord(event) && Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lon)))
                .sort(([, first], [, second]) => compareNorthToSouth(first, second))
                .forEach(([city, event]) => {
                const card = document.createElement("article");
                card.className = "directory-event-card";
                const titleRow = document.createElement("div");
                titleRow.className = "directory-event-title";
                const title = document.createElement("h3");
                title.textContent = city;
                const countryLabel = document.createElement("p");
                countryLabel.className = "directory-country";
                countryLabel.textContent = `${countryFlag(country)} ${country}`;
                const organizer = document.createElement("div");
                organizer.className = "directory-organizer-row";
                const edit = makeButton("✎ Change", "event-change-button event-change-inline", () => openForm({ country, city, event }), `Change ${city}`);
                edit.setAttribute("aria-label", `Change ${city}`);
                const organizerText = document.createElement("span");
                organizerText.textContent = `Organizers: ${event.organizers || "Not listed"}`;
                organizer.append(edit, organizerText);
                const remarks = document.createElement("p");
                remarks.textContent = event.remarks || "";
                const link = document.createElement("a");
                link.href = event.group || "#";
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.className = "event-group-link";
                link.textContent = "Open Group ↗";
                titleRow.append(title, link);
                card.append(titleRow, countryLabel, organizer);
                if (event.remarks) card.append(remarks);
                directory.append(card);
                });
        });
        if (!entries.length) directory.textContent = "No locations are listed yet.";
    }

    function renderMapPages(data) {
        const container = document.getElementById("container");
        if (!container) return;
        container.replaceChildren();
        const countries = countryEntries(data);
        const nav = document.getElementById("navLane");
        document.body.classList.toggle("has-map-nav", Boolean(nav));
        if (nav) {
            nav.replaceChildren();
            countries.forEach(([country, cities]) => {
                const count = Object.values(cities).filter(event => isRecord(event) && Number.isFinite(Number(event.lat))).length;
                const button = makeButton("", "country-btn", () => document.getElementById(`tile-${CSS.escape(country)}`)?.scrollIntoView({ behavior: "smooth" }));
                const flag = document.createElement("span");
                flag.className = "country-flag";
                flag.textContent = countryFlag(country);
                const label = document.createElement("span");
                label.className = "country-btn-label";
                label.textContent = `${country} (${count})`;
                label.prepend(flag);
                button.append(label);
                nav.append(button);
            });
        }

        const validCountries = countries.map(([country, cities]) => [country, Object.entries(cities).filter(([, event]) => isRecord(event) && Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lon)))]).filter(([, cities]) => cities.length);
        const drawCountries = world => {
            validCountries.forEach(([country, cities]) => {
            const tile = document.createElement("section");
            tile.className = "country-tile";
            tile.id = `tile-${country}`;
            tile.dataset.eventCount = String(cities.length);
            tile.style.minHeight = `${Math.max(420, cities.length * 92 + 100)}px`;
            const mapArea = document.createElement("div");
            mapArea.className = "map-area";
            const panel = document.createElement("div");
            panel.className = "side-panel";
            const header = document.createElement("div");
            header.className = "panel-header";
            const flag = document.createElement("span");
            flag.className = "country-flag";
            flag.textContent = countryFlag(country);
            const countryName = document.createElement("span");
            countryName.textContent = country;
            header.append(flag, countryName);
            const list = document.createElement("div");
            list.className = "city-list";
            panel.append(header, list);
            tile.append(mapArea, panel);
            container.append(tile);

            const records = cities.map(([city, event]) => ({ city, country, ...event }));
            records.sort(compareNorthToSouth);
            records.forEach((record, eventIndex) => {
                const item = document.createElement("article");
                item.className = "city-item";
                item.dataset.eventIndex = String(eventIndex);
                const name = document.createElement("div");
                name.className = "city-name";
                const cityName = document.createElement("span");
                cityName.textContent = record.city;
                const link = document.createElement("a");
                link.className = "event-group-link";
                link.href = record.group || "#";
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "Open Group ↗";
                name.append(cityName, link);
                const details = document.createElement("div");
                details.className = "city-details organizer-row";
                const change = makeButton("✎ Change", "event-change-button event-change-inline", () => openForm({ country, city: record.city, event: record }), `Change ${record.city}`);
                change.setAttribute("aria-label", `Change ${record.city}`);
                const organizers = document.createElement("span");
                organizers.textContent = `Organizers: ${record.organizers || "Not listed"}`;
                details.append(change, organizers);
                const remarks = document.createElement("div");
                remarks.className = "city-details city-remarks";
                remarks.textContent = record.remarks || "";
                item.append(name, details);
                if (record.remarks) item.append(remarks);
                item.addEventListener("mouseenter", () => setLinkedHighlight(tile, eventIndex, true));
                item.addEventListener("mouseleave", () => setLinkedHighlight(tile, eventIndex, false));
                list.append(item);
            });

            if (window.d3 && window.topojson && world) {
                const width = 600;
                const height = Math.max(420, cities.length * 92 + 100);
                const svg = d3.select(mapArea).append("svg").attr("viewBox", `0 0 ${width} ${height}`).style("width", "100%").style("height", "100%");
                const mapCountry = mapCountryNames[country] || country;
                const feature = topojson.feature(world, world.objects.countries).features.find(item => item.properties.name === mapCountry);
                if (feature) {
                    const projection = d3.geoMercator().fitSize([width - 70, height - 70], feature);
                    svg.append("path").datum(feature).attr("class", "land svg-shadow").attr("d", d3.geoPath().projection(projection));
                    svg.selectAll("circle").data(records).enter().append("circle").attr("class", "dot")
                        .attr("data-event-index", (_record, index) => String(index))
                        .attr("cx", d => projection([Number(d.lon), Number(d.lat)])[0])
                        .attr("cy", d => projection([Number(d.lon), Number(d.lat)])[1]).attr("r", 9)
                        .attr("tabindex", 0)
                        .attr("role", "button")
                        .attr("aria-label", d => `${d.city}, ${country}: show event details`)
                        .on("mouseenter focus", event => {
                            const eventIndex = event.currentTarget.dataset.eventIndex;
                            setLinkedHighlight(tile, eventIndex, true);
                            centerLinkedEvent(tile, eventIndex);
                        })
                        .on("mouseleave blur", event => setLinkedHighlight(tile, event.currentTarget.dataset.eventIndex, false))
                        .on("click keydown", (event) => {
                            if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
                            if (event.type === "keydown") event.preventDefault();
                            centerLinkedEvent(tile, event.currentTarget.dataset.eventIndex);
                        })
                        .append("title").text(d => `${d.city} — ${d.organizers || "Not listed"}`);
                } else {
                    mapArea.classList.add("map-fallback");
                    mapArea.textContent = `${countryFlag(country)} ${country}`;
                }
            } else {
                mapArea.classList.add("map-fallback");
                mapArea.textContent = `${countryFlag(country)} ${country}`;
            }
            });
            updateMapStickyState();
        };

        if (window.d3 && window.topojson) {
            d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
                .then(drawCountries)
                .catch(() => drawCountries(null));
        } else {
            drawCountries(null);
        }
    }

    async function initialize() {
        addStyles();
        createControls();
        window.addEventListener("resize", updateMapStickyState);
        try {
            locations = await fetch("location.json").then(response => {
                if (!response.ok) throw new Error(`Could not load location.json (${response.status}).`);
                return response.json();
            });
            updateStatistics(locations);
            renderDirectory(locations);
            renderMapPages(locations);
        } catch (error) {
            const message = document.createElement("p");
            message.className = "map-load-error";
            message.textContent = `${error.message} Please open this page through a local web server.`;
            document.body.append(message);
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
