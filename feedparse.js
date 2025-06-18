// feedparse.js
module.exports = function (RED) {
  "use strict";
  const FeedParser = require("feedparser");
  const { parse: parseUrl } = require("url");
  const { createHash } = require("crypto");
  const { Readable } = require("stream");

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
      if (!value) return [];
      return Array.isArray(value) ? value : [value];
    };

    const fetchAndParse = async (feed_url, msg, is_existent, seen, keep_size, init_send) => {
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
        node.status({ fill: "red", shape: "ring", text: "fetch error" });
        node.send([null, { payload: err.message }]);
        return;
      }

      if (!res.ok) {
        node.status({ fill: "red", shape: "ring", text: `status ${res.status}` });
        node.send([null, { payload: `Bad status code ${res.status}` }]);
        return;
      }

      node.status({ fill: "blue", shape: "dot", text: "parsing feed" });

      const stream = Readable.fromWeb(res.body, { objectMode: false });
      const feedparser = new FeedParser();

      stream.on("error", err => {
        node.status({ fill: "red", shape: "ring", text: "stream error" });
        node.send([null, { payload: err.message }]);
      });

      feedparser.on("error", err => {
        node.status({ fill: "red", shape: "ring", text: "parse error" });
        node.send([null, { payload: err.message }]);
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
              node.send([outMsg, null]);
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

      feedparser.on("end", function () {
        const seen_arr = Object.entries(seen)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => a.article_date - b.article_date)
          .slice(-keep_size);

        const trimmedSeen = Object.fromEntries(seen_arr.map(v => [
          v.id, { article_date: v.article_date, seen_date: v.seen_date }
        ]));

        const seenKey = buildKey(feed_url, "seen");
        node.context().set(seenKey, trimmedSeen, "redis");

        setTimeout(() => node.status({}), 5000);
      });
    };

    this.on("input", async function (msg) {
      const init_send = msg.init_send || false;
      const keep_size = msg.keep_size || 30;

      const feedUrls = getFeedUrls(msg);
      if (feedUrls.length === 0) {
        node.status({ fill: "red", shape: "ring", text: "no URL" });
        node.send([null, { payload: "Missing feed URL in message" }]);
        return;
      }

      for (const feed_url of feedUrls) {
        const parsed_url = parseUrl(feed_url);
        if (!(parsed_url.host || (parsed_url.hostname && parsed_url.port)) && !parsed_url.isUnix) {
          node.status({ fill: "red", shape: "ring", text: "invalid URL" });
          node.send([null, { payload: "Invalid feed URL" }]);
          continue;
        }

        const seenKey = buildKey(feed_url, "seen");

        await new Promise(resolve => {
          node.context().get(seenKey, "redis", async (err, seen) => {
            if (err) {
              node.status({ fill: "red", shape: "ring", text: "context error" });
              node.send([null, { payload: err.message }]);
              return resolve();
            }

            const is_existent = !!seen;
            seen = seen || {};
            await fetchAndParse(feed_url, msg, is_existent, seen, keep_size, init_send);
            resolve();
          });
        });
      }
    });
  }

  RED.nodes.registerType("feedparser-extended", FeedParseNode);
};
