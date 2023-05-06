/*
 * Copyright 2018 Adrian Panazzolo <panaaj@hotmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  Plugin,
  PluginServerApp,
  ResourceProviderRegistry
} from '@signalk/server-api'
import { Request, Response, Application } from 'express'
import { parseString } from 'xml2js'

interface ChartProvider {
  identifier: string
  name: string
  description: string
  type: 'wmts'
  v1?: {
    tilemapUrl: string
    chartLayers: string[]
  }
  v2?: {
    url: string
    layers: string[]
  }
  bounds?: number[]
  minzoom?: number
  maxzoom?: number
  format?: string
  layers?: string[]
}

interface ChartProviders {
  [key: string]: ChartProvider
}

// ***********************************************
interface Config {
  url: string
}

interface ChartProviderApp
  extends PluginServerApp,
    ResourceProviderRegistry,
    Application {
  statusMessage?: () => string
  error: (msg: string) => void
  debug: (...msg: unknown[]) => void
  setPluginStatus: (pluginId: string, status?: string) => void
  setPluginError: (pluginId: string, status?: string) => void
  config: {
    version: string
  }
}

const CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      title: 'Path to WMTS capabilities metadata.',
      description: 'URL that returns contents of WMTSCapabilities.xml',
      default: 'http://localhost/wmts'
    }
  }
}

const CONFIG_UISCHEMA = {}

module.exports = (server: ChartProviderApp): Plugin => {
  let settings = {
    url: 'http://localhost/wmts'
  }

  const serverMajorVersion = parseInt(server.config.version.split('.')[0])

  let chartProviders: ChartProviders = {}

  // ******** REQUIRED PLUGIN DEFINITION *******
  const plugin: Plugin = {
    id: 'wmts-chart-provider',
    name: 'WMTS Chart Provider',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start: (settings: any) => {
      doStartup(settings)
    },
    stop: () => {
      doShutdown()
    }
  }
  // ************************************
  const doStartup = async (config: Config) => {
    try {
      server.debug('** starting..... **')
      server.debug(`*** Loaded Configuration: ${JSON.stringify(config)}`)

      if (Number(process.versions.node.split('.')[0]) < 18) {
        server.setPluginError('Error: NodeJS v18 or later required!')
        return
      }

      if (config && config.url) {
        settings = { ...config }
        if (settings.url.indexOf('http') !== 0) {
          settings.url = `http://${settings.url}`
        }
      }

      server.debug(`*** Applied Configuration: ${JSON.stringify(settings)}`)

      registerRoutes()

      // get capabilities metadata (WMTSCapabilities.xml)
      const res = await fetchFromWMTS(settings.url)
      server.setPluginStatus('Started')
      chartProviders = await parseCapabilities(res)
    } catch (err) {
      const msg = 'Started with errors!'
      server.setPluginError(msg)

      server.error('** EXCEPTION: **')
      server.error((err as Error).message)
    }
  }

  const doShutdown = () => {
    server.debug('** shutting down **')
    server.setPluginStatus('Stopped')
  }

  /** Register router paths */
  const registerRoutes = () => {
    server.debug('** Registering API paths **')

    // v1 routes
    server.get(
      '/signalk/v1/api/resources/charts/:identifier',
      (req: Request, res: Response) => {
        const { identifier } = req.params
        const provider = chartProviders[identifier]
        if (provider) {
          return res.json(cleanChartProvider(provider))
        } else {
          return res.status(404).send('Not found')
        }
      }
    )

    server.get(
      '/signalk/v1/api/resources/charts',
      (req: Request, res: Response) => {
        const sanitized: ChartProviders = {}
        Object.keys(chartProviders).forEach((id) => {
          sanitized[id] = cleanChartProvider(chartProviders[id])
        })
        res.json(sanitized)
      }
    )

    // v2 routes
    if (serverMajorVersion === 2) {
      server.debug('** Registering v2 API paths **')
      registerAsProvider()
    }
  }

  //** Register Signal K server Resources API Provider *
  const registerAsProvider = (): string[] => {
    const failed: string[] = []
    const resType = 'charts'
    try {
      server.registerResourceProvider({
        type: resType,
        methods: {
          listResources: async (params: object) => {
            server.debug(params)
            const res: ChartProviders = {}
            Object.keys(chartProviders).forEach((id) => {
              res[id] = cleanChartProvider(chartProviders[id])
            })
            return res
          },
          getResource: async (id: string) => {
            return cleanChartProvider(chartProviders[id])
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setResource: (id: string, value: any) => {
            server.debug(id, value)
            throw new Error('Not Implemented!')
          },
          deleteResource: (id: string) => {
            server.debug(id)
            throw new Error('Not Implemented!')
          }
        }
      })
    } catch (error) {
      failed.push(resType)
    }

    return failed
  }

  /** Parse WMTSCapabilities.xml */
  const parseCapabilities = (xml: string): Promise<ChartProviders> => {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parseString(xml, (err: Error, result: any) => {
        if (err) {
          server.debug('** ERROR parsing XML! **')
          resolve({})
        }
        const wmtsLayers = getWMTSLayers(result)
        const res = wmtsLayers.reduce(
          (acc: ChartProviders, chart: ChartProvider) => {
            acc[chart.identifier] = chart
            return acc
          },
          {}
        )
        resolve(res)
      })
    })
  }

  //** Retrieve the available layers from WMTS Capabilities metadata */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getWMTSLayers = (result: { [key: string]: any }): ChartProvider[] => {
    const maps: ChartProvider[] = []
    if (!result.Capabilities.Contents[0].Layer) {
      return maps
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.Capabilities.Contents[0].Layer.forEach((layer: any) => {
      const ch = parseLayerEntry(layer)
      if (ch) {
        maps.push(ch)
      }
    })
    return maps
  }

  //** Parse WMTS layer entry */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseLayerEntry = (layer: any): ChartProvider | null => {
    if (
      layer['ows:Identifier'] &&
      Array.isArray(layer['ows:Identifier']) &&
      layer['ows:Identifier'].length > 0
    ) {
      const l: ChartProvider = {
        identifier: `${layer['ows:Identifier'][0]}`,
        name: layer['ows:Title'] ? layer['ows:Title'][0] : '',
        description: layer['ows:Abstract'] ? layer['ows:Abstract'][0] : '',
        type: 'wmts',
        v1: {
          tilemapUrl: `${settings.url}`,
          chartLayers: [layer['ows:Identifier'][0]]
        },
        v2: {
          url: `${settings.url}`,
          layers: [layer['ows:Identifier'][0]]
        }
      }
      if (
        layer['ows:WGS84BoundingBox'] &&
        layer['ows:WGS84BoundingBox'].length > 0
      ) {
        l.bounds = [
          Number(
            layer['ows:WGS84BoundingBox'][0]['ows:LowerCorner'][0].split(' ')[0]
          ),
          Number(
            layer['ows:WGS84BoundingBox'][0]['ows:LowerCorner'][0].split(' ')[1]
          ),
          Number(
            layer['ows:WGS84BoundingBox'][0]['ows:UpperCorner'][0].split(' ')[0]
          ),
          Number(
            layer['ows:WGS84BoundingBox'][0]['ows:UpperCorner'][0].split(' ')[1]
          )
        ]
      }
      if (layer['Format'] && layer['Format'].length > 0) {
        const f = layer['Format'][0]
        l.format = f.indexOf('jpg') !== -1 ? 'jpg' : 'png'
      } else {
        l.format = 'png'
      }
      //minzoom?: number
      //maxzoom?: number
      return l
    } else {
      return null
    }
  }

  /** Format chart data returned to the requestor. */
  const cleanChartProvider = (provider: ChartProvider, version = 1) => {
    let v
    if (version === 1) {
      v = Object.assign({}, provider.v1)
    } else if (version === 2) {
      v = Object.assign({}, provider.v2)
    }
    delete provider.v1
    delete provider.v2
    return Object.assign(provider, v)
  }

  //** Make requests to WMTS server */
  const fetchFromWMTS = async (url: string): Promise<string> => {
    server.debug('**Fetching:', url)
    const response = await fetch(url)
    if (response.ok) {
      return response.text()
    } else {
      server.debug(`*** fetchFromWMTS() response ERROR! ***`)
      throw new Error('Error retrieving data from WMTS host!')
    }
  }

  // ******************************************
  return plugin
}
