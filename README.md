# Tileserver-php Charts Plugin for Signal K:

**Signal K Server** helper plugin for **Tileserver-php** that 
acts as a Charts resource provider for the `/resurces/charts` Signal K path.

---
_Note: this plugin requires a connection to a running `tileserver-php` instance._

---

#### Operation:

Configure the plugin with the url to the `tileserver-php` service

Once configured and the enabled the plugin will query the `tileserver-php` service and use the `getCapabilities.xml` response to generate the following entries for each map layer:

-  `WTMS`: Signal K chart entry containing a url to the WTMS endpoint specifying the layer to be displayed.

```JSON
{
    "Kvarken": {
        "identifier":"Kvarken",
        "name":"Kvarken",
        "description":"",
        "sourceType":"wmts",
        "url":"http://localhost/wmts",
        "layers":["Kvarken"]
    }
}
```

-  `TileJSON`: Signal K chart entry containing a url to a TileJSON file for the layer.

```JSON
{
    "Kvarken-tilejson": {
        "identifier":"Kvarken-tilejson",
        "name":"Kvarken",
        "description":"",
        "sourceType":"tilejson",
        "url":"http://localhost/wmts/Kvarken.json"
    }
}
```

-  `metadata`: Signal K chart entry containing the TileJSON metadata for the layer.

```JSON
{
    "Kvarken-metadata": {
        "name":"Kvarken",
        "description":"Umeu00e5 to Hu00e4rnu00f6sand",
        "format":"png",
        "bounds":[17.899475097656,62.609771662592,23.090515136719,63.834613378993],
        "center":"20.4949951171875,63.222192520792646,17","minzoom":3,
        "maxzoom":17,
        "profile":"mercator",
        "tilesize":"256",
        "scheme":"xyz",
        "type":"overlay",
        "basename":"Kvarken",
        "scale":1,
        "tiles":["http://localhost/wmts/Kvarken/{z}/{x}/{y}.png"],"tilejson":"2.0.0",
        "identifier":"Kvarken-metadata",
        "sourceType":"tilelayer"
    }
}
```


