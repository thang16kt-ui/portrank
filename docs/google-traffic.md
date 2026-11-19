# Google traffic on the selected road route

The Google road renderer now requests `TRAFFIC_ON_POLYLINE` and renders Google's
`NORMAL`, `SLOW`, and `TRAFFIC_JAM` intervals against the exact returned geometry.
Missing or malformed intervals remain gray/unknown. No artificial rush-hour colors
or guessed congestion delays are generated. The server forwards the selected
future departure time with `TRAFFIC_AWARE_OPTIMAL`.

The playback panel contains the simulation clock, estimated arrival, status,
play/pause, progress and speeds down to 0.05x (default 0.1x). The clock covers the
provider's total driving duration. The CSS 3D truck is paced by distance and
categorical traffic weights; this is visual interpolation, not measured speed or
an exact per-segment schedule. Playback does not issue API calls on every frame.

## Credentials required before activation

Enable Routes API and Maps JavaScript API in the intended Google Cloud project.
Google requires a billing-enabled project; review the traffic-aware route SKU and
map-load quotas before enabling production traffic. This change does not create a
billing account, create credentials, or change the current routing provider.

Configure the existing Render service's environment (never put server keys in git):

| Key | Purpose |
| --- | --- |
| `GOOGLE_ROUTES_API_KEY` | Server-only key restricted to Routes API. Do not use a browser referrer restriction on this key; use an appropriate server restriction where available. |
| `GOOGLE_MAPS_BROWSER_KEY` | Separate key restricted to Maps JavaScript API and the site's HTTPS referrer, `https://portrank-road-google-maps.onrender.com/*`. This key is intentionally sent to the browser. |
| `ROAD_ROUTING_PROVIDER` | Set to `google` only after both keys are configured and a live test is possible. |

Never paste keys into chat or commit `.env` values. Enter them in Render's secure
environment editor. Preserve unrelated variables. Current service has no Google
keys, so activation and live-data verification are pending.

## Validation before rollout

1. Check that Routes API returns actual traffic intervals for the selected Vietnam
   route, rather than only a total ETA. Missing coverage must remain unknown.
2. Test the same endpoints for future departure times on the same date. Verify the
   returned traffic semantics before claiming historical congestion by hour. A
   lack of changed colors is not evidence that future traffic is identical.
3. Verify that the restricted browser key loads Google Maps on the deployed host.
4. Check color boundaries, simulation clock, endpoints and alternative route changes.

This implementation covers the Google **road mode**. Sea-mode inland requests
explicitly use the existing TomTom key and renderer, even when road mode selects
Google. Google Routes geometry must never be shown on the OSM/MapLibre map.
The existing TomTom configuration remains active while credentials are absent.

No driver or rest settings are added. Route profile is DRIVE; truck-specific
restrictions are not verified. Traffic predictions cannot guarantee future events.

References:
- https://developers.google.com/maps/documentation/routes/traffic_on_polylines
- https://developers.google.com/maps/documentation/routes/config_trade_offs
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/SpeedReadingInterval
- https://cloud.google.com/maps-platform/terms/maps-service-terms
