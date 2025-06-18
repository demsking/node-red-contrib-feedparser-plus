const helper = require('node-red-node-test-helper');
const feedparse = require('../feedparse.js');
const http = require('http');
const testFeed = require('./test-feed.js');

helper.init(require.resolve('node-red'));

describe('feedparser-plus Node', function () {
    let server;
    let port = 18888;
    let feedUrl = `http://localhost:${port}/rss`;

    before(function (done) {
        server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
            res.end(testFeed);
        }).listen(port, () => {
            helper.startServer(done);
        });
    });

    after(function (done) {
        server.close(() => {
            helper.stopServer(done);
        });
    });

    afterEach(function () {
        helper.unload();
    });

    it('should be loaded', function (done) {
        const flow = [
            { id: 'n1', type: 'feedparser-plus', name: 'test name' }
        ];
        helper.load(feedparse, flow, function () {
            const n1 = helper.getNode('n1');
            n1.should.have.property('name', 'test name');
            done();
        });
    });

    it('should output articles from a valid RSS feed', function (done) {
        const flow = [
            { id: 'n1', type: 'feedparser-plus', name: 'test', wires: [['n2'], ['n3']] },
            { id: 'n2', type: 'helper' },
            { id: 'n3', type: 'helper' }
        ];
        helper.load(feedparse, flow, function () {
            const n1 = helper.getNode('n1');
            const n2 = helper.getNode('n2');
            const n3 = helper.getNode('n3');
            let articles = [];
            n2.on('input', function (msg) {
                articles.push(msg);
                if (articles.length === 2) {
                    articles[0].should.have.property('payload', 'Article 1 description');
                    articles[1].should.have.property('payload', 'Article 2 description');
                    done();
                }
            });
            n3.on('input', function (msg) {
                // Should not be called for valid feed
                done(new Error('Error output received: ' + JSON.stringify(msg)));
            });
            n1.receive({ payload: feedUrl, init_send: true });
        });
    });

    it('should handle missing feed URL', function (done) {
        const flow = [
            { id: 'n1', type: 'feedparser-plus', name: 'test', wires: [['n2'], ['n3']] },
            { id: 'n2', type: 'helper' },
            { id: 'n3', type: 'helper' }
        ];
        helper.load(feedparse, flow, function () {
            const n1 = helper.getNode('n1');
            const n3 = helper.getNode('n3');
            n3.on('input', function (msg) {
                msg.should.have.property('payload');
                msg.payload.should.match(/Missing feed URL/);
                done();
            });
            n1.receive({});
        });
    });

    it('should handle invalid feed URL', function (done) {
        const flow = [
            { id: 'n1', type: 'feedparser-plus', name: 'test', wires: [['n2'], ['n3']] },
            { id: 'n2', type: 'helper' },
            { id: 'n3', type: 'helper' }
        ];
        helper.load(feedparse, flow, function () {
            const n1 = helper.getNode('n1');
            const n3 = helper.getNode('n3');
            n3.on('input', function (msg) {
                msg.should.have.property('payload');
                msg.payload.should.match(/Invalid feed URL/);
                done();
            });
            n1.receive({ payload: 'not-a-url' });
        });
    });

    it('should handle unreachable feed URL', function (done) {
        const flow = [
            { id: 'n1', type: 'feedparser-plus', name: 'test', wires: [['n2'], ['n3']] },
            { id: 'n2', type: 'helper' },
            { id: 'n3', type: 'helper' }
        ];
        helper.load(feedparse, flow, function () {
            const n1 = helper.getNode('n1');
            const n3 = helper.getNode('n3');
            n3.on('input', function (msg) {
                msg.should.have.property('payload');
                msg.payload.should.match(/Failed to fetch feed/);
                done();
            });
            n1.receive({ payload: 'http://localhost:65535/rss' });
        });
    });
});
