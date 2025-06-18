# Node-RED Feed Parser Plus

[![Buy me a beer](https://img.shields.io/badge/Buy%20me-a%20beer-1f425f.svg)](https://www.buymeacoffee.com/demsking)

An enhanced and modernized fork of [node-red-contrib-feedparser-x](https://github.com/wpkong/node-red-contrib-feedparser-x).

This version introduces better flexibility, improved developer experience, and
persistent tracking of seen articles using Redis context storage.

## Key Features

- Persistent seen list using Redis — no flood of old articles on restart
- Supports dynamic user-agent and timeout via node config or `msg`
- Allows string or array of feed URLs via configurable input field
- Two outputs: new articles and error stream
- Node status displays internal activity for better visibility
- Clean and modern internal implementation

## Install

Run the following command in your Node-RED user directory (typically `~/.node-red`):

```bash
npm install node-red-contrib-feedparser-plus
```

Enable Redis context storage by editing your `settings.js`:

```js
contextStorage: {
  default: {
    module: "memory"
  },
  redis: {
    module: require("node-red-context-redis"),
    config: {
      host: "127.0.0.1",
      port: 6379,
      prefix: "nodered"
    }
  }
}
```

> **Note**: `node-red-context-redis` is no longer published on npm. Install it
> directly via Git:
>
> ```bash
> npm install git+https://github.com/node-red-hitachi/node-red-context-redis
> ```

> You must have a running Redis server.

## Usage

### Input

* `msg.payload` *(or other field defined in `feedField`)*: The feed URL (string or array of strings)
* `msg.userAgent`: (Optional) Override the configured user-agent string
* `msg.timeout`: (Optional) Override the request timeout in milliseconds
* `msg.init_send`: If `true`, send all items from the feed; if `false`, only new items
* `msg.keep_size`: Number of latest items to keep track of (default: `30`)

> You can use an `inject` node to periodically feed URLs into this node.

### Output

The node has **two outputs**:

1. **Article Output** — emitted for each new article:

   * `msg.topic`: Article link
   * `msg.payload`: Article description
   * `msg.article`: Complete article object (see below)

2. **Error Output** — emitted on failure:

   * `msg.payload`: Human-readable error message

### The Article Object

Please refer to https://www.npmjs.com/package/feedparser#list-of-article-properties.

### Node Status

The node provides runtime feedback via its status indicator:

* `fetching: <url>` — fetching feed
* `parsing feed` — parsing entries
* `<n> new articles` — number of new entries emitted
* `no new articles` — nothing new found
* `no URL`, `invalid URL`, `fetch error`, `status <code>`, `stream error`, `parse error`, `context error` — respective failure statuses

## Compatibility

- Requires Node.js 20+
- Compatible with Node-RED 3.x+

## Contribute

Please follow [CONTRIBUTING.md](https://gitlab.com/demsking/node-red-contrib-feedparser-plus/-/blob/main/CONTRIBUTING.md).

## License

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License.
You may obtain a copy of the License at [LICENSE](https://gitlab.com/demsking/node-red-contrib-feedparser-plus/-/blob/main/LICENSE).
