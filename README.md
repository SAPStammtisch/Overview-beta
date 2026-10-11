# SAP Stammtisch Global Community Map

This project presents community-led SAP Stammtisch groups around the world. A Stammtisch is an informal meetup where SAP professionals, developers, consultants, and enthusiasts can connect and share knowledge.

The main map page is [`maps/index.html`](maps/index.html). It displays locations from [`maps/location.json`](maps/location.json) and uses shared application logic from [`maps/map-app.js`](maps/map-app.js), with shared styles in [`maps/map-app.css`](maps/map-app.css).

## What the page does

- Shows the number of listed locations and countries, calculated from the loaded data.
- Groups locations by country and displays country flags, an interactive map, and the corresponding event list.
- Sorts locations within each country from north to south using their latitude.
- Connects map markers and event cards: hovering or focusing a marker highlights its event, and the event list scrolls to it. For long lists, the map stays in view while the list scrolls independently.
- Provides **Find a location close to you**. With the visitor's permission, it searches for up to three listed Stammtisch locations within 100 km, shows the detected coordinates and distances, and lets the visitor jump to a result. If none are nearby, it suggests starting a new group.
- Provides **Add new event** and a **Change** action on each event. The form looks up coordinates automatically. Submitting opens a prefilled email to the project contact with the proposed JSON; edits also include a before/after summary.

The page does not update the JSON file or send email itself. A visitor reviews and sends the email, and the data file must then be updated separately.

## Data format

The JSON is organized by country, then by city/location. Each location contains coordinates, organizers, a group URL, and remarks. The reserved `_emptyTemplate` branch is only a blank structural example and is ignored by the page when rendering locations.

```json
{
	"Germany": {
		"Berlin": {
			"lat": 52.52,
			"lon": 13.405,
			"organizers": "Example organizers",
			"group": "https://example.com/group",
			"remarks": ""
		}
	},
	"_emptyTemplate": {
		"New Country": {
			"New Location": {}
		}
	}
}
```

## Run locally

The page fetches its JSON data, so open it through a local web server rather than directly as a `file://` URL. For example, run a static server with `maps/` as its document root, then open `index.html` at the server address. A Live Server extension in VS Code also works.

The maps use D3.js and TopoJSON, and the country outlines are loaded from the World Atlas CDN. The location finder requires browser geolocation permission and a secure context such as HTTPS or localhost.