// Copyright 2025 Sébastien Demanou
// Copyright 2025 JS Foundation and other contributors, https://js.foundation/
// Copyright 2013-2016 IBM Corp.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ==============================================================================
module.exports = function (RED) {
  const { createHash } = require("node:crypto");
  const { Readable } = require("node:stream");

  const FeedParser = require("feedparser");

  function buildKey(url, key) {
    return createHash("sha1").update(url).digest("hex") + "-" + key;
  }

  function FeedParseNode(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    node.userAgent = config.userAgent || "Mozilla/5.0 (Node-RED)";
    node.timeout = parseInt(config.timeout, 10) || 10000;
    node.feedField = config.feedField || "payload";

    const getFeedUrls = (msg) => {
      const field = node.feedField;
      const value = RED.util.getMessageProperty(msg, field);

      if (value) {
        return Array.isArray(value) ? value : [value];
      }

      return [];
    };

    const fetchAndParse = async (feed_url, msg, is_existent, seen, keep_size, init_send, send) => {
      node.status({ fill: "blue", shape: "dot", text: `fetching: ${feed_url}` });

      let res;

      try {
        res = await fetch(feed_url, {
          headers: {
            "User-Agent": node.userAgent,
            "Accept": "application/rss+xml,application/xml;q=0.9,*/*;q=0.8"
          },
          timeout: node.timeout
        });
      } catch (err) {
        const errorMessage = "Failed to fetch feed: " + err.message;

        node.status({ fill: "red", shape: "ring", text: errorMessage });
        node.error(errorMessage, msg);
        send([null, { payload: errorMessage }]);

        return;
      }

      if (!res.ok) {
        const errorMsg = `Bad status code ${res.status} for ${feed_url}`;

        node.status({ fill: "red", shape: "ring", text: `status ${res.status}` });
        node.error(errorMsg, msg);
        send([null, { payload: errorMsg }]);

        return;
      }

      node.status({ fill: "blue", shape: "dot", text: "parsing feed" });

      const stream = Readable.fromWeb(res.body, { objectMode: false });
      const feedparser = new FeedParser();

      stream.on("error", (error) => {
        node.status({ fill: "red", shape: "ring", text: "stream error" });
        node.error("Stream error: " + error.message, msg);
        send([null, { payload: error.message }]);
      });

      feedparser.on("error", (error) => {
        node.status({ fill: "red", shape: "ring", text: "parse error" });
        node.error("Feed parse error: " + error.message, msg);
        send([null, { payload: error.message }]);
      });

      stream.pipe(feedparser);

      feedparser.on("readable", function () {
        let articleCount = 0;
        let article;

        while ((article = this.read())) {
          const guid = article.guid;
          const isNew = !(guid in seen) || (seen[guid].article_date !== 0 && seen[guid].article_date !== article.date?.getTime());

          if (isNew) {
            seen[guid] = {
              article_date: article.date?.getTime() || 0,
              seen_date: Date.now()
            };

            if (is_existent || init_send) {
              const outMsg = structuredClone(msg);

              outMsg.topic = article.origlink || article.link;
              outMsg.payload = article.description;
              outMsg.article = article;

              send([outMsg, null]);
              articleCount++;
            }
          }
        }

        if (articleCount > 0) {
          node.status({ fill: "green", shape: "dot", text: `${articleCount} new articles` });
        } else {
          node.status({ fill: "grey", shape: "ring", text: "no new articles" });
        }
      });

      feedparser.on("end", () => {
        const seen_arr = Object.entries(seen)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => a.article_date - b.article_date)
          .slice(-keep_size);

        const trimmedSeen = Object.fromEntries(seen_arr.map((value) => [
          value.id, { article_date: value.article_date, seen_date: value.seen_date }
        ]));

        const seenKey = buildKey(feed_url, "seen");

        node.context().set(seenKey, trimmedSeen, "redis");
        setTimeout(() => node.status({}), 5000);
      });
    };

    this.on("input", async (msg, send, done) => {
      const init_send = msg.init_send || false;
      const keep_size = msg.keep_size || 30;

      const feedUrls = getFeedUrls(msg);

      if (feedUrls.length === 0) {
        const errorMsg = "Missing feed URL in message";

        node.status({ fill: "red", shape: "ring", text: errorMsg });
        node.error(errorMsg, msg);
        send([null, { payload: errorMsg }]);

        return;
      }

      for (const feed_url of feedUrls) {
        if (!URL.canParse(feed_url)) {
          const errorMsg = "Invalid feed URL: " + feed_url;

          node.status({ fill: "red", shape: "ring", text: errorMsg });
          node.error(errorMsg, msg);
          send([null, { payload: errorMsg }]);

          continue;
        }

        const seenKey = buildKey(feed_url, "seen");

        await new Promise((resolve) => {
          node.context().get(seenKey, "redis", async (error, seen) => {
            if (error) {
              const errorMessage = "Context error: " + error.message;

              node.status({ fill: "red", shape: "ring", text: errorMessage });
              node.error(errorMessage, msg);
              send([null, { payload: errorMessage }]);

              return resolve();
            }

            const is_existent = !!seen;

            seen = seen || {};

            await fetchAndParse(feed_url, msg, is_existent, seen, keep_size, init_send, send);
            resolve();
          });
        });
      }

      done();
    });
  }

  RED.nodes.registerType("feedparser-plus", FeedParseNode);
};
