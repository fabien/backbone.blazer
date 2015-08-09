describe('Backbone.Blazer.Router', function() {
    
    var loadedUser, exited;

    var TestRoute = Backbone.Blazer.Route.extend({
        execute: function() {}
    });
    
    var RedirectRoute = Backbone.Blazer.Route.extend({
        execute: function() {}
    });
    
    var ExitRoute = Backbone.Blazer.Route.extend({
        exit: function() { exited = true; }
    });
    
    var PreparedRoute = Backbone.Blazer.Route.extend({
        prepare: function() { return false; }
    });
    
    var HaltedRoute = Backbone.Blazer.Route.extend({
        exit: function() { return false; }
    });
    
    var ResolvedRoute = Backbone.Blazer.Route.extend({
        prepare: function() {
            var dfd = $.Deferred();
            setTimeout(dfd.resolve, 100);
            return dfd.promise();
        }
    });
    
    var RejectedRoute = Backbone.Blazer.Route.extend({
        prepare: function() {
            var dfd = $.Deferred();
            setTimeout(dfd.reject, 100);
            return dfd.promise();
        }
    });
    
    var EditRoute = Backbone.Blazer.Route.extend({
        dirty: false, // flag: unsaved edits
        canNavigate: function(fragment, options, router) {
            var leaving = router.current.handler === this;
            if (leaving) return !this.dirty;
        }
    });

    var TestRouter = Backbone.Blazer.Router.extend();

    beforeEach(function() {
        this.sinon = sinon.sandbox.create();
        loadedUser = false;

        TestRouter.registerFilter('loadUser', function(ctx) {
            loadedUser = true;
        });

        this.testRoute = new TestRoute();
        this.redirectRoute = new RedirectRoute();

        this.router = new TestRouter();
        this.router.route('route', this.testRoute);
        this.router.route('redirect', this.redirectRoute);
        this.sinon.spy(this.router, 'handleRoute');

        Backbone.history.location = new Location('http://example.org');
        Backbone.history.start({ pushState: true });
    });

    afterEach(function() {
        Backbone.history.stop();
        this.sinon.restore();
    });

    it('should process a route correctly', function() {
        this.sinon.spy(this.testRoute, 'prepare');
        this.sinon.spy(this.testRoute, 'execute');
        this.sinon.spy(this.testRoute, 'error');

        var routerBeforeExecute = this.sinon.spy();
        this.router.on('before:execute', routerBeforeExecute);

        var routerAfterExecute = this.sinon.spy();
        this.router.on('after:execute', routerAfterExecute);

        this.router.navigate('route', { trigger: true });

        expect(this.router.handleRoute).to.have.been.calledOnce;
        expect(this.testRoute.prepare).to.have.been.calledOnce;
        expect(this.testRoute.execute).to.have.been.calledOnce;
        expect(this.testRoute.error).to.not.have.been.called;

        expect(routerBeforeExecute).to.have.been.calledOnce;
        expect(routerAfterExecute).to.have.been.calledOnce;
    });

    it('should process an error correctly', function() {
        this.sinon.stub(this.testRoute, 'prepare', function() { return $.Deferred().reject().promise(); });
        this.sinon.spy(this.testRoute, 'execute');
        this.sinon.spy(this.testRoute, 'error');

        this.router.navigate('route', { trigger: true });

        expect(this.testRoute.prepare).to.have.been.calledOnce;
        expect(this.testRoute.execute).to.not.have.been.called;
        expect(this.testRoute.error).to.have.been.calledOnce;
    });

    it('should run a single before and after filter attached to the router', function() {
        this.router.filters = [{
            beforeRoute: this.sinon.spy(),
            afterRoute: this.sinon.spy()
        }];

        this.router.navigate('route', { trigger: true });

        expect(this.router.filters[0].beforeRoute).to.have.been.calledOnce;
        expect(this.router.filters[0].afterRoute).to.have.been.calledOnce;
    });

    it('should run filters attached to a route', function() {
        this.testRoute.filters = [{
            beforeRoute: this.sinon.spy(),
            afterRoute: this.sinon.spy()
        }];

        this.router.navigate('route', { trigger: true });

        expect(this.testRoute.filters[0].beforeRoute).to.have.been.calledOnce;
        expect(this.testRoute.filters[0].afterRoute).to.have.been.calledOnce;
    });

    it('should run multiple synchronous filters in order', function() {
        var result = [];

        this.router.filters = [{
            beforeRoute: function() { result.push(1); }
        }, {
            beforeRoute: function() { result.push(2); }
        }];

        this.router.navigate('route', { trigger: true });

        expect(result).to.eql([1, 2]);
    });

    it('should run multiple asynchronous filters in order', function(done) {
        var result = [];

        this.router.filters = [{
            beforeRoute: function() {
                var def = $.Deferred();
                setTimeout(function() { result.push(1); def.resolve(); }, 30);
                return def.promise();
            }
        }, {
            beforeRoute: function() {
                var def = $.Deferred();
                setTimeout(function() { result.push(2); def.resolve(); }, 10);
                return def.promise();
            }
        }];

        this.router.navigate('route', { trigger: true });

        this.testRoute.on('after:execute', function() {
            expect(result).to.eql([1, 2]);
            done();
        });
    });

    it('should run a mix of synchronous and asynchronous filters in order', function(done) {
        var result = [];

        this.router.filters = [{
            beforeRoute: function() {
                var def = $.Deferred();
                setTimeout(function() { result.push(1); def.resolve(); }, 30);
                return def.promise();
            }
        }, {
            beforeRoute: function() {
                result.push(2);
            }
        }, {
            beforeRoute: function() {
                var def = $.Deferred();
                setTimeout(function() { result.push(3); def.resolve(); }, 10);
                return def.promise();
            }
        }];

        this.testRoute.on('after:execute', function() {
            expect(result).to.eql([1, 2, 3]);
            done();
        });

        this.router.navigate('route', { trigger: true });
    });

    it('should run router filters and then route filters', function() {
        var result = [];

        this.router.filters = [{
            beforeRoute: function() { result.push(1); }
        }];

        this.testRoute.filters = [{
            beforeRoute: function() { result.push(2); }
        }];

        this.router.navigate('route', { trigger: true });

        expect(result).to.eql([1, 2]);
    });

    it('should not prepare or execute the route if the filters fail to resolve', function() {
        this.sinon.spy(this.testRoute, 'prepare');
        this.sinon.spy(this.testRoute, 'execute');
        this.sinon.spy(this.testRoute, 'error');

        this.router.filters = [{
            beforeRoute: function() { return $.Deferred().reject().promise(); }
        }];

        this.router.navigate('route', { trigger: true });

        expect(this.testRoute.prepare).to.not.have.been.called;
        expect(this.testRoute.execute).to.not.have.been.called;
        expect(this.testRoute.error).to.not.have.been.called;
    });

    it('should redirect to a different route if a filter returns a redirect', function() {
        this.sinon.spy(this.testRoute, 'prepare');
        this.sinon.spy(this.testRoute, 'execute');
        this.sinon.spy(this.testRoute, 'error');

        this.sinon.spy(this.redirectRoute, 'prepare');
        this.sinon.spy(this.redirectRoute, 'execute');
        this.sinon.spy(this.redirectRoute, 'error');

        this.testRoute.filters = [{
            beforeRoute: function() { return this.redirect('redirect'); }
        }];

        this.router.navigate('route', { trigger: true });

        expect(this.testRoute.prepare).to.not.have.been.called;
        expect(this.testRoute.execute).to.not.have.been.called;
        expect(this.testRoute.error).to.not.have.been.called;

        expect(this.redirectRoute.prepare).to.have.been.called;
        expect(this.redirectRoute.execute).to.have.been.called;
        expect(this.redirectRoute.error).not.to.have.been.called;
    });
    
    it('should run before filters in order until false is returned', function() {
        var result = [];

        this.testRoute.appendFilter(function() { return result.push(1); });
        this.testRoute.appendFilter(function() { return false; });
        this.testRoute.appendFilter(function() { return result.push(2); });

        expect(this.testRoute.filters).to.have.length(3);

        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current).to.be.null;

        expect(result).to.eql([1]);
    });

    it('should run before filters in order until a redirect happens', function() {
        var result = [];

        this.testRoute.appendFilter(function() { return this.redirect('redirect'); });
        this.testRoute.appendFilter(function() { return result.push(2); });
        this.testRoute.prependFilter(function() { return result.push(1); });
        
        expect(this.testRoute.filters).to.have.length(3);

        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.url).to.equal('redirect');

        expect(result).to.eql([1]);
    });

    it('should use filters that have been registered on the router', function() {
        this.sinon.spy(this.testRoute, 'execute');
        
        this.testRoute.prependFilter('loadUser');
        
        expect(this.testRoute.filters).to.have.length(1);
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.testRoute.execute).to.have.been.called;
        expect(loadedUser).to.be.true;
    });

    it('should run after filters in order until a redirect happens', function() {
        var result = [];

        this.testRoute.filters = [{
            afterRoute: function() { return result.push(1); }
        }, {
            afterRoute: function() { return this.redirect('redirect'); }
        }, {
            afterRoute: function() { return result.push(2); }
        }];

        this.router.navigate('route', { trigger: true });

        expect(result).to.eql([1]);
    });

    it('should redirect if a redirect is returned from prepare', function() {
        this.sinon.stub(this.testRoute, 'prepare', function() { return this.redirect('redirect'); });
        this.sinon.spy(this.testRoute, 'execute');
        this.sinon.spy(this.redirectRoute, 'execute');

        this.router.navigate('route', { trigger: true });

        expect(this.testRoute.execute).to.not.have.been.called;
        expect(this.redirectRoute.execute).to.have.been.called;
    });

    it('should redirect if a redirect is returned from execute', function() {
        this.sinon.stub(this.testRoute, 'execute', function() { return this.redirect('redirect'); });
        this.sinon.spy(this.redirectRoute, 'execute');

        this.router.navigate('route', { trigger: true });

        expect(this.redirectRoute.execute).to.have.been.called;
    });

    it('should redirect if a redirect is returned from error', function() {
        this.sinon.stub(this.testRoute, 'prepare', function() { return $.Deferred().reject().promise(); });
        this.sinon.stub(this.testRoute, 'error', function() { return this.redirect('redirect'); });
        this.sinon.spy(this.redirectRoute, 'execute');

        this.router.navigate('route', { trigger: true });

        expect(this.redirectRoute.execute).to.have.been.called;
    });

    it('should pass the router instance with ctx', function() {
        var result;
        this.testRoute.appendFilter(function(ctx) { return result = ctx.router; });
        this.router.navigate('route', { trigger: true });
        expect(result).to.equal(this.router);
    });

    it('should build urls for route paths', function() {
        expect(this.router.url('project/:id/details', { id: 3 })).to.equal('project/3/details');
        expect(this.router.url('project/:id/details', 3)).to.equal('project/3/details');
        expect(this.router.url('project/:id/details/:fk', { id: 3, fk: 5 })).to.equal('project/3/details/5');
        expect(this.router.url('project/:id/details', 3, 5)).to.equal('project/3/details');
    });

    it('should use named routes and route handlers', function() {
        this.sinon.spy(this.testRoute, 'execute');
        var parameters, url, altUrl, urls = [];
        
        this.router.on('after:execute', function(ctx, router) {
            urls.push(this.current.url);
        });
        
        this.testRoute.appendFilter(function(ctx) {
            parameters = ctx.parameters;
            url = ctx.url();
            altUrl = ctx.url({ id: 8888 });
        });
        
        this.router.route('show', 'show/:id', this.testRoute);
        this.router.route('user.show', 'user/:id', this.testRoute);
        this.router.route('show/all', this.testRoute); // implicit name
        
        // Test setup
        
        expect(this.router.getRoute('show')).to.equal('show/:id');
        expect(this.router.getUrl('show', { id: '1234' })).to.equal('show/1234');
        expect(this.router.getUrl('show', '1234')).to.equal('show/1234');
        
        expect(this.router.getRoute('show-all')).to.equal('show/all');
        expect(this.router.getUrl('show-all')).to.equal('show/all');
        
        expect(this.router.getHandler('show')).to.equal(this.testRoute);
        expect(this.router.getHandler('user.show')).to.equal(this.testRoute);
        expect(this.router.getHandler('show-all')).to.equal(this.testRoute);
        
        // Navigate (1)
        
        this.router.navigate('show/1234', { trigger: true });
        
        expect(parameters).to.eql({ id: '1234' });
        expect(url).to.equal('show/1234');
        expect(altUrl).to.equal('show/8888');
        
        expect(this.testRoute.execute).to.have.been.calledOnce;
        
        expect(this.router.previous).to.not.exist;
        
        expect(this.router.current.name).to.equal('show');
        expect(this.router.current.route).to.equal('show/:id');
        expect(this.router.current.url).to.equal('show/1234');
        expect(this.router.current.parameters).to.eql({ id: '1234' });
        
        expect(this.router.matchesUrl('show/1234/details')).to.be.false;
        expect(this.router.matchesUrl('show/:id', 1234)).to.be.true;
        expect(this.router.matchesUrl('show/5678')).to.be.false;
        
        expect(this.router.matchesRoute('show', 1234)).to.be.true;
        expect(this.router.matchesRoute('show', { id: 1234 })).to.be.true;
        expect(this.router.matchesRoute('show', { id: 5678 })).to.be.false;
        
        // Navigate (2)
        
        this.router.navigate('show/all', { trigger: true });
        
        expect(parameters).to.eql({});
        expect(url).to.equal('show/all');
        
        expect(this.router.previous.name).to.equal('show');
        
        expect(this.router.current.name).to.equal('show-all');
        expect(this.router.current.route).to.equal('show/all');
        expect(this.router.current.url).to.equal('show/all');
        expect(this.router.current.parameters).to.eql({});
        
        expect(this.router.matchesUrl('show/all/example')).to.be.false;
        expect(this.router.matchesUrl('show/all')).to.be.true;
        expect(this.router.matchesUrl('show/other')).to.be.false;
        
        // Navigate (3)
        
        this.router.navigateTo('user.show', { id: 5678 }, { trigger: true });
        
        expect(parameters).to.eql({ id: '5678' });
        expect(url).to.equal('user/5678');
        
        expect(this.router.previous.name).to.equal('show-all');
        
        expect(this.router.current.name).to.equal('user.show');
        expect(this.router.current.route).to.equal('user/:id');
        expect(this.router.current.url).to.equal('user/5678');
        expect(this.router.current.parameters).to.eql({ id: '5678' });
        
        expect(urls).to.eql(['show/1234', 'show/all', 'user/5678']);
    });
    
    it('should use named routes for tree-like behavior', function() {
        this.router.route('users', 'users', this.testRoute);
        this.router.route('users.show', 'users/:id', this.testRoute);
        this.router.route('users.active', 'users/active', this.testRoute);
        this.router.route('users.show.documents', 'users/:id/documents', this.testRoute);
        this.router.route('users.show.documents.detail', 'users/:id/documents/:documentId', this.testRoute);
        
        var params = { id: 1234, documentId: 'xyz' };
        
        var ancestors = ['users', 'users/1234'];
        var children = ['users/1234/documents', 'users/1234/documents/xyz'];
        
        this.router.navigateTo('users.show', params, { trigger: true });
        
        var nodes = this.router.ancestors();
        expect(_.pluck(nodes, 'url')).to.eql(ancestors);
        
        var nodes = this.router.nodes(params);
        expect(_.pluck(nodes, 'url')).to.eql(children);
        
        expect(this.router.siblings()).to.eql([
            { name: 'users.show', route: 'users/:id', url: 'users/1234', active: true },
            { name: 'users.active', route: 'users/active', url: 'users/active', active: false }
        ]);
        
        var ancestors = ['users', 'users/1234', 'users/1234/documents', 'users/1234/documents/xyz'];
        
        this.router.navigateTo('users.show.documents.detail', params, { trigger: true });
        
        expect(this.router.isAncestor('users.show.documents.detail')).to.be.false;
        expect(this.router.isAncestor('users.show.documents.other')).to.be.false;
        expect(this.router.isAncestor('users.show.documents')).to.be.true;
        expect(this.router.isAncestor('users.show')).to.be.true;
        expect(this.router.isAncestor('users')).to.be.true;
        expect(this.router.isAncestor('other')).to.be.false;
        
        var nodes = this.router.ancestors();
        expect(_.pluck(nodes, 'url')).to.eql(ancestors);
        
        var nodes = this.router.nodes(params);
        expect(_.pluck(nodes, 'url')).to.eql([]);
        
        expect(this.router.siblings()).to.eql([{
            name: 'users.show.documents.detail', 
            route: 'users/:id/documents/:documentId', 
            url: 'users/1234/documents/xyz', active: true
        }]);
    });
    
    it('should setup named routes from options', function() {
        this.router.route('users', 'users', { title: 'Users' });
        expect(this.router.getHandler('users')).to.be.instanceof(Backbone.Blazer.Route);
        expect(this.router.getHandler('users').options.title).to.equal('Users');
        
        this.router.route('example', 'example');
        expect(this.router.getHandler('example')).to.be.instanceof(Backbone.Blazer.Route);
    });
    
    it('should setup named routes using addRoutes - with array', function() {
        this.router.addRoutes([{ name: 'users', path: 'users', title: 'Users' }]);
        expect(this.router.getHandler('users')).to.be.instanceof(Backbone.Blazer.Route);
        expect(this.router.getHandler('users').options.title).to.equal('Users');
    });
    
    it('should setup named routes using addRoutes - with object', function() {
        this.router.addRoutes({ users: { path: 'users', title: 'Users' } });
        expect(this.router.getHandler('users')).to.be.instanceof(Backbone.Blazer.Route);
        expect(this.router.getHandler('users').options.title).to.equal('Users');
    });
    
    it('should generate urls from routes', function() {
        expect(this.router.url('users')).to.equal('users');
        expect(this.router.url('users/:id')).to.equal('users');
        expect(this.router.url('users/:id', 1234)).to.equal('users/1234');
        expect(this.router.url('users/:id', { id: 1234 })).to.equal('users/1234');
        expect(this.router.url('users(/:id)')).to.equal('users');
        expect(this.router.url('users(/:id)', { id: 1234 })).to.equal('users/1234');
        expect(this.router.url('users/*path')).to.equal('users');
        expect(this.router.url('users/*path', null)).to.equal('users');
        expect(this.router.url('users/*path', { path: null })).to.equal('users');
        expect(this.router.url('users/*path', { path: 'foo/bar' })).to.equal('users/foo/bar');
        expect(this.router.url('users/:a/:b/:c')).to.equal('users');
        expect(this.router.url('users/:a/:b/:c', 'foo')).to.equal('users/foo');
        expect(this.router.url('users/:a/:b/:c', 'foo', 'bar')).to.equal('users/foo/bar');
        expect(this.router.url('users/:a/:b/:c', 'foo', 'bar', 'baz')).to.equal('users/foo/bar/baz');
    });
    
    it('should handle routes with serialized params', function() {
        this.router.route('users', 'users/:params', this.testRoute);
        
        var params = { foo: 'bar', biz: 'baz' };
        
        expect(this.router.url('users', params)).to.equal('users'); // ignored
        expect(this.router.url('users/:params', params)).to.equal('users/foo:bar+biz:baz');
        
        this.router.navigateTo('users', params, { trigger: true });
        
        expect(this.router.current.name).to.equal('users');
        expect(this.router.current.route).to.equal('users/:params');
        expect(this.router.current.url).to.equal('users/foo:bar+biz:baz');
        expect(this.router.current.parameters).to.eql(params);
    });
    
    it('should handle splat routes', function() {
        this.router.route('users', 'users/*path', this.testRoute);
        
        this.router.navigateTo('users', { path: 'foo/bar/baz' }, { trigger: true });
        
        expect(this.router.current.name).to.equal('users');
        expect(this.router.current.route).to.equal('users/*path');
        expect(this.router.current.url).to.equal('users/foo/bar/baz');
        expect(this.router.current.parameters).to.eql({ path: 'foo/bar/baz' });
    });
    
    it('should handle empty/index routes', function() {
        Backbone.history.stop();
        
        this.router = new TestRouter();
        this.router.route('index', '', this.testRoute);
        this.router.route('users', 'users/:id', this.testRoute);

        Backbone.history.location = new Location('http://example.org');
        Backbone.history.start({ pushState: true });
        
        expect(this.router.current.name).to.equal('index');
        expect(this.router.current.route).to.equal('');
        expect(this.router.current.url).to.equal('');
        expect(this.router.current.parameters).to.eql({});
        
        expect(this.router.matchesUrl('')).to.be.true;
        expect(this.router.matchesUrl('users/1234')).to.be.false;
        
        expect(this.router.matchesRoute('index')).to.be.true;
        expect(this.router.matchesRoute('users', { id: 1234 })).to.be.false;
    });
    
    it('should skip routing when canNavigate returns false', function() {
        var editRoute = new EditRoute();
        this.router.route('edit', 'edit', editRoute);
        this.router.navigate('edit', { trigger: true });
        
        editRoute.dirty = true;
        
        expect(this.router.current.name).to.equal('edit');
        expect(Backbone.history.fragment).to.equal('edit');
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.name).to.equal('edit');
        expect(Backbone.history.fragment).to.equal('edit');
        
        editRoute.dirty = false;
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.name).to.equal('route');
        expect(Backbone.history.fragment).to.equal('route');
        
        editRoute.dirty = true;
        
        this.router.navigate('edit', { trigger: true });
        
        expect(this.router.current.name).to.equal('edit');
        expect(Backbone.history.fragment).to.equal('edit');
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.name).to.equal('edit');
        expect(Backbone.history.fragment).to.equal('edit');
    });
    
    it('should execute a route', function() {
        this.sinon.spy(this.testRoute, 'execute');
        this.router.executeUrl('route');
        expect(this.testRoute.execute).to.have.been.called;
        expect(this.router.current.name).to.equal('route');
    });
    
    it('should use a custom route url root', function() {
        Backbone.history.stop();
        
        this.router = new TestRouter({ root: 'custom' });
        this.router.route('index', '', new TestRoute());
        this.router.route('route', 'route', new TestRoute());
        
        Backbone.history.location = new Location('http://example.org');
        Backbone.history.start({ pushState: true });
        
        expect(this.router.current.url).to.equal('custom');
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.url).to.equal('custom/route');
    });
    
    it('should use a custom path prefix', function() {
        Backbone.history.stop();
        
        this.router = new TestRouter({
            path: ':lc',
            defaults: { lc: 'en' }
        });
        
        this.router.route('index', '', new TestRoute());
        this.router.route('route', 'route', new TestRoute());
        
        expect(this.router.getUrl('index')).to.equal('en');
        expect(this.router.getUrl('route')).to.equal('en/route');
        
        expect(this.router.getUrl('route', 'nl')).to.equal('nl/route');
        expect(this.router.getUrl('route', { lc: 'nl' })).to.equal('nl/route');
        
        Backbone.history.location = new Location('http://example.org');
        Backbone.history.start({ pushState: true });
        
        this.router.navigateTo('index', {}, { trigger: true });
        
        expect(this.router.getUrl(true)).to.equal('en');
        expect(this.router.getUrl(true, 'nl')).to.equal('nl');
        expect(this.router.getUrl(true, { lc: 'nl' })).to.equal('nl');
        
        expect(this.router.current.url).to.equal('en');
        expect(this.router.current.route).to.equal(':lc');
        
        this.router.navigateTo('route', { lc: 'en' }, { trigger: true });
        
        expect(this.router.getUrl(true)).to.equal('en/route');
        expect(this.router.getUrl(true, 'nl')).to.equal('nl/route');
        expect(this.router.getUrl(true, { lc: 'nl' })).to.equal('nl/route');
        
        expect(this.router.current.url).to.equal('en/route');
        expect(this.router.current.route).to.equal(':lc/route');
    });
    
    it('should enable route sections (nested routers)', function() {
        var section = this.router.section('collection');
        section.route('index', '', new TestRoute());
        section.route('list', 'list', new TestRoute());
        
        expect(section.router.getUrl('index')).to.equal('collection');
        expect(section.router.getUrl('list')).to.equal('collection/list');
        
        this.router.navigate('collection', { trigger: true });
        
        expect(section.router.current.name).to.equal('index');
        expect(section.router.current.url).to.equal('collection');
        
        expect(this.router.current.name).to.equal('collection');
        expect(this.router.current.url).to.equal('collection');
        
        this.router.navigate('collection/list', { trigger: true });
        
        expect(section.router.current.name).to.equal('list');
        expect(section.router.current.url).to.equal('collection/list');
        
        expect(this.router.current.name).to.equal('collection');
        expect(this.router.current.url).to.equal('collection/list');
    });
    
    it('should run exit method on previous route', function() {
        var exitRoute = new ExitRoute();
        this.sinon.spy(exitRoute, 'exit');
        
        this.router.route('exit', 'exit', exitRoute);
        
        this.router.navigate('exit', { trigger: true });
        
        expect(this.router.current.name).to.equal('exit');
        expect(exitRoute.exit).to.not.have.been.called;
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.name).to.equal('route');
        expect(exitRoute.exit).to.have.been.called;
        
        expect(exited).to.be.true;
    });
    
    it('should halt if prepare method returns false', function() {
        var preparedRoute = new PreparedRoute();
        
        this.router.route('halted', 'halted', preparedRoute);
        
        this.router.navigate('halted', { trigger: true });
        
        expect(this.router.current).to.be.null;
    });
    
    it('should halt if exit method returns false', function() {
        var haltedRoute = new HaltedRoute();
        
        this.router.route('halted', 'halted', haltedRoute);
        
        this.router.navigate('halted', { trigger: true });
        
        expect(this.router.current.name).to.equal('halted');
        
        this.router.navigate('route', { trigger: true });
        
        expect(this.router.current.name).to.equal('halted');
    });
    
    it('should handle promises - resolved', function(next) {
        this.router.route('promised', 'promised', new ResolvedRoute());
        
        this.router.navigate('promised', { trigger: true });
        
        this.router.on('after:execute', function(ctx) {
            expect(ctx.router.current.name).to.equal('promised');
            next();
        });
    });
    
    it('should handle promises - rejected', function(next) {
        this.router.route('promised', 'promised', new RejectedRoute());
        
        this.router.navigate('promised', { trigger: true });
        
        this.router.on('after:cancel', function(ctx) {
            expect(ctx.router.current).to.be.null;
            next();
        });
    });
    
    it('should trigger enter and exit events on the route', function() {
        var events = [];
        this.testRoute.on('enter', function(ctx) {
            events.push('enter:' + ctx.name);
        });
        this.testRoute.on('exit', function(ctx) {
            events.push('exit:' + ctx.name);
        });
        
        this.router.route('users', 'users', this.testRoute);
        
        this.router.navigate('route', { trigger: true });
        this.router.navigate('users', { trigger: true });
        
        var expected = ['enter:route', 'exit:users', 'enter:users'];
        expect(events).to.eql(expected);
    });
    
    it('should allow start/stop of route handling', function() {
        this.router.stop();
        
        Backbone.history.navigate('route', { trigger: true });
        
        expect(this.router.current).to.be.undefined;
        expect(Backbone.history.fragment).to.equal('');
        
        this.router.start();
        
        Backbone.history.navigate('route', { trigger: true });
        
        expect(this.router.current.name).to.equal('route');
        expect(Backbone.history.fragment).to.equal('route');
    });
    
});
