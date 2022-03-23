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
import { Plugin, PluginServerApp } from '@signalk/server-api'
import { Application } from 'express'
import { parseString } from 'xml2js'
import http from 'http'
import https from 'https'

const CONFIG_SCHEMA = {
  properties: {
    wmts: {
      type: 'object',
      title: 'WMTS URL.',
      description: 'Connect to WMTS server.',
      properties: {
        url: {
          type: 'string',
          title: 'WMTS url',
          default: 'localhost'
        }
      }
    }
  }
}

const CONFIG_UISCHEMA = {}

// ******  duplicate of '@signalk/server-api' until new version published ****
type SignalKResourceType =
  | 'routes'
  | 'waypoints'
  | 'notes'
  | 'regions'
  | 'charts'

export type ResourceType = SignalKResourceType | string

export interface ResourceProvider {
  type: ResourceType
  methods: ResourceProviderMethods
}

export interface ResourceProviderMethods {
  listResources: (query: { [key: string]: any }) => Promise<any>
  getResource: (id: string) => Promise<any>
  setResource: (id: string, value: { [key: string]: any }) => Promise<any>
  deleteResource: (id: string) => Promise<any>
}

// ***********************************************

interface WTMSProviderApp extends Application, PluginServerApp {
  registerResourceProvider: (resourceProvider: ResourceProvider) => void
  setPluginStatus: (pluginId: string, status?: string) => void
  setPluginError: (pluginId: string, status?: string) => void
  error: (msg: string) => void
  debug: (msg: string) => void
}

module.exports = (server: WTMSProviderApp): Plugin => {
  let subscriptions: any[] = [] // stream subscriptions

  let settings = {
    // ** applied configuration settings
    wmts: {
      url: 'http://localhost/wmts'
    }
  }

  // ******** REQUIRED PLUGIN DEFINITION *******
  const plugin: Plugin = {
    id: 'charts-wmts',
    name: 'WMTS Charts Provider',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options: any, restart: any) => {
      doStartup(options, restart)
    },
    stop: () => {
      doShutdown()
    }
  }
  // ************************************
  const doStartup = (options: any, restart: any) => {
    try {
      server.debug('** starting..... **')
      server.debug(`*** Loaded Configuration: ${JSON.stringify(options)}`)

      if (options && options.wmts && options.wmts.url) {
        settings = options
        if (settings.wmts.url.indexOf('http') !== 0) {
          settings.wmts.url = `http://${settings.wmts.url}`
        }
      }

      server.debug(`*** Applied Configuration: ${JSON.stringify(settings)}`)

      registerProviders()

      fetchWMTS(settings.wmts.url)
        .then(() => {
          server.setPluginStatus('Started')
        })
        .catch(err => {
          server.setPluginError(err.message)
        })
    } catch (err) {
      const msg = 'Started with errors!'
      server.setPluginError(msg)

      server.error('** EXCEPTION: **')
      server.error((err as any).stack)
      return err
    }
  }

  const doShutdown = () => {
    server.debug('** shutting down **')
    // ************
    server.debug('** Un-registering Update Handler(s) **')
    subscriptions.forEach(b => b())
    subscriptions = []

    server.setPluginStatus('Stopped')
  }

  // *****************************************

  const registerProviders = (): string[] => {
    const failed: string[] = []
    const resType = 'charts'
    try {
      server.registerResourceProvider({
        type: resType,
        methods: {
          listResources: async (params: object) => {
            return getCharts()
          },
          getResource: (id: string) => {
            return getCharts(id)
          },
          setResource: (id: string, value: any) => {
            throw new Error('Not Implemented!')
          },
          deleteResource: (id: string) => {
            throw new Error('Not Implemented!')
          }
        }
      })
    } catch (error) {
      failed.push(resType)
    }

    return failed
  }

  // ************** tileJSON **************************

  // fetch list of charts
  const getCharts = async (id?: string) => {
    return new Promise((resolve) => {
      fetchWMTS(settings.wmts.url)
        .then(xml => {
          parseString(xml, (err: Error, result: any) => {
            const wmtsLayers = getWMTSLayers(result)
            if (wmtsLayers.length === 0) {
              resolve({})
            } else {
              let pa: Promise<any>[] = []
              wmtsLayers.forEach((layer: any) => {
                if (id) {
                  if (
                    [
                      layer.identifier,
                      `${layer.identifier}-tilejson`,
                      `${layer.identifier}-metadata`
                    ].includes(id)
                  ) {
                    server.debug(`processed id: ${id}`)
                    if (id.indexOf('-tilejson') !== -1) {
                      pa.push(tileJsonEntry(layer.identifier))
                    } else if (id.indexOf('-metadata') !== -1) {
                      pa.push(xyzEntry(layer.identifier))
                    } else {
                      pa.push(layer)
                    }
                  }
                } else {
                  pa.push(layer)
                  pa.push(tileJsonEntry(layer.identifier))
                  pa.push(xyzEntry(layer.identifier))
                  server.debug(`processed identifier: ${layer.identifier}`)
                }
              })
              Promise.all(pa).then(pr => {
                const res: any = {}
                pr.forEach(ch => {
                  const key = ch.identifier ?? ch.name ?? null
                  if (key) {
                    res[key] = ch
                  }
                })
                resolve(res)
              })
            }
          })
        })
        .catch(err => {
          server.debug(`*** getCharts() caught error ***`)
          server.debug(err.message)
          resolve({})
        })
    })
  }

  const tileJsonEntry = (name: string) => {
    return Promise.resolve({
      identifier: `${name}-tilejson`,
      name: name,
      description: '',
      sourceType: 'tilejson',
      url: `${settings.wmts.url}/${name}.json`
    })
  }

  // fetch map tileJSON metadata
  const xyzEntry = (id: string) => {
    return new Promise(resolve => {
      fetchWMTS(`${settings.wmts.url}/${id}.json`)
        .then(chartJson => {
          let res = JSON.parse(chartJson as string)
          res['identifier'] = `${id}-metadata`
          res['sourceType'] = 'tilelayer'
          resolve(res)
        })
        .catch(err => {
          server.debug(`*** xyzEntry(${id}) error ***`)
          server.debug(err.message)
          resolve({})
        })
    })
  }

  const wtmsEntry = (layer: any) => {
    if (
      layer['ows:Identifier'] &&
      Array.isArray(layer['ows:Identifier']) &&
      layer['ows:Identifier'].length > 0
    ) {
      return {
        identifier: `${layer['ows:Identifier'][0]}`,
        name: layer['ows:Title'] ? layer['ows:Title'][0] : '',
        description: layer['ows:Abstract'] ? layer['ows:Abstract'][0] : '',
        sourceType: 'wmts',
        url: `${settings.wmts.url}`,
        layers: [layer['ows:Identifier'][0]]
      }
    } else {
      return null
    }
  }

  // retrieve the available layers from WMTS Capabilities
  const getWMTSLayers = (result: { [key: string]: any }) => {
    const maps: any[] = []
    if (!result.Capabilities.Contents[0].Layer) {
      return maps
    }
    result.Capabilities.Contents[0].Layer.forEach((layer: any) => {
      const ch = wtmsEntry(layer)
      if (ch) {
        maps.push(ch)
      }
    })
    return maps
  }

  // fetch WMTS server capabilities.xml
  const fetchWMTS = (url: string) => {
    return new Promise((resolve, reject) => {
      let req: any = http
      if (url.indexOf('https://') !== -1) {
        req = https
      }

      req
        .get(url, (res: any) => {
          let data = ''

          res.on('data', (chunk: string) => {
            data += chunk
          })

          res.on('end', () => {
            resolve(data.toString())
          })
        })
        .on('error', (error: Error) => {
          server.debug(`*** fetchWMTS() caught error ***`)
          server.debug(error.message)
          reject(new Error('Error retrieving WMTS capabilities!'))
        })
    })
  }

  // ******************************************
  return plugin
}
