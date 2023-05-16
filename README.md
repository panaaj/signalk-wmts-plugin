# WMTS Chart provider for Signal K server

Signal K Node server `resource provider` plugin enabling the use of maps published via WMTS (Web Map Tile Server) hosts.

_**Note: Requires `Signal K` server running on `NodeJS` v18 or later!**_


The plugin supports the Signal K server v2 Resources API and can be used in conjunction with other chart `resource provider` plugins.

Chart metadata is made available to client apps via both `v1` and `v2` API paths.

| Server Version | API | Path |
|--- |--- |--- |
| 1.x.x | v1 | `/signalk/v1/api/resources/charts` |
| 2.x.x | v2 | `/signalk/v2/api/resources/charts` |


_Example:_
```JSON
{
    "mapa_base_rioja": {
		"identifier": "mapa_base_rioja",
		"name": "WMTS Mapa Base IDErioja",
		"description": "Mapa Base IDErioja",
		"type": "wmts",
		"bounds": [-180, -90, 180, 90],
		"format": "png",
		"tilemapUrl": "https://rts.larioja.org/wmts/mapa_base_rioja",
		"chartLayers": ["mapa_base_rioja"]
	}
}
```


### Usage

1. Install `signalk-wmts-plugin` from the **Appstore** screen in the Signal K server admin console

1. Once installed, restart the server and the locate `WMTS Chart provider` in the **Plugin Config** screen

1. Add the `url` for each WMTS host publishing the maps you require.

 _Important: The host url is the path to the WMTS service. 
 It should NOT contain _request_ or _service_ parameters!_

 _Example:_ 
 `https://rts.larioja.org/wmts/mapa_base_rioja`

_**The following example is incorrect!**_
 ```
 https://rts.larioja.org/wmts/mapa_base_rioja?service=wmts&request=GetCapabilities
 ```

4. Check **Disable** to not query the WMTS host. This allows multiple WMTS host entries to be maintained and only return map listings from selected ones.

1. Click **Submit** to save the changes.

1. **Enable** plugin

---

## System Requirements

- `Signal K` server running on `NodeJS` v18 (or later).

