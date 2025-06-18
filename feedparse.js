module.exports = function (RED) {
  "use strict";
  const FeedParser = require("feedparser");
  const { parse: parseUrl } = require("url");
  const sha1 = require("sha1");
  const { Readable } = require("stream");

  function buildKey(url, key) {
    return sha1(url) + "-" + key;
  }

  function FeedParseNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const getFeed = async function (msg) {
      const init_send = msg.init_send || false;
      let is_existent = true;
      const keep_size = msg.keep_size || 30;

      if (!msg.payload) {
        node.error(RED._("feedparsex.errors.invalidurl"));
        return;
      }

      const feed_url = msg.payload;
      const parsed_url = parseUrl(feed_url);
      if (!(parsed_url.host || (parsed_url.hostname && parsed_url.port)) && !parsed_url.isUnix) {
        node.error(RED._("feedparsex.errors.invalidurl"));
        return;
      }

      const seenKey = buildKey(feed_url, "seen");
      const nodeContext = node.context();

      nodeContext.get(seenKey, "redis", async function (error, seen) {
        if (error) {
          node.error(error);
          return;
        }

        is_existent = !!seen;
        if (!seen) {
          seen = {};
        }

        let res;
        try {
          res = await fetch(feed_url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Node-RED)",
              "Accept": "text/html,application/xhtml+xml"
            },
            timeout: 10000
          });
        } catch (err) {
          node.error(err);
          return;
        }

        if (!res.ok) {
          node.warn(RED._("feedparsex.errors.badstatuscode") + " " + res.status);
          return;
        }

        const stream = Readable.fromWeb(res.body, { objectMode: false });
        const feedparser = new FeedParser();

        stream.on("error", err => node.error(err));
        feedparser.on("error", err => node.error(err));

        stream.pipe(feedparser);

        feedparser.on("readable", function () {
          let article;
          while ((article = this.read())) {
            const guid = article.guid;
            if (!(guid in seen) || (seen[guid].article_date !== 0 && seen[guid].article_date !== article.date?.getTime())) {
              seen[guid] = {
                article_date: article.date ? article.date.getTime() : 0,
                seen_date: Date.now()
              };
              if (!(!is_existent && !init_send)) {
                const data = JSON.parse(JSON.stringify(msg));
                data.topic = article.origlink || article.link;
                data.payload = article.description;
                data.article = article;
                node.send(data);
              }
            }
          }
        });

        feedparser.on("end", function () {
          const seen_arr = Object.keys(seen).map(k => ({
            id: k,
            article_date: seen[k].article_date,
            seen_date: seen[k].seen_date
          }));

          seen_arr.sort((a, b) => a.article_date - b.article_date);

          seen = {};
          seen_arr.slice(-keep_size).forEach(v => {
            seen[v.id] = {
              article_date: v.article_date,
              seen_date: v.seen_date
            };
          });

          nodeContext.set(seenKey, seen, "redis");
        });
      });
    };

    this.on("input", function (msg) {
      getFeed(msg);
    });
  }

  RED.nodes.registerType("feedparse-x", FeedParseNode);
};
